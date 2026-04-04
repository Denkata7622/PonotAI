import type { Request, Response } from "express";
import * as db from "../../db/authStore";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import { invalidateLibraryContextCache } from "../../services/assistant/contextBuilder";

/**
 * Creates a new playlist for the authenticated user.
 * @route POST /api/playlists
 * @auth Required bearer token.
 * @example POST /api/playlists {"name":"Gym Mix"}
 * @param req Express request containing the playlist name.
 * @param res Express response returning the created playlist.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected datastore failures.
 */
export async function createPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  const { name } = req.body as { name: string };

  if (!name || typeof name !== "string" || !name.trim()) {
    sendError(res, ErrorCatalog.INVALID_NAME);
    return;
  }

  try {
    const playlist = await db.createPlaylist(userId, name.trim());
    invalidateLibraryContextCache(userId);
    res.status(201).json(playlist);
  } catch (error) {
    console.error("Create playlist error:", error);
    sendError(res, ErrorCatalog.CREATE_FAILED);
  }
}

/**
 * Lists all playlists owned by the authenticated user.
 * @route GET /api/playlists
 * @auth Required bearer token.
 * @example GET /api/playlists
 * @param req Express request containing the authenticated user id.
 * @param res Express response returning user playlists.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected datastore failures.
 */
export async function getPlaylistsController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  try {
    const playlists = await db.getUserPlaylists(userId);
    res.status(200).json({ playlists });
  } catch (error) {
    console.error("Get playlists error:", error);
    sendError(res, ErrorCatalog.GET_FAILED);
  }
}

/**
 * Gets one playlist by id and verifies ownership before returning it.
 * @route GET /api/playlists/:playlistId
 * @auth Required bearer token.
 * @example GET /api/playlists/pl_123
 * @param req Express request containing playlist id path param.
 * @param res Express response returning playlist payload.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected datastore failures.
 */
export async function getPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  const { playlistId } = req.params;

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      sendError(res, ErrorCatalog.NOT_FOUND);
      return;
    }

    if (playlist.userId !== userId) {
      sendError(res, ErrorCatalog.NOT_FOUND);
      return;
    }

    res.status(200).json(playlist);
  } catch (error) {
    console.error("Get playlist error:", error);
    sendError(res, ErrorCatalog.GET_FAILED);
  }
}

/**
 * Renames one playlist owned by the authenticated user.
 * @route PATCH /api/playlists/:playlistId
 * @auth Required bearer token.
 * @example PATCH /api/playlists/pl_123 {"name":"Evening Chill"}
 * @param req Express request with playlist id and replacement name.
 * @param res Express response returning updated playlist payload.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected datastore failures.
 */
export async function updatePlaylistNameController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  const { playlistId } = req.params;
  const { name } = req.body as { name: string };

  if (!name || typeof name !== "string" || !name.trim()) {
    sendError(res, ErrorCatalog.INVALID_NAME);
    return;
  }

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      sendError(res, ErrorCatalog.NOT_FOUND);
      return;
    }

    if (playlist.userId !== userId) {
      sendError(res, ErrorCatalog.FORBIDDEN);
      return;
    }

    const updated = await db.updatePlaylistName(playlistId, name.trim());
    invalidateLibraryContextCache(userId);
    res.status(200).json(updated);
  } catch (error) {
    console.error("Update playlist error:", error);
    sendError(res, ErrorCatalog.UPDATE_FAILED);
  }
}

/**
 * Adds a song payload to a playlist after authorization and ownership checks.
 * @route POST /api/playlists/:playlistId/songs
 * @auth Required bearer token.
 * @example POST /api/playlists/pl_123/songs {"title":"Song","artist":"Artist"}
 * @param req Express request with playlist id and song payload.
 * @param res Express response returning updated playlist payload.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected datastore failures.
 */
export async function addSongToPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  const { playlistId } = req.params;
  const { title, artist, album, coverUrl, videoId } = req.body as {
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    videoId?: string;
  };

  if (!title || !artist) {
    sendError(res, ErrorCatalog.MISSING_SONG_INFO);
    return;
  }

  console.info("Add song request received", {
    userId,
    playlistId,
    hasAuthorizationHeader: Boolean(req.headers.authorization),
    body: { title, artist, album, coverUrl, videoId },
  });

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      sendError(res, ErrorCatalog.NOT_FOUND);
      return;
    }

    if (playlist.userId !== userId) {
      sendError(res, ErrorCatalog.FORBIDDEN);
      return;
    }

    const updated = await db.addSongToPlaylist(playlistId, {
      title,
      artist,
      album,
      coverUrl,
      videoId,
    });

    invalidateLibraryContextCache(userId);
    res.status(200).json(updated);
  } catch (error) {
    console.error("Add song error:", error);
    sendError(res, ErrorCatalog.ADD_SONG_FAILED);
  }
}

/**
 * Removes a song from a playlist after authorization and ownership checks.
 * @route DELETE /api/playlists/:playlistId/songs
 * @auth Required bearer token.
 * @example DELETE /api/playlists/pl_123/songs {"title":"Song","artist":"Artist"}
 * @param req Express request with playlist id and song identifiers.
 * @param res Express response returning updated playlist payload.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected datastore failures.
 */
export async function removeSongFromPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  const { playlistId } = req.params;
  const { title, artist } = req.body as { title: string; artist: string };

  if (!title || !artist) {
    sendError(res, ErrorCatalog.MISSING_SONG_INFO);
    return;
  }

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      sendError(res, ErrorCatalog.NOT_FOUND);
      return;
    }

    if (playlist.userId !== userId) {
      sendError(res, ErrorCatalog.FORBIDDEN);
      return;
    }

    const updated = await db.removeSongFromPlaylist(playlistId, title, artist);
    invalidateLibraryContextCache(userId);
    res.status(200).json(updated);
  } catch (error) {
    console.error("Remove song error:", error);
    sendError(res, ErrorCatalog.REMOVE_SONG_FAILED);
  }
}

/**
 * Deletes a playlist owned by the authenticated user.
 * @route DELETE /api/playlists/:playlistId
 * @auth Required bearer token.
 * @example DELETE /api/playlists/pl_123
 * @param req Express request containing playlist id path param.
 * @param res Express response returning `{ ok: true }`.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected datastore failures.
 */
export async function deletePlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  const { playlistId } = req.params;

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      sendError(res, ErrorCatalog.NOT_FOUND);
      return;
    }

    if (playlist.userId !== userId) {
      sendError(res, ErrorCatalog.FORBIDDEN);
      return;
    }

    await db.deletePlaylist(playlistId);
    invalidateLibraryContextCache(userId);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Delete playlist error:", error);
    sendError(res, ErrorCatalog.DELETE_FAILED);
  }
}
