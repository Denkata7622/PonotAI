import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { createFavorite, deleteFavorite, deleteFavoriteByTrackKey, findDuplicateFavorite, listFavorites } from "../../db/authStore";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import { invalidateLibraryContextCache } from "../../services/assistant/contextBuilder";
import { normalizeTrackKey } from "../../utils/songIdentity";

const favoritesRouter = Router();

favoritesRouter.use(requireAuth);

favoritesRouter.get("/", async (req, res) => {
  const items = await listFavorites(req.userId!);
  res.status(200).json({ items });
});

favoritesRouter.post("/", async (req, res) => {
  const { title, artist, album, coverUrl } = req.body as { title?: string; artist?: string; album?: string; coverUrl?: string };
  const safeTitle = typeof title === "string" ? title.trim().slice(0, 180) : "";
  const safeArtist = typeof artist === "string" ? artist.trim().slice(0, 180) : "";
  if (!safeTitle || !safeArtist) return void sendError(res, ErrorCatalog.INVALID_PAYLOAD);

  const dup = await findDuplicateFavorite(req.userId!, safeTitle, safeArtist);
  if (dup) return void res.status(200).json(dup);

  const item = await createFavorite({ userId: req.userId!, title: safeTitle, artist: safeArtist, album, coverUrl });
  invalidateLibraryContextCache(req.userId!);
  res.status(201).json(item);
});

favoritesRouter.delete("/:id", async (req, res) => {
  const idOrKey = String(req.params.id || "").trim();
  const status = idOrKey.includes("|||")
    ? await deleteFavoriteByTrackKey(req.userId!, normalizeTrackKey(...idOrKey.split("|||", 2)))
    : await deleteFavorite(req.userId!, idOrKey);
  if (status === "missing") return void sendError(res, ErrorCatalog.NOT_FOUND);
  if (status === "forbidden") return void sendError(res, ErrorCatalog.FORBIDDEN);
  invalidateLibraryContextCache(req.userId!);
  res.status(200).json({ ok: true });
});

export default favoritesRouter;
