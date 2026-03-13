import type { Request, Response } from "express";
import * as db from "../../db/authStore";

export async function createPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const { name } = req.body as { name: string };

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "INVALID_NAME" });
    return;
  }

  try {
    const playlist = await db.createPlaylist(userId, name.trim());
    res.status(201).json(playlist);
  } catch (error) {
    console.error("Create playlist error:", error);
    res.status(500).json({ error: "CREATE_FAILED" });
  }
}

export async function getPlaylistsController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  try {
    const playlists = await db.getUserPlaylists(userId);
    res.status(200).json({ playlists });
  } catch (error) {
    console.error("Get playlists error:", error);
    res.status(500).json({ error: "GET_FAILED" });
  }
}

export async function getPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const { playlistId } = req.params;

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }

    if (playlist.userId !== userId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    res.status(200).json(playlist);
  } catch (error) {
    console.error("Get playlist error:", error);
    res.status(500).json({ error: "GET_FAILED" });
  }
}

export async function updatePlaylistNameController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const { playlistId } = req.params;
  const { name } = req.body as { name: string };

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "INVALID_NAME" });
    return;
  }

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }

    if (playlist.userId !== userId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const updated = await db.updatePlaylistName(playlistId, name.trim());
    res.status(200).json(updated);
  } catch (error) {
    console.error("Update playlist error:", error);
    res.status(500).json({ error: "UPDATE_FAILED" });
  }
}

export async function addSongToPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
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
    res.status(400).json({ error: "MISSING_SONG_INFO" });
    return;
  }

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }

    if (playlist.userId !== userId) {
      res.status(403).json({ error: "FORBIDDEN" });
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
    res.status(500).json({ error: "ADD_SONG_FAILED" });
  }
}

export async function removeSongFromPlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const { playlistId } = req.params;
  const { title, artist } = req.body as { title: string; artist: string };

  if (!title || !artist) {
    res.status(400).json({ error: "MISSING_SONG_INFO" });
    return;
  }

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }

    if (playlist.userId !== userId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const updated = await db.removeSongFromPlaylist(playlistId, title, artist);
    res.status(200).json(updated);
  } catch (error) {
    console.error("Remove song error:", error);
    res.status(500).json({ error: "REMOVE_SONG_FAILED" });
  }
}

export async function deletePlaylistController(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const { playlistId } = req.params;

  try {
    const playlist = await db.findPlaylistById(playlistId);
    if (!playlist) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }

    if (playlist.userId !== userId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    await db.deletePlaylist(playlistId);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Delete playlist error:", error);
    res.status(500).json({ error: "DELETE_FAILED" });
  }
}
