import type { Request, Response } from "express";
import * as db from "../../db/authStore";
import { sendError } from "../../errors/errorCatalog";

/** Replaces the authenticated user's playlists with a client-provided synchronized snapshot. */
export async function syncLibraryController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(req, res, 401, "UNAUTHORIZED");
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

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Library sync error:", error);
    sendError(req, res, 500, "SYNC_FAILED");
  }
}

/** Returns the authenticated user's library payload (currently user playlists). */
export async function getLibraryController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(req, res, 401, "UNAUTHORIZED");
    return;
  }

  try {
    const playlists = await db.getUserPlaylists(userId);
    res.status(200).json({ playlists });
  } catch (error) {
    console.error("Get library error:", error);
    sendError(req, res, 500, "GET_LIBRARY_FAILED");
  }
}
