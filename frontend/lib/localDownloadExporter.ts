import { createSafeTrackFileName, formatTrackFileBase, getUniqueFileName as getUniqueSafeFileName, resolveTrackMetadata, sanitizeFileName as sanitizeSafeFileName, type ResolvedTrackMetadata } from "./trackMetadata";
import { normalizeAudioPolishOptions, type AudioPolishMode, type DownloadPostProcessingOptions, type ExportAudioProfile } from "./audioPolishTypes";

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
  platformLinks?: Record<string, unknown>;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  durationSec?: number;
  metadata?: Record<string, unknown>;
};

export type LocalExportPostProcessingOptions = DownloadPostProcessingOptions;

export type LocalAudioAnalysis = {
  durationSec?: number;
  formatName?: string;
  codecName?: string;
  bitRate?: number;
  sampleRate?: number;
  channels?: number;
  fileSizeBytes?: number;
  hasAudio?: boolean;
  loudness?: {
    integratedLufs?: number;
    truePeakDb?: number;
    loudnessRangeLra?: number;
    thresholdDb?: number;
  };
  peaks?: {
    maxVolumeDb?: number;
    meanVolumeDb?: number;
  };
  silence?: {
    leadingSilenceSec?: number;
    trailingSilenceSec?: number;
    detected?: boolean;
  };
  warnings?: string[];
};

export type LocalAudioComparison = {
  verdict?: "improved" | "neutral" | "worse" | "unknown";
  score?: {
    overall?: number;
    volumeConsistency?: number;
    clippingSafety?: number;
    preservation?: number;
  };
  reasons?: string[];
  warnings?: string[];
};

export type LocalQualityPreservation = {
  profile?: ExportAudioProfile;
  sourceCodec?: string;
  sourceContainer?: string;
  outputCodec?: string;
  outputContainer?: string;
  outputExtension?: ".mp3" | ".m4a" | ".audio";
  audioStreamCopied?: boolean;
  reencoded?: boolean;
  transcodeReason?: string;
  transcodeCount?: number;
  lossyToLossyTranscode?: boolean;
  generationLossRisk?: "none" | "low" | "medium" | "high";
  codecCompatibility?: "excellent" | "good" | "warning" | "unknown";
  samsungMusicFriendly?: boolean;
  bluetoothFriendly?: boolean;
  phoneProfileScore?: number;
  verdict?: "preserved-best" | "improved-volume-consistency" | "compatible-transcode" | "neutral" | "worse" | "unknown";
  warnings?: string[];
};

export type LocalExportPostProcessingSummary = {
  status?: "skipped" | "metadata-only" | "normalized" | "failed-fallback-original";
  filename?: string;
  contentType?: "audio/mpeg" | "audio/mp4" | "application/octet-stream";
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
    albumArtist?: string;
    date?: string;
    year?: string;
    genre?: string;
    source?: string;
    confidence?: "high" | "medium" | "low";
    cleanupApplied?: string[];
    warnings?: string[];
  };
  cover?: {
    attempted?: boolean;
    embedded?: boolean;
    source?: string;
    mimeType?: string;
    warningCount?: number;
    warnings?: string[];
  };
  audio?: {
    mode?: "copy" | "normalized" | "processed" | "unknown";
    reencoded?: boolean;
    loudness?: {
      integrated?: number;
      truePeak?: number;
      lra?: number;
      measuredI?: number;
      measuredTP?: number;
      measuredLRA?: number;
      measuredThresh?: number;
      offset?: number;
      passMode?: "single" | "two-pass";
    };
    probe?: {
      duration?: number;
      formatName?: string;
      codecName?: string;
      bitRate?: number;
      sampleRate?: number;
      channels?: number;
      hasAudio?: boolean;
      hasCover?: boolean;
      tags?: Record<string, string>;
    };
    warnings?: string[];
  };
  audioPolish?: {
    profile?: ExportAudioProfile;
    mode?: AudioPolishMode;
    reencoded?: boolean;
    qualityPreservation?: LocalQualityPreservation;
    analysis?: {
      before?: LocalAudioAnalysis;
      after?: LocalAudioAnalysis;
      comparison?: LocalAudioComparison;
    };
    warnings?: string[];
  };
  warnings?: string[];
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
  metadata?: Record<string, unknown>;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  sourceAttempted?: "file" | "blob" | "direct-audio-url" | "youtube-id" | "youtube-url" | "youtube-query" | "none";
  youtubeCircuitOpen?: boolean;
  requestId?: string;
  error?: string;
  code?: string;
  detail?: string;
  fix?: string;
  warnings?: string[];
  cleanedTitle?: string;
  cleanedArtist?: string;
  metadataConfidence?: "high" | "medium" | "low";
  cleanupApplied?: string[];
  postProcessing?: LocalExportPostProcessingSummary;
  audioPolish?: LocalExportPostProcessingSummary["audioPolish"];
  qualityPreservation?: LocalQualityPreservation;
};

export type LocalExportResult = {
  ok: boolean;
  zipBlob: Blob;
  exportedCount: number;
  failedCount: number;
  skippedCount: number;
  taggedCount: number;
  coversEmbeddedCount: number;
  normalizedCount: number;
  audioImprovedCount: number;
  audioNeutralCount: number;
  audioWorseCount: number;
  audioPolishWarningCount: number;
  preservedWithoutReencodeCount: number;
  compatibilityReencodedCount: number;
  normalizationReencodedCount: number;
  m4aCount: number;
  mp3Count: number;
  phoneProfileWarningCount: number;
  metadataWarningCount: number;
  postProcessingFailedCount: number;
  items: LocalExportResultItem[];
};

export type LocalExportProgress = {
  phase: "preparing" | "fetching-audio" | "downloading-youtube" | "cleaning-metadata" | "fetching-cover" | "embedding-cover" | "analyzing-audio" | "normalizing-volume" | "verifying-file" | "comparing-audio" | "adding-files" | "finalizing" | "done";
  currentSong?: string;
  currentSourceType?: LocalExportResultItem["sourceAttempted"];
  completed: number;
  total: number;
  failed: number;
  exported?: number;
  skipped?: number;
};

export type LocalExportOptions = {
  fetcher?: typeof fetch;
  appVersion?: string;
  diagnosticsSnapshot?: unknown;
  postProcessing?: Partial<LocalExportPostProcessingOptions>;
};

export class YoutubeDownloadError extends Error {
  code?: string;
  fix?: string;
  detail?: string;
  globalFailure?: boolean;
  requestId?: string;
  constructor(message: string, code?: string, fix?: string, globalFailure?: boolean, requestId?: string, detail?: string) {
    super(message);
    this.name = "YoutubeDownloadError";
    this.code = code;
    this.fix = fix;
    this.detail = detail;
    this.globalFailure = globalFailure;
    this.requestId = requestId;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const YOUTUBE_BATCH_DELAY_MS = Math.max(0, Math.min(120000, Number(process.env.NEXT_PUBLIC_YOUTUBE_BATCH_DELAY_MS || 0)));
let localExportFetch: typeof fetch = (...args) => fetch(...args);

export function setLocalDownloadExporterFetchForTests(fetcher?: typeof fetch): void {
  localExportFetch = fetcher ?? ((...args) => fetch(...args));
}

function defaultPostProcessingOptions(input?: Partial<LocalExportPostProcessingOptions>): LocalExportPostProcessingOptions {
  return normalizeAudioPolishOptions(input);
}

function decodePostProcessingHeader(value: string | null): LocalExportPostProcessingSummary | undefined {
  if (!value) return undefined;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = typeof Buffer !== "undefined"
      ? Buffer.from(padded, "base64").toString("utf8")
      : decodeURIComponent(Array.prototype.map.call(atob(padded), (char: string) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as LocalExportPostProcessingSummary : undefined;
  } catch {
    return undefined;
  }
}

function resolvedFromSummary(summary: LocalExportPostProcessingSummary | undefined, fallback: ResolvedTrackMetadata): ResolvedTrackMetadata {
  if (!summary?.metadata) return fallback;
  return {
    ...fallback,
    title: summary.metadata.title || fallback.title,
    artist: summary.metadata.artist || fallback.artist,
    album: summary.metadata.album || fallback.album,
    albumArtist: summary.metadata.albumArtist || fallback.albumArtist,
    date: summary.metadata.date || fallback.date,
    year: summary.metadata.year || fallback.year,
    genre: summary.metadata.genre || fallback.genre,
    source: (summary.metadata.source as ResolvedTrackMetadata["source"]) || fallback.source,
    confidence: summary.metadata.confidence || fallback.confidence,
    cleanupApplied: summary.metadata.cleanupApplied || fallback.cleanupApplied,
    warnings: summary.metadata.warnings || fallback.warnings,
  };
}

export async function downloadFromYouTube(idOrQuery: { youtubeId?: string; youtubeUrl?: string; query?: string; title?: string; artist?: string; platformLinks?: Record<string, unknown>; metadata?: Record<string, unknown>; postProcessing?: LocalExportPostProcessingOptions }, fetcher: typeof fetch = localExportFetch): Promise<{ blob: Blob; requestId?: string; filename?: string; postProcessing?: LocalExportPostProcessingSummary }> {
  const response = await fetcher("/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(idOrQuery),
  });
  if (!response.ok) {
    let detail = "";
    let code: string | undefined;
    let fix: string | undefined;
    let globalFailure: boolean | undefined;
    let requestId: string | undefined = response.headers.get("X-PonotAI-Request-ID") ?? undefined;
    try {
      const payload = await response.json() as { error?: string; detail?: string; code?: string; fix?: string; globalFailure?: boolean; requestId?: string };
      detail = payload.detail || payload.error || "";
      code = payload.code;
      fix = payload.fix;
      globalFailure = payload.globalFailure;
      requestId = payload.requestId || requestId;
    } catch {
      detail = await response.text();
    }
    const useful = (detail || fix || `HTTP ${response.status}`).replace(/\s+/g, " ").trim();
    throw new YoutubeDownloadError(`YouTube download failed: ${useful.slice(0, 320)}`, code, fix, globalFailure, requestId, detail);
  }
  const postProcessing = decodePostProcessingHeader(response.headers.get("X-PonotAI-Postprocessing"));
  const filenameHeader = response.headers.get("X-PonotAI-Filename");
  return {
    blob: await response.blob(),
    requestId: response.headers.get("X-PonotAI-Request-ID") ?? undefined,
    filename: filenameHeader ? decodeURIComponent(filenameHeader) : postProcessing?.filename,
    postProcessing,
  };
}

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const AUDIO_CONTENT_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/aac", "audio/mp4", "audio/x-m4a", "audio/webm", "audio/wav", "audio/wave", "audio/x-wav", "audio/vnd.wave", "audio/ogg", "audio/opus", "audio/flac", "audio/x-flac"]);
const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function sanitizeFileName(input: string): string {
  return sanitizeSafeFileName(input);
}

export function getUniqueFileName(fileName: string, used: Set<string>): string {
  return getUniqueSafeFileName(fileName, used);
}

export function guessExtensionFromContentType(contentType?: string | null): string | undefined {
  const normalized = (contentType || "").split(";")[0].trim().toLowerCase();
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return ".mp3";
  if (normalized === "audio/aac") return ".aac";
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
  const match = clean.match(/\.(mp3|m4a|aac|webm|opus|wav|ogg|flac|jpg|jpeg|png|webp|gif)$/);
  if (!match) return undefined;
  return match[1] === "jpeg" ? ".jpg" : `.${match[1]}`;
}

export async function fetchBlobWithTimeout(url: string, timeoutMs = 12000, fetcher: typeof fetch = localExportFetch): Promise<{ blob: Blob; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal });
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
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
  } catch {
    const value = url.toLowerCase();
    return /(^|[/:.])youtube\.com\/watch|(^|[/:.])youtu\.be\//.test(value);
  }
}

export function isLikelyAudioUrl(url?: string): boolean {
  if (!url) return false;
  const value = url.toLowerCase().split("?")[0];
  return [".mp3", ".m4a", ".aac", ".webm", ".opus", ".wav", ".ogg", ".flac"].some((ext) => value.endsWith(ext));
}

export function isAudioContentType(contentType: string): boolean {
  return AUDIO_CONTENT_TYPES.has(contentType.split(";")[0].trim().toLowerCase());
}

export function isImageContentType(contentType: string): boolean {
  return IMAGE_CONTENT_TYPES.has(contentType.split(";")[0].trim().toLowerCase());
}


function isGlobalYoutubeFailure(code?: string): boolean {
  return code === "youtube-blocked"
    || code === "missing-binary"
    || code === "ffmpeg-missing"
    || code === "binary-permission";
}

function isUsableYoutubeVideoId(value?: string): value is string {
  return Boolean(value && YOUTUBE_VIDEO_ID_REGEX.test(value) && !value.startsWith("import-") && !value.startsWith("local-") && value !== "index-only" && !/^\d+$/.test(value));
}

function normalizeYoutubePageUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const isYoutube = host === "youtube.com" || host.endsWith(".youtube.com");
    if (isYoutube && parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v")?.trim() || "";
      return isUsableYoutubeVideoId(id) ? `https://www.youtube.com/watch?v=${id}` : undefined;
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0] || "";
      return isUsableYoutubeVideoId(id) ? `https://www.youtube.com/watch?v=${id}` : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function messageForGlobalYoutubeFailure(code: string | undefined, youtubeBlockedMessage: string): string {
  if (code === "missing-binary") return "yt-dlp is missing on the server. On Railway set YTDLP_PATH=/usr/local/bin/yt-dlp and make sure the frontend Dockerfile is used, then redeploy.";
  if (code === "ffmpeg-missing") return "ffmpeg/ffprobe is missing on the server. On Railway make sure the frontend Dockerfile is used and FFMPEG_LOCATION=/usr/bin, then redeploy.";
  if (code === "binary-permission") return "yt-dlp exists but is not executable. Fix the runtime image permissions or set YTDLP_PATH to an executable binary.";
  if (code === "youtube-blocked") return youtubeBlockedMessage;
  return youtubeBlockedMessage;
}

const encoder = new TextEncoder();
const ZIP_UINT16_MAX = 0xffff;
const ZIP_UINT32_MAX = 0xffffffff;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_VERSION_NEEDED = 20;
const ZIP_VERSION_MADE_BY = 20;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;

function crc32(bytes: Uint8Array): number { let c = ~0; for (let i = 0; i < bytes.length; i += 1) { c ^= bytes[i]; for (let j = 0; j < 8; j += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); } return (~c) >>> 0; }

function normalizeZipPath(input: string): string {
  if (/^[a-zA-Z]:/.test(input) || input.startsWith("/") || input.startsWith("\\")) {
    throw new Error("ZIP entry path must be relative.");
  }
  const path = input.replace(/\\/g, "/").split("/").filter(Boolean).join("/");
  if (!path || path.split("/").some((part) => part === "..") || path.includes("\u0000")) {
    throw new Error("ZIP entry path contains an unsafe segment.");
  }
  return path;
}

function assertZip32Value(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP_UINT32_MAX) {
    throw new Error(`ZIP entry ${label} exceeds ZIP32 limits.`);
  }
}

function assertZip16Value(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP_UINT16_MAX) {
    throw new Error(`ZIP entry ${label} exceeds ZIP16 limits.`);
  }
}

function dosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function createLocalFileHeader(nameLength: number, dataLength: number, crc: number, date: number, time: number): Uint8Array {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, ZIP_LOCAL_FILE_HEADER_SIGNATURE, true);
  view.setUint16(4, ZIP_VERSION_NEEDED, true);
  view.setUint16(6, ZIP_UTF8_FLAG, true);
  view.setUint16(8, ZIP_STORE_METHOD, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, dataLength, true);
  view.setUint32(22, dataLength, true);
  view.setUint16(26, nameLength, true);
  view.setUint16(28, 0, true);
  return header;
}

function createCentralDirectoryHeader(nameLength: number, dataLength: number, crc: number, localHeaderOffset: number, date: number, time: number): Uint8Array {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, ZIP_CENTRAL_DIRECTORY_SIGNATURE, true);
  view.setUint16(4, ZIP_VERSION_MADE_BY, true);
  view.setUint16(6, ZIP_VERSION_NEEDED, true);
  view.setUint16(8, ZIP_UTF8_FLAG, true);
  view.setUint16(10, ZIP_STORE_METHOD, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, dataLength, true);
  view.setUint32(24, dataLength, true);
  view.setUint16(28, nameLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localHeaderOffset, true);
  return header;
}

function createEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, ZIP_EOCD_SIGNATURE, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return eocd;
}

async function makeZip(files: Array<{ path: string; blob: Blob }>): Promise<Blob> {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const { date, time } = dosDateTime(new Date());

  assertZip16Value(files.length, "count");

  for (const file of files) {
    const name = encoder.encode(normalizeZipPath(file.path));
    const data = new Uint8Array(await file.blob.arrayBuffer());
    assertZip16Value(name.length, "name length");
    assertZip32Value(data.length, "size");
    assertZip32Value(offset, "offset");
    const crc = crc32(data);

    const localHeader = createLocalFileHeader(name.length, data.length, crc, date, time);
    local.push(localHeader, name, data);

    const centralHeader = createCentralDirectoryHeader(name.length, data.length, crc, offset, date, time);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
    assertZip32Value(offset, "offset");
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  assertZip32Value(centralSize, "central directory size");
  const eocd = createEndOfCentralDirectory(files.length, centralSize, offset);
  const parts = [...local, ...central, eocd].map((chunk) => chunk as unknown as BlobPart);
  return new Blob(parts, { type: "application/zip" });
}

function formatSongLine(song: LocalExportSong): string {
  const title = (song.title || song.originalTitle || "Unknown Title").trim();
  const artist = (song.artist || song.originalArtist || "").trim();
  return artist ? `${artist} - ${title}` : title;
}

function metadataInputForSong(song: LocalExportSong): Record<string, unknown> {
  return {
    title: song.title,
    artist: song.artist,
    album: song.metadata?.album,
    albumArtist: song.metadata?.albumArtist,
    date: song.metadata?.date,
    year: song.metadata?.year,
    releaseYear: song.metadata?.releaseYear,
    genre: song.metadata?.genre,
    query: formatSongLine(song),
    platformLinks: song.platformLinks,
    metadata: song.metadata,
    raw: {
      ...song,
      file: undefined,
      blob: undefined,
    },
  };
}

async function processDirectAudioBlob(input: {
  blob: Blob;
  fileName: string;
  song: LocalExportSong;
  postProcessing: LocalExportPostProcessingOptions;
  fetcher: typeof fetch;
}): Promise<{ blob: Blob; filename?: string; postProcessing?: LocalExportPostProcessingSummary; warning?: string }> {
  try {
    const form = new FormData();
    const file = input.blob instanceof File
      ? input.blob
      : new File([input.blob], input.fileName, { type: input.blob.type || "audio/mpeg" });
    form.set("audio", file);
    form.set("metadata", JSON.stringify(metadataInputForSong(input.song)));
    form.set("postProcessing", JSON.stringify(input.postProcessing));
    const response = await input.fetcher("/api/download/process", { method: "POST", body: form });
    if (!response.ok) {
      return { blob: input.blob, warning: "Audio post-processing failed; exported original audio." };
    }
    const postProcessing = decodePostProcessingHeader(response.headers.get("X-PonotAI-Postprocessing"));
    const filenameHeader = response.headers.get("X-PonotAI-Filename");
    return {
      blob: await response.blob(),
      filename: filenameHeader ? decodeURIComponent(filenameHeader) : postProcessing?.filename,
      postProcessing,
    };
  } catch {
    return { blob: input.blob, warning: "Audio post-processing failed; exported original audio." };
  }
}

function postProcessingWarnings(summary?: LocalExportPostProcessingSummary): string[] {
  return [
    ...(summary?.warnings ?? []),
    ...(summary?.metadata?.warnings ?? []),
    ...(summary?.cover?.warnings ?? []),
    ...(summary?.audio?.warnings ?? []),
    ...(summary?.audioPolish?.warnings ?? []),
    ...(summary?.audioPolish?.qualityPreservation?.warnings ?? []),
    ...(summary?.audioPolish?.analysis?.comparison?.warnings ?? []),
  ].filter(Boolean);
}

function sanitizeManifestValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[omitted]";
  if (Array.isArray(value)) return value.map((entry) => sanitizeManifestValue(entry, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|password|cookie|session|api[-_]?key|jwt/i.test(key)) {
        result[key] = "[redacted]";
      } else if (/cover|artwork|thumbnail|image/i.test(key) && typeof nested === "string" && /^https?:\/\//i.test(nested)) {
        result[key] = "[omitted]";
      } else {
        result[key] = sanitizeManifestValue(nested, depth + 1);
      }
    }
    return result;
  }
  if (typeof value === "string") {
    return value
      .replace(/\b(token|secret|password|cookie|session|api[-_]?key|jwt)\s*[:=]\s*[^&\s"'`<>),;]+/gi, "$1=[redacted]")
      .replace(/(^|[\s"'`(])([A-Za-z]:[\\/][^\s"'`<>]+)/g, "$1[path]");
  }
  return value;
}

function safeManifestUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export async function createLocalExportZip(songs: LocalExportSong[], onProgress?: (progress: LocalExportProgress) => void, options?: LocalExportOptions): Promise<LocalExportResult> {
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
  let taggedCount = 0;
  let coversEmbeddedCount = 0;
  let normalizedCount = 0;
  let audioImprovedCount = 0;
  let audioNeutralCount = 0;
  let audioWorseCount = 0;
  let audioPolishWarningCount = 0;
  let preservedWithoutReencodeCount = 0;
  let compatibilityReencodedCount = 0;
  let normalizationReencodedCount = 0;
  let m4aCount = 0;
  let mp3Count = 0;
  let phoneProfileWarningCount = 0;
  let metadataWarningCount = 0;
  let postProcessingFailedCount = 0;
  let youtubeSuccessCount = 0;
  let youtubeCircuitOpen = false;
  const youtubeBlockedMessage = "YouTube downloads are currently blocked by the server environment. Try local mode, lower the batch size, provide direct audio files, or configure a private server.";
  let youtubeCircuitMessage = youtubeBlockedMessage;
  let youtubeCircuitCode: string | undefined;
  let youtubeCircuitFix: string | undefined;
  let youtubeCircuitDetail: string | undefined;
  const fetcher = options?.fetcher ?? localExportFetch;
  const postProcessingOptions = defaultPostProcessingOptions(options?.postProcessing);
  const audioComparisonReport: Array<Record<string, unknown>> = [];

  const reportProgress = (phase: LocalExportProgress["phase"], currentSong: string | undefined, completed: number, currentSourceType?: LocalExportProgress["currentSourceType"]) => {
    onProgress?.({
      phase,
      currentSong,
      currentSourceType,
      completed,
      total: songs.length,
      failed: failedCount + skippedCount,
      exported: exportedCount,
      skipped: skippedCount,
    });
  };

  reportProgress("preparing", undefined, 0);

  for (let index = 0; index < songs.length; index += 1) {
    const song = songs[index];
    const line = formatSongLine(song);
    const warnings: string[] = [];
    const localMetadata = resolveTrackMetadata(metadataInputForSong(song));
    const coverUrl = song.selectedCoverUrl || song.coverUrl || song.albumArtUrl;
    const sourceCandidates = [song.audioUrl, song.sourceUrl, song.source].filter((value): value is string => Boolean(value));
    const sourceUrl = sourceCandidates[0];
    const directAudioUrl = sourceCandidates.find((candidate) => isLikelyAudioUrl(candidate) && !isYouTubePageUrl(candidate));
    const youtubeUrl = normalizeYoutubePageUrl(song.youtubeUrl) || sourceCandidates.map(normalizeYoutubePageUrl).find(Boolean);

    const metadata = {
      ...(song.metadata ?? {}),
      ...(song.platformLinks ? { platformLinks: song.platformLinks } : {}),
    };

    const item: LocalExportResultItem = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      originalTitle: song.originalTitle,
      originalArtist: song.originalArtist,
      cleanedTitle: localMetadata.title,
      cleanedArtist: localMetadata.artist,
      metadataConfidence: localMetadata.confidence,
      cleanupApplied: localMetadata.cleanupApplied,
      youtubeVideoId: song.youtubeVideoId,
      youtubeUrl,
      sourceUrl: safeManifestUrl(sourceUrl),
      coverUrl: coverUrl && !isPlaceholderCoverUrl(coverUrl) ? "[available]" : undefined,
      metadata: Object.keys(metadata).length > 0 ? sanitizeManifestValue(metadata) as Record<string, unknown> : undefined,
      status: "skipped",
    };

    let audioBlob: Blob | undefined;
    let audioExt = ".mp3";
    let postProcessingSummary: LocalExportPostProcessingSummary | undefined;
    let resolvedMetadata = localMetadata;
    let directAudioFailed = false;

    try {
      if (song.file instanceof File) {
        item.sourceAttempted = "file";
        audioBlob = song.file;
        audioExt = guessExtensionFromContentType(song.file.type) || guessExtensionFromUrl(song.file.name) || ".mp3";
      } else if (song.blob instanceof Blob) {
        item.sourceAttempted = "blob";
        audioBlob = song.blob;
        audioExt = guessExtensionFromContentType(song.blob.type) || ".mp3";
      } else if (directAudioUrl) {
        item.sourceAttempted = "direct-audio-url";
        reportProgress("fetching-audio", line, index, "direct-audio-url");
        try {
          const fetched = await fetchBlobWithTimeout(directAudioUrl, 12000, fetcher);
          const contentType = fetched.contentType.split(";")[0].trim().toLowerCase();
          const validAudio = isAudioContentType(contentType) || isLikelyAudioUrl(directAudioUrl);
          if (validAudio) {
            audioBlob = fetched.blob;
            audioExt = guessExtensionFromContentType(contentType) || guessExtensionFromUrl(directAudioUrl) || ".mp3";
          } else {
            directAudioFailed = true;
            warnings.push("Direct audio URL did not return an audio content type. Trying YouTube fallback.");
          }
        } catch (error) {
          directAudioFailed = true;
          warnings.push(error instanceof Error ? error.message : "Direct audio URL failed. Trying YouTube fallback.");
        }
      }

      if (!audioBlob && (song.youtubeVideoId || youtubeUrl || line)) {
        if (youtubeCircuitOpen) {
          item.status = "skipped";
          item.error ||= youtubeCircuitMessage;
          item.code = youtubeCircuitCode;
          item.fix = youtubeCircuitFix;
          item.detail = youtubeCircuitDetail;
          item.youtubeCircuitOpen = true;
        } else {
          if (youtubeSuccessCount > 0 && YOUTUBE_BATCH_DELAY_MS > 0) await delay(YOUTUBE_BATCH_DELAY_MS);
          const youtubeId = isUsableYoutubeVideoId(song.youtubeVideoId) ? song.youtubeVideoId : undefined;
          const sourceAttempted = youtubeId ? "youtube-id" : youtubeUrl ? "youtube-url" : "youtube-query";
          item.sourceAttempted = sourceAttempted;
          reportProgress("downloading-youtube", line, index, sourceAttempted);
          try {
            const downloaded = await downloadFromYouTube({
              youtubeId,
              youtubeUrl: youtubeId ? undefined : youtubeUrl,
              query: youtubeId || youtubeUrl ? undefined : line,
              title: song.title,
              artist: song.artist,
              platformLinks: song.platformLinks,
              metadata,
              postProcessing: postProcessingOptions,
            }, fetcher);
            youtubeSuccessCount += 1;
            audioBlob = downloaded.blob;
            item.requestId = downloaded.requestId;
            postProcessingSummary = downloaded.postProcessing;
            resolvedMetadata = resolvedFromSummary(postProcessingSummary, localMetadata);
            if (downloaded.filename) audioExt = guessExtensionFromUrl(downloaded.filename) || audioExt;
          } catch (error) {
            const message = error instanceof Error ? error.message : "YouTube download failed.";
            const code = error instanceof YoutubeDownloadError ? error.code : undefined;
            const fix = error instanceof YoutubeDownloadError ? error.fix : undefined;
            const detail = error instanceof YoutubeDownloadError ? error.detail : undefined;
            const requestId = error instanceof YoutubeDownloadError ? error.requestId : undefined;
            if (requestId) item.requestId = requestId;
            if (detail) item.detail = detail;
            if (isGlobalYoutubeFailure(code) || (error instanceof YoutubeDownloadError && error.globalFailure)) {
              const globalMessage = messageForGlobalYoutubeFailure(code, youtubeBlockedMessage);
              youtubeCircuitOpen = true;
              youtubeCircuitMessage = globalMessage;
              youtubeCircuitCode = code;
              youtubeCircuitFix = fix;
              youtubeCircuitDetail = detail;
              item.status = "skipped";
              item.error ||= globalMessage;
              item.code = code;
              item.fix = fix;
              item.detail = detail;
              item.youtubeCircuitOpen = true;
            } else {
              throw new YoutubeDownloadError(message, code, fix, false, requestId, detail);
            }
          }
        }
      }

      if (!audioBlob && directAudioFailed && item.status !== "skipped") {
        item.error ||= "Direct audio failed and no YouTube fallback succeeded.";
      }
    } catch (error) {
      item.status = "failed";
      item.error ||= error instanceof Error ? error.message : "Browser blocked fetching this source or the source is not accessible locally.";
      if (error instanceof YoutubeDownloadError) {
        item.code = error.code;
        item.fix = error.fix;
        item.detail = error.detail;
        item.requestId = error.requestId;
      }
    }

    if (audioBlob && (item.sourceAttempted === "file" || item.sourceAttempted === "blob" || item.sourceAttempted === "direct-audio-url")) {
      if (postProcessingOptions.audioPolish.analyzeBeforeAfter) reportProgress("analyzing-audio", line, index, item.sourceAttempted);
      const polishPhase = postProcessingOptions.normalizeLoudness
        ? "normalizing-volume"
        : postProcessingOptions.embedCover
          ? "embedding-cover"
          : "cleaning-metadata";
      reportProgress(polishPhase, line, index, item.sourceAttempted);
      const processed = await processDirectAudioBlob({
        blob: audioBlob,
        fileName: createSafeTrackFileName(localMetadata, audioExt),
        song,
        postProcessing: postProcessingOptions,
        fetcher,
      });
      audioBlob = processed.blob;
      postProcessingSummary = processed.postProcessing;
      resolvedMetadata = resolvedFromSummary(postProcessingSummary, localMetadata);
      if (processed.filename) audioExt = guessExtensionFromUrl(processed.filename) || audioExt;
      if (processed.warning) warnings.push(processed.warning);
      reportProgress("verifying-file", line, index, item.sourceAttempted);
      if (postProcessingOptions.audioPolish.analyzeBeforeAfter) reportProgress("comparing-audio", line, index, item.sourceAttempted);
    } else if (audioBlob && item.sourceAttempted?.startsWith("youtube")) {
      if (postProcessingOptions.audioPolish.analyzeBeforeAfter) reportProgress("analyzing-audio", line, index, item.sourceAttempted);
      reportProgress(postProcessingOptions.normalizeLoudness ? "normalizing-volume" : "cleaning-metadata", line, index, item.sourceAttempted);
      reportProgress("verifying-file", line, index, item.sourceAttempted);
      if (postProcessingOptions.audioPolish.analyzeBeforeAfter) reportProgress("comparing-audio", line, index, item.sourceAttempted);
    }

    if (audioBlob) {
      const summaryFileName = postProcessingSummary?.filename;
      const trackName = getUniqueFileName(summaryFileName || createSafeTrackFileName(resolvedMetadata, audioExt), usedTrackNames);
      item.audioPath = `tracks/${trackName}`;
      item.status = "exported";
      item.title = resolvedMetadata.title;
      item.artist = resolvedMetadata.artist;
      item.cleanedTitle = resolvedMetadata.title;
      item.cleanedArtist = resolvedMetadata.artist;
      item.metadataConfidence = resolvedMetadata.confidence;
      item.cleanupApplied = resolvedMetadata.cleanupApplied;
      item.postProcessing = postProcessingSummary ?? {
        status: "skipped",
        filename: trackName,
        metadata: {
          title: resolvedMetadata.title,
          artist: resolvedMetadata.artist,
          album: resolvedMetadata.album,
          albumArtist: resolvedMetadata.albumArtist,
          date: resolvedMetadata.date,
          year: resolvedMetadata.year,
          genre: resolvedMetadata.genre,
          source: resolvedMetadata.source,
          confidence: resolvedMetadata.confidence,
          cleanupApplied: resolvedMetadata.cleanupApplied,
          warnings: resolvedMetadata.warnings,
        },
        cover: { attempted: false, embedded: false },
        audio: { mode: "unknown", reencoded: false },
        audioPolish: {
          profile: postProcessingOptions.audioPolish.profile,
          mode: postProcessingOptions.audioPolish.mode,
          reencoded: false,
          warnings: resolvedMetadata.warnings,
        },
        warnings: resolvedMetadata.warnings,
      };
      item.audioPolish = item.postProcessing.audioPolish;
      item.qualityPreservation = item.postProcessing.audioPolish?.qualityPreservation;
      const allPostWarnings = postProcessingWarnings(item.postProcessing);
      if (allPostWarnings.length > 0) warnings.push(...allPostWarnings);
      if (item.postProcessing.status === "metadata-only" || item.postProcessing.status === "normalized") taggedCount += 1;
      if (item.postProcessing.cover?.embedded) coversEmbeddedCount += 1;
      if (item.postProcessing.status === "normalized" || item.postProcessing.audio?.mode === "normalized") normalizedCount += 1;
      if (item.postProcessing.status === "failed-fallback-original") postProcessingFailedCount += 1;
      const comparison = item.postProcessing.audioPolish?.analysis?.comparison;
      if (comparison?.verdict === "improved") audioImprovedCount += 1;
      else if (comparison?.verdict === "neutral") audioNeutralCount += 1;
      else if (comparison?.verdict === "worse") audioWorseCount += 1;
      const quality = item.postProcessing.audioPolish?.qualityPreservation;
      if (quality?.audioStreamCopied && !quality.reencoded) preservedWithoutReencodeCount += 1;
      if (quality?.reencoded && quality.transcodeReason?.toLowerCase().includes("compatibility")) compatibilityReencodedCount += 1;
      if (quality?.reencoded && quality.transcodeReason?.toLowerCase().includes("loudness")) normalizationReencodedCount += 1;
      const outputExt = (quality?.outputExtension || guessExtensionFromUrl(trackName) || audioExt).toLowerCase();
      if (outputExt === ".m4a") m4aCount += 1;
      else if (outputExt === ".mp3") mp3Count += 1;
      phoneProfileWarningCount += quality?.warnings?.length ?? 0;
      audioPolishWarningCount += (item.postProcessing.audioPolish?.warnings?.length ?? 0) + (comparison?.warnings?.length ?? 0);
      metadataWarningCount += allPostWarnings.length;
      exportedCount += 1;
      files.push({ path: `${root}/tracks/${trackName}`, blob: audioBlob });
      if (postProcessingOptions.audioPolish.exportComparisonReport && item.postProcessing.audioPolish?.analysis) {
        audioComparisonReport.push(sanitizeManifestValue({
          id: item.id,
          title: resolvedMetadata.title,
          artist: resolvedMetadata.artist,
          zipPath: item.audioPath,
          audioPolish: item.postProcessing.audioPolish,
          qualityPreservation: item.qualityPreservation,
        }) as Record<string, unknown>);
      }
      const duration = item.postProcessing.audio?.probe?.duration ?? song.durationSec ?? -1;
      playlistLines.push(`#EXTINF:${Math.round(duration)},${formatTrackFileBase(resolvedMetadata)}`);
      playlistLines.push(`tracks/${trackName}`);
    } else if (item.status === "failed") {
      failedCount += 1;
      searchList.push(line);
    } else {
      item.status = "skipped";
      item.error ||= "No audio source available for local export.";
      item.sourceAttempted ||= "none";
      skippedCount += 1;
      searchList.push(line);
    }

    if (!isPlaceholderCoverUrl(coverUrl)) {
      try {
        reportProgress("fetching-cover", line, index, item.sourceAttempted);
        const fetched = await fetchBlobWithTimeout(coverUrl as string, 12000, fetcher);
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
    reportProgress("adding-files", line, index + 1, item.sourceAttempted);
  }

  const metadataBase = `${root}/metadata`;
  const manifest = {
    app: "Turrex",
    appVersion: options?.appVersion ?? "unknown",
    exportDateIso: new Date().toISOString(),
    diagnostics: options?.diagnosticsSnapshot ?? null,
    totalSelected: songs.length,
    exportedCount,
    failedCount,
    skippedCount,
    taggedCount,
    coversEmbeddedCount,
    normalizedCount,
    audioImprovedCount,
    audioNeutralCount,
    audioWorseCount,
    audioPolishWarningCount,
    preservedWithoutReencodeCount,
    compatibilityReencodedCount,
    normalizationReencodedCount,
    m4aCount,
    mp3Count,
    phoneProfileWarningCount,
    metadataWarningCount,
    postProcessingFailedCount,
    audioPolish: {
      profile: postProcessingOptions.audioPolish.profile,
      mode: postProcessingOptions.audioPolish.mode,
      normalizeLoudness: postProcessingOptions.audioPolish.normalizeLoudness,
      truePeakLimit: postProcessingOptions.audioPolish.truePeakLimit,
      trimSilence: postProcessingOptions.audioPolish.trimSilence,
      analyzeBeforeAfter: postProcessingOptions.audioPolish.analyzeBeforeAfter,
      exportComparisonReport: postProcessingOptions.audioPolish.exportComparisonReport,
      loudnessTarget: postProcessingOptions.audioPolish.loudnessTarget,
      counts: {
        improved: audioImprovedCount,
        neutral: audioNeutralCount,
        worse: audioWorseCount,
        warnings: audioPolishWarningCount,
        preservedWithoutReencode: preservedWithoutReencodeCount,
        compatibilityReencoded: compatibilityReencodedCount,
        normalizationReencoded: normalizationReencodedCount,
        m4a: m4aCount,
        mp3: mp3Count,
        phoneProfileWarnings: phoneProfileWarningCount,
      },
    },
    items,
  };

  const unresolvedItems = items.filter((item) => item.status !== "exported");
  const searchListText = Array.from(new Set(searchList)).join("\n");
  const failedItemsJson = JSON.stringify(unresolvedItems, null, 2);
  const playlistText = `${playlistLines.join("\n")}\n`;

  files.push({ path: `${metadataBase}/manifest.json`, blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) });
  files.push({ path: `${metadataBase}/search-list.txt`, blob: new Blob([searchListText], { type: "text/plain" }) });
  files.push({ path: `${metadataBase}/failed-items.json`, blob: new Blob([failedItemsJson], { type: "application/json" }) });
  files.push({ path: `${metadataBase}/playlist.m3u`, blob: new Blob([playlistText], { type: "audio/x-mpegurl" }) });
  if (postProcessingOptions.audioPolish.exportComparisonReport) {
    const reportJson = JSON.stringify({
      generatedAtIso: new Date().toISOString(),
      profile: postProcessingOptions.audioPolish.profile,
      mode: postProcessingOptions.audioPolish.mode,
      loudnessTarget: postProcessingOptions.audioPolish.loudnessTarget,
      counts: {
        improved: audioImprovedCount,
        neutral: audioNeutralCount,
        worse: audioWorseCount,
        warnings: audioPolishWarningCount,
        preservedWithoutReencode: preservedWithoutReencodeCount,
        compatibilityReencoded: compatibilityReencodedCount,
        normalizationReencoded: normalizationReencodedCount,
        m4a: m4aCount,
        mp3: mp3Count,
        phoneProfileWarnings: phoneProfileWarningCount,
      },
      items: audioComparisonReport,
    }, null, 2);
    files.push({ path: `${metadataBase}/audio-comparison.json`, blob: new Blob([reportJson], { type: "application/json" }) });
    files.push({ path: `${root}/analysis/audio-comparison.json`, blob: new Blob([reportJson], { type: "application/json" }) });
  }
  files.push({ path: `${root}/manifest.json`, blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) });
  files.push({ path: `${root}/playlists/export.m3u`, blob: new Blob([playlistText], { type: "audio/x-mpegurl" }) });
  files.push({ path: `${root}/search-list.txt`, blob: new Blob([searchListText], { type: "text/plain" }) });
  files.push({ path: `${root}/failed-items.json`, blob: new Blob([failedItemsJson], { type: "application/json" }) });
  files.push({ path: `${root}/playlist.m3u`, blob: new Blob([playlistText], { type: "audio/x-mpegurl" }) });

  reportProgress("finalizing", undefined, songs.length);
  const zipBlob = await makeZip(files);
  reportProgress("done", undefined, songs.length);
  return {
    ok: true,
    zipBlob,
    exportedCount,
    failedCount,
    skippedCount,
    taggedCount,
    coversEmbeddedCount,
    normalizedCount,
    audioImprovedCount,
    audioNeutralCount,
    audioWorseCount,
    audioPolishWarningCount,
    preservedWithoutReencodeCount,
    compatibilityReencodedCount,
    normalizationReencodedCount,
    m4aCount,
    mp3Count,
    phoneProfileWarningCount,
    metadataWarningCount,
    postProcessingFailedCount,
    items,
  };
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
