import { useEffect, useMemo, useState } from "react";
import { syncLibraryState } from "./api";
import { loadLibraryState, persistLibraryState } from "./storage";
import type { LibraryState, Playlist, PlaylistSong, StoredFavorite } from "./types";
import * as playlistApi from "./api";
import { normalizeTrackKey } from "../../lib/dedupe";
import { useUser } from "../../src/context/UserContext";

export function useLibrary(profileId: string) {
  const [libraryState, setLibraryState] = useState<LibraryState>(() => loadLibraryState(profileId));
  const { isAuthenticated } = useUser();

  useEffect(() => {
    setLibraryState(loadLibraryState(profileId));
  }, [profileId]);

  useEffect(() => {
    persistLibraryState(libraryState, profileId);
    if (isAuthenticated) {
      void syncLibraryState(libraryState);
    }
  }, [libraryState, profileId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLibraryState((prev) => ({ ...prev, playlists: [] }));
      return;
    }

    let isCancelled = false;
    (async () => {
      const playlists = await playlistApi.getPlaylists();
      if (isCancelled) return;
      setLibraryState((prev) => ({ ...prev, playlists }));
    })();

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated]);

  const favoritesSet = useMemo(() => new Set(libraryState.favorites.map((favorite) => favorite.key)), [libraryState.favorites]);
  const favoritesList: StoredFavorite[] = libraryState.favorites;

  function toggleFavorite(trackId: string, title?: string, artist?: string, artworkUrl?: string, videoId?: string) {
    const favoriteKey = normalizeTrackKey(title ?? trackId, artist ?? "");
    setLibraryState((prev) => {
      const exists = prev.favorites.some((favorite) => favorite.key === favoriteKey);
      if (exists) {
        return { ...prev, favorites: prev.favorites.filter((favorite) => favorite.key !== favoriteKey) };
      }
      return {
        ...prev,
        favorites: [...prev.favorites, { key: favoriteKey, title: title ?? trackId, artist: artist ?? "", artworkUrl, videoId }],
      };
    });
  }

  async function createPlaylist(name: string): Promise<Playlist | null> {
    if (!isAuthenticated) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const result = await playlistApi.createPlaylist(trimmed);
    if (result) {
      setLibraryState((prev) => ({ ...prev, playlists: [...prev.playlists, result] }));
    }
    return result;
  }

  async function deletePlaylist(playlistId: string) {
    if (!isAuthenticated) return;
    await playlistApi.deletePlaylist(playlistId);
    setLibraryState((prev) => ({ ...prev, playlists: prev.playlists.filter((playlist) => playlist.id !== playlistId) }));
  }

  async function addSongToPlaylist(playlistId: string, song: PlaylistSong): Promise<boolean> {
    if (!isAuthenticated) return false;
    const updatedRemotePlaylist = await playlistApi.addSongToPlaylist(playlistId, song);
    if (!updatedRemotePlaylist) return false;

    setLibraryState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((playlist) => (playlist.id === playlistId ? updatedRemotePlaylist : playlist)),
    }));
    return true;
  }

  async function removeSongFromPlaylist(playlistId: string, title: string, artist: string) {
    if (isAuthenticated) {
      const updatedRemotePlaylist = await playlistApi.removeSongFromPlaylist(playlistId, title, artist);
      if (!updatedRemotePlaylist) return;
      setLibraryState((prev) => ({
        ...prev,
        playlists: prev.playlists.map((playlist) => (playlist.id === playlistId ? updatedRemotePlaylist : playlist)),
      }));
      return;
    }
    setLibraryState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        return { ...playlist, songs: playlist.songs.filter((s) => !(s.title === title && s.artist === artist)) };
      }),
    }));
  }

  return {
    playlists: isAuthenticated ? libraryState.playlists : [],
    favoritesSet,
    favoritesList,
    toggleFavorite,
    createPlaylist,
    deletePlaylist,
    addSongToPlaylist,
    removeSongFromPlaylist,
  };
}
