import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import type { GeminiHistoryMessage, GeminiResponse } from "../../types/assistant";
import { GeminiError } from "../../types/assistant";

type GeminiModelName = "gemini-2.5-flash" | "gemini-2.0-flash";

const SUPPORTED_MODELS: GeminiModelName[] = ["gemini-2.5-flash", "gemini-2.0-flash"];
const DEFAULT_MODEL: GeminiModelName = "gemini-2.5-flash";
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 35_000;

let singleton: GoogleGenerativeAI | null = null;
let geminiClientFactory: ((apiKey: string) => GoogleGenerativeAI) | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiError("MISSING_API_KEY", "GEMINI_API_KEY is not configured");
  }

  if (!singleton) {
    singleton = geminiClientFactory ? geminiClientFactory(apiKey) : new GoogleGenerativeAI(apiKey);
  }

  return singleton;
}

export function __setGeminiClientFactoryForTests(factory: ((apiKey: string) => GoogleGenerativeAI) | null): void {
  geminiClientFactory = factory;
  singleton = null;
}

export function resolveGeminiModelPlan(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const normalizedConfigured = configured.toLowerCase();
  const plan = [normalizedConfigured, ...SUPPORTED_MODELS.filter((model) => model !== normalizedConfigured)];
  const unique = [...new Set(plan)].filter((model) => SUPPORTED_MODELS.includes(model as GeminiModelName));

  if (!SUPPORTED_MODELS.includes(normalizedConfigured as GeminiModelName)) {
    console.error("[assistant] configured AI model is invalid", {
      configuredModel: configured,
      supportedModels: SUPPORTED_MODELS,
      defaultModel: DEFAULT_MODEL,
    });
    throw new GeminiError("GEMINI_INVALID_MODEL", "Configured AI model is invalid. Please contact support.");
  }

  return unique;
}

type ProviderFailureKind =
  | "timeout"
  | "quota_exhausted"
  | "rate_limited"
  | "overloaded"
  | "invalid_model"
  | "missing_api_key"
  | "empty_response"
  | "parse_failure"
  | "unknown";

function getErrorStatus(error: unknown): number | undefined {
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  const status = Number(candidate?.status ?? candidate?.response?.status);
  return Number.isFinite(status) ? status : undefined;
}

function getErrorMessage(error: unknown): string {
  return String((error as { message?: string })?.message ?? "").toLowerCase();
}

function classifyProviderFailure(error: unknown): ProviderFailureKind {
  if ((error as { code?: string })?.code === "MISSING_API_KEY") return "missing_api_key";

  const status = getErrorStatus(error);
  const message = getErrorMessage(error);

  if (message.includes("timeout")) return "timeout";
  if (status === 404 && message.includes("model")) return "invalid_model";
  if (message.includes("model") && (message.includes("invalid") || message.includes("not found"))) return "invalid_model";
  if (status === 429 && (message.includes("quota") || message.includes("exhausted") || message.includes("resource_exhausted"))) return "quota_exhausted";
  if (status === 429) return "rate_limited";
  if (status === 503) return "overloaded";
  if (message.includes("api key") || message.includes("permission_denied")) return "missing_api_key";
  if (message.includes("empty response") || message.includes("empty candidate")) return "empty_response";
  if (message.includes("parse")) return "parse_failure";
  return "unknown";
}

function isRetryableFailure(kind: ProviderFailureKind): boolean {
  return kind === "timeout" || kind === "overloaded" || kind === "rate_limited";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function sendMessageWithRetry(send: () => Promise<{ response: { text: () => string; usageMetadata?: GeminiResponse["usage"] } }>, model: string) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const result = await withTimeout(send());
      console.info("[assistant] provider attempt", { model, statusClass: "success", attempt, retry: false });
      return result;
    } catch (error) {
      lastError = error;
      const kind = classifyProviderFailure(error);
      const retry = isRetryableFailure(kind) && attempt < MAX_RETRIES;
      const backoffMs = Math.min(750 * 2 ** (attempt - 1), 2500);
      console.error("[assistant] provider attempt", {
        model,
        statusClass: kind,
        attempt,
        retry,
        status: getErrorStatus(error),
      });
      if (!retry) {
        throw error;
      }
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

export async function generateAssistantReply(
  systemPrompt: string,
  history: GeminiHistoryMessage[],
  userMessage: string,
): Promise<GeminiResponse> {
  const client = getGeminiClient();
  const startedAt = Date.now();
  const modelsByPriority = resolveGeminiModelPlan();
  const invalidModels = new Set<string>();
  const failureKinds: ProviderFailureKind[] = [];

  for (const modelName of modelsByPriority) {
    if (invalidModels.has(modelName)) {
      continue;
    }

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
          maxOutputTokens: 2200,
          temperature: 0.3,
          topP: 0.8,
        },
      });
      const result = await sendMessageWithRetry(() => chat.sendMessage(userMessage), modelName);
      const response = result.response;
      const text = response.text();
      if (!text?.trim()) {
        throw new GeminiError("GEMINI_EMPTY_RESPONSE", "AI provider returned an empty response.");
      }
      return {
        text,
        model: modelName,
        usage: response.usageMetadata,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      const kind = classifyProviderFailure(error);
      failureKinds.push(kind);

      if (kind === "invalid_model") {
        invalidModels.add(modelName);
        continue;
      }

      if (kind === "quota_exhausted") {
        throw new GeminiError("GEMINI_QUOTA_EXHAUSTED", "AI Assistant quota is currently exhausted. Please try again later.");
      }

      if (kind === "missing_api_key") {
        throw new GeminiError("MISSING_API_KEY", "GEMINI_API_KEY is not configured");
      }

      if (kind === "empty_response") {
        throw new GeminiError("GEMINI_EMPTY_RESPONSE", "AI provider returned an empty response.");
      }

      if (kind === "overloaded" || kind === "rate_limited" || kind === "timeout") {
        continue;
      }
    }
  }

  if (failureKinds.length > 0 && failureKinds.every((kind) => kind === "invalid_model")) {
    throw new GeminiError("GEMINI_INVALID_MODEL", "Configured AI model is invalid. Please contact support.");
  }

  if (failureKinds.some((kind) => kind === "overloaded" || kind === "rate_limited" || kind === "timeout")) {
    throw new GeminiError("GEMINI_TEMPORARY_UNAVAILABLE", "AI Assistant is temporarily busy. Please try again shortly.");
  }

  throw new GeminiError("AI_SERVICE_UNAVAILABLE", "AI Assistant is not configured correctly. Please contact support.");
}
