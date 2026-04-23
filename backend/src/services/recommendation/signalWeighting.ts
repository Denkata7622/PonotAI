import type { FavoriteRecord, PlaylistRecord, SearchHistoryRecord, UserRecord } from "../../db/authStore";
import { normalizeTrackKey } from "../../utils/songIdentity";

export type SignalSparseState = "sparse" | "growing" | "rich";

export type RecommendationSignalInput = {
  history: SearchHistoryRecord[];
  favorites: FavoriteRecord[];
  playlists: PlaylistRecord[];
  onboardingSeed?: {
    genres?: string[];
    moods?: string[];
    contexts?: string[];
    favoriteArtists?: string[];
  };
  intent?: Pick<UserRecord, "recommendationMode" | "repeatedArtistTolerance" | "energyPreference" | "recommendationDataSharingEnabled">;
};

type RecommendationIntentSignals = NonNullable<RecommendationSignalInput["intent"]>;

export type RecommendationSignalModel = {
  groupedSignals: {
    identity: {
      ultraLikedCount: number;
      favoritesCount: number;
      recurringArtists: Array<{ artist: string; count: number }>;
      onboardingFavoriteArtists: string[];
    };
    behavior: {
      historyEventsTotal: number;
      recentHistoryEvents14d: number;
      replayedTracks7d: number;
      playlistTrackCount: number;
      recentTopArtists: Array<{ artist: string; count: number }>;
    };
    intent: {
      recommendationMode: RecommendationIntentSignals["recommendationMode"] | "balanced";
      repeatedArtistTolerance: RecommendationIntentSignals["repeatedArtistTolerance"] | "normal";
      energyPreference: RecommendationIntentSignals["energyPreference"] | "mixed";
      recommendationDataSharingEnabled: boolean;
    };
    seed: {
      onboardingGenres: string[];
      onboardingMoods: string[];
      onboardingContexts: string[];
      onboardingFavoriteArtists: string[];
      sparseBoost: number;
    };
    confidence: {
      sparseState: SignalSparseState;
      recencyCoverage14d: number;
      crossSignalAgreement: number;
      explicitVsInferredRatio: number;
    };
  };
  scores: {
    identity: number;
    behavior: number;
    intent: number;
    seed: number;
    confidence: number;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeName(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function isWithinDays(value: string | undefined, days: number): boolean {
  if (!value) return false;
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= days * DAY_MS;
}

function toScore(raw: number, scale: number): number {
  if (scale <= 0) return 0;
  return clamp01(raw / scale);
}

export function buildRecommendationSignalModel(input: RecommendationSignalInput): RecommendationSignalModel {
  const history = input.history;
  const favorites = input.favorites;
  const playlists = input.playlists;
  const onboarding = input.onboardingSeed;

  const ultraLikedFavorites = favorites.filter((item) => item.ultraLiked);
  const historyEventsTotal = history.length;
  const recentHistoryEvents14d = history.filter((item) => isWithinDays(item.createdAt, 14)).length;
  const recentHistory7d = history.filter((item) => isWithinDays(item.createdAt, 7));
  const playlistTrackCount = playlists.reduce((sum, playlist) => sum + (playlist.songs?.length ?? 0), 0);

  const recentTrackCounts = new Map<string, number>();
  const allArtistCounts = new Map<string, number>();
  const recentArtistCounts = new Map<string, number>();
  for (const entry of history) {
    const key = normalizeTrackKey(entry.title, entry.artist);
    if (isWithinDays(entry.createdAt, 7)) recentTrackCounts.set(key, (recentTrackCounts.get(key) ?? 0) + 1);

    const artist = normalizeName(entry.artist);
    if (!artist) continue;
    allArtistCounts.set(artist, (allArtistCounts.get(artist) ?? 0) + 1);
    if (isWithinDays(entry.createdAt, 14)) recentArtistCounts.set(artist, (recentArtistCounts.get(artist) ?? 0) + 1);
  }
  for (const fav of favorites) {
    const artist = normalizeName(fav.artist);
    if (!artist) continue;
    allArtistCounts.set(artist, (allArtistCounts.get(artist) ?? 0) + 2);
  }

  const recurringArtists = [...allArtistCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([artist, count]) => ({ artist, count }));
  const recentTopArtists = [...recentArtistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([artist, count]) => ({ artist, count }));

  const replayedTracks7d = [...recentTrackCounts.values()].filter((count) => count >= 2).length;

  const sparseState: SignalSparseState = historyEventsTotal >= 35
    ? "rich"
    : historyEventsTotal >= 10 || favorites.length >= 8
      ? "growing"
      : "sparse";
  const sparseBoost = sparseState === "sparse" ? 1 : sparseState === "growing" ? 0.6 : 0.25;

  const onboardingGenres = (onboarding?.genres ?? []).slice(0, 8);
  const onboardingMoods = (onboarding?.moods ?? []).slice(0, 8);
  const onboardingContexts = (onboarding?.contexts ?? []).slice(0, 8);
  const onboardingFavoriteArtists = (onboarding?.favoriteArtists ?? []).slice(0, 8);

  const intent = {
    recommendationMode: input.intent?.recommendationMode ?? "balanced",
    repeatedArtistTolerance: input.intent?.repeatedArtistTolerance ?? "normal",
    energyPreference: input.intent?.energyPreference ?? "mixed",
    recommendationDataSharingEnabled: input.intent?.recommendationDataSharingEnabled ?? false,
  } as const;

  const recencyCoverage14d = historyEventsTotal > 0 ? clamp01(recentHistoryEvents14d / historyEventsTotal) : 0;
  const explicitSignalCount = ultraLikedFavorites.length + favorites.length + onboardingFavoriteArtists.length + onboardingGenres.length + onboardingMoods.length;
  const inferredSignalCount = historyEventsTotal + playlistTrackCount;
  const explicitVsInferredRatio = explicitSignalCount + inferredSignalCount > 0
    ? clamp01(explicitSignalCount / (explicitSignalCount + inferredSignalCount))
    : 0;

  const recurringArtistsSet = new Set(recurringArtists.map((item) => item.artist));
  const onboardingArtistAgreement = onboardingFavoriteArtists.length > 0
    ? onboardingFavoriteArtists.filter((artist) => recurringArtistsSet.has(normalizeName(artist))).length / onboardingFavoriteArtists.length
    : 0;
  const crossSignalAgreement = clamp01((onboardingArtistAgreement * 0.6) + (recencyCoverage14d * 0.4));

  const identityScore = toScore(
    (ultraLikedFavorites.length * 4) + (favorites.length * 1.8) + (recurringArtists.length * 1.4) + (onboardingFavoriteArtists.length * 0.8 * sparseBoost),
    26,
  );

  const behaviorScore = toScore(
    (recentHistoryEvents14d * 0.7) + (replayedTracks7d * 1.2) + Math.min(playlistTrackCount, 30) * 0.2,
    22,
  );

  const intentScore = toScore(
    (intent.recommendationMode === "mostly_discovery" ? 1 : intent.recommendationMode === "balanced" ? 0.75 : 0.5)
      + (intent.repeatedArtistTolerance === "higher" ? 1 : intent.repeatedArtistTolerance === "normal" ? 0.75 : 0.5)
      + (intent.energyPreference === "more_energetic" ? 1 : intent.energyPreference === "mixed" ? 0.75 : 0.5),
    3,
  );

  const seedScore = toScore(
    ((onboardingGenres.length * 0.8) + (onboardingMoods.length * 0.8) + (onboardingContexts.length * 0.6) + (onboardingFavoriteArtists.length * 1.1)) * sparseBoost,
    10,
  );

  const confidenceScore = clamp01((recencyCoverage14d * 0.35) + (crossSignalAgreement * 0.35) + ((1 - explicitVsInferredRatio) * 0.3));

  return {
    groupedSignals: {
      identity: {
        ultraLikedCount: ultraLikedFavorites.length,
        favoritesCount: favorites.length,
        recurringArtists,
        onboardingFavoriteArtists,
      },
      behavior: {
        historyEventsTotal,
        recentHistoryEvents14d,
        replayedTracks7d,
        playlistTrackCount,
        recentTopArtists,
      },
      intent,
      seed: {
        onboardingGenres,
        onboardingMoods,
        onboardingContexts,
        onboardingFavoriteArtists,
        sparseBoost,
      },
      confidence: {
        sparseState,
        recencyCoverage14d,
        crossSignalAgreement,
        explicitVsInferredRatio,
      },
    },
    scores: {
      identity: identityScore,
      behavior: behaviorScore,
      intent: intentScore,
      seed: seedScore,
      confidence: confidenceScore,
    },
  };
}

export function blendSignalScores(
  model: RecommendationSignalModel,
  profile: "music_packs" | "discovery" | "taste_identity" | "assistant_reasoning",
): number {
  const weights = profile === "music_packs"
    ? { identity: 0.45, behavior: 0.25, intent: 0.1, seed: 0.05, confidence: 0.15 }
    : profile === "taste_identity"
      ? { identity: 0.55, behavior: 0.15, intent: 0.05, seed: 0.1, confidence: 0.15 }
      : profile === "assistant_reasoning"
        ? { identity: 0.35, behavior: 0.25, intent: 0.15, seed: 0.1, confidence: 0.15 }
        : { identity: 0.3, behavior: 0.3, intent: 0.2, seed: 0.05, confidence: 0.15 };

  return clamp01(
    (model.scores.identity * weights.identity)
      + (model.scores.behavior * weights.behavior)
      + (model.scores.intent * weights.intent)
      + (model.scores.seed * weights.seed)
      + (model.scores.confidence * weights.confidence),
  );
}
