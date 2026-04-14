import { getApiBaseUrl } from "@/lib/apiConfig";

const TOKEN_KEY = "ponotii_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = getToken(); // always read fresh — never stale
  const baseUrl = getApiBaseUrl();
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}