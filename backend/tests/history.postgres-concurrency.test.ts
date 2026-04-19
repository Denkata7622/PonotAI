import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { startTestServer, registerUser } from "./helpers/testHarness.ts";

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

test("postgres history writes remain stable under overlapping requests", { timeout: 120_000 }, async (t) => {
  if (!TEST_DATABASE_URL) {
    t.skip("Set TEST_DATABASE_URL to run PostgreSQL history concurrency validation.");
    return;
  }

  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  await resetDatabase(TEST_DATABASE_URL);
  const running = await startTestServer({ persistenceMode: "postgres" });
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

  try {
    const user = await registerUser(running.baseUrl, "history-concurrency");
    const tokenHeader = { "content-type": "application/json", authorization: `Bearer ${user.token}` };

    const writes = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        fetch(`${running.baseUrl}/api/history`, {
          method: "POST",
          headers: tokenHeader,
          body: JSON.stringify({
            method: "manual",
            title: `Concurrent Song ${index}`,
            artist: "Overlap Bot",
            recognized: true,
          }),
        })),
    );

    for (const response of writes) {
      assert.equal(response.status, 201);
    }

    const legacyCount = await prisma.legacyHistoryEntry.count();
    assert.equal(legacyCount, 12);
  } finally {
    await prisma.$disconnect();
    await running.close();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
