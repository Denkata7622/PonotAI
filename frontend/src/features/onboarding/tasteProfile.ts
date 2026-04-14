export const GENRE_OPTIONS = [
  "Pop",
  "Hip-Hop",
  "Rock",
  "R&B",
  "Electronic",
  "House",
  "Techno",
  "Lo-fi",
  "Indie",
  "Alternative",
  "Jazz",
  "Classical",
  "Metal",
  "Folk",
  "Ambient",
  "Phonk",
] as const;

export const MOOD_OPTIONS = [
  "Energetic",
  "Calm",
  "Cinematic",
  "Dark",
  "Uplifting",
  "Aggressive",
  "Dreamy",
  "Focused",
  "Emotional",
] as const;

export const CONTEXT_OPTIONS = [
  "Focus",
  "Workout",
  "Commute",
  "Chill",
  "Night",
  "Party",
  "Study",
  "Discovery",
  "Background",
  "Mood boost",
] as const;

export const VIBE_OPTIONS = ["Focus", "Chill", "Energy", "Late-night", "Mood boost", "Workout"] as const;

export const RECOMMENDATION_STYLE_OPTIONS = ["familiar", "balanced", "discovery"] as const;
export const ENERGY_OPTIONS = ["low", "medium", "high", "mixed"] as const;
export const DISCOVERY_OPENNESS_OPTIONS = ["low", "medium", "high"] as const;

export type RecommendationStyle = (typeof RECOMMENDATION_STYLE_OPTIONS)[number];
export type EnergyPreference = (typeof ENERGY_OPTIONS)[number];
export type DiscoveryOpenness = (typeof DISCOVERY_OPENNESS_OPTIONS)[number];
export type VibePreference = (typeof VIBE_OPTIONS)[number];

export type StructuredTasteProfile = {
  genres: string[];
  moods: string[];
  contexts: string[];
  vibe: VibePreference;
  recommendationStyle: RecommendationStyle;
  energy: EnergyPreference;
  discoveryOpenness: DiscoveryOpenness;
  otherGenres?: string[];
  favoriteArtists?: string[];
};

export type TasteProfile = {
  genres: string[];
  artists: string[];
  moods: string[];
  goals: string[];
  completedAt: string;
  skipped?: boolean;
  structured?: StructuredTasteProfile;
};

export const TASTE_PROFILE_KEY = "trackly.onboarding.taste-profile";
export const ONBOARDING_PENDING_KEY = "trackly.onboarding.pending";

function normalizeList(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean))).slice(0, limit);
}

function normalizeEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value !== "string") return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function normalizeTasteProfile(input: Partial<TasteProfile> | null | undefined): TasteProfile {
  const structuredInput = input?.structured;
  const genres = normalizeList(input?.genres, 10);
  const artists = normalizeList(input?.artists, 8);
  const moods = normalizeList(input?.moods, 10);
  const goals = normalizeList(input?.goals, 10);

  const legacyRecommendation = goals.some((item) => item.toLowerCase().includes("discovery"))
    ? "discovery"
    : goals.some((item) => item.toLowerCase().includes("familiar"))
      ? "familiar"
      : "balanced";
  const legacyVibe = VIBE_OPTIONS.find((option) => moods.includes(option)) ?? "Chill";

  const structured: StructuredTasteProfile = {
    genres: normalizeList(structuredInput?.genres ?? genres, 10),
    moods: normalizeList(structuredInput?.moods ?? moods, 10),
    contexts: normalizeList(structuredInput?.contexts ?? goals, 10),
    vibe: normalizeEnumValue<VibePreference>(structuredInput?.vibe ?? legacyVibe, VIBE_OPTIONS, "Chill"),
    recommendationStyle: normalizeEnumValue<RecommendationStyle>(
      structuredInput?.recommendationStyle ?? legacyRecommendation,
      RECOMMENDATION_STYLE_OPTIONS,
      "balanced",
    ),
    energy: normalizeEnumValue<EnergyPreference>(structuredInput?.energy, ENERGY_OPTIONS, "mixed"),
    discoveryOpenness: normalizeEnumValue<DiscoveryOpenness>(structuredInput?.discoveryOpenness, DISCOVERY_OPENNESS_OPTIONS, "medium"),
    otherGenres: normalizeList(structuredInput?.otherGenres, 4),
    favoriteArtists: normalizeList(structuredInput?.favoriteArtists ?? artists, 8),
  };

  return {
    genres,
    artists,
    moods,
    goals,
    completedAt: typeof input?.completedAt === "string" ? input.completedAt : new Date().toISOString(),
    skipped: Boolean(input?.skipped),
    structured,
  };
}

export function mapStructuredToLegacy(profile: StructuredTasteProfile): Pick<TasteProfile, "genres" | "artists" | "moods" | "goals"> {
  const genres = Array.from(new Set([...profile.genres, ...(profile.otherGenres ?? [])])).slice(0, 10);
  const artists = normalizeList(profile.favoriteArtists, 8);
  const moods = Array.from(new Set([...profile.moods, profile.vibe, profile.energy])).slice(0, 10);
  const goals = Array.from(
    new Set([
      ...profile.contexts,
      profile.recommendationStyle === "familiar"
        ? "Mostly familiar"
        : profile.recommendationStyle === "discovery"
          ? "Mostly discovery"
          : "Balanced",
      profile.discoveryOpenness,
    ]),
  ).slice(0, 10);

  return { genres, artists, moods, goals };
}


export type AssistantPreferencePayload = {
  genres: string[];
  artists: string[];
  moods: string[];
  goals: string[];
  recommendationStyle?: RecommendationStyle;
  energy?: EnergyPreference;
  discoveryOpenness?: DiscoveryOpenness;
  vibe?: VibePreference;
  contexts?: string[];
};

export function toAssistantPreferencePayload(profile: TasteProfile): AssistantPreferencePayload {
  const normalized = normalizeTasteProfile(profile);
  return {
    genres: normalized.genres,
    artists: normalized.artists,
    moods: normalized.moods,
    goals: normalized.goals,
    recommendationStyle: normalized.structured?.recommendationStyle,
    energy: normalized.structured?.energy,
    discoveryOpenness: normalized.structured?.discoveryOpenness,
    vibe: normalized.structured?.vibe,
    contexts: normalized.structured?.contexts ?? normalized.goals,
  };
}

export function readTasteProfile(): TasteProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TASTE_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TasteProfile;
    return normalizeTasteProfile(parsed);
  } catch {
    return null;
  }
}

export function isOnboardingPending(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_PENDING_KEY) === "pending";
}

export function markOnboardingPending(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_PENDING_KEY, "pending");
}

export function markOnboardingDone(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_PENDING_KEY, "done");
}

export function writeTasteProfile(profile: TasteProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TASTE_PROFILE_KEY, JSON.stringify(normalizeTasteProfile(profile)));
  markOnboardingDone();
}
