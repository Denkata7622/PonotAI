/**
 * Centralized API configuration
 * Single source of truth for backend API base URL
 */

export function getApiBaseUrl(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
  return baseUrl.replace(/\/$/, ""); // Remove trailing slash if present
}
