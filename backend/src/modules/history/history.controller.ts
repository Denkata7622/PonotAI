import type { Request, Response } from "express";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import {
  addHistoryEntry,
  addUserHistoryEntry,
  clearUserHistory,
  deleteUserHistoryItem,
  listHistory,
  listUserHistory,
  type HistoryFilter,
} from "./history.service";

/**
 * Returns history entries for the current request context.
 * Authenticated users receive paginated, filterable user history.
 * Guests receive the legacy public history list.
 * @route GET /api/history
 * @auth Optional bearer token.
 * @example GET /api/history?limit=20&offset=0&filter=recognized
 * @param req Express request carrying optional auth and pagination query params.
 * @param res Express response returning either legacy or user-scoped history payload.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected persistence failures.
 */
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

/**
 * Creates a history entry.
 * For authenticated users this writes both user history and global history.
 * For guests this writes only the legacy global history entry format.
 * @route POST /api/history
 * @auth Optional bearer token.
 * @example POST /api/history {"method":"audio-file","title":"Song","artist":"Artist","recognized":true}
 * @param req Express request containing history payload fields.
 * @param res Express response returning the created entry.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected persistence failures.
 */
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
      sendError(res, ErrorCatalog.METHOD_REQUIRED);
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
    sendError(res, ErrorCatalog.INVALID_PAYLOAD, { required: ["songName", "title"] });
    return;
  }

  const entry = await addHistoryEntry({
    songName: songName || title || "Unknown Song",
    artist: artist || "Unknown Artist",
    youtubeVideoId,
  });
  res.status(201).json(entry);
}

/**
 * Deletes a single authenticated user's history item by id.
 * @route DELETE /api/history/:id
 * @auth Required bearer token.
 * @example DELETE /api/history/2e6d18f5-77bf-448f-b8bf-4f7e00f6dd54
 * @param req Express request containing the history id path parameter.
 * @param res Express response returning `{ ok: true }` when deleted.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected errors other than ownership violations.
 */
export async function deleteHistoryItemController(req: Request, res: Response): Promise<void> {
  try {
    const ok = await deleteUserHistoryItem(req.userId!, req.params.id);
    if (!ok) {
      sendError(res, ErrorCatalog.NOT_FOUND);
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") {
      sendError(res, ErrorCatalog.FORBIDDEN);
      return;
    }
    throw error;
  }
}

/**
 * Deletes all history entries for the authenticated user.
 * @route DELETE /api/history
 * @auth Required bearer token.
 * @example DELETE /api/history
 * @param req Express request containing the authenticated user id.
 * @param res Express response returning deleted count.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected persistence failures.
 */
export async function clearHistoryController(req: Request, res: Response): Promise<void> {
  const deleted = await clearUserHistory(req.userId!);
  res.status(200).json({ deleted });
}

/**
 * Returns the legacy public history feed used by unauthenticated requests.
 * @route GET /api/history
 * @auth No authentication required.
 * @example GET /api/history
 * @param _req Express request (unused).
 * @param res Express response returning the legacy history payload.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected persistence failures.
 */
export async function getLegacyHistoryController(_req: Request, res: Response): Promise<void> {
  const items = await listHistory(20);
  res.status(200).json({ items });
}
