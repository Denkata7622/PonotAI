'use client';

import { getApiBaseUrl } from "@/lib/apiConfig";
import { getToken } from "@/src/lib/apiFetch";
import type { AssistantMeta, ChatMessage, ActionIntent } from "./types";
import { stripAssistantActionMarkup } from "./responseSanitizer";
import { readTasteProfile } from "../onboarding/tasteProfile";

const API_BASE_URL = getApiBaseUrl();
async function fetchJsonOrThrow(input: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as { message?: string }).message ?? `Assistant action failed (HTTP ${response.status})`;
    throw new Error(message);
  }
  return response.json();
}

function buildAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function sendAssistantMessage(
  conversation: ChatMessage[],
  message: string,
): Promise<{ reply: string; actionIntent: ActionIntent | null; meta: AssistantMeta }> {
  const queueTitles = typeof window === "undefined"
    ? ""
    : ((JSON.parse(window.localStorage.getItem("ponotai.queue.v1") ?? "{}") as { queue?: Array<{ track?: { title?: string } }> }).queue ?? [])
      .map((item) => item.track?.title)
      .filter(Boolean)
      .slice(0, 10)
      .join("|");
  const theme = typeof window === "undefined" ? undefined : (window.localStorage.getItem("ponotai-theme") ?? undefined);
  const language = typeof window === "undefined" ? undefined : (window.localStorage.getItem("ponotai-language") ?? undefined);
  const tasteProfile = typeof window === "undefined" ? null : readTasteProfile();
  const response = await fetch(`${API_BASE_URL}/api/assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
      ...(queueTitles ? { "X-Trackly-Queue": queueTitles } : {}),
      ...(theme ? { "X-Trackly-Theme": theme } : {}),
      ...(language ? { "X-Trackly-Language": language } : {}),
      ...(tasteProfile ? { "X-Trackly-Preferences": JSON.stringify({
        genres: tasteProfile.genres,
        artists: tasteProfile.artists,
        moods: tasteProfile.moods,
        goals: tasteProfile.goals,
      }) } : {}),
      ...(typeof navigator !== "undefined" ? { "X-Trackly-Device": navigator.userAgent.slice(0, 120) } : {}),
    },
    body: JSON.stringify({
      message,
      conversation: conversation
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({ role: item.role, content: item.content })),
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

  const payload = await response.json() as { reply: string; actionIntent: ActionIntent | null; meta: AssistantMeta };
  return { ...payload, reply: stripAssistantActionMarkup(payload.reply ?? "") };
}

export async function runAssistantAction(intent: ActionIntent): Promise<unknown> {
  const headers = { "Content-Type": "application/json", ...buildAuthHeaders() };
  switch (intent.type) {
    case "INSIGHT_REQUEST":
      if (intent.payload.kind === "trends") {
        return fetchJsonOrThrow(`${API_BASE_URL}/api/ai/insights/trends`, { headers });
      }
      return fetchJsonOrThrow(`${API_BASE_URL}/api/ai/insights/${intent.payload.period === "monthly" ? "monthly" : "weekly"}`, { headers });
    case "PLAYLIST_GENERATION":
      return fetchJsonOrThrow(`${API_BASE_URL}/api/ai/playlists/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: intent.payload.prompt, confirmed: true }),
      });
    case "MOOD_RECOMMENDATION":
      return fetchJsonOrThrow(`${API_BASE_URL}/api/ai/recommendations/mood?mood=${encodeURIComponent(String(intent.payload.mood ?? "relax"))}`, { headers });
    case "CONTEXT_RECOMMENDATION":
      return fetchJsonOrThrow(`${API_BASE_URL}/api/ai/recommendations/contextual`, { headers });
    case "TAG_SUGGESTION":
      return fetchJsonOrThrow(`${API_BASE_URL}/api/ai/tags/suggest`, { method: "POST", headers });
    case "DISCOVERY_REQUEST":
      return fetchJsonOrThrow(`${API_BASE_URL}/api/ai/discovery/${intent.payload.mode === "surprise" ? "surprise" : "daily"}`, { headers });
    case "CROSS_ARTIST_DISCOVERY":
      return fetchJsonOrThrow(
        `${API_BASE_URL}/api/ai/recommendations/cross-artist?differentArtistsOnly=${intent.payload.differentArtistsOnly === false ? "false" : "true"}&limit=${encodeURIComponent(String(intent.payload.limit ?? 8))}`,
        { headers },
      );
    case "SHOW_SIMILAR_ARTISTS":
      return fetchJsonOrThrow(
        `${API_BASE_URL}/api/ai/recommendations/cross-artist?differentArtistsOnly=true&limit=8&anchor=${encodeURIComponent(String(intent.payload.anchorArtist ?? ""))}`,
        { headers },
      );
    case "PREVIEW_DISCOVERY_PLAYLIST":
      return fetchJsonOrThrow(
        `${API_BASE_URL}/api/ai/playlists/generate`,
        { method: "POST", headers, body: JSON.stringify({ prompt: `Discovery playlist: ${(intent.payload.artists as string[] ?? []).join(", ")}` }) },
      );
    case "CREATE_DISCOVERY_PLAYLIST":
      return fetchJsonOrThrow(
        `${API_BASE_URL}/api/ai/playlists/generate`,
        { method: "POST", headers, body: JSON.stringify({ prompt: `${intent.payload.name}: ${(intent.payload.artists as string[] ?? []).join(", ")}`, confirmed: true }) },
      );
    default:
      return null;
  }
}
