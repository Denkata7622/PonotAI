import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import {
  createPlaylistController,
  getPlaylistsController,
  getPlaylistController,
  updatePlaylistNameController,
  addSongToPlaylistController,
  removeSongFromPlaylistController,
  deletePlaylistController,
} from "./playlists.controller";

const playlistsRouter = Router();

playlistsRouter.use(requireAuth);

// Get all playlists for user
playlistsRouter.get("/", getPlaylistsController);

// Create a new playlist
playlistsRouter.post("/", createPlaylistController);

// Get a specific playlist
playlistsRouter.get("/:playlistId", getPlaylistController);

// Update playlist name
playlistsRouter.patch("/:playlistId", updatePlaylistNameController);
playlistsRouter.put("/:playlistId", updatePlaylistNameController);

// Add a song to playlist
playlistsRouter.post("/:playlistId/songs", addSongToPlaylistController);
playlistsRouter.post("/:id/songs", addSongToPlaylistController);

// Remove a song from playlist
playlistsRouter.delete("/:playlistId/songs", removeSongFromPlaylistController);

// Delete a playlist
playlistsRouter.delete("/:playlistId", deletePlaylistController);

export default playlistsRouter;
