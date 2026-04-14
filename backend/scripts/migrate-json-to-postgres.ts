import fs from "node:fs/promises";
import path from "node:path";

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

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

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
  const cwd = process.cwd();

  if (args.has("--execute")) {
    console.error("[db-migration] --execute is no longer supported. This tool only emits SQL for manual review/execution.");
    process.exit(1);
  }

  const backendRoot = path.basename(cwd) === "backend" ? cwd : path.join(cwd, "backend");
  const dataDir = process.env.PONOTAI_DATA_DIR?.trim() || path.join(backendRoot, "data");
  const appDbPath = path.join(dataDir, "appdb.json");
  const legacyHistoryPath = path.join(dataDir, "history.json");

  const appdb = await readJson<AppDb>(appDbPath, {});
  const legacyHistory = await readJson<LegacyHistory>(legacyHistoryPath, []);

  const statements: string[] = ["BEGIN;"];
  const counters = {
    users: 0,
    searchHistory: 0,
    favorites: 0,
    playlists: 0,
    playlistTracks: 0,
    sharedSongs: 0,
    sharedPlaylists: 0,
    sharedRecognitions: 0,
    achievements: 0,
    apiKeys: 0,
    trackTags: 0,
    legacyHistory: 0,
  };

  for (const user of appdb.users ?? []) {
    statements.push(`INSERT INTO "User" ("id","username","email","passwordHash","role","isDemo","avatarBase64","bio","createdAt") VALUES (${sqlValue(user.id)},${sqlValue(user.username)},${sqlValue((user.email ?? "").toLowerCase())},${sqlValue(user.passwordHash)},${sqlValue(user.role ?? "user")},${sqlValue(Boolean(user.isDemo))},${sqlValue(user.avatarBase64)},${sqlValue(user.bio)},${sqlValue(user.createdAt)}) ON CONFLICT ("id") DO NOTHING;`);
    counters.users += 1;
  }

  for (const item of appdb.searchHistory ?? []) {
    statements.push(`INSERT INTO "SearchHistory" ("id","userId","method","title","artist","album","coverUrl","recognized","createdAt") VALUES (${sqlValue(item.id)},${sqlValue(item.userId)},${sqlValue(item.method)},${sqlValue(item.title)},${sqlValue(item.artist)},${sqlValue(item.album)},${sqlValue(item.coverUrl)},${sqlValue(Boolean(item.recognized))},${sqlValue(item.createdAt)}) ON CONFLICT ("id") DO NOTHING;`);
    counters.searchHistory += 1;
  }

  for (const item of appdb.favorites ?? []) {
    statements.push(`INSERT INTO "Favorite" ("id","userId","title","artist","album","coverUrl","savedAt") VALUES (${sqlValue(item.id)},${sqlValue(item.userId)},${sqlValue(item.title)},${sqlValue(item.artist)},${sqlValue(item.album)},${sqlValue(item.coverUrl)},${sqlValue(item.savedAt)}) ON CONFLICT ("id") DO NOTHING;`);
    counters.favorites += 1;
  }

  for (const playlist of appdb.playlists ?? []) {
    statements.push(`INSERT INTO "Playlist" ("id","userId","name","createdAt","updatedAt") VALUES (${sqlValue(playlist.id)},${sqlValue(playlist.userId)},${sqlValue(playlist.name)},${sqlValue(playlist.createdAt)},${sqlValue(playlist.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`);
    counters.playlists += 1;
    for (const [index, song] of (playlist.songs ?? []).entries()) {
      const trackId = `${playlist.id}:${index}:${(song.title ?? "").slice(0, 20)}`;
      statements.push(`INSERT INTO "PlaylistTrack" ("id","playlistId","title","artist","album","coverUrl","videoId","position") VALUES (${sqlValue(trackId)},${sqlValue(playlist.id)},${sqlValue(song.title)},${sqlValue(song.artist)},${sqlValue(song.album)},${sqlValue(song.coverUrl)},${sqlValue(song.videoId)},${sqlValue(index)}) ON CONFLICT ("id") DO NOTHING;`);
      counters.playlistTracks += 1;
    }
  }

  for (const item of appdb.sharedSongs ?? []) {
    statements.push(`INSERT INTO "SharedSong" ("id","shareCode","userId","title","artist","album","coverUrl","createdAt") VALUES (${sqlValue(item.id)},${sqlValue(item.shareCode)},${sqlValue(item.userId)},${sqlValue(item.title)},${sqlValue(item.artist)},${sqlValue(item.album)},${sqlValue(item.coverUrl)},${sqlValue(item.createdAt)}) ON CONFLICT ("id") DO NOTHING;`);
    counters.sharedSongs += 1;
  }

  for (const item of appdb.sharedPlaylists ?? []) {
    statements.push(`INSERT INTO "SharedPlaylist" ("id","shareCode","userId","playlistId","title","songCount","createdAt") VALUES (${sqlValue(item.id)},${sqlValue(item.shareCode)},${sqlValue(item.userId)},${sqlValue(item.playlistId)},${sqlValue(item.title)},${sqlValue(Number(item.songCount ?? 0))},${sqlValue(item.createdAt)}) ON CONFLICT ("id") DO NOTHING;`);
    counters.sharedPlaylists += 1;
  }

  for (const item of appdb.sharedRecognitions ?? []) {
    statements.push(`INSERT INTO "SharedRecognition" ("id","shareCode","userId","title","artist","album","coverUrl","source","createdAt") VALUES (${sqlValue(item.id)},${sqlValue(item.shareCode)},${sqlValue(item.userId)},${sqlValue(item.title)},${sqlValue(item.artist)},${sqlValue(item.album)},${sqlValue(item.coverUrl)},${sqlValue(item.source)},${sqlValue(item.createdAt)}) ON CONFLICT ("id") DO NOTHING;`);
    counters.sharedRecognitions += 1;
  }

  for (const item of appdb.achievements ?? []) {
    statements.push(`INSERT INTO "Achievement" ("id","userId","key","unlockedAt","meta") VALUES (${sqlValue(item.id)},${sqlValue(item.userId)},${sqlValue(item.key)},${sqlValue(item.unlockedAt)},${sqlValue(item.meta ?? null)}) ON CONFLICT ("id") DO NOTHING;`);
    counters.achievements += 1;
  }

  for (const item of appdb.apiKeys ?? []) {
    statements.push(`INSERT INTO "ApiKey" ("id","userId","label","keyPrefix","keyHash","createdAt","lastUsedAt","revokedAt") VALUES (${sqlValue(item.id)},${sqlValue(item.userId)},${sqlValue(item.label)},${sqlValue(item.keyPrefix)},${sqlValue(item.keyHash)},${sqlValue(item.createdAt)},${sqlValue(item.lastUsedAt)},${sqlValue(item.revokedAt)}) ON CONFLICT ("id") DO NOTHING;`);
    counters.apiKeys += 1;
  }

  for (const item of appdb.trackTags ?? []) {
    statements.push(`INSERT INTO "TrackTag" ("id","userId","trackKey","genre","mood","tempo","updatedAt") VALUES (${sqlValue(item.id)},${sqlValue(item.userId)},${sqlValue(item.trackKey)},${sqlValue(item.genre)},${sqlValue(item.mood)},${sqlValue(item.tempo)},${sqlValue(item.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`);
    counters.trackTags += 1;
  }

  for (const item of legacyHistory ?? []) {
    statements.push(`INSERT INTO "LegacyHistoryEntry" ("id","songName","artist","youtubeVideoId","createdAt") VALUES (${sqlValue(item.id)},${sqlValue(item.songName)},${sqlValue(item.artist)},${sqlValue(item.youtubeVideoId)},${sqlValue(item.createdAt)}) ON CONFLICT ("id") DO NOTHING;`);
    counters.legacyHistory += 1;
  }

  statements.push("COMMIT;");

  const outputPath = path.join(backendRoot, "tmp", "json-to-postgres.sql");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, statements.join("\n"), "utf8");

  console.info("[db-migration] summary", counters);
  console.info(`[db-migration] generated SQL: ${outputPath}`);
  console.info("[db-migration] SQL generated only. Review and execute manually against PostgreSQL.");
}

main().catch((error) => {
  console.error("[db-migration] failed", error);
  process.exit(1);
});
