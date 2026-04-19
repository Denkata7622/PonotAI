import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { normalizeTrackKey } from "../utils/songIdentity";

export type UserRecord = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt?: string | null;
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

export type EmailVerificationTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
};

export type PlaylistSongRecord = {
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  videoId?: string;
};

export type PlaylistRecord = {
  id: string;
  userId: string;
  name: string;
  songs: PlaylistSongRecord[];
  createdAt: string;
  updatedAt: string;
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

export type AdminOverviewSnapshot = {
  totals: {
    users: number;
    playlists: number;
    sharedSongs: number;
    sharedPlaylists: number;
    sharedRecognitions: number;
    sharesTotal: number;
    recognitions: number;
    favorites: number;
    historyEntries: number;
    demoAccounts: number;
    achievementsAwarded: number;
    apiKeys: number;
  };
  users: UserRecord[];
  playlists: PlaylistRecord[];
  searchHistory: SearchHistoryRecord[];
  favorites: FavoriteRecord[];
  sharedSongs: SharedSongRecord[];
  sharedPlaylists: SharedPlaylistRecord[];
  sharedRecognitions: SharedRecognitionRecord[];
  achievements: AchievementRecord[];
  apiKeys: ApiKeyRecord[];
};

const toIso = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

function mapUser(user: any): UserRecord {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    passwordHash: user.passwordHash,
    emailVerifiedAt: user.emailVerifiedAt ? toIso(user.emailVerifiedAt) : undefined,
    role: user.role,
    isDemo: user.isDemo,
    avatarBase64: user.avatarBase64 ?? undefined,
    bio: user.bio ?? undefined,
    createdAt: toIso(user.createdAt),
  };
}

function mapHistory(item: any): SearchHistoryRecord {
  return {
    id: item.id,
    userId: item.userId,
    method: item.method,
    title: item.title ?? undefined,
    artist: item.artist ?? undefined,
    album: item.album ?? undefined,
    coverUrl: item.coverUrl ?? undefined,
    recognized: item.recognized,
    createdAt: toIso(item.createdAt),
  };
}

function mapFavorite(item: any): FavoriteRecord {
  return {
    id: item.id,
    userId: item.userId,
    title: item.title,
    artist: item.artist,
    album: item.album ?? undefined,
    coverUrl: item.coverUrl ?? undefined,
    savedAt: toIso(item.savedAt),
  };
}

function mapPlaylist(item: any): PlaylistRecord {
  return {
    id: item.id,
    userId: item.userId,
    name: item.name,
    songs: (item.tracks ?? [])
      .sort((a: any, b: any) => a.position - b.position)
      .map((track: any) => ({
        title: track.title,
        artist: track.artist,
        album: track.album ?? undefined,
        coverUrl: track.coverUrl ?? undefined,
        videoId: track.videoId ?? undefined,
      })),
    createdAt: toIso(item.createdAt),
    updatedAt: toIso(item.updatedAt),
  };
}

function mapSharedSong(item: any): SharedSongRecord {
  return {
    id: item.id,
    shareCode: item.shareCode,
    userId: item.userId,
    title: item.title,
    artist: item.artist,
    album: item.album ?? undefined,
    coverUrl: item.coverUrl ?? undefined,
    createdAt: toIso(item.createdAt),
  };
}

function mapSharedPlaylist(item: any): SharedPlaylistRecord {
  return {
    id: item.id,
    shareCode: item.shareCode,
    userId: item.userId,
    playlistId: item.playlistId,
    title: item.title,
    songCount: item.songCount,
    createdAt: toIso(item.createdAt),
  };
}

function mapSharedRecognition(item: any): SharedRecognitionRecord {
  return {
    id: item.id,
    shareCode: item.shareCode,
    userId: item.userId,
    title: item.title,
    artist: item.artist,
    album: item.album ?? undefined,
    coverUrl: item.coverUrl ?? undefined,
    source: item.source ?? undefined,
    createdAt: toIso(item.createdAt),
  };
}

function mapAchievement(item: any): AchievementRecord {
  return {
    id: item.id,
    userId: item.userId,
    key: item.key,
    unlockedAt: toIso(item.unlockedAt),
    meta: (item.meta as Record<string, unknown> | null) ?? undefined,
  };
}

function mapApiKey(item: any): ApiKeyRecord {
  return {
    id: item.id,
    userId: item.userId,
    label: item.label,
    keyPrefix: item.keyPrefix,
    keyHash: item.keyHash,
    createdAt: toIso(item.createdAt),
    lastUsedAt: item.lastUsedAt ? toIso(item.lastUsedAt) : undefined,
    revokedAt: item.revokedAt ? toIso(item.revokedAt) : undefined,
  };
}

function mapEmailVerificationToken(item: any): EmailVerificationTokenRecord {
  return {
    id: item.id,
    userId: item.userId,
    tokenHash: item.tokenHash,
    expiresAt: toIso(item.expiresAt),
    consumedAt: item.consumedAt ? toIso(item.consumedAt) : undefined,
    createdAt: toIso(item.createdAt),
  };
}

export async function listUsers() {
  return (await prisma.user.findMany({ orderBy: { createdAt: "asc" } })).map(mapUser);
}

export async function createUser(input: Omit<UserRecord, "id" | "createdAt">): Promise<UserRecord> {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      username: input.username,
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      emailVerifiedAt: input.emailVerifiedAt ? new Date(input.emailVerifiedAt) : undefined,
      role: input.role ?? "user",
      isDemo: Boolean(input.isDemo),
      avatarBase64: input.avatarBase64,
      bio: input.bio,
    },
  });
  return mapUser(user);
}

export async function updateUser(
  id: string,
  updates: Partial<Omit<UserRecord, "id" | "createdAt">>,
): Promise<UserRecord | null> {
  const found = await prisma.user.findUnique({ where: { id } });
  if (!found) return null;
  const user = await prisma.user.update({
    where: { id },
    data: {
      username: updates.username,
      email: updates.email ? updates.email.trim().toLowerCase() : undefined,
      passwordHash: updates.passwordHash,
      emailVerifiedAt: updates.emailVerifiedAt ? new Date(updates.emailVerifiedAt) : updates.emailVerifiedAt === null ? null : undefined,
      role: updates.role,
      isDemo: updates.isDemo,
      avatarBase64: updates.avatarBase64,
      bio: updates.bio,
    },
  });
  return mapUser(user);
}

export async function deleteUserCascade(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } });
}

export async function findUserByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  return user ? mapUser(user) : null;
}
export async function findUserByUsername(username: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  return user ? mapUser(user) : null;
}
export async function findUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? mapUser(user) : null;
}

export async function createEmailVerificationToken(input: {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<EmailVerificationTokenRecord> {
  const token = await prisma.emailVerificationToken.create({
    data: {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.expiresAt),
    },
  });
  return mapEmailVerificationToken(token);
}

export async function consumeEmailVerificationToken(tokenHash: string): Promise<EmailVerificationTokenRecord | null> {
  const found = await prisma.emailVerificationToken.findFirst({
    where: {
      tokenHash,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!found) return null;
  const consumed = await prisma.emailVerificationToken.update({
    where: { id: found.id },
    data: { consumedAt: new Date() },
  });
  return mapEmailVerificationToken(consumed);
}

export async function revokeEmailVerificationTokensForUser(userId: string): Promise<void> {
  await prisma.emailVerificationToken.updateMany({
    where: {
      userId,
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });
}

export async function createUserHistory(
  item: Omit<SearchHistoryRecord, "id" | "createdAt">,
  options?: { allowDuplicates?: boolean; createdAt?: string },
): Promise<SearchHistoryRecord> {
  return prisma.$transaction(async (tx: any) => {
    const targetKey = normalizeTrackKey(item.title ?? "", item.artist ?? "");
    if (!options?.allowDuplicates) {
      const existing = await tx.searchHistory.findMany({ where: { userId: item.userId } });
      const duplicateIds = existing
        .filter((entry: any) => normalizeTrackKey(entry.title ?? "", entry.artist ?? "") === targetKey)
        .map((entry: any) => entry.id);
      if (duplicateIds.length > 0) {
        await tx.searchHistory.deleteMany({ where: { id: { in: duplicateIds } } });
      }
    }

    const created = await tx.searchHistory.create({
      data: {
        id: randomUUID(),
        userId: item.userId,
        method: item.method,
        title: item.title,
        artist: item.artist,
        album: item.album,
        coverUrl: item.coverUrl,
        recognized: item.recognized,
        createdAt: options?.createdAt ? new Date(options.createdAt) : new Date(),
      },
    });

    return mapHistory(created);
  });
}

export async function listUserHistory(userId: string): Promise<SearchHistoryRecord[]> {
  return (
    await prisma.searchHistory.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
  ).map(mapHistory);
}

export async function deleteUserHistoryItem(userId: string, id: string): Promise<"ok" | "forbidden" | "missing"> {
  const item = await prisma.searchHistory.findUnique({ where: { id } });
  if (!item) return "missing";
  if (item.userId !== userId) return "forbidden";
  await prisma.searchHistory.delete({ where: { id } });
  return "ok";
}

export async function clearUserHistory(userId: string): Promise<number> {
  const result = await prisma.searchHistory.deleteMany({ where: { userId } });
  return result.count;
}

export async function listFavorites(userId: string): Promise<FavoriteRecord[]> {
  return (await prisma.favorite.findMany({ where: { userId }, orderBy: { savedAt: "desc" } })).map(mapFavorite);
}

export async function findDuplicateFavorite(userId: string, title: string, artist: string) {
  const targetKey = normalizeTrackKey(title, artist);
  const favorites = await prisma.favorite.findMany({ where: { userId } });
  const found = favorites.find((item: any) => normalizeTrackKey(item.title, item.artist) === targetKey);
  return found ? mapFavorite(found) : null;
}

export async function createFavorite(item: Omit<FavoriteRecord, "id" | "savedAt">): Promise<FavoriteRecord> {
  const favorite = await prisma.favorite.create({
    data: {
      id: randomUUID(),
      userId: item.userId,
      title: item.title,
      artist: item.artist,
      album: item.album,
      coverUrl: item.coverUrl,
      savedAt: new Date(),
    },
  });
  return mapFavorite(favorite);
}

export async function deleteFavorite(userId: string, id: string): Promise<"ok" | "forbidden" | "missing"> {
  const item = await prisma.favorite.findUnique({ where: { id } });
  if (!item) return "missing";
  if (item.userId !== userId) return "forbidden";
  await prisma.favorite.delete({ where: { id } });
  return "ok";
}

export async function deleteFavoriteByTrackKey(userId: string, trackKey: string): Promise<"ok" | "missing"> {
  const favorites = await prisma.favorite.findMany({ where: { userId } });
  const target = favorites.find((item: any) => normalizeTrackKey(item.title, item.artist) === trackKey);
  if (!target) return "missing";
  await prisma.favorite.delete({ where: { id: target.id } });
  return "ok";
}

export async function createSharedSong(item: Omit<SharedSongRecord, "id" | "createdAt" | "shareCode">): Promise<SharedSongRecord> {
  const record = await prisma.sharedSong.create({
    data: {
      id: randomUUID(),
      shareCode: randomUUID().replace(/-/g, ""),
      userId: item.userId,
      title: item.title,
      artist: item.artist,
      album: item.album,
      coverUrl: item.coverUrl,
    },
  });
  return mapSharedSong(record);
}

export async function createSharedPlaylist(
  item: Omit<SharedPlaylistRecord, "id" | "createdAt" | "shareCode">,
): Promise<SharedPlaylistRecord> {
  const record = await prisma.sharedPlaylist.create({
    data: {
      id: randomUUID(),
      shareCode: randomUUID().replace(/-/g, ""),
      userId: item.userId,
      playlistId: item.playlistId,
      title: item.title,
      songCount: item.songCount,
    },
  });
  return mapSharedPlaylist(record);
}

export async function findSharedPlaylistByCode(shareCode: string): Promise<SharedPlaylistRecord | null> {
  const record = await prisma.sharedPlaylist.findUnique({ where: { shareCode } });
  return record ? mapSharedPlaylist(record) : null;
}

export async function createSharedRecognition(
  item: Omit<SharedRecognitionRecord, "id" | "createdAt" | "shareCode">,
): Promise<SharedRecognitionRecord> {
  const record = await prisma.sharedRecognition.create({
    data: {
      id: randomUUID(),
      shareCode: randomUUID().replace(/-/g, ""),
      userId: item.userId,
      title: item.title,
      artist: item.artist,
      album: item.album,
      coverUrl: item.coverUrl,
      source: item.source,
    },
  });
  return mapSharedRecognition(record);
}

export async function findSharedRecognitionByCode(shareCode: string): Promise<SharedRecognitionRecord | null> {
  const record = await prisma.sharedRecognition.findUnique({ where: { shareCode } });
  return record ? mapSharedRecognition(record) : null;
}

export async function listSharedAssets(limit = 100): Promise<{
  songs: SharedSongRecord[];
  playlists: SharedPlaylistRecord[];
  recognitions: SharedRecognitionRecord[];
}> {
  const [songs, playlists, recognitions] = await Promise.all([
    prisma.sharedSong.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
    prisma.sharedPlaylist.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
    prisma.sharedRecognition.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
  ]);
  return {
    songs: songs.map(mapSharedSong),
    playlists: playlists.map(mapSharedPlaylist),
    recognitions: recognitions.map(mapSharedRecognition),
  };
}

export async function findSharedSongByCode(shareCode: string): Promise<SharedSongRecord | null> {
  const record = await prisma.sharedSong.findUnique({ where: { shareCode } });
  return record ? mapSharedSong(record) : null;
}

export async function getUserPlaylists(userId: string): Promise<PlaylistRecord[]> {
  const playlists = await prisma.playlist.findMany({
    where: { userId },
    include: { tracks: true },
    orderBy: { updatedAt: "desc" },
  });
  return playlists.map(mapPlaylist);
}

export async function createPlaylist(userId: string, name: string, id?: string, songs?: PlaylistSongRecord[]): Promise<PlaylistRecord> {
  const now = new Date();
  const playlist = await prisma.playlist.create({
    data: {
      id: id || randomUUID(),
      userId,
      name,
      createdAt: now,
      updatedAt: now,
      tracks: {
        create: (songs ?? []).map((song, index) => ({
          id: randomUUID(),
          title: song.title,
          artist: song.artist,
          album: song.album,
          coverUrl: song.coverUrl,
          videoId: song.videoId,
          position: index,
        })),
      },
    },
    include: { tracks: true },
  });
  return mapPlaylist(playlist);
}

export async function updatePlaylistName(playlistId: string, name: string): Promise<PlaylistRecord | null> {
  const found = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!found) return null;
  const playlist = await prisma.playlist.update({
    where: { id: playlistId },
    data: { name, updatedAt: new Date() },
    include: { tracks: true },
  });
  return mapPlaylist(playlist);
}

export async function addSongToPlaylist(
  playlistId: string,
  song: Omit<PlaylistSongRecord, "addedAt">
): Promise<PlaylistRecord | null> {
  return prisma.$transaction(async (tx: any) => {
    const playlist = await tx.playlist.findUnique({
      where: { id: playlistId },
      include: { tracks: { orderBy: { position: "asc" } } },
    });
    if (!playlist) return null;
    const incomingKey = normalizeTrackKey(song.title, song.artist);
    const exists = playlist.tracks.some((s: any) => normalizeTrackKey(s.title, s.artist) === incomingKey);
    if (!exists) {
      await tx.playlistTrack.create({
        data: {
          id: randomUUID(),
          playlistId,
          title: song.title,
          artist: song.artist,
          album: song.album,
          coverUrl: song.coverUrl,
          videoId: song.videoId,
          position: playlist.tracks.length,
        },
      });
      await tx.playlist.update({ where: { id: playlistId }, data: { updatedAt: new Date() } });
    }

    const next = await tx.playlist.findUnique({
      where: { id: playlistId },
      include: { tracks: true },
    });
    return next ? mapPlaylist(next) : null;
  });
}

export async function removeSongFromPlaylist(
  playlistId: string,
  title: string,
  artist: string
): Promise<PlaylistRecord | null> {
  return prisma.$transaction(async (tx: any) => {
    const playlist = await tx.playlist.findUnique({
      where: { id: playlistId },
      include: { tracks: { orderBy: { position: "asc" } } },
    });
    if (!playlist) return null;
    const targetKey = normalizeTrackKey(title, artist);
    const target = playlist.tracks.find((track: any) => normalizeTrackKey(track.title, track.artist) === targetKey);
    if (!target) return mapPlaylist(playlist);

    await tx.playlistTrack.delete({ where: { id: target.id } });
    const remaining = playlist.tracks.filter((track: any) => track.id !== target.id);
    for (const [index, track] of remaining.entries()) {
      if (track.position !== index) {
        await tx.playlistTrack.update({ where: { id: track.id }, data: { position: index } });
      }
    }
    await tx.playlist.update({ where: { id: playlistId }, data: { updatedAt: new Date() } });

    const next = await tx.playlist.findUnique({ where: { id: playlistId }, include: { tracks: true } });
    return next ? mapPlaylist(next) : null;
  });
}

export async function deletePlaylist(playlistId: string): Promise<"ok" | "missing"> {
  const found = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!found) return "missing";
  await prisma.playlist.delete({ where: { id: playlistId } });
  return "ok";
}

export async function findPlaylistById(playlistId: string): Promise<PlaylistRecord | null> {
  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId }, include: { tracks: true } });
  return playlist ? mapPlaylist(playlist) : null;
}

export async function clearUserPlaylists(userId: string): Promise<void> {
  await prisma.playlist.deleteMany({ where: { userId } });
}

export async function syncUserPlaylists(
  userId: string,
  incomingPlaylists: Array<{ id?: string; name: string; songs?: PlaylistSongRecord[] }>,
  options?: { mode?: "merge" | "replace"; allowEmptyReplace?: boolean },
): Promise<PlaylistRecord[]> {
  const mode = options?.mode ?? "merge";
  const existing = await prisma.playlist.findMany({ where: { userId } });
  if (mode === "replace" && incomingPlaylists.length === 0 && existing.length > 0 && options?.allowEmptyReplace !== true) {
    throw new Error("SAFE_GUARD_EMPTY_PLAYLIST_REPLACE");
  }

  await prisma.$transaction(async (tx: any) => {
    if (mode === "replace") {
      await tx.playlist.deleteMany({ where: { userId } });
    }

    const existingById = new Map<string, any>((await tx.playlist.findMany({ where: { userId } })).map((item: any) => [item.id, item] as const));

    for (const incoming of incomingPlaylists) {
      const playlistId = incoming.id?.trim() || randomUUID();
      const songList = Array.isArray(incoming.songs) ? incoming.songs : [];
      const found = existingById.get(playlistId);

      if (!found) {
        await tx.playlist.create({
          data: {
            id: playlistId,
            userId,
            name: incoming.name.trim(),
            tracks: {
              create: songList.map((song, index) => ({
                id: randomUUID(),
                title: song.title,
                artist: song.artist,
                album: song.album,
                coverUrl: song.coverUrl,
                videoId: song.videoId,
                position: index,
              })),
            },
          },
        });
        continue;
      }

      await tx.playlist.update({
        where: { id: found.id },
        data: { name: incoming.name.trim(), updatedAt: new Date() },
      });
      await tx.playlistTrack.deleteMany({ where: { playlistId: found.id } });
      if (songList.length > 0) {
        await tx.playlistTrack.createMany({
          data: songList.map((song, index) => ({
            id: randomUUID(),
            playlistId: found.id,
            title: song.title,
            artist: song.artist,
            album: song.album,
            coverUrl: song.coverUrl,
            videoId: song.videoId,
            position: index,
          })),
        });
      }
    }
  });

  return getUserPlaylists(userId);
}

export async function listAchievements(userId: string): Promise<AchievementRecord[]> {
  return (await prisma.achievement.findMany({ where: { userId }, orderBy: { unlockedAt: "desc" } })).map(mapAchievement);
}

export async function unlockAchievement(
  userId: string,
  key: string,
  meta?: Record<string, unknown>,
): Promise<AchievementRecord | null> {
  const existing = await prisma.achievement.findFirst({ where: { userId, key } });
  if (existing) return null;
  const record = await prisma.achievement.create({
    data: {
      id: randomUUID(),
      userId,
      key,
      meta: (meta as object | undefined) ?? undefined,
    },
  });
  return mapAchievement(record);
}

export async function createApiKey(record: Omit<ApiKeyRecord, "id" | "createdAt" | "lastUsedAt" | "revokedAt">): Promise<ApiKeyRecord> {
  const apiKey = await prisma.apiKey.create({
    data: {
      id: randomUUID(),
      userId: record.userId,
      label: record.label,
      keyPrefix: record.keyPrefix,
      keyHash: record.keyHash,
    },
  });
  return mapApiKey(apiKey);
}

export async function listApiKeysByUser(userId: string): Promise<ApiKeyRecord[]> {
  return (await prisma.apiKey.findMany({ where: { userId } })).map(mapApiKey);
}

export async function findApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
  const key = await prisma.apiKey.findFirst({ where: { keyPrefix: prefix, revokedAt: null } });
  return key ? mapApiKey(key) : null;
}

export async function touchApiKey(id: string): Promise<void> {
  await prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
}

export async function revokeApiKey(userId: string, id: string): Promise<boolean> {
  const found = await prisma.apiKey.findUnique({ where: { id } });
  if (!found || found.userId !== userId || found.revokedAt) return false;
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  return true;
}

export async function getTrackTags(userId: string): Promise<TrackTagRecord[]> {
  return (await prisma.trackTag.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } })).map((item: any) => ({
    id: item.id,
    userId: item.userId,
    trackKey: item.trackKey,
    genre: item.genre,
    mood: item.mood,
    tempo: item.tempo,
    updatedAt: toIso(item.updatedAt),
  }));
}

export async function setTrackTags(
  userId: string,
  tags: Array<Pick<TrackTagRecord, "trackKey" | "genre" | "mood" | "tempo">>,
): Promise<TrackTagRecord[]> {
  if (tags.length === 0) {
    throw new Error("SAFE_GUARD_EMPTY_TAG_REPLACE");
  }
  await prisma.$transaction(async (tx: any) => {
    await tx.trackTag.deleteMany({ where: { userId } });
    await tx.trackTag.createMany({
      data: tags.map((tag) => ({
        id: randomUUID(),
        userId,
        trackKey: tag.trackKey,
        genre: tag.genre,
        mood: tag.mood,
        tempo: tag.tempo,
        updatedAt: new Date(),
      })),
    });
  });
  return getTrackTags(userId);
}

export async function getAdminOverviewSnapshot(): Promise<AdminOverviewSnapshot> {
  const [users, playlists, searchHistory, favorites, sharedSongs, sharedPlaylists, sharedRecognitions, achievements, apiKeys] = await Promise.all([
    listUsers(),
    prisma.playlist.findMany({ include: { tracks: true } }).then((items: any[]) => items.map(mapPlaylist)),
    prisma.searchHistory.findMany().then((items: any[]) => items.map(mapHistory)),
    prisma.favorite.findMany().then((items: any[]) => items.map(mapFavorite)),
    prisma.sharedSong.findMany().then((items: any[]) => items.map(mapSharedSong)),
    prisma.sharedPlaylist.findMany().then((items: any[]) => items.map(mapSharedPlaylist)),
    prisma.sharedRecognition.findMany().then((items: any[]) => items.map(mapSharedRecognition)),
    prisma.achievement.findMany().then((items: any[]) => items.map(mapAchievement)),
    prisma.apiKey.findMany().then((items: any[]) => items.map(mapApiKey)),
  ]);

  return {
    totals: {
      users: users.length,
      playlists: playlists.length,
      sharedSongs: sharedSongs.length,
      sharedPlaylists: sharedPlaylists.length,
      sharedRecognitions: sharedRecognitions.length,
      sharesTotal: sharedSongs.length + sharedPlaylists.length + sharedRecognitions.length,
      recognitions: searchHistory.filter((item: any) => item.recognized).length,
      favorites: favorites.length,
      historyEntries: searchHistory.length,
      demoAccounts: users.filter((user: any) => Boolean(user.isDemo)).length,
      achievementsAwarded: achievements.length,
      apiKeys: apiKeys.length,
    },
    users,
    playlists,
    searchHistory,
    favorites,
    sharedSongs,
    sharedPlaylists,
    sharedRecognitions,
    achievements,
    apiKeys,
  };
}
