import { randomUUID } from "node:crypto";
import {
  createPlaylist,
  getTrackTags,
  getUserPlaylists,
  listFavorites,
  listUserHistory,
  setTrackTags,
  type FavoriteRecord,
  type PlaylistRecord,
  type SearchHistoryRecord,
  type TrackTagRecord,
} from "../../db/authStore";
import { getExternalDiscoveryClient, type ExternalArtistCandidate } from "../../services/assistant/externalDiscovery";

const DAY_MS = 24 * 60 * 60 * 1000;

function normalize(value?: string): string {
  return (value ?? "").toLowerCase().trim();
}

function trackKey(title?: string, artist?: string): string {
  return `${normalize(title)}|||${normalize(artist)}`;
}

function parseDate(iso?: string): number {
  if (!iso) return 0;
  const timestamp = new Date(iso).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function inferGenre(text: string): string {
  const lowered = normalize(text);
  if (/(indie|alternative|garage)/.test(lowered)) return "indie rock";
  if (/(hip hop|rap|trap)/.test(lowered)) return "hip-hop";
  if (/(edm|house|techno|dance)/.test(lowered)) return "electronic";
  if (/(r&b|soul)/.test(lowered)) return "r&b";
  if (/(jazz|blues)/.test(lowered)) return "jazz";
  if (/(classical|orchestra|piano)/.test(lowered)) return "classical";
  if (/(rock|metal|punk)/.test(lowered)) return "rock";
  if (/(pop)/.test(lowered)) return "pop";
  return "unknown";
}

function inferMood(text: string): string {
  const lowered = normalize(text);
  if (/(sleep|calm|ambient|rain)/.test(lowered)) return "relax";
  if (/(focus|study|instrumental|lofi)/.test(lowered)) return "focus";
  if (/(gym|workout|energy|power)/.test(lowered)) return "workout";
  if (/(party|dance|club)/.test(lowered)) return "party";
  if (/(sad|blue|melancholy)/.test(lowered)) return "reflective";
  return "neutral";
}

function aggregateBase(history: SearchHistoryRecord[], favorites: FavoriteRecord[], playlists: PlaylistRecord[]) {
  const artistCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const moodCounts = new Map<string, number>();
  const playsByTrack = new Map<string, number>();

  for (const item of history) {
    const key = trackKey(item.title, item.artist);
    playsByTrack.set(key, (playsByTrack.get(key) ?? 0) + 1);

    if (item.artist) artistCounts.set(item.artist, (artistCounts.get(item.artist) ?? 0) + 1);

    const text = `${item.title ?? ""} ${item.artist ?? ""} ${item.album ?? ""}`;
    const genre = inferGenre(text);
    const mood = inferMood(text);
    genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    moodCounts.set(mood, (moodCounts.get(mood) ?? 0) + 1);
  }

  for (const fav of favorites) {
    if (fav.artist) artistCounts.set(fav.artist, (artistCounts.get(fav.artist) ?? 0) + 2);
    const text = `${fav.title} ${fav.artist} ${fav.album ?? ""}`;
    genreCounts.set(inferGenre(text), (genreCounts.get(inferGenre(text)) ?? 0) + 2);
    moodCounts.set(inferMood(text), (moodCounts.get(inferMood(text)) ?? 0) + 2);
  }

  for (const playlist of playlists) {
    for (const song of playlist.songs ?? []) {
      const text = `${song.title} ${song.artist} ${song.album ?? ""}`;
      genreCounts.set(inferGenre(text), (genreCounts.get(inferGenre(text)) ?? 0) + 1);
      moodCounts.set(inferMood(text), (moodCounts.get(inferMood(text)) ?? 0) + 1);
    }
  }

  return {
    artistCounts,
    genreCounts,
    moodCounts,
    playsByTrack,
  };
}

function topCounts(input: Map<string, number>, size = 5): Array<{ name: string; count: number }> {
  return [...input.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, size)
    .map(([name, count]) => ({ name, count }));
}

function summarizeShift(genreCounts: Map<string, number>, recentGenreCounts: Map<string, number>): string {
  const [recentTop] = topCounts(recentGenreCounts, 1);
  const [allTimeTop] = topCounts(genreCounts, 1);
  if (!recentTop || !allTimeTop) return "Not enough data to detect a preference shift yet.";
  if (recentTop.name !== allTimeTop.name) {
    return `Your taste is shifting toward ${recentTop.name}.`;
  }
  return `Your current listening still centers on ${allTimeTop.name}.`;
}

function buildTrendPoints(history: SearchHistoryRecord[], days: number) {
  const now = Date.now();
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const date = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    buckets.set(date, 0);
  }

  for (const item of history) {
    const timestamp = parseDate(item.createdAt);
    if (!timestamp || now - timestamp > days * DAY_MS) continue;
    const date = new Date(timestamp).toISOString().slice(0, 10);
    buckets.set(date, (buckets.get(date) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .map(([date, count]) => ({ date, plays: count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getHourBucket(dateValue?: string): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date(dateValue ?? "").getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function calculateStreak(history: SearchHistoryRecord[]): number {
  const daySet = new Set(history.map((item) => item.createdAt.slice(0, 10)));
  const now = new Date();
  let streak = 0;
  for (let i = 0; i < 90; i += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10);
    if (!daySet.has(date)) break;
    streak += 1;
  }
  return streak;
}

export async function getListeningInsights(userId: string, period: "daily" | "weekly" | "monthly") {
  const [history, favorites, playlists] = await Promise.all([
    listUserHistory(userId),
    listFavorites(userId),
    getUserPlaylists(userId),
  ]);

  const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
  const now = Date.now();
  const windowHistory = history.filter((item) => now - parseDate(item.createdAt) <= days * DAY_MS);
  const recentSlice = history.filter((item) => now - parseDate(item.createdAt) <= 14 * DAY_MS);

  const aggregate = aggregateBase(windowHistory, favorites, playlists);
  const recentAggregate = aggregateBase(recentSlice, favorites, playlists);
  const topTracks = [...aggregate.playsByTrack.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => {
      const [title, artist] = key.split("|||");
      return { title: title || "Unknown", artist: artist || "Unknown", count };
    });
  const listeningWindows = windowHistory.reduce(
    (acc, item) => {
      acc[getHourBucket(item.createdAt)] += 1;
      return acc;
    },
    { morning: 0, afternoon: 0, evening: 0, night: 0 },
  );
  const longTermWindow = history.filter((item) => now - parseDate(item.createdAt) <= 60 * DAY_MS);
  const longTermAggregate = aggregateBase(longTermWindow, favorites, playlists);
  const [shortTopArtist] = topCounts(aggregate.artistCounts, 1);
  const [longTopArtist] = topCounts(longTermAggregate.artistCounts, 1);
  const underusedFavorites = favorites
    .map((fav) => {
      const recentPlay = history.find((item) => trackKey(item.title, item.artist) === trackKey(fav.title, fav.artist));
      const lastTouchedAt = parseDate(recentPlay?.createdAt ?? fav.savedAt);
      const daysAgo = lastTouchedAt > 0 ? Math.floor((now - lastTouchedAt) / DAY_MS) : 999;
      return { title: fav.title, artist: fav.artist, daysAgo };
    })
    .filter((item) => item.daysAgo >= 21)
    .sort((a, b) => b.daysAgo - a.daysAgo)
    .slice(0, 6);
  const noveltyRatio = windowHistory.length > 0
    ? Number((new Set(windowHistory.map((item) => trackKey(item.title, item.artist))).size / windowHistory.length).toFixed(2))
    : 0;

  return {
    period,
    generatedAt: new Date().toISOString(),
    totalPlays: windowHistory.length,
    uniqueTracks: aggregate.playsByTrack.size,
    tracksRecognized: windowHistory.filter((item) => item.recognized).length,
    topArtists: topCounts(aggregate.artistCounts),
    topTracks,
    favoriteGenres: topCounts(aggregate.genreCounts),
    favoriteMoods: topCounts(aggregate.moodCounts),
    trend: summarizeShift(aggregate.genreCounts, recentAggregate.genreCounts),
    streakDays: calculateStreak(history),
    listeningWindows,
    trendPoints: buildTrendPoints(windowHistory, days),
    analysis: {
      shortVsLongTerm: shortTopArtist && longTopArtist
        ? shortTopArtist.name === longTopArtist.name
          ? `Recent listening is consistent with your longer-term focus on ${shortTopArtist.name}.`
          : `Recent listening leans toward ${shortTopArtist.name} versus longer-term ${longTopArtist.name}.`
        : "Not enough activity to compare short-term and long-term patterns yet.",
      noveltyVsReplay: noveltyRatio >= 0.65
        ? "You are in a novelty-heavy phase with more unique track rotation."
        : "You are in a replay-heavy phase with stronger repeat behavior.",
      underusedFavorites,
    },
    explainability: {
      dataSources: {
        historyCount: history.length,
        favoritesCount: favorites.length,
        playlistsCount: playlists.length,
      },
      basis: "Insights are computed from recognized tracks, favorites, and playlist composition.",
    },
  };
}

export async function getActivitySummaries(userId: string) {
  const [daily, weekly, monthly] = await Promise.all([
    getListeningInsights(userId, "daily"),
    getListeningInsights(userId, "weekly"),
    getListeningInsights(userId, "monthly"),
  ]);
  return { generatedAt: new Date().toISOString(), daily, weekly, monthly };
}

export async function getListeningTrends(userId: string) {
  const history = await listUserHistory(userId);
  const monthly = buildTrendPoints(history, 30);
  const weekly = buildTrendPoints(history, 7);

  const morning = history.filter((item) => {
    const hour = new Date(item.createdAt).getHours();
    return hour >= 5 && hour < 12;
  }).length;
  const afternoon = history.filter((item) => {
    const hour = new Date(item.createdAt).getHours();
    return hour >= 12 && hour < 18;
  }).length;
  const evening = history.filter((item) => {
    const hour = new Date(item.createdAt).getHours();
    return hour >= 18 || hour < 5;
  }).length;

  return {
    generatedAt: new Date().toISOString(),
    weekly,
    monthly,
    listeningWindows: { morning, afternoon, evening },
    emergingPreference: weekly.at(-1)?.plays && weekly.at(-1)!.plays > (weekly.at(-2)?.plays ?? 0)
      ? "Listening volume is increasing — you may be open to discovery-heavy mixes."
      : "Listening volume is stable; keep balancing familiar and exploratory tracks.",
  };
}

function parseMoodInput(input: string): "relax" | "focus" | "workout" | "party" | "sleep" {
  const lowered = normalize(input);
  if (/(sleep|night|bed)/.test(lowered)) return "sleep";
  if (/(focus|study|work|deep)/.test(lowered)) return "focus";
  if (/(gym|run|workout|training)/.test(lowered)) return "workout";
  if (/(party|celebrate|dance)/.test(lowered)) return "party";
  return "relax";
}

function rankTrackForMood(track: { title?: string; artist?: string; album?: string }, mood: string): number {
  const text = `${track.title ?? ""} ${track.artist ?? ""} ${track.album ?? ""}`.toLowerCase();
  let score = 1;
  if (mood === inferMood(text)) score += 4;
  if (mood === "workout" && /(power|fast|run|beat|energy)/.test(text)) score += 2;
  if (mood === "focus" && /(instrumental|acoustic|study|ambient)/.test(text)) score += 2;
  if (mood === "sleep" && /(calm|sleep|night|dream)/.test(text)) score += 2;
  return score;
}

export async function generateSmartPlaylist(userId: string, prompt: string) {
  const [favorites, history, playlists] = await Promise.all([
    listFavorites(userId),
    listUserHistory(userId),
    getUserPlaylists(userId),
  ]);
  const mood = parseMoodInput(prompt);
  const seedTracks = [
    ...favorites.map((f) => ({ title: f.title, artist: f.artist, album: f.album, coverUrl: f.coverUrl })),
    ...history.map((h) => ({ title: h.title, artist: h.artist, album: h.album, coverUrl: h.coverUrl })),
  ].filter((item) => item.title && item.artist);

  const deduped = new Map<string, { title?: string; artist?: string; album?: string; coverUrl?: string }>();
  for (const track of seedTracks) deduped.set(trackKey(track.title, track.artist), track);

  const suggestions = [...deduped.values()]
    .sort((a, b) => rankTrackForMood(b, mood) - rankTrackForMood(a, mood))
    .slice(0, 25)
    .map((track) => ({
      trackId: trackKey(track.title, track.artist),
      title: track.title,
      artist: track.artist,
      album: track.album,
      coverUrl: track.coverUrl,
    }));

  const existingNames = new Set(playlists.map((item) => item.name.toLowerCase()));
  const baseName = `AI ${mood[0].toUpperCase()}${mood.slice(1)} Mix`;
  let name = baseName;
  let counter = 2;
  while (existingNames.has(name.toLowerCase())) {
    name = `${baseName} ${counter}`;
    counter += 1;
  }

  return {
    confirmationRequired: true,
    playlist: {
      name,
      description: `Generated for prompt: ${prompt.slice(0, 120)}`,
      mood,
      tracks: suggestions,
      basedOn: {
        favorites: favorites.length,
        recognitionHistory: history.length,
      },
    },
  };
}

export async function saveGeneratedPlaylist(userId: string, payload: { name: string; tracks: Array<{ title: string; artist: string; album?: string; coverUrl?: string; videoId?: string }> }) {
  const playlist = await createPlaylist(userId, payload.name, randomUUID(), payload.tracks);
  return playlist;
}

async function fetchWeatherContext(latitude: number, longitude: number): Promise<{ temperature: number; weatherCode: number } | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`;
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return null;
    const data = await response.json() as { current?: { temperature_2m?: number; weather_code?: number } };
    if (typeof data.current?.temperature_2m !== "number" || typeof data.current?.weather_code !== "number") return null;
    return { temperature: data.current.temperature_2m, weatherCode: data.current.weather_code };
  } catch {
    return null;
  }
}

export async function getMoodRecommendations(userId: string, moodInput: string) {
  const mood = parseMoodInput(moodInput);
  const [favorites, history] = await Promise.all([listFavorites(userId), listUserHistory(userId)]);
  const recentHistory = history.filter((item) => parseDate(item.createdAt) >= Date.now() - 14 * DAY_MS);
  const candidates = [...favorites, ...recentHistory, ...history]
    .filter((item) => item.title && item.artist)
    .map((item) => ({ title: item.title!, artist: item.artist!, album: item.album, coverUrl: item.coverUrl }));

  const deduped = new Map<string, { title: string; artist: string; album?: string; coverUrl?: string }>();
  for (const item of candidates) {
    deduped.set(trackKey(item.title, item.artist), item);
  }

  const tracks = [...deduped.values()]
    .sort((a, b) => rankTrackForMood(b, mood) - rankTrackForMood(a, mood))
    .slice(0, 20);
  const topArtists = topCounts(aggregateBase(history, favorites, []).artistCounts, 3).map((item) => item.name);
  const sourceBasis = {
    fromHistory: recentHistory.length,
    fromFavorites: favorites.length,
    inferredMood: mood,
    sparseLibrary: history.length < 8 && favorites.length < 5,
  };

  return {
    mood,
    presets: ["relax", "focus", "workout", "party", "sleep"],
    tracks,
    source: tracks.length > 0 ? "library" : "curated_fallback",
    explainability: {
      basis: tracks.length > 0
        ? `Ranked from ${recentHistory.length} recent plays plus ${favorites.length} favorites, tuned for mood=${mood}.`
        : "No substantial history/favorites signal yet; using fallback ordering.",
      recentEvents: recentHistory.length,
      favoritesCount: favorites.length,
      knownTopArtists: topArtists,
      sourceBasis,
    },
  };
}

export async function getContextualRecommendations(userId: string, context: { latitude?: number; longitude?: number; deviceType?: string }) {
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const hour = now.getUTCHours();
  const timeSlot = hour < 6 ? "late-night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const weather = (typeof context.latitude === "number" && typeof context.longitude === "number")
    ? await fetchWeatherContext(context.latitude, context.longitude)
    : null;

  const moodHint = weather && weather.temperature > 28 ? "relax" : timeSlot === "morning" ? "focus" : "party";
  const recommendations = await getMoodRecommendations(userId, moodHint);
  const grounding = recommendations.source === "library"
    ? "history_and_favorites"
    : "fallback_due_to_sparse_data";

  return {
    context: {
      dayOfWeek,
      timeSlot,
      deviceType: context.deviceType ?? "unknown",
      weather,
    },
    recommendations,
    grounding,
  };
}

export async function suggestTags(userId: string) {
  const [history, existing] = await Promise.all([listUserHistory(userId), getTrackTags(userId)]);
  const existingByKey = new Map(existing.map((item) => [item.trackKey, item]));
  const suggestions = history.slice(0, 100).map((item) => {
    const key = trackKey(item.title, item.artist);
    const text = `${item.title ?? ""} ${item.artist ?? ""} ${item.album ?? ""}`;
    return {
      trackKey: key,
      title: item.title,
      artist: item.artist,
      genre: inferGenre(text),
      mood: inferMood(text),
      tempo: /(fast|run|dance|power)/i.test(text) ? "high" : /(calm|sleep|slow)/i.test(text) ? "low" : "medium",
      isUpdate: existingByKey.has(key),
    };
  });

  const duplicateGroups = new Map<string, number>();
  for (const entry of history) {
    const key = trackKey(entry.title, entry.artist);
    duplicateGroups.set(key, (duplicateGroups.get(key) ?? 0) + 1);
  }

  return {
    confirmationRequired: true,
    suggestions,
    cleanup: [...duplicateGroups.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ trackKey: key, count })),
  };
}

export async function applyTags(userId: string, tags: Array<Pick<TrackTagRecord, "trackKey" | "genre" | "mood" | "tempo">>, confirmed: boolean) {
  if (!confirmed) {
    return { applied: 0, confirmationRequired: true };
  }

  if (!Array.isArray(tags)) {
    throw new Error("INVALID_TAG_PAYLOAD");
  }

  const sanitized = tags
    .filter((tag) => tag && typeof tag.trackKey === "string" && typeof tag.genre === "string" && typeof tag.mood === "string" && typeof tag.tempo === "string")
    .filter((tag) => tag.trackKey && tag.genre && tag.mood && tag.tempo)
    .slice(0, 100)
    .map((tag) => ({
      trackKey: tag.trackKey.trim().toLowerCase(),
      genre: tag.genre.trim().toLowerCase(),
      mood: tag.mood.trim().toLowerCase(),
      tempo: tag.tempo.trim().toLowerCase(),
    }));
  if (sanitized.length === 0) {
    throw new Error("SAFE_GUARD_EMPTY_TAG_REPLACE");
  }

  await setTrackTags(userId, sanitized);
  console.info("[assistant-safe-write] ai.tags.apply", { userId, count: sanitized.length, confirmed });
  return { applied: sanitized.length, confirmationRequired: false };
}

const discoveryCache = new Map<string, { date: string; payload: unknown }>();
const crossArtistMemory = new Map<string, { recent: string[] }>();

function normalizeName(value: string): string {
  return value.toLowerCase().trim();
}

function buildAnchorProfile(history: SearchHistoryRecord[], favorites: FavoriteRecord[], playlists: PlaylistRecord[]) {
  const artistCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const moodCounts = new Map<string, number>();

  for (const item of history) {
    const artist = item.artist?.trim();
    if (artist) artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
    const text = `${item.title ?? ""} ${item.artist ?? ""} ${item.album ?? ""}`;
    genreCounts.set(inferGenre(text), (genreCounts.get(inferGenre(text)) ?? 0) + 1);
    moodCounts.set(inferMood(text), (moodCounts.get(inferMood(text)) ?? 0) + 1);
  }

  for (const item of favorites) {
    if (item.artist) artistCounts.set(item.artist, (artistCounts.get(item.artist) ?? 0) + 2);
    const text = `${item.title ?? ""} ${item.artist ?? ""} ${item.album ?? ""}`;
    genreCounts.set(inferGenre(text), (genreCounts.get(inferGenre(text)) ?? 0) + 2);
    moodCounts.set(inferMood(text), (moodCounts.get(inferMood(text)) ?? 0) + 2);
  }

  for (const playlist of playlists) {
    for (const song of playlist.songs ?? []) {
      if (song.artist) artistCounts.set(song.artist, (artistCounts.get(song.artist) ?? 0) + 1);
      const text = `${song.title ?? ""} ${song.artist ?? ""} ${song.album ?? ""}`;
      genreCounts.set(inferGenre(text), (genreCounts.get(inferGenre(text)) ?? 0) + 1);
      moodCounts.set(inferMood(text), (moodCounts.get(inferMood(text)) ?? 0) + 1);
    }
  }

  return {
    anchorArtists: [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    topGenres: [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    topMoods: [...moodCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    artistCounts,
  };
}

export async function getCrossArtistRecommendations(
  userId: string,
  options: { differentArtistsOnly?: boolean; limit?: number } = {},
) {
  const differentArtistsOnly = options.differentArtistsOnly !== false;
  const limit = Math.min(Math.max(options.limit ?? 8, 3), 20);

  const [history, favorites, playlists] = await Promise.all([
    listUserHistory(userId),
    listFavorites(userId),
    getUserPlaylists(userId),
  ]);

  const profile = buildAnchorProfile(history, favorites, playlists);
  const knownArtists = new Set<string>();
  for (const [artist] of profile.anchorArtists) knownArtists.add(normalizeName(artist));

  const heavilyPresentArtists = new Set(
    [...profile.artistCounts.entries()].filter(([, count]) => count >= 2).map(([artist]) => normalizeName(artist)),
  );

  const memory = crossArtistMemory.get(userId) ?? { recent: [] };
  const recentlySuggested = new Set(memory.recent);
  const discoveryClient = getExternalDiscoveryClient();

  let externalAvailable = true;
  const candidates: ExternalArtistCandidate[] = [];
  try {
    for (const [artist] of profile.anchorArtists.slice(0, 3)) {
      const similar = await discoveryClient.findSimilarArtistsByArtist(artist);
      candidates.push(...similar);
    }
    if (candidates.length < 4) {
      for (const [genre] of profile.topGenres.slice(0, 2)) {
        const seeded = await discoveryClient.findArtistsByGenre(genre);
        candidates.push(...seeded);
      }
    }
  } catch {
    externalAvailable = false;
  }

  const fallbackLibrary = [...favorites, ...history].filter((item) => item.artist && item.title).slice(0, limit).map((item, idx) => ({
    artist: item.artist!,
    source: "library-fallback" as const,
    score: Math.max(0.2, 0.55 - idx * 0.03),
    confidence: Math.max(0.3, 0.7 - idx * 0.04),
    reasons: ["Based on your existing saved and recognized tracks."],
    sampleTracks: [{ title: item.title!, artist: item.artist!, album: item.album, previewUrl: undefined }],
    isInLibrary: true,
  }));

  const deduped = new Map<string, ExternalArtistCandidate>();
  for (const candidate of candidates) {
    const key = normalizeName(candidate.artist);
    if (!key) continue;
    if (!deduped.has(key) || (deduped.get(key)?.similarityScore ?? 0) < candidate.similarityScore) deduped.set(key, candidate);
  }

  const ranked = [...deduped.values()]
    .filter((item) => item.artist.trim().length > 0)
    .filter((item) => !differentArtistsOnly || !heavilyPresentArtists.has(normalizeName(item.artist)))
    .map((item) => {
      const noveltyPenalty = recentlySuggested.has(normalizeName(item.artist)) ? 0.15 : 0;
      const diversityBoost = item.source === "genre_seed" ? 0.08 : 0;
      const similarity = item.similarityScore;
      const novelty = Math.max(0, 1 - noveltyPenalty);
      const confidence = Math.max(0.25, Math.min(0.98, (similarity * 0.55) + (novelty * 0.3) + diversityBoost));
      return {
        artist: item.artist,
        source: "external-discovery" as const,
        score: confidence,
        confidence,
        reasons: [
          item.anchorArtist ? `Similar to ${item.anchorArtist} from your library.` : "Matches your dominant genres.",
          profile.topGenres[0]?.[0] ? `Aligned with your ${profile.topGenres[0][0]} preference.` : "Aligned with your listening patterns.",
        ],
        sampleTracks: item.sampleTracks,
        isInLibrary: knownArtists.has(normalizeName(item.artist)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const recommendations = ranked.length > 0
    ? ranked.map((entry) => ({ ...entry, isInLibrary: false }))
    : fallbackLibrary;

  const recommendationBasis = {
    fromListeningHistory: history.length,
    fromFavorites: favorites.length,
    fromPlaylists: playlists.length,
    usedExternalDiscovery: externalAvailable,
    sparseFallback: ranked.length === 0,
  };

  crossArtistMemory.set(userId, {
    recent: recommendations
      .map((item) => normalizeName(item.artist))
      .filter(Boolean)
      .slice(0, 30),
  });

  return {
    mode: "cross-artist",
    externalAvailable,
    message: externalAvailable
      ? "Recommendations combine your known taste with discovery expansion."
      : "I can still suggest based on your current library, but external discovery is temporarily unavailable.",
    anchors: {
      artistsKnownFromLibrary: profile.anchorArtists.map(([name, count]) => ({ name, weight: count })),
      genresKnownFromLibrary: profile.topGenres.map(([name, count]) => ({ name, weight: count })),
      moodsKnownFromLibrary: profile.topMoods.map(([name, count]) => ({ name, weight: count })),
    },
    recommendations,
    explainability: {
      recommendationBasis,
      interpretation: recommendationBasis.sparseFallback
        ? "Sparse library fallback: suggestions prioritize your known artists until broader signals appear."
        : "Personalized blend: anchored in your behavior with explicit exploration outside repeated artists.",
    },
  };
}

export async function getDailyDiscovery(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const cached = discoveryCache.get(userId);
  if (cached?.date === today) return { ...cached.payload as Record<string, unknown>, cached: true };

  const trends = await getListeningTrends(userId);
  const recommendations = await getMoodRecommendations(userId, "relax");
  const payload = {
    date: today,
    recommendations: recommendations.tracks.slice(0, 15),
    rationale: trends.emergingPreference,
  };
  discoveryCache.set(userId, { date: today, payload });
  return { ...payload, cached: false };
}

export async function getSurpriseDiscovery(userId: string) {
  const recommendations = await getMoodRecommendations(userId, "party");
  const pool = recommendations.tracks;
  if (pool.length === 0) {
    return { track: null, message: "Add more listening history for better surprise picks." };
  }
  const track = pool[Math.floor(Math.random() * pool.length)];
  return { track, message: "Surprise recommendation selected from your listening profile." };
}
