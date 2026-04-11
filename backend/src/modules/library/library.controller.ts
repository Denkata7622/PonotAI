import type { Request, Response } from "express";
import * as db from "../../db/authStore";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import { invalidateLibraryContextCache } from "../../services/assistant/contextBuilder";
import { listFavorites, listUserHistory, listAchievements } from "../../db/authStore";

/**
 * Replaces the authenticated user's playlists with a client-provided synchronized snapshot.
 * @route POST /api/library/sync
 * @auth Required bearer token.
 * @example POST /api/library/sync {"playlists":[{"id":"pl_1","name":"Road Trip","songs":[]}]}
 * @param req Express request containing synced favorites/playlists payload.
 * @param res Express response returning `{ ok: true }` on success.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected datastore failures.
 */
export async function syncLibraryController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  const { favorites, playlists } = req.body as {
    favorites?: string[];
    playlists?: Array<{ id: string; name: string; songs: Array<{ title: string; artist: string; album?: string; coverUrl?: string }> }>;
  };

  try {
    // Clear existing playlists for this user
    await db.clearUserPlaylists(userId);

    // Create new playlists with songs
    if (playlists && Array.isArray(playlists)) {
      for (const playlist of playlists) {
        await db.createPlaylist(userId, playlist.name, playlist.id, playlist.songs);
      }
    }

    invalidateLibraryContextCache(userId);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Library sync error:", error);
    sendError(res, ErrorCatalog.SYNC_FAILED);
  }
}

/**
 * Returns the authenticated user's library payload (currently user playlists).
 * @route GET /api/library
 * @auth Required bearer token.
 * @example GET /api/library
 * @param req Express request containing the authenticated user id.
 * @param res Express response returning playlists in the user's library.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected datastore failures.
 */
export async function getLibraryController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  try {
    const playlists = await db.getUserPlaylists(userId);
    res.status(200).json({ playlists });
  } catch (error) {
    console.error("Get library error:", error);
    sendError(res, ErrorCatalog.GET_LIBRARY_FAILED);
  }
}

export async function getLibraryReportController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  const [playlists, favorites, history, achievements] = await Promise.all([
    db.getUserPlaylists(userId),
    listFavorites(userId),
    listUserHistory(userId),
    listAchievements(userId),
  ]);

  const topSongs = new Map<string, number>();
  for (const item of history) {
    const key = `${item.title ?? "Unknown"} — ${item.artist ?? "Unknown"}`;
    topSongs.set(key, (topSongs.get(key) ?? 0) + 1);
  }

  res.status(200).json({
    version: 2,
    generatedAt: new Date().toISOString(),
    summary: {
      recognitions: history.length,
      favorites: favorites.length,
      playlists: playlists.length,
      achievements: achievements.length,
    },
    topSongs: [...topSongs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    achievements,
    recentRecognitions: history.slice(0, 15).map((item) => ({
      title: item.title,
      artist: item.artist,
      album: item.album,
      createdAt: item.createdAt,
    })),
  });
}
