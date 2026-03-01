/**
 * Centralized authentication token storage
 * Single pattern for getting and setting auth tokens
 */

import { STORAGE_KEYS } from "./storageKeys";

/**
 * Retrieve the current auth token from localStorage
 * Returns null if no token is set or if running on server-side
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEYS.authToken);
}

/**
 * Store an auth token in localStorage
 */
export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token === null) {
    window.localStorage.removeItem(STORAGE_KEYS.authToken);
  } else {
    window.localStorage.setItem(STORAGE_KEYS.authToken, token);
  }
}

/**
 * Check if user is currently authenticated
 */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/**
 * Clear the auth token
 */
export function clearToken(): void {
  setToken(null);
}
