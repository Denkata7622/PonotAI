import { useEffect, useMemo, useState } from "react";
import { loadLibraryState, persistLibraryState } from "./storage";
import type { LibraryState, Playlist, PlaylistSong, StoredFavorite } from "./types";
import * as playlistApi from "./api";
import { normalizeTrackKey } from "../../lib/dedupe";
import { useUser } from "../../src/context/UserContext";

export function useLibrary(profileId: string) {
  const [libraryState, setLibraryState] = useState<LibraryState>(() => loadLibraryState(profileId));
  const { isAuthenticated, favorites, addFavorite, removeFavorite } = useUser();

  useEffect(() => {
    setLibraryState(loadLibraryState(profileId));
  }, [profileId]);

  useEffect(() => {
    persistLibraryState(libraryState, profileId);
  }, [libraryState, profileId]);

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

  const favoritesList: StoredFavorite[] = useMemo(
    () =>
      favorites.map((favorite) => ({
        key: normalizeTrackKey(favorite.title, favorite.artist),
        title: favorite.title,
        artist: favorite.artist,
        artworkUrl: favorite.coverUrl ?? undefined,
      })),
    [favorites],
  );
  const favoritesSet = useMemo(() => new Set(favoritesList.map((favorite) => favorite.key)), [favoritesList]);

  function toggleFavorite(_trackId: string, title?: string, artist?: string, artworkUrl?: string, _videoId?: string) {
    const favoriteKey = normalizeTrackKey(title ?? "", artist ?? "");
    if (!title || !artist) return;
    const existing = favorites.find((favorite) => normalizeTrackKey(favorite.title, favorite.artist) === favoriteKey);

    if (existing) {
      void removeFavorite(existing.id);
      return;
    }

    void addFavorite({
      title,
      artist,
      coverUrl: artworkUrl,
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

  async function addSongsToPlaylist(playlistId: string, songs: PlaylistSong[]): Promise<number> {
    if (!isAuthenticated || songs.length === 0) return 0;
    const payload = await playlistApi.addSongsToPlaylist(playlistId, songs);
    if (!payload) return 0;

    setLibraryState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((playlist) => (playlist.id === playlistId ? payload.playlist : playlist)),
    }));
    return payload.added;
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
    addSongsToPlaylist,
    removeSongFromPlaylist,
  };
}
