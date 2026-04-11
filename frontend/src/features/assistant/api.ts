'use client';

import { getApiBaseUrl } from "@/lib/apiConfig";
import { getToken } from "@/src/lib/apiFetch";
import type { AssistantMeta, ChatMessage, ActionIntent } from "./types";

const API_BASE_URL = getApiBaseUrl();
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
  const response = await fetch(`${API_BASE_URL}/api/assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
      ...(queueTitles ? { "X-Trackly-Queue": queueTitles } : {}),
      ...(theme ? { "X-Trackly-Theme": theme } : {}),
      ...(language ? { "X-Trackly-Language": language } : {}),
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

  return response.json() as Promise<{ reply: string; actionIntent: ActionIntent | null; meta: AssistantMeta }>;
}

export async function runAssistantAction(intent: ActionIntent): Promise<unknown> {
  const headers = { "Content-Type": "application/json", ...buildAuthHeaders() };
  switch (intent.type) {
    case "INSIGHT_REQUEST":
      if (intent.payload.kind === "trends") {
        return fetch(`${API_BASE_URL}/api/ai/insights/trends`, { headers }).then((res) => res.json());
      }
      return fetch(`${API_BASE_URL}/api/ai/insights/${intent.payload.period === "monthly" ? "monthly" : "weekly"}`, { headers }).then((res) => res.json());
    case "PLAYLIST_GENERATION":
      return fetch(`${API_BASE_URL}/api/ai/playlists/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: intent.payload.prompt, confirmed: true }),
      }).then((res) => res.json());
    case "MOOD_RECOMMENDATION":
      return fetch(`${API_BASE_URL}/api/ai/recommendations/mood?mood=${encodeURIComponent(String(intent.payload.mood ?? "relax"))}`, { headers }).then((res) => res.json());
    case "CONTEXT_RECOMMENDATION":
      return fetch(`${API_BASE_URL}/api/ai/recommendations/contextual`, { headers }).then((res) => res.json());
    case "TAG_SUGGESTION":
      return fetch(`${API_BASE_URL}/api/ai/tags/suggest`, { method: "POST", headers }).then((res) => res.json());
    case "DISCOVERY_REQUEST":
      return fetch(`${API_BASE_URL}/api/ai/discovery/${intent.payload.mode === "surprise" ? "surprise" : "daily"}`, { headers }).then((res) => res.json());
    default:
      return null;
  }
}
