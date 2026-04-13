import Tesseract from "tesseract.js";
import { parseBuffer } from "music-metadata";
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

export type SongMetadata = ProviderSongMetadata & {
  source: "provider" | "ocr_fallback";
  ocrEngine?: "gemini_vision" | "tesseract";
  verificationStatus: "verified" | "not_found";
  resultState?: "exact_match" | "strong_likely_match" | "possible_matches" | "need_better_sample";
  alternatives?: Array<Pick<ProviderSongMetadata, "songName" | "artist" | "confidenceScore">>;
  attemptId?: string;
  warnings?: string[];
};

type OcrCandidateMetadata = {
  songName: string;
  artist: string;
  album: string;
  confidenceScore: number;
  source?: "ai" | "tesseract";
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
const OCR_MAX_SURFACED_RESULTS = 6;
const OCR_MAX_DIRECT_ATTEMPTS = 3;
const OCR_MAX_GEMMA_CLEANUP_CALLS = 3;
const OCR_MAX_YOUTUBE_CHECKS = 6;
const OCR_MAX_STRONG_MATCHES = 3;
const OCR_ATTEMPT_TTL_MS = 20_000;
const OCR_YOUTUBE_CACHE_TTL_MS = 120_000;
const JUNK_EXACT_TOKENS = new Set(["codewars", "python", "tutorial", "settings", "notifications", "battery", "wifi", "next", "back", "home", "share", "playlist", "search", "library"]);
const JUNK_FRAGMENT_REGEX = /(codewars|tutorial|python|install|download|subscribe|notification|learning|course|button|privacy|settings|wi-?fi|bluetooth)/i;
let aiOcrExtractor: typeof extractMetadataWithAiOcr = extractMetadataWithAiOcr;
let tesseractExtractor: typeof extractMetadataWithOcr = extractMetadataWithOcr;
let lookupSongExtractor: typeof lookupSongByTitleAndArtist = lookupSongByTitleAndArtist;
let gemmaCleanupExtractor: typeof cleanupTesseractTextWithGemma = cleanupTesseractTextWithGemma;
const imageAttemptCache = new Map<string, { expiresAt: number; value: ImageRecognitionOutput }>();
const youtubeQueryCache = new Map<string, { expiresAt: number; value: ProviderSongMetadata | null }>();
const inFlightImageAttempts = new Map<string, Promise<ImageRecognitionOutput>>();

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

function pruneImageCaches(): void {
  const now = Date.now();
  for (const [key, value] of imageAttemptCache.entries()) {
    if (value.expiresAt <= now) imageAttemptCache.delete(key);
  }
  for (const [key, value] of youtubeQueryCache.entries()) {
    if (value.expiresAt <= now) youtubeQueryCache.delete(key);
  }
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/[“”„‟"']/g, "")
    .replace(/[|`~^_*]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:;,.!?()[\]{}]+|[\s\-–—:;,.!?()[\]{}]+$/g, "")
    .trim();
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
    .slice(0, 15);

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

  return dedupeOcrCandidates(candidates);
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

  const songMetadataResults: SongMetadata[] = [];
  const cleanedCandidates = dedupeOcrCandidates(candidates)
    .map(sanitizeCandidate)
    .filter((candidate): candidate is OcrCandidateMetadata => Boolean(candidate));
  const rankedCandidates = cleanedCandidates
    .sort((a, b) => scoreOcrCandidate(b) - scoreOcrCandidate(a))
    .slice(0, Math.min(resolvedMaxSongs, OCR_MAX_SURFACED_RESULTS));

  console.info("[recognition:image] candidate_pipeline", {
    rawCandidates: candidates.length,
    cleanedCandidates: cleanedCandidates.length,
    selectedCandidates: rankedCandidates.length,
    provider: warnings.includes("OCR_FALLBACK_USED") ? "tesseract" : "gemini_vision",
  });

  for (const candidate of rankedCandidates) {
    if (usage.youtubeChecks >= OCR_MAX_YOUTUBE_CHECKS || usage.strongMatches >= OCR_MAX_STRONG_MATCHES) break;
    const lookupKey = `${candidate.songName.toLowerCase()}::${candidate.artist.toLowerCase()}`;
    if (checkedQueries.has(lookupKey)) continue;
    checkedQueries.add(lookupKey);
    try {
      let providerResult: ProviderSongMetadata | null = null;
      const cached = youtubeQueryCache.get(lookupKey);
      if (cached) {
        providerResult = cached.value;
      } else {
        usage.youtubeChecks += 1;
        providerResult = await lookupSongExtractor(candidate.songName, candidate.artist);
        youtubeQueryCache.set(lookupKey, { value: providerResult, expiresAt: Date.now() + OCR_YOUTUBE_CACHE_TTL_MS });
      }
      if (providerResult && providerResult.confidenceScore >= OCR_MIN_VERIFIED_CONFIDENCE) {
        const resultState = classifyResultState(providerResult.confidenceScore);
        if (resultState === "exact_match" || resultState === "strong_likely_match") usage.strongMatches += 1;
        songMetadataResults.push({
          ...toProviderResponse(providerResult),
          resultState,
          ocrEngine: candidate.source === "tesseract" ? "tesseract" : "gemini_vision",
          warnings: resultState === "need_better_sample" || resultState === "possible_matches" ? ["LOW_CONFIDENCE_MATCH", ...warnings] : warnings,
        });
      } else {
        const bulgarianFallback = usage.youtubeChecks <= OCR_MAX_YOUTUBE_CHECKS ? matchBulgarianSong(`${candidate.songName} ${candidate.artist}`) : null;
        songMetadataResults.push(
          bulgarianFallback
            ? { ...toProviderResponse(bulgarianFallback), resultState: "strong_likely_match", ocrEngine: candidate.source === "tesseract" ? "tesseract" : "gemini_vision", warnings }
            : { ...toFallbackResponse(candidate), warnings: ["LOW_CONFIDENCE_MATCH", ...warnings] },
        );
      }
    } catch {
      songMetadataResults.push({ ...toFallbackResponse(candidate), warnings: ["LOW_CONFIDENCE_MATCH", ...warnings] });
    }
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
  const plausibleResults = songMetadataResults
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
