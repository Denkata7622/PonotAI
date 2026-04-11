import test from "node:test";
import assert from "node:assert/strict";
import { GeminiError } from "../src/types/assistant.ts";
import {
  __setGeminiClientFactoryForTests,
  generateAssistantReply,
  resolveGeminiModelPlan,
} from "../src/services/assistant/geminiClient.ts";

type FakeError = Error & { status?: number };

function providerError(status: number, message: string): FakeError {
  const error = new Error(message) as FakeError;
  error.status = status;
  return error;
}

test("invalid model is not retried and falls back to next model", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "gemini-2.5-flash";

  const attempts: Record<string, number> = {};
  __setGeminiClientFactoryForTests(() => ({
    getGenerativeModel: ({ model }: { model: string }) => ({
      startChat: () => ({
        sendMessage: async () => {
          attempts[model] = (attempts[model] ?? 0) + 1;
          if (model === "gemini-2.5-flash") {
            throw providerError(404, "invalid model");
          }
          return {
            response: {
              text: () => "fallback worked",
              usageMetadata: {},
            },
          };
        },
      }),
    }),
  }) as never);

  try {
    const reply = await generateAssistantReply("sys", [], "hello");
    assert.equal(reply.model, "gemini-2.0-flash");
    assert.equal(attempts["gemini-2.5-flash"], 1);
    assert.equal(attempts["gemini-2.0-flash"], 1);
  } finally {
    __setGeminiClientFactoryForTests(null);
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
  }
});

test("quota exhausted maps to GEMINI_QUOTA_EXHAUSTED without aggressive retries", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "gemini-2.5-flash";

  let calls = 0;
  __setGeminiClientFactoryForTests(() => ({
    getGenerativeModel: () => ({
      startChat: () => ({
        sendMessage: async () => {
          calls += 1;
          throw providerError(429, "resource_exhausted quota exceeded");
        },
      }),
    }),
  }) as never);

  try {
    await assert.rejects(() => generateAssistantReply("sys", [], "hello"), (error: unknown) => {
      assert.equal((error as GeminiError).code, "GEMINI_QUOTA_EXHAUSTED");
      return true;
    });
    assert.equal(calls, 1);
  } finally {
    __setGeminiClientFactoryForTests(null);
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
  }
});

test("invalid configured model fails fast during model plan resolution", () => {
  process.env.GEMINI_MODEL = "gemini-1.5-flash";
  assert.throws(() => resolveGeminiModelPlan(), (error: unknown) => {
    assert.equal((error as GeminiError).code, "GEMINI_INVALID_MODEL");
    return true;
  });
  delete process.env.GEMINI_MODEL;
});
