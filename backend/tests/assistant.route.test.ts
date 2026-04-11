import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "./helpers/testHarness.ts";
import { __setGeminiClientFactoryForTests } from "../src/services/assistant/geminiClient.ts";

type FakeError = Error & { status?: number };

function providerError(status: number, message: string): FakeError {
  const error = new Error(message) as FakeError;
  error.status = status;
  return error;
}

async function seedHistory(baseUrl: string, token: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/history`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ method: "audio-file", title: "Song", artist: "Artist", recognized: true }),
  });
  assert.equal(response.status, 201);
}

test("assistant route returns structured 503 when quota is exhausted", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "gemini-2.5-flash";

  __setGeminiClientFactoryForTests(() => ({
    getGenerativeModel: () => ({
      startChat: () => ({
        sendMessage: async () => {
          throw providerError(429, "resource_exhausted quota exceeded");
        },
      }),
    }),
  }) as never);

  const running = await startTestServer();
  try {
    const user = await registerUser(running.baseUrl, "assistant-quota");
    await seedHistory(running.baseUrl, user.token);

    const response = await fetch(`${running.baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ message: "recommend", conversation: [] }),
    });
    assert.equal(response.status, 503);
    const body = (await response.json()) as { code: string; message: string };
    assert.equal(body.code, "AI_SERVICE_UNAVAILABLE");
    assert.match(body.message, /quota is currently exhausted/i);
  } finally {
    __setGeminiClientFactoryForTests(null);
    await running.close();
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_API_KEY;
  }
});

test("assistant route returns structured 503 when configured model is invalid", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "gemini-1.5-flash";

  const running = await startTestServer();
  try {
    const user = await registerUser(running.baseUrl, "assistant-model");
    await seedHistory(running.baseUrl, user.token);

    const response = await fetch(`${running.baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ message: "recommend", conversation: [] }),
    });
    assert.equal(response.status, 503);
    const body = (await response.json()) as { code: string; message: string };
    assert.equal(body.code, "AI_SERVICE_UNAVAILABLE");
    assert.match(body.message, /not configured correctly/i);
  } finally {
    await running.close();
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_API_KEY;
  }
});
