import { Router } from "express";
import {
  createSharedPlaylist,
  createSharedRecognition,
  createSharedSong,
  findPlaylistById,
  findSharedPlaylistByCode,
  findSharedRecognitionByCode,
  findSharedSongByCode,
  findUserById,
} from "../../db/authStore";
import { requireAuth } from "../../middlewares/auth.middleware";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import { normalizeVisibleText } from "../../utils/text";

const shareRouter = Router();

shareRouter.post("/song", requireAuth, async (req, res) => {
  const { title, artist, album, coverUrl } = req.body as { title?: string; artist?: string; album?: string; coverUrl?: string };
  const safeTitle = normalizeVisibleText(title).slice(0, 180);
  const safeArtist = normalizeVisibleText(artist).slice(0, 180);
  if (!safeTitle || !safeArtist) return void sendError(res, ErrorCatalog.INVALID_PAYLOAD);

  const shared = await createSharedSong({ userId: req.userId!, title: safeTitle, artist: safeArtist, album, coverUrl });
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  res.status(201).json({ type: "song", shareCode: shared.shareCode, shareUrl: `${frontendUrl}/shared/${shared.shareCode}` });
});

shareRouter.post("/playlist/:playlistId", requireAuth, async (req, res) => {
  const playlist = await findPlaylistById(req.params.playlistId);
  if (!playlist) return void sendError(res, ErrorCatalog.NOT_FOUND);
  if (playlist.userId !== req.userId) return void sendError(res, ErrorCatalog.FORBIDDEN);

  const shared = await createSharedPlaylist({
    userId: req.userId!,
    playlistId: playlist.id,
    title: playlist.name.slice(0, 180),
    songCount: playlist.songs.length,
  });

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  res.status(201).json({ type: "playlist", shareCode: shared.shareCode, shareUrl: `${frontendUrl}/shared/${shared.shareCode}` });
});

shareRouter.post("/recognition", requireAuth, async (req, res) => {
  const { title, artist, album, coverUrl, source } = req.body as {
    title?: string;
    artist?: string;
    album?: string;
    coverUrl?: string;
    source?: string;
  };

  const safeTitle = normalizeVisibleText(title).slice(0, 180);
  const safeArtist = normalizeVisibleText(artist).slice(0, 180);
  if (!safeTitle || !safeArtist) return void sendError(res, ErrorCatalog.INVALID_PAYLOAD);

  const shared = await createSharedRecognition({
    userId: req.userId!,
    title: safeTitle,
    artist: safeArtist,
    album: normalizeVisibleText(album).slice(0, 180) || undefined,
    coverUrl: typeof coverUrl === "string" ? coverUrl.slice(0, 500) : undefined,
    source: typeof source === "string" ? source.slice(0, 30) : undefined,
  });
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  res.status(201).json({ type: "recognition", shareCode: shared.shareCode, shareUrl: `${frontendUrl}/shared/${shared.shareCode}` });
});

shareRouter.post("/", requireAuth, async (req, res) => {
  const { title, artist, album, coverUrl } = req.body as { title?: string; artist?: string; album?: string; coverUrl?: string };
  const safeTitle = normalizeVisibleText(title).slice(0, 180);
  const safeArtist = normalizeVisibleText(artist).slice(0, 180);
  if (!safeTitle || !safeArtist) return void sendError(res, ErrorCatalog.INVALID_PAYLOAD);

  const shared = await createSharedSong({ userId: req.userId!, title: safeTitle, artist: safeArtist, album, coverUrl });
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  res.status(201).json({ type: "song", shareCode: shared.shareCode, shareUrl: `${frontendUrl}/shared/${shared.shareCode}` });
});

shareRouter.get("/:shareCode", async (req, res) => {
  const code = req.params.shareCode;
  const song = await findSharedSongByCode(code);
  if (song) {
    const user = await findUserById(song.userId);
    return res.status(200).json({
      type: "song",
      title: song.title,
      artist: song.artist,
      album: song.album,
      coverUrl: song.coverUrl,
      sharedBy: user?.username || "Unknown",
      createdAt: song.createdAt,
    });
  }

  const recognition = await findSharedRecognitionByCode(code);
  if (recognition) {
    const user = await findUserById(recognition.userId);
    return res.status(200).json({
      type: "recognition",
      title: recognition.title,
      artist: recognition.artist,
      album: recognition.album,
      coverUrl: recognition.coverUrl,
      source: recognition.source,
      sharedBy: user?.username || "Unknown",
      createdAt: recognition.createdAt,
      legalActions: ["search", "save"],
    });
  }

  const sharedPlaylist = await findSharedPlaylistByCode(code);
  if (sharedPlaylist) {
    const playlist = await findPlaylistById(sharedPlaylist.playlistId);
    if (!playlist) return void sendError(res, ErrorCatalog.NOT_FOUND);
    const user = await findUserById(sharedPlaylist.userId);

    return res.status(200).json({
      type: "playlist",
      title: sharedPlaylist.title,
      songs: playlist.songs.map((song) => ({
        title: song.title,
        artist: song.artist,
        album: song.album,
        coverUrl: song.coverUrl,
        videoId: song.videoId,
      })),
      songCount: playlist.songs.length,
      sharedBy: user?.username || "Unknown",
      createdAt: sharedPlaylist.createdAt,
      actions: ["import", "copy"],
    });
  }

  return void sendError(res, ErrorCatalog.NOT_FOUND);
});

export default shareRouter;
