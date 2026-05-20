import { apiFetch } from "../../lib/apiFetch";
import { isValidThemePresetId, type ThemePresetId } from "../../../lib/ThemeContext";

export type PersonalizationPreferences = {
  themePresetId: ThemePresetId | null;
  updatedAt?: string;
};

export type PersonalizationSource = "database" | "memory" | "local-default";

export type PersonalizationResponse = {
  ok: true;
  preferences: PersonalizationPreferences;
  source: PersonalizationSource;
};

export type PersonalizationRecommendation = {
  id: string;
  kind: "theme" | "layout" | "content" | "setting";
  title: string;
  description: string;
  presetId?: string;
  reason?: string;
  confidence?: number;
  action?: {
    type: "apply_theme_preset" | "open_settings";
    label: string;
    href?: string;
  };
};

export type PersonalizationRecommendationsResponse = {
  ok: true;
  recommendations: PersonalizationRecommendation[];
};

export class PersonalizationApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "PersonalizationApiError";
    this.status = status;
    this.code = code;
  }
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new PersonalizationApiError("Personalization API returned malformed JSON.", response.status);
  }
}

function getErrorMessage(payload: unknown, fallback: string): { message: string; code?: string } {
  if (payload && typeof payload === "object") {
    const data = payload as { message?: unknown; error?: unknown; code?: unknown };
    return {
      message: typeof data.message === "string"
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : fallback,
      code: typeof data.code === "string" ? data.code : undefined,
    };
  }
  return { message: fallback };
}

function normalizePreferences(value: unknown): PersonalizationPreferences {
  if (!value || typeof value !== "object") {
    return { themePresetId: null };
  }
  const candidate = value as { themePresetId?: unknown; updatedAt?: unknown };
  return {
    themePresetId: isValidThemePresetId(candidate.themePresetId) ? candidate.themePresetId : null,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined,
  };
}

function normalizeRecommendation(value: unknown): PersonalizationRecommendation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as PersonalizationRecommendation;
  if (typeof candidate.id !== "string" || typeof candidate.title !== "string" || typeof candidate.description !== "string") {
    return null;
  }
  if (!["theme", "layout", "content", "setting"].includes(candidate.kind)) return null;
  const presetId = isValidThemePresetId(candidate.presetId) ? candidate.presetId : undefined;
  if (candidate.kind === "theme" && !presetId) return null;
  const action = candidate.action && typeof candidate.action === "object" && typeof candidate.action.type === "string" && typeof candidate.action.label === "string"
    && (candidate.action.type === "open_settings" || candidate.action.type === "apply_theme_preset")
    && (candidate.action.type !== "apply_theme_preset" || presetId)
    ? {
      type: candidate.action.type,
      label: candidate.action.label,
      href: typeof candidate.action.href === "string" ? candidate.action.href : undefined,
    }
    : undefined;
  return {
    id: candidate.id,
    kind: candidate.kind,
    title: candidate.title,
    description: candidate.description,
    presetId,
    reason: typeof candidate.reason === "string" ? candidate.reason : undefined,
    confidence: typeof candidate.confidence === "number" ? candidate.confidence : undefined,
    action,
  };
}

export function resolveThemeRecommendationPresetId(recommendation: PersonalizationRecommendation): ThemePresetId | null {
  return recommendation.kind === "theme" && isValidThemePresetId(recommendation.presetId)
    ? recommendation.presetId
    : null;
}

export async function getPersonalizationPreferences(): Promise<PersonalizationResponse> {
  const response = await apiFetch("/api/personalization");
  const payload = await readJsonSafely(response);
  if (!response.ok) {
    const error = getErrorMessage(payload, `Personalization load failed (${response.status}).`);
    throw new PersonalizationApiError(error.message, response.status, error.code);
  }
  const data = payload as { preferences?: unknown; source?: unknown };
  return {
    ok: true,
    preferences: normalizePreferences(data.preferences),
    source: data.source === "database" || data.source === "memory" || data.source === "local-default" ? data.source : "local-default",
  };
}

export async function savePersonalizationPreferences(preferences: PersonalizationPreferences): Promise<PersonalizationResponse> {
  const response = await apiFetch("/api/personalization", {
    method: "PATCH",
    body: JSON.stringify(preferences),
  });
  const payload = await readJsonSafely(response);
  if (!response.ok) {
    const error = getErrorMessage(payload, `Personalization save failed (${response.status}).`);
    throw new PersonalizationApiError(error.message, response.status, error.code);
  }
  const data = payload as { preferences?: unknown; source?: unknown };
  return {
    ok: true,
    preferences: normalizePreferences(data.preferences),
    source: data.source === "database" || data.source === "memory" || data.source === "local-default" ? data.source : "database",
  };
}

export async function getPersonalizationRecommendations(currentThemePresetId: ThemePresetId | null): Promise<PersonalizationRecommendationsResponse> {
  const query = currentThemePresetId ? `?currentThemePresetId=${encodeURIComponent(currentThemePresetId)}` : "";
  const response = await apiFetch(`/api/personalization/recommendations${query}`);
  const payload = await readJsonSafely(response);
  if (!response.ok) {
    const error = getErrorMessage(payload, `Personalization recommendations failed (${response.status}).`);
    throw new PersonalizationApiError(error.message, response.status, error.code);
  }
  const data = payload as { recommendations?: unknown };
  const recommendations = Array.isArray(data.recommendations)
    ? data.recommendations.map(normalizeRecommendation).filter((item): item is PersonalizationRecommendation => Boolean(item))
    : [];
  return { ok: true, recommendations };
}
