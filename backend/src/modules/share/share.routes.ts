import { Router } from "express";
import { createSharedSong, findSharedSongByCode, findUserById } from "../../db/authStore";
import { requireAuth } from "../../middlewares/auth.middleware";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";

const shareRouter = Router();

shareRouter.post("/", requireAuth, async (req, res) => {
  const { title, artist, album, coverUrl } = req.body as { title?: string; artist?: string; album?: string; coverUrl?: string };
  if (!title || !artist) return void sendError(res, ErrorCatalog.INVALID_PAYLOAD);

  const shared = await createSharedSong({ userId: req.userId!, title, artist, album, coverUrl });
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  res.status(201).json({ shareCode: shared.shareCode, shareUrl: `${frontendUrl}/shared/${shared.shareCode}` });
});

shareRouter.get("/:shareCode", async (req, res) => {
  const item = await findSharedSongByCode(req.params.shareCode);
  if (!item) return void sendError(res, ErrorCatalog.NOT_FOUND);

  const user = await findUserById(item.userId);
  res.status(200).json({
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.coverUrl,
    sharedBy: user?.username || "Unknown",
    createdAt: item.createdAt,
  });
});

export default shareRouter;
