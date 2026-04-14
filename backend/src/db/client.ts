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
    const uniqueEntries = Array.from(
      new Map(entries.map((entry) => [entry.id || randomUUID(), entry])).values(),
    );
    await tx.legacyHistoryEntry.createMany({
      data: uniqueEntries.map((entry) => ({
        id: entry.id || randomUUID(),
        songName: entry.songName,
        artist: entry.artist,
        youtubeVideoId: entry.youtubeVideoId,
        createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date(),
      })),
      skipDuplicates: true,
    });
  });
}

export async function appendHistoryEntry(input: {
  songName: string;
  artist: string;
  youtubeVideoId?: string;
  createdAt?: string;
}): Promise<HistoryEntry> {
  return prisma.$transaction(async (tx: any) => {
    const created = await tx.legacyHistoryEntry.create({
      data: {
        id: randomUUID(),
        songName: input.songName,
        artist: input.artist,
        youtubeVideoId: input.youtubeVideoId,
        createdAt: input.createdAt ? new Date(input.createdAt) : new Date(),
      },
    });

    const overflow = await tx.legacyHistoryEntry.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 200,
      select: { id: true },
    });

    if (overflow.length > 0) {
      await tx.legacyHistoryEntry.deleteMany({
        where: { id: { in: overflow.map((entry: { id: string }) => entry.id) } },
      });
    }

    return toHistoryEntry(created);
  });
}
