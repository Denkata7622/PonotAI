/**
 * Centralized API configuration
 * Single source of truth for backend API base URL
 */

const DEFAULT_DEV_API_URL = "http://localhost:4000";

function normalize(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  const envBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envBaseUrl) {
    return normalize(envBaseUrl);
  }

  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return normalize(DEFAULT_DEV_API_URL);
    }
    console.error("[api-config] NEXT_PUBLIC_API_BASE_URL is required outside localhost.");
    return "";
  }

  if (process.env.NODE_ENV === "production") {
    console.error("[api-config] NEXT_PUBLIC_API_BASE_URL is required for production server runtime.");
    return "";
  }
  return normalize(DEFAULT_DEV_API_URL);
}
