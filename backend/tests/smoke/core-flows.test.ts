import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "../helpers/testHarness.ts";

test("backend smoke: startup and core flows by persistence mode", async () => {
  const running = await startTestServer();

  try {
    const healthResponse = await fetch(`${running.baseUrl}/health`);
    assert.equal(healthResponse.status, 200);

    const apiHealthResponse = await fetch(`${running.baseUrl}/api/health`);
    assert.equal(apiHealthResponse.status, 200);
    const apiHealthBody = (await apiHealthResponse.json()) as {
      status: string;
      persistence: { mode: "postgres" | "file-legacy"; status: string };
    };
    assert.equal(apiHealthBody.status, "ok");
    assert.equal(apiHealthBody.persistence.mode, running.persistenceMode);
    assert.equal(apiHealthBody.persistence.status, "ready");

    const recognitionValidationResponse = await fetch(`${running.baseUrl}/api/recognition/audio`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "standard" }),
    });
    assert.equal(recognitionValidationResponse.status, 400);
    const recognitionError = (await recognitionValidationResponse.json()) as { code: string };
    assert.equal(recognitionError.code, "AUDIO_FILE_REQUIRED");

    if (running.persistenceMode !== "postgres") {
      return;
    }

    const user = await registerUser(running.baseUrl, "smoke-user");

    const meResponse = await fetch(`${running.baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(meResponse.status, 200);
    const meBody = (await meResponse.json()) as { user: { id: string; email: string } };
    assert.equal(meBody.user.id, user.userId);

    const assistantResponse = await fetch(`${running.baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ message: "recommend something", conversation: [] }),
    });
    assert.equal(assistantResponse.status, 503);
    const assistantBody = (await assistantResponse.json()) as { code: string };
    assert.equal(assistantBody.code, "AI_SERVICE_UNAVAILABLE");

    const createPlaylistResponse = await fetch(`${running.baseUrl}/api/playlists`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ name: "Smoke Playlist" }),
    });
    assert.equal(createPlaylistResponse.status, 201);
    const playlist = (await createPlaylistResponse.json()) as { id: string };

    const addSongResponse = await fetch(`${running.baseUrl}/api/playlists/${playlist.id}/songs`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ title: "Numb", artist: "Linkin Park" }),
    });
    assert.equal(addSongResponse.status, 200);

    const shareResponse = await fetch(`${running.baseUrl}/api/share/playlist/${playlist.id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(shareResponse.status, 201);
    const shareBody = (await shareResponse.json()) as { shareCode: string };

    const sharedReadResponse = await fetch(`${running.baseUrl}/api/share/${shareBody.shareCode}`);
    assert.equal(sharedReadResponse.status, 200);
    const sharedPayload = (await sharedReadResponse.json()) as { type: string; songs?: unknown[] };
    assert.equal(sharedPayload.type, "playlist");
    assert.ok(Array.isArray(sharedPayload.songs));

    const achievementsResponse = await fetch(`${running.baseUrl}/api/achievements`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(achievementsResponse.status, 200);
    const achievementsBody = (await achievementsResponse.json()) as { items: Array<{ key: string }> };
    assert.ok(achievementsBody.items.some((achievement) => achievement.key === "first_playlist"));

    const createApiKeyResponse = await fetch(`${running.baseUrl}/api/developer/keys`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ label: "Smoke key" }),
    });
    assert.equal(createApiKeyResponse.status, 201);

    const adminProtectedResponse = await fetch(`${running.baseUrl}/api/admin/overview`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(adminProtectedResponse.status, 403);
  } finally {
    await running.close();
  }
});
