import { buildApiUrl } from "@/lib/apiConfig";

const TOKEN_KEY = "ponotii_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function shouldSetJsonContentType(options?: RequestInit): boolean {
  const hasBody = typeof options?.body !== "undefined" && options.body !== null;
  if (!hasBody) return false;
  return !(options?.body instanceof FormData);
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = getToken(); // always read fresh — never stale
  const headers = new Headers(options?.headers ?? {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (shouldSetJsonContentType(options) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(buildApiUrl(path), {
    ...options,
    credentials: options?.credentials ?? "include",
    headers,
  });
}

export async function readJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const data = payload as { message?: unknown; error?: unknown; code?: unknown; details?: unknown };
    if (typeof data.message === "string" && data.message.trim()) return data.message;
    if (typeof data.error === "string" && data.error.trim()) return data.error;
    if (typeof data.code === "string" && data.code.trim()) return data.code;
    if (data.details && typeof data.details === "object") {
      const details = data.details as { message?: unknown };
      if (typeof details.message === "string" && details.message.trim()) return details.message;
    }
  }
  return fallback;
}
