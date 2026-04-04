import { randomUUID } from "node:crypto";
import { readHistory, writeHistory } from "../../db/client";
import type { HistoryEntry } from "../../db/models";
import {
  clearUserHistory as clearUserHistoryInStore,
  createUserHistory,
  deleteUserHistoryItem as deleteUserHistoryItemInStore,
  listUserHistory as listUserHistoryInStore,
} from "../../db/authStore";

export type HistoryFilter = "all" | "recognized" | "unrecognized" | "audio-record" | "audio-file" | "album-image";

/**
 * Returns the latest legacy/global history entries capped to the provided limit.
 * @param limit Maximum number of records to return (clamped to 1..100).
 * @returns Promise resolving to the selected history entries.
 * @throws Propagates underlying read failures from the persistence layer.
 */
export async function listHistory(limit = 20): Promise<HistoryEntry[]> {
  const all = await readHistory();
  return all.slice(0, Math.max(1, Math.min(100, limit)));
}

/**
 * Returns paginated authenticated user history filtered by recognition status or method.
 * @param userId Authenticated user id.
 * @param limit Maximum number of records to return.
 * @param offset Start offset for pagination.
 * @param filter Filter by recognition status or capture method.
 * @returns Promise resolving to paginated user history and total count.
 * @throws Propagates underlying read failures from the auth store.
 */
export async function listUserHistory(userId: string, limit = 20, offset = 0, filter: HistoryFilter = "all") {
  const all = await listUserHistoryInStore(userId);
  const filtered = all.filter((item) => {
    if (filter === "all") return true;
    if (filter === "recognized") return item.recognized;
    if (filter === "unrecognized") return !item.recognized;
    return item.method === filter;
  });
  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}

/**
 * Appends a new legacy/global history entry to the persistent JSON store.
 * @param input Song fields used for the new global history entry.
 * @returns Promise resolving to the newly created history entry.
 * @throws Propagates underlying read/write failures from the persistence layer.
 */
export async function addHistoryEntry(input: {
  songName: string;
  artist: string;
  youtubeVideoId?: string;
}): Promise<HistoryEntry> {
  const all = await readHistory();
  const entry: HistoryEntry = {
    id: randomUUID(),
    songName: input.songName,
    artist: input.artist,
    youtubeVideoId: input.youtubeVideoId,
    createdAt: new Date().toISOString(),
  };

  const next = [entry, ...all].slice(0, 200);
  await writeHistory(next);
  return entry;
}

/**
 * Creates an authenticated user's history entry in the auth data store.
 * @param userId Authenticated user id.
 * @param input User-history payload.
 * @returns Promise resolving to the created user-history record.
 * @throws Propagates underlying create failures from the auth store.
 */
export async function addUserHistoryEntry(userId: string, input: {
  method: string;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  recognized: boolean;
}) {
  return createUserHistory({ userId, ...input });
}

/**
 * Deletes a user history entry, mapping ownership violations to a forbidden error.
 * @param userId Authenticated user id.
 * @param id User-history entry id.
 * @returns Promise resolving to `true` when deleted.
 * @throws Error with `FORBIDDEN` message when the entry is not owned by the user.
 */
export async function deleteUserHistoryItem(userId: string, id: string): Promise<boolean> {
  const status = await deleteUserHistoryItemInStore(userId, id);
  if (status === "forbidden") throw new Error("FORBIDDEN");
  return status === "ok";
}

/**
 * Clears all history rows for the provided authenticated user id.
 * @param userId Authenticated user id.
 * @returns Promise resolving to number of deleted rows.
 * @throws Propagates underlying delete failures from the auth store.
 */
export async function clearUserHistory(userId: string): Promise<number> {
  return clearUserHistoryInStore(userId);
}
