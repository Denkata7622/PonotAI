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

function shouldRetry(status?: number): boolean {
  return status === 429 || status === 503;
}

function isRetryableError(error: unknown): boolean {
  const candidate = error as { status?: number; message?: string };
  const message = String(candidate?.message ?? "").toLowerCase();
  return shouldRetry(Number(candidate?.status))
    || message.includes("unavailable")
    || message.includes("overloaded");
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === maxRetries - 1) {
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[assistant] Gemini attempt ${attempt + 1} failed, retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError;
}

const MODELS_BY_PRIORITY = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-latest",
] as const;

export async function generateAssistantReply(
  systemPrompt: string,
  history: GeminiHistoryMessage[],
  userMessage: string,
): Promise<GeminiResponse> {
  const client = getGeminiClient();
  const startedAt = Date.now();
  let lastError: unknown = null;
  for (const modelName of MODELS_BY_PRIORITY) {
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
          maxOutputTokens: 400,
          temperature: 0.3,
          topP: 0.8,
        },
      });
      const result = await callWithRetry(() => chat.sendMessage(userMessage));
      const response = result.response;
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
        text: response.text(),
        model: modelName,
        usage,
        latencyMs,
      };
    } catch (error) {
      lastError = error;
      console.error(`[assistant] Model ${modelName} failed:`, (error as Error)?.message ?? String(error));
      if (modelName !== MODELS_BY_PRIORITY[MODELS_BY_PRIORITY.length - 1]) {
        console.info("[assistant] Trying next Gemini model...");
      }
    }
  }

  const status = Number((lastError as { status?: number } | null)?.status);
  if (isRetryableError(lastError)) {
    throw new GeminiError("GEMINI_TEMPORARY_UNAVAILABLE", "Gemini service is temporarily unavailable");
  }
  throw new GeminiError(
    `GEMINI_${status || "UNKNOWN"}`,
    (lastError as Error)?.message || "Gemini request failed",
  );
}
