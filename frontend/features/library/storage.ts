import { scopedKey } from "../../lib/ProfileContext";
import type { LibraryState, Playlist, StoredFavorite } from "./types";

const FAVORITES_KEY = "ponotai.library.favorites";
const PLAYLISTS_KEY = "ponotai.library.playlists";

const initialState: LibraryState = {
  favorites: [],
  playlists: [],
};


function isStoredFavorite(value: unknown): value is StoredFavorite {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredFavorite>;
  return (
    typeof candidate.key === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.artist === "string" &&
    (candidate.artworkUrl === undefined || typeof candidate.artworkUrl === "string") &&
    (candidate.videoId === undefined || typeof candidate.videoId === "string")
  );
}

function migrateLegacyFavorite(favorite: string): StoredFavorite {
  return {
    key: favorite,
    title: "",
    artist: "",
  };
}

function isPlaylist(value: unknown): value is Playlist {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Playlist>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.songs) &&
    candidate.songs.every(
      (song) =>
        typeof song === "object" &&
        song !== null &&
        typeof (song as any).title === "string" &&
        typeof (song as any).artist === "string"
    )
  );
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function loadLibraryState(profileId: string): LibraryState {
  if (typeof window === "undefined") return initialState;

  const rawFavorites = safeJsonParse<unknown>(window.localStorage.getItem(scopedKey(FAVORITES_KEY, profileId)), []);
  const rawPlaylists = safeJsonParse<unknown>(window.localStorage.getItem(scopedKey(PLAYLISTS_KEY, profileId)), []);

  const favorites = Array.isArray(rawFavorites)
    ? rawFavorites.flatMap((favorite): StoredFavorite[] => {
        if (typeof favorite === "string") {
          return [migrateLegacyFavorite(favorite)];
        }

        if (isStoredFavorite(favorite)) {
          return [favorite];
        }

        return [];
      })
    : [];

  const playlists = Array.isArray(rawPlaylists) ? rawPlaylists.filter(isPlaylist) : [];

  return { favorites, playlists };
}

export function persistLibraryState(state: LibraryState, profileId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(scopedKey(FAVORITES_KEY, profileId), JSON.stringify(state.favorites));
  window.localStorage.setItem(scopedKey(PLAYLISTS_KEY, profileId), JSON.stringify(state.playlists));
}
