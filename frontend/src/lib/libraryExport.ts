import type { HistoryItem, FavoriteItem } from "../context/UserContext";
import type { Playlist } from "../../features/library/types";

export type LibraryExport = {
  version: "1.0";
  exportedAt: string;
  data: {
    favorites: FavoriteItem[];
    history: HistoryItem[];
    playlists: Playlist[];
  };
};

export function exportLibraryAsJSON(
  favorites: FavoriteItem[],
  history: HistoryItem[],
  playlists: Playlist[],
  username: string
): void {
  const exportData: LibraryExport = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    data: {
      favorites,
      history,
      playlists,
    },
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `trackly-library-${username}-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportLibraryAsCSV(
  favorites: FavoriteItem[],
  history: HistoryItem[],
  username: string
): void {
  let csv = "Title,Artist,Album,Type,Date\n";

  // Add favorites
  for (const fav of favorites) {
    csv += `"${fav.title.replace(/"/g, '""')}","${fav.artist.replace(/"/g, '""')}","${(fav.album || "").replace(/"/g, '""')}","Favorite","${fav.savedAt || ""}"\n`;
  }

  // Add history
  for (const hist of history) {
    csv += `"${(hist.title || "").replace(/"/g, '""')}","${(hist.artist || "").replace(/"/g, '""')}","${(hist.album || "").replace(/"/g, '""')}","History","${hist.createdAt || ""}"\n`;
  }

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `trackly-library-${username}-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importLibraryFromJSON(file: File): Promise<LibraryExport> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as LibraryExport;
        if (data.version !== "1.0") {
          reject(new Error("Unsupported export version"));
          return;
        }
        resolve(data);
      } catch (error) {
        reject(new Error("Invalid JSON file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
