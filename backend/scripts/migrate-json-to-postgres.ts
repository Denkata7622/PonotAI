import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

type AppDb = {
  users?: Array<any>;
  searchHistory?: Array<any>;
  favorites?: Array<any>;
  sharedSongs?: Array<any>;
  playlists?: Array<any>;
  sharedPlaylists?: Array<any>;
  sharedRecognitions?: Array<any>;
  achievements?: Array<any>;
  apiKeys?: Array<any>;
  trackTags?: Array<any>;
};

type LegacyHistory = Array<any>;

type Counters = Record<string, { inserted: number; skipped: number; failed: number }>;

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const execute = args.has("--execute");
  const dryRun = !execute || args.has("--dry-run");

  const cwd = process.cwd();
  const backendRoot = path.basename(cwd) === "backend" ? cwd : path.join(cwd, "backend");
  const dataDir = process.env.PONOTAI_DATA_DIR?.trim() || path.join(backendRoot, "data");

  const appDbPath = path.join(dataDir, "appdb.json");
  const legacyHistoryPath = path.join(dataDir, "history.json");

  const appdb = await readJson<AppDb>(appDbPath, {});
  const legacyHistory = await readJson<LegacyHistory>(legacyHistoryPath, []);

  const counters: Counters = {
    users: { inserted: 0, skipped: 0, failed: 0 },
    searchHistory: { inserted: 0, skipped: 0, failed: 0 },
    favorites: { inserted: 0, skipped: 0, failed: 0 },
    playlists: { inserted: 0, skipped: 0, failed: 0 },
    playlistTracks: { inserted: 0, skipped: 0, failed: 0 },
    sharedSongs: { inserted: 0, skipped: 0, failed: 0 },
    sharedPlaylists: { inserted: 0, skipped: 0, failed: 0 },
    sharedRecognitions: { inserted: 0, skipped: 0, failed: 0 },
    achievements: { inserted: 0, skipped: 0, failed: 0 },
    apiKeys: { inserted: 0, skipped: 0, failed: 0 },
    trackTags: { inserted: 0, skipped: 0, failed: 0 },
    legacyHistory: { inserted: 0, skipped: 0, failed: 0 },
  };

  console.info(`[db-migration] mode=${dryRun ? "dry-run" : "execute"}`);
  console.info(`[db-migration] input appdb=${appDbPath}`);
  console.info(`[db-migration] input history=${legacyHistoryPath}`);

  if (dryRun) {
    for (const [key, value] of Object.entries({
      users: appdb.users?.length ?? 0,
      searchHistory: appdb.searchHistory?.length ?? 0,
      favorites: appdb.favorites?.length ?? 0,
      playlists: appdb.playlists?.length ?? 0,
      playlistTracks: (appdb.playlists ?? []).reduce((sum, item) => sum + (item.songs?.length ?? 0), 0),
      sharedSongs: appdb.sharedSongs?.length ?? 0,
      sharedPlaylists: appdb.sharedPlaylists?.length ?? 0,
      sharedRecognitions: appdb.sharedRecognitions?.length ?? 0,
      achievements: appdb.achievements?.length ?? 0,
      apiKeys: appdb.apiKeys?.length ?? 0,
      trackTags: appdb.trackTags?.length ?? 0,
      legacyHistory: legacyHistory.length,
    })) {
      counters[key].skipped = value;
    }
    console.info("[db-migration] dry-run summary", counters);
    return;
  }

  const prisma = new PrismaClient();

  try {
    await prisma.$transaction(async (tx) => {
      for (const user of appdb.users ?? []) {
        try {
          const existing = await tx.user.findUnique({ where: { id: user.id } });
          if (existing) { counters.users.skipped += 1; continue; }
          await tx.user.create({ data: {
            id: user.id,
            username: user.username,
            email: String(user.email ?? "").toLowerCase(),
            passwordHash: user.passwordHash,
            role: user.role ?? "user",
            isDemo: Boolean(user.isDemo),
            avatarBase64: user.avatarBase64 ?? null,
            bio: user.bio ?? null,
            createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
          } });
          counters.users.inserted += 1;
        } catch { counters.users.failed += 1; }
      }

      for (const item of appdb.searchHistory ?? []) {
        try {
          const existing = await tx.searchHistory.findUnique({ where: { id: item.id } });
          if (existing) { counters.searchHistory.skipped += 1; continue; }
          await tx.searchHistory.create({ data: {
            id: item.id,
            userId: item.userId,
            method: item.method,
            title: item.title ?? null,
            artist: item.artist ?? null,
            album: item.album ?? null,
            coverUrl: item.coverUrl ?? null,
            recognized: Boolean(item.recognized),
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          } });
          counters.searchHistory.inserted += 1;
        } catch { counters.searchHistory.failed += 1; }
      }

      for (const item of appdb.favorites ?? []) {
        try {
          const existing = await tx.favorite.findUnique({ where: { id: item.id } });
          if (existing) { counters.favorites.skipped += 1; continue; }
          await tx.favorite.create({ data: {
            id: item.id,
            userId: item.userId,
            title: item.title,
            artist: item.artist,
            album: item.album ?? null,
            coverUrl: item.coverUrl ?? null,
            savedAt: item.savedAt ? new Date(item.savedAt) : new Date(),
          } });
          counters.favorites.inserted += 1;
        } catch { counters.favorites.failed += 1; }
      }

      for (const playlist of appdb.playlists ?? []) {
        try {
          const existing = await tx.playlist.findUnique({ where: { id: playlist.id } });
          if (!existing) {
            await tx.playlist.create({ data: {
              id: playlist.id,
              userId: playlist.userId,
              name: playlist.name,
              createdAt: playlist.createdAt ? new Date(playlist.createdAt) : new Date(),
              updatedAt: playlist.updatedAt ? new Date(playlist.updatedAt) : new Date(),
            } });
            counters.playlists.inserted += 1;
          } else {
            counters.playlists.skipped += 1;
          }
        } catch { counters.playlists.failed += 1; }

        for (const [index, song] of (playlist.songs ?? []).entries()) {
          const trackId = `${playlist.id}:${index}:${String(song.title ?? "").slice(0, 20)}`;
          try {
            const existingTrack = await tx.playlistTrack.findUnique({ where: { id: trackId } });
            if (existingTrack) { counters.playlistTracks.skipped += 1; continue; }
            await tx.playlistTrack.create({ data: {
              id: trackId,
              playlistId: playlist.id,
              title: song.title,
              artist: song.artist,
              album: song.album ?? null,
              coverUrl: song.coverUrl ?? null,
              videoId: song.videoId ?? null,
              position: index,
            } });
            counters.playlistTracks.inserted += 1;
          } catch { counters.playlistTracks.failed += 1; }
        }
      }

      for (const item of appdb.sharedSongs ?? []) {
        try {
          const existing = await tx.sharedSong.findUnique({ where: { id: item.id } });
          if (existing) { counters.sharedSongs.skipped += 1; continue; }
          await tx.sharedSong.create({ data: {
            id: item.id,
            shareCode: item.shareCode,
            userId: item.userId,
            title: item.title,
            artist: item.artist,
            album: item.album ?? null,
            coverUrl: item.coverUrl ?? null,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          } });
          counters.sharedSongs.inserted += 1;
        } catch { counters.sharedSongs.failed += 1; }
      }

      for (const item of appdb.sharedPlaylists ?? []) {
        try {
          const existing = await tx.sharedPlaylist.findUnique({ where: { id: item.id } });
          if (existing) { counters.sharedPlaylists.skipped += 1; continue; }
          await tx.sharedPlaylist.create({ data: {
            id: item.id,
            shareCode: item.shareCode,
            userId: item.userId,
            playlistId: item.playlistId,
            title: item.title,
            songCount: Number(item.songCount ?? 0),
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          } });
          counters.sharedPlaylists.inserted += 1;
        } catch { counters.sharedPlaylists.failed += 1; }
      }

      for (const item of appdb.sharedRecognitions ?? []) {
        try {
          const existing = await tx.sharedRecognition.findUnique({ where: { id: item.id } });
          if (existing) { counters.sharedRecognitions.skipped += 1; continue; }
          await tx.sharedRecognition.create({ data: {
            id: item.id,
            shareCode: item.shareCode,
            userId: item.userId,
            title: item.title,
            artist: item.artist,
            album: item.album ?? null,
            coverUrl: item.coverUrl ?? null,
            source: item.source ?? null,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          } });
          counters.sharedRecognitions.inserted += 1;
        } catch { counters.sharedRecognitions.failed += 1; }
      }

      for (const item of appdb.achievements ?? []) {
        try {
          const existing = await tx.achievement.findUnique({ where: { id: item.id } });
          if (existing) { counters.achievements.skipped += 1; continue; }
          await tx.achievement.create({ data: {
            id: item.id,
            userId: item.userId,
            key: item.key,
            unlockedAt: item.unlockedAt ? new Date(item.unlockedAt) : new Date(),
            meta: item.meta ?? null,
          } });
          counters.achievements.inserted += 1;
        } catch { counters.achievements.failed += 1; }
      }

      for (const item of appdb.apiKeys ?? []) {
        try {
          const existing = await tx.apiKey.findUnique({ where: { id: item.id } });
          if (existing) { counters.apiKeys.skipped += 1; continue; }
          await tx.apiKey.create({ data: {
            id: item.id,
            userId: item.userId,
            label: item.label,
            keyPrefix: item.keyPrefix,
            keyHash: item.keyHash,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
            lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : null,
            revokedAt: item.revokedAt ? new Date(item.revokedAt) : null,
          } });
          counters.apiKeys.inserted += 1;
        } catch { counters.apiKeys.failed += 1; }
      }

      for (const item of appdb.trackTags ?? []) {
        try {
          const existing = await tx.trackTag.findUnique({ where: { id: item.id } });
          if (existing) { counters.trackTags.skipped += 1; continue; }
          await tx.trackTag.create({ data: {
            id: item.id,
            userId: item.userId,
            trackKey: item.trackKey,
            genre: item.genre,
            mood: item.mood,
            tempo: item.tempo,
            updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
          } });
          counters.trackTags.inserted += 1;
        } catch { counters.trackTags.failed += 1; }
      }

      for (const item of legacyHistory ?? []) {
        try {
          const existing = await tx.legacyHistoryEntry.findUnique({ where: { id: item.id } });
          if (existing) { counters.legacyHistory.skipped += 1; continue; }
          await tx.legacyHistoryEntry.create({ data: {
            id: item.id,
            songName: item.songName,
            artist: item.artist,
            youtubeVideoId: item.youtubeVideoId ?? null,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          } });
          counters.legacyHistory.inserted += 1;
        } catch { counters.legacyHistory.failed += 1; }
      }
    });

    console.info("[db-migration] execute summary", counters);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[db-migration] failed", error);
  process.exit(1);
});
