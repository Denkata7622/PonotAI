/**
 * Centralized history storage management
 * Single pattern for reading and writing history to localStorage
 */

import { STORAGE_KEYS, scopedKey } from "./storageKeys";

export interface HistoryItem {
  id: string;
  songName: string;
  artist: string;
  recognitionType: "audio" | "image";
  source: string;
  youtubeVideoId?: string;
  timestamp: number;
  imageUrl?: string;
  artworkUrl?: string;
}

/**
 * Read history for a specific profile from localStorage
 * Returns empty array if no history exists or on parse error
 */
export function readHistory(profileId: string): HistoryItem[] {
  if (typeof window === "undefined") return [];

  try {
    const key = scopedKey(STORAGE_KEYS.history, profileId);
    const stored = window.localStorage.getItem(key);
    if (!stored) return [];
    return JSON.parse(stored) as HistoryItem[];
  } catch (error) {
    console.warn("Failed to parse history from localStorage:", error);
    return [];
  }
}

/**
 * Write history for a specific profile to localStorage
 */
export function writeHistory(profileId: string, history: HistoryItem[]): void {
  if (typeof window === "undefined") return;

  try {
    const key = scopedKey(STORAGE_KEYS.history, profileId);
    window.localStorage.setItem(key, JSON.stringify(history));
  } catch (error) {
    console.warn("Failed to write history to localStorage:", error);
  }
}

/**
 * Clear history for a specific profile
 */
export function clearHistory(profileId: string): void {
  if (typeof window === "undefined") return;
  const key = scopedKey(STORAGE_KEYS.history, profileId);
  window.localStorage.removeItem(key);
}

/**
 * Add an item to history (prepend to beginning)
 */
export function addToHistory(
  profileId: string,
  item: HistoryItem
): HistoryItem[] {
  const current = readHistory(profileId);
  const updated = [item, ...current];
  writeHistory(profileId, updated);
  return updated;
}

/**
 * Remove an item from history by id
 */
export function removeFromHistory(
  profileId: string,
  itemId: string
): HistoryItem[] {
  const current = readHistory(profileId);
  const updated = current.filter((item) => item.id !== itemId);
  writeHistory(profileId, updated);
  return updated;
}
