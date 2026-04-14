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
  deviceType?: string;
  statedPreferences?: {
    genres?: string[];
    artists?: string[];
    moods?: string[];
    goals?: string[];
  };
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

function isWithinDays(value: string | undefined, days: number): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  return (Date.now() - timestamp) <= days * 24 * 60 * 60 * 1000;
}

function daysSince(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24)));
}

function getUtcHourBucket(createdAt?: string): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date(createdAt ?? "").getUTCHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
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
    for (const song of (playlist.songs ?? [])) {
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
  const prefKey = JSON.stringify(hints?.statedPreferences ?? {});
  const cacheKey = `${userId}:${hints?.currentTheme ?? "na"}:${hints?.currentLanguage ?? "na"}:${(hints?.currentQueue ?? []).join("|")}:${prefKey}`;
  const now = Date.now();
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.payload;

  const [history, favorites, playlists] = await Promise.all([
    listUserHistory(userId).catch(() => [] as SearchHistoryRecord[]),
    listFavorites(userId).catch(() => [] as FavoriteRecord[]),
    getUserPlaylists(userId).catch(() => [] as PlaylistRecord[]),
  ]);
  const topTracks = buildTracks(history, favorites, playlists);

  const recentHistory: LibraryHistoryEntry[] = history.slice(0, 15).map((item) => ({
    trackId: trackIdFrom(item.title, item.artist),
    title: item.title ?? "Unknown Song",
    artist: item.artist ?? "Unknown Artist",
    createdAt: item.createdAt,
  }));

  const tracksById = new Map(topTracks.map((track) => [track.trackId, track]));
  const playlistsSummary = playlists.map((playlist) => {
    const safeSongs = playlist.songs ?? [];
    const trackIds = safeSongs.map((song) => trackIdFrom(song.title, song.artist));
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
  const recentHistoryWindow = history.filter((entry) => isWithinDays(entry.createdAt, 7));
  const recentArtistCounts = new Map<string, number>();
  const repeatedTrackCount = new Map<string, number>();
  for (const item of recentHistoryWindow) {
    if (item.artist) recentArtistCounts.set(item.artist, (recentArtistCounts.get(item.artist) ?? 0) + 1);
    const key = trackIdFrom(item.title, item.artist);
    repeatedTrackCount.set(key, (repeatedTrackCount.get(key) ?? 0) + 1);
  }
  const recurringArtists = [...artistCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));
  const recentTopArtists = [...recentArtistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));
  const knownArtistsBeforeRecent = new Set(
    history
      .filter((item) => !isWithinDays(item.createdAt, 7))
      .map((item) => item.artist?.toLowerCase().trim())
      .filter(Boolean) as string[],
  );
  const newArtistsLast7Days = new Set(
    recentHistoryWindow
      .map((item) => item.artist?.toLowerCase().trim())
      .filter((artist): artist is string => Boolean(artist && !knownArtistsBeforeRecent.has(artist))),
  ).size;
  const replayedTracksLast7Days = [...repeatedTrackCount.values()].filter((count) => count >= 2).length;
  const shortTermWindowDays = 7;
  const longTermWindowDays = 45;
  const shortTermArtistCounts = new Map<string, number>();
  const longTermArtistCounts = new Map<string, number>();
  const windowedHistory = history.filter((item) => isWithinDays(item.createdAt, longTermWindowDays));
  for (const item of windowedHistory) {
    if (!item.artist) continue;
    longTermArtistCounts.set(item.artist, (longTermArtistCounts.get(item.artist) ?? 0) + 1);
    if (isWithinDays(item.createdAt, shortTermWindowDays)) {
      shortTermArtistCounts.set(item.artist, (shortTermArtistCounts.get(item.artist) ?? 0) + 1);
    }
  }
  const shortTermTopArtists = [...shortTermArtistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  const longTermTopArtists = [...longTermArtistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  const artistShiftSummary = shortTermTopArtists[0] && longTermTopArtists[0]
    ? shortTermTopArtists[0].name === longTermTopArtists[0].name
      ? `Recent and longer-term listening both center on ${shortTermTopArtists[0].name}.`
      : `Recent listening shifted toward ${shortTermTopArtists[0].name} from longer-term ${longTermTopArtists[0].name}.`
    : "Not enough artist activity to compare short-term and long-term behavior.";

  const listeningWindows = history.reduce(
    (acc, item) => {
      acc[getUtcHourBucket(item.createdAt)] += 1;
      return acc;
    },
    { morning: 0, afternoon: 0, evening: 0, night: 0 },
  );
  const strongestWindow = (Object.entries(listeningWindows).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none") as
    | "morning"
    | "afternoon"
    | "evening"
    | "night"
    | "none";
  const strongestWindowShare = history.length > 0 && strongestWindow !== "none"
    ? Number((((listeningWindows as Record<string, number>)[strongestWindow] ?? 0) / history.length).toFixed(2))
    : 0;

  const underusedFavorites = favorites
    .map((fav) => {
      const key = trackIdFrom(fav.title, fav.artist);
      const latestHistory = history.find((entry) => trackIdFrom(entry.title, entry.artist) === key)?.createdAt ?? fav.savedAt;
      const days = daysSince(latestHistory);
      return {
        trackId: key,
        title: fav.title,
        artist: fav.artist,
        daysSinceLastPlay: days ?? 999,
      };
    })
    .filter((item) => item.daysSinceLastPlay >= 21)
    .sort((a, b) => b.daysSinceLastPlay - a.daysSinceLastPlay)
    .slice(0, 6);
  const avgTracksPerPlaylist = playlists.length > 0
    ? Number((playlists.reduce((sum, playlist) => sum + (playlist.songs?.length ?? 0), 0) / playlists.length).toFixed(1))
    : 0;
  const historyEvents = history.length;
  const favoritesCount = favorites.length;
  const playlistsCount = playlists.length;
  const dataRichness: "sparse" | "growing" | "rich" = historyEvents >= 35
    ? "rich"
    : historyEvents >= 10 || favoritesCount >= 8
      ? "growing"
      : "sparse";
  const strategyHint = dataRichness === "rich"
    ? "Prioritize concrete recent behavior and repeated artists before broader discovery."
    : dataRichness === "growing"
      ? "Blend known listening signals with stated preferences; keep discovery adjacent."
      : "Prefer stated onboarding taste profile and explicit goals over generic suggestions.";
  const [recentTop] = recentTopArtists;
  const [overallTop] = [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  const recentTrendSummary = recentTop && overallTop
    ? recentTop.name === overallTop.name
      ? `Recent listening is still centered on ${recentTop.name}.`
      : `Recent listens are shifting toward ${recentTop.name} versus all-time ${overallTop.name}.`
    : "Not enough listening activity to infer a short-term shift yet.";

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
    context: {
      deviceType: hints?.deviceType?.slice(0, 40),
      dayOfWeek: new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
      hourUtc: new Date().getUTCHours(),
    },
    stats: {
      topGenres: [],
      topArtists: [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
      recentTopArtists,
      recurringArtists,
      recentTrendSummary,
      novelty: {
        newArtistsLast7Days,
        replayedTracksLast7Days,
      },
      playlistPatterns: {
        totalPlaylists: playlists.length,
        avgTracksPerPlaylist,
        topPlaylistNames: playlists.slice(0, 5).map((playlist) => playlist.name),
      },
      tasteShifts: {
        shortTermWindowDays,
        longTermWindowDays,
        shortTermTopArtists,
        longTermTopArtists,
        artistShiftSummary,
      },
      listeningWindows: {
        ...listeningWindows,
        strongestWindow,
        strongestWindowShare,
      },
      favoritesBehavior: {
        underusedFavorites,
        underusedCount: underusedFavorites.length,
      },
    },
    grounding: {
      dataRichness,
      historyEvents,
      favoritesCount,
      playlistsCount,
      strategyHint,
    },
    statedPreferences: hints?.statedPreferences
      ? {
        genres: (hints.statedPreferences.genres ?? []).slice(0, 8),
        artists: (hints.statedPreferences.artists ?? []).slice(0, 8),
        moods: (hints.statedPreferences.moods ?? []).slice(0, 8),
        goals: (hints.statedPreferences.goals ?? []).slice(0, 8),
        source: "onboarding",
      }
      : undefined,
  };

  console.info(`[assistant] Context built: ${topTracks.length} tracks, ${playlists.length} playlists, ${favorites.length} favorites`);
  const trimmed = trimToBudget(payload);
  contextCache.set(cacheKey, { payload: trimmed, expiresAt: now + CACHE_TTL_MS });
  return trimmed;
}
