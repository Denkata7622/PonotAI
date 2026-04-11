import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import type { GeminiHistoryMessage, GeminiResponse } from "../../types/assistant";
import { GeminiError } from "../../types/assistant";

let singleton: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing GEMINI_API_KEY environment variable in production");
    }
    throw new GeminiError("MISSING_API_KEY", "GEMINI_API_KEY is not configured");
  }

  if (!singleton) {
    singleton = new GoogleGenerativeAI(apiKey);
  }

  return singleton;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ProviderFailureKind =
  | "timeout"
  | "429"
  | "503"
  | "invalid_model"
  | "empty_response"
  | "parse_failure"
  | "unknown";

const REQUEST_TIMEOUT_MS = 35_000;
const MAX_RETRIES = 3;

function getErrorStatus(error: unknown): number | undefined {
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  const status = Number(candidate?.status ?? candidate?.response?.status);
  return Number.isFinite(status) ? status : undefined;
}

function classifyProviderFailure(error: unknown): ProviderFailureKind {
  const status = getErrorStatus(error);
  const candidate = error as { status?: number; message?: string };
  const message = String(candidate?.message ?? "").toLowerCase();

  if (message.includes("timeout")) return "timeout";
  if (status === 429 || message.includes("429")) return "429";
  if (status === 503 || message.includes("503")) return "503";
  if (message.includes("model") && (message.includes("invalid") || message.includes("not found"))) return "invalid_model";
  if (message.includes("empty response") || message.includes("empty candidate")) return "empty_response";
  if (message.includes("parse")) return "parse_failure";
  return "unknown";
}

function isRetryableFailure(kind: ProviderFailureKind): boolean {
  return kind === "timeout" || kind === "429" || kind === "503";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new GeminiError("PROVIDER_TIMEOUT", "Provider request timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = MAX_RETRIES): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const kind = classifyProviderFailure(error);
      const retryable = isRetryableFailure(kind);
      if (!retryable || attempt === maxRetries - 1) {
        throw error;
      }
      const delay = Math.min(750 * (2 ** attempt), 4000);
      console.warn(`[assistant] provider ${kind}`, { attempt: attempt + 1, retryInMs: delay });
      await sleep(delay);
    }
  }
  throw lastError;
}

const DEFAULT_MODELS_BY_PRIORITY = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

function getModelsByPriority(): string[] {
  const fromEnv = process.env.GEMINI_MODELS?.trim();
  if (!fromEnv) return [...DEFAULT_MODELS_BY_PRIORITY];
  const models = fromEnv.split(",").map((model) => model.trim()).filter(Boolean);
  return models.length > 0 ? models : [...DEFAULT_MODELS_BY_PRIORITY];
}

export async function generateAssistantReply(
  systemPrompt: string,
  history: GeminiHistoryMessage[],
  userMessage: string,
): Promise<GeminiResponse> {
  const client = getGeminiClient();
  const startedAt = Date.now();
  let lastError: unknown = null;
  const modelsByPriority = getModelsByPriority();
  for (const modelName of modelsByPriority) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ],
        systemInstruction: systemPrompt,
      });
      const chat = model.startChat({
        history,
        generationConfig: {
          maxOutputTokens: 1200,
          temperature: 0.3,
          topP: 0.8,
        },
      });
      const result = await callWithRetry(() => withTimeout(chat.sendMessage(userMessage)));
      const response = result.response;
      const text = response.text();
      if (!text?.trim()) {
        console.error("[assistant] empty candidate text", { model: modelName });
        throw new GeminiError("EMPTY_RESPONSE", "Provider returned an empty response");
      }
      const latencyMs = Date.now() - startedAt;
      const usage = response.usageMetadata;
      console.info("[assistant]", {
        model: modelName,
        latencyMs,
        promptTokenCount: usage?.promptTokenCount,
        candidatesTokenCount: usage?.candidatesTokenCount,
        totalTokenCount: usage?.totalTokenCount,
      });

      return {
        text,
        model: modelName,
        usage,
        latencyMs,
      };
    } catch (error) {
      lastError = error;
      const kind = classifyProviderFailure(error);
      const retryable = isRetryableFailure(kind);
      const status = getErrorStatus(error);
      console.error(`[assistant] provider ${kind}`, {
        model: modelName,
        status,
        message: (error as Error)?.message ?? String(error),
      });
      if (!retryable || modelName === modelsByPriority[modelsByPriority.length - 1]) {
        break;
      }
      console.info("[assistant] trying fallback Gemini model");
    }
  }

  const failureKind = classifyProviderFailure(lastError);
  const status = getErrorStatus(lastError);
  if (isRetryableFailure(failureKind)) {
    throw new GeminiError("GEMINI_TEMPORARY_UNAVAILABLE", "AI Assistant is temporarily busy. Please try again in a few seconds.");
  }
  if (failureKind === "invalid_model") {
    throw new GeminiError("GEMINI_INVALID_MODEL", "Configured AI model is invalid. Please contact support.");
  }
  if (failureKind === "empty_response") {
    throw new GeminiError("GEMINI_EMPTY_RESPONSE", "AI provider returned an empty response.");
  }
  throw new GeminiError(
    `GEMINI_${status || "UNKNOWN"}`,
    (lastError as Error)?.message || "Gemini request failed",
  );
}
