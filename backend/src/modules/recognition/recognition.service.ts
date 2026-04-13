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
import { extractMetadataWithAiOcr } from "./aiImageOcr.service";
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
};

const OCR_CHAR_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 &-_\'\"():,./+!?[]";
const OCR_LANGUAGE_MAP: Record<string, string> = { eng: "eng", bul: "bul", "bul+eng": "bul+eng", "bg+en": "bul+eng", bg: "bul" };
let aiOcrExtractor: typeof extractMetadataWithAiOcr = extractMetadataWithAiOcr;
let tesseractExtractor: typeof extractMetadataWithOcr = extractMetadataWithOcr;

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

async function extractMetadataWithOcr(buffer: Buffer, language = "eng"): Promise<OcrCandidateMetadata> {
  const normalizedLanguage = OCR_LANGUAGE_MAP[language] ?? "eng";
  const worker = await Tesseract.createWorker(normalizedLanguage);
  await worker.setParameters({ tessedit_char_whitelist: OCR_CHAR_WHITELIST, preserve_interword_spaces: "1" });
  try {
    const ocrResult = await worker.recognize(buffer);
    const words = ((ocrResult.data as { words?: TesseractWord[] }).words ?? []) as TesseractWord[];
    const interpreted = interpretOcr(toOcrBlocks(words));
    if (interpreted.music?.title && interpreted.music.confidenceScore >= 0.42) {
      return { songName: interpreted.music.title, artist: interpreted.music.artist ?? UNKNOWN_METADATA.artist, album: UNKNOWN_METADATA.album, confidenceScore: interpreted.music.confidenceScore };
    }
    const fallback = deriveBestEffortMetadata(interpreted.lines);
    if (!fallback) throw new NoVerifiedResultError("Could not extract readable song text from the uploaded image.");
    return fallback;
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

export function __setImageOcrExtractorsForTests(overrides: {
  aiExtractor?: typeof extractMetadataWithAiOcr;
  tesseractExtractor?: typeof extractMetadataWithOcr;
} | null): void {
  aiOcrExtractor = overrides?.aiExtractor ?? extractMetadataWithAiOcr;
  tesseractExtractor = overrides?.tesseractExtractor ?? extractMetadataWithOcr;
}

export type ImageRecognitionOutput = {
  songs: SongMetadata[];
  warnings: string[];
  ocrPath: "ai_primary" | "tesseract_only";
};

export async function recognizeSongFromImage(buffer: Buffer, language = "eng", mimeType = "image/jpeg"): Promise<ImageRecognitionOutput> {
  const warnings: string[] = [];
  const candidates: OcrCandidateMetadata[] = [];
  const aiStart = Date.now();
  console.info("[recognition:image] primary_ocr_attempt", { provider: "gemini_vision", language });
  const aiResult = await aiOcrExtractor(buffer, mimeType);

  if (aiResult.status === "success") {
    console.info("[recognition:image] primary_ocr_success", {
      provider: "gemini_vision",
      textLength: aiResult.title.length + aiResult.artist.length,
      confidence: aiResult.confidenceScore,
      latencyMs: Date.now() - aiStart,
    });
    candidates.push({
      songName: aiResult.title,
      artist: aiResult.artist,
      album: UNKNOWN_METADATA.album,
      confidenceScore: Math.max(0.5, aiResult.confidenceScore),
    });
  } else {
    console.warn("[recognition:image] primary_ocr_unavailable", {
      provider: "gemini_vision",
      reason: aiResult.reason,
      fallback: "tesseract",
      latencyMs: Date.now() - aiStart,
    });
    warnings.push(`PRIMARY_OCR_UNAVAILABLE:${aiResult.reason}`);
  }

  if (candidates.length === 0) {
    const fallback = await tesseractExtractor(buffer, language);
    console.info("[recognition:image] fallback_ocr_result", {
      provider: "tesseract",
      textLength: fallback.songName.length + fallback.artist.length,
      confidence: fallback.confidenceScore,
    });
    candidates.push(fallback);
    warnings.push("OCR_FALLBACK_USED");
  }

  const songMetadataResults: SongMetadata[] = [];

  for (const candidate of candidates) {
    try {
      const providerResult = await lookupSongByTitleAndArtist(candidate.songName, candidate.artist);
      if (providerResult) {
        const resultState = classifyResultState(providerResult.confidenceScore);
        songMetadataResults.push({
          ...toProviderResponse(providerResult),
          resultState,
          ocrEngine: candidates.length > 0 && warnings.includes("OCR_FALLBACK_USED") ? "tesseract" : "gemini_vision",
          warnings: resultState === "need_better_sample" || resultState === "possible_matches" ? ["LOW_CONFIDENCE_MATCH", ...warnings] : warnings,
        });
      } else {
        const bulgarianFallback = matchBulgarianSong(`${candidate.songName} ${candidate.artist}`);
        songMetadataResults.push(
          bulgarianFallback
            ? { ...toProviderResponse(bulgarianFallback), resultState: "strong_likely_match", ocrEngine: warnings.includes("OCR_FALLBACK_USED") ? "tesseract" : "gemini_vision", warnings }
            : { ...toFallbackResponse(candidate), warnings: ["LOW_CONFIDENCE_MATCH", ...warnings] },
        );
      }
    } catch {
      songMetadataResults.push({ ...toFallbackResponse(candidate), warnings: ["LOW_CONFIDENCE_MATCH", ...warnings] });
    }
  }

  if (songMetadataResults.length === 0) throw new NoVerifiedResultError("No songs detected in image.");
  return { songs: songMetadataResults, warnings, ocrPath: warnings.includes("OCR_FALLBACK_USED") ? "tesseract_only" : "ai_primary" };
}
