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

export async function generateAssistantReply(
  systemPrompt: string,
  history: GeminiHistoryMessage[],
  userMessage: string,
): Promise<GeminiResponse> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.0-flash",
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
    systemInstruction: systemPrompt,
  });

  const startedAt = Date.now();
  let attempt = 0;

  while (attempt < 3) {
    attempt += 1;

    try {
      const chat = model.startChat({
        history,
        generationConfig: {
          maxOutputTokens: 400,
          temperature: 0.3,
          topP: 0.8,
        },
      });
      const result = await chat.sendMessage(userMessage);
      const response = result.response;
      const latencyMs = Date.now() - startedAt;
      const usage = response.usageMetadata;
      console.info("[assistant]", {
        model: "gemini-2.0-flash",
        latencyMs,
        promptTokenCount: usage?.promptTokenCount,
        candidatesTokenCount: usage?.candidatesTokenCount,
        totalTokenCount: usage?.totalTokenCount,
      });

      return {
        text: response.text(),
        model: "gemini-2.0-flash",
        usage,
        latencyMs,
      };
    } catch (error) {
      const status = Number((error as { status?: number }).status);
      if (shouldRetry(status) && attempt < 3) {
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }

      if (shouldRetry(status)) {
        throw new GeminiError("GEMINI_TEMPORARY_UNAVAILABLE", "Gemini service is temporarily unavailable");
      }

      throw new GeminiError(
        `GEMINI_${status || "UNKNOWN"}`,
        (error as Error)?.message || "Gemini request failed",
      );
    }
  }

  throw new GeminiError("GEMINI_UNKNOWN", "Gemini request failed");
}
