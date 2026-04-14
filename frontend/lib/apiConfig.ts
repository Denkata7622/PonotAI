/**
 * Centralized API configuration
 * Single source of truth for backend API base URL
 */

const DEFAULT_DEV_API_URL = "http://localhost:4000";

function normalize(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

function isLocalhostHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function missingApiBaseUrlError(): Error {
  return new Error(
    "[api-config] NEXT_PUBLIC_API_BASE_URL (or NEXT_PUBLIC_API_URL) is required outside localhost. Refusing empty API base URL.",
  );
}

export function getApiBaseUrl(): string {
  const envBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envBaseUrl) {
    return normalize(envBaseUrl);
  }

  if (typeof window !== "undefined") {
    if (isLocalhostHost(window.location.hostname)) {
      return normalize(DEFAULT_DEV_API_URL);
    }
    throw missingApiBaseUrlError();
  }

  if (process.env.NODE_ENV === "production") {
    throw missingApiBaseUrlError();
  }

  return normalize(DEFAULT_DEV_API_URL);
}
