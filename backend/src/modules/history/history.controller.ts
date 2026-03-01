import type { Request, Response } from "express";
import {
  addHistoryEntry,
  addUserHistoryEntry,
  clearUserHistory,
  deleteUserHistoryItem,
  listHistory,
  listUserHistory,
  type HistoryFilter,
} from "./history.service";

export async function getHistoryController(req: Request, res: Response): Promise<void> {
  // If no authenticated user, serve the legacy flat history.json (guest recognitions)
  if (!req.userId) {
    return getLegacyHistoryController(req, res);
  }

  const limit = Number(req.query.limit || 20);
  const offset = Number(req.query.offset || 0);
  const filter = ((req.query.filter as HistoryFilter) || "all") as HistoryFilter;
  const result = await listUserHistory(req.userId, Math.max(1, Math.min(100, limit)), Math.max(0, offset), filter);
  res.status(200).json(result);
}

export async function createHistoryEntryController(req: Request, res: Response): Promise<void> {
  const { method, title, artist, album, coverUrl, recognized, songName, youtubeVideoId } = req.body as {
    method?: string;
    title?: string;
    artist?: string;
    album?: string;
    coverUrl?: string;
    recognized?: boolean;
    songName?: string;
    youtubeVideoId?: string;
  };

  if (req.userId) {
    if (!method) {
      res.status(400).json({ error: "METHOD_REQUIRED" });
      return;
    }

    const item = await addUserHistoryEntry(req.userId, {
      method,
      title,
      artist,
      album,
      coverUrl,
      recognized: Boolean(recognized),
    });

    await addHistoryEntry({
      songName: title || songName || "Unknown Song",
      artist: artist || "Unknown Artist",
      youtubeVideoId,
    });

    res.status(201).json(item);
    return;
  }

  if (!songName && !title) {
    res.status(400).json({ message: "songName/title required for guest history." });
    return;
  }

  const entry = await addHistoryEntry({
    songName: songName || title || "Unknown Song",
    artist: artist || "Unknown Artist",
    youtubeVideoId,
  });
  res.status(201).json(entry);
}

export async function deleteHistoryItemController(req: Request, res: Response): Promise<void> {
  try {
    const ok = await deleteUserHistoryItem(req.userId!, req.params.id);
    if (!ok) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    throw error;
  }
}

export async function clearHistoryController(req: Request, res: Response): Promise<void> {
  const deleted = await clearUserHistory(req.userId!);
  res.status(200).json({ deleted });
}

export async function getLegacyHistoryController(_req: Request, res: Response): Promise<void> {
  const items = await listHistory(20);
  res.status(200).json({ items });
}
