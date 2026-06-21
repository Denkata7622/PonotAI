export type SongMatch = {
  songName: string;
  artist: string;
  album: string;
  genre: string;
  releaseYear: number | null;
  platformLinks: {
    youtube?: string;
    youtubeMusic?: string;
    appleMusic?: string;
    spotify?: string;
    preview?: string;
  };
  youtubeVideoId?: string;
  albumArtUrl: string;
  confidence: number;
  durationSec: number;
  resultState?: "exact_match" | "strong_likely_match" | "possible_matches" | "need_better_sample";
  alternatives?: Array<{ songName: string; artist: string; confidenceScore: number }>;
};

import { apiFetch } from "@/src/lib/apiFetch";
import { normalizeVisibleText } from "@/lib/text";
import { getApiBaseUrl } from "@/lib/apiConfig";
import { enrichSongCoverArt } from "./coverArt";
import { addOcrSongs, type OcrLibraryEntry } from "@/lib/ocrLibraryDb";

export type SongRecognitionResult = SongMatch & {
  source?: "provider" | "ocr_fallback" | "audio" | "image";
  ocrEngine?: "gemini_vision" | "tesseract";
  verificationStatus?: "verified" | "not_found";
  attemptId?: string;
  warnings?: string[];
};

export type AudioRecognitionResult = { primaryMatch: SongRecognitionResult; alternatives: SongRecognitionResult[] };
export type ImageRecognitionBatchInfo = {
  uploadedCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  dedupedCount: number;
  perImage: Array<{
    fileName: string;
    fileIndex: number;
    accepted: boolean;
    warning?: string;
    ocrPath?: "ai_primary" | "tesseract_plus_gemma";
    songCount?: number;
  }>;
};

export type ImageRecognitionResult = {
  songs: SongRecognitionResult[];
  count: number;
  language: string;
  warnings?: string[];
  ocrPath?: "ai_primary" | "tesseract_plus_gemma";
  batch?: ImageRecognitionBatchInfo;
};

export class RecognitionError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "RecognitionError";
    this.code = code;
  }
}

let activeController: AbortController | null = null;
const recentRequestKeys = new Map<string, number>();

function markAndCheckDuplicate(requestKey: string): boolean {
  const now = Date.now();
  for (const [key, ts] of recentRequestKeys.entries()) {
    if (now - ts > 20_000) recentRequestKeys.delete(key);
  }
  if (recentRequestKeys.has(requestKey)) return true;
  recentRequestKeys.set(requestKey, now);
  return false;
}

async function postMultipart<T>(endpoint: string, fieldName: string, file: Blob, filename: string, extraFields?: Record<string, string>): Promise<T> {
  const requestKey = `${endpoint}:${filename}:${file.size}:${extraFields?.mode ?? "default"}`;
  if (markAndCheckDuplicate(requestKey)) {
    throw new RecognitionError("Duplicate recognition attempt ignored. Please wait for the current request.", "DUPLICATE_ATTEMPT");
  }

  if (activeController) activeController.abort();
  activeController = new AbortController();
  const formData = new FormData();
  formData.append(fieldName, file, filename);
  if (extraFields) for (const [key, value] of Object.entries(extraFields)) formData.append(key, value);

  const response = await apiFetch(endpoint, {
    method: "POST",
    body: formData,
    signal: activeController.signal
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    try {
      const errorPayload = (await response.json()) as { message?: string; code?: string };
      if (errorPayload.message) message = errorPayload.message;
      code = errorPayload.code;
    } catch {
      // ignore
    }
    throw new RecognitionError(message, code);
  }

  return (await response.json()) as T;
}

function normalizeSong(result: SongRecognitionResult): SongRecognitionResult {
  return {
    ...result,
    songName: normalizeVisibleText(result.songName) || "Unknown Song",
    artist: normalizeVisibleText(result.artist) || "Unknown Artist",
    album: normalizeVisibleText(result.album) || "Unknown Album",
    alternatives: (result.alternatives ?? []).map((item) => ({
      ...item,
      songName: normalizeVisibleText(item.songName) || "Unknown Song",
      artist: normalizeVisibleText(item.artist) || "Unknown Artist",
    })),
    albumArtUrl: result.albumArtUrl || "https://picsum.photos/seed/recognized/120",
    confidence: typeof result.confidence === "number" ? result.confidence : 1,
    durationSec: typeof result.durationSec === "number" ? result.durationSec : 0,
  };
}

export async function recognizeFromAudio(audioBlob: Blob): Promise<AudioRecognitionResult> {
  const primary = await postMultipart<SongRecognitionResult>("/api/recognition/audio", "audio", audioBlob, "recording.webm");
  const normalized = normalizeSong(primary);
  const enriched = await enrichSongCoverArt(getApiBaseUrl(), normalized);
  return { primaryMatch: enriched, alternatives: [] };
}

export async function recognizeFromHumming(audioBlob: Blob): Promise<AudioRecognitionResult> {
  const primary = await postMultipart<SongRecognitionResult>("/api/recognition/audio/humming", "audio", audioBlob, "humming.webm");
  const normalized = normalizeSong(primary);
  const enriched = await enrichSongCoverArt(getApiBaseUrl(), normalized);
  return { primaryMatch: enriched, alternatives: [] };
}

export async function recognizeFromLiveRecording(audioBlob: Blob): Promise<AudioRecognitionResult> {
  const primary = await postMultipart<SongRecognitionResult>("/api/recognition/audio/live", "audio", audioBlob, "live.webm");
  const normalized = normalizeSong(primary);
  const enriched = await enrichSongCoverArt(getApiBaseUrl(), normalized);
  return { primaryMatch: enriched, alternatives: [] };
}

export async function recognizeFromVideo(videoFile: File): Promise<AudioRecognitionResult> {
  const primary = await postMultipart<SongRecognitionResult>("/api/recognition/video", "video", videoFile, videoFile.name);
  const normalized = normalizeSong(primary);
  const enriched = await enrichSongCoverArt(getApiBaseUrl(), normalized);
  return { primaryMatch: enriched, alternatives: [] };
}

export async function recognizeFromImage(imageFile: File, maxSongs = 1, language = "eng"): Promise<ImageRecognitionResult> {
  return recognizeFromImages([imageFile], maxSongs, language);
}

export async function recognizeFromImageAndStore(
  file: File,
  maxSongs = 20,
  language = "eng"
): Promise<ImageRecognitionResult> {
  const result = await recognizeFromImage(file, maxSongs, language);
  if (result.songs.length > 0) {
    const now = new Date().toISOString();
    const entries: OcrLibraryEntry[] = result.songs.map((song) => ({
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      artist: (song.artist || "").trim(),
      title: (song.songName || "").trim(),
      album: (song.album || "").trim() || undefined,
      coverUrl: song.albumArtUrl || null,
      confidence: song.confidence ?? 0,
      extractedAt: now,
      status: "unassigned" as const,
    })).filter((entry) => entry.artist || entry.title);
    await addOcrSongs(entries).catch((error: unknown) =>
      console.error("[ocr-library] Failed to save to OCR library:", error)
    );
  }
  return result;
}
export async function recognizeFromImages(imageFiles: File[], maxSongs = 1, language = "eng"): Promise<ImageRecognitionResult> {
  const filteredFiles = imageFiles.filter((file) => file.size > 0);
  if (filteredFiles.length === 0) {
    throw new RecognitionError("At least one valid image file is required.", "IMAGE_FILE_REQUIRED");
  }
  const formData = new FormData();
  for (const file of filteredFiles) {
    formData.append("images", file, file.name);
  }
  formData.append("maxSongs", String(maxSongs));
  formData.append("language", language);

  const response = await apiFetch("/api/recognition/image", { method: "POST", body: formData });
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    try {
      const errorPayload = (await response.json()) as { message?: string; code?: string; details?: { message?: string } };
      message = errorPayload.details?.message || errorPayload.message || message;
      code = errorPayload.code;
    } catch {
      // ignore
    }
    throw new RecognitionError(message, code);
  }

  const result = (await response.json()) as ImageRecognitionResult;
  const songs = result.songs.map((song) => normalizeSong(song)).slice(0, Math.max(1, maxSongs));
  return {
    songs,
    count: songs.length,
    language: result.language || language,
    warnings: result.warnings ?? [],
    ocrPath: result.ocrPath,
    batch: result.batch,
  };
}
