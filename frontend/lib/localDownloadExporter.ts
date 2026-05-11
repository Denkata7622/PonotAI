export type LocalExportSong = {
  id: string;
  title: string;
  artist: string;
  originalTitle?: string;
  originalArtist?: string;
  audioUrl?: string;
  sourceUrl?: string;
  source?: string;
  file?: File;
  blob?: Blob;
  coverUrl?: string;
  selectedCoverUrl?: string;
  albumArtUrl?: string;
  youtubeVideoId?: string;
  durationSec?: number;
  metadata?: Record<string, unknown>;
};

export type LocalExportResultItem = {
  id: string;
  title: string;
  artist: string;
  originalTitle?: string;
  originalArtist?: string;
  status: "exported" | "failed" | "skipped";
  audioPath?: string;
  coverPath?: string;
  sourceUrl?: string;
  coverUrl?: string;
  youtubeVideoId?: string;
  error?: string;
  warnings?: string[];
};

export type LocalExportResult = {
  ok: boolean;
  zipBlob: Blob;
  exportedCount: number;
  failedCount: number;
  skippedCount: number;
  items: LocalExportResultItem[];
};

export type LocalExportProgress = {
  phase: "preparing" | "fetching-audio" | "downloading-youtube" | "fetching-cover" | "adding-files" | "finalizing";
  currentSong?: string;
  completed: number;
  total: number;
  failed: number;
};

export class YoutubeDownloadError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "YoutubeDownloadError";
    this.code = code;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const YOUTUBE_BATCH_DELAY_MS = Math.max(0, Math.min(120000, Number(process.env.NEXT_PUBLIC_YOUTUBE_BATCH_DELAY_MS || 15000)));

export async function downloadFromYouTube(idOrQuery: { youtubeId?: string; query?: string }): Promise<Blob> {
  const response = await fetch("/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(idOrQuery),
  });
  if (!response.ok) {
    let detail = "";
    let code: string | undefined;
    try {
      const payload = await response.json() as { error?: string; detail?: string; code?: string };
      detail = payload.detail || payload.error || "";
      code = payload.code;
    } catch {
      detail = await response.text();
    }
    throw new YoutubeDownloadError(`YouTube download failed: ${(detail || `HTTP ${response.status}`).slice(0, 240)}`, code);
  }
  return response.blob();
}

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const AUDIO_CONTENT_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/webm", "audio/wav", "audio/ogg", "audio/flac"]);
const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function sanitizeFileName(input: string): string {
  return (input || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 120) || "untitled";
}

export function getUniqueFileName(fileName: string, used: Set<string>): string {
  const key = fileName.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return fileName;
  }

  const extIndex = fileName.lastIndexOf(".");
  const base = extIndex > 0 ? fileName.slice(0, extIndex) : fileName;
  const ext = extIndex > 0 ? fileName.slice(extIndex) : "";
  let counter = 2;

  while (true) {
    const candidate = `${base} (${counter})${ext}`;
    const candidateKey = candidate.toLowerCase();
    if (!used.has(candidateKey)) {
      used.add(candidateKey);
      return candidate;
    }
    counter += 1;
  }
}

export function guessExtensionFromContentType(contentType?: string | null): string | undefined {
  const normalized = (contentType || "").split(";")[0].trim().toLowerCase();
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return ".mp3";
  if (normalized === "audio/mp4" || normalized === "audio/x-m4a") return ".m4a";
  if (normalized === "audio/webm") return ".webm";
  if (normalized === "audio/wav") return ".wav";
  if (normalized === "audio/ogg") return ".ogg";
  if (normalized === "audio/flac") return ".flac";
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  return undefined;
}

export function guessExtensionFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const clean = url.split("?")[0].toLowerCase();
  const match = clean.match(/\.(mp3|m4a|webm|wav|ogg|flac|jpg|jpeg|png|webp|gif)$/);
  if (!match) return undefined;
  return match[1] === "jpeg" ? ".jpg" : `.${match[1]}`;
}

export async function fetchBlobWithTimeout(url: string, timeoutMs = 12000): Promise<{ blob: Blob; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Source returned ${response.status}.`);
    return { blob: await response.blob(), contentType: response.headers.get("content-type") || "" };
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (error.name === "AbortError" || message.includes("failed to fetch") || message.includes("network") || message.includes("cors") || error instanceof TypeError) {
        throw new Error("Browser blocked fetching this source or the source is not accessible locally.");
      }
      throw error;
    }
    throw new Error("Browser blocked fetching this source or the source is not accessible locally.");
  } finally {
    clearTimeout(timer);
  }
}

export function isPlaceholderCoverUrl(url?: string): boolean {
  if (!url) return true;
  const value = url.trim().toLowerCase();
  return value.length === 0 || value.includes("placeholder") || value.endsWith("/album-placeholder.svg") || value.endsWith("album-placeholder.svg");
}

export function isYouTubePageUrl(url?: string): boolean {
  if (!url) return false;
  const value = url.toLowerCase();
  return /youtube\.com\/watch|youtu\.be\//.test(value);
}

export function isLikelyAudioUrl(url?: string): boolean {
  if (!url) return false;
  const value = url.toLowerCase().split("?")[0];
  return [".mp3", ".m4a", ".webm", ".wav", ".ogg", ".flac"].some((ext) => value.endsWith(ext));
}

export function isAudioContentType(contentType: string): boolean {
  return AUDIO_CONTENT_TYPES.has(contentType.split(";")[0].trim().toLowerCase());
}

export function isImageContentType(contentType: string): boolean {
  return IMAGE_CONTENT_TYPES.has(contentType.split(";")[0].trim().toLowerCase());
}

const encoder = new TextEncoder();
function crc32(bytes: Uint8Array): number { let c = ~0; for (let i = 0; i < bytes.length; i += 1) { c ^= bytes[i]; for (let j = 0; j < 8; j += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); } return (~c) >>> 0; }
function u16(n: number): Uint8Array { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
function u32(n: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }

async function makeZip(files: Array<{ path: string; blob: Blob }>): Promise<Blob> {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);

    const localHeader = new Uint8Array([80,75,3,4,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),0,0]);
    local.push(localHeader, name, data);

    const centralHeader = new Uint8Array([80,75,1,2,20,0,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),0,0,0,0,0,0,0,0,0,0,...u32(offset)]);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const eocd = new Uint8Array([80,75,5,6,0,0,0,0,...u16(files.length),...u16(files.length),...u32(centralSize),...u32(offset),0,0]);
  const parts = [...local, ...central, eocd].map((chunk) => chunk as unknown as BlobPart);
  return new Blob(parts, { type: "application/zip" });
}

function formatSongLine(song: LocalExportSong): string {
  const title = (song.title || song.originalTitle || "Unknown Title").trim();
  const artist = (song.artist || song.originalArtist || "").trim();
  return artist ? `${artist} - ${title}` : title;
}

export async function createLocalExportZip(songs: LocalExportSong[], onProgress?: (progress: LocalExportProgress) => void): Promise<LocalExportResult> {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
  const root = `Turrex Export ${stamp}`;
  const files: Array<{ path: string; blob: Blob }> = [];
  const usedTrackNames = new Set<string>();
  const usedCoverNames = new Set<string>();
  const items: LocalExportResultItem[] = [];
  const searchList: string[] = [];
  const playlistLines: string[] = ["#EXTM3U"];
  let exportedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let youtubeAttemptCount = 0;
  let consecutiveYouTubeBlocks = 0;
  let youtubeCircuitOpen = false;

  onProgress?.({ phase: "preparing", completed: 0, total: songs.length, failed: 0 });

  for (let index = 0; index < songs.length; index += 1) {
    const song = songs[index];
    const line = formatSongLine(song);
    const warnings: string[] = [];
    const coverUrl = song.selectedCoverUrl || song.coverUrl || song.albumArtUrl;
    const sourceUrl = song.audioUrl || song.sourceUrl || song.source;

    const item: LocalExportResultItem = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      originalTitle: song.originalTitle,
      originalArtist: song.originalArtist,
      youtubeVideoId: song.youtubeVideoId,
      sourceUrl,
      coverUrl,
      status: "skipped",
    };

    let audioBlob: Blob | undefined;
    let audioExt = ".mp3";

    try {
      if (song.file instanceof File) {
        audioBlob = song.file;
        audioExt = guessExtensionFromContentType(song.file.type) || guessExtensionFromUrl(song.file.name) || ".mp3";
      } else if (song.blob instanceof Blob) {
        audioBlob = song.blob;
        audioExt = guessExtensionFromContentType(song.blob.type) || ".mp3";
      } else if (sourceUrl && isLikelyAudioUrl(sourceUrl) && !isYouTubePageUrl(sourceUrl)) {
        onProgress?.({ phase: "fetching-audio", currentSong: line, completed: index, total: songs.length, failed: failedCount + skippedCount });
        const fetched = await fetchBlobWithTimeout(sourceUrl);
        const contentType = fetched.contentType.split(";")[0].trim().toLowerCase();
        const validAudio = isAudioContentType(contentType) || (!contentType && isLikelyAudioUrl(sourceUrl));
        if (validAudio) {
          audioBlob = fetched.blob;
          audioExt = guessExtensionFromContentType(contentType) || guessExtensionFromUrl(sourceUrl) || ".mp3";
        } else {
          item.status = "failed";
          item.error = "Source URL did not provide a valid audio file.";
        }
      } else if (song.youtubeVideoId || line) {
        if (youtubeCircuitOpen) {
          item.status = "skipped";
          item.error = "Stopped YouTube downloads after repeated blocking/rate-limit errors. Try again later, lower the batch size, or run locally.";
        } else {
          if (youtubeAttemptCount > 0 && YOUTUBE_BATCH_DELAY_MS > 0) await delay(YOUTUBE_BATCH_DELAY_MS);
          youtubeAttemptCount += 1;
          onProgress?.({ phase: "downloading-youtube", currentSong: line, completed: index, total: songs.length, failed: failedCount + skippedCount });
          const youtubeId = song.youtubeVideoId && YOUTUBE_VIDEO_ID_REGEX.test(song.youtubeVideoId) ? song.youtubeVideoId : undefined;
          try {
            const ytBlob = await downloadFromYouTube({
              youtubeId,
              query: youtubeId ? undefined : line,
            });
            consecutiveYouTubeBlocks = 0;
            audioBlob = ytBlob;
            audioExt = ".mp3";
          } catch (error) {
            const message = error instanceof Error ? error.message : "YouTube download failed.";
            const code = error instanceof YoutubeDownloadError ? error.code : undefined;
            if (code === "youtube-blocked") {
              consecutiveYouTubeBlocks += 1;
              if (consecutiveYouTubeBlocks >= 3) youtubeCircuitOpen = true;
            } else {
              consecutiveYouTubeBlocks = 0;
            }
            throw new YoutubeDownloadError(message, code);
          }
        }
      }
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : "Browser blocked fetching this source or the source is not accessible locally.";
    }

    if (audioBlob) {
      const trackName = getUniqueFileName(`${sanitizeFileName(line)}${audioExt}`, usedTrackNames);
      item.audioPath = `tracks/${trackName}`;
      item.status = "exported";
      exportedCount += 1;
      files.push({ path: `${root}/tracks/${trackName}`, blob: audioBlob });
      playlistLines.push(`#EXTINF:${song.durationSec ?? -1},${line}`);
      playlistLines.push(`../tracks/${trackName}`);
    } else if (item.status === "failed") {
      failedCount += 1;
      searchList.push(line);
    } else {
      item.status = "skipped";
      item.error ||= "No audio source available for local export.";
      skippedCount += 1;
      searchList.push(line);
    }

    if (!isPlaceholderCoverUrl(coverUrl)) {
      try {
        onProgress?.({ phase: "fetching-cover", currentSong: line, completed: index, total: songs.length, failed: failedCount + skippedCount });
        const fetched = await fetchBlobWithTimeout(coverUrl as string);
        const contentType = fetched.contentType.split(";")[0].trim().toLowerCase();
        if (isImageContentType(contentType)) {
          const coverExt = guessExtensionFromContentType(contentType) || guessExtensionFromUrl(coverUrl) || ".jpg";
          const coverName = getUniqueFileName(`${sanitizeFileName(line)}${coverExt}`, usedCoverNames);
          item.coverPath = `covers/${coverName}`;
          files.push({ path: `${root}/covers/${coverName}`, blob: fetched.blob });
        } else {
          warnings.push("Cover could not be fetched.");
        }
      } catch {
        warnings.push("Cover could not be fetched.");
      }
    }

    if (warnings.length > 0) item.warnings = warnings;
    items.push(item);
    onProgress?.({ phase: "adding-files", currentSong: line, completed: index + 1, total: songs.length, failed: failedCount + skippedCount });
  }

  const metadataBase = `${root}/metadata`;
  const manifest = {
    app: "Turrex",
    exportDateIso: new Date().toISOString(),
    totalSelected: songs.length,
    exportedCount,
    failedCount,
    skippedCount,
    items,
  };

  files.push({ path: `${metadataBase}/manifest.json`, blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) });
  if (searchList.length > 0) {
    files.push({ path: `${metadataBase}/search-list.txt`, blob: new Blob([Array.from(new Set(searchList)).join("\n")], { type: "text/plain" }) });
  }
  if (items.some((item) => item.status !== "exported")) {
    files.push({ path: `${metadataBase}/failed-items.json`, blob: new Blob([JSON.stringify(items.filter((item) => item.status !== "exported"), null, 2)], { type: "application/json" }) });
  }
  if (exportedCount > 0) {
    files.push({ path: `${metadataBase}/playlist.m3u`, blob: new Blob([`${playlistLines.join("\n")}\n`], { type: "audio/x-mpegurl" }) });
  }

  onProgress?.({ phase: "finalizing", completed: songs.length, total: songs.length, failed: failedCount + skippedCount });
  return { ok: true, zipBlob: await makeZip(files), exportedCount, failedCount, skippedCount, items };
}

export function saveBlobAsDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
