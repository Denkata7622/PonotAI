import type { Request, Response } from "express";
import * as db from "../../db/authStore";
import { sendError } from "../../errors/errorCatalog";

/** Creates a new playlist for the authenticated user. */
export async function createPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(req, res, 401, "UNAUTHORIZED");
    return;
  }

  const { name } = req.body as { name: string };

  if (!name || typeof name !== "string" || !name.trim()) {
    sendError(req, res, 400, "INVALID_NAME");
    return;
  }

  try {
    const playlist = await db.createPlaylist(userId, name.trim());
    res.status(201).json(playlist);
  } catch (error) {
    console.error("Create playlist error:", error);
    sendError(req, res, 500, "CREATE_FAILED");
  }
}

/** Lists all playlists owned by the authenticated user. */
export async function getPlaylistsController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(req, res, 401, "UNAUTHORIZED");
    return;
  }

  try {
    const playlists = await db.getUserPlaylists(userId);
    res.status(200).json({ playlists });
  } catch (error) {
    console.error("Get playlists error:", error);
    sendError(req, res, 500, "GET_FAILED");
  }
}

/** Gets one playlist by id and verifies ownership before returning it. */
export async function getPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(req, res, 401, "UNAUTHORIZED");
    return;
  }

  const { playlistId } = req.params;

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      sendError(req, res, 404, "NOT_FOUND");
      return;
    }

    if (playlist.userId !== userId) {
      sendError(req, res, 403, "FORBIDDEN");
      return;
    }

    res.status(200).json(playlist);
  } catch (error) {
    console.error("Get playlist error:", error);
    sendError(req, res, 500, "GET_FAILED");
  }
}

/** Renames one playlist owned by the authenticated user. */
export async function updatePlaylistNameController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(req, res, 401, "UNAUTHORIZED");
    return;
  }

  const { playlistId } = req.params;
  const { name } = req.body as { name: string };

  if (!name || typeof name !== "string" || !name.trim()) {
    sendError(req, res, 400, "INVALID_NAME");
    return;
  }

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      sendError(req, res, 404, "NOT_FOUND");
      return;
    }

    if (playlist.userId !== userId) {
      sendError(req, res, 403, "FORBIDDEN");
      return;
    }

    const updated = await db.updatePlaylistName(playlistId, name.trim());
    res.status(200).json(updated);
  } catch (error) {
    console.error("Update playlist error:", error);
    sendError(req, res, 500, "UPDATE_FAILED");
  }
}

/** Adds a song payload to a playlist after authorization and ownership checks. */
export async function addSongToPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(req, res, 401, "UNAUTHORIZED");
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
    sendError(req, res, 400, "MISSING_SONG_INFO");
    return;
  }

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      sendError(req, res, 404, "NOT_FOUND");
      return;
    }

    if (playlist.userId !== userId) {
      sendError(req, res, 403, "FORBIDDEN");
      return;
    }

    const updated = await db.addSongToPlaylist(playlistId, {
      title,
      artist,
      album,
      coverUrl,
      videoId,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error("Add song error:", error);
    sendError(req, res, 500, "ADD_SONG_FAILED");
  }
}

/** Removes a song from a playlist after authorization and ownership checks. */
export async function removeSongFromPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(req, res, 401, "UNAUTHORIZED");
    return;
  }

  const { playlistId } = req.params;
  const { title, artist } = req.body as { title: string; artist: string };

  if (!title || !artist) {
    sendError(req, res, 400, "MISSING_SONG_INFO");
    return;
  }

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      sendError(req, res, 404, "NOT_FOUND");
      return;
    }

    if (playlist.userId !== userId) {
      sendError(req, res, 403, "FORBIDDEN");
      return;
    }

    const updated = await db.removeSongFromPlaylist(playlistId, title, artist);
    res.status(200).json(updated);
  } catch (error) {
    console.error("Remove song error:", error);
    sendError(req, res, 500, "REMOVE_SONG_FAILED");
  }
}

/** Deletes a playlist owned by the authenticated user. */
export async function deletePlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    sendError(req, res, 401, "UNAUTHORIZED");
    return;
  }

  const { playlistId } = req.params;

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      sendError(req, res, 404, "NOT_FOUND");
      return;
    }

    if (playlist.userId !== userId) {
      sendError(req, res, 403, "FORBIDDEN");
      return;
    }

    await db.deletePlaylist(playlistId);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Delete playlist error:", error);
    sendError(req, res, 500, "DELETE_FAILED");
  }
}
