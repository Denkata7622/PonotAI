import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { createFavorite, deleteFavorite, findDuplicateFavorite, listFavorites } from "../../db/authStore";
import { sendError } from "../../errors/errorCatalog";

const favoritesRouter = Router();

favoritesRouter.use(requireAuth);

favoritesRouter.get("/", async (req, res) => {
  const items = await listFavorites(req.userId!);
  res.status(200).json({ items });
});

favoritesRouter.post("/", async (req, res) => {
  const { title, artist, album, coverUrl } = req.body as { title?: string; artist?: string; album?: string; coverUrl?: string };
  if (!title || !artist) return void sendError(req, res, 400, "INVALID_PAYLOAD");

  const dup = await findDuplicateFavorite(req.userId!, title, artist);
  if (dup) return void res.status(200).json(dup);

  const item = await createFavorite({ userId: req.userId!, title, artist, album, coverUrl });
  res.status(201).json(item);
});

favoritesRouter.delete("/:id", async (req, res) => {
  const status = await deleteFavorite(req.userId!, req.params.id);
  if (status === "missing") return void sendError(req, res, 404, "NOT_FOUND");
  if (status === "forbidden") return void sendError(req, res, 403, "FORBIDDEN");
  res.status(200).json({ ok: true });
});

export default favoritesRouter;
