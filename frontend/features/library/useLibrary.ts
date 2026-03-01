import { useEffect, useMemo, useState } from "react";
import { syncLibraryState } from "./api";
import { loadLibraryState, persistLibraryState } from "./storage";
import type { LibraryState, Playlist, PlaylistSong } from "./types";
import * as playlistApi from "./api";

function createPlaylistId() {
  return `pl-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function useLibrary(profileId: string) {
  const [libraryState, setLibraryState] = useState<LibraryState>(() => loadLibraryState(profileId));
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if user is authenticated
  useEffect(() => {
    // Must match the token key used by UserContext — "ponotii_token"
    // "authToken" was the dead tokenStorage.ts key; that file has been removed.
    const token = localStorage.getItem("ponotii_token");
    setIsAuthenticated(!!token);
  }, []);

  useEffect(() => {
    setLibraryState(loadLibraryState(profileId));
  }, [profileId]);

  useEffect(() => {
    persistLibraryState(libraryState, profileId);
    if (isAuthenticated) {
      void syncLibraryState(libraryState);
    }
  }, [libraryState, profileId, isAuthenticated]);

  const favoritesSet = useMemo(() => new Set(libraryState.favorites), [libraryState.favorites]);

  function toggleFavorite(songId: string) {
    setLibraryState((prev) => {
      const exists = prev.favorites.includes(songId);
      return {
        ...prev,
        favorites: exists ? prev.favorites.filter((id) => id !== songId) : [...prev.favorites, songId],
      };
    });
  }

  async function createPlaylist(name: string): Promise<Playlist | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;

    if (isAuthenticated) {
      const result = await playlistApi.createPlaylist(trimmed);
      if (result) {
        setLibraryState((prev) => ({
          ...prev,
          playlists: [...prev.playlists, result],
        }));
        return result;
      }
    } else {
      const playlist: Playlist = {
        id: createPlaylistId(),
        name: trimmed,
        songs: [],
      };

      setLibraryState((prev) => ({
        ...prev,
        playlists: [...prev.playlists, playlist],
      }));

      return playlist;
    }

    return null;
  }

  async function deletePlaylist(playlistId: string) {
    if (isAuthenticated) {
      await playlistApi.deletePlaylist(playlistId);
    }

    setLibraryState((prev) => ({
      ...prev,
      playlists: prev.playlists.filter((playlist) => playlist.id !== playlistId),
    }));
  }

  async function addSongToPlaylist(
    playlistId: string,
    song: PlaylistSong
  ) {
    if (isAuthenticated) {
      try {
        await playlistApi.addSongToPlaylist(playlistId, song);
      } catch (error) {
        console.error("Error adding song to playlist:", error);
      }
    }

    setLibraryState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;

        const songExists = playlist.songs.some(
          (s) => s.title === song.title && s.artist === song.artist
        );

        if (songExists) return playlist;

        return {
          ...playlist,
          songs: [...playlist.songs, song],
        };
      }),
    }));
  }

  async function removeSongFromPlaylist(
    playlistId: string,
    title: string,
    artist: string
  ) {
    if (isAuthenticated) {
      try {
        await playlistApi.removeSongFromPlaylist(playlistId, title, artist);
      } catch (error) {
        console.error("Error removing song from playlist:", error);
      }
    }

    setLibraryState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        return {
          ...playlist,
          songs: playlist.songs.filter(
            (s) => !(s.title === title && s.artist === artist)
          ),
        };
      }),
    }));
  }

  return {
    playlists: libraryState.playlists,
    favoritesSet,
    toggleFavorite,
    createPlaylist,
    deletePlaylist,
    addSongToPlaylist,
    removeSongFromPlaylist,
  };
}
