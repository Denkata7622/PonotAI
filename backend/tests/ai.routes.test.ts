import test from "node:test";
import assert from "node:assert/strict";
import { registerUser, startTestServer } from "./helpers/testHarness.ts";

async function seedHistory(baseUrl: string, token: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/history`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ method: "audio-file", title: "Indie Nights", artist: "The Echoes", album: "Late Lights", recognized: true }),
  });
  assert.equal(response.status, 201);
}

test("ai insights and playlist generation require auth and confirmation", async () => {
  const running = await startTestServer();
  try {
    const unauthorized = await fetch(`${running.baseUrl}/api/ai/insights/weekly`);
    assert.equal(unauthorized.status, 401);

    const user = await registerUser(running.baseUrl, "ai-insights");
    await seedHistory(running.baseUrl, user.token);

    const weekly = await fetch(`${running.baseUrl}/api/ai/insights/weekly`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(weekly.status, 200);
    const weeklyBody = await weekly.json() as { totalPlays: number; favoriteGenres: Array<{ name: string }> };
    assert.equal(weeklyBody.totalPlays, 1);
    assert.ok(Array.isArray(weeklyBody.favoriteGenres));

    const preview = await fetch(`${running.baseUrl}/api/ai/playlists/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ prompt: "Create a focus mix" }),
    });
    assert.equal(preview.status, 200);
    const previewBody = await preview.json() as { confirmationRequired: boolean; saved: boolean };
    assert.equal(previewBody.confirmationRequired, true);
    assert.equal(previewBody.saved, false);
  } finally {
    await running.close();
  }
});
