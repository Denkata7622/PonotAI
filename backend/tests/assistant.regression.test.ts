import test from "node:test";
import assert from "node:assert/strict";
import { registerUser, startTestServer } from "./helpers/testHarness.ts";

async function seed(baseUrl: string, token: string): Promise<void> {
  await fetch(`${baseUrl}/api/history`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ method: "manual", title: "Regression Song", artist: "Regression Artist", recognized: true }),
  });
}

async function playlistCount(baseUrl: string, token: string): Promise<number> {
  const response = await fetch(`${baseUrl}/api/playlists`, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json() as { playlists: unknown[] };
  return body.playlists.length;
}

test("assistant regression: preview/suggestion endpoints are read-only and confirmed save is scoped", async () => {
  const running = await startTestServer();
  try {
    const user = await registerUser(running.baseUrl, "assistant-regression");
    await seed(running.baseUrl, user.token);
    const beforePlaylists = await playlistCount(running.baseUrl, user.token);

    const preview = await fetch(`${running.baseUrl}/api/ai/playlists/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ prompt: "focus playlist" }),
    });
    assert.equal(preview.status, 200);
    const previewBody = await preview.json() as { saved: boolean };
    assert.equal(previewBody.saved, false);
    assert.equal(await playlistCount(running.baseUrl, user.token), beforePlaylists);

    const mood = await fetch(`${running.baseUrl}/api/ai/recommendations/mood?mood=focus`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(mood.status, 200);
    assert.equal(await playlistCount(running.baseUrl, user.token), beforePlaylists);

    const discovery = await fetch(`${running.baseUrl}/api/ai/discovery/daily`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(discovery.status, 200);
    assert.equal(await playlistCount(running.baseUrl, user.token), beforePlaylists);

    const confirmed = await fetch(`${running.baseUrl}/api/ai/playlists/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ prompt: "focus playlist", confirmed: true }),
    });
    assert.equal(confirmed.status, 200);
    assert.equal(await playlistCount(running.baseUrl, user.token), beforePlaylists + 1);
  } finally {
    await running.close();
  }
});
