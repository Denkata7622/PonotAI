// frontend/lib/importParser.ts
import { runCleaningPipeline, type Song } from "@/lib/songCleaning";
import type { SongMatch } from "@/features/recognition/api";

// -------------------------------------------------------------
// Copy all parsing helpers from page.tsx (they were inside the component)
// -------------------------------------------------------------

class SongImportError extends Error {
  code: "invalid-json" | "invalid-schema" | "empty-import";
  constructor(message: string, code: SongImportError["code"]) {
    super(message);
    this.name = "SongImportError";
    this.code = code;
  }
}

function getImportedSongArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["songs", "results", "matches"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
    if (record.data && typeof record.data === "object") {
      const data = record.data as Record<string, unknown>;
      for (const key of ["songs", "results", "matches"]) {
        if (Array.isArray(data[key])) return data[key] as unknown[];
      }
    }
  }
  throw new SongImportError("Unsupported JSON shape. Upload an array of songs or an object with a songs, results, or matches array.", "invalid-schema");
}

function parseSongQuery(value: string): { artist: string; title: string } {
  const query = value.trim();
  if (!query) return { artist: "", title: "" };
  const [left, ...rest] = query.split(" - ");
  if (rest.length === 0) return { artist: "", title: query };
  return { artist: left.trim(), title: rest.join(" - ").trim() };
}

function toSongMatch(input: { title: string; artist?: string; album?: string; coverUrl?: string }): SongMatch {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    songName: input.title.trim(),
    artist: input.artist?.trim() || "",
    album: input.album?.trim() || "",
    genre: "",
    releaseYear: null,
    platformLinks: {},
    albumArtUrl: input.coverUrl || "",
    confidence: 1,
    durationSec: 0,
  };
}

function normalizeCoverUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/") ? trimmed : undefined;
}

function getCoverCandidateUrl(candidate: unknown): string | undefined {
  if (typeof candidate === "string") return normalizeCoverUrl(candidate);
  if (!candidate || typeof candidate !== "object") return undefined;
  const record = candidate as Record<string, unknown>;
  return normalizeCoverUrl(record.url) ?? normalizeCoverUrl(record.coverUrl) ?? normalizeCoverUrl(record.imageUrl);
}

function getImportedCoverUrl(item: Record<string, unknown>): string | undefined {
  const direct = normalizeCoverUrl(item.selectedCoverUrl) ?? normalizeCoverUrl(item.coverUrl) ?? normalizeCoverUrl(item.albumArtUrl);
  if (direct) return direct;
  if (!Array.isArray(item.coverCandidates)) return undefined;
  for (const candidate of item.coverCandidates) {
    const url = getCoverCandidateUrl(candidate);
    if (url) return url;
  }
  return undefined;
}

function firstString(item: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (Array.isArray(value)) {
      const normalized = value.map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean).join(", ");
      if (normalized) return normalized;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function parseImportedTidalSongs(text: string): { songs: SongMatch[]; invalidItems: string[]; skippedCount: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new SongImportError("Invalid JSON file. Upload a valid songs JSON export.", "invalid-json");
  }
  const root = getImportedSongArray(parsed);
  const songs: SongMatch[] = [];
  const invalidItems: string[] = [];
  let skippedCount = 0;
  root.forEach((entry, index) => {
    if (typeof entry === "string") {
      const song = parseSongQuery(entry);
      if (song.title) songs.push(toSongMatch({ title: song.title, artist: song.artist }));
      else invalidItems.push(`Item ${index + 1} is an empty string.`);
      return;
    }
    if (!entry || typeof entry !== "object") {
      invalidItems.push(`Item ${index + 1} is not a song object.`);
      return;
    }
    const item = entry as Record<string, unknown>;
    if (item.selected === false) {
      skippedCount += 1;
      return;
    }
    const title = firstString(item, ["title", "songName", "name", "track", "trackName"]);
    const artist = firstString(item, ["artist", "artistName", "artists", "creator"]);
    if (!title && !artist) {
      invalidItems.push(`Item ${index + 1} is missing title and artist.`);
      return;
    }
    songs.push(toSongMatch({
      title: title || "Unknown Title",
      artist: artist || "",
      album: firstString(item, ["album", "albumName"]),
      coverUrl: getImportedCoverUrl(item),
    }));
  });
  if (songs.length === 0 && invalidItems.length === 0) {
    throw new SongImportError("The JSON file did not contain any selected songs.", "empty-import");
  }
  return { songs, invalidItems, skippedCount };
}

// -------------------------------------------------------------
// Exported function used by the worker
// -------------------------------------------------------------

export function parseAndCleanSongs(text: string): { songs: Song[]; invalidItems: string[]; skippedCount: number } {
  const detailed = parseImportedTidalSongs(text);
  const mappedSongs: Song[] = detailed.songs.map((songMatch) => ({
    id: songMatch.id || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: songMatch.songName,
    artist: songMatch.artist,
    album: songMatch.album,
    coverUrl: songMatch.albumArtUrl,
    genre: songMatch.genre || "",
    year: songMatch.releaseYear ? String(songMatch.releaseYear) : undefined,
    sourceImageIds: [],
    rawText: "",
    confidence: songMatch.confidence || 1,
    selected: true,
    needsReview: false,
    manuallyConfirmed: false,
    duplicateMerged: false,
    manuallyEdited: false,
  }));
  const cleaned = runCleaningPipeline(mappedSongs);
  return { songs: cleaned, invalidItems: detailed.invalidItems, skippedCount: detailed.skippedCount };
}