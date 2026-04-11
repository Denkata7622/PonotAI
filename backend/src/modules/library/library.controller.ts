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

  const body = req.body as {
    playlists?: Array<{ id?: string; name?: string; songs?: Array<{ title?: string; artist?: string; album?: string; coverUrl?: string; videoId?: string }> }>;
    mode?: "merge" | "replace";
    confirmed?: boolean;
    source?: string;
  };

  try {
    if (!Array.isArray(body.playlists)) {
      sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "playlists" });
      return;
    }
    const sanitized = body.playlists.map((playlist) => ({
      id: typeof playlist.id === "string" ? playlist.id.trim() : undefined,
      name: typeof playlist.name === "string" ? playlist.name.trim() : "",
      songs: Array.isArray(playlist.songs)
        ? playlist.songs
          .filter((song) => song && typeof song.title === "string" && typeof song.artist === "string")
          .map((song) => ({
            title: String(song.title).trim(),
            artist: String(song.artist).trim(),
            album: song.album,
            coverUrl: song.coverUrl,
            videoId: song.videoId,
          }))
        : [],
    }));
    if (sanitized.some((playlist) => !playlist.name)) {
      sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "playlists[].name" });
      return;
    }

    const replaceMode = body.mode === "replace";
    const allowEmptyReplace = replaceMode && body.confirmed === true;
    const updated = await db.syncUserPlaylists(userId, sanitized, {
      mode: replaceMode ? "replace" : "merge",
      allowEmptyReplace,
    });
    console.info("[assistant-safe-write] library.sync", {
      userId,
      source: body.source ?? "unknown",
      mode: replaceMode ? "replace" : "merge",
      confirmed: body.confirmed === true,
      playlists: updated.length,
    });

    invalidateLibraryContextCache(userId);
    res.status(200).json({ ok: true, playlists: updated.length });
  } catch (error) {
    if ((error as Error).message === "SAFE_GUARD_EMPTY_PLAYLIST_REPLACE") {
      sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "playlists", reason: "empty replace requires explicit confirmation" });
      return;
    }
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
