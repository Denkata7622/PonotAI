import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "./helpers/testHarness.ts";
import { __setGeminiClientFactoryForTests } from "../src/services/assistant/geminiClient.ts";
import { getTrackTags } from "../src/db/authStore.ts";

async function seedLibrary(baseUrl: string, token: string): Promise<void> {
  await fetch(`${baseUrl}/api/history`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ method: "manual", title: "Track One", artist: "Artist One", recognized: true }),
  });
  await fetch(`${baseUrl}/api/favorites`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: "Track One", artist: "Artist One" }),
  });
  const playlistRes = await fetch(`${baseUrl}/api/playlists`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Safety Playlist" }),
  });
  assert.equal(playlistRes.status, 201);
}

async function libraryCounts(baseUrl: string, token: string): Promise<{ playlists: number; favorites: number; history: number }> {
  const [playlistsRes, favoritesRes, historyRes] = await Promise.all([
    fetch(`${baseUrl}/api/playlists`, { headers: { authorization: `Bearer ${token}` } }),
    fetch(`${baseUrl}/api/favorites`, { headers: { authorization: `Bearer ${token}` } }),
    fetch(`${baseUrl}/api/history`, { headers: { authorization: `Bearer ${token}` } }),
  ]);
  const playlists = await playlistsRes.json() as { playlists: unknown[] };
  const favorites = await favoritesRes.json() as { items: unknown[] };
  const history = await historyRes.json() as { items: unknown[] };
  return { playlists: playlists.playlists.length, favorites: favorites.items.length, history: history.items.length };
}

test("assistant chat and intent parsing are read-only for library collections", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "gemini-2.5-flash";
  __setGeminiClientFactoryForTests(() => ({
    getGenerativeModel: () => ({
      startChat: () => ({
        sendMessage: async () => ({
          response: {
            text: () => "Switching theme now.<action>{\"type\":\"CHANGE_THEME\",\"requiresConfirmation\":true,\"payload\":{\"theme\":\"dark\"}}</action>",
          },
        }),
      }),
    }),
  }) as never);

  const running = await startTestServer();
  try {
    const user = await registerUser(running.baseUrl, "assistant-readonly");
    await seedLibrary(running.baseUrl, user.token);
    const before = await libraryCounts(running.baseUrl, user.token);

    const assistantRes = await fetch(`${running.baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ message: "change theme to dark", conversation: [] }),
    });
    assert.equal(assistantRes.status, 200);

    const after = await libraryCounts(running.baseUrl, user.token);
    assert.deepEqual(after, before);
  } finally {
    __setGeminiClientFactoryForTests(null);
    await running.close();
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_API_KEY;
  }
});

test("tag suggestion is read-only and malformed tag apply payload is rejected", async () => {
  const running = await startTestServer();
  try {
    const user = await registerUser(running.baseUrl, "assistant-tags");
    await seedLibrary(running.baseUrl, user.token);

    const suggest = await fetch(`${running.baseUrl}/api/ai/tags/suggest`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
    });
    assert.equal(suggest.status, 200);
    assert.equal((await getTrackTags(user.userId)).length, 0);

    const malformedApply = await fetch(`${running.baseUrl}/api/ai/tags/apply`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ confirmed: true, tags: [] }),
    });
    assert.equal(malformedApply.status, 400);
    assert.equal((await getTrackTags(user.userId)).length, 0);
  } finally {
    await running.close();
  }
});

test("library sync rejects malformed payload and non-destructive confirmed actions stay scoped", async () => {
  const running = await startTestServer();
  try {
    const user = await registerUser(running.baseUrl, "assistant-sync");
    await seedLibrary(running.baseUrl, user.token);
    const before = await libraryCounts(running.baseUrl, user.token);

    const malformedSync = await fetch(`${running.baseUrl}/api/library/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ playlists: [{ id: "bad" }] }),
    });
    assert.equal(malformedSync.status, 400);
    assert.deepEqual(await libraryCounts(running.baseUrl, user.token), before);

    const apply = await fetch(`${running.baseUrl}/api/ai/tags/apply`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({
        confirmed: true,
        tags: [{ trackKey: "track one|||artist one", genre: "rock", mood: "focus", tempo: "medium" }],
      }),
    });
    assert.equal(apply.status, 200);
    const after = await libraryCounts(running.baseUrl, user.token);
    assert.deepEqual(after, before);
    assert.equal((await getTrackTags(user.userId)).length, 1);
  } finally {
    await running.close();
  }
});
