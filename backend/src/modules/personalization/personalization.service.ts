import type { UserRecord } from "../../db/authStore";
import { isValidThemePresetId, THEME_PRESET_IDS, type ThemePresetId } from "./themePresetCatalog";

export type PersonalizationPreferences = {
  themePresetId: ThemePresetId | null;
  updatedAt?: string;
};

export type PersonalizationRecommendation = {
  id: string;
  kind: "theme" | "layout" | "content" | "setting";
  title: string;
  description: string;
  presetId?: ThemePresetId;
  reason?: string;
  confidence?: number;
  action?: {
    type: "apply_theme_preset" | "open_settings";
    label: string;
    href?: string;
  };
};

export type PersonalizationPatchResult =
  | { ok: true; preferences: PersonalizationPreferences }
  | { ok: false; code: "INVALID_PERSONALIZATION_PATCH" | "INVALID_THEME_PRESET_ID"; message: string };

const allowedPatchKeys = new Set(["themePresetId"]);

const energeticPresetOrder: ThemePresetId[] = ["Arcade Pulse", "Neon Circuit", "Cyber Grid"];
const calmerPresetOrder: ThemePresetId[] = ["Stock Clean", "Organic Signal", "AI Minimal"];
const discoveryPresetOrder: ThemePresetId[] = ["Neon Circuit", "Urban Poster", "Cyber Grid"];
const familiarPresetOrder: ThemePresetId[] = ["AI Minimal", "Stock Clean", "Organic Signal"];
const balancedPresetOrder: ThemePresetId[] = ["Organic Signal", "Cyber Grid", "Urban Poster"];

function recommendationIdForPreset(presetId: ThemePresetId): string {
  return `theme:${presetId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

function dedupePresetIds(ids: ThemePresetId[]): ThemePresetId[] {
  return [...new Set(ids)].filter(isValidThemePresetId);
}

function getPresetOrderForUser(user: UserRecord | null): ThemePresetId[] {
  if (user?.energyPreference === "more_energetic") return energeticPresetOrder;
  if (user?.energyPreference === "calmer") return calmerPresetOrder;
  if (user?.recommendationMode === "mostly_discovery") return discoveryPresetOrder;
  if (user?.recommendationMode === "safe_familiar") return familiarPresetOrder;
  return balancedPresetOrder;
}

function describeThemeReason(presetId: ThemePresetId, user: UserRecord | null): string {
  if (!user) return "Starter recommendation from the real Turrex preset registry.";
  if (user.energyPreference === "more_energetic") return "Matches your more energetic recommendation preference.";
  if (user.energyPreference === "calmer") return "Matches your calmer recommendation preference.";
  if (user.recommendationMode === "mostly_discovery") return "Discovery-forward visual direction for your recommendation mode.";
  if (user.recommendationMode === "safe_familiar") return "Stable, familiar visual direction for your recommendation mode.";
  return `Balanced recommendation using your current settings and the ${presetId} preset.`;
}

export function toPersonalizationPreferences(user: Pick<UserRecord, "themePresetId" | "updatedAt" | "createdAt"> | null): PersonalizationPreferences {
  return {
    themePresetId: isValidThemePresetId(user?.themePresetId) ? user.themePresetId : null,
    updatedAt: user?.updatedAt ?? user?.createdAt,
  };
}

export function normalizePersonalizationPatch(input: unknown, current: PersonalizationPreferences): PersonalizationPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      code: "INVALID_PERSONALIZATION_PATCH",
      message: "Personalization patch must be an object with supported preference fields.",
    };
  }
  const body = input as { themePresetId?: unknown };
  const unknownKeys = Object.keys(body).filter((key) => !allowedPatchKeys.has(key));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      code: "INVALID_PERSONALIZATION_PATCH",
      message: `Unsupported personalization field: ${unknownKeys[0]}`,
    };
  }
  if (body.themePresetId === undefined) {
    return { ok: true, preferences: current };
  }
  if (body.themePresetId === null) {
    return { ok: true, preferences: { ...current, themePresetId: null } };
  }
  if (!isValidThemePresetId(body.themePresetId)) {
    return {
      ok: false,
      code: "INVALID_THEME_PRESET_ID",
      message: "themePresetId must be one of the registered Turrex theme presets.",
    };
  }
  return { ok: true, preferences: { ...current, themePresetId: body.themePresetId } };
}

export function buildPersonalizationRecommendations(input: {
  user: UserRecord | null;
  currentThemePresetId?: unknown;
}): PersonalizationRecommendation[] {
  const currentThemePresetId = isValidThemePresetId(input.currentThemePresetId)
    ? input.currentThemePresetId
    : null;
  const savedThemePresetId = isValidThemePresetId(input.user?.themePresetId)
    ? input.user.themePresetId
    : null;
  const excluded = new Set<ThemePresetId>([currentThemePresetId, savedThemePresetId].filter(Boolean) as ThemePresetId[]);

  const ordered = dedupePresetIds([...getPresetOrderForUser(input.user), ...THEME_PRESET_IDS]);
  const themeRecommendations = ordered
    .filter((presetId) => !excluded.has(presetId))
    .slice(0, 3)
    .map((presetId, index): PersonalizationRecommendation => ({
      id: recommendationIdForPreset(presetId),
      kind: "theme",
      title: `Try ${presetId}`,
      description: `${presetId} is a real theme preset already available in Turrex.`,
      presetId,
      reason: describeThemeReason(presetId, input.user),
      confidence: Number((0.86 - index * 0.08).toFixed(2)),
      action: { type: "apply_theme_preset", label: `Apply ${presetId}` },
    }));

  const settingRecommendations: PersonalizationRecommendation[] = input.user && !input.user.recommendationDataSharingEnabled
    ? [{
      id: "setting:recommendation-data-sharing",
      kind: "setting",
      title: "Improve recommendation signals",
      description: "Enable recommendation data sharing so music packs and taste summaries can use saved activity.",
      reason: "Your account currently has recommendation data sharing disabled.",
      confidence: 0.72,
      action: { type: "open_settings", label: "Open settings", href: "/settings#recommendation-data-sharing" },
    }]
    : [];

  if (!input.user) {
    settingRecommendations.push({
      id: "setting:sign-in-to-sync",
      kind: "setting",
      title: "Sync personalization",
      description: "Sign in to save your selected theme preset across devices.",
      reason: "Guest mode can save theme choices locally only.",
      confidence: 0.68,
      action: { type: "open_settings", label: "Sign in", href: "/auth" },
    });
  }

  return [...themeRecommendations, ...settingRecommendations];
}
