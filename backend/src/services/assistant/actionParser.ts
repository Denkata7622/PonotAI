import type { ActionIntent } from "../../types/assistant";

const ACTION_TYPES = new Set<ActionIntent["type"]>([
  "ADD_TO_QUEUE",
  "CREATE_PLAYLIST",
  "FAVORITE_TRACK",
  "SEARCH_AND_SUGGEST",
]);

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
    default:
      return false;
  }
}

function sanitizeReply(rawOutput: string): string {
  return rawOutput.replace(/<action>[\s\S]*?<\/action>/g, "").trim();
}

export function parseActionIntent(rawOutput: string): { reply: string; actionIntent: ActionIntent | null } {
  const reply = sanitizeReply(rawOutput);
  const match = rawOutput.match(/<action>([\s\S]*?)<\/action>/);

  if (!match) {
    return { reply, actionIntent: null };
  }

  try {
    const parsed = JSON.parse(match[1]) as Partial<ActionIntent>;
    if (!parsed.type || !ACTION_TYPES.has(parsed.type)) {
      return { reply, actionIntent: null };
    }

    if (!isRecord(parsed.payload) || parsed.requiresConfirmation !== true) {
      return { reply, actionIntent: null };
    }

    if (!validatePayload(parsed.type, parsed.payload)) {
      return { reply, actionIntent: null };
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
    };
  } catch {
    return { reply, actionIntent: null };
  }
}
