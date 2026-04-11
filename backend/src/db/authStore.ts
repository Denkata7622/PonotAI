import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type UserRecord = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role?: "user" | "admin";
  isDemo?: boolean;
  avatarBase64?: string;
  bio?: string;
  createdAt: string;
};

export type SearchHistoryRecord = {
  id: string;
  userId: string;
  method: string;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  recognized: boolean;
  createdAt: string;
};

export type FavoriteRecord = {
  id: string;
  userId: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  savedAt: string;
};

export type SharedSongRecord = {
  id: string;
  shareCode: string;
  userId: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  createdAt: string;
};

export type SharedPlaylistRecord = {
  id: string;
  shareCode: string;
  userId: string;
  playlistId: string;
  title: string;
  songCount: number;
  createdAt: string;
};

export type SharedRecognitionRecord = {
  id: string;
  shareCode: string;
  userId: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  source?: string;
  createdAt: string;
};

export type AchievementRecord = {
  id: string;
  userId: string;
  key: string;
  unlockedAt: string;
  meta?: Record<string, unknown>;
};

export type ApiKeyRecord = {
  id: string;
  userId: string;
  label: string;
  keyPrefix: string;
  keyHash: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

export type PlaylistRecord = {
  id: string;
  userId: string;
  name: string;
  songs: PlaylistSongRecord[];
  createdAt: string;
  updatedAt: string;
};

export type PlaylistSongRecord = {
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  videoId?: string;
};

export type TrackTagRecord = {
  id: string;
  userId: string;
  trackKey: string;
  genre: string;
  mood: string;
  tempo: string;
  updatedAt: string;
};

type AppDb = {
  users: UserRecord[];
  searchHistory: SearchHistoryRecord[];
  favorites: FavoriteRecord[];
  sharedSongs: SharedSongRecord[];
  playlists: PlaylistRecord[];
  sharedPlaylists: SharedPlaylistRecord[];
  sharedRecognitions: SharedRecognitionRecord[];
  achievements: AchievementRecord[];
  apiKeys: ApiKeyRecord[];
  trackTags: TrackTagRecord[];
};

export type AdminOverviewSnapshot = {
  totals: {
    users: number;
    playlists: number;
    sharedSongs: number;
    sharedPlaylists: number;
    sharedRecognitions: number;
    sharesTotal: number;
    recognitions: number;
    demoAccounts: number;
    achievementsAwarded: number;
    apiKeys: number;
  };
  users: UserRecord[];
  playlists: PlaylistRecord[];
  searchHistory: SearchHistoryRecord[];
  sharedSongs: SharedSongRecord[];
  sharedPlaylists: SharedPlaylistRecord[];
  sharedRecognitions: SharedRecognitionRecord[];
  achievements: AchievementRecord[];
  apiKeys: ApiKeyRecord[];
};

function resolveDataDir(): string {
  return process.env.PONOTAI_DATA_DIR?.trim() || path.join(process.cwd(), "backend", "data");
}

function resolveDbPath(): string {
  return path.join(resolveDataDir(), "appdb.json");
}

function normalizeTrackKey(title: string, artist: string): string {
  const normalizePart = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return `${normalizePart(title)}|||${normalizePart(artist)}`;
}


async function ensureDb() {
  const dbPath = resolveDbPath();
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    const initial: AppDb = {
      users: [],
      searchHistory: [],
      favorites: [],
      sharedSongs: [],
      playlists: [],
      sharedPlaylists: [],
      sharedRecognitions: [],
      achievements: [],
      apiKeys: [],
      trackTags: [],
    };
    await fs.writeFile(dbPath, JSON.stringify(initial, null, 2));
  }
}

async function readDb(): Promise<AppDb> {
  await ensureDb();
  try {
    const raw = await fs.readFile(resolveDbPath(), "utf8");
    if (!raw || !raw.trim()) throw new Error("empty");
    const parsed = JSON.parse(raw) as Partial<AppDb>;
    const db: AppDb = {
      users: parsed.users ?? [],
      playlists: parsed.playlists ?? [],
      searchHistory: parsed.searchHistory ?? [],
      favorites: parsed.favorites ?? [],
      sharedSongs: parsed.sharedSongs ?? [],
      sharedPlaylists: parsed.sharedPlaylists ?? [],
      sharedRecognitions: parsed.sharedRecognitions ?? [],
      achievements: parsed.achievements ?? [],
      apiKeys: parsed.apiKeys ?? [],
      trackTags: parsed.trackTags ?? [],
    };
    let hasPlaylistMigration = false;
    db.playlists = db.playlists.map((playlist) => {
      if ((playlist as Partial<PlaylistRecord>).userId) return playlist;
      hasPlaylistMigration = true;
      return { ...playlist, userId: "legacy" };
    });
    if (hasPlaylistMigration) {
      await writeDb(db);
    }
    return db;
  } catch {
    const fresh: AppDb = {
      users: [],
      playlists: [],
      searchHistory: [],
      favorites: [],
      sharedSongs: [],
      sharedPlaylists: [],
      sharedRecognitions: [],
      achievements: [],
      apiKeys: [],
      trackTags: [],
    };
    await writeDb(fresh);
    return fresh;
  }
}
async function writeDb(db: AppDb): Promise<void> {
  await ensureDb();
  await fs.writeFile(resolveDbPath(), JSON.stringify(db, null, 2), "utf8");
}

export async function listUsers() { return (await readDb()).users; }

export async function createUser(input: Omit<UserRecord, "id" | "createdAt">): Promise<UserRecord> {
  const db = await readDb();
  const user: UserRecord = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
  db.users.push(user);
  await writeDb(db);
  return user;
}

export async function updateUser(id: string, updates: Partial<Omit<UserRecord, "id" | "createdAt">>): Promise<UserRecord | null> {
  const db = await readDb();
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx < 0) return null;
  db.users[idx] = { ...db.users[idx], ...updates };
  await writeDb(db);
  return db.users[idx];
}

export async function deleteUserCascade(id: string): Promise<void> {
  const db = await readDb();
  db.users = db.users.filter((u) => u.id !== id);
  db.searchHistory = db.searchHistory.filter((h) => h.userId !== id);
  db.favorites = db.favorites.filter((f) => f.userId !== id);
  db.sharedSongs = db.sharedSongs.filter((s) => s.userId !== id);
  db.playlists = db.playlists.filter((p) => p.userId !== id);
  await writeDb(db);
}

export async function findUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return (await readDb()).users.find((u) => u.email.trim().toLowerCase() === normalizedEmail) || null;
}
export async function findUserByUsername(username: string) { return (await readDb()).users.find((u) => u.username === username) || null; }
export async function findUserById(id: string) { return (await readDb()).users.find((u) => u.id === id) || null; }

export async function createUserHistory(item: Omit<SearchHistoryRecord, "id" | "createdAt">): Promise<SearchHistoryRecord> {
  const db = await readDb();
  const targetKey = normalizeTrackKey(item.title ?? "", item.artist ?? "");
  db.searchHistory = (db.searchHistory ?? []).filter(
    (entry) =>
      entry.userId !== item.userId ||
      normalizeTrackKey(entry.title ?? "", entry.artist ?? "") !== targetKey,
  );

  const rec: SearchHistoryRecord = { id: randomUUID(), createdAt: new Date().toISOString(), ...item };
  db.searchHistory.unshift(rec);
  await writeDb(db);
  return rec;
}

export async function listUserHistory(userId: string): Promise<SearchHistoryRecord[]> {
  return (await readDb()).searchHistory.filter((h) => h.userId === userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}

export async function deleteUserHistoryItem(userId: string, id: string): Promise<"ok" | "forbidden" | "missing"> {
  const db = await readDb();
  const item = db.searchHistory.find((h) => h.id === id);
  if (!item) return "missing";
  if (item.userId !== userId) return "forbidden";
  db.searchHistory = db.searchHistory.filter((h) => h.id !== id);
  await writeDb(db); // persist delete
  return "ok";
}

export async function clearUserHistory(userId: string): Promise<number> {
  const db = await readDb();
  const before = db.searchHistory.length;
  db.searchHistory = db.searchHistory.filter((h) => h.userId !== userId);
  await writeDb(db); // persist delete
  return before - db.searchHistory.length;
}

export async function listFavorites(userId: string): Promise<FavoriteRecord[]> {
  return (await readDb()).favorites.filter((f) => f.userId === userId).sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
}

export async function findDuplicateFavorite(userId: string, title: string, artist: string) {
  const targetKey = normalizeTrackKey(title, artist);
  return (
    (await readDb()).favorites.find(
      (f) => f.userId === userId && normalizeTrackKey(f.title, f.artist) === targetKey,
    ) || null
  );
}

export async function createFavorite(item: Omit<FavoriteRecord, "id" | "savedAt">): Promise<FavoriteRecord> {
  const db = await readDb();
  const rec: FavoriteRecord = { id: randomUUID(), savedAt: new Date().toISOString(), ...item };
  db.favorites.unshift(rec);
  await writeDb(db);
  return rec;
}

export async function deleteFavorite(userId: string, id: string): Promise<"ok"|"forbidden"|"missing"> {
  const db = await readDb();
  const item = db.favorites.find((f)=>f.id===id);
  if(!item) return "missing";
  if(item.userId!==userId) return "forbidden";
  db.favorites = db.favorites.filter((f)=>f.id!==id);
  await writeDb(db); // persist delete
  return "ok";
}

export async function createSharedSong(item: Omit<SharedSongRecord, "id" | "createdAt" | "shareCode">): Promise<SharedSongRecord> {
  const db = await readDb();
  const rec: SharedSongRecord = { id: randomUUID(), shareCode: randomUUID().replace(/-/g, ""), createdAt: new Date().toISOString(), ...item };
  db.sharedSongs.unshift(rec);
  await writeDb(db);
  return rec;
}

export async function createSharedPlaylist(
  item: Omit<SharedPlaylistRecord, "id" | "createdAt" | "shareCode">,
): Promise<SharedPlaylistRecord> {
  const db = await readDb();
  const rec: SharedPlaylistRecord = {
    id: randomUUID(),
    shareCode: randomUUID().replace(/-/g, ""),
    createdAt: new Date().toISOString(),
    ...item,
  };
  db.sharedPlaylists.unshift(rec);
  await writeDb(db);
  return rec;
}

export async function findSharedPlaylistByCode(shareCode: string): Promise<SharedPlaylistRecord | null> {
  return (await readDb()).sharedPlaylists.find((s) => s.shareCode === shareCode) || null;
}

export async function createSharedRecognition(
  item: Omit<SharedRecognitionRecord, "id" | "createdAt" | "shareCode">,
): Promise<SharedRecognitionRecord> {
  const db = await readDb();
  const rec: SharedRecognitionRecord = {
    id: randomUUID(),
    shareCode: randomUUID().replace(/-/g, ""),
    createdAt: new Date().toISOString(),
    ...item,
  };
  db.sharedRecognitions.unshift(rec);
  await writeDb(db);
  return rec;
}

export async function findSharedRecognitionByCode(shareCode: string): Promise<SharedRecognitionRecord | null> {
  return (await readDb()).sharedRecognitions.find((s) => s.shareCode === shareCode) || null;
}

export async function listSharedAssets(limit = 100): Promise<{
  songs: SharedSongRecord[];
  playlists: SharedPlaylistRecord[];
  recognitions: SharedRecognitionRecord[];
}> {
  const db = await readDb();
  return {
    songs: db.sharedSongs.slice(0, limit),
    playlists: db.sharedPlaylists.slice(0, limit),
    recognitions: db.sharedRecognitions.slice(0, limit),
  };
}

export async function findSharedSongByCode(shareCode: string): Promise<SharedSongRecord | null> {
  return (await readDb()).sharedSongs.find((s) => s.shareCode === shareCode) || null;
}

export async function getUserPlaylists(userId: string): Promise<PlaylistRecord[]> {
  return (await readDb()).playlists.filter((p) => p.userId === userId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}

export async function createPlaylist(userId: string, name: string, id?: string, songs?: PlaylistSongRecord[]): Promise<PlaylistRecord> {
  const db = await readDb();
  const now = new Date().toISOString();
  
  const playlist: PlaylistRecord = {
    id: id || randomUUID(),
    userId,
    name,
    songs: songs || [],
    createdAt: now,
    updatedAt: now,
  };
  
  db.playlists.push(playlist);
  await writeDb(db);
  return playlist;
}

export async function updatePlaylistName(playlistId: string, name: string): Promise<PlaylistRecord | null> {
  const db = await readDb();
  const playlist = db.playlists.find((p) => p.id === playlistId);
  if (!playlist) return null;
  
  playlist.name = name;
  playlist.updatedAt = new Date().toISOString();
  await writeDb(db);
  return playlist;
}

export async function addSongToPlaylist(
  playlistId: string,
  song: Omit<PlaylistSongRecord, "addedAt">
): Promise<PlaylistRecord | null> {
  const db = await readDb();
  const playlist = db.playlists.find((p) => p.id === playlistId);
  if (!playlist) return null;
  
  // Check if song already exists
  const exists = playlist.songs.some((s) => s.title === song.title && s.artist === song.artist);
  if (exists) return playlist;
  
  const songRecord: PlaylistSongRecord = {
    title: song.title,
    artist: song.artist,
    album: song.album,
    coverUrl: song.coverUrl,
    videoId: song.videoId,
  };
  
  playlist.songs.push(songRecord);
  playlist.updatedAt = new Date().toISOString();
  await writeDb(db);
  return playlist;
}

export async function removeSongFromPlaylist(
  playlistId: string,
  title: string,
  artist: string
): Promise<PlaylistRecord | null> {
  const db = await readDb();
  const playlist = db.playlists.find((p) => p.id === playlistId);
  if (!playlist) return null;
  
  const initialLength = playlist.songs.length;
  playlist.songs = playlist.songs.filter((s) => !(s.title === title && s.artist === artist));
  
  if (playlist.songs.length < initialLength) {
    playlist.updatedAt = new Date().toISOString();
    await writeDb(db); // persist remove song
  }
  
  return playlist;
}

export async function deletePlaylist(playlistId: string): Promise<"ok" | "missing"> {
  const db = await readDb();
  const index = db.playlists.findIndex((p) => p.id === playlistId);
  if (index < 0) return "missing";
  
  db.playlists.splice(index, 1);
  await writeDb(db); // persist delete
  return "ok";
}

export async function findPlaylistById(playlistId: string): Promise<PlaylistRecord | null> {
  return (await readDb()).playlists.find((p) => p.id === playlistId) || null;
}

export async function clearUserPlaylists(userId: string): Promise<void> {
  const db = await readDb();
  db.playlists = (db.playlists ?? []).filter((p) => p.userId !== userId);
  await writeDb(db);
}

export async function syncUserPlaylists(
  userId: string,
  incomingPlaylists: Array<{ id?: string; name: string; songs?: PlaylistSongRecord[] }>,
  options?: { mode?: "merge" | "replace"; allowEmptyReplace?: boolean },
): Promise<PlaylistRecord[]> {
  const db = await readDb();
  const mode = options?.mode ?? "merge";
  const existingForUser = db.playlists.filter((item) => item.userId === userId);
  const hasExistingData = existingForUser.length > 0;
  const normalized = incomingPlaylists.map((playlist) => ({
    id: playlist.id?.trim() || randomUUID(),
    userId,
    name: playlist.name.trim(),
    songs: Array.isArray(playlist.songs) ? playlist.songs : [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }));

  if (mode === "replace") {
    if (normalized.length === 0 && hasExistingData && options?.allowEmptyReplace !== true) {
      throw new Error("SAFE_GUARD_EMPTY_PLAYLIST_REPLACE");
    }
    db.playlists = db.playlists.filter((item) => item.userId !== userId);
    db.playlists.push(...normalized);
    await writeDb(db);
    return db.playlists.filter((item) => item.userId === userId);
  }

  const existingById = new Map(existingForUser.map((item) => [item.id, item]));
  for (const playlist of normalized) {
    const found = existingById.get(playlist.id);
    if (!found) {
      db.playlists.push(playlist);
      continue;
    }
    found.name = playlist.name;
    found.songs = playlist.songs;
    found.updatedAt = new Date().toISOString();
  }

  await writeDb(db);
  return db.playlists.filter((item) => item.userId === userId);
}

export async function listAchievements(userId: string): Promise<AchievementRecord[]> {
  return (await readDb()).achievements.filter((a) => a.userId === userId).sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));
}

export async function unlockAchievement(
  userId: string,
  key: string,
  meta?: Record<string, unknown>,
): Promise<AchievementRecord | null> {
  const db = await readDb();
  const existing = db.achievements.find((achievement) => achievement.userId === userId && achievement.key === key);
  if (existing) return null;
  const rec: AchievementRecord = {
    id: randomUUID(),
    userId,
    key,
    unlockedAt: new Date().toISOString(),
    meta,
  };
  db.achievements.unshift(rec);
  await writeDb(db);
  return rec;
}

export async function createApiKey(record: Omit<ApiKeyRecord, "id" | "createdAt" | "lastUsedAt" | "revokedAt">): Promise<ApiKeyRecord> {
  const db = await readDb();
  const apiKey: ApiKeyRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...record,
  };
  db.apiKeys.unshift(apiKey);
  await writeDb(db);
  return apiKey;
}

export async function listApiKeysByUser(userId: string): Promise<ApiKeyRecord[]> {
  return (await readDb()).apiKeys.filter((key) => key.userId === userId);
}

export async function findApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
  return (await readDb()).apiKeys.find((key) => key.keyPrefix === prefix && !key.revokedAt) || null;
}

export async function touchApiKey(id: string): Promise<void> {
  const db = await readDb();
  const found = db.apiKeys.find((key) => key.id === id);
  if (!found) return;
  found.lastUsedAt = new Date().toISOString();
  await writeDb(db);
}

export async function revokeApiKey(userId: string, id: string): Promise<boolean> {
  const db = await readDb();
  const found = db.apiKeys.find((key) => key.id === id && key.userId === userId);
  if (!found || found.revokedAt) return false;
  found.revokedAt = new Date().toISOString();
  await writeDb(db);
  return true;
}

export async function getTrackTags(userId: string): Promise<TrackTagRecord[]> {
  return (await readDb()).trackTags.filter((item) => item.userId === userId);
}

export async function setTrackTags(
  userId: string,
  tags: Array<Pick<TrackTagRecord, "trackKey" | "genre" | "mood" | "tempo">>,
): Promise<TrackTagRecord[]> {
  if (tags.length === 0) {
    throw new Error("SAFE_GUARD_EMPTY_TAG_REPLACE");
  }
  const db = await readDb();
  db.trackTags = (db.trackTags ?? []).filter((item) => item.userId !== userId);
  const now = new Date().toISOString();
  const records = tags.map((tag) => ({
    id: randomUUID(),
    userId,
    trackKey: tag.trackKey,
    genre: tag.genre,
    mood: tag.mood,
    tempo: tag.tempo,
    updatedAt: now,
  }));
  db.trackTags.unshift(...records);
  await writeDb(db);
  return records;
}

export async function getAdminOverviewSnapshot(): Promise<AdminOverviewSnapshot> {
  const db = await readDb();
  return {
    totals: {
      users: db.users.length,
      playlists: db.playlists.length,
      sharedSongs: db.sharedSongs.length,
      sharedPlaylists: db.sharedPlaylists.length,
      sharedRecognitions: db.sharedRecognitions.length,
      sharesTotal: db.sharedSongs.length + db.sharedPlaylists.length + db.sharedRecognitions.length,
      recognitions: db.searchHistory.filter((item) => item.recognized).length,
      demoAccounts: db.users.filter((user) => Boolean(user.isDemo)).length,
      achievementsAwarded: db.achievements.length,
      apiKeys: db.apiKeys.length,
    },
    users: db.users,
    playlists: db.playlists,
    searchHistory: db.searchHistory,
    sharedSongs: db.sharedSongs,
    sharedPlaylists: db.sharedPlaylists,
    sharedRecognitions: db.sharedRecognitions,
    achievements: db.achievements,
    apiKeys: db.apiKeys,
  };
}
