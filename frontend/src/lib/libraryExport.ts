import type { HistoryItem, FavoriteItem } from "../context/UserContext";
import type { Playlist } from "../../features/library/types";

export const LIBRARY_EXPORT_VERSION = 1;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

type QueueExportItem = {
  title: string;
  artist: string;
  artworkUrl?: string;
  videoId?: string;
};

export type LibraryExportV1 = {
  version: number;
  exportedAt: string;
  app: "Trackly";
  user: { id?: string; username?: string; email?: string } | null;
  data: {
    favorites: FavoriteItem[];
    history: HistoryItem[];
    playlists: Playlist[];
    queue: QueueExportItem[];
    settings: Record<string, string | number | boolean | null>;
  };
};

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportLibraryAsJSON(payload: LibraryExportV1, filenameBase: string): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `trackly-backup-${filenameBase}-${date}.json`);
}

export function exportLibraryAsCSV(favorites: FavoriteItem[], history: HistoryItem[], username: string): void {
  let csv = "Title,Artist,Album,Type,Date\n";
  for (const fav of favorites) {
    csv += `"${fav.title.replace(/"/g, '""')}","${fav.artist.replace(/"/g, '""')}","${(fav.album || "").replace(/"/g, '""')}","Favorite","${fav.savedAt || ""}"\n`;
  }
  for (const hist of history) {
    csv += `"${(hist.title || "").replace(/"/g, '""')}","${(hist.artist || "").replace(/"/g, '""')}","${(hist.album || "").replace(/"/g, '""')}","History","${hist.createdAt || ""}"\n`;
  }
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `trackly-library-${username}-${new Date().toISOString().split("T")[0]}.csv`);
}

function isTrackLike(value: unknown): value is { title: string; artist: string } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return typeof c.title === 'string' && c.title.trim().length > 0 && typeof c.artist === 'string' && c.artist.trim().length > 0;
}

export async function importLibraryFromJSON(file: File): Promise<LibraryExportV1> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("Import file is too large (max 2MB).");
  const text = await file.text();

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file.");
  }

  if (!raw || typeof raw !== 'object') throw new Error('Invalid export shape.');
  const candidate = raw as Record<string, unknown>;
  if (candidate.version !== LIBRARY_EXPORT_VERSION) throw new Error('Unsupported export version.');
  if (!candidate.data || typeof candidate.data !== 'object') throw new Error('Missing data block.');

  const data = candidate.data as Record<string, unknown>;
  const favorites = Array.isArray(data.favorites) ? data.favorites.filter(isTrackLike) as FavoriteItem[] : [];
  const history = Array.isArray(data.history) ? data.history.filter((item) => isTrackLike(item) || (item && typeof item === 'object')) as HistoryItem[] : [];
  const playlists = Array.isArray(data.playlists)
    ? data.playlists.filter((playlist) => playlist && typeof playlist === 'object' && typeof (playlist as Playlist).name === 'string' && Array.isArray((playlist as Playlist).songs)) as Playlist[]
    : [];
  const queue = Array.isArray(data.queue) ? data.queue.filter(isTrackLike) as QueueExportItem[] : [];
  const settings = data.settings && typeof data.settings === 'object' ? data.settings as Record<string, string | number | boolean | null> : {};

  return {
    version: LIBRARY_EXPORT_VERSION,
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : new Date().toISOString(),
    app: 'Trackly',
    user: candidate.user && typeof candidate.user === 'object' ? candidate.user as LibraryExportV1['user'] : null,
    data: { favorites, history, playlists, queue, settings },
  };
}
