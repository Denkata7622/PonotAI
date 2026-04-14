import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "./helpers/testHarness.ts";

async function addHistory(baseUrl: string, token: string, payload: { title: string; artist: string; createdAt?: string }) {
  const response = await fetch(`${baseUrl}/api/history`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ method: "assistant", recognized: true, ...payload }),
  });
  assert.equal(response.status, 201);
}

test("assistant context exposes deeper trend and favorites behavior signals", async () => {
  const running = await startTestServer();
  process.env.GEMINI_API_KEY = "test-key";
  try {
    const user = await registerUser(running.baseUrl, "ctx-analysis");
    await addHistory(running.baseUrl, user.token, { title: "Track A", artist: "Artist One" });
    await addHistory(running.baseUrl, user.token, { title: "Track B", artist: "Artist One" });
    await addHistory(running.baseUrl, user.token, { title: "Track C", artist: "Artist Two" });

    const favoriteResponse = await fetch(`${running.baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ title: "Old Fav", artist: "Forgotten Artist" }),
    });
    assert.equal(favoriteResponse.status, 201);

    const contextResponse = await fetch(`${running.baseUrl}/api/assistant/context`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(contextResponse.status, 200);
    const context = await contextResponse.json() as {
      stats?: {
        tasteShifts?: { artistShiftSummary: string };
        listeningWindows?: { strongestWindow: string; strongestWindowShare: number };
        favoritesBehavior?: { underusedCount: number; underusedFavorites: Array<{ artist: string }> };
      };
    };

    assert.equal(typeof context.stats?.tasteShifts?.artistShiftSummary, "string");
    assert.ok(context.stats?.listeningWindows?.strongestWindow);
    assert.equal(typeof context.stats?.listeningWindows?.strongestWindowShare, "number");
    assert.equal(typeof context.stats?.favoritesBehavior?.underusedCount, "number");
    assert.ok(Array.isArray(context.stats?.favoritesBehavior?.underusedFavorites));
  } finally {
    await running.close();
    delete process.env.GEMINI_API_KEY;
  }
});
