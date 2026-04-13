/**
 * Centralized API configuration
 * Single source of truth for backend API base URL
 */

const DEFAULT_PRODUCTION_API_URL = "https://trackly-api.up.railway.app";
const DEFAULT_DEV_API_URL = "http://localhost:4000";

function normalize(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  const envBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envBaseUrl) {
    return normalize(envBaseUrl);
  }

  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return normalize(DEFAULT_DEV_API_URL);
    }

    return normalize(DEFAULT_PRODUCTION_API_URL);
  }

  return normalize(process.env.NODE_ENV === "production" ? DEFAULT_PRODUCTION_API_URL : DEFAULT_DEV_API_URL);
}
