import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testHarness.ts";

async function register(baseUrl: string, username: string, email: string) {
  return fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email, password: "password123" }),
  });
}

test("admin ai observability endpoint returns concise grounded metrics", async () => {
  process.env.ADMIN_EMAIL = "admin+aiobs@test.dev";
  const running = await startTestServer();

  try {
    const registerResponse = await register(running.baseUrl, "ai_obs_admin", "admin+aiobs@test.dev");
    assert.equal(registerResponse.status, 201);
    const registerBody = (await registerResponse.json()) as { token: string };

    const response = await fetch(`${running.baseUrl}/api/admin/ai-observability`, {
      headers: { authorization: `Bearer ${registerBody.token}` },
    });
    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      assistant: { available: boolean; mode: string; requestsLast7d: number };
      providerStatus: Record<string, boolean>;
      recommendationSignals: { uniqueArtistsLast7d: number; themeActionSignalsLast7d: number };
    };

    assert.equal(typeof body.assistant.available, "boolean");
    assert.equal(typeof body.assistant.mode, "string");
    assert.equal(typeof body.assistant.requestsLast7d, "number");
    assert.equal(typeof body.providerStatus.gemini, "boolean");
    assert.equal(typeof body.recommendationSignals.uniqueArtistsLast7d, "number");
    assert.equal(typeof body.recommendationSignals.themeActionSignalsLast7d, "number");
  } finally {
    await running.close();
    delete process.env.ADMIN_EMAIL;
  }
});
