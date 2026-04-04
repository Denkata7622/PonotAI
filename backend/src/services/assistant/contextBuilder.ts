import {
  getUserPlaylists,
  listFavorites,
  listUserHistory,
  type FavoriteRecord,
  type PlaylistRecord,
  type SearchHistoryRecord,
} from "../../db/authStore";
import type { LibraryContextPayload, LibraryHistoryEntry, LibraryTrack } from "../../types/assistant";

type CacheEntry = {
  payload: LibraryContextPayload;
  expiresAt: number;
};

type ContextHints = {
  currentTheme?: "light" | "dark" | "system";
  currentLanguage?: "en" | "bg";
  currentQueue?: string[];
};

const CACHE_TTL_MS = 90_000;
const MAX_CHARS = 12_000;
const contextCache = new Map<string, CacheEntry>();

function normalizeTrackKey(title?: string, artist?: string): string {
  const clean = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return `${clean(title ?? "unknown")}|||${clean(artist ?? "unknown")}`;
}

function trackIdFrom(title?: string, artist?: string): string {
  return normalizeTrackKey(title, artist);
}

function computeRecencyBonus(lastPlayedAt?: string): number {
  if (!lastPlayedAt) return 0;
  const now = Date.now();
  const played = new Date(lastPlayedAt).getTime();
  if (Number.isNaN(played)) return 0;
  const daysAgo = Math.max(0, (now - played) / (1000 * 60 * 60 * 24));
  if (daysAgo < 7) return 3;
  if (daysAgo < 30) return 1;
  return 0;
}

function trimToBudget(payload: LibraryContextPayload): LibraryContextPayload {
  const clone: LibraryContextPayload = JSON.parse(JSON.stringify(payload));
  const exceeds = () => JSON.stringify(clone).length > MAX_CHARS;
  if (exceeds()) delete clone.stats;
  if (exceeds()) clone.recentHistory = clone.recentHistory.slice(0, 10);
  if (exceeds()) clone.topTracks = clone.topTracks.slice(0, 25);
  return clone;
}

function buildTracks(history: SearchHistoryRecord[], favorites: FavoriteRecord[], playlists: PlaylistRecord[]): LibraryTrack[] {
  const favoritesSet = new Set(favorites.map((fav) => normalizeTrackKey(fav.title, fav.artist)));
  const historyByTrack = new Map<string, SearchHistoryRecord[]>();
  for (const item of history) {
    const key = normalizeTrackKey(item.title, item.artist);
    if (!historyByTrack.has(key)) historyByTrack.set(key, []);
    historyByTrack.get(key)!.push(item);
  }

  const playlistSongMap = new Map<string, { album?: string; coverUrl?: string }>();
  for (const playlist of playlists) {
    for (const song of playlist.songs) {
      const key = normalizeTrackKey(song.title, song.artist);
      if (!playlistSongMap.has(key)) playlistSongMap.set(key, { album: song.album, coverUrl: song.coverUrl });
    }
  }

  const tracks: Array<LibraryTrack & { __score: number }> = [];
  for (const [key, entries] of historyByTrack.entries()) {
    const latest = entries[0];
    const metadata = playlistSongMap.get(key);
    tracks.push({
      trackId: trackIdFrom(latest.title, latest.artist),
      title: latest.title ?? "Unknown Song",
      artist: latest.artist ?? "Unknown Artist",
      album: latest.album ?? metadata?.album,
      coverUrl: latest.coverUrl ?? metadata?.coverUrl,
      playCount: entries.length,
      isFavorite: favoritesSet.has(key),
      lastPlayedAt: latest.createdAt,
      __score: (favoritesSet.has(key) ? 4 : 0) + entries.length * 1.5 + computeRecencyBonus(latest.createdAt),
    });
  }

  for (const favorite of favorites) {
    const key = normalizeTrackKey(favorite.title, favorite.artist);
    if (historyByTrack.has(key)) continue;
    tracks.push({
      trackId: trackIdFrom(favorite.title, favorite.artist),
      title: favorite.title,
      artist: favorite.artist,
      album: favorite.album,
      coverUrl: favorite.coverUrl,
      playCount: 0,
      isFavorite: true,
      lastPlayedAt: favorite.savedAt,
      __score: 4,
    });
  }

  tracks.sort((a, b) => b.__score - a.__score);
  return tracks.slice(0, 40).map(({ __score: _score, ...track }) => track);
}

export function invalidateLibraryContextCache(userId?: string): void {
  if (!userId) {
    contextCache.clear();
    return;
  }
  contextCache.delete(userId);
}

export async function buildLibraryContext(userId: string, hints?: ContextHints): Promise<LibraryContextPayload> {
  const cacheKey = `${userId}:${hints?.currentTheme ?? "na"}:${hints?.currentLanguage ?? "na"}:${(hints?.currentQueue ?? []).join("|")}`;
  const now = Date.now();
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.payload;

  const [history, favorites, playlists] = await Promise.all([listUserHistory(userId), listFavorites(userId), getUserPlaylists(userId)]);
  const topTracks = buildTracks(history, favorites, playlists);

  const recentHistory: LibraryHistoryEntry[] = history.slice(0, 15).map((item) => ({
    trackId: trackIdFrom(item.title, item.artist),
    title: item.title ?? "Unknown Song",
    artist: item.artist ?? "Unknown Artist",
    createdAt: item.createdAt,
  }));

  const tracksById = new Map(topTracks.map((track) => [track.trackId, track]));
  const playlistsSummary = playlists.map((playlist) => {
    const trackIds = playlist.songs.map((song) => trackIdFrom(song.title, song.artist));
    const tracks = trackIds.slice(0, 10).map((trackId) => {
      const resolved = tracksById.get(trackId);
      if (resolved) return { trackId, title: resolved.title, artist: resolved.artist };
      const [title = "Unknown Song", artist = "Unknown Artist"] = trackId.split("|||");
      return { trackId, title, artist };
    });
    return { id: playlist.id, name: playlist.name, description: undefined, trackIds, tracks };
  });

  const artistCounts = new Map<string, number>();
  for (const track of topTracks) artistCounts.set(track.artist, (artistCounts.get(track.artist) ?? 0) + 1);

  const payload: LibraryContextPayload = {
    profile: {
      totalTracks: topTracks.length,
      firstRecognitionDate: history.at(-1)?.createdAt,
      lastRecognitionDate: history[0]?.createdAt,
    },
    topTracks,
    recentHistory,
    playlists: playlistsSummary,
    currentTheme: hints?.currentTheme,
    currentLanguage: hints?.currentLanguage,
    currentQueue: (hints?.currentQueue ?? []).slice(0, 10),
    stats: {
      topGenres: [],
      topArtists: [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    },
  };

  console.info(`[assistant] Context built: ${topTracks.length} tracks, ${playlists.length} playlists, ${favorites.length} favorites`);
  const trimmed = trimToBudget(payload);
  contextCache.set(cacheKey, { payload: trimmed, expiresAt: now + CACHE_TTL_MS });
  return trimmed;
}
