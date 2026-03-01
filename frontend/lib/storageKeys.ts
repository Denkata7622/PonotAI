/**
 * Centralized localStorage key definitions
 * Single source of truth for all storage keys
 */

export const STORAGE_KEYS = {
  // Authentication
  authToken: "authToken",

  // History
  history: "ponotai-history",

  // Library
  favorites: "ponotai-favorites",
  playlists: "ponotai-playlists",

  // UI State
  theme: "ponotai-theme",
  guestState: "ponotai-guest-state",

  // Profile
  profiles: "ponotai-profiles",
  activeProfile: "ponotai-active-profile",
} as const;

/**
 * Helper to create profile-scoped storage keys
 * Used to store data per-profile (history, favorites, etc.)
 */
export function scopedKey(baseKey: string, profileId: string): string {
  return `${baseKey}:${profileId}`;
}
