import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { startTestServer } from "./helpers/testHarness.ts";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();

async function resetDatabase(databaseUrl: string): Promise<void> {
  execSync("npm run prisma:migrate:deploy", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await prisma.$transaction([
      prisma.sharedPlaylist.deleteMany(),
      prisma.sharedRecognition.deleteMany(),
      prisma.sharedSong.deleteMany(),
      prisma.playlistTrack.deleteMany(),
      prisma.playlist.deleteMany(),
      prisma.favorite.deleteMany(),
      prisma.searchHistory.deleteMany(),
      prisma.achievement.deleteMany(),
      prisma.apiKey.deleteMany(),
      prisma.trackTag.deleteMany(),
      prisma.user.deleteMany(),
      prisma.legacyHistoryEntry.deleteMany(),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}

test("postgres core runtime flows are persisted end-to-end", { timeout: 120_000 }, async (t) => {
  if (!TEST_DATABASE_URL) {
    t.skip("Set TEST_DATABASE_URL to run PostgreSQL end-to-end runtime validation.");
    return;
  }

  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  await resetDatabase(TEST_DATABASE_URL);

  const running = await startTestServer({ persistenceMode: "postgres" });

  try {
    const unique = `pg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const email = `${unique}@test.dev`;
    const password = "password123";
    const username = unique.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
    const registerResponse = await fetch(`${running.baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    assert.equal(registerResponse.status, 201);
    const registerBody = (await registerResponse.json()) as { token: string };
    const userToken = registerBody.token;

    const loginResponse = await fetch(`${running.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(loginResponse.status, 200);

    const meResponse = await fetch(`${running.baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.equal(meResponse.status, 200);

    const historyWrite = await fetch(`${running.baseUrl}/api/history`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ method: "manual", title: "Numb", artist: "Linkin Park", album: "Meteora" }),
    });
    assert.equal(historyWrite.status, 201);

    const historyRead = await fetch(`${running.baseUrl}/api/history`, {
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.equal(historyRead.status, 200);
    const historyBody = (await historyRead.json()) as { items: Array<{ title?: string }> };
    assert.equal(historyBody.items.some((item) => item.title === "Numb"), true);

    const favoriteWrite = await fetch(`${running.baseUrl}/api/favorites`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ title: "Numb", artist: "Linkin Park", album: "Meteora" }),
    });
    assert.equal(favoriteWrite.status, 201);

    const favoriteRead = await fetch(`${running.baseUrl}/api/favorites`, {
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.equal(favoriteRead.status, 200);
    const favoriteBody = (await favoriteRead.json()) as { items: Array<{ title: string }> };
    assert.equal(favoriteBody.items.some((item) => item.title === "Numb"), true);

    const playlistCreate = await fetch(`${running.baseUrl}/api/playlists`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ name: "Postgres Playlist" }),
    });
    assert.equal(playlistCreate.status, 201);
    const playlist = (await playlistCreate.json()) as { id: string };

    const playlistAddSong = await fetch(`${running.baseUrl}/api/playlists/${playlist.id}/songs`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ title: "In the End", artist: "Linkin Park" }),
    });
    assert.equal(playlistAddSong.status, 200);

    const sharePlaylist = await fetch(`${running.baseUrl}/api/share/playlist/${playlist.id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.equal(sharePlaylist.status, 201);
    const sharedPlaylistPayload = (await sharePlaylist.json()) as { shareCode: string };

    const shareSong = await fetch(`${running.baseUrl}/api/share/song`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ title: "Numb", artist: "Linkin Park" }),
    });
    assert.equal(shareSong.status, 201);

    const shareRecognition = await fetch(`${running.baseUrl}/api/share/recognition`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ title: "Numb", artist: "Linkin Park", source: "test" }),
    });
    assert.equal(shareRecognition.status, 201);

    const sharedPlaylistRead = await fetch(`${running.baseUrl}/api/share/${sharedPlaylistPayload.shareCode}`);
    assert.equal(sharedPlaylistRead.status, 200);

    const libraryReport = await fetch(`${running.baseUrl}/api/library/report`, {
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.equal(libraryReport.status, 200);

    const achievements = await fetch(`${running.baseUrl}/api/achievements`, {
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.equal(achievements.status, 200);
    const achievementsBody = (await achievements.json()) as { items: Array<{ key: string }> };
    assert.equal(achievementsBody.items.some((item) => item.key === "first_playlist"), true);

    const keyCreate = await fetch(`${running.baseUrl}/api/developer/keys`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ label: "PG Key" }),
    });
    assert.equal(keyCreate.status, 201);

    const keyList = await fetch(`${running.baseUrl}/api/developer/keys`, {
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.equal(keyList.status, 200);

    const health = await fetch(`${running.baseUrl}/api/health`);
    const healthBody = (await health.json()) as { persistence: { runtime: string; mode: string } };
    assert.equal(health.status, 200);
    assert.equal(healthBody.persistence.runtime, "postgresql");
    assert.equal(healthBody.persistence.mode, "postgres");
  } finally {
    await running.close();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
