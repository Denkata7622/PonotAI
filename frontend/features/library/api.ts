import type { LibraryState, Playlist } from "./types";
import { apiFetch } from "@/src/lib/apiFetch";

type PlaylistEnvelope = Playlist | { playlist: Playlist };

type ApiErrorPayload = { message?: string };

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function parseErrorMessage(response: Response): Promise<string | undefined> {
  const payload = await parseJsonSafe<ApiErrorPayload>(response);
  return payload?.message;
}

async function fetchPlaylist(path: string, options?: RequestInit): Promise<Playlist | null> {
  try {
    const response = await apiFetch(path, options);
    if (!response.ok) return null;
    const data = await parseJsonSafe<PlaylistEnvelope>(response);
    if (!data) return null;
    return "playlist" in data ? data.playlist : data;
  } catch {
    return null;
  }
}

export async function syncLibraryState(state: LibraryState): Promise<boolean> {
  try {
    const response = await apiFetch("/api/library/sync", {
      method: "POST",
      body: JSON.stringify(state),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Playlist API functions
export async function getPlaylists(): Promise<Playlist[]> {
  try {
    const response = await apiFetch("/api/playlists");
    if (!response.ok) return [];
    const data = await parseJsonSafe<{ playlists?: Playlist[] }>(response);
    return Array.isArray(data?.playlists) ? data.playlists : [];
  } catch {
    return [];
  }
}

export async function createPlaylist(name: string): Promise<Playlist | null> {
  return fetchPlaylist("/api/playlists", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updatePlaylistName(
  playlistId: string,
  name: string
): Promise<Playlist | null> {
  return fetchPlaylist(`/api/playlists/${playlistId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function addSongToPlaylist(
  playlistId: string,
  song: {
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    videoId?: string;
  }
): Promise<Playlist | null> {
  console.debug("[playlist:addSong] request", { playlistId, body: song });

  try {
    const response = await apiFetch(`/api/playlists/${playlistId}/songs`, {
      method: "POST",
      body: JSON.stringify(song),
    });
    if (!response.ok) {
      const errorMessage = await parseErrorMessage(response);
      console.error("[playlist:addSong] failed", { playlistId, status: response.status, errorMessage });
      return null;
    }
    console.debug("[playlist:addSong] success", { playlistId, status: response.status });
    const data = await parseJsonSafe<PlaylistEnvelope>(response);
    if (!data) return null;
    return "playlist" in data ? data.playlist : data;
  } catch {
    return null;
  }
}

export async function addSongsToPlaylist(
  playlistId: string,
  tracks: Array<{
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    videoId?: string;
  }>
): Promise<{ playlist: Playlist; added: number } | null> {
  if (tracks.length === 0) return null;

  try {
    const response = await apiFetch(`/api/playlists/${playlistId}/songs`, {
      method: "POST",
      body: JSON.stringify({ tracks }),
    });
    if (!response.ok) return null;
    return await parseJsonSafe<{ playlist: Playlist; added: number }>(response);
  } catch {
    return null;
  }
}

export async function removeSongFromPlaylist(
  playlistId: string,
  title: string,
  artist: string
): Promise<Playlist | null> {
  return fetchPlaylist(`/api/playlists/${playlistId}/songs`, {
    method: "DELETE",
    body: JSON.stringify({ title, artist }),
  });
}

export async function deletePlaylist(playlistId: string): Promise<boolean> {
  try {
    const response = await apiFetch(`/api/playlists/${playlistId}`, {
      method: "DELETE",
    });
    return response.ok;
  } catch {
    return false;
  }
}
