import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export async function resetPostgresTestDatabase(databaseUrl: string): Promise<void> {
  try {
    execFileSync(process.execPath, [
      path.join(process.cwd(), "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "deploy",
      "--schema",
      path.join(process.cwd(), "prisma", "schema.prisma"),
    ], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
  } catch (error) {
    const details = error as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const output = [
      details.stdout?.toString("utf8").trim(),
      details.stderr?.toString("utf8").trim(),
    ].filter(Boolean).join("\n");
    throw new Error(`Could not migrate the PostgreSQL test database from TEST_DATABASE_URL. ${output || details.message || ""}`.trim());
  }

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await prisma.$transaction([
      prisma.emailVerificationToken.deleteMany(),
      prisma.musicPackDrop.deleteMany(),
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
      prisma.songTasteQueue.deleteMany(),
      prisma.songTaste.deleteMany(),
      prisma.legacyHistoryEntry.deleteMany(),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}
