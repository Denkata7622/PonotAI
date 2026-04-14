import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testHarness.ts";

type StandardError = {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
};

function assertStandardErrorShape(body: unknown): asserts body is StandardError {
  assert.equal(typeof body, "object");
  assert.ok(body !== null);
  const asRecord = body as Record<string, unknown>;
  assert.equal(typeof asRecord.code, "string");
  assert.equal(typeof asRecord.message, "string");

  const allowedKeys = new Set(["code", "message", "details", "requestId"]);
  for (const key of Object.keys(asRecord)) {
    assert.ok(allowedKeys.has(key), `Unexpected key in error payload: ${key}`);
  }

  if ("requestId" in asRecord && asRecord.requestId !== undefined) {
    assert.equal(typeof asRecord.requestId, "string");
  }
}

test("API returns standard error shape for common failures", async () => {
  const running = await startTestServer();

  try {
    const cases: Array<{ name: string; run: () => Promise<Response>; status: number; code: string; requestId?: string }> = [
      {
        name: "auth register validation",
        run: () =>
          fetch(`${running.baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-request-id": "req-auth-register-1" },
            body: JSON.stringify({ username: "x", email: "valid@example.com", password: "password123" }),
          }),
        status: 400,
        code: "INVALID_USERNAME",
        requestId: "req-auth-register-1",
      },
      { name: "favorites unauthorized", run: () => fetch(`${running.baseUrl}/api/favorites`), status: 401, code: "UNAUTHORIZED" },
      { name: "share lookup missing", run: () => fetch(`${running.baseUrl}/api/share/not-a-real-code`), status: 404, code: "NOT_FOUND" },
      {
        name: "history guest unauthorized",
        run: () => fetch(`${running.baseUrl}/api/history`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }),
        status: 401,
        code: "UNAUTHORIZED",
      },
      {
        name: "recognition audio missing file",
        run: () => fetch(`${running.baseUrl}/api/recognition/audio`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }),
        status: 400,
        code: "AUDIO_FILE_REQUIRED",
      },
      { name: "playlists unauthorized", run: () => fetch(`${running.baseUrl}/api/playlists`), status: 401, code: "UNAUTHORIZED" },
      { name: "library unauthorized", run: () => fetch(`${running.baseUrl}/api/library`), status: 401, code: "UNAUTHORIZED" },
    ];

    for (const scenario of cases) {
      const response = await scenario.run();
      assert.equal(response.status, scenario.status, `${scenario.name} status mismatch`);
      const body = (await response.json()) as unknown;
      assertStandardErrorShape(body);
      assert.equal(body.code, scenario.code, `${scenario.name} code mismatch`);
      if (scenario.requestId) {
        assert.equal(body.requestId, scenario.requestId, `${scenario.name} request id mismatch`);
      }
    }
  } finally {
    await running.close();
  }
});
