import vision from "@google-cloud/vision";
import Tesseract from "tesseract.js";
import { parseBuffer } from "music-metadata";
// @ts-ignore kokokor is provided as a runtime dependency for spatial OCR clustering.
import { mapObservationsToTextLines, mapTextLinesToParagraphs } from "kokokor";
import { interpretOcr, type InterpretedLine, type OcrBlock } from "./ocrInterpreter";
import {
  lookupSongByTitleAndArtist,
  NoVerifiedResultError,
  recognizeAudioWithAudd,
  type ProviderSongMetadata,
} from "./providers/audd.provider";
import { recognizeWithAcrCloud } from "./providers/acrcloud.provider";
import { recognizeWithShazam } from "./providers/shazam.provider";
import { matchBulgarianSong } from "./providers/bulgarian.provider";
import { cleanupTesseractTextWithGemma, extractMetadataWithAiOcr } from "./aiImageOcr.service";
import {
  beforeProviderCall,
  buildAttemptContext,
  classifyProviderError,
  getCachedAttemptResult,
  getProviderCachedResult,
  hashAudioBuffer,
  isProviderBlocked,
  markProviderFailure,
  setCachedAttemptResult,
  setProviderCachedResult,
  withAttemptDedupe,
  type AttemptContext,
  type ProviderName,
} from "./recognition.guard";
import { preprocessAudioForRecognition } from "./audioPreprocess";
import { normalizeVisibleText } from "../../utils/text";

export type SongMetadata = ProviderSongMetadata & {
  source: "provider" | "ocr_fallback";
  ocrEngine?: "gemini_vision" | "tesseract";
  verificationStatus: "verified" | "not_found";
  resultState?: "exact_match" | "strong_likely_match" | "possible_matches" | "need_better_sample";
  alternatives?: Array<Pick<ProviderSongMetadata, "songName" | "artist" | "confidenceScore">>;
  attemptId?: string;
  warnings?: string[];
  confidenceBreakdown?: Record<string, number>;
  debug?: Record<string, unknown>;
  providerMatches?: Array<{ provider: string; title: string; artist: string; confidence: number; artworkUrl?: string }>;
  covers?: Array<{ url: string; provider: string; confidence: number; width?: number; height?: number }>;
  sourceImages?: string[];
};

type OcrCandidateMetadata = {
  songName: string;
  artist: string;
  album: string;
  confidenceScore: number;
  source?: "ai" | "tesseract";
  ocrText?: string;
  normalizedText?: { title: string; artist: string };
  spatialScore?: number;
  confidenceBreakdown?: Record<string, number>;
  candidatePairs?: Array<{ title: string; artist: string; score: number }>;
};

type TesseractWord = {
  text?: string;
  confidence?: number;
  bbox?: { x0?: number; y0?: number; x1?: number; y1?: number };
};

const UNKNOWN_METADATA: OcrCandidateMetadata = {
  songName: "Unknown Song",
  artist: "Unknown Artist",
  album: "Unknown Album",
  confidenceScore: 0,
  source: "tesseract",
};

const OCR_CHAR_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 &-_\'\"():,./+!?[]";
const OCR_LANGUAGE_MAP: Record<string, string> = { eng: "eng", bul: "bul", "bul+eng": "bul+eng", "bg+en": "bul+eng", bg: "bul" };
const OCR_MIN_CANDIDATE_CONFIDENCE = 0.36;
const OCR_MIN_VERIFIED_CONFIDENCE = 0.54;
const OCR_MAX_SURFACED_RESULTS = 20;
const OCR_MAX_DIRECT_ATTEMPTS = 3;
const OCR_MAX_GEMMA_CLEANUP_CALLS = 3;
const OCR_MAX_YOUTUBE_CHECKS = 12;
const OCR_ATTEMPT_TTL_MS = 20_000;
const OCR_YOUTUBE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const JUNK_EXACT_TOKENS = new Set([
  "codewars", "python", "tutorial", "settings", "notifications",
  "battery", "wifi", "next", "back", "home", "share", "playlist",
  "search", "library",
  // UI labels you've seen:
  "q search", "search", "now playing", "home", "back", "add", "remove",
  "save", "cancel", "done", "edit", "play", "pause", "shuffle", "repeat",
  "volume", "mute", "next", "previous", "albums", "artists", "songs",
  "playlists", "queue", "history"
]);
const JUNK_FRAGMENT_REGEX = /(codewars|tutorial|python|install|download|subscribe|notification|learning|course|button|privacy|settings|wi-?fi|bluetooth)/i;
let aiOcrExtractor: typeof extractMetadataWithAiOcr = extractMetadataWithAiOcr;
let tesseractExtractor: typeof extractMetadataWithOcr = extractMetadataWithOcr;
let lookupSongExtractor: typeof lookupSongByTitleAndArtist = lookupSongByTitleAndArtist;
let gemmaCleanupExtractor: typeof cleanupTesseractTextWithGemma = cleanupTesseractTextWithGemma;
const imageAttemptCache = new Map<string, { expiresAt: number; value: ImageRecognitionOutput }>();
const youtubeQueryCache = new Map<string, { expiresAt: number; value: ProviderSongMetadata | null }>();
const inFlightImageAttempts = new Map<string, Promise<ImageRecognitionOutput>>();
const visionClient = new vision.ImageAnnotatorClient();


type VerificationMatch = { provider: string; title: string; artist: string; confidence: number; artworkUrl?: string; width?: number; height?: number };
type VerificationResult = { matches: VerificationMatch[]; covers: NonNullable<SongMetadata["covers"]>; confidenceDelta: number; platformLinks: ProviderSongMetadata["platformLinks"]; releaseYear: number | null; album?: string };

type SpatialLine = { text: string; confidence: number; bbox: { x: number; y: number; width: number; height: number } };

const providerLookupCache = new Map<string, { expiresAt: number; value: VerificationResult }>();
const OCR_CORRECTIONS = new Map<string, string>([
  ["sabrins carpenter", "Sabrina Carpenter"],
  ["sabrina carpender", "Sabrina Carpenter"],
  ["weeknd", "The Weeknd"],
  ["biinding lights", "Blinding Lights"],
  ["blinding iights", "Blinding Lights"],
]);

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function normalizeForKey(text: string): string { return normalizeMusicOcrText(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let last = i - 1; prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = old;
    }
  }
  return prev[b.length]!;
}
function similarity(a: string, b: string): number {
  const x = normalizeForKey(a), y = normalizeForKey(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length, 1);
}

function normalizeMusicOcrText(text: string): string {
  let value = (text ?? "").normalize("NFKC")
    .replace(/[\u200B-\u200F\uFEFF\u2060]/g, "")
    .replace(/[“”„‟]/g, '"').replace(/[‘’‚‛]/g, "'")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[•·●◉◼]/g, " ")
    .replace(/[|`~^_*<>]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-:;,.!?()[\]{}]+|[\s\-:;,.!?()[\]{}]+$/g, "")
    .trim();
  value = value.split(/\s+/).map((word) => {
    const lower = word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (OCR_CORRECTIONS.has(lower)) return OCR_CORRECTIONS.get(lower)!;
    return word.replace(/([A-Za-z])\1{2,}/g, "$1$1");
  }).join(" ");
  const phrase = value.toLowerCase();
  return OCR_CORRECTIONS.get(phrase) ?? value;
}

function computeDynamicConfidence(
  candidate: OcrCandidateMetadata,
  verification: VerificationResult | null
): { final: number; breakdown: Record<string, number> } {
  const OCR_WEIGHT_BASE = 0.35;
  const SPATIAL_WEIGHT_BASE = 0.25;
  const MAX_PROVIDER_WEIGHT = 0.40;
  const YOUTUBE_WEIGHT = 0.25;
  const ITUNES_WEIGHT = 0.15;
  const MUSICBRAINZ_WEIGHT = 0.15;
  const LASTFM_WEIGHT = 0.15;
  const AGREEMENT_BONUS_FACTOR = 0.25;
  const LOW_OCR_THRESHOLD = 0.4;
  const LOW_SPATIAL_THRESHOLD = 0.3;
  const PROVIDER_REDUCTION_OCR = 0.7;
  const PROVIDER_REDUCTION_SPATIAL = 0.8;

  const ocrWeight = clamp01(candidate.confidenceScore) * OCR_WEIGHT_BASE;
  const spatialScore = candidate.spatialScore ?? 0.5;
  const spatialWeight = clamp01(spatialScore) * SPATIAL_WEIGHT_BASE;
  let providerSum = 0;

  for (const match of verification?.matches ?? []) {
    const multiplier = match.provider === "youtube"
      ? YOUTUBE_WEIGHT
      : match.provider === "itunes"
        ? ITUNES_WEIGHT
        : match.provider === "musicbrainz"
          ? MUSICBRAINZ_WEIGHT
          : match.provider === "lastfm"
            ? LASTFM_WEIGHT
            : 0.15;
    providerSum += clamp01(match.confidence) * multiplier;
  }

  providerSum = Math.min(providerSum, MAX_PROVIDER_WEIGHT);
  if (candidate.confidenceScore < LOW_OCR_THRESHOLD) providerSum *= PROVIDER_REDUCTION_OCR;
  if (spatialScore < LOW_SPATIAL_THRESHOLD) providerSum *= PROVIDER_REDUCTION_SPATIAL;

  const total = verification?.matches.length ?? 0;
  const agreeing = verification?.matches.filter((match) => similarity(match.title, candidate.songName) > 0.85 && similarity(match.artist, candidate.artist) > 0.85).length ?? 0;
  const agreementBonus = total > 0 ? 1 + AGREEMENT_BONUS_FACTOR * (agreeing / Math.max(1, total)) : 1;
  const raw = ocrWeight + spatialWeight + providerSum;
  const final = clamp01(raw * agreementBonus);
  const breakdown = {
    ocr: Number(ocrWeight.toFixed(3)),
    spatial: Number(spatialWeight.toFixed(3)),
    providers: Number(providerSum.toFixed(3)),
    agreementBonus: Number(agreementBonus.toFixed(3)),
    final: Number(final.toFixed(3)),
  };

  return { final, breakdown };
}

function makeConfidenceBreakdown(candidate: OcrCandidateMetadata, verification: VerificationResult | null): Record<string, number> {
  return computeDynamicConfidence(candidate, verification).breakdown;
}
function sumBreakdown(b: Record<string, number>): number { return clamp01(b.final ?? Object.values(b).reduce((a, v) => a + v, 0)); }

function mergeDuplicateSongs(songs: SongMetadata[]): SongMetadata[] {
  const byKey = new Map<string, SongMetadata>();
  for (const song of songs) {
    const key = `${normalizeForKey(song.songName)}::${normalizeForKey(song.artist)}`;
    if (!key.replace(/:/g, "")) continue;
    const previous = byKey.get(key);
    if (!previous || song.confidenceScore > previous.confidenceScore) {
      byKey.set(key, { ...song, sourceImages: Array.from(new Set([...(previous?.sourceImages ?? []), ...(song.sourceImages ?? ["uploaded_image"])])) });
    } else {
      previous.sourceImages = Array.from(new Set([...(previous.sourceImages ?? ["uploaded_image"]), ...(song.sourceImages ?? ["uploaded_image"])]));
    }
  }
  return [...byKey.values()];
}

const providerStrategy = {
  primaryProvider: (process.env.RECOGNITION_PRIMARY_PROVIDER as ProviderName | undefined) ?? "audd",
  allowSecondaryFallback: process.env.RECOGNITION_ALLOW_SECONDARY_FALLBACK !== "false",
  maxProviderCallsPerAttempt: Number(process.env.RECOGNITION_MAX_PROVIDER_CALLS ?? 2),
  enableConcertMode: process.env.RECOGNITION_ENABLE_CONCERT_MODE !== "false",
  enableHummingMode: process.env.RECOGNITION_ENABLE_HUMMING_MODE !== "false",
};

function hasConfiguredAudioProvider(): boolean {
  return Boolean(process.env.AUDD_API_TOKEN || process.env.AUDD_API_KEY || process.env.ACRCLOUD_ACCESS_KEY || process.env.SHAZAM_MOCK_RESPONSE);
}

function toProviderResponse(metadata: ProviderSongMetadata): SongMetadata {
  return {
    ...metadata,
    source: "provider",
    verificationStatus: metadata.youtubeVideoId ? "verified" : "not_found",
  };
}

function toFallbackResponse(metadata: OcrCandidateMetadata): SongMetadata {
  return {
    songName: metadata.songName,
    artist: metadata.artist,
    album: metadata.album,
    genre: "Unknown Genre",
    platformLinks: {},
    youtubeVideoId: undefined,
    releaseYear: null,
    confidenceScore: metadata.confidenceScore,
    source: "ocr_fallback",
    ocrEngine: "tesseract",
    verificationStatus: "not_found",
    resultState: "need_better_sample",
    warnings: ["OCR_FALLBACK_USED"],
  };
}

function classifyResultState(confidence: number): SongMetadata["resultState"] {
  if (confidence >= 0.9) return "exact_match";
  if (confidence >= 0.72) return "strong_likely_match";
  if (confidence >= 0.5) return "possible_matches";
  return "need_better_sample";
}

async function extractMetadataFromLocalTags(buffer: Buffer): Promise<ProviderSongMetadata | null> {
  try {
    const parsed = await parseBuffer(buffer, { mimeType: "audio/webm" }, { duration: false });
    const title = parsed.common.title?.trim();
    const artist = parsed.common.artist?.trim();
    if (!title || !artist) return null;
    return {
      songName: title,
      artist,
      album: parsed.common.album?.trim() || "Unknown Album",
      genre: parsed.common.genre?.[0] || "Unknown Genre",
      releaseYear: typeof parsed.common.year === "number" ? parsed.common.year : null,
      confidenceScore: 0.55,
      youtubeVideoId: undefined,
      platformLinks: {},
    };
  } catch {
    return null;
  }
}

async function guardedProviderCall(
  ctx: AttemptContext,
  provider: ProviderName,
  run: () => Promise<ProviderSongMetadata | null>,
  usage: { providerCalls: number; metadataCalls: number },
): Promise<ProviderSongMetadata | null> {
  if (usage.providerCalls >= Math.min(ctx.budget.maxProviderCalls, providerStrategy.maxProviderCallsPerAttempt)) {
    return null;
  }
  if (isProviderBlocked(provider)) return null;

  const cached = getProviderCachedResult<ProviderSongMetadata | null>(provider, ctx.audioHash);
  if (cached) return cached;

  try {
    usage.providerCalls += 1;
    await beforeProviderCall(provider);
    const value = await run();
    if (value) setProviderCachedResult(provider, ctx.audioHash, value);
    return value;
  } catch (error) {
    markProviderFailure(provider, classifyProviderError(error));
    return null;
  }
}

async function maybeEnrichWithYoutube(
  metadata: ProviderSongMetadata,
  usage: { providerCalls: number; metadataCalls: number },
  metadataCap: number,
): Promise<ProviderSongMetadata> {
  if (metadata.youtubeVideoId || usage.metadataCalls >= metadataCap) {
    return metadata;
  }
  usage.metadataCalls += 1;
  try {
    const lookedUp = await lookupSongByTitleAndArtist(metadata.songName, metadata.artist);
    if (!lookedUp?.youtubeVideoId) return metadata;
    return {
      ...metadata,
      youtubeVideoId: lookedUp.youtubeVideoId,
      platformLinks: { ...metadata.platformLinks, youtube: lookedUp.platformLinks.youtube },
    };
  } catch {
    return metadata;
  }
}

function getProviderOrder(mode: RecognitionMode): ProviderName[] {
  const primary = providerStrategy.primaryProvider;
  if (mode === "humming") return ["acrcloud", "audd"];
  const ordered: ProviderName[] = [primary, "acrcloud", "audd", "shazam"].filter((v, i, arr) => arr.indexOf(v as ProviderName) === i) as ProviderName[];
  return ordered;
}

async function runAudioPipeline(buffer: Buffer, originalName: string, mode: RecognitionMode, userId?: string, requestedAttemptId?: string): Promise<SongMetadata> {
  if (!hasConfiguredAudioProvider()) {
    return {
      songName: "Demo Recognition",
      artist: "PonotAI Sample",
      album: "Competition Demo",
      genre: "Unknown Genre",
      releaseYear: null,
      confidenceScore: 0.51,
      youtubeVideoId: undefined,
      platformLinks: {},
      source: "ocr_fallback",
      verificationStatus: "not_found",
      resultState: "need_better_sample",
    };
  }

  const preprocessed = preprocessAudioForRecognition(buffer, mode);
  const audioHash = hashAudioBuffer(preprocessed.processedBuffer);
  const ctx = buildAttemptContext({ mode, userId, audioHash, requestedAttemptId });
  const cached = getCachedAttemptResult(ctx);
  if (cached) return { ...cached, attemptId: ctx.attemptId };

  return withAttemptDedupe(ctx, async () => {
    const usage = { providerCalls: 0, metadataCalls: 0 };
    const providers = getProviderOrder(mode);
    const alternatives: Array<Pick<ProviderSongMetadata, "songName" | "artist" | "confidenceScore">> = [];

    const runForProvider = async (provider: ProviderName, clip: Buffer): Promise<ProviderSongMetadata | null> => {
      if (provider === "audd") return guardedProviderCall(ctx, provider, () => recognizeAudioWithAudd(clip, originalName, { enableYoutubeLookup: false }), usage);
      if (provider === "acrcloud") return guardedProviderCall(ctx, provider, () => recognizeWithAcrCloud(clip, originalName), usage);
      return guardedProviderCall(ctx, provider, () => recognizeWithShazam(clip, originalName), usage);
    };

    for (const clip of preprocessed.clipVariants) {
      for (const provider of providers) {
        if (!providerStrategy.allowSecondaryFallback && provider !== providers[0]) continue;

        const candidate = await runForProvider(provider, clip);
        if (!candidate) continue;

        alternatives.push({ songName: candidate.songName, artist: candidate.artist, confidenceScore: candidate.confidenceScore });
        const enriched = await maybeEnrichWithYoutube(candidate, usage, ctx.budget.maxMetadataCalls);
        const state = classifyResultState(enriched.confidenceScore);
        if (state === "exact_match" || state === "strong_likely_match") {
          const done = { ...toProviderResponse(enriched), resultState: state, alternatives: alternatives.slice(1, 4), attemptId: ctx.attemptId };
          setCachedAttemptResult(ctx, done);
          return done;
        }
      }
    }

    const bestAlt = alternatives.sort((a, b) => b.confidenceScore - a.confidenceScore)[0];
    if (bestAlt && bestAlt.confidenceScore >= 0.52) {
      const response: SongMetadata = {
        songName: bestAlt.songName,
        artist: bestAlt.artist,
        album: "Unknown Album",
        genre: "Unknown Genre",
        releaseYear: null,
        confidenceScore: bestAlt.confidenceScore,
        youtubeVideoId: undefined,
        platformLinks: {},
        source: "provider",
        verificationStatus: "not_found",
        resultState: "possible_matches",
        alternatives: alternatives.slice(0, 4),
        attemptId: ctx.attemptId,
      };
      setCachedAttemptResult(ctx, response);
      return response;
    }

    const localTagResult = await extractMetadataFromLocalTags(preprocessed.processedBuffer);
    if (localTagResult) {
      const enriched = await maybeEnrichWithYoutube(localTagResult, usage, ctx.budget.maxMetadataCalls);
      const response = { ...toProviderResponse(enriched), resultState: classifyResultState(enriched.confidenceScore), attemptId: ctx.attemptId };
      setCachedAttemptResult(ctx, response);
      return response;
    }

    throw new NoVerifiedResultError("Low confidence. Please try concert mode or a clearer 6-10 second sample.");
  });
}

export type RecognitionMode = "standard" | "live" | "humming" | "video";

export async function recognizeSongFromAudioByMode(buffer: Buffer, originalName: string, mode: RecognitionMode = "standard", userId?: string, attemptId?: string): Promise<SongMetadata> {
  const normalizedMode = mode || "standard";
  if (normalizedMode === "humming" && !providerStrategy.enableHummingMode) {
    throw new NoVerifiedResultError("Humming mode is currently disabled.");
  }
  if (normalizedMode === "live" && !providerStrategy.enableConcertMode) {
    return runAudioPipeline(buffer, originalName, "standard", userId, attemptId);
  }
  return runAudioPipeline(buffer, originalName, normalizedMode, userId, attemptId);
}

function scoreLineForTitle(line: InterpretedLine): number {
  return line.features.heightPercentile * 0.45 + line.features.widthPercentile * 0.2 + line.features.letterRatio * 0.2 + (line.avgConfidence / 100) * 0.15;
}

export function deriveBestEffortMetadata(lines: InterpretedLine[]): OcrCandidateMetadata | null {
  if (lines.length === 0) return null;
  const eligible = lines.filter((line) => line.features.letterRatio >= 0.45 && line.features.length >= 2 && line.features.length <= 80);
  if (eligible.length === 0) return null;
  const titleLine = [...eligible].sort((a, b) => scoreLineForTitle(b) - scoreLineForTitle(a))[0];
  const artistLine = [...eligible]
    .filter((line) => line !== titleLine && line.bbox.y >= titleLine.bbox.y)
    .sort((a, b) => Math.abs(a.bbox.y - (titleLine.bbox.y + titleLine.bbox.height)) - Math.abs(b.bbox.y - (titleLine.bbox.y + titleLine.bbox.height)))[0];

  return {
    songName: titleLine.text,
    artist: artistLine?.text ?? UNKNOWN_METADATA.artist,
    album: UNKNOWN_METADATA.album,
    confidenceScore: Math.max(0.25, Math.min(0.59, titleLine.avgConfidence / 100)),
    source: "tesseract",
  };
}

function toOcrBlocks(words: TesseractWord[]): OcrBlock[] {
  const blocks: OcrBlock[] = [];
  for (const word of words) {
    const text = typeof word.text === "string" ? word.text : "";
    const bbox = word.bbox;
    if (!bbox) continue;
    const x0 = bbox.x0 ?? 0;
    const y0 = bbox.y0 ?? 0;
    const x1 = bbox.x1 ?? x0;
    const y1 = bbox.y1 ?? y0;
    blocks.push({ text, confidence: typeof word.confidence === "number" ? word.confidence : 0, bbox: { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) } });
  }
  return blocks;
}

function dedupeOcrCandidates(candidates: OcrCandidateMetadata[]): OcrCandidateMetadata[] {
  const seen = new Set<string>();
  const deduped: OcrCandidateMetadata[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.songName}::${candidate.artist}`.trim().toLowerCase();
    if (!candidate.songName.trim() || seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function buildRowAwareCandidates(lines: InterpretedLine[]): OcrCandidateMetadata[] {
  const eligible = lines.filter((line) => line.features.letterRatio >= 0.45 && line.features.length >= 2 && line.features.length <= 80);
  if (eligible.length < 2) return [];
  const sorted = [...eligible].sort((a, b) => a.bbox.y - b.bbox.y);
  const rows: OcrCandidateMetadata[] = [];

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const titleLine = sorted[i]!;
    const artistLine = sorted[i + 1]!;
    const deltaY = artistLine.bbox.y - (titleLine.bbox.y + titleLine.bbox.height);
    const alignedX = Math.abs(titleLine.bbox.x - artistLine.bbox.x) <= Math.max(24, titleLine.bbox.width * 0.3);
    const plausibleGap = deltaY >= -4 && deltaY <= Math.max(24, titleLine.bbox.height * 1.4);
    const artistLooksValid = artistLine.features.letterRatio >= 0.45 && artistLine.features.digitRatio <= 0.5;
    if (!alignedX || !plausibleGap || !artistLooksValid) continue;

    const titleConfidence = Math.max(0.3, Math.min(0.68, titleLine.avgConfidence / 100));
    const artistBonus = artistLine.avgConfidence >= 45 ? 0.05 : 0;
    rows.push({
      songName: titleLine.text,
      artist: artistLine.text,
      album: UNKNOWN_METADATA.album,
      confidenceScore: Math.max(0.25, Math.min(0.72, titleConfidence + artistBonus)),
      source: "tesseract",
    });
  }

  return rows;
}

function pruneImageCaches(): void {
  const now = Date.now();
  for (const [key, value] of imageAttemptCache.entries()) {
    if (value.expiresAt <= now) imageAttemptCache.delete(key);
  }
  for (const [key, value] of youtubeQueryCache.entries()) {
    if (value.expiresAt <= now) youtubeQueryCache.delete(key);
  }
  for (const [key, value] of providerLookupCache.entries()) {
    if (value.expiresAt <= now) providerLookupCache.delete(key);
  }
}

function normalizeOcrText(text: string): string {
  return normalizeMusicOcrText(text);
}


function looksLikeGarbageMusicText(text: string): boolean {
  const normalized = normalizeOcrText(text).toLowerCase();
  if (!normalized) return true;
  if (JUNK_FRAGMENT_REGEX.test(normalized) || JUNK_EXACT_TOKENS.has(normalized)) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 1 && words[0]!.length <= 3) return true;
  const letters = normalized.match(/\p{L}/gu)?.length ?? 0;
  return letters < 2;
}

function sanitizeCandidate(candidate: OcrCandidateMetadata): OcrCandidateMetadata | null {
  const songName = normalizeOcrText(candidate.songName);
  const artist = normalizeOcrText(candidate.artist);
  if (!songName || songName.length < 2 || songName.length > 80) return null;
  if (looksLikeGarbageMusicText(songName)) return null;
  if (artist && artist !== UNKNOWN_METADATA.artist && looksLikeGarbageMusicText(artist)) return null;
  if (candidate.confidenceScore < OCR_MIN_CANDIDATE_CONFIDENCE) return null;
  return { ...candidate, songName, artist: artist || UNKNOWN_METADATA.artist, source: candidate.source ?? "tesseract" };
}

function scoreOcrCandidate(candidate: OcrCandidateMetadata): number {
  const songWords = candidate.songName.split(/\s+/).filter(Boolean).length;
  const artistWords = candidate.artist.split(/\s+/).filter(Boolean).length;
  const pairBonus = candidate.artist !== UNKNOWN_METADATA.artist && artistWords >= 1 ? 0.15 : -0.05;
  const shapeBonus = songWords >= 2 ? 0.08 : 0;
  return Math.max(0, Math.min(1, candidate.confidenceScore + pairBonus + shapeBonus));
}

function deriveCandidateMetadata(lines: InterpretedLine[]): OcrCandidateMetadata[] {
  const eligible = lines.filter((line) => line.features.letterRatio >= 0.45 && line.features.length >= 2 && line.features.length <= 80);
  if (eligible.length === 0) return [];

  const rankedTitles = [...eligible]
    .sort((a, b) => scoreLineForTitle(b) - scoreLineForTitle(a))
    .slice(0, 25);

  const candidates: OcrCandidateMetadata[] = rankedTitles.map((titleLine) => {
    const artistLine = eligible
      .filter((line) => line !== titleLine && line.bbox.y >= titleLine.bbox.y - 4)
      .sort((a, b) => Math.abs(a.bbox.y - (titleLine.bbox.y + titleLine.bbox.height)) - Math.abs(b.bbox.y - (titleLine.bbox.y + titleLine.bbox.height)))[0];

    return {
      songName: titleLine.text,
      artist: artistLine?.text ?? UNKNOWN_METADATA.artist,
      album: UNKNOWN_METADATA.album,
      confidenceScore: Math.max(0.2, Math.min(0.65, titleLine.avgConfidence / 100)),
      source: "tesseract",
    };
  });

  return dedupeOcrCandidates([...buildRowAwareCandidates(lines), ...candidates]);
}

async function extractMetadataWithOcr(buffer: Buffer, language = "eng"): Promise<OcrCandidateMetadata[]> {
  const normalizedLanguage = OCR_LANGUAGE_MAP[language] ?? "eng";
  const worker = await Tesseract.createWorker(normalizedLanguage);
  await worker.setParameters({ tessedit_char_whitelist: OCR_CHAR_WHITELIST, preserve_interword_spaces: "1" });
  try {
    const ocrResult = await worker.recognize(buffer);
    const words = ((ocrResult.data as { words?: TesseractWord[] }).words ?? []) as TesseractWord[];
    const interpreted = interpretOcr(toOcrBlocks(words));
    const candidates: OcrCandidateMetadata[] = [];
    if (interpreted.music?.title && interpreted.music.confidenceScore >= 0.42) {
      candidates.push({
        songName: interpreted.music.title,
        artist: interpreted.music.artist ?? UNKNOWN_METADATA.artist,
        album: UNKNOWN_METADATA.album,
        confidenceScore: interpreted.music.confidenceScore,
        source: "tesseract",
      });
    }

    candidates.push(...deriveCandidateMetadata(interpreted.lines));
    if (candidates.length === 0) {
      const fallback = deriveBestEffortMetadata(interpreted.lines);
      if (fallback) candidates.push(fallback);
    }
    if (candidates.length === 0) throw new NoVerifiedResultError("Could not extract readable song text from the uploaded image.");
    return dedupeOcrCandidates(candidates).sort((a, b) => b.confidenceScore - a.confidenceScore);
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

export function __setImageOcrExtractorsForTests(overrides: {
  aiExtractor?: typeof extractMetadataWithAiOcr;
  tesseractExtractor?: typeof extractMetadataWithOcr;
  lookupExtractor?: typeof lookupSongByTitleAndArtist;
  gemmaCleanupExtractor?: typeof cleanupTesseractTextWithGemma;
} | null): void {
  aiOcrExtractor = overrides?.aiExtractor ?? extractMetadataWithAiOcr;
  tesseractExtractor = overrides?.tesseractExtractor ?? extractMetadataWithOcr;
  lookupSongExtractor = overrides?.lookupExtractor ?? lookupSongByTitleAndArtist;
  gemmaCleanupExtractor = overrides?.gemmaCleanupExtractor ?? cleanupTesseractTextWithGemma;
}

// --- Google Vision OCR (DOCUMENT_TEXT_DETECTION) ---

interface VisionWord {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}

/**
 * Call Google Vision and return all words with bounding boxes.
 */
async function performVisionOcr(buffer: Buffer): Promise<VisionWord[]> {
  const [result] = await visionClient.documentTextDetection({
    image: { content: buffer.toString("base64") },
    imageContext: { languageHints: ["bg", "en", "ru"] },
  });

  const words: VisionWord[] = [];
  const fullTextAnnotation = result.fullTextAnnotation;
  if (!fullTextAnnotation?.pages) return words;

  for (const page of fullTextAnnotation.pages) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = word.symbols?.map((s: { text?: string | null }) => s.text).join("") ?? "";
          if (!text) continue;
          const bbox = word.boundingBox;
          if (!bbox?.vertices?.length) continue;
          const vertices = bbox.vertices;
          const xs = vertices.map((v: { x?: number | null }) => v.x ?? 0);
          const ys = vertices.map((v: { y?: number | null }) => v.y ?? 0);
          words.push({
            text,
            confidence: word.confidence ?? 0,
            bbox: {
              x: Math.min(...xs),
              y: Math.min(...ys),
              width: Math.max(...xs) - Math.min(...xs),
              height: Math.max(...ys) - Math.min(...ys),
            },
          });
        }
      }
    }
  }

  return words;
}

/**
 * Group words into lines based on vertical proximity (12px tolerance).
 */
function clusterWordsIntoLines(words: VisionWord[]): string[] {
  if (words.length === 0) return [];

  // Sort by y, then x
  const sorted = [...words].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);

  const lines: { text: string; y: number }[] = [];
  let currentLineWords: string[] = [];
  let currentY = sorted[0]!.bbox.y;

  for (const word of sorted) {
    if (Math.abs(word.bbox.y - currentY) < 12) {
      currentLineWords.push(word.text);
    } else {
      if (currentLineWords.length) {
        lines.push({ text: currentLineWords.join(" "), y: currentY });
      }
      currentLineWords = [word.text];
      currentY = word.bbox.y;
    }
  }
  if (currentLineWords.length) {
    lines.push({ text: currentLineWords.join(" "), y: currentY });
  }

  return lines.map((l) => l.text);
}

/**
 * Group lines into clusters of 2 (song entry) and produce both (title, artist) and (artist, title) candidates.
 */
function candidatesFromLineClusters(lines: string[]): OcrCandidateMetadata[] {
  const candidates: OcrCandidateMetadata[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const first = lines[i]?.trim();
    const second = lines[i + 1]?.trim();
    if (!first && !second) continue;

    // Single line - treat as title
    if (!second) {
      candidates.push({
        songName: first!,
        artist: UNKNOWN_METADATA.artist,
        album: UNKNOWN_METADATA.album,
        confidenceScore: 0.8,
        source: "ai",
      });
      continue;
    }

    // Hypothesis 1: first = title, second = artist
    candidates.push({
      songName: first,
      artist: second,
      album: UNKNOWN_METADATA.album,
      confidenceScore: 0.8,
      source: "ai",
    });
    // Hypothesis 2: first = artist, second = title
    candidates.push({
      songName: second,
      artist: first,
      album: UNKNOWN_METADATA.album,
      confidenceScore: 0.8,
      source: "ai",
    });
  }

  return candidates;
}


function cleanParagraphText(text: string): string {
  return text
    .replace(/\b\d{1,2}:\d{2}\b/g, "")   // remove timestamps like "3:11"
    .replace(/[•⚫●◉◼]/g, "")            // remove dot symbols
    .replace(/\s+/g, " ")
    .trim();
}

// ---- NEW FUNCTION: parseParagraphsWithGemini ----
async function parseParagraphsWithGemini(paragraphs: string[]): Promise<{ artist: string; title: string }[]> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const prompt = `You are a music OCR parser. Below are text lines extracted from a playlist screenshot. Some consecutive lines form artist-title pairs (artist on one line, title on the next). Some lines already contain both separated by a bullet (•), dash (-), or similar. Return ONLY a valid JSON array of objects: [{ "artist": "...", "title": "..." }, ...]. Do not include explanations.

Lines:
${paragraphs.join("\n")}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 2048 } }),
    });

    if (!response.ok) throw new Error(`Gemini API returned ${response.status}`);

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return [];

    const jsonBlock = text.match(/\[[\s\S]*\]/)?.[0];
    if (!jsonBlock) return [];

    const parsed = JSON.parse(jsonBlock) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is { artist: string; title: string } => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as { artist?: unknown; title?: unknown };
        return typeof candidate.artist === "string" && typeof candidate.title === "string";
      });
  } catch (error) {
    console.warn("[Vision OCR] Gemini parsing failed:", error);
    return [];
  }
}


type KokokorVertex = { x: number; y: number };
type KokokorObservation = { text: string; confidence: number; boundingPoly: { vertices: KokokorVertex[] } };

type KokokorTextNode = Partial<KokokorObservation> & {
  words?: KokokorTextNode[];
  observations?: KokokorTextNode[];
  children?: KokokorTextNode[];
  items?: KokokorTextNode[];
};

function toKokokorObservation(w: VisionWord): KokokorObservation {
  const x = w.bbox.x;
  const y = w.bbox.y;
  const ww = w.bbox.width;
  const h = w.bbox.height;
  return {
    text: w.text,
    confidence: w.confidence,
    boundingPoly: { vertices: [{ x, y }, { x: x + ww, y }, { x: x + ww, y: y + h }, { x, y: y + h }] },
  };
}

function collectKokokorWords(node: unknown, out: KokokorObservation[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectKokokorWords(item, out);
    return;
  }
  if (typeof node !== "object") return;
  const candidate = node as KokokorTextNode;
  if (typeof candidate.text === "string" && typeof candidate.confidence === "number" && Array.isArray(candidate.boundingPoly?.vertices)) {
    out.push(candidate as KokokorObservation);
    return;
  }
  collectKokokorWords(candidate.words, out);
  collectKokokorWords(candidate.observations, out);
  collectKokokorWords(candidate.children, out);
  collectKokokorWords(candidate.items, out);
}

function paragraphToSpatialLine(paragraphWords: KokokorObservation[]): SpatialLine | null {
  if (paragraphWords.length === 0) return null;
  const text = cleanParagraphText(paragraphWords.map((w) => w.text).join(" "));
  const confidence = paragraphWords.reduce((sum, w) => sum + w.confidence, 0) / paragraphWords.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const word of paragraphWords) {
    for (const vertex of word.boundingPoly.vertices) {
      minX = Math.min(minX, vertex.x);
      minY = Math.min(minY, vertex.y);
      maxX = Math.max(maxX, vertex.x);
      maxY = Math.max(maxY, vertex.y);
    }
  }
  return text.length >= 2 ? { text, confidence, bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } } : null;
}

function clusterWordsIntoSpatialLines(words: VisionWord[]): SpatialLine[] {
  const observations = words.map(toKokokorObservation);
  const textLines = mapObservationsToTextLines(observations, 300, { pixelTolerance: 5, lineHeightFactor: 0.3 });
  const paragraphs = mapTextLinesToParagraphs(textLines, { verticalJumpFactor: 2, widthTolerance: 0.85 });
  const spatialLines: SpatialLine[] = [];

  for (const paragraph of paragraphs as unknown[]) {
    const paragraphWords: KokokorObservation[] = [];
    collectKokokorWords(paragraph, paragraphWords);
    const spatialLine = paragraphToSpatialLine(paragraphWords);
    if (spatialLine) spatialLines.push(spatialLine);
  }

  return spatialLines.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
}

function candidatesFromSpatialLines(lines: SpatialLine[]): OcrCandidateMetadata[] {
  const candidates: OcrCandidateMetadata[] = [];
  const avgHeight = lines.reduce((sum, line) => sum + line.bbox.height, 0) / Math.max(lines.length, 1);
  const columnAnchors: number[] = [];
  for (const line of lines) {
    const anchor = columnAnchors.find((x) => Math.abs(x - line.bbox.x) <= Math.max(32, line.bbox.width * 0.2));
    if (anchor === undefined) columnAnchors.push(line.bbox.x);
  }
  for (const title of lines) {
    const neighbors = lines.filter((line) => line !== title && Math.abs(line.bbox.x - title.bbox.x) <= Math.max(36, title.bbox.width * 0.35));
    for (const artist of neighbors) {
      const verticalGap = artist.bbox.y - (title.bbox.y + title.bbox.height);
      if (verticalGap < -4 || verticalGap > Math.max(34, avgHeight * 1.8)) continue;
      const spatialScore = clamp01(1 - Math.abs(title.bbox.x - artist.bbox.x) / Math.max(title.bbox.width, 1) - Math.max(0, verticalGap) / Math.max(avgHeight * 4, 1));
      const base = ((title.confidence + artist.confidence) / 2) || 0.7;
      candidates.push({ songName: title.text, artist: artist.text, album: UNKNOWN_METADATA.album, confidenceScore: clamp01(base * 0.75 + spatialScore * 0.2), source: "ai", ocrText: `${title.text}\n${artist.text}`, normalizedText: { title: normalizeMusicOcrText(title.text), artist: normalizeMusicOcrText(artist.text) }, spatialScore, candidatePairs: [{ title: title.text, artist: artist.text, score: spatialScore }] });
    }
    if (/[•\-–—]/.test(title.text)) {
      const parts = title.text.split(/\s*[•\-–—]\s*/).filter(Boolean);
      if (parts.length >= 2) candidates.push({ songName: parts[0]!, artist: parts.slice(1).join(" "), album: UNKNOWN_METADATA.album, confidenceScore: 0.78, source: "ai", spatialScore: 0.7 });
    }
  }
  return dedupeOcrCandidates(candidates);
}

async function verifyWithMusicBrainz(artist: string, title: string): Promise<VerificationMatch[]> {
  if (process.env.MUSICBRAINZ_ENABLED !== "true") return [];
  try {
    const query = `artist:"${artist}" AND recording:"${title}"`;
    const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
    const response = await fetch(url, { headers: { "User-Agent": "TracklyMusicRecognition/1.0 (support@trackly.local)" }, signal: AbortSignal.timeout(3500) });
    if (!response.ok) return [];
    const data = await response.json() as { recordings?: Array<{ title?: string; "artist-credit"?: Array<{ name?: string }>; score?: number }> };
    return (data.recordings ?? [])
      .filter((recording) => recording.title)
      .map((recording) => ({
        provider: "musicbrainz",
        title: recording.title ?? title,
        artist: recording["artist-credit"]?.[0]?.name ?? artist,
        confidence: clamp01((recording.score ?? 50) / 100),
      }));
  } catch {
    return [];
  }
}

async function verifyWithLastFM(artist: string, title: string): Promise<VerificationMatch[]> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&api_key=${encodeURIComponent(apiKey)}&format=json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) return [];
    const data = await response.json() as { results?: { trackmatches?: { track?: Array<{ name?: string; artist?: string; match?: string }> } } };
    return (data.results?.trackmatches?.track ?? [])
      .filter((track) => track.name && track.artist)
      .map((track) => ({
        provider: "lastfm",
        title: track.name ?? title,
        artist: track.artist ?? artist,
        confidence: clamp01(Number.parseFloat(track.match ?? "0.5") || 0.5),
      }));
  } catch {
    return [];
  }
}

async function verifyCandidateAcrossProviders(candidate: OcrCandidateMetadata): Promise<VerificationResult> {
  const key = `${normalizeForKey(candidate.artist)}::${normalizeForKey(candidate.songName)}`;
  const cached = providerLookupCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const matches: VerificationMatch[] = [];
  const covers: NonNullable<SongMetadata["covers"]> = [];
  let platformLinks: ProviderSongMetadata["platformLinks"] = {};
  let releaseYear: number | null = null;
  let album: string | undefined;
  const yt = await lookupSongExtractor(candidate.songName, candidate.artist).catch(() => null);
  if (yt) { matches.push({ provider: "youtube", title: yt.songName, artist: yt.artist, confidence: yt.confidenceScore }); platformLinks = { ...platformLinks, ...yt.platformLinks }; }
  const term = encodeURIComponent(`${candidate.songName} ${candidate.artist}`);
  const itunes = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=3&term=${term}`, { signal: AbortSignal.timeout(3500) }).then(r => r.ok ? r.json() : null).catch(() => null) as { results?: Array<{ trackName?: string; artistName?: string; collectionName?: string; artworkUrl100?: string; trackViewUrl?: string; releaseDate?: string }> } | null;
  for (const item of itunes?.results ?? []) {
    const conf = (similarity(candidate.songName, item.trackName ?? "") + similarity(candidate.artist, item.artistName ?? "")) / 2;
    if (conf >= 0.62) {
      matches.push({ provider: "itunes", title: item.trackName ?? candidate.songName, artist: item.artistName ?? candidate.artist, confidence: conf, artworkUrl: item.artworkUrl100?.replace("100x100bb", "600x600bb"), width: 600, height: 600 });
      if (item.artworkUrl100) covers.push({ url: item.artworkUrl100.replace("100x100bb", "600x600bb"), provider: "itunes", confidence: conf, width: 600, height: 600 });
      if (item.trackViewUrl) platformLinks.appleMusic = item.trackViewUrl;
      album = album ?? item.collectionName;
      releaseYear = releaseYear ?? (item.releaseDate ? new Date(item.releaseDate).getUTCFullYear() : null);
    }
  }
  const [mbMatches, lfmMatches] = await Promise.allSettled([
    verifyWithMusicBrainz(candidate.artist, candidate.songName),
    verifyWithLastFM(candidate.artist, candidate.songName),
  ]);
  if (mbMatches.status === "fulfilled") matches.push(...mbMatches.value);
  if (lfmMatches.status === "fulfilled") matches.push(...lfmMatches.value);
  const confidenceDelta = Math.min(0.32, matches.reduce((sum, match) => sum + (match.provider === "youtube" ? 0.16 : 0.1) * match.confidence, 0));
  const value = { matches, covers: covers.filter((c, i, arr) => arr.findIndex((x) => x.url === c.url) === i).sort((a, b) => b.confidence - a.confidence), confidenceDelta, platformLinks, releaseYear, album };
  providerLookupCache.set(key, { value, expiresAt: Date.now() + OCR_YOUTUBE_CACHE_TTL_MS });
  return value;
}

/**
 * Main entry point for Google Vision extraction.
 * Returns OcrCandidateMetadata[] that plug directly into the existing pipeline.
 */
export async function extractMetadataWithGoogleVision(buffer: Buffer): Promise<OcrCandidateMetadata[]> {
  try {
    const [result] = await visionClient.documentTextDetection({
      image: { content: buffer.toString("base64") },
      imageContext: { languageHints: ["bg", "en", "ru"] },
    });

    const candidates: OcrCandidateMetadata[] = [];
    const spatialWords = await performVisionOcr(buffer).catch(() => []);
    candidates.push(...candidatesFromSpatialLines(clusterWordsIntoSpatialLines(spatialWords)));
    const pages = result.fullTextAnnotation?.pages ?? [];
    const paragraphs: string[] = [];

    for (const page of pages) {
      for (const block of page.blocks ?? []) {
        for (const paragraph of block.paragraphs ?? []) {
          // Each paragraph = one visual block of text (likely one song entry)
          const words: string[] = [];
          for (const word of paragraph.words ?? []) {
            const text = word.symbols?.map((s: { text?: string | null }) => s.text).join("") ?? "";
            if (text) words.push(text);
          }

          let fullText = words.join(" ").trim();
          fullText = cleanParagraphText(fullText);   // ← add this line

          if (!fullText || fullText.length < 2) continue;

          // Filter out obvious timestamps / durations (like "3:00", "2:46")
          if (/^\d{1,2}:\d{2}$/.test(fullText)) continue;
          if (/^\d+$/.test(fullText)) continue;

          paragraphs.push(fullText);
        }
      }
    }

    if (paragraphs.length === 0 && candidates.length === 0) throw new Error("No text detected");

    const llmResults = await parseParagraphsWithGemini(paragraphs).catch(() => []);
    if (llmResults.length > 0) {
      for (const item of llmResults) {
        candidates.push({
          songName: item.title.trim(),
          artist: item.artist?.trim() || UNKNOWN_METADATA.artist,
          album: UNKNOWN_METADATA.album,
          confidenceScore: 0.9,
          source: "ai",
        });
      }
    } else {
      let i = 0;
      while (i < paragraphs.length) {
        const first = paragraphs[i]!;
        const second = i + 1 < paragraphs.length ? paragraphs[i + 1] : null;

        // If the first paragraph contains a bullet/dash, treat it as a self-contained entry
        if (/[•⚫●\-–—]/.test(first)) {
          const parts = first.split(/\s*[•⚫●\-–—]\s*/);
          if (parts.length >= 2) {
            const a = parts[0]!.trim();
            const b = parts.slice(1).join(" ").trim();
            candidates.push({ songName: a, artist: b, album: UNKNOWN_METADATA.album, confidenceScore: 0.85, source: "ai" });
            candidates.push({ songName: b, artist: a, album: UNKNOWN_METADATA.album, confidenceScore: 0.85, source: "ai" });
          }
          i++;
          continue;
        }

        // If we have a second paragraph and it does NOT contain a bullet (likely a separate artist/title line)
        if (second && !/[•⚫●\-–—]/.test(second)) {
          // Pair them, produce both orderings
          candidates.push({ songName: first, artist: second, album: UNKNOWN_METADATA.album, confidenceScore: 0.85, source: "ai" });
          candidates.push({ songName: second, artist: first, album: UNKNOWN_METADATA.album, confidenceScore: 0.85, source: "ai" });
          i += 2;
        } else {
          // Single line – title only
          candidates.push({ songName: first, artist: UNKNOWN_METADATA.artist, album: UNKNOWN_METADATA.album, confidenceScore: 0.8, source: "ai" });
          i++;
        }
      }
    }

    if (candidates.length === 0) throw new Error("No text detected");

    return dedupeOcrCandidates(candidates).filter(c => c.songName.length >= 2 && !looksLikeGarbageMusicText(c.songName));
  } catch (error) {
    console.error("[Vision OCR] failed", error);
    throw error;
  }
}

export type ImageRecognitionOutput = {
  songs: SongMetadata[];
  warnings: string[];
  ocrPath: "ai_primary" | "tesseract_plus_gemma";
};

export async function recognizeSongFromImage(buffer: Buffer, language = "eng", mimeType = "image/jpeg", maxSongs = 5): Promise<ImageRecognitionOutput> {
  pruneImageCaches();
  const imageHash = hashAudioBuffer(buffer);
  const attemptKey = `${language}:${mimeType}:${imageHash}:${maxSongs}`;
  const cachedAttempt = imageAttemptCache.get(attemptKey);
  if (cachedAttempt) return cachedAttempt.value;
  const inFlight = inFlightImageAttempts.get(attemptKey);
  if (inFlight) return inFlight;

  const runPipeline = async (): Promise<ImageRecognitionOutput> => {
  const warnings: string[] = [];
  const candidates: OcrCandidateMetadata[] = [];
  const checkedQueries = new Set<string>();
  const resolvedMaxSongs = Math.max(1, Math.min(20, Number.isFinite(maxSongs) ? Math.trunc(maxSongs) : 5));
  const usage = { directAttempts: 0, gemmaCalls: 0, youtubeChecks: 0, strongMatches: 0 };
  const aiStart = Date.now();
  console.info("[recognition:image] primary_ocr_attempt", { provider: "gemini_vision_chain", language });
  if (usage.directAttempts >= OCR_MAX_DIRECT_ATTEMPTS) throw new NoVerifiedResultError("OCR direct model budget exhausted for this image.");
  usage.directAttempts += 1;
  // --- Google Vision primary OCR ---
  let googleCandidates: OcrCandidateMetadata[] = [];
  let googleVisionFailed = false;
  try {
    console.log("[Vision OCR] attempting Google Vision call...");
    googleCandidates = await extractMetadataWithGoogleVision(buffer);
  } catch (error) {
    googleVisionFailed = true;
    warnings.push(`GOOGLE_VISION_FAILED:${(error as Error).message}`);
  }

  if (googleCandidates.length > 0) {
    candidates.push(...googleCandidates);
  } else {
    if (!googleVisionFailed) {
      warnings.push("GOOGLE_VISION_FAILED:NO_TEXT_DETECTED");
    }
    const aiResult = await aiOcrExtractor(buffer, mimeType);

    if (aiResult.status === "success" && aiResult.songs.length > 0) {
      console.info("[recognition:image] primary_ocr_success", {
        provider: aiResult.model,
        candidates: aiResult.songs.length,
        confidence: aiResult.songs[0]?.confidenceScore ?? null,
        latencyMs: Date.now() - aiStart,
      });
      candidates.push(
        ...aiResult.songs.map((song) => ({
          songName: song.title,
          artist: song.artist,
          album: UNKNOWN_METADATA.album,
          confidenceScore: Math.max(0.5, song.confidenceScore),
          source: "ai" as const,
        })),
      );
    } else {
      console.warn("[recognition:image] primary_ocr_unavailable", {
        provider: "gemini_vision",
        reason: aiResult.status === "unavailable" ? aiResult.reason : "invalid_payload",
        fallback: "tesseract_plus_gemma",
        latencyMs: Date.now() - aiStart,
      });
      warnings.push(`PRIMARY_OCR_UNAVAILABLE:${aiResult.status === "unavailable" ? aiResult.reason : "invalid_payload"}`);
    }

    if (candidates.length === 0) {
      const fallback = await tesseractExtractor(buffer, language);
      const cleanupInput = dedupeOcrCandidates(fallback).map((item) => `${item.songName} - ${item.artist}`).join("\n");
      if (usage.gemmaCalls < OCR_MAX_GEMMA_CLEANUP_CALLS && cleanupInput.trim()) {
        usage.gemmaCalls += 1;
        const cleaned = await gemmaCleanupExtractor(cleanupInput);
        if (cleaned.status === "success") {
          candidates.push(
            ...cleaned.songs.map((song) => ({
              songName: song.title,
              artist: song.artist,
              album: UNKNOWN_METADATA.album,
              confidenceScore: Math.max(0.35, song.confidenceScore),
              source: "tesseract" as const,
            })),
          );
        } else {
          warnings.push(`TEXT_CLEANUP_UNAVAILABLE:${cleaned.reason}`);
        }
      }
      console.info("[recognition:image] fallback_ocr_result", {
        provider: "tesseract",
        candidates: fallback.length,
        confidence: fallback[0]?.confidenceScore ?? null,
      });
      candidates.push(...fallback.map((candidate) => ({ ...candidate, confidenceScore: Math.min(0.6, candidate.confidenceScore) })));
      warnings.push("OCR_FALLBACK_USED");
    }
  }

  const songMetadataResults: SongMetadata[] = [];
  const cleanedCandidates = dedupeOcrCandidates(candidates)
    .map(sanitizeCandidate)
    .filter((candidate): candidate is OcrCandidateMetadata => Boolean(candidate));
  const rankedCandidates = cleanedCandidates
    .sort((a, b) => scoreOcrCandidate(b) - scoreOcrCandidate(a))
    .slice(0, Math.min(Math.max(resolvedMaxSongs * 2, resolvedMaxSongs + 4), OCR_MAX_SURFACED_RESULTS));

  console.info("[recognition:image] candidate_pipeline", {
    rawCandidates: candidates.length,
    cleanedCandidates: cleanedCandidates.length,
    selectedCandidates: rankedCandidates.length,
    provider: warnings.includes("OCR_FALLBACK_USED") ? "tesseract" : "gemini_vision",
  });

  const youtubeCheckBudget = Math.min(OCR_MAX_YOUTUBE_CHECKS, Math.max(resolvedMaxSongs + 3, 8));
  for (const candidate of rankedCandidates) {
    if (usage.youtubeChecks >= youtubeCheckBudget) break;
    const lookupKey = `${normalizeForKey(candidate.songName)}::${normalizeForKey(candidate.artist)}`;
    if (checkedQueries.has(lookupKey)) continue;
    checkedQueries.add(lookupKey);
    try {
      usage.youtubeChecks += 1;
      const verification = await verifyCandidateAcrossProviders(candidate);
      const bestProviderMatch = verification.matches.sort((a, b) => b.confidence - a.confidence)[0];
      const dynamicConf = computeDynamicConfidence(candidate, verification);
      const finalConfidence = dynamicConf.final;
      const breakdown = dynamicConf.breakdown;
      if (bestProviderMatch && finalConfidence >= OCR_MIN_VERIFIED_CONFIDENCE) {
        const providerResult: ProviderSongMetadata = {
          songName: bestProviderMatch.title,
          artist: bestProviderMatch.artist,
          album: verification.album ?? UNKNOWN_METADATA.album,
          genre: "Unknown Genre",
          releaseYear: verification.releaseYear,
          confidenceScore: finalConfidence,
          youtubeVideoId: verification.platformLinks.youtube?.split("v=")[1],
          platformLinks: verification.platformLinks,
        };
        const resultState = classifyResultState(finalConfidence);
        if (resultState === "exact_match" || resultState === "strong_likely_match") usage.strongMatches += 1;
        songMetadataResults.push({
          ...toProviderResponse(providerResult),
          resultState,
          ocrEngine: candidate.source === "tesseract" ? "tesseract" : "gemini_vision",
          warnings: resultState === "need_better_sample" || resultState === "possible_matches" ? ["LOW_CONFIDENCE_MATCH", ...warnings] : warnings,
          confidenceBreakdown: breakdown,
          providerMatches: verification.matches,
          covers: verification.covers,
          debug: process.env.RECOGNITION_DEBUG === "true" ? { ocrText: candidate.ocrText ?? `${candidate.songName} - ${candidate.artist}`, normalizedText: candidate.normalizedText ?? { title: candidate.songName, artist: candidate.artist }, candidatePairs: candidate.candidatePairs ?? [] } : undefined,
          sourceImages: ["uploaded_image"],
        });
      } else {
        const bulgarianFallback = usage.youtubeChecks <= youtubeCheckBudget ? matchBulgarianSong(`${candidate.songName} ${candidate.artist}`) : null;
        const fallback = bulgarianFallback ? toProviderResponse(bulgarianFallback) : toFallbackResponse({ ...candidate, confidenceScore: finalConfidence });
        songMetadataResults.push({ ...fallback, confidenceScore: finalConfidence, confidenceBreakdown: breakdown, providerMatches: verification.matches, covers: verification.covers, ocrEngine: candidate.source === "tesseract" ? "tesseract" : "gemini_vision", warnings: ["LOW_CONFIDENCE_MATCH", ...warnings], sourceImages: ["uploaded_image"] });
      }
    } catch {
      const dynamicConf = computeDynamicConfidence(candidate, null);
      const breakdown = dynamicConf.breakdown;
      songMetadataResults.push({ ...toFallbackResponse({ ...candidate, confidenceScore: dynamicConf.final }), confidenceBreakdown: breakdown, warnings: ["LOW_CONFIDENCE_MATCH", ...warnings], sourceImages: ["uploaded_image"] });
    }
  }

  if (usage.youtubeChecks >= youtubeCheckBudget && rankedCandidates.length > youtubeCheckBudget) {
    warnings.push("YOUTUBE_VERIFICATION_BUDGET_REACHED");
  }

  if (songMetadataResults.length === 0 && candidates.length > 0) {
    const fallbackCandidate = {
      ...candidates[0],
      songName: normalizeOcrText(candidates[0]!.songName) || UNKNOWN_METADATA.songName,
      artist: normalizeOcrText(candidates[0]!.artist) || UNKNOWN_METADATA.artist,
      confidenceScore: Math.min(0.35, candidates[0]!.confidenceScore),
      source: (candidates[0]!.source ?? "tesseract") as "ai" | "tesseract",
    } satisfies OcrCandidateMetadata;
    songMetadataResults.push({
      ...toFallbackResponse(fallbackCandidate),
      ocrEngine: fallbackCandidate.source === "ai" ? "gemini_vision" : "tesseract",
      warnings: ["LOW_CONFIDENCE_MATCH", "OCR_TEXT_TOO_NOISY", ...warnings],
    });
  }

  if (songMetadataResults.length === 0) throw new NoVerifiedResultError("No plausible song matches detected from OCR.");
  const plausibleResults = mergeDuplicateSongs(songMetadataResults)
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, Math.min(resolvedMaxSongs, OCR_MAX_SURFACED_RESULTS));
    const output: ImageRecognitionOutput = { songs: plausibleResults, warnings, ocrPath: warnings.includes("OCR_FALLBACK_USED") ? "tesseract_plus_gemma" : "ai_primary" };
    imageAttemptCache.set(attemptKey, { value: output, expiresAt: Date.now() + OCR_ATTEMPT_TTL_MS });
    return output;
  };

  const promise = runPipeline().finally(() => {
    inFlightImageAttempts.delete(attemptKey);
  });
  inFlightImageAttempts.set(attemptKey, promise);
  return promise;
}
