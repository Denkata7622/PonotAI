import type { ActionIntent } from "../../types/assistant";

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
const CLOSED_ACTION_BLOCK = /<action>([\s\S]*?)<\/action>/i;
const SUPPORTED_ACCENTS = ["violet", "indigo", "blue", "cyan", "ocean", "teal", "emerald", "lime", "amber", "gold", "orange", "sunset", "coral", "rose", "ruby", "magenta", "plum", "slate", "graphite"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function validatePayload(type: ActionIntent["type"], payload: Record<string, unknown>): boolean {
  switch (type) {
    case "ADD_TO_QUEUE":
      return isStringArray(payload.trackIds) && payload.source === "assistant";
    case "CREATE_PLAYLIST":
      return (
        typeof payload.name === "string"
        && payload.name.length > 0
        && isStringArray(payload.trackIds)
        && payload.dedupe === true
        && (payload.description === undefined || typeof payload.description === "string")
      );
    case "FAVORITE_TRACK":
      return typeof payload.trackId === "string" && payload.trackId.length > 0 && payload.source === "assistant";
    case "SEARCH_AND_SUGGEST":
      return typeof payload.query === "string" && payload.query.length > 0 && typeof payload.reason === "string";
    case "CHANGE_THEME":
      return (
        (payload.theme === "light" || payload.theme === "dark" || payload.theme === "system")
        && (payload.accent === undefined || SUPPORTED_ACCENTS.includes(String(payload.accent)))
        && (payload.density === undefined || payload.density === "compact" || payload.density === "comfortable")
      );
    case "CHANGE_LANGUAGE":
      return payload.locale === "en" || payload.locale === "bg";
    case "INSIGHT_REQUEST":
      return payload.period === "daily" || payload.period === "weekly" || payload.period === "monthly" || payload.kind === "trends";
    case "PLAYLIST_GENERATION":
      return typeof payload.prompt === "string" && payload.prompt.length > 0;
    case "MOOD_RECOMMENDATION":
      return typeof payload.mood === "string" && payload.mood.length > 0;
    case "CONTEXT_RECOMMENDATION":
      return true;
    case "TAG_SUGGESTION":
      return true;
    case "DISCOVERY_REQUEST":
      return payload.mode === "daily" || payload.mode === "surprise";
    case "CROSS_ARTIST_DISCOVERY":
      return (payload.differentArtistsOnly === undefined || typeof payload.differentArtistsOnly === "boolean")
        && (payload.limit === undefined || (typeof payload.limit === "number" && payload.limit > 0 && payload.limit <= 20));
    case "SHOW_SIMILAR_ARTISTS":
      return typeof payload.anchorArtist === "string" && payload.anchorArtist.length > 0;
    case "SEARCH_ARTIST":
      return typeof payload.artist === "string" && payload.artist.length > 0;
    case "PREVIEW_DISCOVERY_PLAYLIST":
      return isStringArray(payload.artists);
    case "CREATE_DISCOVERY_PLAYLIST":
      return typeof payload.name === "string" && payload.name.length > 0 && isStringArray(payload.artists);
    default:
      return false;
  }
}

function sanitizeReply(rawOutput: string): string {
  const withoutClosedBlocks = rawOutput.replace(/<action>[\s\S]*?<\/action>/gi, "");
  const openTagIndex = withoutClosedBlocks.search(OPEN_ACTION_TAG);
  const safe = openTagIndex >= 0 ? withoutClosedBlocks.slice(0, openTagIndex) : withoutClosedBlocks;
  return safe.trim();
}

export function parseActionIntent(rawOutput: string): { reply: string; actionIntent: ActionIntent | null; parseError: boolean } {
  const reply = sanitizeReply(rawOutput);
  const match = rawOutput.match(CLOSED_ACTION_BLOCK);

  if (!match) {
    return { reply, actionIntent: null, parseError: rawOutput.search(OPEN_ACTION_TAG) >= 0 };
  }

  try {
    const parsed = JSON.parse(match[1]) as Partial<ActionIntent>;
    if (!parsed.type || !ACTION_TYPES.has(parsed.type)) {
      return { reply, actionIntent: null, parseError: true };
    }

    if (!isRecord(parsed.payload) || parsed.requiresConfirmation !== true) {
      return { reply, actionIntent: null, parseError: true };
    }

    if (!validatePayload(parsed.type, parsed.payload)) {
      return { reply, actionIntent: null, parseError: true };
    }

    return {
      reply,
      actionIntent: {
        type: parsed.type,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        payload: parsed.payload,
        requiresConfirmation: true,
        reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
      },
      parseError: false,
    };
  } catch {
    return { reply, actionIntent: null, parseError: true };
  }
}
