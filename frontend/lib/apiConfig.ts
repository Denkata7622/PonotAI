/**
 * Centralized API configuration
 * Single source of truth for backend API base URL
 */

export function getApiBaseUrl(): string {
  const serverBaseUrl = process.env.TRACKLY_API_BASE_URL;
  const publicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const baseUrl = serverBaseUrl || publicBaseUrl || "http://localhost:4000";

  return baseUrl.replace(/\/$/, ""); // Remove trailing slash if present
}
