import type { ActionIntent } from "../../types/assistant";
import {
  THEME_TEMPLATE_BY_ID,
  isAccentName,
  isBodyFontName,
  isDensityName,
  isDisplayFontName,
  isDisplayTextStyleName,
  isPanelTintName,
  isSurfaceStyleName,
  isTemplateId,
  isTextScaleName,
  isThemeMode,
} from "./themeCatalog";

const ACTION_TYPES = new Set<ActionIntent["type"]>([
  "ADD_TO_QUEUE",
  "CREATE_PLAYLIST",
  "FAVORITE_TRACK",
  "SEARCH_AND_SUGGEST",
  "CHANGE_THEME",
  "CHANGE_LANGUAGE",
  "INSIGHT_REQUEST",
  "PLAYLIST_GENERATION",
  "MOOD_RECOMMENDATION",
  "CONTEXT_RECOMMENDATION",
  "TAG_SUGGESTION",
  "DISCOVERY_REQUEST",
  "CROSS_ARTIST_DISCOVERY",
  "SHOW_SIMILAR_ARTISTS",
  "SEARCH_ARTIST",
  "PREVIEW_DISCOVERY_PLAYLIST",
  "CREATE_DISCOVERY_PLAYLIST",
]);

const OPEN_ACTION_TAG = /<action>/i;
const CLOSED_ACTION_BLOCK_GLOBAL = /<action>([\s\S]*?)<\/action>/gi;
const JSON_OBJECT_CANDIDATE = /(\{[\s\S]*"type"\s*:\s*"[^"]+"[\s\S]*\})/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function normalizeTrackPart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTrackKeyFromTrackId(trackId: string): string | null {
  const [title, artist] = trackId.split("|||");
  if (!title || !artist) return null;
  return `${normalizeTrackPart(title)}|||${normalizeTrackPart(artist)}`;
}

function dedupeTrackIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    let candidate: string | null = null;
    if (typeof item === "string") {
      const trimmed = item.trim();
      candidate = trimmed.length > 0 ? trimmed : null;
    } else if (isRecord(item) && typeof item.title === "string" && typeof item.artist === "string") {
      const title = item.title.trim();
      const artist = item.artist.trim();
      candidate = title && artist ? `${title}|||${artist}` : null;
    }

    if (!candidate) return null;
    const key = normalizeTrackKeyFromTrackId(candidate);
    if (!key) return null;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function normalizeThemePayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const template = isTemplateId(payload.template) ? THEME_TEMPLATE_BY_ID.get(payload.template) : null;
  if (payload.template !== undefined && !template) return null;

  const theme = payload.theme === undefined ? template?.theme : (isThemeMode(payload.theme) ? payload.theme : null);
  const accent = payload.accent === undefined ? template?.accent : (isAccentName(payload.accent) ? payload.accent : null);
  const density = payload.density === undefined ? template?.density : (isDensityName(payload.density) ? payload.density : null);
  const panelTint = payload.panelTint === undefined ? undefined : (isPanelTintName(payload.panelTint) ? payload.panelTint : null);
  const surfaceStyle = payload.surfaceStyle === undefined ? undefined : (isSurfaceStyleName(payload.surfaceStyle) ? payload.surfaceStyle : null);
  const textScale = payload.textScale === undefined ? undefined : (isTextScaleName(payload.textScale) ? payload.textScale : null);
  const displayTextStyle = payload.displayTextStyle === undefined ? undefined : (isDisplayTextStyleName(payload.displayTextStyle) ? payload.displayTextStyle : null);
  const bodyFont = payload.bodyFont === undefined ? undefined : (isBodyFontName(payload.bodyFont) ? payload.bodyFont : null);
  const displayFont = payload.displayFont === undefined ? undefined : (isDisplayFontName(payload.displayFont) ? payload.displayFont : null);

  if (theme === null || accent === null || density === null || panelTint === null || surfaceStyle === null || textScale === null || displayTextStyle === null || bodyFont === null || displayFont === null) return null;
  if (!theme && !accent && !density && !panelTint && !surfaceStyle && !textScale && !displayTextStyle && !bodyFont && !displayFont && !template) return null;

  return {
    ...(theme ? { theme } : {}),
    ...(accent ? { accent } : {}),
    ...(density ? { density } : {}),
    ...(panelTint ? { panelTint } : {}),
    ...(surfaceStyle ? { surfaceStyle } : {}),
    ...(textScale ? { textScale } : {}),
    ...(displayTextStyle ? { displayTextStyle } : {}),
    ...(bodyFont ? { bodyFont } : {}),
    ...(displayFont ? { displayFont } : {}),
    ...(template ? { template: template.id } : {}),
  };
}

function validatePayload(type: ActionIntent["type"], payload: Record<string, unknown>): Record<string, unknown> | null {
  switch (type) {
    case "ADD_TO_QUEUE":
      if (payload.source !== "assistant") return null;
      {
        const trackIds = dedupeTrackIds(payload.trackIds);
        return trackIds && trackIds.length > 0 ? { ...payload, trackIds } : null;
      }
    case "CREATE_PLAYLIST":
      {
        const trackIds = dedupeTrackIds(payload.trackIds);
        return (
          typeof payload.name === "string"
          && payload.name.length > 0
          && Boolean(trackIds && trackIds.length > 0)
          && payload.dedupe === true
          && (payload.description === undefined || typeof payload.description === "string")
        ) ? { ...payload, trackIds } : null;
      }
    case "FAVORITE_TRACK":
      return typeof payload.trackId === "string" && payload.trackId.length > 0 && payload.source === "assistant" ? payload : null;
    case "SEARCH_AND_SUGGEST":
      return typeof payload.query === "string" && payload.query.length > 0 && typeof payload.reason === "string" ? payload : null;
    case "CHANGE_THEME":
      return normalizeThemePayload(payload);
    case "CHANGE_LANGUAGE":
      return payload.locale === "en" || payload.locale === "bg" ? payload : null;
    case "INSIGHT_REQUEST":
      return payload.period === "daily" || payload.period === "weekly" || payload.period === "monthly" || payload.kind === "trends" ? payload : null;
    case "PLAYLIST_GENERATION":
      return typeof payload.prompt === "string" && payload.prompt.length > 0 ? payload : null;
    case "MOOD_RECOMMENDATION":
      return typeof payload.mood === "string" && payload.mood.length > 0 ? payload : null;
    case "CONTEXT_RECOMMENDATION":
    case "TAG_SUGGESTION":
      return payload;
    case "DISCOVERY_REQUEST":
      return payload.mode === "daily" || payload.mode === "surprise" ? payload : null;
    case "CROSS_ARTIST_DISCOVERY":
      return (payload.differentArtistsOnly === undefined || typeof payload.differentArtistsOnly === "boolean")
        && (payload.limit === undefined || (typeof payload.limit === "number" && payload.limit > 0 && payload.limit <= 20)) ? payload : null;
    case "SHOW_SIMILAR_ARTISTS":
      return typeof payload.anchorArtist === "string" && payload.anchorArtist.length > 0 ? payload : null;
    case "SEARCH_ARTIST":
      return typeof payload.artist === "string" && payload.artist.length > 0 ? payload : null;
    case "PREVIEW_DISCOVERY_PLAYLIST":
      return isStringArray(payload.artists) ? payload : null;
    case "CREATE_DISCOVERY_PLAYLIST":
      return typeof payload.name === "string" && payload.name.length > 0 && isStringArray(payload.artists) ? payload : null;
    default:
      return null;
  }
}

function sanitizeReply(rawOutput: string): string {
  const withoutClosedBlocks = rawOutput.replace(/<action>[\s\S]*?<\/action>/gi, "");
  const openTagIndex = withoutClosedBlocks.search(OPEN_ACTION_TAG);
  const safe = openTagIndex >= 0 ? withoutClosedBlocks.slice(0, openTagIndex) : withoutClosedBlocks;
  return safe.trim();
}

function normalizeJsonText(raw: string): string {
  return raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .trim();
}

function parseJsonLenient(raw: string): unknown {
  const normalized = normalizeJsonText(raw);
  return JSON.parse(normalized);
}

function normalizeActionIntentCandidate(parsed: Partial<ActionIntent>): ActionIntent | null {
  if (!parsed.type || !ACTION_TYPES.has(parsed.type)) {
    return null;
  }

  if (!isRecord(parsed.payload)) {
    return null;
  }

  const normalizedPayload = validatePayload(parsed.type, parsed.payload);
  if (!normalizedPayload) {
    return null;
  }

  return {
    type: parsed.type,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    payload: normalizedPayload,
    requiresConfirmation: true,
    reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
  };
}

export function parseActionIntentCandidate(raw: unknown): ActionIntent | null {
  if (!isRecord(raw)) return null;
  return normalizeActionIntentCandidate(raw as Partial<ActionIntent>);
}

export function parseActionIntent(rawOutput: string): { reply: string; actionIntent: ActionIntent | null; parseError: boolean } {
  const reply = sanitizeReply(rawOutput);
  const matches = [...rawOutput.matchAll(CLOSED_ACTION_BLOCK_GLOBAL)];
  const parseCandidates = matches.length > 0
    ? matches.map((match) => match[1])
    : (() => {
        const fallback = rawOutput.match(JSON_OBJECT_CANDIDATE);
        return fallback ? [fallback[1]] : [];
      })();

  if (parseCandidates.length === 0) {
    return { reply, actionIntent: null, parseError: rawOutput.search(OPEN_ACTION_TAG) >= 0 };
  }

  let parseError = false;
  for (let index = parseCandidates.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = parseJsonLenient(parseCandidates[index]) as Partial<ActionIntent>;
      const actionIntent = normalizeActionIntentCandidate(parsed);
      if (actionIntent) {
        return { reply, actionIntent, parseError };
      }
      parseError = true;
    } catch {
      parseError = true;
    }
  }

  return { reply, actionIntent: null, parseError: true };
}
