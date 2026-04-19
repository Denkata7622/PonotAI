import { getApiBaseUrl } from "@/lib/apiConfig";

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
  const baseUrl = getApiBaseUrl();
  const headers = new Headers(options?.headers ?? {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (shouldSetJsonContentType(options) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });
}
