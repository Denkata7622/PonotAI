import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "node:crypto";

export type AiOcrSuccess = {
  status: "success";
  model: string;
  songs: Array<{
    title: string;
    artist: string;
    confidenceScore: number;
  }>;
};

export type AiOcrUnavailable = {
  status: "unavailable";
  reason: "missing_api_key" | "empty_response" | "provider_error" | "invalid_payload" | "quota_exhausted" | "invalid_model" | "malformed_response";
  model?: string;
};

export type AiOcrResult = AiOcrSuccess | AiOcrUnavailable;
export type GemmaCleanupResult = {
  status: "success";
  model: string;
  songs: Array<{ title: string; artist: string; confidenceScore: number }>;
} | {
  status: "unavailable";
  reason: "missing_api_key" | "empty_response" | "invalid_payload" | "provider_error" | "quota_exhausted" | "invalid_model";
  model?: string;
};

export const DIRECT_IMAGE_OCR_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;
export const GEMMA_TEXT_CLEANUP_MODELS = ["gemma-3-4b-it", "gemma-3-12b-it"] as const;
const IMAGE_OCR_CACHE_TTL_MS = 60_000;
const TEXT_CLEANUP_CACHE_TTL_MS = 45_000;
const imageOcrCache = new Map<string, { expiresAt: number; value: AiOcrResult }>();
const cleanupCache = new Map<string, { expiresAt: number; value: GemmaCleanupResult }>();
let directRunner = runDirectImageOcrModel;
let cleanupRunner = runGemmaCleanupModel;

function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  return key || null;
}

function clampConfidence(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0.25, Math.min(0.95, parsed)) : 0.7;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[\s\-–—:;,.!?()[\]{}]+|[\s\-–—:;,.!?()[\]{}]+$/g, "").trim();
}

function parseAiJson(rawText: string): AiOcrSuccess | null {
  const cleaned = rawText.trim().replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned) as {
    title?: unknown;
    artist?: unknown;
    confidenceScore?: unknown;
    confidence?: unknown;
    songs?: Array<{ title?: unknown; artist?: unknown; confidenceScore?: unknown; confidence?: unknown }>;
  };

  const songsPayload = Array.isArray(parsed.songs)
    ? parsed.songs
    : [{ title: parsed.title, artist: parsed.artist, confidenceScore: parsed.confidenceScore ?? parsed.confidence }];

  const songs = songsPayload
    .map((song) => {
      const title = typeof song.title === "string" ? normalizeText(song.title) : "";
      if (!title) return null;
      const artist = typeof song.artist === "string" ? normalizeText(song.artist) : "";
      return {
        title,
        artist: artist || "Unknown Artist",
        confidenceScore: clampConfidence(song.confidenceScore ?? song.confidence),
      };
    })
    .filter((song): song is NonNullable<typeof song> => Boolean(song));

  if (songs.length === 0) return null;
  return { status: "success", songs, model: "" };
}

function parseProviderError(error: unknown): AiOcrUnavailable["reason"] {
  const message = (error as Error)?.message?.toLowerCase?.() ?? "";
  if (!message) return "provider_error";
  if (message.includes("quota") || message.includes("rate limit") || message.includes("429")) return "quota_exhausted";
  if (message.includes("model") && (message.includes("not found") || message.includes("invalid"))) return "invalid_model";
  if (message.includes("malformed") || message.includes("parse")) return "malformed_response";
  return "provider_error";
}

function pruneCache<T>(store: Map<string, { expiresAt: number; value: T }>): void {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.expiresAt <= now) store.delete(key);
  }
}

function hashPayload(prefix: string, payload: string): string {
  return crypto.createHash("sha256").update(prefix).update("::").update(payload).digest("hex");
}

async function runDirectImageOcrModel(apiKey: string, modelName: string, buffer: Buffer, mimeType: string): Promise<AiOcrResult> {
  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const visionModel = model as unknown as {
      generateContent: (payload: {
        contents: Array<{
          role: "user";
          parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
        }>;
      }) => Promise<{ response?: { text?: () => string } }>;
    };
    const result = await visionModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Extract up to 10 plausible music track candidates from this image. Return JSON with songs array only. Each item: title, artist, confidenceScore. Reject app labels/tutorial text/UI terms/random fragments.",
            },
            {
              inlineData: {
                mimeType,
                data: buffer.toString("base64"),
              },
            },
          ],
        },
      ],
    });

    const text = result.response?.text?.() ?? "";
    if (!text.trim()) return { status: "unavailable", reason: "empty_response", model: modelName };
    const parsed = parseAiJson(text);
    if (!parsed) return { status: "unavailable", reason: "invalid_payload", model: modelName };
    return { ...parsed, model: modelName };
  } catch (error) {
    return { status: "unavailable", reason: parseProviderError(error), model: modelName };
  }
}

function isUsableDirectResult(result: AiOcrResult): result is AiOcrSuccess {
  return result.status === "success" && result.songs.length > 0 && result.songs[0]!.confidenceScore >= 0.5;
}

function parseGemmaCleanupJson(rawText: string): Array<{ title: string; artist: string; confidenceScore: number }> {
  const cleaned = rawText.trim().replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned) as { songs?: Array<{ title?: unknown; artist?: unknown; confidenceScore?: unknown }> };
  return (parsed.songs ?? [])
    .map((song) => {
      const title = typeof song.title === "string" ? normalizeText(song.title) : "";
      const artist = typeof song.artist === "string" ? normalizeText(song.artist) : "";
      if (!title) return null;
      return {
        title,
        artist: artist || "Unknown Artist",
        confidenceScore: clampConfidence(song.confidenceScore),
      };
    })
    .filter((song): song is NonNullable<typeof song> => Boolean(song));
}

async function runGemmaCleanupModel(apiKey: string, modelName: string, noisyText: string): Promise<GemmaCleanupResult> {
  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });
    const textModel = model as unknown as {
      generateContent: (payload: {
        contents: Array<{
          role: "user";
          parts: Array<{ text: string }>;
        }>;
      }) => Promise<{ response?: { text?: () => string } }>;
    };
    const result = await textModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are cleaning OCR text (text-only, no image access). Extract up to 8 plausible music title/artist candidates from this OCR text and remove UI/tutorial/app junk. JSON only: {"songs":[{"title":"","artist":"","confidenceScore":0.0}]}. OCR text:\n${noisyText}`,
            },
          ],
        },
      ],
    });
    const text = result.response?.text?.() ?? "";
    if (!text.trim()) return { status: "unavailable", reason: "empty_response", model: modelName };
    const songs = parseGemmaCleanupJson(text);
    if (!songs.length) return { status: "unavailable", reason: "invalid_payload", model: modelName };
    return { status: "success", model: modelName, songs };
  } catch (error) {
    const reason = parseProviderError(error);
    return {
      status: "unavailable",
      reason: reason === "malformed_response" ? "invalid_payload" : reason,
      model: modelName,
    };
  }
}

export async function extractMetadataWithAiOcr(buffer: Buffer, mimeType = "image/jpeg"): Promise<AiOcrResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { status: "unavailable", reason: "missing_api_key" };
  }
  pruneCache(imageOcrCache);
  const cacheKey = hashPayload(`direct:${mimeType}`, buffer.toString("base64"));
  const cached = imageOcrCache.get(cacheKey);
  if (cached) return cached.value;

  let finalFailure: AiOcrResult = { status: "unavailable", reason: "provider_error" };
  for (const modelName of DIRECT_IMAGE_OCR_MODELS) {
    const result = await directRunner(apiKey, modelName, buffer, mimeType);
    if (isUsableDirectResult(result)) {
      imageOcrCache.set(cacheKey, { value: result, expiresAt: Date.now() + IMAGE_OCR_CACHE_TTL_MS });
      return result;
    }
    finalFailure = result;
    if (result.status === "unavailable" && (result.reason === "missing_api_key" || result.reason === "quota_exhausted")) {
      break;
    }
  }
  imageOcrCache.set(cacheKey, { value: finalFailure, expiresAt: Date.now() + 8_000 });
  return finalFailure;
}

export async function cleanupTesseractTextWithGemma(noisyText: string): Promise<GemmaCleanupResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { status: "unavailable", reason: "missing_api_key" };
  const cleanedText = noisyText.trim();
  if (!cleanedText) return { status: "unavailable", reason: "empty_response" };

  pruneCache(cleanupCache);
  const cacheKey = hashPayload("cleanup", cleanedText.toLowerCase());
  const cached = cleanupCache.get(cacheKey);
  if (cached) return cached.value;

  let finalFailure: GemmaCleanupResult = { status: "unavailable", reason: "provider_error" };
  for (const modelName of GEMMA_TEXT_CLEANUP_MODELS) {
    const result = await cleanupRunner(apiKey, modelName, cleanedText);
    if (result.status === "success" && result.songs.length > 0) {
      cleanupCache.set(cacheKey, { value: result, expiresAt: Date.now() + TEXT_CLEANUP_CACHE_TTL_MS });
      return result;
    }
    finalFailure = result;
    if (result.status === "unavailable" && (result.reason === "missing_api_key" || result.reason === "quota_exhausted")) {
      break;
    }
  }
  cleanupCache.set(cacheKey, { value: finalFailure, expiresAt: Date.now() + 10_000 });
  return finalFailure;
}

export function __setAiImageOcrRunnersForTests(overrides: {
  directRunner?: typeof runDirectImageOcrModel;
  cleanupRunner?: typeof runGemmaCleanupModel;
} | null): void {
  directRunner = overrides?.directRunner ?? runDirectImageOcrModel;
  cleanupRunner = overrides?.cleanupRunner ?? runGemmaCleanupModel;
}
