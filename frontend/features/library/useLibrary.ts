import { useEffect, useMemo, useRef, useState } from "react";
import { loadLibraryState, persistLibraryState } from "./storage";
import type { LibraryState, Playlist, PlaylistSong, StoredFavorite } from "./types";
import * as playlistApi from "./api";
import { toCanonicalSong, toSongKey } from "../../lib/songIdentity";
import { useUser } from "../../src/context/UserContext";

export function useLibrary(profileId: string) {
  const [libraryState, setLibraryState] = useState<LibraryState>(() => loadLibraryState(profileId));
  const { isAuthenticated, favorites, addFavorite, removeFavorite } = useUser();
  const latestMutationAtRef = useRef(0);

  function markMutation() {
    latestMutationAtRef.current = Date.now();
  }

  function mergePlaylists(prevPlaylists: Playlist[], remotePlaylists: Playlist[]): Playlist[] {
    const mergedById = new Map<string, Playlist>();

    for (const remote of remotePlaylists) {
      mergedById.set(remote.id, remote);
    }

    for (const local of prevPlaylists) {
      const existing = mergedById.get(local.id);
      if (!existing) {
        mergedById.set(local.id, local);
        continue;
      }

      const localHasMoreSongs = local.songs.length > existing.songs.length;
      mergedById.set(local.id, localHasMoreSongs ? local : existing);
    }

    return Array.from(mergedById.values());
  }

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
    const fetchStartedAt = Date.now();
    (async () => {
      const playlists = await playlistApi.getPlaylists();
      if (isCancelled) return;
      setLibraryState((prev) => ({
        ...prev,
        playlists: fetchStartedAt < latestMutationAtRef.current
          ? mergePlaylists(prev.playlists, playlists)
          : playlists,
      }));
    })();

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated]);

  const favoritesList: StoredFavorite[] = useMemo(
    () =>
      favorites.map((favorite) => ({
        key: toSongKey(favorite),
        title: favorite.title,
        artist: favorite.artist,
        artworkUrl: favorite.coverUrl ?? undefined,
      })),
    [favorites],
  );
  const favoritesSet = useMemo(() => new Set(favoritesList.map((favorite) => favorite.key)), [favoritesList]);

  function toggleFavorite(_trackId: string, title?: string, artist?: string, artworkUrl?: string, _videoId?: string) {
    if (!title || !artist) return;
    const canonical = toCanonicalSong({ title, artist, artworkUrl, videoId: _videoId });
    const existing = favorites.find((favorite) => toSongKey(favorite) === canonical.key);

    if (existing) {
      void removeFavorite(existing.id);
      return;
    }

    void addFavorite({
      title: canonical.title,
      artist: canonical.artist,
      coverUrl: canonical.coverUrl,
    });
  }

  async function createPlaylist(name: string): Promise<Playlist | null> {
    if (!isAuthenticated) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const result = await playlistApi.createPlaylist(trimmed);
    if (result) {
      markMutation();
      setLibraryState((prev) => ({
        ...prev,
        playlists: [...prev.playlists.filter((playlist) => playlist.id !== result.id), result],
      }));
    }
    return result;
  }

  async function deletePlaylist(playlistId: string) {
    if (!isAuthenticated) return;
    await playlistApi.deletePlaylist(playlistId);
    markMutation();
    setLibraryState((prev) => ({ ...prev, playlists: prev.playlists.filter((playlist) => playlist.id !== playlistId) }));
  }

  async function addSongToPlaylist(playlistId: string, song: PlaylistSong): Promise<boolean> {
    if (!isAuthenticated) return false;
    const updatedRemotePlaylist = await playlistApi.addSongToPlaylist(playlistId, song);
    if (!updatedRemotePlaylist) return false;

    markMutation();
    setLibraryState((prev) => ({
      ...prev,
      playlists: prev.playlists.some((playlist) => playlist.id === playlistId)
        ? prev.playlists.map((playlist) => (playlist.id === playlistId ? updatedRemotePlaylist : playlist))
        : [...prev.playlists, updatedRemotePlaylist],
    }));
    return true;
  }

  async function addSongsToPlaylist(playlistId: string, songs: PlaylistSong[]): Promise<number> {
    if (!isAuthenticated || songs.length === 0) return 0;
    const payload = await playlistApi.addSongsToPlaylist(playlistId, songs);
    if (!payload) return 0;

    markMutation();
    setLibraryState((prev) => ({
      ...prev,
      playlists: prev.playlists.some((playlist) => playlist.id === playlistId)
        ? prev.playlists.map((playlist) => (playlist.id === playlistId ? payload.playlist : playlist))
        : [...prev.playlists, payload.playlist],
    }));
    return payload.added;
  }

  async function removeSongFromPlaylist(playlistId: string, title: string, artist: string) {
    if (isAuthenticated) {
      const updatedRemotePlaylist = await playlistApi.removeSongFromPlaylist(playlistId, title, artist);
      if (!updatedRemotePlaylist) return;
      markMutation();
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
        const targetKey = toSongKey({ title, artist });
        return { ...playlist, songs: playlist.songs.filter((s) => toSongKey(s) !== targetKey) };
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
