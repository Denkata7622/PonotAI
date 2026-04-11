import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "./helpers/testHarness.ts";

test("feature expansion flow: playlist share + achievements", async () => {
  const running = await startTestServer();

  try {
    const user = await registerUser(running.baseUrl, "feature");

    const playlistRes = await fetch(`${running.baseUrl}/api/playlists`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ name: "Road Trip" }),
    });
    assert.equal(playlistRes.status, 201);
    const playlist = (await playlistRes.json()) as { id: string };

    const addSongRes = await fetch(`${running.baseUrl}/api/playlists/${playlist.id}/songs`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ title: "Numb", artist: "Linkin Park" }),
    });
    assert.equal(addSongRes.status, 200);

    const shareRes = await fetch(`${running.baseUrl}/api/share/playlist/${playlist.id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(shareRes.status, 201);
    const sharePayload = (await shareRes.json()) as { shareCode: string };

    const sharedRead = await fetch(`${running.baseUrl}/api/share/${sharePayload.shareCode}`);
    assert.equal(sharedRead.status, 200);
    const sharedBody = (await sharedRead.json()) as { type: string; songs?: unknown[] };
    assert.equal(sharedBody.type, "playlist");
    assert.ok(Array.isArray(sharedBody.songs));
    assert.ok(sharedBody.songs.length > 0);

    const achievementsRes = await fetch(`${running.baseUrl}/api/achievements`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(achievementsRes.status, 200);
    const achievementsPayload = (await achievementsRes.json()) as { items: Array<{ key: string }> };
    assert.ok(achievementsPayload.items.some((item) => item.key === "first_playlist"));
  } finally {
    await running.close();
  }
});
