/**
 * Centralized API configuration
 * Single source of truth for backend API base URL
 */

export function getApiBaseUrl(): string {
  const envBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envBaseUrl) {
    return envBaseUrl.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }

  const baseUrl = process.env.NODE_ENV === "production"
    ? ""
    : "http://localhost:4000";

  return baseUrl.replace(/\/$/, ""); // Remove trailing slash if present
}
