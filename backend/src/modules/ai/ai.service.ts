import { randomUUID } from "node:crypto";
import {
  findUserById,
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
import { blendSignalScores, buildRecommendationSignalModel } from "../../services/recommendation/signalWeighting";
import { normalizeTrackKey as trackKey } from "../../utils/songIdentity";

const DAY_MS = 24 * 60 * 60 * 1000;

function normalize(value?: string): string {
  return (value ?? "").toLowerCase().trim();
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

export async function saveFeaturedMusicPack(userId: string, payload: {
  packId: string;
  title: string;
  tracks: Array<{ title: string; artist: string; album?: string; coverUrl?: string; trackKey?: string }>;
  selectedTrackKeys?: string[];
}) {
  const cleanedTitle = payload.title.trim();
  const playlistName = cleanedTitle ? `${cleanedTitle} · Saved Pack` : "Saved Music Pack";
  const selectedKeys = new Set((payload.selectedTrackKeys ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0));

  const filteredTracks = selectedKeys.size > 0
    ? payload.tracks.filter((track) => track.trackKey && selectedKeys.has(track.trackKey.trim().toLowerCase()))
    : payload.tracks;

  const validTracks = filteredTracks
    .filter((track) => track.title && track.artist)
    .map((track) => ({
      title: track.title.trim(),
      artist: track.artist.trim(),
      album: track.album,
      coverUrl: track.coverUrl,
    }))
    .filter((track) => track.title.length > 0 && track.artist.length > 0);

  if (validTracks.length === 0) {
    throw new Error("MUSIC_PACK_EMPTY");
  }

  const playlist = await createPlaylist(userId, playlistName, randomUUID(), validTracks);
  return {
    playlist,
    savedTracks: validTracks.length,
    selectedTrackKeys: selectedKeys.size > 0 ? [...selectedKeys] : null,
    packId: payload.packId,
  };
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
  const [favorites, history, playlists, user] = await Promise.all([
    listFavorites(userId),
    listUserHistory(userId),
    getUserPlaylists(userId),
    findUserById(userId),
  ]);
  const signalModel = buildRecommendationSignalModel({
    history,
    favorites,
    playlists,
    intent: user
      ? {
        recommendationMode: user.recommendationMode,
        repeatedArtistTolerance: user.repeatedArtistTolerance,
        energyPreference: user.energyPreference,
        recommendationDataSharingEnabled: user.recommendationDataSharingEnabled,
      }
      : undefined,
  });
  const recentHistory = history.filter((item) => parseDate(item.createdAt) >= Date.now() - 14 * DAY_MS);
  const candidates = [...favorites, ...recentHistory, ...history]
    .filter((item) => item.title && item.artist)
    .map((item) => ({ title: item.title!, artist: item.artist!, album: item.album, coverUrl: item.coverUrl }));

  const deduped = new Map<string, { title: string; artist: string; album?: string; coverUrl?: string }>();
  for (const item of candidates) {
    deduped.set(trackKey(item.title, item.artist), item);
  }

  const recurringArtists = new Set(signalModel.groupedSignals.identity.recurringArtists.map((item) => normalizeName(item.artist)));
  const recentTopArtists = new Set(signalModel.groupedSignals.behavior.recentTopArtists.map((item) => normalizeName(item.artist)));
  const repeatedArtistLimit = getRepeatedArtistLimit(signalModel.groupedSignals.intent.repeatedArtistTolerance);
  const modeBoost = signalModel.groupedSignals.intent.recommendationMode === "mostly_discovery"
    ? 0.35
    : signalModel.groupedSignals.intent.recommendationMode === "safe_familiar"
      ? -0.2
      : 0;
  const sparseSeedLift = signalModel.groupedSignals.confidence.sparseState === "sparse" ? 0.25 : 0.08;

  const rankedCandidates = [...deduped.values()]
    .map((track) => {
      const artistKey = normalizeName(track.artist);
      const moodScore = rankTrackForMood(track, mood);
      const identityBoost = recurringArtists.has(artistKey) ? 0.9 : 0;
      const behaviorBoost = recentTopArtists.has(artistKey) ? 0.65 : 0;
      const energeticBias = signalModel.groupedSignals.intent.energyPreference === "more_energetic" && mood === "workout" ? 0.25 : 0;
      const calmerBias = signalModel.groupedSignals.intent.energyPreference === "calmer" && (mood === "sleep" || mood === "relax") ? 0.25 : 0;
      return {
        ...track,
        _score: moodScore + identityBoost + behaviorBoost + modeBoost + sparseSeedLift + energeticBias + calmerBias,
      };
    })
    .sort((a, b) => b._score - a._score);

  const artistCounts = new Map<string, number>();
  const tracks = rankedCandidates
    .filter((track) => {
      const artistKey = normalizeName(track.artist);
      const count = artistCounts.get(artistKey) ?? 0;
      if (count >= repeatedArtistLimit) return false;
      artistCounts.set(artistKey, count + 1);
      return true;
    })
    .slice(0, 20)
    .map(({ _score, ...track }) => track);
  const topArtists = topCounts(aggregateBase(history, favorites, []).artistCounts, 3).map((item) => item.name);
  const sourceBasis = {
    fromHistory: recentHistory.length,
    fromFavorites: favorites.length,
    inferredMood: mood,
    sparseLibrary: history.length < 8 && favorites.length < 5,
    controlsApplied: {
      recommendationMode: signalModel.groupedSignals.intent.recommendationMode,
      repeatedArtistTolerance: signalModel.groupedSignals.intent.repeatedArtistTolerance,
      energyPreference: signalModel.groupedSignals.intent.energyPreference,
    },
  };

  return {
    mood,
    presets: ["relax", "focus", "workout", "party", "sleep"],
    tracks,
    source: tracks.length > 0 ? "library" : "curated_fallback",
    explainability: {
      basis: tracks.length > 0
        ? `Ranked from ${recentHistory.length} recent plays plus ${favorites.length} favorites, then adjusted by identity anchors and recommendation controls.`
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

type MusicPackGenerationInput = {
  onboardingSeed?: {
    genres?: string[];
    moods?: string[];
    contexts?: string[];
    favoriteArtists?: string[];
  };
};

type MusicPackCandidate = {
  key: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  score: number;
  reasons: string[];
};

function normalizeName(value: string): string {
  return value.toLowerCase().trim();
}

function bucketSignalScore(score: number): "low" | "medium" | "high" {
  if (score >= 0.67) return "high";
  if (score >= 0.34) return "medium";
  return "low";
}

function getRepeatedArtistLimit(tolerance: "lower" | "normal" | "higher"): number {
  if (tolerance === "higher") return 3;
  if (tolerance === "lower") return 1;
  return 2;
}

function ensureDistinct(values: string[] = [], limit = 8): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeName(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
    if (output.length >= limit) break;
  }
  return output;
}

function summarizePackFlavor(
  model: ReturnType<typeof buildRecommendationSignalModel>,
  mode: "safe_familiar" | "balanced" | "mostly_discovery",
): { subtitle: string; moodLabel: string } {
  const energy = model.groupedSignals.intent.energyPreference;
  const moodLabel = energy === "more_energetic"
    ? "High Energy"
    : energy === "calmer"
      ? "Steady Focus"
      : "Balanced Motion";
  const subtitle = mode === "mostly_discovery"
    ? "Discovery-leaning drop shaped by your strongest identity signals."
    : mode === "safe_familiar"
      ? "Familiar-first drop grounded in your strongest songs."
      : "Balanced drop blending familiar anchors with fresh rotation.";
  return { subtitle, moodLabel };
}

function buildMusicPackCandidates(
  favorites: FavoriteRecord[],
  history: SearchHistoryRecord[],
  playlists: PlaylistRecord[],
  model: ReturnType<typeof buildRecommendationSignalModel>,
): MusicPackCandidate[] {
  const historyByKey = new Map<string, SearchHistoryRecord[]>();
  for (const item of history) {
    const key = trackKey(item.title, item.artist);
    const group = historyByKey.get(key) ?? [];
    group.push(item);
    historyByKey.set(key, group);
  }

  const playlistByKey = new Map<string, { title: string; artist: string; album?: string; coverUrl?: string; count: number }>();
  for (const playlist of playlists) {
    for (const track of playlist.songs ?? []) {
      const key = trackKey(track.title, track.artist);
      const existing = playlistByKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        playlistByKey.set(key, { title: track.title, artist: track.artist, album: track.album, coverUrl: track.coverUrl, count: 1 });
      }
    }
  }

  const candidates = new Map<string, MusicPackCandidate>();
  const addReason = (candidate: MusicPackCandidate, reason: string) => {
    if (!candidate.reasons.includes(reason)) candidate.reasons.push(reason);
  };

  for (const favorite of favorites) {
    const key = trackKey(favorite.title, favorite.artist);
    const existing = candidates.get(key) ?? {
      key,
      title: favorite.title,
      artist: favorite.artist,
      album: favorite.album,
      coverUrl: favorite.coverUrl,
      score: 0,
      reasons: [],
    };
    existing.score += favorite.ultraLiked ? 7.5 : 4.5;
    addReason(existing, favorite.ultraLiked ? "Seeded by your ultra-liked songs" : "Seeded by your favorites");
    candidates.set(key, existing);
  }

  for (const [key, entries] of historyByKey.entries()) {
    const latest = [...entries].sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt))[0];
    const daysAgo = Math.max(0, (Date.now() - parseDate(latest.createdAt)) / DAY_MS);
    const recencyBonus = daysAgo <= 7 ? 3.4 : daysAgo <= 21 ? 2 : 0.8;
    const replayBonus = Math.min(entries.length, 5) * 0.55;
    const existing = candidates.get(key) ?? {
      key,
      title: latest.title ?? "Unknown Song",
      artist: latest.artist ?? "Unknown Artist",
      album: latest.album,
      coverUrl: latest.coverUrl,
      score: 0,
      reasons: [],
    };
    existing.score += recencyBonus + replayBonus;
    addReason(existing, "Shaped by your recent listening behavior");
    if (entries.length >= 2) addReason(existing, "You replayed this recently");
    candidates.set(key, existing);
  }

  for (const [key, song] of playlistByKey.entries()) {
    const existing = candidates.get(key) ?? {
      key,
      title: song.title,
      artist: song.artist,
      album: song.album,
      coverUrl: song.coverUrl,
      score: 0,
      reasons: [],
    };
    existing.score += Math.min(song.count, 3) * 0.85;
    addReason(existing, "Supported by your playlist library");
    candidates.set(key, existing);
  }

  const onboardingArtists = new Set(model.groupedSignals.seed.onboardingFavoriteArtists.map((artist) => normalizeName(artist)));
  const topRecentArtists = new Set(model.groupedSignals.behavior.recentTopArtists.map((item) => normalizeName(item.artist)));
  const intent = model.groupedSignals.intent;
  const withIntent = [...candidates.values()].map((candidate) => {
    const artistKey = normalizeName(candidate.artist);
    if (onboardingArtists.has(artistKey)) {
      candidate.score += 1.4;
      addReason(candidate, "Matches your onboarding favorite artists");
    }
    if (topRecentArtists.has(artistKey)) candidate.score += 1.2;

    const mood = inferMood(`${candidate.title} ${candidate.artist} ${candidate.album ?? ""}`);
    if (intent.energyPreference === "more_energetic" && (mood === "workout" || mood === "party")) {
      candidate.score += 0.7;
      addReason(candidate, "Leans energetic for your current preference");
    } else if (intent.energyPreference === "calmer" && (mood === "relax" || mood === "focus")) {
      candidate.score += 0.7;
      addReason(candidate, "Leans calmer for your current preference");
    }
    return candidate;
  });

  return withIntent.sort((a, b) => b.score - a.score);
}

function scoreCrossArtistDiscoveryCandidate(
  candidate: ExternalArtistCandidate,
  input: {
    signalModel: ReturnType<typeof buildRecommendationSignalModel>;
    artistPresenceCount: number;
    recentlySuggested: boolean;
    knownArtist: boolean;
  },
) {
  const signalModel = input.signalModel;
  const intent = signalModel.groupedSignals.intent;
  const sparseState = signalModel.groupedSignals.confidence.sparseState;
  const sparseBoost = signalModel.groupedSignals.seed.sparseBoost;
  const discoveryBlend = blendSignalScores(signalModel, "discovery");
  const recurringArtists = new Set(signalModel.groupedSignals.identity.recurringArtists.map((item) => normalizeName(item.artist)));
  const recentTopArtists = new Set(signalModel.groupedSignals.behavior.recentTopArtists.map((item) => normalizeName(item.artist)));
  const candidateArtist = normalizeName(candidate.artist);

  const baseSimilarity = candidate.similarityScore * 0.58;
  const modelAlignment = discoveryBlend * 0.18;
  const sourceExplorationBoost = candidate.source === "genre_seed" ? (sparseState === "sparse" ? 0.16 : 0.11) : 0.05;
  const sparseSeedLift = signalModel.scores.seed * sparseBoost * 0.12;

  let identityAffinity = 0;
  if (candidate.anchorArtist && recurringArtists.has(normalizeName(candidate.anchorArtist))) identityAffinity += 0.14;
  if (recentTopArtists.has(candidateArtist)) identityAffinity += 0.06;

  const noveltyPenalty = input.recentlySuggested ? 0.14 : 0;
  const knownArtistPenalty = input.knownArtist ? 0.06 : 0;
  const overPresencePenalty = input.artistPresenceCount >= getRepeatedArtistLimit(intent.repeatedArtistTolerance)
    ? 0.14
    : input.artistPresenceCount > 0
      ? 0.06
      : 0;

  const modeAdjustment = intent.recommendationMode === "mostly_discovery"
    ? 0.07
    : intent.recommendationMode === "safe_familiar"
      ? -0.03
      : 0.02;

  const confidence = Math.max(0.24, Math.min(
    0.97,
    baseSimilarity
      + modelAlignment
      + sourceExplorationBoost
      + sparseSeedLift
      + identityAffinity
      + modeAdjustment
      - noveltyPenalty
      - knownArtistPenalty
      - overPresencePenalty,
  ));

  return {
    score: confidence,
    confidence,
    reasons: [
      candidate.anchorArtist
        ? `Discovery bridge from ${candidate.anchorArtist}.`
        : "Discovery seed aligned to your genre profile.",
      sparseState === "sparse"
        ? "Boosted for sparse-data discovery support."
        : "Balanced by recent behavior and identity anchors.",
      intent.recommendationMode === "mostly_discovery"
        ? "Leans exploratory based on your recommendation mode."
        : intent.recommendationMode === "safe_familiar"
          ? "Tempered toward familiarity from your controls."
          : "Balanced mode keeps familiar and fresh artists in rotation.",
    ],
  };
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
  const user = await findUserById(userId);
  const signalModel = buildRecommendationSignalModel({
    history,
    favorites,
    playlists,
    intent: user
      ? {
        recommendationMode: user.recommendationMode,
        repeatedArtistTolerance: user.repeatedArtistTolerance,
        energyPreference: user.energyPreference,
        recommendationDataSharingEnabled: user.recommendationDataSharingEnabled,
      }
      : undefined,
  });

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
      const artistKey = normalizeName(item.artist);
      const scored = scoreCrossArtistDiscoveryCandidate(item, {
        signalModel,
        artistPresenceCount: profile.artistCounts.get(item.artist) ?? 0,
        recentlySuggested: recentlySuggested.has(artistKey),
        knownArtist: knownArtists.has(artistKey),
      });
      return {
        artist: item.artist,
        source: "external-discovery" as const,
        score: scored.score,
        confidence: scored.confidence,
        reasons: [
          ...scored.reasons,
          profile.topGenres[0]?.[0] ? `Aligned with your ${profile.topGenres[0][0]} profile.` : "Aligned with your listening patterns.",
        ],
        sampleTracks: item.sampleTracks,
        isInLibrary: knownArtists.has(artistKey),
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
    signalSummary: {
      identity: bucketSignalScore(signalModel.scores.identity),
      behavior: bucketSignalScore(signalModel.scores.behavior),
      intent: signalModel.groupedSignals.intent.recommendationMode,
      confidence: signalModel.groupedSignals.confidence.sparseState,
    },
    controlsApplied: {
      recommendationMode: signalModel.groupedSignals.intent.recommendationMode,
      repeatedArtistTolerance: signalModel.groupedSignals.intent.repeatedArtistTolerance,
      energyPreference: signalModel.groupedSignals.intent.energyPreference,
    },
    sparseState: signalModel.groupedSignals.confidence.sparseState,
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
        : "Personalized blend: identity anchors, recency behavior, controls, and diversity guardrails all shape ranking.",
    },
  };
}

export async function generateFeaturedMusicPack(userId: string, input: MusicPackGenerationInput = {}) {
  const [history, favorites, playlists, user] = await Promise.all([
    listUserHistory(userId),
    listFavorites(userId),
    getUserPlaylists(userId),
    findUserById(userId),
  ]);

  const onboardingSeed = {
    genres: ensureDistinct(input.onboardingSeed?.genres),
    moods: ensureDistinct(input.onboardingSeed?.moods),
    contexts: ensureDistinct(input.onboardingSeed?.contexts),
    favoriteArtists: ensureDistinct(input.onboardingSeed?.favoriteArtists),
  };

  const signalModel = buildRecommendationSignalModel({
    history,
    favorites,
    playlists,
    onboardingSeed,
    intent: user
      ? {
        recommendationMode: user.recommendationMode,
        repeatedArtistTolerance: user.repeatedArtistTolerance,
        energyPreference: user.energyPreference,
        recommendationDataSharingEnabled: user.recommendationDataSharingEnabled,
      }
      : undefined,
  });

  const mode = signalModel.groupedSignals.intent.recommendationMode;
  const targetCount = mode === "safe_familiar" ? 8 : mode === "mostly_discovery" ? 12 : 10;
  const baseCandidates = buildMusicPackCandidates(favorites, history, playlists, signalModel);

  const repeatedArtistLimit = signalModel.groupedSignals.intent.repeatedArtistTolerance === "higher"
    ? 3
    : signalModel.groupedSignals.intent.repeatedArtistTolerance === "lower"
      ? 1
      : 2;
  const selectedArtists = new Map<string, number>();
  const selected = [];
  for (const candidate of baseCandidates) {
    const artistKey = normalizeName(candidate.artist);
    const currentArtistCount = selectedArtists.get(artistKey) ?? 0;
    if (currentArtistCount >= repeatedArtistLimit) continue;
    selected.push(candidate);
    selectedArtists.set(artistKey, currentArtistCount + 1);
    if (selected.length >= targetCount) break;
  }

  const packBlendScore = blendSignalScores(signalModel, "music_packs");
  const sparseState = signalModel.groupedSignals.confidence.sparseState;
  const status = selected.length >= 4 ? "available" : selected.length > 0 ? "limited" : "insufficient_data";
  const flavor = summarizePackFlavor(signalModel, mode);
  const recurringArtists = signalModel.groupedSignals.identity.recurringArtists.slice(0, 3).map((item) => item.artist);
  const titleSeed = recurringArtists[0] ?? onboardingSeed.genres[0] ?? onboardingSeed.moods[0] ?? "Identity";

  return {
    status,
    generatedAt: new Date().toISOString(),
    pack: status === "insufficient_data"
      ? null
      : {
        id: `pack-${new Date().toISOString().slice(0, 10)}`,
        title: `${titleSeed} Drop 001`,
        subtitle: flavor.subtitle,
        moodLabel: flavor.moodLabel,
        songCount: selected.length,
        tracks: selected.map((track, index) => ({
          rank: index + 1,
          trackKey: track.key,
          title: track.title,
          artist: track.artist,
          album: track.album,
          coverUrl: track.coverUrl,
          reason: track.reasons[0] ?? "Included from your strongest listening signals.",
          reasonSignals: track.reasons.slice(0, 2),
        })),
        explanation: {
          summary: "Built from ultra-liked songs first, then favorites, recency behavior, and onboarding fallback when sparse.",
          basis: [
            `Ultra-liked anchors: ${signalModel.groupedSignals.identity.ultraLikedCount}`,
            `Favorites considered: ${signalModel.groupedSignals.identity.favoritesCount}`,
            `Recent listens (14d): ${signalModel.groupedSignals.behavior.recentHistoryEvents14d}`,
            `Onboarding seeds used: ${onboardingSeed.genres.length + onboardingSeed.moods.length + onboardingSeed.contexts.length + onboardingSeed.favoriteArtists.length}`,
            `Recommendation mode: ${mode.replace("_", " ")}`,
          ],
        },
      },
    foundation: {
      sparseState,
      blendScore: packBlendScore,
      controls: signalModel.groupedSignals.intent,
      candidatePoolSize: baseCandidates.length,
      fallbackUsed: sparseState !== "rich",
    },
    message: status === "available"
      ? "Your first real Music Pack is ready."
      : status === "limited"
        ? "Your pack is available with limited depth while your signals grow."
        : "Not enough usable music data yet to generate an honest pack.",
  };
}

export async function getTasteIdentitySummary(userId: string, input: MusicPackGenerationInput = {}) {
  const [history, favorites, playlists, user] = await Promise.all([
    listUserHistory(userId),
    listFavorites(userId),
    getUserPlaylists(userId),
    findUserById(userId),
  ]);

  const onboardingSeed = {
    genres: ensureDistinct(input.onboardingSeed?.genres),
    moods: ensureDistinct(input.onboardingSeed?.moods),
    contexts: ensureDistinct(input.onboardingSeed?.contexts),
    favoriteArtists: ensureDistinct(input.onboardingSeed?.favoriteArtists),
  };

  const signalModel = buildRecommendationSignalModel({
    history,
    favorites,
    playlists,
    onboardingSeed,
    intent: user
      ? {
        recommendationMode: user.recommendationMode,
        repeatedArtistTolerance: user.repeatedArtistTolerance,
        energyPreference: user.energyPreference,
        recommendationDataSharingEnabled: user.recommendationDataSharingEnabled,
      }
      : undefined,
  });
  const blendedIdentityConfidence = blendSignalScores(signalModel, "taste_identity");
  const grouped = signalModel.groupedSignals;
  const sparseState = grouped.confidence.sparseState;

  const onboardingSeedCount = onboardingSeed.genres.length
    + onboardingSeed.moods.length
    + onboardingSeed.contexts.length
    + onboardingSeed.favoriteArtists.length;
  const stableArtists = grouped.identity.recurringArtists.slice(0, 3).map((item) => item.artist);
  const recentDirectionArtists = grouped.behavior.recentTopArtists.slice(0, 2).map((item) => item.artist);

  const coreIdentity = grouped.identity.ultraLikedCount >= 2
    ? `Your core taste is anchored by ${grouped.identity.ultraLikedCount} ultra-liked track${grouped.identity.ultraLikedCount === 1 ? "" : "s"}${stableArtists.length ? ` with recurring pulls toward ${stableArtists.join(" and ")}` : ""}.`
    : grouped.identity.favoritesCount >= 5
      ? `Your core taste is currently favorite-led${stableArtists.length ? ` and reinforced by recurring artists like ${stableArtists.join(" and ")}` : ""}.`
      : stableArtists.length
        ? `Your core taste is forming around recurring artists such as ${stableArtists.join(" and ")}.`
        : onboardingSeedCount > 0
          ? "Your core taste is still early and currently shaped by onboarding seeds plus first saves."
          : "Your core taste is still learning from your first listening signals.";

  const currentDirection = grouped.behavior.recentHistoryEvents14d >= 3
    ? `Current direction: recent listening leans toward ${recentDirectionArtists.join(" and ") || "your latest rotations"}, and this is treated as short-term movement.`
    : "Current direction: recent behavior is still light, so short-term trend detection is limited.";

  const anchors: string[] = [
    grouped.identity.ultraLikedCount > 0
      ? `Ultra-like anchors: ${grouped.identity.ultraLikedCount}`
      : "Ultra-like anchors still forming",
    grouped.identity.favoritesCount > 0
      ? `Favorites signal: ${grouped.identity.favoritesCount} saved`
      : "Favorites signal is still light",
    stableArtists.length > 0
      ? `Recurring artists: ${stableArtists.join(" · ")}`
      : "Recurring artist pattern still forming",
    grouped.behavior.recentHistoryEvents14d > 0
      ? `Recent direction: ${grouped.behavior.recentHistoryEvents14d} listens in 14 days`
      : "Recent direction: no 14-day listening signal yet",
    sparseState === "sparse" && onboardingSeedCount > 0
      ? `Onboarding support active: ${onboardingSeedCount} seed cues`
      : "Onboarding influence tapered as behavior matured",
  ];

  const evidence: string[] = [
    `Identity evidence combines ultra-likes (${grouped.identity.ultraLikedCount}), favorites (${grouped.identity.favoritesCount}), and recurring artists (${grouped.identity.recurringArtists.length}).`,
    `Behavior evidence tracks recent listens (${grouped.behavior.recentHistoryEvents14d} in 14 days) and replay patterns (${grouped.behavior.replayedTracks7d} repeated tracks in 7 days).`,
    sparseState === "sparse"
      ? "Confidence is still early: onboarding and explicit saves are carrying more weight until listening depth grows."
      : sparseState === "growing"
        ? "Confidence is improving: stable identity anchors are established while recency still refines direction."
        : "Confidence is strong: long-term identity anchors and ongoing behavior are in good agreement.",
  ];

  const confidenceNote = sparseState === "sparse"
    ? "Still learning: this profile is directionally useful but not final."
    : sparseState === "growing"
      ? "Confidence is medium: your core taste is stable, with room for refinement."
      : "Confidence is high: your core taste is well-defined by repeated strong signals.";

  return {
    generatedAt: new Date().toISOString(),
    sparseState,
    coreIdentity,
    currentDirection,
    anchors,
    evidence,
    confidenceNote,
    foundation: {
      ultraLikedCount: grouped.identity.ultraLikedCount,
      favoritesCount: grouped.identity.favoritesCount,
      recurringArtists: stableArtists,
      recentHistoryEvents14d: grouped.behavior.recentHistoryEvents14d,
      onboardingSeedCount,
      tasteIdentityConfidence: bucketSignalScore(blendedIdentityConfidence),
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
