'use client';

import { apiFetch } from "@/src/lib/apiFetch";
import type { AssistantMeta, ChatMessage, ActionIntent } from "./types";
import { stripAssistantActionMarkup } from "./responseSanitizer";
import { readTasteProfile, toAssistantPreferencePayload } from "../onboarding/tasteProfile";

async function fetchJsonOrThrow(path: string, init?: RequestInit): Promise<unknown> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as { message?: string }).message ?? `Assistant action failed (HTTP ${response.status})`;
    throw new Error(message);
  }
  return response.json();
}

type AssistantClientContext = {
  queueTitles?: string[];
  theme?: string;
  language?: string;
  preferences?: ReturnType<typeof toAssistantPreferencePayload>;
  device?: string;
};

function sanitizeHeaderValue(value: string | null | undefined, maxLength = 120): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Keep only Latin-1 clean characters to prevent browser RequestInit header encoding failures.
  const latin1Only = trimmed.replace(/[^\u0009\u0020-\u007E\u00A0-\u00FF]/g, "");
  if (!latin1Only) return undefined;
  return latin1Only.slice(0, maxLength);
}

function buildAssistantClientContext(): AssistantClientContext {
  if (typeof window === "undefined") return {};

  const queueTitles = ((JSON.parse(window.localStorage.getItem("ponotai.queue.v1") ?? "{}") as { queue?: Array<{ track?: { title?: string } }> }).queue ?? [])
    .map((item) => item.track?.title?.trim())
    .filter((title): title is string => Boolean(title))
    .slice(0, 10);

  const theme = window.localStorage.getItem("ponotai-theme") ?? undefined;
  const language = window.localStorage.getItem("ponotai-language") ?? undefined;
  const tasteProfile = readTasteProfile();
  const device = typeof navigator !== "undefined" ? sanitizeHeaderValue(navigator.userAgent, 120) : undefined;

  return {
    ...(queueTitles.length > 0 ? { queueTitles } : {}),
    ...(theme ? { theme } : {}),
    ...(language ? { language } : {}),
    ...(tasteProfile ? { preferences: toAssistantPreferencePayload(tasteProfile) } : {}),
    ...(device ? { device } : {}),
  };
}

export async function sendAssistantMessage(
  conversation: ChatMessage[],
  message: string,
): Promise<{ reply: string; actionIntent: ActionIntent | null; executePendingAction: boolean; meta: AssistantMeta }> {
  const context = buildAssistantClientContext();
  const pendingAction = [...conversation]
    .reverse()
    .find((item) => item.role === "assistant" && item.actionIntent && item.actionState === "pending")
    ?.actionIntent ?? null;
  const response = await apiFetch("/api/assistant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      conversation: conversation
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({ role: item.role, content: item.content })),
      context,
      pendingAction,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const serverMessage = (errorData as { message?: string }).message;
    const error = new Error(serverMessage ?? `Assistant request failed (HTTP ${response.status})`) as Error & {
      data?: unknown;
      status?: number;
      code?: string;
    };
    error.data = errorData;
    error.status = response.status;
    error.code = (errorData as { code?: string }).code;
    throw error;
  }

  const payload = await response.json() as { reply: string; actionIntent: ActionIntent | null; executePendingAction?: boolean; meta: AssistantMeta };
  return { ...payload, executePendingAction: payload.executePendingAction === true, reply: stripAssistantActionMarkup(payload.reply ?? "") };
}

export async function runAssistantAction(intent: ActionIntent): Promise<unknown> {
  switch (intent.type) {
    case "INSIGHT_REQUEST":
      if (intent.payload.kind === "trends") {
        return fetchJsonOrThrow("/api/ai/insights/trends");
      }
      return fetchJsonOrThrow(`/api/ai/insights/${intent.payload.period === "monthly" ? "monthly" : "weekly"}`);
    case "PLAYLIST_GENERATION":
      return fetchJsonOrThrow("/api/ai/playlists/generate", {
        method: "POST",
        body: JSON.stringify({ prompt: intent.payload.prompt, confirmed: true }),
      });
    case "MOOD_RECOMMENDATION":
      return fetchJsonOrThrow(`/api/ai/recommendations/mood?mood=${encodeURIComponent(String(intent.payload.mood ?? "relax"))}`);
    case "CONTEXT_RECOMMENDATION":
      return fetchJsonOrThrow("/api/ai/recommendations/contextual");
    case "TAG_SUGGESTION":
      return fetchJsonOrThrow("/api/ai/tags/suggest", { method: "POST" });
    case "DISCOVERY_REQUEST":
      return fetchJsonOrThrow(`/api/ai/discovery/${intent.payload.mode === "surprise" ? "surprise" : "daily"}`);
    case "CROSS_ARTIST_DISCOVERY":
      return fetchJsonOrThrow(
        `/api/ai/recommendations/cross-artist?differentArtistsOnly=${intent.payload.differentArtistsOnly === false ? "false" : "true"}&limit=${encodeURIComponent(String(intent.payload.limit ?? 8))}`
      );
    case "SHOW_SIMILAR_ARTISTS":
      return fetchJsonOrThrow(
        `/api/ai/recommendations/cross-artist?differentArtistsOnly=true&limit=8&anchor=${encodeURIComponent(String(intent.payload.anchorArtist ?? ""))}`
      );
    case "PREVIEW_DISCOVERY_PLAYLIST":
      return fetchJsonOrThrow(
        "/api/ai/playlists/generate",
        { method: "POST", body: JSON.stringify({ prompt: `Discovery playlist: ${(intent.payload.artists as string[] ?? []).join(", ")}` }) },
      );
    case "CREATE_DISCOVERY_PLAYLIST":
      return fetchJsonOrThrow(
        "/api/ai/playlists/generate",
        { method: "POST", body: JSON.stringify({ prompt: `${intent.payload.name}: ${(intent.payload.artists as string[] ?? []).join(", ")}`, confirmed: true }) },
      );
    default:
      throw new Error(`Unsupported assistant action type: ${intent.type}`);
  }
}
