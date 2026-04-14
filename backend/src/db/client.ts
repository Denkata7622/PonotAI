import { randomUUID } from "node:crypto";
import type { HistoryEntry } from "./models";
import { prisma } from "./prisma";

function toHistoryEntry(record: {
  id: string;
  songName: string;
  artist: string;
  youtubeVideoId: string | null;
  createdAt: Date;
}): HistoryEntry {
  return {
    id: record.id,
    songName: record.songName,
    artist: record.artist,
    youtubeVideoId: record.youtubeVideoId ?? undefined,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function readHistory(): Promise<HistoryEntry[]> {
  const rows = await prisma.legacyHistoryEntry.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toHistoryEntry);
}

export async function writeHistory(entries: HistoryEntry[]): Promise<void> {
  await prisma.$transaction(async (tx: any) => {
    await tx.legacyHistoryEntry.deleteMany({});
    if (entries.length === 0) return;
    await tx.legacyHistoryEntry.createMany({
      data: entries.map((entry) => ({
        id: entry.id || randomUUID(),
        songName: entry.songName,
        artist: entry.artist,
        youtubeVideoId: entry.youtubeVideoId,
        createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date(),
      })),
    });
  });
}
