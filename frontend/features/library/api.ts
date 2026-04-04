import type { LibraryState, Playlist } from "./types";
import { getApiBaseUrl } from "@/lib/apiConfig";

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  // Must match the key used by UserContext (ponotii_token), not the dead tokenStorage.ts key
  return window.localStorage.getItem("ponotii_token");
}

export async function syncLibraryState(state: LibraryState): Promise<boolean> {
  const token = getAuthToken();
  if (!token) return false;

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/library/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(state),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Playlist API functions
export async function getPlaylists(): Promise<Playlist[]> {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/playlists`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { playlists: Playlist[] };
    return data.playlists;
  } catch {
    return [];
  }
}

export async function createPlaylist(name: string): Promise<Playlist | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/playlists`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) return null;
    return (await response.json()) as Playlist;
  } catch {
    return null;
  }
}

export async function updatePlaylistName(
  playlistId: string,
  name: string
): Promise<Playlist | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/playlists/${playlistId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) return null;
    return (await response.json()) as Playlist;
  } catch {
    return null;
  }
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
  const token = getAuthToken();
  if (!token) return null;

  const payload = JSON.stringify(song);
  console.debug("[playlist:addSong] request", { playlistId, body: song, hasAuthToken: Boolean(token) });

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/playlists/${playlistId}/songs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: payload,
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[playlist:addSong] failed", { playlistId, status: response.status, errorText });
      return null;
    }
    console.debug("[playlist:addSong] success", { playlistId, status: response.status });
    return (await response.json()) as Playlist;
  } catch {
    return null;
  }
}

export async function removeSongFromPlaylist(
  playlistId: string,
  title: string,
  artist: string
): Promise<Playlist | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/playlists/${playlistId}/songs`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, artist }),
    });
    if (!response.ok) return null;
    return (await response.json()) as Playlist;
  } catch {
    return null;
  }
}

export async function deletePlaylist(playlistId: string): Promise<boolean> {
  const token = getAuthToken();
  if (!token) return false;

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/playlists/${playlistId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
