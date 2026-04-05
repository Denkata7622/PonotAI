'use client';

import { getApiBaseUrl } from "@/lib/apiConfig";
import { getToken } from "@/src/lib/apiFetch";
import type { AssistantMeta, ChatMessage, ActionIntent } from "./types";
import { AssistantApiError } from "./types";

const API_BASE_URL = getApiBaseUrl();

export async function sendAssistantMessage(
  conversation: ChatMessage[],
  message: string,
): Promise<{ reply: string; actionIntent: ActionIntent | null; meta: AssistantMeta }> {
  const token = getToken();
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
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(queueTitles ? { "X-Trackly-Queue": queueTitles } : {}),
      ...(theme ? { "X-Trackly-Theme": theme } : {}),
      ...(language ? { "X-Trackly-Language": language } : {}),
    },
    body: JSON.stringify({
      message,
      conversation: conversation
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({ role: item.role, content: item.content })),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new AssistantApiError(data.code || "ASSISTANT_REQUEST_FAILED", data.message || "Assistant request failed");
  }

  return data as { reply: string; actionIntent: ActionIntent | null; meta: AssistantMeta };
}
