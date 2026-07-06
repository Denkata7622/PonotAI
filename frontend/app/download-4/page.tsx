'use client';

/*
 * Bugs fixed in this file:
 * - Imported JSON songs were held outside the persisted queue until all TIDAL
 *   searches finished, so failures or navigation could leave every song without
 *   a saved URL assignment state.
 * - Auto-assignment did not model the search phase as a queue state, did not
 *   retry one server 429 correctly, and did not abort cleanly on navigation.
 * - Queue persistence wrote too often during rapid progress updates and did
 *   not explicitly recover interrupted search states or lost in-memory ZIPs.
 * - Fatal download errors such as token expiry/rate-limit exhaustion were
 *   treated like ordinary item failures, allowing later items to continue and
 *   risking duplicate work after a resume.
 * - Cover payloads were only sent when "Embed Cover Art" was enabled, so the
 *   API could not write cover.jpg to ZIPs when users wanted ZIP artwork without
 *   embedded audio artwork.
 * - Per-song imported/OCR covers were gated by the global cover checkbox, which
 *   made batch ZIPs and embedded art fall back to missing artwork.
 * - The cover-art checkbox was disabled without a selected global image even
 *   though imported per-song covers and source-embedded covers can still be
 *   embedded.
 * - The final browser ZIP flattened each per-track server ZIP into
 *   tracks/<song>/..., undoing the API's album folders. Final export now
 *   preserves and merges album-folder paths with one root playlist/manifest.
 * - Auto-assignment sent one broad "artist - title" string and accepted one URL
 *   from the API, so wrong remixes or unrelated matches looked successful.
 *   The page now sends structured artist/title fields and displays the
 *   server-selected TIDAL metadata for verification.
 * [BUG] Queue merging collapsed duplicate URLs or repeated imported songs -
 *   duplicate rows are now preserved as independent queue items.
 * [LOGIC] No-URL skipped items bypassed scheduler delay - skipped queue work now
 *   goes through the same post-item delay path when more work remains.
 * [PERSISTENCE] Added Turrex Smart Library with IndexedDB metadata, a
 *   localStorage URL index, auto-save-on-success, duplicate queue badges,
 *   auto-skip controls, and a searchable paginated library modal.
 * [RECOVERY] Restored done items without blobs now inherit Smart Library
 *   duplicate state, so browser crashes do not force large batches to download
 *   tracks that already reached disk.
 */
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as ReactDOM from "react-dom";
import { AlertCircle, CheckCircle, ChevronDown, Download, Info, Library, Pause, Play, Plus, RotateCcw, Search, SkipForward, Trash2, Upload } from "lucide-react";
import SongReviewModal from "@/components/SongReviewModal";
import { recognizeFromImage, recognizeFromImageAndStore, type SongMatch, type SongRecognitionResult } from "@/features/recognition/api";
import { runCleaningPipeline, type Song } from "@/lib/songCleaning";
import { lookupCoverArtUrls } from "@/features/recognition/coverArt";
import { normalizeTrackKey } from "@/lib/songIdentity";
import { useLanguage } from "@/lib/LanguageContext";
import { t, type Language } from "@/lib/translations";
import { getApiConfigStatus } from "@/lib/apiConfig";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import {
  getOcrSongs,
  updateOcrSong,
  deleteOcrSong,
  clearOcrLibrary,
  type OcrLibraryEntry,
} from "@/lib/ocrLibraryDb";

type QueueStatus = "pending" | "searching" | "processing" | "done" | "error" | "skipped";
type DownloadState = "idle" | "processing" | "done" | "error";
type ExportProfile = "audiophile-flac" | "hifi-mp3" | "phone-aac-plus" | "normalized-mp3" | "analysis-only";
type QueuePriority = "high" | "medium" | "low";
type QueueFailureKind = "auth" | "rate-limit" | "network" | "storage" | "no-audio" | "not-found" | "cli" | "validation" | "other";
type PostQueueAction = "none" | "openFolder" | "notify";
type QueueSortKey = "manual" | "artist" | "title" | "album" | "priority" | "status" | "added";
type QueueSortDirection = "asc" | "desc";
type QueueSortSettings = { key: QueueSortKey; direction: QueueSortDirection };
type Download4Tab = "downloader" | "ocr";

type AlbumTrackEntry = {
  artist?: string;
  title?: string;
  album?: string;
  trackNumber?: number;
  duration?: number;
  file: string;
  coverSource?: string;
};

type TidalSearchCandidate = {
  url: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
};

type SpotifyImportTrack = {
  artist: string;
  title: string;
  album?: string;
};

type ReviewedSongMatch = Omit<SongMatch, "albumArtUrl"> & {
  albumArtUrl?: string | null;
  coverUrl?: string | null;
  coverCandidates?: unknown;
};

interface QueueItem {
  id: string;
  url?: string;
  artist?: string;
  title?: string;
  album?: string;
  genre?: string;
  year?: string;
  coverArt?: string | null;
  priority: QueuePriority;
  status: QueueStatus;
  progress?: number;
  progressMessage?: string;
  errorMsg?: string;
  duplicateExistingFile?: string;
  forceDownload?: boolean;
  zipByteLength?: number;
  durationSec?: number;
  serverZipPath?: string;
  albumTracks?: AlbumTrackEntry[];
  tracksExpanded?: boolean;
  previewBlob?: Blob;
  previewUrl?: string;
  zipBlob?: Blob;
  zipFileName?: string;
  tidalMatchTitle?: string;
  tidalMatchArtist?: string;
  tidalMatchAlbum?: string;
  tidalMatchDurationSec?: number;
  tidalCandidateCount?: number;
  tidalCandidates?: TidalSearchCandidate[];
  tidalCandidateIndex?: number;
  tidalMatchConfidence?: number;
  invalidUrlRetryCount?: number;
  isPlaylist?: boolean;
  alreadyDownloaded?: boolean;
  libraryDownloadedAt?: string;
  libraryFilePath?: string;
  source: "tidal" | "json" | "ocr";
  addedAtIso: string;
}

type LibraryTrackRecord = {
  trackUrl: string;
  artist: string;
  title: string;
  album?: string;
  downloadedAt: string;
  quality: string;
  profile: string;
  fileSize: number;
  filePath?: string;
};

type LibrarySortKey = "downloadedAt" | "artist" | "title" | "album" | "quality" | "fileSize";
type LibrarySortDirection = "asc" | "desc";

type TurrexFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type TurrexDirectoryHandle = {
  name: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<TurrexFileHandle>;
};

type TurrexWakeLockSentinel = {
  release: () => Promise<void>;
};

type PolishOptions = {
  cleanMetadata: boolean;
  embedCover: boolean;
  embedAudioCover: boolean;
  loudnorm: boolean;
  trimSilence: boolean;
  fadeInOut: boolean;
  truePeakLimiter: boolean;
  stereoEnhance: boolean;
  embedMetadata: boolean;
  musicbrainz: boolean;
  lyrics: boolean;
  verifyQuality: boolean;
  coverFallback: boolean;
  generatePlaylist: boolean;
  resizeCover: boolean;
  includeAnalysis: boolean;
};

type RateLimitSettings = {
  delaySeconds: number;
  songsBeforeLongPause: number;
  longPauseMinutes: number;
  adaptiveCooldown: boolean;
  maxTransientRetries: number;
  transientBackoffSeconds: number;
};

type ImportReport = {
  parsedCount: number;
  invalidCount: number;
  skippedCount: number;
  firstInvalidReason?: string;
  invalidItems?: string[];
  filename?: string;
};

type ToolDiagnostic = {
  available: boolean;
  version?: string;
  error?: string;
  errorCode?: string;
};

type TidalStatusResponse = {
  tidal: ToolDiagnostic & { configPath?: string; configExists?: boolean; loggedIn?: boolean; doctor?: string; updateAvailable?: boolean; latestVersion?: string };
  soulseek: ToolDiagnostic;
  ffmpeg: ToolDiagnostic;
  ffprobe: ToolDiagnostic;
  profiles: Array<{
    id: ExportProfile;
    label: string;
    extension: "mp3" | "m4a" | "flac";
    contentType: "audio/mpeg" | "audio/mp4" | "audio/flac";
    features?: Record<string, boolean | string>;
  }>;
  tempDir: string;
  writable: boolean;
  availableDiskBytes?: number;
  lowDiskSpace?: boolean;
  tokenExpiry?: string;
  lyricsAvailable?: boolean;
  musicbrainzAvailable?: boolean;
  searchAvailable?: boolean;
  tidalSearch?: { available?: boolean; message?: string; tokenExpiry?: string; rateLimitRemaining?: number };
  checkedAtIso: string;
};

type TidalDiagnostics = {
  checkedAtIso: string;
  route: {
    url: string;
    reachable: boolean;
    status?: number;
    message?: string;
  };
  tidal: (ToolDiagnostic & { configPath?: string; configExists?: boolean; loggedIn?: boolean; doctor?: string; updateAvailable?: boolean; latestVersion?: string }) | null;
  soulseek: ToolDiagnostic | null;
  ffmpeg: ToolDiagnostic | null;
  ffprobe: ToolDiagnostic | null;
  temp: { dir: string; writable: boolean; availableDiskBytes?: number; lowDiskSpace?: boolean } | null;
  profiles: TidalStatusResponse["profiles"];
  tokenExpiry?: string;
  lyricsAvailable: boolean;
  musicbrainzAvailable: boolean;
  searchAvailable: boolean;
  warnings: string[];
  fixes: string[];
};

type SseProgressEvent = {
  step: string;
  progress: number;
  message: string;
  code?: string;
  token?: string;
  file?: string;
  retryAfter?: number;
  status?: number;
  source?: "tidal" | "soulseek";
  skipped?: boolean;
  reason?: "duplicate";
  existingFile?: string;
  byteLength?: number;
  durationSec?: number;
  zipPath?: string;
  albumMeta?: AlbumTrackEntry[];
};

type BatchImageJob = {
  id: string;
  file: File;
  previewUrl: string;
  status: "queued" | "processing" | "done" | "error";
  error?: string;
  foundCount: number;
};

type BatchSong = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string | null;
  coverCandidates: Array<{ url: string; source: string; title?: string; artist?: string; album?: string }>;
  sourceImageIds: string[];
  rawText?: string;
  confidence: number;
  selected: boolean;
  needsReview: boolean;
  manuallyConfirmed: boolean;
  duplicateMerged?: boolean;
  manuallyEdited?: boolean;
};

type DroppedImportBatch = { id: string; files: File[] };
type Notice = { type: "success" | "error"; message: string } | null;
type LastError = { timestamp: string; item: string; message: string; body?: unknown };
type ErrorLogEntry = { id: string; timestamp: string; url?: string; title?: string; artist?: string; message: string; body?: unknown };
type SessionStats = { startedAt: number | null; completed: number; total: number; durations: number[] };
type SessionProgress = { processed: number; total: number; pct: number; label: string; remaining: string; avgSeconds: number };
type DownloadWithProgressResult = {
  blob: Blob;
  fileName: string;
  skipped?: false;
  zipPath?: string;
  albumMeta?: AlbumTrackEntry[];
} | { skipped: true; reason?: "duplicate"; existingFile?: string };
type QueueStatistics = {
  total: number;
  downloaded: number;
  failed: number;
  skipped: number;
  dataBytes: number;
  averageBytes: number;
  totalDurationSec: number;
  elapsedSec: number;
  estimatedRemainingSec: number;
};
type DownloadHistoryEntry = {
  id: string;
  queueItemId: string;
  url?: string;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: string;
  profile: ExportProfile;
  source: QueueItem["source"];
  downloadedAtIso: string;
  exportedFileName?: string;
  zipByteLength?: number;
  durationSec?: number;
};
type QueuePreset = {
  id: string;
  name: string;
  profile: ExportProfile;
  polishOptions: PolishOptions;
  rateLimit: RateLimitSettings;
  filenameTemplate: string;
  postQueueAction: PostQueueAction;
  useSoulseekFallback: boolean;
  createdAtIso: string;
};
type TidalPersistOptions = {
  coverImageName: string;
  useSoulseekFallback: boolean;
  libraryPath: string;
  filenameTemplate: string;
  postQueueAction: PostQueueAction;
  rateLimit: RateLimitSettings;
  isPaused: boolean;
  errorLog: ErrorLogEntry[];
  lastProcessedItemId: string | null;
  queueSort: QueueSortSettings;
  downloadHistory: DownloadHistoryEntry[];
  queuePresets: QueuePreset[];
  autoSkipDownloaded: boolean;
};
type TidalPersistSnapshot = {
  queue: QueueItem[];
  profile: ExportProfile;
  polishOptions: PolishOptions;
  options: TidalPersistOptions;
};

class TidalClientError extends Error {
  body?: unknown;

  constructor(message: string, body?: unknown) {
    super(message);
    this.name = "TidalClientError";
    this.body = body;
  }
}

const LOW_CONFIDENCE = 0.75;
const TIDAL_ENDPOINT = "/api/download/tidal";
const TIDAL_STORAGE_KEY = "turrex-tidal-state";
const TIDAL_STORAGE_TEMP_KEY = `${TIDAL_STORAGE_KEY}:tmp`;
const TIDAL_STORAGE_BACKUP_KEY = `${TIDAL_STORAGE_KEY}:backup`;
const DOWNLOAD4_TAB_STORAGE_KEY = "turrex-download4-tab";
const ADVANCED_AUDIO_ENHANCEMENTS_STORAGE_KEY = "turrex-download4-advanced-audio-enhancements";
const TURREX_LIBRARY_DB_NAME = "turrex-library";
const TURREX_LIBRARY_STORE = "tracks";
const TURREX_LIBRARY_DB_VERSION = 1;
const TURREX_DOWNLOADED_URLS_KEY = "turrex-downloaded-urls";
const AUTO_ASSIGN_SEARCH_DELAY_MS = 1500;
const MIN_SCHEDULER_DELAY_SECONDS = 10;
const DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const DEFAULT_TRANSIENT_DOWNLOAD_RETRIES = 3;
const MAX_TRANSIENT_DOWNLOAD_RETRIES = 3;
const MIN_TRANSIENT_BACKOFF_SECONDS = 10;
const MAX_TRANSIENT_BACKOFF_SECONDS = 120;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_ERROR_LOG_ENTRIES = 500;
const MAX_DOWNLOAD_HISTORY = 50;
const MAX_QUEUE_PRESETS = 12;
const MAX_COVER_IMAGE_BYTES = 12 * 1024 * 1024;
const TOKEN_EXPIRING_SOON_MS = 30 * 60 * 1000;
const LARGE_BATCH_DIRECTORY_THRESHOLD = 100;
const MAX_IN_MEMORY_COMPLETED_ZIPS = 100;
const MAX_FINAL_ZIP_SOURCE_BYTES = 512 * 1024 * 1024;
const QUEUE_PROCESSOR_LEASE_KEY = "turrex-download4-processor-lease";
const QUEUE_PROCESSOR_LEASE_TTL_MS = 30_000;
const QUEUE_PROCESSOR_LEASE_HEARTBEAT_MS = 10_000;
const DEFAULT_COVER_PLACEHOLDER = "/album-placeholder.svg";
const BATCH_REVIEW_PAGE_SIZE = 60;
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

const exportProfiles: Array<{
  id: ExportProfile;
  label: string;
  badge: string;
  description: string;
  extension: "mp3" | "m4a" | "flac";
  best?: boolean;
  features: string;
}> = [
  {
    id: "audiophile-flac",
    label: "Audiophile FLAC",
    badge: "Lossless",
    description: "Lossless FLAC with Vorbis comments and optional embedded cover art.",
    extension: "flac",
    features: "Vorbis tags + Cover Art + no re-encode",
  },
  {
    id: "hifi-mp3",
    label: "Hi-Fi MP3",
    badge: "320kbps",
    description: "Best everyday profile for rich playback on phones, desktop, and cars.",
    extension: "mp3",
    best: true,
    features: "True Peak Limiter + Stereo Enhancement + ID3 tags + Cover Art",
  },
  {
    id: "phone-aac-plus",
    label: "Phone AAC+",
    badge: "192kbps",
    description: "Phone-friendly M4A with loudness normalization and faststart playback.",
    extension: "m4a",
    features: "Loudnorm + True Peak Limiter + iTunes atoms + Cover Art",
  },
  {
    id: "normalized-mp3",
    label: "Normalized MP3",
    badge: "320kbps",
    description: "MP3 with loudness normalization for consistent playlist volume.",
    extension: "mp3",
    features: "Loudnorm + True Peak Limiter + ID3 tags + Cover Art",
  },
  {
    id: "analysis-only",
    label: "Analysis Only",
    badge: "320kbps",
    description: "MP3 export with detailed audio analysis in headers and ZIP metadata.",
    extension: "mp3",
    features: "ID3 tags + Cover Art + analysis report",
  },
];

const profileCapabilities: Record<ExportProfile, { truePeakLimiter: boolean; stereoEnhance: boolean; embedMetadata: boolean; embedCover: boolean }> = {
  "audiophile-flac": { truePeakLimiter: false, stereoEnhance: false, embedMetadata: true, embedCover: true },
  "hifi-mp3": { truePeakLimiter: true, stereoEnhance: true, embedMetadata: true, embedCover: true },
  "phone-aac-plus": { truePeakLimiter: true, stereoEnhance: false, embedMetadata: true, embedCover: true },
  "normalized-mp3": { truePeakLimiter: true, stereoEnhance: false, embedMetadata: true, embedCover: true },
  "analysis-only": { truePeakLimiter: false, stereoEnhance: false, embedMetadata: true, embedCover: true },
};

export default function Download4Page() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <section className="mx-auto w-full max-w-7xl px-0 py-2 sm:px-2">
        <div className="space-y-5">
          <TidalDownloadClient />
        </div>
      </section>
    </main>
  );
}

// ---- Detect what kind of TIDAL URL this is ----
function tidalUrlKind(value: string): "track" | "album" | "playlist" | "mix" | undefined {
  try {
    const segments = new URL(value).pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
    const kind = segments[0] === "browse" ? segments[1] : segments[0];
    return kind === "track" || kind === "album" || kind === "playlist" || kind === "mix" ? kind : undefined;
  } catch {
    return undefined;
  }
}

// ---- Prevent double suffixes like "Song (Metal Version) (Metal Version)" ----
function deduplicateTitleSuffix(title: string): string {
  return title.replace(/\s*(\([^)]+\))\s*\1+/gi, " $1");
}

// ---- Global TIDAL search throttler with 429 backoff ----
let tidalSearchQueue: Promise<void> = Promise.resolve();

async function throttledSearch(
  query: string,
  options?: Parameters<typeof searchTidalUrl>[1],
  maxRetries = 3,
  baseDelayMs = 2000,
): Promise<ReturnType<typeof searchTidalUrl>> {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // The actual search with retry logic
  const execute = async (attempt = 0): Promise<ReturnType<typeof searchTidalUrl>> => {
    const result = await searchTidalUrl(query, options);
    if (result.status === 429 && attempt < maxRetries) {
      const waitSeconds = Math.min(60, Math.pow(2, attempt) * 15);
      console.warn(`[TIDAL] Rate limited. Waiting ${waitSeconds}s before retry (attempt ${attempt + 1}/${maxRetries})...`);
      await wait(waitSeconds * 1000);
      return execute(attempt + 1);
    }
    return result;
  };

  // Create a promise that resolves when this whole operation is done
  // (so the next request can start)
  let resolveQueue: (() => void) | undefined;
  const queueDone = new Promise<void>(resolve => {
    resolveQueue = resolve;
  });

  // The real search promise
  const previous = tidalSearchQueue;
  const searchPromise = previous
    .then(() => wait(baseDelayMs))
    .then(() => execute())
    .finally(() => resolveQueue?.());

  // Set the queue to the "done" promise – this is a Promise<void>, so no type error
  tidalSearchQueue = queueDone;

  // Return the actual search result
  return searchPromise;
}

function TidalDownloadClient() {
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Download4Tab>("downloader");
  // Add this helper somewhere inside TidalDownloadClient or import it
  const songToSongMatch = (song: Song): SongMatch => ({
    id: song.id,
    songName: song.title,
    artist: song.artist,
    album: song.album || '',
    genre: song.genre || '',
    releaseYear: song.releaseYear ? Number(song.releaseYear) : null,
    platformLinks: {},
    albumArtUrl: song.coverUrl || '',
    confidence: song.confidence || 1,
    durationSec: 0,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(DOWNLOAD4_TAB_STORAGE_KEY);
      if (saved === "ocr") setActiveTab("ocr");
    }
  }, []);
  const [tidalUrl, setTIDALUrl] = useState("");
  const [tidalUrlError, setTIDALUrlError] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueSort, setQueueSort] = useState<QueueSortSettings>({ key: "manual", direction: "asc" });
  const [selectedBulkIds, setSelectedBulkIds] = useState<string[]>([]);
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryEntry[]>([]);
  const [queuePresets, setQueuePresets] = useState<QueuePreset[]>([]);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverImageName, setCoverImageName] = useState("");
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [exportProfile, setExportProfile] = useState<ExportProfile>("audiophile-flac");
  const [polishOptions, setPolishOptions] = useState<PolishOptions>({
    cleanMetadata: true,
    embedCover: true,
    embedAudioCover: true,
    loudnorm: false,
    trimSilence: false,
    fadeInOut: false,
    truePeakLimiter: false,
    stereoEnhance: false,
    embedMetadata: true,
    musicbrainz: false,
    lyrics: false,
    verifyQuality: false,
    coverFallback: false,
    generatePlaylist: false,
    resizeCover: false,
    includeAnalysis: false,
  });
  const [showAdvancedAudioEnhancements, setShowAdvancedAudioEnhancements] = useState(() => {
    if (typeof window === "undefined") return false;
    return safeGetLocalStorageItem(ADVANCED_AUDIO_ENHANCEMENTS_STORAGE_KEY) === "1";
  });
  const [state, setState] = useState<DownloadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [tokenExpired, setTokenExpired] = useState(false);
  const [diagnostics, setDiagnostics] = useState<TidalDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const [tidalLoginLoading, setTidalLoginLoading] = useState(false);
  const [tidalLoginMessage, setTidalLoginMessage] = useState("");
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [showSkippedImportRows, setShowSkippedImportRows] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [importedSongs, setImportedSongs] = useState<Song[]>([]);
  const [droppedOcrFiles, setDroppedOcrFiles] = useState<DroppedImportBatch | null>(null);
  const [isImportDropActive, setIsImportDropActive] = useState(false);
  const [autoAssigningUrls, setAutoAssigningUrls] = useState(false);
  const [autoAssignMessage, setAutoAssignMessage] = useState("");
  const [lastErrors, setLastErrors] = useState<LastError[]>([]);
  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>([]);
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [lastExportName, setLastExportName] = useState("");
  const [previewingItemId, setPreviewingItemId] = useState<string | null>(null);
  const [useSoulseekFallback, setUseSoulseekFallback] = useState(true);
  const [libraryPath, setLibraryPath] = useState("");
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string | null>(null);
  const [draggedQueueItemId, setDraggedQueueItemId] = useState<string | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [showSpotifyImport, setShowSpotifyImport] = useState(false);
  const [filenameTemplate, setFilenameTemplate] = useState("{artist} - {title}.{ext}");
  const [postQueueAction, setPostQueueAction] = useState<PostQueueAction>("none");
  const [completionNotice, setCompletionNotice] = useState("");
  const [libraryTracks, setLibraryTracks] = useState<LibraryTrackRecord[]>([]);
  const [downloadedUrlSet, setDownloadedUrlSet] = useState<Set<string>>(() => readDownloadedUrlSet());
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [persistenceWarning, setPersistenceWarning] = useState("");
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [ocrLibrary, setOcrLibrary] = useState<OcrLibraryEntry[]>([]);
  const [ocrLibraryLoading, setOcrLibraryLoading] = useState(false);
  const [selectedOcrIds, setSelectedOcrIds] = useState<string[]>([]);
  const [ocrLibraryQuery, setOcrLibraryQuery] = useState("");
  const [showOcrLibrary, setShowOcrLibrary] = useState(false);
  const [autoSkipDownloaded, setAutoSkipDownloaded] = useState(true);
  const [downloadDirectoryName, setDownloadDirectoryName] = useState("");
  const [rateLimit, setRateLimit] = useState<RateLimitSettings>({
    delaySeconds: 45,
    songsBeforeLongPause: 7,
    longPauseMinutes: 3,
    adaptiveCooldown: true,
    maxTransientRetries: DEFAULT_TRANSIENT_DOWNLOAD_RETRIES,
    transientBackoffSeconds: MIN_TRANSIENT_BACKOFF_SECONDS,
  });
  const [isPaused, setIsPaused] = useState(false);
  const [currentProcessingId, setCurrentProcessingId] = useState<string | null>(null);
  const [lastProcessedItemId, setLastProcessedItemId] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats>({ startedAt: null, completed: 0, total: 0, durations: [] });
  const [adaptiveCooldown, setAdaptiveCooldown] = useState<{ multiplier: number; songsRemaining: number }>({ multiplier: 1, songsRemaining: 0 });
  const [cooldownLabel, setCooldownLabel] = useState("");
  const [cooldownRemaining, setCooldownRemaining] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const currentItemAbortRef = useRef<AbortController | null>(null);
  const autoAssignAbortRef = useRef<AbortController | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const persistTimerRef = useRef<number | null>(null);
  const autoAssignMessageTimerRef = useRef<number | null>(null);
  const lastPersistedAtRef = useRef(0);
  const latestPersistSnapshotRef = useRef<TidalPersistSnapshot | null>(null);
  const isProcessingRef = useRef(false);
  const zipExportInFlightRef = useRef(false);
  const pauseRequestedRef = useRef(false);
  const skipRequestedRef = useRef(false);
  const skipDelayRef = useRef(false);
  const skipDelay = useCallback(() => {
    skipDelayRef.current = true;
  }, []);
    const copyLibrary = useCallback(async () => {
    try {
      const text = JSON.stringify(libraryTracks, null, 2);
      await navigator.clipboard.writeText(text);
      setCompletionNotice("Library copied to clipboard.");
    } catch {
      setLibraryError("Could not copy library to clipboard.");
    }
  }, [libraryTracks]);
  const autoAssignInFlightRef = useRef(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const coverPreviewRef = useRef("");
  const downloadDirectoryHandleRef = useRef<TurrexDirectoryHandle | null>(null);
  const restoredRef = useRef(false);
  const processorLeaseOwnerRef = useRef(`download4-${makeId()}`);
  const processorLeaseHeartbeatRef = useRef<number | null>(null);
  const wakeLockRef = useRef<TurrexWakeLockSentinel | null>(null);

  const flushPersistedState = useCallback(() => {
    const snapshot = latestPersistSnapshotRef.current;
    if (!snapshot || typeof window === "undefined") return;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const result = persistTidalState(snapshot.queue, snapshot.profile, snapshot.polishOptions, snapshot.options);
    setPersistenceWarning(result === "failed"
      ? "Queue progress could not be saved because browser storage is unavailable or full. Clear old site data before continuing an overnight batch."
      : result === "compact"
        ? "Browser storage was nearly full, so Turrex saved a compact recovery snapshot. Clear old site data to preserve full queue details."
        : "");
    lastPersistedAtRef.current = Date.now();
  }, []);

  const schedulePersistedState = useCallback((snapshot: TidalPersistSnapshot) => {
    latestPersistSnapshotRef.current = snapshot;
    if (typeof window === "undefined") return;
    const elapsed = Date.now() - lastPersistedAtRef.current;
    if (elapsed >= 500 && persistTimerRef.current === null) {
      flushPersistedState();
      return;
    }
    const waitMs = Math.max(0, 500 - elapsed);
    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(flushPersistedState, waitMs);
  }, [flushPersistedState]);

  const loadTidalDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    setDiagnosticsError("");
    try {
      const response = await fetch(`${TIDAL_ENDPOINT}?action=status`, { cache: "no-store" });
      if (response.ok) {
        const status = await response.json() as TidalStatusResponse;
        const warnings = [
          ...(status.tidal.available ? [] : [status.tidal.error || "TIDAL is unavailable."]),
          ...(status.tidal.configExists || status.tidal.loggedIn ? [] : [`TIDAL login token is not valid${status.tidal.configPath ? ` (${status.tidal.configPath})` : ""}.`]),
          ...(status.soulseek.available ? [] : [status.soulseek.error || "Soulseek fallback is unavailable."]),
          ...(status.ffmpeg.available ? [] : [status.ffmpeg.error || "ffmpeg is unavailable."]),
          ...(status.ffprobe.available ? [] : [status.ffprobe.error || "ffprobe is unavailable."]),
          ...(status.tidal.updateAvailable ? [`Tidekeeper update available${status.tidal.latestVersion ? `: ${status.tidal.latestVersion}` : "."}`] : []),
          ...(status.writable ? [] : ["Temporary directory is not writable."]),
          ...(status.lowDiskSpace ? ["Low disk space. Free at least 1 GB in the temporary directory before starting the batch."] : []),
        ];
        setDiagnostics({
          checkedAtIso: status.checkedAtIso,
          route: { url: `${TIDAL_ENDPOINT}?action=status`, reachable: true, status: response.status, message: "Online" },
          tidal: status.tidal,
          soulseek: status.soulseek,
          ffmpeg: status.ffmpeg,
          ffprobe: status.ffprobe,
          temp: { dir: status.tempDir, writable: status.writable, availableDiskBytes: status.availableDiskBytes, lowDiskSpace: status.lowDiskSpace },
          profiles: status.profiles,
          tokenExpiry: status.tidalSearch?.tokenExpiry || status.tokenExpiry,
          lyricsAvailable: Boolean(status.lyricsAvailable),
          musicbrainzAvailable: Boolean(status.musicbrainzAvailable),
          searchAvailable: Boolean(status.searchAvailable || status.tidalSearch?.available),
          warnings,
          fixes: [
            ...(status.tidal.available ? [] : ["Install tidekeeper or set TIDAL_DL_NG_PATH to the executable."]),
            ...(status.tidal.configExists || status.tidal.loggedIn ? [] : ["Run `tidekeeper login` once locally so the TIDAL token is refreshed."]),
            ...(status.soulseek.available ? [] : ["Install slsk-batchdl with `pip install slsk-batchdl` or set SLSK_BATCHDL_PATH to the executable."]),
            ...(status.ffmpeg.available ? [] : ["Install ffmpeg or set FFMPEG_PATH/FFMPEG_LOCATION to the ffmpeg executable."]),
            ...(status.ffprobe.available ? [] : ["Install ffprobe or set FFPROBE_PATH/FFMPEG_LOCATION to the ffprobe executable."]),
            ...(status.tidal.updateAvailable ? ["Update tidekeeper when convenient so TIDAL changes are handled by the latest CLI."] : []),
            ...(status.writable ? [] : ["Use a writable OS temporary directory for ZIP creation."]),
            ...(status.lowDiskSpace ? ["Free at least 1 GB in the temporary directory, then recheck TIDAL status."] : []),
          ],
        });
        if (status.tidal.loggedIn || status.searchAvailable || status.tidalSearch?.available) setTokenExpired(false);
      } else {
        const detail = await response.text().catch(() => "");
        setDiagnostics({
          checkedAtIso: new Date().toISOString(),
          route: { url: `${TIDAL_ENDPOINT}?action=status`, reachable: false, status: response.status, message: detail || `Status check returned ${response.status}.` },
          tidal: null,
          soulseek: null,
          ffmpeg: null,
          ffprobe: null,
          temp: null,
          profiles: exportProfiles.map((profile) => ({ id: profile.id, label: profile.label, extension: profile.extension, contentType: contentTypeForExtension(profile.extension) })),
          lyricsAvailable: false,
          musicbrainzAvailable: false,
          searchAvailable: false,
          warnings: [detail || `TIDAL status route returned ${response.status}.`],
          fixes: ["Verify app/api/download/tidal/route.ts is compiled and the dev server has restarted."],
        });
        setDiagnosticsError(`TIDAL status returned ${response.status}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "TIDAL diagnostics are unavailable.";
      setDiagnostics({
        checkedAtIso: new Date().toISOString(),
        route: { url: `${TIDAL_ENDPOINT}?action=status`, reachable: false, message },
        tidal: null,
        soulseek: null,
        ffmpeg: null,
        ffprobe: null,
        temp: null,
        profiles: exportProfiles.map((profile) => ({ id: profile.id, label: profile.label, extension: profile.extension, contentType: contentTypeForExtension(profile.extension) })),
        lyricsAvailable: false,
        musicbrainzAvailable: false,
        searchAvailable: false,
        warnings: [message],
        fixes: ["Restart the Next.js dev server and ensure the TIDAL route is available."],
      });
      setDiagnosticsError(message);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  const refreshSmartLibrary = useCallback(async () => {
    if (typeof window === "undefined") return;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      const tracks = await readSmartLibraryTracks();
      const nextSet = setFromLibraryTracks(tracks);
      persistDownloadedUrlSet(nextSet);
      setLibraryTracks(tracks);
      setDownloadedUrlSet(nextSet);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Could not load Turrex Smart Library.");
      const fallbackSet = readDownloadedUrlSet();
      setDownloadedUrlSet(fallbackSet);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const refreshOcrLibrary = useCallback(async () => {
    if (typeof window === "undefined") return;
    setOcrLibraryLoading(true);
    try {
      const songs = await getOcrSongs();
      setOcrLibrary(songs);
    } catch (error) {
      console.error("[ocr-library] Failed to load OCR library:", error);
    } finally {
      setOcrLibraryLoading(false);
    }
  }, []);

  async function sendOcrLibraryItemsToQueue(ids: string[]) {
    const selected = ocrLibrary.filter((s) => ids.includes(s.id));
    if (selected.length === 0) return;
    const now = new Date().toISOString();
    const items: QueueItem[] = selected.map((s) => ({
      id: makeId(),
      artist: s.artist,
      title: s.title,
      album: s.album,
      url: s.tidalUrl,
      priority: "medium" as const,
      status: s.tidalUrl ? "pending" as const : "skipped" as const,
      progress: s.tidalUrl ? 0 : 100,
      progressMessage: s.tidalUrl ? "From OCR Library" : undefined,
      errorMsg: s.tidalUrl ? undefined : "No TIDAL URL - add one before processing.",
      source: "ocr" as const,
      addedAtIso: now,
    }));
    setQueue((current) => mergeQueueItems(current, items));
    setState("idle");
    setErrorMessage("");
  }

  async function searchOcrLibraryUrls(ids: string[]) {
    const selected = ocrLibrary.filter((s) => ids.includes(s.id) && s.status !== "assigned");
    if (selected.length === 0) return;
    await Promise.all(selected.map((s) => updateOcrSong(s.id, { status: "searching" })));
    setOcrLibrary((current) =>
      current.map((s) => ids.includes(s.id) ? { ...s, status: "searching" } : s)
    );
    const tempItems: QueueItem[] = selected.map((s) => ({
      id: s.id,
      artist: s.artist,
      title: s.title,
      album: s.album,
      priority: "medium" as const,
      status: "searching" as const,
      progress: 1,
      source: "ocr" as const,
      addedAtIso: s.extractedAt,
    }));
    setQueue((current) => mergeQueueItems(current, tempItems));
    void assignTidalUrls(tempItems);
  }

  async function chooseDownloadDirectory() {
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<TurrexDirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      setLibraryError("Folder selection is not supported by this browser. ZIPs will use the default Downloads folder.");
      return;
    }
    try {
      const handle = await picker();
      const perm = await (handle as any).requestPermission?.({ mode: "readwrite" });
      if (perm && perm !== "granted") {
        throw new Error("Folder permission denied. Please allow write access and try again.");
      }
      downloadDirectoryHandleRef.current = handle;
      setDownloadDirectoryName(handle.name);
      setLibraryError("");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLibraryError(error instanceof Error ? error.message : "Could not select a download folder.");
    }
  }

  async function clearSmartLibrary() {
    if (!window.confirm("Clear Turrex Smart Library metadata? This will not delete files from disk.")) return;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      await clearSmartLibraryTracks();
      persistDownloadedUrlSet(new Set());
      setLibraryTracks([]);
      setDownloadedUrlSet(new Set());
      setQueue((current) => current.map((item) => {
        if (!item.alreadyDownloaded) return item;
        return {
          ...item,
          alreadyDownloaded: false,
          libraryDownloadedAt: undefined,
          libraryFilePath: undefined,
          status: item.status === "skipped" && item.url ? "pending" : item.status,
          progress: item.status === "skipped" && item.url ? 0 : item.progress,
          progressMessage: item.status === "skipped" && item.url ? undefined : item.progressMessage,
          errorMsg: item.status === "skipped" && item.url ? undefined : item.errorMsg,
        };
      }));
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Could not clear Turrex Smart Library.");
    } finally {
      setLibraryLoading(false);
    }
  }

  async function recordQueueItemInSmartLibrary(item: QueueItem, blob: Blob, fileName: string, filePath?: string): Promise<LibraryTrackRecord | null> {
    const trackUrl = normalizeLibraryTrackUrl(item.url);
    if (!trackUrl) return null;
    const record: LibraryTrackRecord = {
      trackUrl,
      artist: (item.artist || "Unknown Artist").trim(),
      title: (item.title || titleFromTIDALUrl(trackUrl)).trim(),
      album: item.album?.trim() || undefined,
      downloadedAt: new Date().toISOString(),
      quality: qualityForLibraryProfile(exportProfile),
      profile: exportProfile,
      fileSize: blob.size,
      filePath,
    };
    try {
      await putSmartLibraryTrack(record);
      setLibraryTracks((current) => mergeLibraryTrackRecords(current, record));
      setDownloadedUrlSet((current) => {
        const next = new Set(current);
        next.add(trackUrl);
        persistDownloadedUrlSet(next);
        return next;
      });
      return record;
    } catch (error) {
      setLibraryError(`Downloaded ${fileName}, but Smart Library metadata could not be saved: ${error instanceof Error ? error.message : "unknown error"}`);
      setDownloadedUrlSet((current) => {
        const next = new Set(current);
        next.add(trackUrl);
        persistDownloadedUrlSet(next);
        return next;
      });
      return { ...record, filePath };
    }
  }

  async function loginToTidal() {
    if (tidalLoginLoading) return;
    const shouldAutoResume = tokenExpired && queue.some((item) => item.status === "error" || item.status === "pending");
    setTidalLoginLoading(true);
    setTidalLoginMessage("");
    setDiagnosticsError("");
    try {
      const response = await fetch(`${TIDAL_ENDPOINT}?action=login`, { method: "POST", cache: "no-store" });
      const payload = await response.json().catch(() => null) as { success?: unknown; message?: unknown; error?: unknown } | null;
      if (!response.ok || payload?.success !== true) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `TIDAL login returned ${response.status}.`);
      }
      setTidalLoginMessage(typeof payload.message === "string" ? payload.message : "Browser opened. Complete login and Turrex will recheck automatically.");
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await wait(attempt === 0 ? 2_000 : 5_000);
        const statusResponse = await fetch(`${TIDAL_ENDPOINT}?action=status`, { cache: "no-store" }).catch(() => null);
        if (!statusResponse?.ok) continue;
        const status = await statusResponse.json().catch(() => null) as TidalStatusResponse | null;
        if (!status || (!status.tidal.loggedIn && !status.searchAvailable && !status.tidalSearch?.available)) continue;
        setTokenExpired(false);
        setTidalLoginMessage(shouldAutoResume ? "TIDAL login restored. Resuming the saved batch..." : "TIDAL login restored.");
        void loadTidalDiagnostics();
        if (shouldAutoResume) {
          setQueue((current) => current.map((item) => item.status === "error" && /token|auth|login|unauthorized/i.test(item.errorMsg || "")
            ? { ...item, status: "pending" as const, errorMsg: undefined, progress: 0, progressMessage: "Ready after TIDAL login" }
            : item));
          pauseRequestedRef.current = false;
          setIsPaused(false);
          setState("idle");
          // Do not auto-resume without a user gesture — folder write permission requires a real click.
          // Leave isPaused as-is; the Resume button will call processQueue with a fresh click.        
        }
        return;
      }
      setTidalLoginMessage("TIDAL login window opened, but Turrex could not confirm completion yet. Finish login, then click Recheck TIDAL.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start TIDAL login.";
      setTidalLoginMessage(message);
      setDiagnosticsError(message);
    } finally {
      setTidalLoginLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    restoreTidalState();
    void loadTidalDiagnostics();
    void refreshSmartLibrary();
    void refreshOcrLibrary();
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      flushPersistedState();
      if (autoAssignInFlightRef.current || isProcessingRef.current || zipExportInFlightRef.current) {
        event.preventDefault();
        event.returnValue = "A TIDAL queue or ZIP export is still running.";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      autoAssignAbortRef.current?.abort();
      abortRef.current?.abort();
      previewAbortRef.current?.abort();
      if (processorLeaseHeartbeatRef.current !== null) window.clearInterval(processorLeaseHeartbeatRef.current);
      releaseQueueProcessorLease(processorLeaseOwnerRef.current);
      void wakeLockRef.current?.release().catch(() => undefined);
      if (autoAssignMessageTimerRef.current !== null) window.clearTimeout(autoAssignMessageTimerRef.current);
      flushPersistedState();
      if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
      for (const item of queueRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, [flushPersistedState, loadTidalDiagnostics, refreshOcrLibrary, refreshSmartLibrary]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    if (!mounted) return;
    safeSetLocalStorageItem(DOWNLOAD4_TAB_STORAGE_KEY, activeTab);
  }, [activeTab, mounted]);

  useEffect(() => {
    if (!mounted) return;
    safeSetLocalStorageItem(ADVANCED_AUDIO_ENHANCEMENTS_STORAGE_KEY, showAdvancedAudioEnhancements ? "1" : "0");
  }, [mounted, showAdvancedAudioEnhancements]);

  useEffect(() => {
    if (!mounted) return;
    setQueue((current) => markQueueItemsWithLibrary(current, libraryTracks, downloadedUrlSet));
  }, [downloadedUrlSet, libraryTracks, mounted]);

  useEffect(() => {
    if (!mounted || !restoredRef.current) return;
    schedulePersistedState({
      queue,
      profile: exportProfile,
      polishOptions,
      options: {
        coverImageName,
        useSoulseekFallback,
        libraryPath,
        filenameTemplate,
        postQueueAction,
        rateLimit,
        isPaused,
        errorLog,
        lastProcessedItemId,
        queueSort,
        downloadHistory,
        queuePresets,
        autoSkipDownloaded,
      },
    });
  }, [autoSkipDownloaded, coverImageName, downloadHistory, errorLog, exportProfile, filenameTemplate, isPaused, lastProcessedItemId, libraryPath, mounted, polishOptions, postQueueAction, queue, queuePresets, queueSort, rateLimit, schedulePersistedState, useSoulseekFallback]);

  useEffect(() => {
    if (ocrLibrary.length === 0) return;
    const libraryIds = new Set(ocrLibrary.map((s) => s.id));
    const updates = queue.filter((item) => libraryIds.has(item.id) && item.url && item.status === "pending");
    if (updates.length === 0) return;
    void Promise.all(
      updates.map((item) =>
        updateOcrSong(item.id, {
          status: "assigned",
          tidalUrl: item.url,
          tidalMatchInfo: item.tidalMatchTitle
            ? { artist: item.tidalMatchArtist ?? "", title: item.tidalMatchTitle, album: item.tidalMatchAlbum }
            : undefined,
        })
      )
    ).then(() => void refreshOcrLibrary());
  }, [queue, ocrLibrary.length, refreshOcrLibrary]);

  const queueStats = useMemo(() => ({
    total: queue.length,
    pending: queue.filter((item) => item.status === "pending").length,
    processing: queue.filter((item) => item.status === "processing" || item.status === "searching").length,
    done: queue.filter((item) => item.status === "done").length,
    error: queue.filter((item) => item.status === "error").length,
    skipped: queue.filter((item) => !item.url || item.status === "skipped").length,
  }), [queue]);
  const reSearchableTidalUrlCount = useMemo(() => queue.filter(isTidalUrlReSearchCandidate).length, [queue]);
  const visibleQueue = useMemo(() => applyQueueSort(queue, queueSort), [queue, queueSort]);
  const activeProfile = exportProfiles.find((profile) => profile.id === exportProfile) ?? exportProfiles[0];
  const heroStatus = tidalStatus(mounted ? diagnostics : null, diagnosticsLoading);

  useEffect(() => {
    setSelectedBulkIds((current) => current.filter((id) => queue.some((item) => item.id === id)));
  }, [queue]);

  useEffect(() => {
    if (!mounted || !lastProcessedItemId) return;
    window.setTimeout(() => {
      document.getElementById(`queue-item-${lastProcessedItemId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 250);
  }, [lastProcessedItemId, mounted]);

  function updateQueueItem(id: string, patch: Partial<QueueItem>) {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function editQueueItem(id: string, patch: Partial<QueueItem>) {
    setQueue((current) => current.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "url")) {
        const match = findLibraryTrackForUrl(next.url, libraryTracks, downloadedUrlSet);
        const editedUrl = next.url?.trim();
        const shouldReactivate = Boolean(editedUrl) && (item.status === "skipped" || (item.status === "error" && item.errorMsg?.toLowerCase().includes("no tidal url")));
        return {
          ...next,
          status: shouldReactivate ? "pending" : next.status,
          progress: shouldReactivate ? 0 : next.progress,
          progressMessage: shouldReactivate ? undefined : next.progressMessage,
          errorMsg: shouldReactivate ? undefined : next.errorMsg,
          alreadyDownloaded: Boolean(match),
          libraryDownloadedAt: match?.downloadedAt,
          libraryFilePath: match?.filePath,
          forceDownload: match ? next.forceDownload : false,
        };
      }
      return next;
    }));
  }

  function recordLastError(item: Pick<QueueItem, "artist" | "title" | "url">, message: string, body?: unknown) {
    const timestamp = new Date().toISOString();
    setLastErrors((current) => [
      {
        timestamp,
        item: formatQueueItemLine(item),
        message,
        body,
      },
      ...current,
    ].slice(0, 4));
    setErrorLog((current) => [
      {
        id: makeId(),
        timestamp,
        url: item.url,
        title: item.title,
        artist: item.artist,
        message,
        body,
      },
      ...current,
    ].slice(0, MAX_ERROR_LOG_ENTRIES));
  }

  function updateCoverImage(file: File | null) {
    if (file) {
      const validationMessage = coverImageValidationMessage(file);
      if (validationMessage) {
        setState("error");
        setErrorMessage(validationMessage);
        if (coverInputRef.current) coverInputRef.current.value = "";
        return;
      }
    }
    if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
    const previewUrl = file ? URL.createObjectURL(file) : "";
    coverPreviewRef.current = previewUrl;
    setCoverPreviewUrl(previewUrl);
    setCoverImage(file);
    setCoverImageName(file?.name ?? "");
    if (!file && coverInputRef.current) coverInputRef.current.value = "";
  }

  function handleImportDrag(event: React.DragEvent<HTMLDivElement>) {
    if (!dataTransferHasImportFiles(event.dataTransfer)) return;
    event.preventDefault();
    setIsImportDropActive(true);
  }

  function handleImportDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setIsImportDropActive(false);
  }

  function handleImportDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!dataTransferHasImportFiles(event.dataTransfer)) return;
    event.preventDefault();
    setIsImportDropActive(false);
    if (state === "processing" || autoAssignInFlightRef.current) {
      setErrorMessage("Import is disabled while the queue or TIDAL URL assignment is running.");
      setState("error");
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    const jsonFiles = files.filter(isJsonImportFile);
    const imageFiles = files.filter(isImageImportFile);
    const ignoredCount = files.length - jsonFiles.length - imageFiles.length;

    if (jsonFiles[0]) void handleJsonImport(jsonFiles[0]);
    if (imageFiles.length > 0) {
      setActiveTab("ocr");
      setDroppedOcrFiles({ id: makeId(), files: imageFiles });
    }
    if (!jsonFiles[0] && imageFiles.length === 0) {
      setErrorMessage("Drop a songs JSON file or one or more image files.");
      setState("error");
      return;
    }
    if (ignoredCount > 0) {
      setCompletionNotice(`${ignoredCount} unsupported dropped file${ignoredCount === 1 ? "" : "s"} ignored.`);
    }
  }

  function restoreTidalState() {
    if (restoredRef.current || typeof window === "undefined") return;
    restoredRef.current = true;
    try {
      const stored = readPersistedTidalState();
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        queue?: unknown;
        profile?: unknown;
        polishOptions?: unknown;
        coverImageName?: unknown;
        useSoulseekFallback?: unknown;
        libraryPath?: unknown;
        filenameTemplate?: unknown;
        postQueueAction?: unknown;
        humanDelays?: unknown;
        longPauses?: unknown;
        rateLimit?: unknown;
        isPaused?: unknown;
        errorLog?: unknown;
        lastProcessedItemId?: unknown;
        queueSort?: unknown;
        downloadHistory?: unknown;
        queuePresets?: unknown;
        autoSkipDownloaded?: unknown;
      };
      const hasAdvancedEnhancementPreference = safeGetLocalStorageItem(ADVANCED_AUDIO_ENHANCEMENTS_STORAGE_KEY) !== null;
      if (isExportProfile(parsed.profile)) setExportProfile(parsed.profile);
      if (typeof parsed.coverImageName === "string") setCoverImageName(parsed.coverImageName);
      if (typeof parsed.useSoulseekFallback === "boolean") setUseSoulseekFallback(parsed.useSoulseekFallback);
      if (typeof parsed.libraryPath === "string") setLibraryPath(parsed.libraryPath);
      if (typeof parsed.filenameTemplate === "string" && parsed.filenameTemplate.trim()) setFilenameTemplate(parsed.filenameTemplate);
      if (isPostQueueAction(parsed.postQueueAction)) setPostQueueAction(parsed.postQueueAction);
      if (isRateLimitSettings(parsed.rateLimit)) setRateLimit(clampRateLimitSettings(parsed.rateLimit));
      else if (typeof parsed.humanDelays === "boolean" || typeof parsed.longPauses === "boolean") {
        setRateLimit((current) => ({
          ...current,
          delaySeconds: parsed.humanDelays === false ? 30 : current.delaySeconds,
          longPauseMinutes: parsed.longPauses === false ? 1 : current.longPauseMinutes,
        }));
      }
      if (typeof parsed.isPaused === "boolean") {
        setIsPaused(parsed.isPaused);
        pauseRequestedRef.current = parsed.isPaused;
      }
      if (Array.isArray(parsed.errorLog)) setErrorLog(parsed.errorLog.map(restoreErrorLogEntry).filter((entry): entry is ErrorLogEntry => Boolean(entry)).slice(0, MAX_ERROR_LOG_ENTRIES));
      if (typeof parsed.lastProcessedItemId === "string") setLastProcessedItemId(parsed.lastProcessedItemId);
      if (isQueueSortSettings(parsed.queueSort)) setQueueSort(parsed.queueSort);
      if (Array.isArray(parsed.downloadHistory)) setDownloadHistory(parsed.downloadHistory.map(restoreDownloadHistoryEntry).filter((entry): entry is DownloadHistoryEntry => Boolean(entry)).slice(0, MAX_DOWNLOAD_HISTORY));
      if (Array.isArray(parsed.queuePresets)) setQueuePresets(parsed.queuePresets.map(restoreQueuePreset).filter((entry): entry is QueuePreset => Boolean(entry)).slice(0, MAX_QUEUE_PRESETS));
      if (typeof parsed.autoSkipDownloaded === "boolean") setAutoSkipDownloaded(parsed.autoSkipDownloaded);
      if (Array.isArray(parsed.queue)) {
        const restored = parsed.queue.map(restoreQueueItem).filter((item): item is QueueItem => Boolean(item));
        setQueue(restored);
        if (restored.length > 0) setState("idle");
      }
      if (parsed.polishOptions && typeof parsed.polishOptions === "object") {
        setPolishOptions((current) => ({
          ...current,
          ...normalizeRestoredPolishOptions(parsed.polishOptions as Partial<PolishOptions>, hasAdvancedEnhancementPreference),
        }));
      }
    } catch {
      safeRemoveLocalStorageItem(TIDAL_STORAGE_KEY);
      safeRemoveLocalStorageItem(TIDAL_STORAGE_TEMP_KEY);
    }
  }

  function addTIDALUrlToQueue() {
    if (state === "processing") return;
    const url = tidalUrl.trim();
    if (!isTIDALUrl(url)) {
      setTIDALUrlError("Enter a TIDAL track, album, or playlist URL.");
      setErrorMessage("Enter a TIDAL track, album, or playlist URL.");
      setState("error");
      return;
    }
    const item: QueueItem = {
      id: makeId(),
      url,
      artist: "Resolving...",
      title: titleFromTIDALUrl(url),
      priority: "medium" as const,
      status: "pending",
      progress: 0,
      isPlaylist: isAlbumOrPlaylist(url),
      source: "tidal",
      addedAtIso: new Date().toISOString(),
    };
    setQueue((current) => mergeQueueItems(current, markQueueItemsWithLibrary([item], libraryTracks, downloadedUrlSet)));
    setTIDALUrl("");
    setTIDALUrlError("");
    setState("idle");
    setErrorMessage("");
    setLastExportName("");
  }

  async function pasteTIDALUrlFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setTIDALUrl(text.trim());
      setTIDALUrlError("");
    } catch {
      setTIDALUrlError("Clipboard access was blocked by the browser.");
    }
  }

  const handleJsonImport = useCallback(async (file: File | null) => {
  if (!file || state === "processing") return;
  setErrorMessage("");
  try {
    const text = await file.text();
    // Create worker
    const worker = new Worker(new URL('@/workers/importWorker', import.meta.url));
    worker.postMessage({ text });

    worker.onmessage = (e) => {
      if (e.data.success) {
        const { songs, invalidItems, skippedCount } = e.data;
        // Instead of setting all at once, we'll chunk the update
        setImportedSongs([]); // reset first
        const batchSize = 100;
        let index = 0;
        const processBatch = () => {
          const batch = songs.slice(index, index + batchSize);
          setImportedSongs(prev => [...prev, ...batch]);
          index += batchSize;
          if (index < songs.length) {
            requestIdleCallback(processBatch);
          } else {
            // all songs loaded – open modal
            setImportReport({
              parsedCount: songs.length,
              invalidCount: invalidItems.length,
              skippedCount,
              firstInvalidReason: invalidItems[0],
              invalidItems,
              filename: file.name,
            });
            setShowSkippedImportRows(false);
            startTransition(() => setShowReviewModal(true));
          }
        };
        requestIdleCallback(processBatch);
        worker.terminate();
      } else {
        setState("error");
        setErrorMessage(e.data.error || "Import failed");
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      setState("error");
      setErrorMessage(`Worker error: ${err.message}`);
      worker.terminate();
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import this JSON file.";
    setState("error");
    setErrorMessage(message);
  }
}, [state]);

  function handleCancelImportedSongs() {
    setShowReviewModal(false);
    setImportedSongs([]);
  }

  async function handleConfirmImportedSongs(selectedSongs: ReviewedSongMatch[], source: "json" | "ocr" = "json") {
    if (autoAssignInFlightRef.current) {
      setAutoAssignMessage("TIDAL URL assignment is already running. Please wait for it to finish.");
      return;
    }

    const shouldAutoAssign = diagnostics?.searchAvailable !== false;
    const now = new Date().toISOString();
    const importedItems: QueueItem[] = selectedSongs.map((song) => ({
      id: makeId(),
      artist: song.artist.trim(),
      title: song.songName.trim(),
      album: song.album?.trim() || undefined,
      year: typeof song.releaseYear === "number" ? String(song.releaseYear) : undefined,
      durationSec: song.durationSec > 0 ? song.durationSec : undefined,
      coverArt: song.albumArtUrl?.trim() || null,
      priority: "medium" as const,
      status: shouldAutoAssign ? "searching" as const : "pending" as const,
      progress: shouldAutoAssign ? 1 : 0,
      progressMessage: shouldAutoAssign ? "Queued for TIDAL URL search" : "TIDAL URL search unavailable",
      errorMsg: shouldAutoAssign ? undefined : "No TIDAL URL - will be skipped until you add one.",
      source,
      addedAtIso: now,
    })).filter((item) => item.title?.trim() || item.artist?.trim());

    if (importedItems.length === 0) return;
    setQueue((current) => mergeQueueItems(current, importedItems));
    setImportReport((current) => current ? { ...current, parsedCount: importedItems.length } : current);
    setState("idle");
    setErrorMessage("");
    setShowReviewModal(false);
    setImportedSongs([]);
    if (shouldAutoAssign) void assignTidalUrls(importedItems);
  }

  async function sendOcrSongsToDownloader(songs: BatchSong[], options?: { switchToDownloader?: boolean }): Promise<number> {
    if (songs.length === 0) return 0;
    if (autoAssignInFlightRef.current) {
      setAutoAssignMessage("TIDAL URL assignment is already running. Please wait for it to finish.");
      return 0;
    }
    await handleConfirmImportedSongs(songs.map(songMatchFromBatchSong), "ocr");
    if (options?.switchToDownloader) setActiveTab("downloader");
    return songs.length;
  }

  const MIN_TIDAL_SIMILARITY = 0.65;

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

  // Replaces the old Jaccard-based stringSimilarity
  function stringSimilarity(a: string, b: string): number {
    const s1 = a.toLowerCase().trim();
    const s2 = b.toLowerCase().trim();
    if (!s1 || !s2) return 0;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1;
    return 1 - levenshteinDistance(s1, s2) / maxLen;
  }

  const BG_TO_LATIN: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e",
  "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l",
  "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s",
  "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch",
  "ш": "sh", "щ": "sht", "ъ": "a", "ь": "y", "ю": "yu", "я": "ya",
  "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Е": "E",
  "Ж": "Zh", "З": "Z", "И": "I", "Й": "Y", "К": "K", "Л": "L",
  "М": "M", "Н": "N", "О": "O", "П": "P", "Р": "R", "С": "S",
  "Т": "T", "У": "U", "Ф": "F", "Х": "H", "Ц": "Ts", "Ч": "Ch",
  "Ш": "Sh", "Щ": "Sht", "Ъ": "A", "Ь": "Y", "Ю": "Yu", "Я": "Ya",
};

function transliterateBg(text: string): string {
  return text.split("").map((char) => BG_TO_LATIN[char] ?? char).join("");
}

function levenshteinDistanceStandalone(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function stringSimilarityStandalone(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (!s1 || !s2) return 0;
  const maxLen = Math.max(s1.length, s2.length);
  return maxLen === 0 ? 1 : 1 - levenshteinDistanceStandalone(s1, s2) / maxLen;
}

const BG_TO_LATIN_STANDALONE: Record<string, string> = {
  "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sht","ъ":"a","ь":"y","ю":"yu","я":"ya",
  "А":"A","Б":"B","В":"V","Г":"G","Д":"D","Е":"E","Ж":"Zh","З":"Z","И":"I","Й":"Y","К":"K","Л":"L","М":"M","Н":"N","О":"O","П":"P","Р":"R","С":"S","Т":"T","У":"U","Ф":"F","Х":"H","Ц":"Ts","Ч":"Ch","Ш":"Sh","Щ":"Sht","Ъ":"A","Ь":"Y","Ю":"Yu","Я":"Ya",
};

function transliterateBgStandalone(text: string): string {
  return text.split("").map((char) => BG_TO_LATIN_STANDALONE[char] ?? char).join("");
}

const ARTIST_ALIASES: Record<string, string[]> = {
  "2pac": ["tupac", "tupac shakur", "makaveli"],
  "tupac": ["2pac", "tupac shakur", "makaveli"],
  "eminem": ["marshall mathers", "slim shady"],
  "bbno$": ["bbno", "baby no money"],
  // add more as you hit them
};

function artistMatchesWithAlias(a: string, b: string): number {
  const direct = stringSimilarityStandalone(a, b);
  if (direct >= ARTIST_FLOOR) return direct;
  const aKey = a.toLowerCase().trim();
  const bKey = b.toLowerCase().trim();
  const aAliases = ARTIST_ALIASES[aKey] ?? [];
  const bAliases = ARTIST_ALIASES[bKey] ?? [];
  if (aAliases.includes(bKey) || bAliases.includes(aKey)) return 1;
  // check partial containment (handles "2Pac" vs "2Pac, Dr. Dre" collabs)
  if (aKey.length > 2 && bKey.includes(aKey)) return 0.7;
  if (bKey.length > 2 && aKey.includes(bKey)) return 0.7;
  return direct;
}

const EARLY_EXIT_CONFIDENCE = 0.5;
const MIN_ACCEPT_CONFIDENCE = 0.3;
const ARTIST_FLOOR = 0.2;
const negativeSearchCache = new Map<string, number>();
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;

type TidalMatchResult = { url: string; title: string; artist: string; album?: string; confidence: number; strategy: string };

class TidalTokenExpiredError extends Error {
  constructor() {
    super("TIDAL token expired during search cascade.");
    this.name = "TidalTokenExpiredError";
  }
}
type SearchDebugEntry = { ts: string; artist?: string; title?: string; outcome: string; confidence?: number; strategy?: string; ms: number };
let searchDebugLogGlobal: SearchDebugEntry[] = [];

function logSearchDebug(entry: SearchDebugEntry) {
  searchDebugLogGlobal = [entry, ...searchDebugLogGlobal].slice(0, 300);
}

function normalizeSearchTextStandalone(value: string | undefined): string {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isTruncatedPrefixTitle(candidateTitle: string, requestedTitle: string): boolean {
  const c = normalizeSearchTextStandalone(candidateTitle);
  const r = normalizeSearchTextStandalone(requestedTitle);
  return r.length >= 12 && r.length <= 28 && c.startsWith(r) && c.length > r.length;
}

async function verifyTidalTrackUrl(
  url: string,
  expected: { title?: string; artist?: string; durationSec?: number },
  signal?: AbortSignal
): Promise<boolean> {
  try {
    const params = new URLSearchParams({ action: "trackinfo", url });
    const response = await fetch(`${TIDAL_ENDPOINT}?${params.toString()}`, { cache: "no-store", signal });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null) as {
      metadata?: { title?: string; artist?: string; durationSec?: number };
    } | null;
    if (!payload?.metadata) return false;

    const { title, artist, durationSec } = payload.metadata;
    const titleOk = !expected.title || stringSimilarityStandalone(title ?? "", expected.title) > 0.85;
    const artistOk = !expected.artist || stringSimilarityStandalone((artist ?? "").toLowerCase(), expected.artist.toLowerCase()) > 0.75;
    const durationOk = !expected.durationSec || !durationSec || Math.abs(durationSec - expected.durationSec) <= 5;

    return titleOk && artistOk && durationOk;
  } catch {
    return false;
  }
}

async function findBestTidalMatch(
  item: Pick<QueueItem, "artist" | "title" | "album" | "durationSec" | "url">,
  verify: (url: string, expected: { title?: string; artist?: string; durationSec?: number }, signal?: AbortSignal) => Promise<boolean>,
  signal?: AbortSignal,
): Promise<TidalMatchResult | null> {
  const startedAt = Date.now();
  const rawArtist = item.artist?.trim() ?? "";
  const rawTitle = item.title?.trim() ?? "";
  if (!rawArtist && !rawTitle) return null;

  const cacheKey = normalizeTrackKey(rawTitle, rawArtist);
  const lastMiss = negativeSearchCache.get(cacheKey);
  if (lastMiss && Date.now() - lastMiss < NEGATIVE_CACHE_TTL_MS) {
    logSearchDebug({ ts: new Date().toISOString(), artist: rawArtist, title: rawTitle, outcome: "skipped-negative-cache", ms: 0 });
    return null;
  }

  // Single search call with throttling + retry
  const result = await throttledSearch(`${rawArtist} ${rawTitle}`, {
    artist: rawArtist,
    title: rawTitle,
    duration: item.durationSec,
    signal,
  });

  // --- DEBUG LOG ---
  console.log("[FIND BEST] Candidates received:", result.candidates?.length || 0);
  if (result.candidates?.length) {
    console.log("[FIND BEST] First candidate:", {
      title: result.candidates[0].title,
      artist: result.candidates[0].artist,
      duration: result.candidates[0].duration,
    });
  }
  // --- END DEBUG ---

  if (result.status === 429) {
    // Already retried, give up
    logSearchDebug({ ts: new Date().toISOString(), artist: rawArtist, title: rawTitle, outcome: "rate-limit-exhausted", ms: Date.now() - startedAt });
    return null;
  }

  if (result.status === 401) {
    throw new TidalTokenExpiredError();
  }

  const candidates = result.candidates ?? [];
  let best: TidalMatchResult | null = null;

  for (const candidate of candidates) {
    const titleSim = Math.max(
      stringSimilarityStandalone(rawTitle, candidate.title),
      isTruncatedPrefixTitle(candidate.title, rawTitle) ? 0.9 : 0,
    );
    const artistSim = artistMatchesWithAlias(rawArtist, candidate.artist);

    console.log("[FIND BEST] Similarity:", {
      artistSim,
      titleSim,
      candidateTitle: candidate.title,
      requestedTitle: rawTitle,
      accepted: artistSim >= 0.2 && titleSim >= 0.4,
    });

    if (artistSim < 0.2 && titleSim < 0.4) continue;
    let confidence = titleSim * 0.6 + artistSim * 0.4;
    if (typeof item.durationSec === "number" && typeof candidate.duration === "number" && Math.abs(candidate.duration - item.durationSec) <= 5) {
      confidence = Math.min(1, confidence + 0.05);
    }
    if (!best || confidence > best.confidence) {
      best = { url: candidate.url, title: candidate.title, artist: candidate.artist, album: candidate.album, confidence, strategy: `${rawArtist} :: ${rawTitle}` };
    }
    if (best && best.confidence >= EARLY_EXIT_CONFIDENCE) {
      logSearchDebug({ ts: new Date().toISOString(), artist: rawArtist, title: rawTitle, outcome: "early-exit", confidence: best.confidence, strategy: best.strategy, ms: Date.now() - startedAt });
      return best;
    }
  }

  if (best && best.confidence >= MIN_ACCEPT_CONFIDENCE) {
    const verified = await verify(best.url, { title: rawTitle, artist: rawArtist, durationSec: item.durationSec }, signal).catch(() => false);
    if (verified) {
      logSearchDebug({ ts: new Date().toISOString(), artist: rawArtist, title: rawTitle, outcome: "accepted-after-verify", confidence: best.confidence, strategy: best.strategy, ms: Date.now() - startedAt });
      return best;
    }
    logSearchDebug({ ts: new Date().toISOString(), artist: rawArtist, title: rawTitle, outcome: "rejected-failed-verify", confidence: best.confidence, ms: Date.now() - startedAt });
  }

  if (!best) {
    negativeSearchCache.set(cacheKey, Date.now());
  }
  logSearchDebug({ ts: new Date().toISOString(), artist: rawArtist, title: rawTitle, outcome: "no-confident-match", confidence: best?.confidence, ms: Date.now() - startedAt });
  return null;
}

async function assignTidalUrls(items: QueueItem[], options: { mode?: "import" | "research" } = {}): Promise<void> {
  if (autoAssignInFlightRef.current) {
    setAutoAssignMessage("TIDAL URL assignment is already running. Please wait for it to finish.");
    return;
  }

  // ----- Strip common metadata noise before comparison -----
  const cleanForSimilarity = (text: string): string => {
    return text
      .replace(/\s*\[(official|lyrics?|audio|video|visualizer|hd|hq|explicit|clean|instrumental|edit|remix|live|acoustic|version|deluxe|bonus|single|album|track|music video)\]\s*/gi, " ")
      .replace(/\s*\((official|lyrics?|audio|video|visualizer|hd|hq|explicit|clean|instrumental|edit|remix|live|acoustic|version|deluxe|bonus|single|album|track|music video|feat\.?\s*[^)]*|with\s*[^)]*|ft\.?\s*[^)]*|and\s*[^)]*|prod\.?\s*[^)]*|\([^)]*remix[^)]*\))\s*/gi, " ")
      .replace(/\s*-\s*(remix|live|acoustic|version|edit|deluxe|instrumental|clean|explicit)\s*/gi, " ")
      .replace(/\s*[\(\[]\s*(feat|ft|with|prod|remix|edit|version|acoustic|live|deluxe|bonus|single|edit|instrumental|official|video|audio|hd|hq)\s*[\)\]]/gi, " ")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .toLowerCase();
  };

  const MATCH_THRESHOLD = 0.6; // lowered from 0.7

  const isManualReSearch = options.mode === "research";
  const searchable = items.filter(isManualReSearch ? isTidalUrlReSearchCandidate : isAutoAssignableTidalUrlItem);
  if (searchable.length === 0) return;
  if (autoAssignMessageTimerRef.current !== null) {
    window.clearTimeout(autoAssignMessageTimerRef.current);
    autoAssignMessageTimerRef.current = null;
  }
  if (isBrowserOffline()) {
    setAutoAssignMessage("You appear to be offline. TIDAL URL assignment is saved and ready to retry when the network returns.");
    setQueue((current) =>
      current.map((entry) =>
        searchable.some((pending) => pending.id === entry.id) && entry.status === "searching"
          ? {
              ...entry,
              status: "pending",
              progress: 0,
              progressMessage: "Waiting for network",
              errorMsg: "Offline - retry URL assignment when the network returns.",
            }
          : entry
      )
    );
    return;
  }

  const controller = new AbortController();
  autoAssignAbortRef.current?.abort();
  autoAssignAbortRef.current = controller;
  autoAssignInFlightRef.current = true;
  setAutoAssigningUrls(true);
  let found = 0;
  let stoppedReason: "aborted" | "token" | "rate-limit" | null = null;
  const reusableUrlsByTrack = new Map<string, string>();
  const MAX_RATE_LIMIT_RETRIES = 5;
  const BASE_RETRY_DELAY_SECONDS = 60;

  for (const existing of queueRef.current) {
    const key = queueTrackKey(existing);
    if (key && existing.url && isTIDALUrl(existing.url)) reusableUrlsByTrack.set(key, existing.url);
  }

  function cleanForSimilarityStandalone(text: string): string {
    return text
      .replace(/\s*\[(official|lyrics?|audio|video|visualizer|hd|hq|explicit|clean|instrumental|edit|remix|live|acoustic|version|deluxe|bonus|single|album|track)\]\s*/gi, " ")
      .replace(/\s*\((official|lyrics?|audio|video|visualizer|hd|hq|explicit|clean|instrumental|edit|remix|live|acoustic|version|deluxe|bonus|single|album|track|feat\.?\s*[^)]*|with\s*[^)]*|ft\.?\s*[^)]*|and\s*[^)]*)\)\s*/gi, " ")
      .replace(/\s*-\s*(remix|live|acoustic|version|edit|deluxe|instrumental|clean|explicit)\s*/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .toLowerCase();
  }

  try {
    for (let index = 0; index < searchable.length; index += 1) {
      if (controller.signal.aborted) {
        stoppedReason = "aborted";
        break;
      }
      const item = searchable[index]!;
      try {
        const key = queueTrackKey(item);
        const reusableUrl = key ? reusableUrlsByTrack.get(key) : undefined;
        if (reusableUrl) {
          found += 1;
          updateQueueItem(item.id, {
            status: "pending",
            url: reusableUrl,
            errorMsg: undefined,
            progress: 100,
            progressMessage: "Reused TIDAL URL from queue",
            isPlaylist: false,
          });
          continue;
        }

        const rawArtist = item.artist?.trim() ?? "";
        const rawTitle = item.title?.trim() ?? "";
        const rawQuery = [rawArtist, rawTitle].filter(Boolean).join(" - ");
        const hasCyrillic = /[а-яА-Я]/.test(rawQuery);
        const query = hasCyrillic ? transliterateBg(rawQuery) : rawQuery;

        setAutoAssignMessage(`Searching TIDAL for song ${index + 1} of ${searchable.length}...`);
        updateQueueItem(item.id, {
          status: "searching",
          progress: Math.max(5, Math.round((index / searchable.length) * 100)),
          progressMessage: `Searching TIDAL for song ${index + 1} of ${searchable.length}...`,
          errorMsg: undefined,
        });

        let match: TidalMatchResult | null = null;
        try {
          match = await findBestTidalMatch(item, verifyTidalTrackUrl, controller.signal);
        } catch (matchError) {
          if (matchError instanceof TidalTokenExpiredError) {
            stoppedReason = "token";
            setTokenExpired(true);
            updateQueueItem(item.id, { status: "error", progress: 100, progressMessage: "Failed", errorMsg: "Token expired" });
            setQueue((current) =>
              current.map((entry) =>
                searchable.some((pending) => pending.id === entry.id) && entry.status === "searching"
                  ? { ...entry, status: "pending", progress: 0, progressMessage: "TIDAL search stopped - resume after login", errorMsg: entry.id === item.id ? entry.errorMsg : "TIDAL search stopped - resume after login" }
                  : entry
              )
            );
            setErrorMessage("TIDAL token expired. Please log in and resume the queue.");
            setState("error");
            void loadTidalDiagnostics();
            break;
          }
          throw matchError;
        }

        if (match) {
          found += 1;
          const libraryMatch = findLibraryTrackForUrl(match.url, libraryTracks, downloadedUrlSet);
          updateQueueItem(item.id, {
            status: "pending",
            url: match.url,
            alreadyDownloaded: Boolean(libraryMatch),
            libraryDownloadedAt: libraryMatch?.downloadedAt,
            libraryFilePath: libraryMatch?.filePath,
            errorMsg: undefined,
            progress: 100,
            progressMessage: `Auto-matched (${Math.round(match.confidence * 100)}%): ${match.artist} - ${match.title}`,
            tidalMatchTitle: match.title,
            tidalMatchArtist: match.artist,
            tidalMatchAlbum: match.album,
            tidalMatchConfidence: match.confidence,
            isPlaylist: false,
          });
          if (key) reusableUrlsByTrack.set(key, match.url);
        } else {
          updateQueueItem(item.id, {
            status: "skipped",
            progress: 100,
            errorMsg: "No confident match found after full search cascade",
            progressMessage: "No confident match found after full search cascade",
          });
        }
      } catch (err) {
        // Catch any unexpected error for this item and continue
        const msg = err instanceof Error ? err.message : "Unexpected error during TIDAL search";
        updateQueueItem(item.id, {
          status: "error",
          progress: 100,
          progressMessage: "Search error",
          errorMsg: msg,
        });
        recordLastError(item, msg, err);
        // Continue to next item
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      stoppedReason = "aborted";
    } else {
      const message = error instanceof Error ? error.message : "TIDAL URL assignment failed.";
      setErrorMessage(message);
      setState("error");
      setQueue((current) =>
        current.map((entry) =>
          entry.status === "searching"
            ? {
                ...entry,
                status: "pending",
                progress: 0,
                progressMessage: "TIDAL search interrupted - ready to retry",
                errorMsg: "TIDAL search interrupted - ready to retry",
              }
            : entry
        )
      );
    }
  } finally {
    if (autoAssignAbortRef.current === controller) autoAssignAbortRef.current = null;
    autoAssignInFlightRef.current = false;
    setAutoAssigningUrls(false);
  }

  if (stoppedReason === "aborted") {
    setQueue((current) =>
      current.map((entry) =>
        searchable.some((pending) => pending.id === entry.id) && entry.status === "searching"
          ? {
              ...entry,
              status: "pending",
              progress: 0,
              progressMessage: "TIDAL search stopped - ready to retry",
              errorMsg: "TIDAL search stopped - ready to retry",
            }
          : entry
      )
    );
  }

  const missing = Math.max(0, searchable.length - found);
  const summary = `Found URLs for ${found} songs, ${missing} songs still missing.`;
  setAutoAssignMessage(
    stoppedReason === "aborted"
      ? `Search stopped. ${summary}`
      : stoppedReason === "token"
        ? `TIDAL login required. ${summary}`
        : stoppedReason === "rate-limit"
          ? `TIDAL rate limit reached after retries. ${summary}`
          : summary
  );

  if (autoAssignMessageTimerRef.current !== null) {
    window.clearTimeout(autoAssignMessageTimerRef.current);
  }
  autoAssignMessageTimerRef.current = window.setTimeout(() => {
    setAutoAssignMessage("");
    autoAssignMessageTimerRef.current = null;
  }, 6000);
}

  function reSearchTidalUrls() {
    if (state === "processing") return;
    const candidates = queueRef.current.filter(isTidalUrlReSearchCandidate);
    if (candidates.length === 0) return;
    void assignTidalUrls(candidates, { mode: "research" });
  }

  async function waitWithCountdown(seconds: number, signal: AbortSignal, label: string): Promise<void> {
    const durationMs = Math.max(0, Math.round(seconds * 1000));
    if (durationMs <= 0) return;
    const endAt = Date.now() + durationMs;
    setCooldownLabel(label);
    setCooldownRemaining(formatDurationSeconds(Math.max(0, Math.ceil((endAt - Date.now()) / 1000))));
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let intervalId = 0;
      let timeoutId = 0;
      const cleanup = () => {
        window.clearInterval(intervalId);
        window.clearTimeout(timeoutId);
        signal.removeEventListener("abort", onAbort);
        setCooldownLabel("");
        setCooldownRemaining("");
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new DOMException("Export cancelled.", "AbortError"));
      };
      const tick = () => {
        if (skipDelayRef.current) {
          skipDelayRef.current = false;
          cleanup();
          setCooldownLabel("");
          setCooldownRemaining("");
          resolve();
          return;
        }
        const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        setCooldownRemaining(formatDurationSeconds(remaining));
        if (remaining <= 0) finish();
      };
      intervalId = window.setInterval(tick, 1000);
      timeoutId = window.setTimeout(finish, durationMs);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }

  async function waitWhilePaused(signal: AbortSignal): Promise<void> {
    if (!pauseRequestedRef.current) return;
    setCooldownLabel("Paused");
    setCooldownRemaining("Resume to continue");
    await new Promise<void>((resolve, reject) => {
      const tick = window.setInterval(() => {
        if (signal.aborted) {
          window.clearInterval(tick);
          reject(new DOMException("Export cancelled.", "AbortError"));
          return;
        }
        if (!pauseRequestedRef.current) {
          window.clearInterval(tick);
          setCooldownLabel("");
          setCooldownRemaining("");
          resolve();
        }
      }, 500);
    });
  }

  function togglePause() {
    const next = !pauseRequestedRef.current;
    pauseRequestedRef.current = next;
    setIsPaused(next);
    if (!next) {
      setCooldownLabel("");
      setCooldownRemaining("");
    }
  }

  function skipCurrentItem() {
    if (!currentProcessingId) return;
    skipRequestedRef.current = true;
    currentItemAbortRef.current?.abort();
  }

  async function processQueue(autoExport: boolean, options?: { resume?: boolean }) {
    if (queue.length === 0 || state === "processing" || isProcessingRef.current) return;
    if (autoAssignInFlightRef.current) {
      setAutoAssignMessage("TIDAL URL assignment is still running. Queue processing will be available when it finishes.");
      return;
    }
    if (isBrowserOffline()) {
      setState("error");
      setErrorMessage("You appear to be offline. Queue progress is saved; reconnect before starting TIDAL downloads.");
      return;
    }
    const plannedDownloads = queue.filter((item) => item.url && !(item.status === "done" && item.zipBlob) && (item.status !== "skipped" || item.forceDownload)).length;
    if (plannedDownloads > LARGE_BATCH_DIRECTORY_THRESHOLD && !downloadDirectoryHandleRef.current) {
      setState("error");
      setErrorMessage(`Choose a download folder before starting this ${plannedDownloads}-song batch. Large batches cannot safely rely on browser downloads or retain every ZIP in memory.`);
      return;
    }
    if (diagnostics?.temp?.lowDiskSpace) {
      setState("error");
      setErrorMessage("Low disk space. Please free up at least 1 GB in the temporary directory and resume.");
      return;
    }
    if (!acquireQueueProcessorLease(processorLeaseOwnerRef.current)) {
      setState("error");
      setErrorMessage("Another /download-4 tab is already processing a batch. Close it or wait for its lease to expire, then resume.");
      return;
    }
    isProcessingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    processorLeaseHeartbeatRef.current = window.setInterval(() => {
      if (renewQueueProcessorLease(processorLeaseOwnerRef.current)) return;
      setErrorMessage("Batch paused because another tab took the processing lease. Close the other tab and resume.");
      controller.abort();
    }, QUEUE_PROCESSOR_LEASE_HEARTBEAT_MS);
    wakeLockRef.current = await requestScreenWakeLock();
    let activeLibraryTracks = libraryTracks;
    let activeDownloadedUrlSet = downloadedUrlSet;
    try {
      const freshTracks = await readSmartLibraryTracks();
      activeLibraryTracks = freshTracks;
      activeDownloadedUrlSet = setFromLibraryTracks(freshTracks);
      persistDownloadedUrlSet(activeDownloadedUrlSet);
      setLibraryTracks(freshTracks);
      setDownloadedUrlSet(activeDownloadedUrlSet);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Could not refresh Turrex Smart Library before processing.");
    }
    const queueForProcessing = markQueueItemsWithLibrary(queue, activeLibraryTracks, activeDownloadedUrlSet);
    if (queueForProcessing !== queue) setQueue(queueForProcessing);
    setState("processing");
    setErrorMessage("");
    setTokenExpired(false);
    setLastExportName("");
    setCompletionNotice("");
    skipRequestedRef.current = false;
    pauseRequestedRef.current = options?.resume ? false : isPaused;
    if (options?.resume) setIsPaused(false);
    const runnableTotal = queueForProcessing.filter((item) => item.url && !(item.status === "done" && item.zipBlob) && (item.status !== "skipped" || item.forceDownload)).length;
    setSessionStats({ startedAt: Date.now(), completed: 0, total: runnableTotal, durations: [] });

    let coverArt: string | undefined;
    const processed: QueueItem[] = [];
    const processedById = new Map<string, QueueItem>();
    const orderedQueue = queueForProcessing
      .map((item, order) => ({ item, order }))
      .sort((a, b) => priorityRank(a.item.priority) - priorityRank(b.item.priority) || a.order - b.order)
      .map(({ item }) => item);
    let successfulSinceLongPause = 0;
    let delayMultiplier = adaptiveCooldown.multiplier;
    let adaptiveSongsRemaining = adaptiveCooldown.songsRemaining;
    let stoppedForFatal = false;
    let fatalQueueMessage = "";
    let consecutiveFailureKind: QueueFailureKind | null = null;
    let consecutiveFailureCount = 0;
    const hasMoreWorkAfter = (currentIndex: number) => orderedQueue.slice(currentIndex + 1).some((next) => (
      Boolean(next.url) && !(next.status === "done" && next.zipBlob) && (next.status !== "skipped" || next.forceDownload)
    ));
    const waitAfterQueueItem = async (currentIndex: number, options?: { errorPenalty?: boolean; longPause?: boolean }) => {
      if (!hasMoreWorkAfter(currentIndex)) return;
      if (options?.longPause && successfulSinceLongPause > 0 && successfulSinceLongPause % rateLimit.songsBeforeLongPause === 0) {
        await waitWithCountdown(schedulerDelayWithJitter(rateLimit.longPauseMinutes * 60), controller.signal, "Long batch pause");
      }
      const baseDelay = Math.max(MIN_SCHEDULER_DELAY_SECONDS, Math.round(rateLimit.delaySeconds * delayMultiplier));
      const delaySeconds = options?.errorPenalty ? baseDelay * 2 : baseDelay;
      await waitWithCountdown(schedulerDelayWithJitter(delaySeconds), controller.signal, options?.errorPenalty ? "Error penalty delay" : delayMultiplier > 1 ? "Adaptive cooldown delay" : "Delay between songs");
    };
    try {
      coverArt = coverImage ? await fileToDataUrl(coverImage) : undefined;
      for (let index = 0; index < orderedQueue.length; index += 1) {
        const item = orderedQueue[index]!;
        if (controller.signal.aborted) throw new DOMException("Export cancelled.", "AbortError");
        await waitWhilePaused(controller.signal);
        if (!item.url) {
          const errorMsg = "No TIDAL URL - will be skipped.";
          const skipped = { ...item, status: "skipped" as const, progress: 100, progressMessage: "Skipped", errorMsg };
          processed.push(skipped);
          processedById.set(item.id, skipped);
          updateQueueItem(item.id, skipped);
          setLastProcessedItemId(item.id);
          continue;
        }
        const libraryMatch = findLibraryTrackForUrl(item.url, activeLibraryTracks, activeDownloadedUrlSet);
        if ((item.alreadyDownloaded || libraryMatch) && autoSkipDownloaded && !item.forceDownload) {
          const skipped = {
            ...item,
            alreadyDownloaded: true,
            libraryDownloadedAt: item.libraryDownloadedAt ?? libraryMatch?.downloadedAt,
            libraryFilePath: item.libraryFilePath ?? libraryMatch?.filePath,
            status: "skipped" as const,
            progress: 100,
            progressMessage: "Already downloaded",
            errorMsg: "Skipped by Turrex Smart Library.",
          };
          processed.push(skipped);
          processedById.set(item.id, skipped);
          updateQueueItem(item.id, skipped);
          setLastProcessedItemId(item.id);
          setSessionStats((current) => ({ ...current, completed: Math.min(current.total, current.completed + 1) }));
          continue; // no waitAfterQueueItem — no network call happened, nothing to rate-limit
        }
        if (item.status === "skipped" && !item.forceDownload) {
          processed.push(item);
          processedById.set(item.id, item);
          continue;
        }
        if (item.status === "done" && item.zipBlob) {
          processed.push(item);
          processedById.set(item.id, item);
          continue;
        }

        const itemStartedAt = Date.now();
        const itemController = new AbortController();
        currentItemAbortRef.current = itemController;
        setCurrentProcessingId(item.id);
        const abortItem = () => itemController.abort();
        controller.signal.addEventListener("abort", abortItem, { once: true });
        updateQueueItem(item.id, { status: "processing", errorMsg: undefined, progress: 5, progressMessage: "Starting TIDAL..." });
        try {
          let rateLimitRetries = 0;
          let transientRetries = 0;
          let result: DownloadWithProgressResult | null = null;
          while (!result) {
            try {
              const itemCoverArt = await coverArtForQueueItem(item, coverArt);
              result = await downloadWithProgress({
                url: item.url,
                profile: exportProfile,
                preview: false,
                coverArt: itemCoverArt ?? coverArt,
                tracks: item.artist || item.title ? [{
                  artist: item.artist ?? "",
                  title: item.title ?? titleFromTIDALUrl(item.url),
                  album: item.album,
                  year: item.year,
                  genre: item.genre,
                  coverArt: itemCoverArt,
                  url: item.url,
                }] : undefined,
                enhancements: enhancementsPayload(polishOptions, showAdvancedAudioEnhancements),
                useSoulseekFallback,
                libraryPath,
                metadataOverride: metadataOverrideFromQueueItem(item),
                force: item.forceDownload,
                filenameTemplate,
                postAction: postQueueAction === "openFolder" ? "openFolder" : postQueueAction === "notify" ? "notify" : undefined,
                signal: itemController.signal,
                onProgress: (event) => updateQueueItem(item.id, { progress: event.progress, progressMessage: event.message }),
              });
            } catch (error) {
              if (skipRequestedRef.current && error instanceof DOMException && error.name === "AbortError") throw error;
              if (controller.signal.aborted) throw error;
              const retryAfter = retryAfterFromUnknown(error);
              if (retryAfter && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
                rateLimitRetries += 1;
                if (rateLimit.adaptiveCooldown) {
                  delayMultiplier = Math.min(8, Math.max(2, delayMultiplier * 2));
                  adaptiveSongsRemaining = 5;
                  setAdaptiveCooldown({ multiplier: delayMultiplier, songsRemaining: adaptiveSongsRemaining });
                }
                updateQueueItem(item.id, {
                  progress: 100,
                  progressMessage: `Rate limited. Retrying after ${formatDurationSeconds(retryAfter)}...`,
                });
                await waitWithCountdown(retryAfter, controller.signal, `429 cooldown retry ${rateLimitRetries}`);
                updateQueueItem(item.id, { progress: 5, progressMessage: `Retrying TIDAL (${rateLimitRetries + 1}/${MAX_RATE_LIMIT_RETRIES + 1})...` });
                continue;
              }
              if (isTransientDownloadError(error) && transientRetries < rateLimit.maxTransientRetries) {
                transientRetries += 1;
                const backoffSeconds = transientRetryDelaySeconds(rateLimit, transientRetries);
                updateQueueItem(item.id, {
                  progress: 100,
                  progressMessage: `Transient failure. Retrying after ${formatDurationSeconds(backoffSeconds)}...`,
                });
                await waitWithCountdown(backoffSeconds, controller.signal, `Transient retry ${transientRetries}`);
                updateQueueItem(item.id, { progress: 5, progressMessage: `Retrying TIDAL (${transientRetries + 1}/${rateLimit.maxTransientRetries + 1})...` });
                continue;
              }
              const fatal = fatalQueueErrorFromUnknown(error);
              if (fatal?.kind === "token") {
                updateQueueItem(item.id, { progressMessage: "Token expired - retrying once..." });
                await wait(2000, controller.signal);
                try {
                  const itemCoverArt = await coverArtForQueueItem(item, coverArt);
                  result = await downloadWithProgress({
                    url: item.url,
                    profile: exportProfile,
                    preview: false,
                    coverArt: itemCoverArt ?? coverArt,
                    tracks: item.artist || item.title ? [{
                      artist: item.artist ?? "",
                      title: item.title ?? titleFromTIDALUrl(item.url),
                      album: item.album,
                      year: item.year,
                      genre: item.genre,
                      coverArt: itemCoverArt,
                      url: item.url,
                    }] : undefined,
                    enhancements: enhancementsPayload(polishOptions, showAdvancedAudioEnhancements),
                    useSoulseekFallback,
                    libraryPath,
                    metadataOverride: metadataOverrideFromQueueItem(item),
                    force: item.forceDownload,
                    filenameTemplate,
                    postAction: postQueueAction === "openFolder" ? "openFolder" : postQueueAction === "notify" ? "notify" : undefined,
                    signal: itemController.signal,
                    onProgress: (event) => updateQueueItem(item.id, { progress: event.progress, progressMessage: event.message }),
                  });
                } catch (retryError) {
                  if (fatalQueueErrorFromUnknown(retryError)?.kind === "token") {
                    const retryItemError = "Token expired - please log in and resume.";
                    setTokenExpired(true);
                    recordLastError(item, "Token expired after retry", retryError);
                    const errorItem = { ...item, status: "error" as const, progress: 100, progressMessage: "Failed", errorMsg: retryItemError };
                    processed.push(errorItem);
                    processedById.set(item.id, errorItem);
                    updateQueueItem(item.id, errorItem);
                    setLastProcessedItemId(item.id);
                    setSessionStats((current) => ({
                      ...current,
                      completed: Math.min(current.total, current.completed + 1),
                      durations: [...current.durations.slice(-49), Math.max(1, Math.round((Date.now() - itemStartedAt) / 1000))],
                    }));
                    pauseRequestedRef.current = true;
                    setIsPaused(true);
                    flushPersistedState();
                    stoppedForFatal = true;
                    fatalQueueMessage = "TIDAL token expired. Please log in and click Resume.";
                    break;
                  }
                  throw retryError;
                }
                continue;
              }
              throw error;
            }
          }
          if (stoppedForFatal) break;
          if (!result) throw new Error("TIDAL download failed.");
          if (result.skipped) {
            const skippedItem = {
              ...item,
              status: "skipped" as const,
              progress: 100,
              progressMessage: "Duplicate",
              errorMsg: "Skipped duplicate library item.",
              duplicateExistingFile: result.existingFile,
            };
            processed.push(skippedItem);
            processedById.set(item.id, skippedItem);
            updateQueueItem(item.id, skippedItem);
            setLastProcessedItemId(item.id);
            setSessionStats((current) => ({ ...current, completed: Math.min(current.total, current.completed + 1) }));
            consecutiveFailureKind = null;
            consecutiveFailureCount = 0;
            await waitAfterQueueItem(index);
            continue;
          }
          const savedFileName = queueItemZipFileName(item);
          const saved = await saveTrackZipToDisk(result.blob, savedFileName, downloadDirectoryHandleRef.current);
          const zipStats = await statsFromZipBlob(result.blob);
          const libraryRecord = await recordQueueItemInSmartLibrary(item, result.blob, savedFileName, saved.filePath);
          if (libraryRecord) {
            activeLibraryTracks = mergeLibraryTrackRecords(activeLibraryTracks, libraryRecord);
            activeDownloadedUrlSet = setFromLibraryTracks(activeLibraryTracks);
          }
          const doneItem = {
            ...item,
            status: "done" as const,
            progress: 100,
            progressMessage: saved.savedToDirectory ? "ZIP saved to selected folder and recorded" : "ZIP sent to browser downloads and recorded",
            errorMsg: undefined,
            duplicateExistingFile: undefined,
            forceDownload: false,
            alreadyDownloaded: Boolean(libraryRecord),
            libraryDownloadedAt: libraryRecord?.downloadedAt,
            libraryFilePath: libraryRecord?.filePath,
            zipBlob: queueForProcessing.length <= MAX_IN_MEMORY_COMPLETED_ZIPS ? result.blob : undefined,
            zipFileName: savedFileName,
            zipByteLength: result.blob.size,
            durationSec: zipStats.durationSec,
            serverZipPath: result.zipPath,
            albumTracks: result.albumMeta?.length ? result.albumMeta : zipStats.tracks,
          };
          processed.push(doneItem);
          processedById.set(item.id, doneItem);
          updateQueueItem(item.id, doneItem);
          recordDownloadHistory([doneItem]);
          setLastProcessedItemId(item.id);
          setSessionStats((current) => ({
            ...current,
            completed: Math.min(current.total, current.completed + 1),
            durations: [...current.durations.slice(-49), Math.max(1, Math.round((Date.now() - itemStartedAt) / 1000))],
          }));
          successfulSinceLongPause += 1;
          consecutiveFailureKind = null;
          consecutiveFailureCount = 0;
          if (adaptiveSongsRemaining > 0) {
            adaptiveSongsRemaining -= 1;
            if (adaptiveSongsRemaining === 0) delayMultiplier = Math.max(1, delayMultiplier / 2);
            setAdaptiveCooldown({ multiplier: delayMultiplier, songsRemaining: adaptiveSongsRemaining });
          }
          await waitAfterQueueItem(index, { longPause: true });
        } catch (error) {
          if (skipRequestedRef.current && error instanceof DOMException && error.name === "AbortError") {
            skipRequestedRef.current = false;
            const skipped = { ...item, status: "skipped" as const, progress: 100, progressMessage: "Skipped", errorMsg: "Skipped by user." };
            processed.push(skipped);
            processedById.set(item.id, skipped);
            updateQueueItem(item.id, skipped);
            setLastProcessedItemId(item.id);
            setSessionStats((current) => ({ ...current, completed: Math.min(current.total, current.completed + 1) }));
            await waitAfterQueueItem(index);
            continue;
          }
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          const details = errorDetailsFromUnknown(error, "TIDAL download failed.");
          const errorBody = details.body && typeof details.body === "object" ? details.body as { code?: unknown } : {};
          if (errorBody.code === "TIDAL_URL_INVALID") {
            const retryCount = (item.invalidUrlRetryCount ?? 0) + 1;
            if (retryCount <= 2) {
              updateQueueItem(item.id, {
                status: "searching",
                url: undefined,
                tidalMatchConfidence: undefined,
                invalidUrlRetryCount: retryCount,
                progressMessage: `Dead URL - re-searching (attempt ${retryCount})...`,
                errorMsg: undefined,
              });
              const replacement = await findBestTidalMatch({ ...item, url: undefined }, verifyTidalTrackUrl, controller.signal);
              updateQueueItem(item.id, replacement
                ? { status: "pending", url: replacement.url, tidalMatchTitle: replacement.title, tidalMatchArtist: replacement.artist, tidalMatchConfidence: replacement.confidence, progressMessage: `Re-matched: ${replacement.artist} - ${replacement.title}` }
                : { status: "error", errorMsg: "Dead URL and no replacement match found." });
              setSessionStats((current) => ({ ...current, completed: Math.min(current.total, current.completed + 1) }));
              continue;
            }
          }
          const fatal = fatalQueueErrorFromUnknown(error);
          const itemErrorMessage = fatal?.kind === "token" ? "Token expired" : details.message;
          const errorItem = { ...item, status: "error" as const, progress: 100, progressMessage: "Failed", errorMsg: itemErrorMessage };
          processed.push(errorItem);
          processedById.set(item.id, errorItem);
          recordLastError(item, itemErrorMessage, details.body);
          updateQueueItem(item.id, errorItem);
          setLastProcessedItemId(item.id);
          setSessionStats((current) => ({
            ...current,
            completed: Math.min(current.total, current.completed + 1),
            durations: [...current.durations.slice(-49), Math.max(1, Math.round((Date.now() - itemStartedAt) / 1000))],
          }));
          if (fatal) {
            if (fatal.kind === "token") setTokenExpired(true);
            stoppedForFatal = true;
            fatalQueueMessage = fatal.message;
            break;
          }
          const failureKind = queueFailureKindFromUnknown(error, details.message);
          if (failureKind === consecutiveFailureKind) {
            consecutiveFailureCount += 1;
          } else {
            consecutiveFailureKind = failureKind;
            consecutiveFailureCount = 1;
          }
          if (consecutiveFailureCount >= DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
            stoppedForFatal = true;
            fatalQueueMessage = `Batch paused due to ${consecutiveFailureCount} consecutive ${queueFailureKindLabel(failureKind)} failures. Fix the issue and click Resume. Last error: ${itemErrorMessage}`;
            break;
          }
          await waitAfterQueueItem(index, { errorPenalty: true });
        } finally {
          controller.signal.removeEventListener("abort", abortItem);
          currentItemAbortRef.current = null;
          setCurrentProcessingId(null);
        }
      }

      if (stoppedForFatal) {
        pauseRequestedRef.current = true;
        setIsPaused(true);
        setState("error");
        setErrorMessage(fatalQueueMessage.startsWith("Batch paused") ? fatalQueueMessage : `Batch paused due to a blocking failure. Fix the issue and click Resume. ${fatalQueueMessage}`);
        window.setTimeout(flushPersistedState, 0);
        return;
      }

      setState("done");
      if (autoExport) {
        const latestQueue = queueForProcessing.map((item) => processedById.get(item.id) ?? item);
        await exportFinalZip(latestQueue);
      } else {
        handlePostQueueCompletion(queueForProcessing.map((item) => processedById.get(item.id) ?? item));
      }
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      setState(cancelled ? "idle" : "error");
      setErrorMessage(cancelled ? "TIDAL export cancelled." : error instanceof Error ? error.message : "TIDAL export failed.");
    } finally {
      isProcessingRef.current = false;
      abortRef.current = null;
      currentItemAbortRef.current = null;
      setCurrentProcessingId(null);
      setCooldownLabel("");
      setCooldownRemaining("");
      if (processorLeaseHeartbeatRef.current !== null) {
        window.clearInterval(processorLeaseHeartbeatRef.current);
        processorLeaseHeartbeatRef.current = null;
      }
      releaseQueueProcessorLease(processorLeaseOwnerRef.current);
      await wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    }
  }

  async function previewQueueItem(item: QueueItem) {
    if (previewingItemId || previewAbortRef.current || !item.url) {
      if (!item.url) updateQueueItem(item.id, { status: "error", errorMsg: "Add a TIDAL URL before previewing." });
      return;
    }
    if (isBrowserOffline()) {
      updateQueueItem(item.id, { errorMsg: "Offline - reconnect before previewing." });
      return;
    }
    const previewController = new AbortController();
    previewAbortRef.current = previewController;
    setPreviewingItemId(item.id);
    setErrorMessage("");
    try {
      const coverArt = coverImage ? await fileToDataUrl(coverImage) : undefined;
      const itemCoverArt = await coverArtForQueueItem(item, coverArt);
      const result = await downloadWithProgress({
        url: item.url,
        profile: "hifi-mp3",
        preview: true,
        coverArt: itemCoverArt ?? coverArt,
        tracks: item.artist || item.title ? [{
          artist: item.artist ?? "",
          title: item.title ?? titleFromTIDALUrl(item.url),
          album: item.album,
          year: item.year,
          genre: item.genre,
          coverArt: itemCoverArt,
          url: item.url,
        }] : undefined,
        enhancements: enhancementsPayload({ ...polishOptions, includeAnalysis: false }, showAdvancedAudioEnhancements),
        useSoulseekFallback,
        filenameTemplate,
        signal: previewController.signal,
        onProgress: (event) => updateQueueItem(item.id, { progress: event.progress, progressMessage: `Preview: ${event.message}` }),
      });
      if (result.skipped) throw new Error("Preview was skipped by duplicate detection.");
      const audio = await firstAudioBlobFromZip(result.blob);
      const previewUrl = URL.createObjectURL(audio);
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      updateQueueItem(item.id, { previewBlob: audio, previewUrl, progress: undefined, progressMessage: undefined });
      setTimeout(() => {
        const player = document.getElementById(`preview-${item.id}`) as HTMLAudioElement | null;
        void player?.play().catch(() => undefined);
      }, 0);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        updateQueueItem(item.id, { progress: undefined, progressMessage: undefined });
        return;
      }
      const details = errorDetailsFromUnknown(error, "Preview failed.");
      recordLastError(item, details.message, details.body);
      setErrorMessage(details.message);
      updateQueueItem(item.id, { errorMsg: details.message });
    } finally {
      if (previewAbortRef.current === previewController) previewAbortRef.current = null;
      setPreviewingItemId(null);
    }
  }

  async function exportFinalZip(items = queue) {
    const doneItems = items.filter((item) => item.status === "done" && item.zipBlob);
    if (doneItems.length === 0) {
      const savedCount = items.filter((item) => item.status === "done").length;
      setCompletionNotice(savedCount > 0
        ? `${savedCount} per-song ZIP${savedCount === 1 ? "" : "s"} were saved without being retained in browser memory. This protects large batches from tab crashes.`
        : "No completed TIDAL ZIPs are ready to export.");
      if (savedCount === 0) setState("error");
      return;
    }
    const sourceBytes = doneItems.reduce((sum, item) => sum + (item.zipBlob?.size ?? 0), 0);
    if (doneItems.length > MAX_IN_MEMORY_COMPLETED_ZIPS || sourceBytes > MAX_FINAL_ZIP_SOURCE_BYTES) {
      setState("done");
      setCompletionNotice(`Skipped the combined browser ZIP to avoid an out-of-memory crash. ${doneItems.length} per-song ZIPs are already saved (${formatBytes(sourceBytes)} retained).`);
      return;
    }

    zipExportInFlightRef.current = true;
    setCompletionNotice("Building final ZIP. Keep this page open until the browser download starts.");
    try {
      const files: Array<{ path: string; blob: Blob }> = [];
      const usedPaths = new Set<string>();
      const playlistEntries: string[] = [];
      for (const item of doneItems) {
        const zipBlob = item.zipBlob;
        if (!zipBlob) continue;
        const folder = sanitizeFileName(formatQueueItemLine(item) || item.id);
        try {
          const entries = await readStoredZipEntries(zipBlob);
          for (const entry of entries) {
            if (entry.directory) continue;
            const relativePath = finalExportEntryPath(entry.name, item);
            if (!relativePath) continue;
            const uniquePath = getUniqueZipEntryPath(relativePath, usedPaths);
            if (!uniquePath) continue;
            files.push({ path: `Turrex TIDAL Export/${uniquePath}`, blob: entry.blob });
            if (isAudioZipPath(uniquePath)) playlistEntries.push(uniquePath);
          }
        } catch {
          const fallbackName = getUniqueFileName(item.zipFileName || `${folder}.zip`, new Set());
          const uniquePath = getUniqueZipEntryPath(`source-zips/${fallbackName}`, usedPaths);
          if (uniquePath) files.push({ path: `Turrex TIDAL Export/${uniquePath}`, blob: zipBlob });
        }
      }

      if (coverImage && polishOptions.embedCover) {
        const uniquePath = getUniqueZipEntryPath(`artwork/cover${guessImageExtension(coverImage.type, coverImage.name)}`, usedPaths);
        if (uniquePath) files.push({ path: `Turrex TIDAL Export/${uniquePath}`, blob: coverImage });
      }

      const manifest = {
        app: "Turrex",
        exporter: "download-4 TIDAL Hi-Res",
        endpoint: TIDAL_ENDPOINT,
        exportDateIso: new Date().toISOString(),
        profile: exportProfile,
        polishOptions,
        useSoulseekFallback,
        libraryPath,
        filenameTemplate,
        postQueueAction,
        rateLimit,
        adaptiveCooldown,
        coverImageName: coverImage?.name || coverImageName || null,
        diagnostics: diagnostics ? {
          route: diagnostics.route,
          tidal: diagnostics.tidal,
          soulseek: diagnostics.soulseek,
          ffmpeg: diagnostics.ffmpeg,
          ffprobe: diagnostics.ffprobe,
          temp: diagnostics.temp,
        } : null,
        queue: items.map((item) => ({
          id: item.id,
          url: item.url ?? null,
          title: item.title ?? null,
          artist: item.artist ?? null,
          album: item.album ?? null,
          genre: item.genre ?? null,
          year: item.year ?? null,
          hasItemCover: Boolean(item.coverArt),
          priority: item.priority,
          status: item.status,
          duplicateExistingFile: item.duplicateExistingFile ?? null,
          zipByteLength: item.zipByteLength ?? item.zipBlob?.size ?? null,
          durationSec: item.durationSec ?? null,
          serverZipPath: item.serverZipPath ?? null,
          albumTracks: item.albumTracks ?? [],
          tidalMatch: item.tidalMatchTitle || item.tidalMatchArtist ? {
            title: item.tidalMatchTitle ?? null,
            artist: item.tidalMatchArtist ?? null,
            album: item.tidalMatchAlbum ?? null,
            durationSec: item.tidalMatchDurationSec ?? null,
            candidateCount: item.tidalCandidateCount ?? null,
          } : null,
          error: item.errorMsg ?? null,
          zipFileName: item.zipFileName ?? null,
          source: item.source,
        })),
      };
      if (playlistEntries.length > 0) {
        files.push({ path: "Turrex TIDAL Export/playlist.m3u8", blob: playlistBlob(playlistEntries) });
      }
      files.push({ path: "Turrex TIDAL Export/manifest.json", blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) });
      files.push({ path: "Turrex TIDAL Export/failed-items.json", blob: new Blob([JSON.stringify(items.filter((item) => item.status === "error"), null, 2)], { type: "application/json" }) });

      const zip = await makeZip(files);
      const filename = `Turrex TIDAL Export ${dateStamp(new Date())}.zip`;
      saveBlobAsDownload(zip, filename);
      recordDownloadHistory(doneItems, filename);
      setLastExportName(filename);
      setState("done");
      handlePostQueueCompletion(items, filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Final ZIP export failed.";
      setErrorMessage(message);
      setState("error");
    } finally {
      zipExportInFlightRef.current = false;
    }
  }

  async function mergeFinalZip() {
    const doneItems = queue.filter((item) => item.status === "done" && item.zipBlob);
    if (doneItems.length === 0) return;

    const totalBytes = doneItems.reduce((sum, item) => sum + (item.zipBlob?.size ?? 0), 0);

    if (totalBytes > MAX_FINAL_ZIP_SOURCE_BYTES) {
      const scriptLines = [
        `$dest = "Turrex Combined"`,
        `New-Item -ItemType Directory -Force -Path $dest | Out-Null`,
        ...doneItems.map((item) => {
          const album = sanitizeFileName(item.album || "Unknown Album");
          const zipName = item.zipFileName || `${formatQueueItemLine(item)}.zip`;
          return [
            `$album = Join-Path $dest "${album}"`,
            `New-Item -ItemType Directory -Force -Path $album | Out-Null`,
            `Expand-Archive -Path "${zipName}" -DestinationPath $album -Force`,
          ].join("\n");
        }),
      ];
      const script = scriptLines.join("\n");
      downloadTextBlob(script, "merge-zips.ps1", "text/plain");
      setCompletionNotice("ZIP total exceeds 512 MB. A PowerShell merge script has been downloaded - run it in your download folder.");
      return;
    }

    setCompletionNotice("Building merged ZIP. Keep this page open...");
    try {
      const files: Array<{ path: string; blob: Blob }> = [];
      const usedPaths = new Set<string>();
      for (const item of doneItems) {
        const zipBlob = item.zipBlob;
        if (!zipBlob) continue;
        const albumFolder = sanitizeFileName(item.album || "Unknown Album");
        try {
          const entries = await readStoredZipEntries(zipBlob);
          for (const entry of entries) {
            if (entry.directory) continue;
            const relativePath = finalExportEntryPath(entry.name, item);
            if (!relativePath) continue;
            const uniquePath = getUniqueZipEntryPath(relativePath, usedPaths);
            if (!uniquePath) continue;
            files.push({ path: `Turrex Combined/${uniquePath}`, blob: entry.blob });
          }
        } catch {
          const fallback = getUniqueFileName(item.zipFileName || `${sanitizeFileName(formatQueueItemLine(item))}.zip`, new Set());
          const uniquePath = getUniqueZipEntryPath(`${albumFolder}/${fallback}`, usedPaths);
          if (uniquePath) files.push({ path: `Turrex Combined/${uniquePath}`, blob: zipBlob });
        }
      }
      const zip = await makeZip(files);
      const filename = `Turrex Combined ${dateStamp(new Date())}.zip`;
      saveBlobAsDownload(zip, filename);
      setLastExportName(filename);
      setCompletionNotice(`Merged ZIP downloaded: ${filename}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Merge ZIP failed.");
      setState("error");
    }
  }

  function handlePostQueueCompletion(items: QueueItem[], filename?: string) {
    const doneCount = items.filter((item) => item.status === "done").length;
    if (postQueueAction === "notify" && typeof window !== "undefined" && "Notification" in window) {
      const showNotification = () => new Notification("Turrex: Queue completed", { body: `${doneCount} song${doneCount === 1 ? "" : "s"} downloaded${filename ? ` to ${filename}` : ""}.` });
      if (Notification.permission === "granted") showNotification();
      else if (Notification.permission !== "denied") void Notification.requestPermission().then((permission) => {
        if (permission === "granted") showNotification();
      });
    }
    if (postQueueAction === "openFolder") {
      const serverPath = items.find((item) => item.serverZipPath)?.serverZipPath;
      const folderPath = serverPath ? serverPath.replace(/[\\/][^\\/]+$/, "") : "Your browser downloads folder";
      setCompletionNotice(`Queue completed. Open folder: ${folderPath}`);
    } else if (postQueueAction === "notify") {
      setCompletionNotice(`Queue completed. ${doneCount} song${doneCount === 1 ? "" : "s"} downloaded.`);
    } else {
      setCompletionNotice("");
    }
  }

  function clearQueue() {
    if (state === "processing") return;
    for (const item of queue) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    setQueue([]);
    setImportReport(null);
    setErrorMessage("");
    setLastErrors([]);
    setLastExportName("");
    setCompletionNotice("");
    setSelectedQueueItemId(null);
    setState("idle");
  }

  function retryFailedItems() {
    if (state === "processing") return;
    setQueue((current) => current.map((item) => item.status === "error"
      ? { ...item, status: "pending" as const, errorMsg: item.url ? undefined : "No TIDAL URL - will be skipped until you add one.", progress: 0, progressMessage: undefined, duplicateExistingFile: undefined }
      : item));
    setErrorMessage("");
    setState("idle");
  }

  function retryQueueItem(id: string) {
    if (state === "processing") return;
    setQueue((current) => current.map((item) => item.id === id
      ? { ...item, status: "pending" as const, errorMsg: item.url ? undefined : "No TIDAL URL - will be skipped until you add one.", progress: 0, progressMessage: undefined, duplicateExistingFile: undefined }
      : item));
    setErrorMessage("");
    setState("idle");
  }

  function removeQueueItem(id: string) {
    if (state === "processing") return;
    if (selectedQueueItemId === id) setSelectedQueueItemId(null);
    setQueue((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  }

  function moveQueueItem(id: string, direction: -1 | 1) {
    if (state === "processing") return;
    setQueueSort({ key: "manual", direction: "asc" });
    setQueue((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index < 0) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(target, 0, item);
      return next;
    });
  }

  function reorderQueueItem(draggedId: string, targetId: string) {
    if (state === "processing" || draggedId === targetId) return;
    setQueueSort({ key: "manual", direction: "asc" });
    setQueue((current) => {
      const from = current.findIndex((item) => item.id === draggedId);
      const to = current.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      if (!item) return current;
      next.splice(to, 0, item);
      return next;
    });
  }

  function retryDuplicateItem(id: string) {
    if (state === "processing") return;
    updateQueueItem(id, {
      status: "pending",
      progress: 0,
      progressMessage: "Force re-download enabled",
      errorMsg: undefined,
      duplicateExistingFile: undefined,
      forceDownload: true,
    });
  }

  async function toggleAlbumTracks(id: string) {
    const item = queue.find((entry) => entry.id === id);
    if (!item) return;
    if (item.tracksExpanded && item.albumTracks?.length) {
      updateQueueItem(id, { tracksExpanded: false });
      return;
    }
    if (item.albumTracks?.length) {
      updateQueueItem(id, { tracksExpanded: true });
      return;
    }
    if (!item.zipBlob) return;
    const stats = await statsFromZipBlob(item.zipBlob);
    updateQueueItem(id, { albumTracks: stats.tracks ?? [], tracksExpanded: true });
  }

  function toggleBulkSelection(id: string) {
    setSelectedBulkIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  }

  function selectVisibleQueueItems() {
    setSelectedBulkIds(visibleQueue.map((item) => item.id));
  }

  function applyBulkMetadata(patch: Partial<Pick<QueueItem, "album" | "genre" | "year" | "priority">>) {
    if (state === "processing" || selectedBulkIds.length === 0) return;
    const selected = new Set(selectedBulkIds);
    setQueue((current) => current.map((item) => (selected.has(item.id) ? { ...item, ...patch } : item)));
  }

  function retrySelectedItems() {
    if (state === "processing" || selectedBulkIds.length === 0) return;
    const selected = new Set(selectedBulkIds);
    setQueue((current) => current.map((item) => selected.has(item.id) && (item.status === "error" || item.status === "skipped")
      ? { ...item, status: "pending" as const, errorMsg: item.url ? undefined : "No TIDAL URL - will be skipped until you add one.", progress: 0, progressMessage: undefined, duplicateExistingFile: undefined }
      : item));
    setState("idle");
    setErrorMessage("");
  }

  function removeSelectedItems() {
    if (state === "processing" || selectedBulkIds.length === 0) return;
    const selected = new Set(selectedBulkIds);
    for (const item of queue) {
      if (selected.has(item.id) && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    setQueue((current) => current.filter((item) => !selected.has(item.id)));
    setSelectedBulkIds([]);
    setSelectedQueueItemId(null);
  }

  function recordDownloadHistory(items: QueueItem[], exportedFileName?: string) {
    if (items.length === 0) return;
    const downloadedAtIso = new Date().toISOString();
    const entries = items
      .filter((item) => item.status === "done")
      .map((item): DownloadHistoryEntry => ({
        id: `${item.id}:${exportProfile}`,
        queueItemId: item.id,
        url: item.url,
        title: item.title,
        artist: item.artist,
        album: item.album,
        genre: item.genre,
        year: item.year,
        profile: exportProfile,
        source: item.source,
        downloadedAtIso,
        exportedFileName,
        zipByteLength: item.zipByteLength ?? item.zipBlob?.size,
        durationSec: item.durationSec,
      }));
    if (entries.length === 0) return;
    setDownloadHistory((current) => {
      const merged = new Map(current.map((entry) => [entry.id, entry]));
      for (const entry of entries) {
        const previous = merged.get(entry.id);
        merged.set(entry.id, { ...previous, ...entry, exportedFileName: entry.exportedFileName ?? previous?.exportedFileName });
      }
      return Array.from(merged.values())
        .sort((a, b) => Date.parse(b.downloadedAtIso) - Date.parse(a.downloadedAtIso))
        .slice(0, MAX_DOWNLOAD_HISTORY);
    });
  }

  function reAddHistoryEntry(entry: DownloadHistoryEntry) {
    const item: QueueItem = {
      id: makeId(),
      url: entry.url,
      artist: entry.artist,
      title: entry.title,
      album: entry.album,
      genre: entry.genre,
      year: entry.year,
      priority: "medium",
      status: entry.url ? "pending" : "skipped",
      progress: entry.url ? 0 : 100,
      progressMessage: entry.url ? "Re-added from history" : "Re-added without TIDAL URL",
      errorMsg: entry.url ? undefined : "No TIDAL URL - add one before processing.",
      source: entry.source,
      addedAtIso: new Date().toISOString(),
    };
    setQueue((current) => mergeQueueItems(current, [item]));
    setState("idle");
    setErrorMessage("");
  }

  function undoLastExportHistory() {
    const latestExport = lastExportName || downloadHistory.find((entry) => entry.exportedFileName)?.exportedFileName;
    if (!latestExport) return;
    setDownloadHistory((current) => current.map((entry) => entry.exportedFileName === latestExport ? { ...entry, exportedFileName: undefined } : entry));
    if (lastExportName === latestExport) setLastExportName("");
    setCompletionNotice(`Removed the history marker for ${latestExport}.`);
  }

  function saveQueuePreset(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const preset: QueuePreset = {
      id: makeId(),
      name: trimmed,
      profile: exportProfile,
      polishOptions,
      rateLimit: clampRateLimitSettings(rateLimit),
      filenameTemplate,
      postQueueAction,
      useSoulseekFallback,
      createdAtIso: new Date().toISOString(),
    };
    setQueuePresets((current) => [preset, ...current.filter((entry) => entry.name.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_QUEUE_PRESETS));
  }

  function loadQueuePreset(id: string) {
    const preset = queuePresets.find((entry) => entry.id === id);
    if (!preset || state === "processing") return;
    setExportProfile(preset.profile);
    setPolishOptions(preset.polishOptions);
    setRateLimit(clampRateLimitSettings(preset.rateLimit));
    setFilenameTemplate(preset.filenameTemplate);
    setPostQueueAction(preset.postQueueAction);
    setUseSoulseekFallback(preset.useSoulseekFallback);
  }

  function deleteQueuePreset(id: string) {
    if (state === "processing") return;
    setQueuePresets((current) => current.filter((entry) => entry.id !== id));
  }

  function cancelActiveJob() {
    abortRef.current?.abort();
    autoAssignAbortRef.current?.abort();
    previewAbortRef.current?.abort();
  }

  const sessionProgress = useMemo(() => {
    const statusProcessed = queue.filter((item) => item.status === "done" || item.status === "error" || item.status === "skipped").length;
    const statusTotal = queue.length;
    const processed = state === "processing" && sessionStats.total > 0 ? sessionStats.completed : statusProcessed;
    const total = state === "processing" && sessionStats.total > 0 ? sessionStats.total : statusTotal;
    const avgSeconds = sessionStats.durations.length
      ? Math.round(sessionStats.durations.reduce((sum, value) => sum + value, 0) / sessionStats.durations.length)
      : 0;
    const remainingItems = queue.filter((item) => (item.status === "pending" && Boolean(item.url)) || (item.status === "skipped" && item.forceDownload)).length;
    const remainingSeconds = avgSeconds > 0
      ? remainingItems * (avgSeconds + rateLimit.delaySeconds) + Math.floor(remainingItems / Math.max(1, rateLimit.songsBeforeLongPause)) * rateLimit.longPauseMinutes * 60
      : 0;
    return {
      processed,
      total,
      pct: total ? Math.round((processed / total) * 100) : 0,
      label: total ? `Processing ${Math.min(processed + (state === "processing" ? 1 : 0), total)} of ${total} songs` : "No songs queued",
      remaining: remainingSeconds > 0 ? formatDurationSeconds(remainingSeconds) : "Calculating",
      avgSeconds,
    };
  }, [queue, rateLimit.delaySeconds, rateLimit.longPauseMinutes, rateLimit.songsBeforeLongPause, sessionStats.completed, sessionStats.durations, sessionStats.total, state]);

  const queueStatistics = useMemo<QueueStatistics>(() => {
    const downloaded = queue.filter((item) => item.status === "done").length;
    const failed = queue.filter((item) => item.status === "error").length;
    const skipped = queue.filter((item) => item.status === "skipped" || !item.url).length;
    const dataBytes = queue.reduce((sum, item) => sum + (item.zipByteLength ?? item.zipBlob?.size ?? 0), 0);
    const totalDurationSec = Math.round(queue.reduce((sum, item) => sum + (item.durationSec ?? 0), 0));
    const elapsedSec = sessionStats.startedAt ? Math.max(0, Math.round((Date.now() - sessionStats.startedAt) / 1000)) : 0;
    const estimatedRemainingSec = sessionProgress.remaining === "Calculating" ? 0 : secondsFromDurationLabel(sessionProgress.remaining);
    return {
      total: queue.length,
      downloaded,
      failed,
      skipped,
      dataBytes,
      averageBytes: downloaded > 0 ? Math.round(dataBytes / downloaded) : 0,
      totalDurationSec,
      elapsedSec,
      estimatedRemainingSec,
    };
  }, [queue, sessionProgress.remaining, sessionStats.startedAt]);

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      const isEditingText = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        void processQueue(false);
        return;
      }
      if (event.key === "Escape" && (state === "processing" || autoAssigningUrls)) {
        event.preventDefault();
        cancelActiveJob();
        return;
      }
      if (!isEditingText && event.key === " " && state === "processing") {
        event.preventDefault();
        togglePause();
        return;
      }
      if (!isEditingText && event.key === "Delete" && selectedQueueItemId && state !== "processing") {
        event.preventDefault();
        removeQueueItem(selectedQueueItemId);
        setSelectedQueueItemId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [autoAssigningUrls, mounted, queue.length, selectedQueueItemId, state]);

  const debugPayload = useMemo(() => JSON.stringify({
    tidal: {
      route: diagnostics?.route ?? { url: TIDAL_ENDPOINT, reachable: false },
      selectedProfile: exportProfile,
      selectedProfileLabel: activeProfile.label,
      output: activeProfile.extension === "flac" ? "Lossless FLAC ZIP" : activeProfile.extension === "m4a" ? "AAC/M4A 192kbps ZIP" : "MP3 320kbps ZIP",
      source: "TIDAL URL resolved by tidekeeper with optional Soulseek fallback",
      checkedAtIso: diagnostics?.checkedAtIso ?? null,
    },
    runtime: {
      tidal: diagnostics?.tidal ? { available: diagnostics.tidal.available, version: compactVersion(diagnostics.tidal.version), errorCode: diagnostics.tidal.errorCode } : null,
      tidalConfig: diagnostics?.tidal ? { exists: diagnostics.tidal.configExists, loggedIn: diagnostics.tidal.loggedIn, path: diagnostics.tidal.configPath } : null,
      soulseek: diagnostics?.soulseek ? { available: diagnostics.soulseek.available, version: compactVersion(diagnostics.soulseek.version), errorCode: diagnostics.soulseek.errorCode } : null,
      ffmpeg: diagnostics?.ffmpeg ? { available: diagnostics.ffmpeg.available, version: compactVersion(diagnostics.ffmpeg.version), errorCode: diagnostics.ffmpeg.errorCode } : null,
      ffprobe: diagnostics?.ffprobe ? { available: diagnostics.ffprobe.available, version: compactVersion(diagnostics.ffprobe.version), errorCode: diagnostics.ffprobe.errorCode } : null,
      temp: diagnostics?.temp,
      profiles: diagnostics?.profiles ?? [],
      tidalSearch: diagnostics ? { available: diagnostics.searchAvailable } : null,
    },
    queue: queueStats,
    sessionProgress,
    queueStatistics,
    exportProfile,
    polishOptions,
    useSoulseekFallback,
    libraryPath,
    filenameTemplate,
    postQueueAction,
    completionNotice,
    rateLimit,
    isPaused,
    tokenExpired,
    activeTab,
    adaptiveCooldown,
    queueSort,
    bulkSelectedCount: selectedBulkIds.length,
    downloadHistoryCount: downloadHistory.length,
    queuePresetCount: queuePresets.length,
    smartLibrary: {
      tracks: libraryTracks.length,
      localStorageUrls: downloadedUrlSet.size,
      autoSkipDownloaded,
      downloadDirectoryName: downloadDirectoryName || null,
      error: libraryError || null,
    },
    coverImageName: coverImage?.name || coverImageName || null,
    autoAssigningUrls,
    autoAssignMessage,
    cooldown: cooldownRemaining ? { label: cooldownLabel, remaining: cooldownRemaining } : null,
    lastExportName,
    lastErrors,
    errorLog,
    warnings: diagnostics?.warnings ?? [],
    fixes: diagnostics?.fixes ?? [],
    searchDebugLog: searchDebugLogGlobal,
  }, null, 2), [activeProfile, activeTab, adaptiveCooldown, autoAssignMessage, autoAssigningUrls, autoSkipDownloaded, completionNotice, cooldownLabel, cooldownRemaining, coverImage, coverImageName, diagnostics, downloadDirectoryName, downloadHistory.length, downloadedUrlSet.size, errorLog, exportProfile, filenameTemplate, isPaused, lastErrors, lastExportName, libraryError, libraryPath, libraryTracks.length, polishOptions, postQueueAction, queuePresets.length, queueSort, queueStatistics, queueStats, rateLimit, selectedBulkIds.length, sessionProgress, tokenExpired, useSoulseekFallback]);

  return (
    <div
      className="relative"
      onDragEnter={handleImportDrag}
      onDragOver={handleImportDrag}
      onDragLeave={handleImportDragLeave}
      onDrop={handleImportDrop}
    >
      {isImportDropActive ? (
        <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-black/50 p-6">
          <div className="max-w-md rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--surface)] px-5 py-4 text-center shadow-xl">
            <p className="text-sm font-medium text-[var(--text)]">Drop JSON or images to import</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Songs JSON opens the review modal; images go to batch OCR.</p>
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Personal export tool</p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--text)]">Local ZIP Export (TIDAL Hi-Res)</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Build a private ZIP from TIDAL track, album, or playlist links using tidekeeper Hi-Res retrieval, local ffmpeg profiles, and automatic Soulseek fallback.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Environment: Local</span>
          <span className={`rounded-[var(--radius-sm)] border px-3 py-1.5 ${heroStatus.className}`}>TIDAL: {heroStatus.label}</span>
          <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Quality: Hi-Res FLAC / 320kbps</span>
          <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Output: Transcoding ready</span>
        </div>
      </div>

      <Download4TabBar activeTab={activeTab} onChange={setActiveTab} />
      {persistenceWarning ? (
        <p className="mt-4 rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-warning-rgb),0.45)] bg-[color:rgba(var(--status-warning-rgb),0.12)] px-3 py-2 text-sm leading-6 text-[var(--text)]">
          {persistenceWarning}
        </p>
      ) : null}

      <section
        id="download4-tabpanel-downloader"
        role="tabpanel"
        aria-labelledby="download4-tab-downloader"
        hidden={activeTab !== "downloader"}
        className={activeTab === "downloader" ? "mt-4" : "hidden"}
      >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-3">
          <Card className="p-3 sm:p-4">
            <div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3 text-sm leading-6">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <p className="min-w-0 text-[var(--text)]">
                TIDAL downloads are requested through {TIDAL_ENDPOINT}. The server tries tidekeeper first, falls back to verified Soulseek results when enabled, applies the selected profile locally, and returns a ZIP token.
              </p>
            </div>

            <div className="mt-4 grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <div className="min-w-0">
                <label htmlFor="tidalUrl" className="text-sm font-medium text-[var(--text)]">TIDAL URL</label>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Paste a TIDAL track, album, or playlist URL.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-start">
                <div className="min-w-0">
                  <Input
                    id="tidalUrl"
                    value={tidalUrl}
                    onChange={(event) => {
                      setTIDALUrl(event.target.value);
                      if (tidalUrlError) setTIDALUrlError("");
                    }}
                    placeholder="TIDAL track/album/playlist URL"
                    disabled={state === "processing"}
                  />
                  {tidalUrlError ? <p className="mt-1 text-xs text-[var(--status-danger)]">{tidalUrlError}</p> : null}
                </div>
                <Button type="button" variant="ghost" onClick={() => void pasteTIDALUrlFromClipboard()} disabled={state === "processing"}>
                  Paste from clipboard
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowSpotifyImport(true)} disabled={state === "processing"}>
                  Import Spotify Playlist
                </Button>
                <Button type="button" onClick={addTIDALUrlToQueue} disabled={state === "processing"} className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add to Queue
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-2">
                <label htmlFor="songsJson" className="text-sm font-medium text-[var(--text)]">Import songs JSON</label>
                <label htmlFor="songsJson" className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)]">
                  <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">Choose a JSON file from recognition/export</span>
                </label>
                <input
                  id="songsJson"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    void handleJsonImport(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                  className="sr-only"
                  disabled={state === "processing"}
                />
                <p className="text-xs leading-5 text-[var(--muted)]">Imported artist/title rows do not include TIDAL URLs and will be skipped until edited.</p>
              </div>

              <div className="min-w-0 space-y-2">
                <label htmlFor="coverImage" className="text-sm font-medium text-[var(--text)]">Cover image</label>
                <label htmlFor="coverImage" className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)]">
                  <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{coverImage ? coverImage.name : coverImageName ? `${coverImageName} (reselect to use)` : "Choose cover art for the ZIP"}</span>
                </label>
                <input
                  ref={coverInputRef}
                  id="coverImage"
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    updateCoverImage(file);
                    setPolishOptions((current) => ({ ...current, embedAudioCover: file ? true : current.embedAudioCover, embedCover: Boolean(file) || current.embedCover }));
                  }}
                  className="sr-only"
                  disabled={state === "processing"}
                />
                {coverImage || coverImageName ? (
                  <Button type="button" variant="secondary" onClick={() => updateCoverImage(null)} disabled={state === "processing"} size="sm">
                    Remove cover
                  </Button>
                ) : null}
              </div>
            </div>

            {autoAssignMessage ? (
              <div className={`mt-3 rounded-[var(--radius-sm)] border p-3 text-sm ${autoAssigningUrls ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[color:rgba(var(--status-success-rgb),0.35)] bg-[color:rgba(var(--status-success-rgb),0.1)] text-[var(--status-success)]"}`}>
                {autoAssignMessage}
              </div>
            ) : null}

            <TokenExpiredAlert
              visible={tokenExpired}
              loginLoading={tidalLoginLoading}
              loginMessage={tidalLoginMessage}
              onLogin={() => void loginToTidal()}
              onRecheck={() => void loadTidalDiagnostics()}
            />

            <div className="mt-3 grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)]">Source safety</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Allow verified Soulseek fallback when TIDAL cannot complete a request.</p>
                </div>
                {cooldownRemaining ? (
                  <span className="rounded-[var(--radius-sm)] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--text)]">
                    {cooldownLabel}: {cooldownRemaining}
                  </span>
                ) : null}
              </div>
              <div className="grid gap-2">
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
                  <input type="checkbox" checked={useSoulseekFallback} onChange={(event) => setUseSoulseekFallback(event.target.checked)} disabled={state === "processing"} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text)]">Soulseek fallback</span>
                    <span className="block text-xs leading-5 text-[var(--muted)]">Uses slsk-batchdl only after TIDAL fails, then verifies codec and bitrate before transcoding.</span>
                  </span>
                </label>
                <label className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
                  <span className="text-sm font-medium text-[var(--text)]">Library duplicate check</span>
                  <Input
                    value={libraryPath}
                    onChange={(event) => setLibraryPath(event.target.value)}
                    placeholder="Optional local library folder path"
                    disabled={state === "processing"}
                  />
                  <span className="text-xs leading-5 text-[var(--muted)]">When set, the API scans this folder before downloading and skips matching artist/title files unless an item is forced.</span>
                </label>
              </div>
            </div>

            <SchedulerPanel
              disabled={state === "processing"}
              state={state}
              searchBusy={autoAssigningUrls}
              settings={rateLimit}
              adaptiveCooldown={adaptiveCooldown}
              cooldownLabel={cooldownLabel}
              cooldownRemaining={cooldownRemaining}
              onChange={(patch) => setRateLimit((current) => clampRateLimitSettings({ ...current, ...patch }))}
              onPreset={(preset) => setRateLimit(rateLimitPreset(preset))}
              onPauseResume={() => {
                if (state !== "processing" && isPaused) void processQueue(false, { resume: true });
                else togglePause();
              }}
              onSkip={skipCurrentItem}
              onSkipDelay={skipDelay}
              onStop={cancelActiveJob}
              canSkip={Boolean(currentProcessingId)}
              isPaused={isPaused}
            />

            <SessionProgressCard progress={sessionProgress} state={state} cooldownLabel={cooldownLabel} cooldownRemaining={cooldownRemaining} isPaused={isPaused} />
            <StatisticsDashboard statistics={queueStatistics} state={state} />
            <SmartLibraryPanel
              tracks={libraryTracks}
              loading={libraryLoading}
              error={libraryError}
              autoSkipDownloaded={autoSkipDownloaded}
              downloadDirectoryName={downloadDirectoryName}
              disabled={state === "processing"}
              onToggleAutoSkip={setAutoSkipDownloaded}
              onView={() => setShowLibraryModal(true)}
              onClear={() => void clearSmartLibrary()}
              onRefresh={() => void refreshSmartLibrary()}
              onChooseDirectory={() => void chooseDownloadDirectory()}
              onCopyLibrary={copyLibrary}
            />
            <OcrLibraryPanel
              library={ocrLibrary}
              loading={ocrLibraryLoading}
              selectedIds={selectedOcrIds}
              query={ocrLibraryQuery}
              disabled={state === "processing"}
              onRefresh={() => void refreshOcrLibrary()}
              onClear={async () => {
                if (!window.confirm("Clear the OCR Song Library? This will not affect the download queue or Smart Library.")) return;
                await clearOcrLibrary();
                setOcrLibrary([]);
              }}
              onQueryChange={setOcrLibraryQuery}
              onToggleSelect={(id) => setSelectedOcrIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
              onSelectAll={() => setSelectedOcrIds(ocrLibrary.filter((s) => s.artist || s.title).map((s) => s.id))}
              onClearSelection={() => setSelectedOcrIds([])}
              onSearchUrls={(ids) => void searchOcrLibraryUrls(ids)}
              onSendToDownloader={(ids) => void sendOcrLibraryItemsToQueue(ids)}
              onDelete={async (id) => {
                await deleteOcrSong(id);
                setOcrLibrary((prev) => prev.filter((s) => s.id !== id));
                setSelectedOcrIds((prev) => prev.filter((x) => x !== id));
              }}
            />

            <QueuePanel
              queue={visibleQueue}
              queueStats={queueStats}
              importReport={importReport}
              showSkippedImportRows={showSkippedImportRows}
              disabled={state === "processing"}
              coverPreviewUrl={coverPreviewUrl}
              previewingItemId={previewingItemId}
              selectedItemId={selectedQueueItemId}
              bulkSelectedIds={selectedBulkIds}
              draggedItemId={draggedQueueItemId}
              sort={queueSort}
              onToggleSkipped={() => setShowSkippedImportRows((value) => !value)}
              onSelect={setSelectedQueueItemId}
              onToggleBulkSelection={toggleBulkSelection}
              onSelectAll={selectVisibleQueueItems}
              onClearBulkSelection={() => setSelectedBulkIds([])}
              onBulkEdit={applyBulkMetadata}
              onBulkRetry={retrySelectedItems}
              onBulkRemove={removeSelectedItems}
              onSortChange={setQueueSort}
              onDragStart={setDraggedQueueItemId}
              onDragEnd={() => setDraggedQueueItemId(null)}
              onDrop={reorderQueueItem}
              onPreview={(item) => void previewQueueItem(item)}
              onRemove={removeQueueItem}
              onRetry={retryQueueItem}
              onRetryDuplicate={retryDuplicateItem}
              onToggleTracks={(id) => void toggleAlbumTracks(id)}
              onMove={moveQueueItem}
              onEdit={editQueueItem}
              actions={(
                <QueueActions
                  state={state}
                  busy={autoAssigningUrls}
                  queueLength={queue.length}
                  reSearchableTidalUrlCount={reSearchableTidalUrlCount}
                  doneCount={queueStats.done}
                  errorCount={queueStats.error}
                  showShortcutHelp={showShortcutHelp}
                  onReSearchTidalUrls={reSearchTidalUrls}
                  onProcess={() => void processQueue(false, { resume: isPaused })}
                  onProcessAndExport={() => void processQueue(true, { resume: isPaused })}
                  onExport={() => void exportFinalZip()}
                  onMerge={() => void mergeFinalZip()}
                  onRetryFailed={retryFailedItems}
                  onClear={clearQueue}
                  onToggleShortcutHelp={() => setShowShortcutHelp((value) => !value)}
                />
              )}
            />

            <ErrorLogPanel
              entries={errorLog}
              isOpen={showErrorLog}
              onToggle={() => setShowErrorLog((value) => !value)}
              onClear={() => setErrorLog([])}
            />
            <BatchRecoveryReport
              items={queue}
              state={state}
              onRetryAll={retryFailedItems}
              onRetry={retryQueueItem}
            />
          </Card>
        </div>

        <div className="min-w-0 space-y-3">
          <AudioPolishPanel
            activeProfile={activeProfile}
            disabled={state === "processing"}
            exportProfile={exportProfile}
            polishOptions={polishOptions}
            showAdvancedAudioEnhancements={showAdvancedAudioEnhancements}
            onProfileChange={(profile) => {
              setExportProfile(profile);
              setPolishOptions((current) => defaultPolishForProfile(profile, current));
            }}
            onPolishChange={(patch) => setPolishOptions((current) => ({ ...current, ...patch }))}
            onShowAdvancedAudioEnhancementsChange={setShowAdvancedAudioEnhancements}
          />
          <FileNamingPanel
            disabled={state === "processing"}
            template={filenameTemplate}
            onChange={setFilenameTemplate}
          />
          <AutomationPanel
            disabled={state === "processing"}
            action={postQueueAction}
            completionNotice={completionNotice}
            onChange={setPostQueueAction}
          />
          <QueuePresetsPanel
            disabled={state === "processing"}
            presets={queuePresets}
            onSave={saveQueuePreset}
            onLoad={loadQueuePreset}
            onDelete={deleteQueuePreset}
          />
          <DownloadHistoryPanel
            entries={downloadHistory}
            disabled={state === "processing"}
            lastExportName={lastExportName}
            onReAdd={reAddHistoryEntry}
            onUndoLastExport={undoLastExportHistory}
            onClear={() => setDownloadHistory([])}
          />
          <ProgressCard state={state} queueStats={queueStats} errorMessage={errorMessage} lastExportName={lastExportName} />
          <DebugDetailsCard payload={debugPayload} />
          <TidalDiagnosticsCard
            mounted={mounted}
            diagnostics={diagnostics}
            diagnosticsError={diagnosticsError}
            diagnosticsLoading={diagnosticsLoading}
            loginLoading={tidalLoginLoading}
            loginMessage={tidalLoginMessage}
            onLogin={() => void loginToTidal()}
            onRecheck={() => void loadTidalDiagnostics()}
          />
        </div>
      </div>
      </section>

      <section
        id="download4-tabpanel-ocr"
        role="tabpanel"
        aria-labelledby="download4-tab-ocr"
        hidden={activeTab !== "ocr"}
        className={activeTab === "ocr" ? "mt-4 max-h-[calc(100vh-12rem)] overflow-y-auto pr-1 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]" : "hidden"}
      >
        <BatchOcrSection
          disabled={state === "processing" || autoAssigningUrls}
          droppedFiles={droppedOcrFiles}
          onSendToDownloader={sendOcrSongsToDownloader}
        />
      </section>

      {showReviewModal ? (
        <SongReviewModal
          songs={importedSongs.map(songToSongMatch)}
          onCancel={handleCancelImportedSongs}
          onConfirm={handleConfirmImportedSongs}
          submittingMessage={autoAssigningUrls ? autoAssignMessage : undefined}
        />
      ) : null}
      {showLibraryModal ? (
        <SmartLibraryModal
          tracks={libraryTracks}
          loading={libraryLoading}
          error={libraryError}
          onClose={() => setShowLibraryModal(false)}
          onClear={() => void clearSmartLibrary()}
          onRefresh={() => void refreshSmartLibrary()}
        />
      ) : null}
      <SpotifyImportModal
        isOpen={showSpotifyImport}
        onClose={() => setShowSpotifyImport(false)}
        onAdd={(tracks) => {
          const now = new Date().toISOString();
          const importedItems: QueueItem[] = tracks.map((track) => ({
            id: makeId(),
            artist: track.artist,
            title: track.title,
            album: track.album,
            priority: "medium" as const,
            status: "pending" as const,
            errorMsg: "No TIDAL URL - add one before processing.",
            source: "json" as const,
            addedAtIso: now,
          })).filter((item) => item.title?.trim() || item.artist?.trim());
          setQueue((current) => mergeQueueItems(current, importedItems));
          setImportReport({
            parsedCount: importedItems.length,
            invalidCount: Math.max(0, tracks.length - importedItems.length),
            skippedCount: 0,
            filename: "Spotify playlist",
          });
          setShowSpotifyImport(false);
        }}
      />
    </div>
  );
}

function Download4TabBar({ activeTab, onChange }: { activeTab: Download4Tab; onChange: (tab: Download4Tab) => void }) {
  const tabs: Array<{ id: Download4Tab; label: string; description: string }> = [
    { id: "downloader", label: "📥 Downloader", description: "Queue, profiles, ZIP export" },
    { id: "ocr", label: "🔍 OCR Extractor", description: "Images, review grid, exports" },
  ];

  return (
    <div className="mt-5 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] p-1 [scrollbar-width:thin]" role="tablist" aria-label="Download page sections">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`download4-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`download4-tabpanel-${tab.id}`}
              onClick={() => onChange(tab.id)}
              className={`min-w-fit rounded-[var(--radius-sm)] px-3 py-2 text-left transition sm:px-4 ${active ? "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent-border)]" : "text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)]"}`}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className="mt-0.5 hidden text-xs text-[var(--muted)] sm:block">{tab.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, description, badge, defaultOpen = true, children }: {
  title: string;
  description?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const storageKey = useMemo(() => `turrex-download4-section:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, [title]);
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen;
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored === null ? defaultOpen : stored === "1";
    } catch {
      return defaultOpen;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    safeSetLocalStorageItem(storageKey, open ? "1" : "0");
  }, [open, storageKey]);
  return (
    <div className="card-base surface-card overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition hover:bg-[var(--accent-soft)]"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--text)]">{title}</span>
          {description ? <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{description}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge ? <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-1 text-xs text-[var(--muted)]">{badge}</span> : null}
          <ChevronDown className={`h-4 w-4 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-[var(--border)] p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function SchedulerPanel({ disabled, state, searchBusy, settings, adaptiveCooldown, cooldownLabel, cooldownRemaining, onChange, onPreset, onPauseResume, onSkip, onSkipDelay, onStop, canSkip, isPaused }: {
  disabled: boolean;
  state: DownloadState;
  searchBusy: boolean;
  settings: RateLimitSettings;
  adaptiveCooldown: { multiplier: number; songsRemaining: number };
  cooldownLabel: string;
  cooldownRemaining: string;
  onChange: (patch: Partial<RateLimitSettings>) => void;
  onPreset: (preset: "safe" | "aggressive" | "night") => void;
  onPauseResume: () => void;
  onSkip: () => void;
  onSkipDelay: () => void;
  onStop: () => void;
  canSkip: boolean;
  isPaused: boolean;
}) {
  const presetValue = settings.delaySeconds <= 30 ? "aggressive" : settings.longPauseMinutes >= 10 ? "night" : "safe";
  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
      <CollapsibleSection title="Scheduler" description="Batch pacing and live controls for long TIDAL sessions." badge={cooldownRemaining ? `${cooldownLabel}: ${cooldownRemaining}` : `${settings.delaySeconds}s delay`}>
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--text)]">Preset</span>
            <select value={presetValue} onChange={(event) => onPreset(event.target.value as "safe" | "aggressive" | "night")} disabled={disabled} className="min-h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-sm text-[var(--text)]">
              <option value="safe">Safe</option>
              <option value="aggressive">Aggressive</option>
              <option value="night">Night mode</option>
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <NumberSetting label="Delay (seconds)" min={MIN_SCHEDULER_DELAY_SECONDS} max={180} step={5} value={settings.delaySeconds} disabled={disabled} onChange={(value) => onChange({ delaySeconds: value })} />
            <NumberSetting label="Songs before pause" min={3} max={20} step={1} value={settings.songsBeforeLongPause} disabled={disabled} onChange={(value) => onChange({ songsBeforeLongPause: value })} />
            <NumberSetting label="Pause (minutes)" min={1} max={15} step={1} value={settings.longPauseMinutes} disabled={disabled} onChange={(value) => onChange({ longPauseMinutes: value })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <NumberSetting label="Transient retries" min={0} max={MAX_TRANSIENT_DOWNLOAD_RETRIES} step={1} value={settings.maxTransientRetries} disabled={disabled} onChange={(value) => onChange({ maxTransientRetries: value })} />
            <NumberSetting label="Retry base delay" min={MIN_TRANSIENT_BACKOFF_SECONDS} max={MAX_TRANSIENT_BACKOFF_SECONDS} step={5} value={settings.transientBackoffSeconds} disabled={disabled} onChange={(value) => onChange({ transientBackoffSeconds: value })} />
          </div>
          <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2.5">
            <input type="checkbox" checked={settings.adaptiveCooldown} onChange={(event) => onChange({ adaptiveCooldown: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--text)]">Adaptive 429 cooldown</span>
              <span className="block text-xs leading-5 text-[var(--muted)]">Multiplier: {adaptiveCooldown.multiplier.toFixed(1)}x{adaptiveCooldown.songsRemaining ? ` for ${adaptiveCooldown.songsRemaining} more song${adaptiveCooldown.songsRemaining === 1 ? "" : "s"}` : ""}.</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onPauseResume} disabled={state !== "processing" && !isPaused} variant="secondary" size="sm" className="inline-flex items-center gap-2">
              <Pause className="h-4 w-4" aria-hidden="true" />
              {isPaused ? "Resume" : "Pause"}
            </Button>
            <Button onClick={onSkip} disabled={state !== "processing" || !canSkip} variant="secondary" size="sm" className="inline-flex items-center gap-2">
              <SkipForward className="h-4 w-4" aria-hidden="true" />
              Skip
            </Button>
            <Button onClick={onSkipDelay} disabled={!cooldownRemaining} variant="secondary" size="sm" className="inline-flex items-center gap-2">
              <SkipForward className="h-4 w-4" aria-hidden="true" />
              Skip Delay
            </Button>
            <Button onClick={onStop} disabled={state !== "processing" && !searchBusy} variant="ghost" size="sm">Stop</Button>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function NumberSetting({ label, min, max, step, value, disabled, onChange }: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2.5">
      <span className="text-sm font-medium text-[var(--text)]">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(clampNumber(Number(event.target.value), min, max))}
      />
    </label>
  );
}

function FileNamingPanel({ disabled, template, onChange }: { disabled: boolean; template: string; onChange: (value: string) => void }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
      <CollapsibleSection
        title="File Naming"
        description="Customize filenames inside each ZIP without changing Turrex's global theme or layout."
        badge="Template"
        defaultOpen={false}
      >
        <label className="grid gap-2">
          <span className="text-sm font-medium text-[var(--text)]">Filename template</span>
          <Input
            value={template}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            placeholder="{artist} - {title}.{ext}"
          />
        </label>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          Available placeholders: {"{artist}"}, {"{title}"}, {"{album}"}, {"{year}"}, {"{quality}"}, {"{profile}"}, {"{tracknumber}"}, {"{ext}"}.
        </p>
      </CollapsibleSection>
    </div>
  );
}

function AutomationPanel({ disabled, action, completionNotice, onChange }: {
  disabled: boolean;
  action: PostQueueAction;
  completionNotice: string;
  onChange: (value: PostQueueAction) => void;
}) {
  const folderPath = completionNotice.match(/Open folder:\s*(.+)$/)?.[1];
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
      <CollapsibleSection title="Automation" description="Choose a local completion behavior for long queues." badge={action === "none" ? "Manual" : "After queue"} defaultOpen={false}>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-[var(--text)]">When queue finishes</span>
          <select
            value={action}
            onChange={(event) => onChange(event.target.value as PostQueueAction)}
            disabled={disabled}
            className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)]"
          >
            <option value="none">Do nothing</option>
            <option value="openFolder">Open download folder</option>
            <option value="notify">Show notification</option>
          </select>
        </label>
        {completionNotice ? (
          <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3 text-sm leading-6 text-[var(--text)]">
            <p className="break-words">{completionNotice}</p>
            {folderPath && folderPath !== "Your browser downloads folder" ? (
              <a className="mt-2 inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1 text-xs text-[var(--accent)] hover:bg-[var(--surface)]" href={localFileHref(folderPath)}>
                Open Folder
              </a>
            ) : null}
          </div>
        ) : null}
      </CollapsibleSection>
    </div>
  );
}

function QueuePresetsPanel({ disabled, presets, onSave, onLoad, onDelete }: {
  disabled: boolean;
  presets: QueuePreset[];
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const save = () => {
    if (!name.trim()) return;
    onSave(name);
    setName("");
  };

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
      <CollapsibleSection title="Queue Presets" description="Save profile, scheduler, naming, fallback, and automation settings." badge={`${presets.length}/${MAX_QUEUE_PRESETS}`} defaultOpen={false}>
        <div className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Preset name" disabled={disabled} />
            <Button type="button" onClick={save} disabled={disabled || !name.trim()} size="sm">Save</Button>
          </div>
          {presets.length > 0 ? (
            <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {presets.map((preset) => (
                <li key={preset.id} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text)]">{preset.name}</p>
                      <p className="text-xs text-[var(--muted)]">{preset.profile} - {preset.rateLimit.delaySeconds}s delay - {preset.rateLimit.maxTransientRetries} retries</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" variant="secondary" size="sm" onClick={() => onLoad(preset.id)} disabled={disabled}>Load</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => onDelete(preset.id)} disabled={disabled}>Delete</Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">No presets saved yet.</p>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function DownloadHistoryPanel({ entries, disabled, lastExportName, onReAdd, onUndoLastExport, onClear }: {
  entries: DownloadHistoryEntry[];
  disabled: boolean;
  lastExportName: string;
  onReAdd: (entry: DownloadHistoryEntry) => void;
  onUndoLastExport: () => void;
  onClear: () => void;
}) {
  const latestExport = lastExportName || entries.find((entry) => entry.exportedFileName)?.exportedFileName || "";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
      <CollapsibleSection title="Download History" description="Last completed songs, with quick re-add for reruns." badge={`${entries.length}/${MAX_DOWNLOAD_HISTORY}`} defaultOpen={false}>
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onUndoLastExport} disabled={disabled || !latestExport}>Undo last export record</Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={disabled || entries.length === 0}>Clear history</Button>
          </div>
          {latestExport ? <p className="break-words text-xs text-[var(--muted)]">Latest export: {latestExport}</p> : null}
          {entries.length > 0 ? (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text)]">{[entry.artist, entry.title].filter(Boolean).join(" - ") || entry.url || "Untitled download"}</p>
                      <p className="text-xs text-[var(--muted)]">{entry.album || entry.profile} - {formatBytes(entry.zipByteLength ?? 0)} - {new Date(entry.downloadedAtIso).toLocaleString()}</p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={() => onReAdd(entry)} disabled={disabled}>Re-add</Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">Completed songs will appear here.</p>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function SpotifyImportModal({ isOpen, onClose, onAdd }: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (tracks: SpotifyImportTrack[]) => void;
}) {
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [fallbackText, setFallbackText] = useState("");
  const [keepMetadata, setKeepMetadata] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewTracks, setPreviewTracks] = useState<SpotifyImportTrack[]>([]);

  if (!isOpen) return null;

  async function handlePreview() {
    setLoading(true);
    setError("");
    try {
      const tracks = await tracksFromSpotifyImport(playlistUrl, fallbackText, keepMetadata);
      if (tracks.length === 0) throw new Error("No Spotify tracks were found.");
      setPreviewTracks(tracks);
    } catch (importError) {
      setPreviewTracks([]);
      setError(importError instanceof Error ? importError.message : "Could not import this Spotify playlist.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (previewTracks.length > 0) {
      onAdd(previewTracks);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const tracks = await tracksFromSpotifyImport(playlistUrl, fallbackText, keepMetadata);
      if (tracks.length === 0) throw new Error("No Spotify tracks were found.");
      onAdd(tracks);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import this Spotify playlist.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[var(--text)]">Import Spotify Playlist</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Tracks are queued without TIDAL URLs so you can assign Hi-Res links manually.</p>
          </div>
          <button type="button" className="rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)]" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--text)]">Spotify playlist URL</span>
            <Input
              value={playlistUrl}
              onChange={(event) => {
                setPlaylistUrl(event.target.value);
                setError("");
              }}
              placeholder="https://open.spotify.com/playlist/..."
              disabled={loading}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--text)]">Fallback track list</span>
            <textarea
              value={fallbackText}
              onChange={(event) => {
                setFallbackText(event.target.value);
                setError("");
              }}
              placeholder="Artist - Title"
              disabled={loading}
              className="min-h-28 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)]"
            />
          </label>
          <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
            <input type="checkbox" checked={keepMetadata} onChange={(event) => setKeepMetadata(event.target.checked)} disabled={loading} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--text)]">Keep Spotify metadata for manual TIDAL URL assignment</span>
              <span className="block text-xs leading-5 text-[var(--muted)]">Album names are preserved when Spotify exposes them.</span>
            </span>
          </label>
        </div>

        {error ? (
          <div className="mt-3 rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-danger-rgb),0.45)] bg-[color:rgba(var(--status-danger-rgb),0.12)] p-3 text-sm leading-6 text-[var(--status-danger)]">
            {error}
          </div>
        ) : null}

        {previewTracks.length > 0 ? (
          <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-[var(--text)]">Preview</p>
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">{previewTracks.length} track{previewTracks.length === 1 ? "" : "s"}</span>
            </div>
            <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
              {previewTracks.slice(0, 100).map((track, index) => (
                <li key={`${track.artist}-${track.title}-${index}`} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs">
                  <span className="text-[var(--muted)]">{index + 1}. </span>
                  <span className="text-[var(--text)]">{track.artist} - {track.title}</span>
                  {track.album ? <span className="text-[var(--muted)]"> ({track.album})</span> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="button" variant="secondary" onClick={() => void handlePreview()} disabled={loading}>
            {loading ? "Reading" : "Preview Tracks"}
          </Button>
          <Button type="button" onClick={() => void handleAdd()} disabled={loading}>
            Add to Queue
          </Button>
        </div>
      </div>
    </div>
  );
}

function AudioPolishPanel({ activeProfile, disabled, exportProfile, polishOptions, showAdvancedAudioEnhancements, onProfileChange, onPolishChange, onShowAdvancedAudioEnhancementsChange }: {
  activeProfile: (typeof exportProfiles)[number];
  disabled: boolean;
  exportProfile: ExportProfile;
  polishOptions: PolishOptions;
  showAdvancedAudioEnhancements: boolean;
  onProfileChange: (profile: ExportProfile) => void;
  onPolishChange: (patch: Partial<PolishOptions>) => void;
  onShowAdvancedAudioEnhancementsChange: (enabled: boolean) => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
      <CollapsibleSection
        title="Audio Polish"
        description="TIDAL starts from FLAC, then the API applies metadata, cover art, limiting, stereo widening, or phone AAC processing based on the selected profile."
        badge={`Output: ${activeProfile.extension.toUpperCase()}`}
      >
        <div className="grid gap-3">
          <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
            <input type="checkbox" checked={polishOptions.cleanMetadata} onChange={(event) => onPolishChange({ cleanMetadata: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--text)]">Clean title/artist metadata</span>
              <span className="block text-xs leading-5 text-[var(--muted)]">Normalizes file names and manifest rows while preserving TIDAL tags.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
            <input type="checkbox" checked={polishOptions.embedCover} onChange={(event) => onPolishChange({ embedCover: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--text)]">Embed cover art when available</span>
              <span className="block text-xs leading-5 text-[var(--muted)]">Keeps selected artwork in the combined export package.</span>
            </span>
          </label>
        </div>
      </CollapsibleSection>

      <div className="mt-3 grid gap-3">
        <CollapsibleSection title="Export Profile" description="Choose the container, metadata, and enhancement chain." badge={activeProfile.label}>
          <div className="grid gap-3">
            {exportProfiles.map((profile) => (
              <label
                key={profile.id}
                className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border bg-[var(--surface-subtle)] p-3 transition hover:border-[var(--accent-border)] ${exportProfile === profile.id ? "border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]" : profile.best ? "border-[color:rgba(var(--status-warning-rgb),0.6)]" : "border-[var(--border)]"}`}
              >
                <input type="radio" name="tidal-export-profile" checked={exportProfile === profile.id} onChange={() => onProfileChange(profile.id)} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text)]">{profile.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${profile.best ? "border-[color:rgba(var(--status-warning-rgb),0.6)] bg-[color:rgba(var(--status-warning-rgb),0.12)] text-[var(--status-warning)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"}`}>{profile.badge}</span>
                  </span>
                  <span className="block text-xs leading-5 text-[var(--muted)]">{profile.description}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--accent)]">{profile.features}</span>
                </span>
              </label>
            ))}
          </div>
        </CollapsibleSection>

        <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <input
            type="checkbox"
            checked={showAdvancedAudioEnhancements}
            onChange={(event) => onShowAdvancedAudioEnhancementsChange(event.target.checked)}
            disabled={disabled}
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--text)]">Show advanced audio enhancements</span>
            <span className="block text-xs leading-5 text-[var(--muted)]">Reveals optional ffmpeg filters, embedded audio artwork controls, metadata lookups, and analysis extras.</span>
          </span>
        </label>

        {showAdvancedAudioEnhancements ? (
          <>
            <CollapsibleSection title="Enhancements" description="Optional ffmpeg filters and external metadata lookups. Metadata and lyrics enrichment can slow long batches.">
              <div className="grid gap-2">
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.loudnorm} onChange={(event) => onPolishChange({ loudnorm: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Loudness Normalization (EBU R128)</span><span className="block text-xs text-[var(--muted)]">Applies loudnorm I=-16, LRA=11, TP=-1.5 to any selected output profile.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.trimSilence} onChange={(event) => onPolishChange({ trimSilence: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Trim Silence</span><span className="block text-xs text-[var(--muted)]">Removes roughly one second of leading/trailing silence below -50 dB.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.fadeInOut} onChange={(event) => onPolishChange({ fadeInOut: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Fade In/Out (1s)</span><span className="block text-xs text-[var(--muted)]">Adds a one-second triangular fade at the start and end of processed files.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.truePeakLimiter} onChange={(event) => onPolishChange({ truePeakLimiter: event.target.checked })} disabled={disabled || exportProfile === "audiophile-flac"} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">True Peak Limiting</span><span className="block text-xs text-[var(--muted)]">Prevents clipping after loudness processing.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.stereoEnhance} onChange={(event) => onPolishChange({ stereoEnhance: event.target.checked })} disabled={disabled || exportProfile === "audiophile-flac"} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Stereo Enhancement</span><span className="block text-xs text-[var(--muted)]">Adds a subtle wider soundstage for Hi-Fi MP3.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.embedAudioCover} onChange={(event) => onPolishChange({ embedAudioCover: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Embed Cover Art</span><span className="block text-xs text-[var(--muted)]">Writes available cover art into audio files. ZIP cover.jpg is still included when this is off.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.resizeCover} onChange={(event) => onPolishChange({ resizeCover: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Resize cover art (max 1200px)</span><span className="block text-xs text-[var(--muted)]">Converts external artwork to a compact JPEG before embedding.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.embedMetadata} onChange={(event) => onPolishChange({ embedMetadata: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Full ID3 Metadata</span><span className="block text-xs text-[var(--muted)]">Embeds album, year, exporter, and profile tags while preserving source tags where possible.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.musicbrainz} onChange={(event) => onPolishChange({ musicbrainz: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Enrich Metadata (MusicBrainz)</span><span className="block text-xs text-[var(--muted)]">Looks up genre, year, and fuller album metadata with a one-second delay between queries.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.lyrics} onChange={(event) => onPolishChange({ lyrics: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Embed Lyrics</span><span className="block text-xs text-[var(--muted)]">Fetches Lyrics.ovh text and writes it as unsynced lyrics metadata when available.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.verifyQuality} onChange={(event) => onPolishChange({ verifyQuality: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Verify Audio Quality</span><span className="block text-xs text-[var(--muted)]">Adds ffprobe/astats checks and includes quality-report.json in the ZIP.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.coverFallback} onChange={(event) => onPolishChange({ coverFallback: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Cover Art Archive Fallback</span><span className="block text-xs text-[var(--muted)]">Uses MusicBrainz release IDs to fetch front-500 artwork when no cover is supplied.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <input type="checkbox" checked={polishOptions.generatePlaylist} onChange={(event) => onPolishChange({ generatePlaylist: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span><span className="block text-sm font-medium text-[var(--text)]">Generate M3U8 Playlist</span><span className="block text-xs text-[var(--muted)]">Adds playlist.m3u8 for album and playlist ZIP exports.</span></span>
                </label>
              </div>
            </CollapsibleSection>

            <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
              <input type="checkbox" checked={polishOptions.includeAnalysis} onChange={(event) => onPolishChange({ includeAnalysis: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--text)]">Include export analysis manifest</span>
                <span className="block text-xs leading-5 text-[var(--muted)]">Adds processing diagnostics to manifest.json inside the final ZIP.</span>
              </span>
            </label>
          </>
        ) : null}
      </div>
    </div>
  );
}

function QueueActions({ state, busy, queueLength, reSearchableTidalUrlCount, doneCount, errorCount, showShortcutHelp, onReSearchTidalUrls, onProcess, onProcessAndExport, onExport, onMerge, onRetryFailed, onClear, onToggleShortcutHelp }: {
  state: DownloadState;
  busy: boolean;
  queueLength: number;
  reSearchableTidalUrlCount: number;
  doneCount: number;
  errorCount: number;
  showShortcutHelp: boolean;
  onReSearchTidalUrls: () => void;
  onProcess: () => void;
  onProcessAndExport: () => void;
  onExport: () => void;
  onMerge: () => void;
  onRetryFailed: () => void;
  onClear: () => void;
  onToggleShortcutHelp: () => void;
}) {
  const actionsDisabled = state === "processing" || busy;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onProcess} disabled={queueLength === 0 || actionsDisabled} variant="primary" className="inline-flex items-center gap-2">
        <Download className="h-4 w-4" aria-hidden="true" />
        {busy ? "Assigning URLs" : state === "processing" ? "Processing" : "Process Queue"}
      </Button>
      <Button onClick={onReSearchTidalUrls} disabled={reSearchableTidalUrlCount === 0 || actionsDisabled} variant="secondary" className="inline-flex items-center gap-2">
        {busy ? <RotateCcw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
        {busy ? "Searching TIDAL" : "Re-search TIDAL URLs"}
      </Button>
      <Button onClick={onProcessAndExport} disabled={queueLength === 0 || actionsDisabled} className="inline-flex items-center gap-2">
        <Download className="h-4 w-4" aria-hidden="true" />
        Process Queue & Export ZIP
      </Button>
      <Button onClick={onExport} disabled={doneCount === 0 || actionsDisabled} variant="secondary" className="inline-flex items-center gap-2">
        <Download className="h-4 w-4" aria-hidden="true" />
        Export ZIP
      </Button>
      <Button onClick={onMerge} disabled={doneCount === 0 || actionsDisabled} variant="secondary" className="inline-flex items-center gap-2">
        <Download className="h-4 w-4" aria-hidden="true" />
        Merge completed ZIPs
      </Button>
      <Button onClick={onRetryFailed} disabled={errorCount === 0 || actionsDisabled} variant="secondary" className="inline-flex items-center gap-2">
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Retry Failed
      </Button>
      <Button onClick={onClear} disabled={queueLength === 0 || actionsDisabled} variant="ghost" className="inline-flex items-center gap-2">
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Clear Queue
      </Button>
      <div className="relative ml-auto">
        <Button type="button" variant="ghost" aria-label="Keyboard shortcuts" onClick={onToggleShortcutHelp}>?</Button>
        {showShortcutHelp ? (
          <div className="absolute bottom-full right-0 z-10 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-5 text-[var(--muted)] shadow-lg">
            <p className="font-medium text-[var(--text)]">Keyboard shortcuts</p>
            <p><span className="font-mono text-[var(--text)]">Ctrl+Enter</span> Start processing</p>
            <p><span className="font-mono text-[var(--text)]">Escape</span> Stop processing</p>
            <p><span className="font-mono text-[var(--text)]">Space</span> Pause or resume</p>
            <p><span className="font-mono text-[var(--text)]">Delete</span> Remove selected queue item</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TokenExpiredAlert({ visible, loginLoading, loginMessage, onLogin, onRecheck }: {
  visible: boolean;
  loginLoading: boolean;
  loginMessage: string;
  onLogin: () => void;
  onRecheck: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-[color:rgba(var(--status-danger-rgb),0.5)] bg-[color:rgba(var(--status-danger-rgb),0.12)] p-3 text-sm leading-6 text-[var(--text)]" role="alert">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-danger)]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium text-[var(--status-danger)]">TIDAL token expired. Please log in and resume.</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">The queue stopped before starting the next item, and progress has been saved.</p>
            {loginMessage ? <p className="mt-2 text-xs leading-5 text-[var(--text)]">{loginMessage}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" onClick={onLogin} disabled={loginLoading} size="sm">
            {loginLoading ? "Opening Login" : "Login to TIDAL"}
          </Button>
          <Button type="button" onClick={onRecheck} disabled={loginLoading} variant="secondary" size="sm">
            Recheck
          </Button>
        </div>
      </div>
    </div>
  );
}

function QueuePanel({ queue, queueStats, importReport, showSkippedImportRows, disabled, coverPreviewUrl, previewingItemId, selectedItemId, bulkSelectedIds, draggedItemId, sort, actions, onToggleSkipped, onSelect, onToggleBulkSelection, onSelectAll, onClearBulkSelection, onBulkEdit, onBulkRetry, onBulkRemove, onSortChange, onDragStart, onDragEnd, onDrop, onPreview, onRemove, onRetry, onRetryDuplicate, onToggleTracks, onMove, onEdit }: {
  queue: QueueItem[];
  queueStats: { total: number; pending: number; done: number; error: number; skipped: number };
  importReport: ImportReport | null;
  showSkippedImportRows: boolean;
  disabled: boolean;
  coverPreviewUrl: string;
  previewingItemId: string | null;
  selectedItemId: string | null;
  bulkSelectedIds: string[];
  draggedItemId: string | null;
  sort: QueueSortSettings;
  actions?: ReactNode;
  onToggleSkipped: () => void;
  onSelect: (id: string) => void;
  onToggleBulkSelection: (id: string) => void;
  onSelectAll: () => void;
  onClearBulkSelection: () => void;
  onBulkEdit: (patch: Partial<Pick<QueueItem, "album" | "genre" | "year" | "priority">>) => void;
  onBulkRetry: () => void;
  onBulkRemove: () => void;
  onSortChange: (settings: QueueSortSettings) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (draggedId: string, targetId: string) => void;
  onPreview: (item: QueueItem) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onRetryDuplicate: (id: string) => void;
  onToggleTracks: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onEdit: (id: string, patch: Partial<QueueItem>) => void;
}) {
  const bulkSelected = new Set(bulkSelectedIds);
  return (
    <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--text)]">Export queue</p>
          <p className="text-sm text-[var(--muted)]">{queue.length === 0 ? "No TIDAL links queued yet." : `${queue.length} item${queue.length === 1 ? "" : "s"} queued for TIDAL.`}</p>
        </div>
        {queue.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            <span className="rounded-full border border-[var(--border)] px-2 py-1">Pending {queueStats.pending}</span>
            <span className="rounded-full border border-[var(--border)] px-2 py-1">Done {queueStats.done}</span>
            <span className="rounded-full border border-[var(--border)] px-2 py-1">Errors {queueStats.error}</span>
            <span className="rounded-full border border-[var(--border)] px-2 py-1">Skipped {queueStats.skipped}</span>
          </div>
        ) : null}
      </div>

      {importReport ? (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <Metric label="Imported" value={String(importReport.parsedCount)} />
          <Metric label="Queued" value={String(queue.length)} />
          <Metric label="Skipped rows" value={String(importReport.invalidCount + importReport.skippedCount)} />
        </div>
      ) : null}
      {importReport?.firstInvalidReason ? (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-warning-rgb),0.45)] bg-[color:rgba(var(--status-warning-rgb),0.12)] p-3 text-sm leading-6 text-[var(--text)]">
          <p className="break-words">{importReport.firstInvalidReason}</p>
          {importReport.invalidItems && importReport.invalidItems.length > 1 ? (
            <button type="button" className="mt-2 text-sm font-medium text-[var(--accent)] hover:underline" onClick={onToggleSkipped}>
              {showSkippedImportRows ? "Hide skipped rows" : `Show ${importReport.invalidItems.length} skipped rows`}
            </button>
          ) : null}
          {showSkippedImportRows && importReport.invalidItems?.length ? (
            <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
              {importReport.invalidItems.map((item, index) => (
                <li key={`${item}-${index}`} className="break-words text-xs text-[var(--muted)]">{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {queue.length > 0 ? (
        <div className="mt-3 grid gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-[var(--muted)]">Sort queue</span>
              <select
                value={sort.key}
                onChange={(event) => onSortChange({ key: event.target.value as QueueSortKey, direction: sort.direction })}
                disabled={disabled}
                className="min-h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-sm text-[var(--text)]"
              >
                <option value="manual">Manual order</option>
                <option value="artist">Artist</option>
                <option value="title">Title</option>
                <option value="album">Album</option>
                <option value="priority">Priority</option>
                <option value="status">Status</option>
                <option value="added">Added date</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-[var(--muted)]">Direction</span>
              <select
                value={sort.direction}
                onChange={(event) => onSortChange({ key: sort.key, direction: event.target.value as QueueSortDirection })}
                disabled={disabled || sort.key === "manual"}
                className="min-h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-sm text-[var(--text)] disabled:opacity-60"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </div>
          <BulkEditPanel
            disabled={disabled}
            selectedCount={bulkSelectedIds.length}
            totalCount={queue.length}
            onSelectAll={onSelectAll}
            onClear={onClearBulkSelection}
            onApply={onBulkEdit}
            onRetry={onBulkRetry}
            onRemove={onBulkRemove}
          />
        </div>
      ) : null}

      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
        <div className="queue-scroll max-h-96 overflow-y-auto [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
          {queue.length > 0 ? (
            <div className="grid gap-2 p-2">
              {queue.map((item, index) => (
                <QueueItemCard
                  key={item.id}
                  item={item}
                  index={index}
                  total={queue.length}
                  disabled={disabled}
                  coverPreviewUrl={coverPreviewUrl}
                  previewing={previewingItemId === item.id}
                  selected={selectedItemId === item.id}
                  bulkSelected={bulkSelected.has(item.id)}
                  dragging={draggedItemId === item.id}
                  onSelect={() => onSelect(item.id)}
                  onToggleBulkSelection={() => onToggleBulkSelection(item.id)}
                  onDragStart={() => onDragStart(item.id)}
                  onDragEnd={onDragEnd}
                  onDrop={() => {
                    if (draggedItemId) onDrop(draggedItemId, item.id);
                  }}
                  onPreview={() => onPreview(item)}
                  onRemove={() => onRemove(item.id)}
                  onRetry={() => onRetry(item.id)}
                  onRetryDuplicate={() => onRetryDuplicate(item.id)}
                  onToggleTracks={() => onToggleTracks(item.id)}
                  onMove={(direction) => onMove(item.id, direction)}
                  onEdit={(patch) => onEdit(item.id, patch)}
                />
              ))}
            </div>
          ) : (
            <p className="m-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 py-4 text-sm text-[var(--muted)]">
              Add a TIDAL URL or import a JSON list to begin.
            </p>
          )}
          {actions ? (
            <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BulkEditPanel({ disabled, selectedCount, totalCount, onSelectAll, onClear, onApply, onRetry, onRemove }: {
  disabled: boolean;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onApply: (patch: Partial<Pick<QueueItem, "album" | "genre" | "year" | "priority">>) => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const [album, setAlbum] = useState("");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [priority, setPriority] = useState<"" | QueuePriority>("");
  const canApply = selectedCount > 0 && !disabled && Boolean(album.trim() || genre.trim() || year.trim() || priority);
  const apply = () => {
    const patch: Partial<Pick<QueueItem, "album" | "genre" | "year" | "priority">> = {};
    if (album.trim()) patch.album = album.trim();
    if (genre.trim()) patch.genre = genre.trim();
    if (year.trim()) patch.year = year.trim();
    if (priority) patch.priority = priority;
    onApply(patch);
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <span className="rounded-full border border-[var(--border)] px-2 py-1">{selectedCount}/{totalCount} selected</span>
        <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 hover:bg-[var(--accent-soft)] disabled:opacity-50" onClick={onSelectAll} disabled={disabled || totalCount === 0}>Select visible</button>
        <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 hover:bg-[var(--accent-soft)] disabled:opacity-50" onClick={onClear} disabled={disabled || selectedCount === 0}>Clear</button>
        <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 hover:bg-[var(--accent-soft)] disabled:opacity-50" onClick={onRetry} disabled={disabled || selectedCount === 0}>Retry selected</button>
        <button type="button" className="rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-danger-rgb),0.45)] px-2 py-1 text-[var(--status-danger)] hover:bg-[color:rgba(var(--status-danger-rgb),0.12)] disabled:opacity-50" onClick={onRemove} disabled={disabled || selectedCount === 0}>Remove selected</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px_110px_auto]">
        <Input aria-label="Bulk album" value={album} onChange={(event) => setAlbum(event.target.value)} placeholder="Album" disabled={disabled || selectedCount === 0} className="text-sm" />
        <Input aria-label="Bulk genre" value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Genre" disabled={disabled || selectedCount === 0} className="text-sm" />
        <Input aria-label="Bulk year" value={year} onChange={(event) => setYear(event.target.value)} placeholder="Year" disabled={disabled || selectedCount === 0} className="text-sm" />
        <select
          aria-label="Bulk priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as "" | QueuePriority)}
          disabled={disabled || selectedCount === 0}
          className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-sm text-[var(--text)] disabled:opacity-60"
        >
          <option value="">Priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <Button type="button" size="sm" onClick={apply} disabled={!canApply}>Apply</Button>
      </div>
    </div>
  );
}

const QueueItemCard = memo(function QueueItemCard({ item, index, total, disabled, coverPreviewUrl, previewing, selected, bulkSelected, dragging, onSelect, onToggleBulkSelection, onDragStart, onDragEnd, onDrop, onPreview, onRemove, onRetry, onRetryDuplicate, onToggleTracks, onMove, onEdit }: {
  item: QueueItem;
  index: number;
  total: number;
  disabled: boolean;
  coverPreviewUrl: string;
  previewing: boolean;
  selected: boolean;
  bulkSelected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onToggleBulkSelection: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onPreview: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onRetryDuplicate: () => void;
  onToggleTracks: () => void;
  onMove: (direction: -1 | 1) => void;
  onEdit: (patch: Partial<QueueItem>) => void;
}) {
  const [editingMetadata, setEditingMetadata] = useState(false);
  const priority = priorityIndicator(item.priority);
  const trackCount = item.albumTracks?.length ?? 0;
  const canToggleTracks = item.status === "done" && (trackCount > 0 || Boolean(item.zipBlob));
  const artworkUrl = item.coverArt || coverPreviewUrl;
  return (
    <div
      id={`queue-item-${item.id}`}
      className={`min-w-0 rounded-[var(--radius-sm)] border bg-[var(--surface)] px-3 py-3 transition ${selected ? "border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]" : "border-[var(--border)]"} ${dragging ? "opacity-60" : ""}`}
      draggable={!disabled}
      onClick={onSelect}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!disabled) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <label className="mt-1 flex shrink-0 items-center" onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              aria-label={`Select ${formatQueueItemLine(item)} for bulk edit`}
              checked={bulkSelected}
              onChange={onToggleBulkSelection}
              disabled={disabled}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
          {artworkUrl ? (
            <img src={artworkUrl} alt="" className="h-14 w-14 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] object-cover" />
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input aria-label="Title" value={item.title ?? ""} onChange={(event) => onEdit({ title: event.target.value })} placeholder="Title" disabled={disabled} className="text-sm" />
              <Input aria-label="Artist" value={item.artist ?? ""} onChange={(event) => onEdit({ artist: event.target.value })} placeholder="Artist" disabled={disabled} className="text-sm" />
            </div>
            <Input
              aria-label="TIDAL URL"
              value={item.url ?? ""}
              onChange={(event) => {
                const nextUrl = event.target.value.trim();
                onEdit({
                  url: nextUrl,
                  status: nextUrl ? "pending" : item.status,
                  progress: nextUrl ? 0 : item.progress,
                  progressMessage: nextUrl ? undefined : item.progressMessage,
                  errorMsg: nextUrl ? undefined : "No TIDAL URL - will be skipped.",
                  tidalMatchTitle: undefined,
                  tidalMatchArtist: undefined,
                  tidalMatchAlbum: undefined,
                  tidalMatchDurationSec: undefined,
                  tidalCandidateCount: undefined,
                  isPlaylist: nextUrl ? isAlbumOrPlaylist(nextUrl) : false,
                });
              }}
              placeholder="TIDAL URL"
              disabled={disabled}
              className="text-sm"
            />
{item.tidalMatchTitle || item.tidalMatchArtist ? (
              <p className="break-words text-xs leading-5 text-[var(--status-success)]">
                Matched TIDAL: {[item.tidalMatchArtist, item.tidalMatchTitle].filter(Boolean).join(" - ")}
                {item.tidalMatchAlbum ? ` - ${item.tidalMatchAlbum}` : ""}
              </p>
            ) : null}
            {!item.url ? <p className="text-xs text-[var(--status-warning)]">No TIDAL URL - will be skipped</p> : null}
            {item.status === "skipped" && item.tidalCandidates && item.tidalCandidates.length > 0 ? (
              <label className="grid gap-1" onClick={(event) => event.stopPropagation()}>
                <span className="text-xs font-medium text-[var(--status-warning)]">Pick correct TIDAL match</span>
                <select
                  aria-label="Pick correct TIDAL match"
                  defaultValue=""
                  disabled={disabled}
                  onChange={(event) => {
                    const chosen = item.tidalCandidates!.find((c) => c.url === event.target.value);
                    if (!chosen) return;
                    onEdit({
                      status: "pending",
                      url: chosen.url,
                      tidalMatchTitle: chosen.title,
                      tidalMatchArtist: chosen.artist,
                      tidalMatchAlbum: chosen.album,
                      tidalMatchDurationSec: chosen.duration,
                      tidalMatchConfidence: 0.6,
                      errorMsg: undefined,
                      progressMessage: `Manually matched: ${chosen.artist} - ${chosen.title}`,
                      isPlaylist: false,
                    });
                  }}
                  className="min-h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-xs text-[var(--text)]"
                >
                  <option value="" disabled>Choose from {item.tidalCandidates.length} candidate{item.tidalCandidates.length === 1 ? "" : "s"}…</option>
                  {item.tidalCandidates.map((candidate) => (
                    <option key={candidate.url} value={candidate.url}>
                      {candidate.artist} – {candidate.title}
                      {candidate.album ? ` (${candidate.album})` : ""}
                      {candidate.duration ? ` · ${Math.round(candidate.duration / 60)}m${String(candidate.duration % 60).padStart(2, "0")}s` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {editingMetadata ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <Input aria-label="Album" value={item.album ?? ""} onChange={(event) => onEdit({ album: event.target.value })} placeholder="Album" disabled={disabled} className="text-sm" />
                <Input aria-label="Genre" value={item.genre ?? ""} onChange={(event) => onEdit({ genre: event.target.value })} placeholder="Genre" disabled={disabled} className="text-sm" />
                <Input aria-label="Year" value={item.year ?? ""} onChange={(event) => onEdit({ year: event.target.value })} placeholder="Year" disabled={disabled} className="text-sm" />
              </div>
            ) : null}
            {item.duplicateExistingFile ? (
              <p className="break-words text-xs leading-5 text-[var(--status-warning)]">
                Duplicate: <a href={localFileHref(item.duplicateExistingFile)} className="underline hover:text-[var(--text)]">{item.duplicateExistingFile}</a>
              </p>
            ) : null}
            {item.alreadyDownloaded ? (
              <p className="inline-flex items-center gap-1 break-words text-xs leading-5 text-[var(--status-success)]" title="Already in your library">
                <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Already downloaded{item.libraryDownloadedAt ? ` on ${new Date(item.libraryDownloadedAt).toLocaleDateString()}` : ""}
                {item.forceDownload ? " - force re-download enabled" : ""}
              </p>
            ) : null}
            {item.zipFileName ? <p className="break-words text-xs text-[var(--muted)]">{item.zipFileName}</p> : null}
            {item.previewUrl ? (
              <audio id={`preview-${item.id}`} controls src={item.previewUrl} className="mt-1 w-full" />
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}>{item.status}</span>
          {item.duplicateExistingFile ? <span className="rounded-full border border-[color:rgba(var(--status-warning-rgb),0.45)] bg-[color:rgba(var(--status-warning-rgb),0.12)] px-2 py-0.5 text-xs text-[var(--status-warning)]">Duplicate</span> : null}
          {item.alreadyDownloaded ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] px-2 py-0.5 text-xs text-[var(--status-success)]" title="Already in your library">
              <CheckCircle className="h-3 w-3" aria-hidden="true" />
              Library
            </span>
          ) : null}
          <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
            <span className={`rounded-full border px-2 py-0.5 ${priority.className}`}>{priority.label}</span>
            <select
              aria-label="Priority"
              value={item.priority}
              onChange={(event) => onEdit({ priority: event.target.value as QueuePriority })}
              disabled={disabled}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-1 py-0.5 text-xs text-[var(--text)]"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          {item.isPlaylist ? <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">album/playlist</span> : null}
          <div className="flex flex-wrap justify-end gap-1">
            <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={() => onMove(-1)} disabled={disabled || index === 0}>Up</button>
            <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={() => onMove(1)} disabled={disabled || index === total - 1}>Down</button>
            <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={() => setEditingMetadata((value) => !value)} disabled={disabled}>{editingMetadata ? "Close" : "Edit"}</button>
            <button type="button" className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={onPreview} disabled={disabled || previewing || item.status === "processing" || item.status === "searching" || !item.url}>
              <Play className="h-3 w-3" aria-hidden="true" />
              {previewing ? "Previewing" : "Preview"}
            </button>
            {item.duplicateExistingFile || (item.alreadyDownloaded && !item.forceDownload) ? (
              <button type="button" className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--accent-border)] px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={onRetryDuplicate} disabled={disabled}>
                Force re-download
              </button>
            ) : null}
            {canToggleTracks ? (
              <button type="button" className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={onToggleTracks} disabled={disabled}>
                {item.tracksExpanded ? "Collapse" : `Tracks${trackCount ? ` (${trackCount})` : ""}`}
              </button>
            ) : null}
            {item.status === "error" ? (
              <>
                <button type="button" className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={onRetry} disabled={disabled}>
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
                <button type="button" className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-danger-rgb),0.45)] px-2 py-1 text-xs text-[var(--status-danger)] hover:bg-[color:rgba(var(--status-danger-rgb),0.12)] disabled:opacity-40" onClick={onRemove} disabled={disabled}>
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  Dismiss
                </button>
              </>
            ) : (
              <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={onRemove} disabled={disabled}>Remove</button>
            )}
          </div>
        </div>
      </div>
      {typeof item.progress === "number" && item.progress > 0 ? (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--accent-soft)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }} />
          </div>
          {item.progressMessage ? <p className="mt-1 text-xs text-[var(--muted)]">{item.progressMessage}</p> : null}
        </div>
      ) : null}
      {item.errorMsg ? <p className="mt-2 break-words text-xs leading-5 text-[var(--status-danger)]">{item.errorMsg}</p> : null}
      {item.tracksExpanded ? (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-[var(--text)]">ZIP tracks</p>
            <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">{trackCount} item{trackCount === 1 ? "" : "s"}</span>
          </div>
          {trackCount > 0 ? (
            <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
              {item.albumTracks?.map((track, trackIndex) => (
                <li key={`${track.file}-${trackIndex}`} className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-xs sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center">
                  <span className="text-[var(--muted)]">#{track.trackNumber ?? trackIndex + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[var(--text)]">{[track.artist, track.title].filter(Boolean).join(" - ") || pathName(track.file)}</span>
                    <span className="block truncate text-[var(--muted)]">{track.file}</span>
                  </span>
                  {track.duration ? <span className="text-[var(--muted)]">{formatDurationSeconds(track.duration)}</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-[var(--muted)]">No individual track metadata was found in this ZIP.</p>
          )}
        </div>
      ) : null}
    </div>
  );
});

function SessionProgressCard({ progress, state, cooldownLabel, cooldownRemaining, isPaused }: {
  progress: SessionProgress;
  state: DownloadState;
  cooldownLabel: string;
  cooldownRemaining: string;
  isPaused: boolean;
}) {
  if (progress.total === 0 && !cooldownRemaining && state !== "processing") return null;
  return (
    <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text)]">Session progress</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {isPaused ? "Paused after the current step." : state === "processing" ? progress.label : "Ready for the next TIDAL batch."}
          </p>
        </div>
        <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--text)]">
          {progress.pct}%
        </span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--surface)]" role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${progress.pct}%` }} />
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <Metric label="Processed" value={`${progress.processed}/${progress.total}`} />
        <Metric label="Avg song" value={progress.avgSeconds ? formatDurationSeconds(progress.avgSeconds) : "Pending"} />
        <Metric label="Estimated left" value={state === "processing" ? progress.remaining : "Pending"} />
      </div>
      {cooldownRemaining ? (
        <p className="mt-3 rounded-[var(--radius-sm)] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--text)]">
          {cooldownLabel}: {cooldownRemaining}
        </p>
      ) : null}
    </div>
  );
}

function StatisticsDashboard({ statistics, state }: { statistics: QueueStatistics; state: DownloadState }) {
  return (
    <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
      <CollapsibleSection
        title="Session Statistics"
        description={state === "processing" ? "Updating as each ZIP completes." : "Batch totals from the current queue."}
        badge={`${statistics.downloaded}/${statistics.total} done`}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <Metric label="Queued" value={String(statistics.total)} />
          <Metric label="Downloaded" value={String(statistics.downloaded)} />
          <Metric label="Failed" value={String(statistics.failed)} />
          <Metric label="Skipped" value={String(statistics.skipped)} />
          <Metric label="Data" value={formatBytes(statistics.dataBytes)} />
          <Metric label="Avg file" value={formatBytes(statistics.averageBytes)} />
          <Metric label="Playtime" value={statistics.totalDurationSec ? formatDurationSeconds(statistics.totalDurationSec) : "Pending"} />
          <Metric label="Elapsed" value={statistics.elapsedSec ? formatDurationSeconds(statistics.elapsedSec) : "Pending"} />
          <Metric label="ETA" value={statistics.estimatedRemainingSec ? formatDurationSeconds(statistics.estimatedRemainingSec) : "Pending"} />
        </div>
      </CollapsibleSection>
    </div>
  );
}

function SmartLibraryPanel({ tracks, loading, error, autoSkipDownloaded, downloadDirectoryName, disabled, onToggleAutoSkip, onView, onClear, onRefresh, onChooseDirectory, onCopyLibrary }: {
  tracks: LibraryTrackRecord[];
  loading: boolean;
  error: string;
  autoSkipDownloaded: boolean;
  downloadDirectoryName: string;
  disabled: boolean;
  onToggleAutoSkip: (enabled: boolean) => void;
  onView: () => void;
  onClear: () => void;
  onRefresh: () => void;
  onChooseDirectory: () => void;
  onCopyLibrary: () => void;
}) {
  const latest = tracks[0];
  return (
    <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
      <CollapsibleSection
        title="Library"
        description="Turrex Smart Library remembers every ZIP that reached disk and prevents duplicate downloads."
        badge={`${tracks.length} track${tracks.length === 1 ? "" : "s"}`}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-2 sm:grid-cols-3">
            <Metric label="Downloaded tracks" value={loading ? "Loading" : String(tracks.length)} />
            <Metric label="Most recent" value={latest ? `${latest.artist} - ${latest.title}` : "None yet"} />
            <Metric label="Saved folder" value={downloadDirectoryName || "Browser Downloads"} />
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Button type="button" size="sm" onClick={onView} disabled={loading}>
              View Library
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={loading}>
              Refresh
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onChooseDirectory} disabled={disabled || loading}>
              Choose folder
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onCopyLibrary} disabled={loading || tracks.length === 0}>
              Copy Library
            </Button>
            <Button type="button" size="sm" variant="danger" onClick={onClear} disabled={disabled || loading || tracks.length === 0}>
              Clear Library
            </Button>
          </div>
        </div>
        <label className="mt-3 flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <input
            type="checkbox"
            checked={autoSkipDownloaded}
            onChange={(event) => onToggleAutoSkip(event.target.checked)}
            disabled={disabled}
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--text)]">Auto-skip downloaded songs</span>
            <span className="block text-xs leading-5 text-[var(--muted)]">Enabled by default. Use Force re-download on a row when you intentionally want another copy.</span>
          </span>
        </label>
        {latest ? (
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            Last saved {formatLibraryDate(latest.downloadedAt)}: {latest.artist} - {latest.title} ({formatBytes(latest.fileSize)}).
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-warning-rgb),0.45)] bg-[color:rgba(var(--status-warning-rgb),0.12)] px-3 py-2 text-xs leading-5 text-[var(--text)]">
            {error}
          </p>
        ) : null}
      </CollapsibleSection>
    </div>
  );
}

function OcrLibraryPanel({
  library,
  loading,
  selectedIds,
  query,
  disabled,
  onRefresh,
  onClear,
  onQueryChange,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onSearchUrls,
  onSendToDownloader,
  onDelete,
}: {
  library: OcrLibraryEntry[];
  loading: boolean;
  selectedIds: string[];
  query: string;
  disabled: boolean;
  onRefresh: () => void;
  onClear: () => void;
  onQueryChange: (q: string) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSearchUrls: (ids: string[]) => void;
  onSendToDownloader: (ids: string[]) => void;
  onDelete: (id: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library;
    return library.filter((song) =>
      [song.artist, song.title, song.album, song.tidalUrl, song.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [library, query]);

  return (
    <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
      <CollapsibleSection
        title="OCR Song Library"
        description="Persistent local storage of every extracted song. Search TIDAL URLs or send directly to the downloader."
        badge={`${library.length} song${library.length === 1 ? "" : "s"}`}
        defaultOpen={false}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          <Button size="sm" onClick={onRefresh} disabled={loading}>Refresh</Button>
          <Button size="sm" variant="secondary" disabled={selectedIds.length === 0 || disabled} onClick={() => onSearchUrls(selectedIds)}>
            Search URLs for selected
          </Button>
          <Button size="sm" variant="secondary" disabled={selectedIds.length === 0} onClick={() => onSendToDownloader(selectedIds)}>
            Send to Downloader
          </Button>
          <Button size="sm" variant="ghost" onClick={onSelectAll} disabled={filtered.length === 0}>Select all</Button>
          <Button size="sm" variant="ghost" onClick={onClearSelection} disabled={selectedIds.length === 0}>Clear selection</Button>
          <Button size="sm" variant="danger" onClick={onClear} disabled={library.length === 0 || disabled}>Clear Library</Button>
        </div>
        <Input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Filter by artist, title, status, URL…" className="mb-3 text-sm" />
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {library.length === 0
              ? "No songs yet. Upload images to the OCR Extractor to populate this library."
              : "No songs match this filter."}
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto [scrollbar-width:thin]">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="sticky top-0 bg-[var(--surface-subtle)] text-[var(--muted)] uppercase">
                <tr>
                  <th className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filtered.length && filtered.length > 0}
                      onChange={(e) => e.target.checked ? onSelectAll() : onClearSelection()}
                      className="accent-[var(--accent)]"
                    />
                  </th>
                  <th className="px-2 py-1">Artist</th>
                  <th className="px-2 py-1">Title</th>
                  <th className="px-2 py-1">Album</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">TIDAL URL</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((song) => (
                  <tr key={song.id} className="border-t border-[var(--border)] align-top">
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(song.id)}
                        onChange={() => onToggleSelect(song.id)}
                        className="accent-[var(--accent)]"
                      />
                    </td>
                    <td className="px-2 py-1 text-[var(--text)]">{song.artist || "–"}</td>
                    <td className="px-2 py-1 text-[var(--text)]">{song.title || "–"}</td>
                    <td className="px-2 py-1 text-[var(--muted)]">{song.album || "–"}</td>
                    <td className="px-2 py-1">
                      <span className={`rounded-full border px-2 py-0.5 ${
                        song.status === "assigned" ? "border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] text-[var(--status-success)]"
                        : song.status === "error" ? "border-[color:rgba(var(--status-danger-rgb),0.45)] bg-[color:rgba(var(--status-danger-rgb),0.12)] text-[var(--status-danger)]"
                        : song.status === "searching" ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]"
                        : "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)]"
                      }`}>
                        {song.status}
                      </span>
                    </td>
                    <td className="px-2 py-1 max-w-[200px]">
                      {song.tidalUrl
                        ? <a href={song.tidalUrl} target="_blank" rel="noreferrer" className="break-all text-[var(--accent)] hover:underline">Link</a>
                        : <span className="text-[var(--muted)]">–</span>}
                    </td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        className="text-[var(--status-danger)] hover:underline text-xs"
                        onClick={() => onDelete(song.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

function SmartLibraryModal({ tracks, loading, error, onClose, onClear, onRefresh }: {
  tracks: LibraryTrackRecord[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onClear: () => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<LibrarySortKey>("downloadedAt");
  const [sortDirection, setSortDirection] = useState<LibrarySortDirection>("desc");
  const [page, setPage] = useState(0);
  const pageSize = 100;
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matching = normalizedQuery
      ? tracks.filter((track) => [track.artist, track.title, track.album, track.trackUrl, track.quality, track.profile]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)))
      : tracks;
    return [...matching].sort((a, b) => compareLibraryTracks(a, b, sortKey, sortDirection));
  }, [query, sortDirection, sortKey, tracks]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [query, sortDirection, sortKey]);

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Turrex Smart Library">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Library className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-[var(--text)]">Turrex Smart Library</h2>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">{tracks.length} saved track{tracks.length === 1 ? "" : "s"}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={loading}>Refresh</Button>
            <Button type="button" size="sm" variant="danger" onClick={onClear} disabled={loading || tracks.length === 0}>Clear Library</Button>
            <Button type="button" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className="grid gap-3 border-b border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:grid-cols-[minmax(0,1fr)_160px_140px]">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search artist, title, album, URL, quality" className="text-sm" />
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as LibrarySortKey)}
            className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-sm text-[var(--text)]"
          >
            <option value="downloadedAt">Downloaded date</option>
            <option value="artist">Artist</option>
            <option value="title">Title</option>
            <option value="album">Album</option>
            <option value="quality">Quality</option>
            <option value="fileSize">File size</option>
          </select>
          <select
            value={sortDirection}
            onChange={(event) => setSortDirection(event.target.value as LibrarySortDirection)}
            className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-sm text-[var(--text)]"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        {error ? <p className="border-b border-[var(--border)] px-4 py-2 text-sm text-[var(--status-warning)]">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="sticky top-0 bg-[var(--surface-subtle)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Artist</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Album</th>
                <th className="px-3 py-2 font-medium">Quality</th>
                <th className="px-3 py-2 font-medium">Profile</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Downloaded</th>
                <th className="px-3 py-2 font-medium">URL</th>
              </tr>
            </thead>
            <tbody>
              {visible.length > 0 ? visible.map((track) => (
                <tr key={track.trackUrl} className="border-t border-[var(--border)] align-top">
                  <td className="max-w-[180px] px-3 py-2 text-[var(--text)]">{track.artist}</td>
                  <td className="max-w-[220px] px-3 py-2 text-[var(--text)]">{track.title}</td>
                  <td className="max-w-[200px] px-3 py-2 text-[var(--muted)]">{track.album || "-"}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{track.quality}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{track.profile}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{formatBytes(track.fileSize)}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{formatLibraryDate(track.downloadedAt)}</td>
                  <td className="max-w-[240px] px-3 py-2">
                    <a href={track.trackUrl} target="_blank" rel="noreferrer" className="break-all text-[var(--accent)] hover:underline">{track.trackUrl}</a>
                    {track.filePath ? <span className="mt-1 block break-words text-xs text-[var(--muted)]">{track.filePath}</span> : null}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-[var(--muted)]">
                    {loading ? "Loading library..." : "No matching library tracks."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] p-4 text-sm text-[var(--muted)]">
          <span>Showing {filtered.length === 0 ? 0 : safePage * pageSize + 1}-{Math.min(filtered.length, safePage * pageSize + visible.length)} of {filtered.length}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={safePage === 0}>Previous</Button>
            <span className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)]">Page {safePage + 1}/{pageCount}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={safePage >= pageCount - 1}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(modal, document.body);
}

function BatchRecoveryReport({ items, state, onRetryAll, onRetry }: {
  items: QueueItem[];
  state: DownloadState;
  onRetryAll: () => void;
  onRetry: (id: string) => void;
}) {
  const failed = items.filter((item) => item.status === "error");
  const downloaded = items.filter((item) => item.status === "done").length;
  const skipped = items.filter((item) => item.status === "skipped" || !item.url).length;
  const hasResults = items.some((item) => item.status === "done" || item.status === "error" || item.status === "skipped");
  if (state === "processing" || !hasResults) return null;
  return (
    <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--text)]">Batch recovery report</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{downloaded} downloaded, {failed.length} failed, {skipped} skipped. Queue progress is saved for recovery.</p>
        </div>
        <Button type="button" size="sm" onClick={onRetryAll} disabled={failed.length === 0}>Retry All Failed</Button>
      </div>
      {failed.length ? (
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
          {failed.map((item) => (
            <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-danger-rgb),0.35)] bg-[color:rgba(var(--status-danger-rgb),0.08)] p-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-[var(--text)]">{formatQueueItemLine(item)}</p>
                <p className="mt-1 break-words text-xs leading-5 text-[var(--status-danger)]">{item.errorMsg || "Unknown failure"}</p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => onRetry(item.id)}>Retry</Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ErrorLogPanel({ entries, isOpen, onToggle, onClear }: {
  entries: ErrorLogEntry[];
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) => [entry.timestamp, entry.url, entry.title, entry.artist, entry.message, stringifyErrorPayload(entry.body)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized)));
  }, [entries, query]);
  return (
    <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--accent-soft)]"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--text)]">Error log</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{entries.length ? `${entries.length} recent issue${entries.length === 1 ? "" : "s"} kept for recovery.` : "Hidden until something needs attention."}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--muted)] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="border-t border-[var(--border)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted)]">{entries.length ? `${filteredEntries.length} of ${entries.length} download, preview, and ZIP errors.` : "No errors recorded."}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => downloadTextBlob(JSON.stringify(entries, null, 2), `turrex-error-log-${dateStamp(new Date())}.json`, "application/json")} disabled={entries.length === 0}>Export</Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={entries.length === 0}>Clear</Button>
            </div>
          </div>
          {entries.length ? <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search errors, songs, URLs, or timestamps" className="mt-3 text-sm" /> : null}
          {entries.length ? (
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {filteredEntries.map((entry) => (
                <div key={entry.id} className="rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-danger-rgb),0.35)] bg-[color:rgba(var(--status-danger-rgb),0.08)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-medium text-[var(--text)]">{formatQueueItemLine(entry)}</p>
                    <time className="shrink-0 text-xs text-[var(--muted)]" dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time>
                  </div>
                  <p className="mt-1 break-words text-sm leading-5 text-[var(--status-danger)]">{entry.message}</p>
                  {entry.body ? <p className="mt-1 line-clamp-3 break-words font-mono text-xs leading-5 text-[var(--muted)]">{stringifyErrorPayload(entry.body)}</p> : null}
                </div>
              ))}
              {filteredEntries.length === 0 ? <p className="py-4 text-center text-sm text-[var(--muted)]">No errors match this search.</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProgressCard({ state, queueStats, errorMessage, lastExportName }: {
  state: DownloadState;
  queueStats: { total: number; processing: number; done: number; error: number };
  errorMessage: string;
  lastExportName: string;
}) {
  const pct = queueStats.total ? Math.round(((queueStats.done + queueStats.error) / queueStats.total) * 100) : 0;
  return (
    <Card className="p-4 sm:p-6" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">Queue status</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{state === "processing" ? "TIDAL jobs are running locally." : state === "done" ? "Completed items are ready for ZIP export." : "Waiting for TIDAL URLs."}</p>
        </div>
        <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-sm font-medium text-[var(--text)]">{pct}%</span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--surface-subtle)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
        <Metric label="Queue" value={String(queueStats.total)} />
        <Metric label="Processing" value={String(queueStats.processing)} />
        <Metric label="Done" value={String(queueStats.done)} />
        <Metric label="Errors" value={String(queueStats.error)} />
      </div>
      {lastExportName ? <p className="mt-4 break-words text-sm text-[var(--status-success)]">Downloaded {lastExportName}</p> : null}
      {state === "error" && errorMessage ? <p className="mt-4 break-words text-sm leading-6 text-[var(--status-danger)]">{errorMessage}</p> : null}
    </Card>
  );
}

function DebugDetailsCard({ payload }: { payload: string }) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">Debug details</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">TIDAL status, ffmpeg runtime, queue state, and ZIP options.</p>
        </div>
        <Button size="sm" onClick={() => {
          if (typeof navigator !== "undefined" && navigator.clipboard) void navigator.clipboard.writeText(payload);
        }}>
          Copy diagnostics
        </Button>
      </div>
      <textarea className="mt-4 h-80 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 font-mono text-xs leading-5 text-[var(--muted)]" readOnly value={payload} />
    </Card>
  );
}

function TidalDiagnosticsCard({ mounted, diagnostics, diagnosticsError, diagnosticsLoading, loginLoading, loginMessage, onLogin, onRecheck }: {
  mounted: boolean;
  diagnostics: TidalDiagnostics | null;
  diagnosticsError: string;
  diagnosticsLoading: boolean;
  loginLoading: boolean;
  loginMessage: string;
  onLogin: () => void;
  onRecheck: () => void;
}) {
  const status = tidalStatus(mounted ? diagnostics : null, diagnosticsLoading);
  const primaryFix = diagnostics?.fixes[0];
  const tokenExpiry = tokenExpiryStatus(diagnostics);
  const showLoginButton = shouldShowTidalLogin(diagnostics) || tokenExpiry.promptLogin;

  return (
    <Card className="h-fit p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">TIDAL Diagnostics</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Checks the CLI and transcoder pieces used by /api/download/tidal.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
      </div>

      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{status.description}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">TIDAL requests use tidekeeper first, then slsk-batchdl only when fallback is enabled and needed.</p>

      <div className="mt-4 grid gap-2">
        <ToolRow label="TIDAL CLI" ok={Boolean(diagnostics?.tidal?.available)} detail={compactVersion(diagnostics?.tidal?.version) || (diagnostics?.tidal?.errorCode ? `Error ${diagnostics.tidal.errorCode}` : "Waiting")} />
        <ToolRow label="TIDAL Search" ok={Boolean(diagnostics?.searchAvailable)} detail={diagnostics ? (diagnostics.searchAvailable ? "Token-backed search ready" : "Login token required") : "Waiting"} />
        <ToolRow label="Update" ok={!diagnostics?.tidal?.updateAvailable} detail={diagnostics?.tidal ? (diagnostics.tidal.updateAvailable ? `Update available${diagnostics.tidal.latestVersion ? ` (${diagnostics.tidal.latestVersion})` : ""}` : diagnostics.tidal.latestVersion ? `Current latest: ${diagnostics.tidal.latestVersion}` : "No update reported") : "Waiting"} />
        <ToolRow label="TIDAL config" ok={Boolean(diagnostics?.tidal?.configExists || diagnostics?.tidal?.loggedIn)} detail={diagnostics?.tidal ? ((diagnostics.tidal.configExists || diagnostics.tidal.loggedIn) ? `Logged in (${diagnostics.tidal.configPath ?? ".tidal-dl.token.json"})` : `Not logged in (${diagnostics.tidal.configPath ?? "~/.tidal-dl.token.json"})`) : "Waiting"} />
        <ToolRow label="Token expiry" ok={tokenExpiry.ok} detail={tokenExpiry.detail} />
        <ToolRow label="Soulseek" ok={Boolean(diagnostics?.soulseek?.available)} detail={compactVersion(diagnostics?.soulseek?.version) || (diagnostics?.soulseek?.errorCode ? `Error ${diagnostics.soulseek.errorCode}` : "Waiting")} />
        <ToolRow label="ffmpeg" ok={Boolean(diagnostics?.ffmpeg?.available)} detail={compactVersion(diagnostics?.ffmpeg?.version) || (diagnostics?.ffmpeg?.errorCode ? `Error ${diagnostics.ffmpeg.errorCode}` : "Waiting")} />
        <ToolRow label="ffprobe" ok={Boolean(diagnostics?.ffprobe?.available)} detail={compactVersion(diagnostics?.ffprobe?.version) || (diagnostics?.ffprobe?.errorCode ? `Error ${diagnostics.ffprobe.errorCode}` : "Waiting")} />
        <ToolRow label="Lyrics API" ok={Boolean(diagnostics?.lyricsAvailable)} detail={diagnostics ? (diagnostics.lyricsAvailable ? "Reachable" : "Unavailable or timed out") : "Waiting"} />
        <ToolRow label="MusicBrainz" ok={Boolean(diagnostics?.musicbrainzAvailable)} detail={diagnostics ? (diagnostics.musicbrainzAvailable ? "Reachable" : "Unavailable or timed out") : "Waiting"} />
        <ToolRow label="Profiles" ok={Boolean(diagnostics?.profiles.length)} detail={diagnostics?.profiles.length ? diagnostics.profiles.map((profile) => profile.id).join(", ") : "Waiting"} />
        <ToolRow label="Transcode" ok={Boolean(diagnostics?.ffmpeg?.available)} detail={diagnostics?.ffmpeg?.available ? "FLAC copy, MP3 320k, AAC/M4A 192k, loudnorm, limiter" : "Needs ffmpeg"} />
        <ToolRow label="temp" ok={Boolean(diagnostics?.temp?.writable)} detail={diagnostics?.temp ? `${diagnostics.temp.writable ? "Writable" : "Not writable"} (${diagnostics.temp.dir})` : "Waiting"} />
        <ToolRow label="Output" ok detail="ZIP containing FLAC, MP3, or M4A/AAC processed from TIDAL or verified Soulseek source" />
        <ToolRow label="Last check" ok={Boolean(diagnostics?.checkedAtIso)} detail={diagnostics?.checkedAtIso ? new Date(diagnostics.checkedAtIso).toLocaleString() : "Waiting"} />
      </div>

      {diagnosticsError ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[color:rgba(var(--status-danger-rgb),0.45)] bg-[color:rgba(var(--status-danger-rgb),0.12)] p-3 text-sm text-[var(--status-danger)]">
          {diagnosticsError}
        </div>
      ) : null}
      {primaryFix ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-sm leading-6 text-[var(--text)]">
          <span className="font-medium">Fix: </span>{primaryFix}
        </div>
      ) : null}
      {tokenExpiry.warning ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[color:rgba(var(--status-warning-rgb),0.45)] bg-[color:rgba(var(--status-warning-rgb),0.12)] p-3 text-sm leading-6 text-[var(--status-warning)]">
          {tokenExpiry.warning}
        </div>
      ) : null}
      {diagnostics?.warnings.length ? (
        <div className="mt-4 space-y-2">
          {diagnostics.warnings.map((warning) => <p key={warning} className="break-words text-sm leading-6 text-[var(--muted)]">{warning}</p>)}
        </div>
      ) : null}
      {loginMessage ? (
        <div className={`mt-4 rounded-[var(--radius-md)] border p-3 text-sm leading-6 ${showLoginButton ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] text-[var(--status-success)]"}`}>
          {loginMessage}
        </div>
      ) : null}
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {showLoginButton ? (
          <Button onClick={onLogin} disabled={!mounted || loginLoading} className="inline-flex w-full items-center justify-center gap-2">
            {loginLoading ? "Opening TIDAL Login" : "Login to TIDAL"}
          </Button>
        ) : null}
        <Button onClick={onRecheck} disabled={!mounted || diagnosticsLoading} className={`inline-flex w-full items-center justify-center gap-2 ${showLoginButton ? "" : "sm:col-span-2"}`}>
          <RotateCcw className={`h-4 w-4 ${diagnosticsLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          {diagnosticsLoading ? "Checking TIDAL" : "Recheck TIDAL"}
        </Button>
      </div>
    </Card>
  );
}

function ToolRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-center">
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle className="h-4 w-4 shrink-0 text-[var(--status-success)]" aria-hidden="true" /> : <AlertCircle className="h-4 w-4 shrink-0 text-[var(--status-warning)]" aria-hidden="true" />}
        <span className="text-sm font-medium text-[var(--text)]">{label}</span>
      </div>
      <p className="min-w-0 break-words text-sm text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
      <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--text)]">{value}</p>
    </div>
  );
}

function BatchOcrSection({ disabled = false, droppedFiles, onSendToDownloader }: {
  disabled?: boolean;
  droppedFiles?: DroppedImportBatch | null;
  onSendToDownloader?: (songs: BatchSong[], options?: { switchToDownloader?: boolean }) => Promise<number> | number | void;
}) {
  const { language } = useLanguage();
  const [jobs, setJobs] = useState<BatchImageJob[]>([]);
  const [songs, setSongs] = useState<BatchSong[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [isJobsOpen, setIsJobsOpen] = useState(true);
  const [isFindingAllCovers, setIsFindingAllCovers] = useState(false);
  const [isSendingToQueue, setIsSendingToQueue] = useState(false);
  const [autoSendAfterExtraction, setAutoSendAfterExtraction] = useState(false);
  const [sentSongKeys, setSentSongKeys] = useState<Set<string>>(() => new Set());
  const [coverLoadingSongIds, setCoverLoadingSongIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const activeBatchIdRef = useRef(0);
  const handledDroppedBatchRef = useRef<string | null>(null);
  const sentSongKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => () => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    const status = getApiConfigStatus();
    setApiBaseUrl(status.baseUrl ?? "");
    if (!status.baseUrl && status.message) {
      setNotice({ type: "error", message: `${status.message} Image recognition and automatic cover lookup need the backend API, but TIDAL ZIP Export remains available through the frontend service.` });
    }
  }, []);

  const summary = useMemo(() => {
    const imagesProcessed = jobs.filter((job) => job.status === "done" || job.status === "error").length;
    const totalImages = jobs.length;
    const totalSongsFound = songs.length;
    const duplicatesMerged = songs.filter((song) => song.duplicateMerged).length;
    const selectedSongs = songs.filter((song) => song.selected).length;
    const songsNeedingReview = songs.filter((song) => song.needsReview).length;
    const songsMissingCovers = songs.filter((song) => !hasSelectedBatchCover(song)).length;
    return { imagesProcessed, totalImages, totalSongsFound, duplicatesMerged, selectedSongs, songsNeedingReview, songsMissingCovers };
  }, [jobs, songs]);

  const jobsCanCollapse = jobs.length > 0 && jobs.every((job) => job.status === "done" || job.status === "error");
  const queueableSongs = useMemo(() => songs.filter(isBatchSongReadyForQueue), [songs]);
  const unsentQueueableSongs = useMemo(() => queueableSongs.filter((song) => !sentSongKeys.has(batchSongQueueKey(song))), [queueableSongs, sentSongKeys]);

  useEffect(() => {
    sentSongKeysRef.current = sentSongKeys;
  }, [sentSongKeys]);

  function computeNeedsReview(song: BatchSong): boolean {
    return !song.title.trim() || !song.artist.trim() || (song.confidence < LOW_CONFIDENCE && !song.manuallyConfirmed);
  }

  function mergeSongs(current: BatchSong[], incoming: BatchSong[]): BatchSong[] {
    const byKey = new Map<string, BatchSong>();
    const uniqueSongs: BatchSong[] = [];
    for (const song of current) {
      const title = song.title.trim();
      const artist = song.artist.trim();
      if (!title || !artist) {
        uniqueSongs.push(song);
        continue;
      }
      byKey.set(normalizeTrackKey(title, artist), song);
    }
    for (const item of incoming) {
      const title = item.title.trim();
      const artist = item.artist.trim();
      if (!title || !artist) {
        uniqueSongs.push({ ...item, needsReview: computeNeedsReview(item) });
        continue;
      }
      const key = normalizeTrackKey(title, artist);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...item, needsReview: computeNeedsReview(item) });
        continue;
      }
      const candidateMap = new Map(existing.coverCandidates.map((candidate) => [candidate.url, candidate]));
      for (const candidate of item.coverCandidates) candidateMap.set(candidate.url, candidate);
      const merged: BatchSong = {
        ...existing,
        sourceImageIds: Array.from(new Set([...existing.sourceImageIds, ...item.sourceImageIds])),
        coverCandidates: Array.from(candidateMap.values()),
        confidence: Math.max(existing.confidence, item.confidence),
        coverUrl: existing.coverUrl || item.coverUrl,
        duplicateMerged: true,
      };
      merged.needsReview = computeNeedsReview(merged);
      byKey.set(key, merged);
    }
    return [...Array.from(byKey.values()), ...uniqueSongs];
  }

  function songsFromRecognition(imageId: string, recognized: SongRecognitionResult[]): BatchSong[] {
    return recognized.map((entry) => {
      const coverUrl = normalizeBatchCoverUrl(entry.albumArtUrl);
      const base: BatchSong = {
        id: makeId(),
        title: (entry.songName || "").trim(),
        artist: (entry.artist || "").trim(),
        album: (entry.album || "").trim() || undefined,
        coverUrl,
        coverCandidates: coverUrl
          ? [{ url: coverUrl, source: "ocr", title: entry.songName, artist: entry.artist, album: entry.album }]
          : [],
        sourceImageIds: [imageId],
        rawText: entry.songName,
        confidence: typeof entry.confidence === "number" ? entry.confidence : 0,
        selected: true,
        needsReview: true,
        manuallyConfirmed: false,
      };
      return { ...base, needsReview: computeNeedsReview(base) };
    });
  }

  async function processBatch(files: File[]) {
    if (disabled) {
      setNotice({ type: "error", message: "Image import is disabled while the TIDAL queue is running." });
      return;
    }
    const imageFiles = files.filter(isImageImportFile);
    if (imageFiles.length === 0) {
      setNotice({ type: "error", message: "Choose one or more PNG, JPEG, WebP, or GIF images." });
      return;
    }
    const batchId = activeBatchIdRef.current;
    setNotice(imageFiles.length < files.length
      ? { type: "error", message: `${files.length - imageFiles.length} unsupported file${files.length - imageFiles.length === 1 ? "" : "s"} ignored.` }
      : null);
    const nextJobs = imageFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      return { id: makeId(), file, previewUrl, status: "queued" as const, foundCount: 0 };
    });
    setJobs((prev) => [...prev, ...nextJobs]);

    const pendingJobs = [...nextJobs];
    const worker = async () => {
      while (pendingJobs.length > 0) {
        const job = pendingJobs.shift();
        if (!job) continue;
        if (activeBatchIdRef.current !== batchId) return;
        setJobs((prev) => prev.map((row) => (row.id === job.id ? { ...row, status: "processing" } : row)));
        try {
          const result = await recognizeFromImageAndStore(job.file, 20, "eng");
          if (activeBatchIdRef.current !== batchId) return;
          const produced = songsFromRecognition(job.id, result.songs);
          setSongs((prev) => mergeSongs(prev, produced));
          setJobs((prev) => prev.map((row) => (row.id === job.id ? { ...row, status: "done", foundCount: produced.length } : row)));
          if (autoSendAfterExtraction) void sendSongsToDownloader(produced, { mode: "auto" });
        } catch (error) {
          if (activeBatchIdRef.current !== batchId) return;
          const message = error instanceof Error ? error.message : t("download_generic_error", language);
          setJobs((prev) => prev.map((row) => (row.id === job.id ? { ...row, status: "error", error: message } : row)));
        }
      }
    };
    await Promise.all(Array.from({ length: 9 }).map(() => worker()));
  }

  useEffect(() => {
    if (!droppedFiles || handledDroppedBatchRef.current === droppedFiles.id || disabled) return;
    handledDroppedBatchRef.current = droppedFiles.id;
    void processBatch(droppedFiles.files);
  }, [disabled, droppedFiles]);

  function clearBatch() {
    activeBatchIdRef.current += 1;
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
    setJobs([]);
    setSongs([]);
    setNotice(null);
    sentSongKeysRef.current = new Set();
    setSentSongKeys(new Set());
  }

  function updateSong(songId: string, patch: Partial<BatchSong>) {
    setSongs((prev) => prev.map((song) => {
      if (song.id !== songId) return song;
      const updated = { ...song, ...patch };
      updated.needsReview = computeNeedsReview(updated);
      return updated;
    }));
  }

  const findCoversForSong = useCallback(async (songId: string, options?: { suppressNotice?: boolean; limit?: number; autoSelect?: boolean }) => {
    if (!apiBaseUrl) {
      if (!options?.suppressNotice) setNotice({ type: "error", message: t("download_cover_lookup_unavailable", language) });
      return false;
    }
    const song = songs.find((item) => item.id === songId);
    if (!song) return false;
    setCoverLoadingSongIds((prev) => Array.from(new Set([...prev, songId])));
    try {
      const urls = await lookupCoverArtUrls(apiBaseUrl, song.title, song.artist, { limit: options?.limit ?? 4, exclude: song.coverCandidates.map((item) => item.url) });
      if (urls.length === 0) return true;
      setSongs((prev) => prev.map((entry) => {
        if (entry.id !== songId) return entry;
        const coverCandidates = mergeBatchCoverCandidates(entry.coverCandidates, urls.map((url) => ({ url, source: "lookup", title: entry.title, artist: entry.artist, album: entry.album })));
        const shouldSelectFirst = options?.autoSelect !== false && !hasSelectedBatchCover(entry);
        const next = {
          ...entry,
          coverCandidates,
          coverUrl: shouldSelectFirst ? coverCandidates[0]?.url ?? entry.coverUrl : entry.coverUrl,
        };
        next.needsReview = computeNeedsReview(next);
        return next;
      }));
      return true;
    } catch {
      if (!options?.suppressNotice) setNotice({ type: "error", message: t("download_cover_lookup_single_failed", language) });
      return false;
    } finally {
      setCoverLoadingSongIds((prev) => prev.filter((id) => id !== songId));
    }
  }, [apiBaseUrl, language, songs]);

  async function findCoversForAllMissing() {
    setIsFindingAllCovers(true);
    let failedCount = 0;
    try {
      const missing = songs.filter((song) => !hasSelectedBatchCover(song));
      for (const song of missing) {
        const ok = await findCoversForSong(song.id, { suppressNotice: true, limit: 4, autoSelect: true });
        if (!ok) failedCount += 1;
      }
    } finally {
      setIsFindingAllCovers(false);
    }
    if (failedCount > 0) setNotice({ type: "error", message: t("download_cover_lookup_failed", language, { count: failedCount }) });
  }

  async function validateSelected() {
    const selected = songs.filter((song) => song.selected);
    if (selected.length === 0) {
      setNotice({ type: "error", message: t("download_no_selected", language) });
      return;
    }
    const invalid = selected.find((song) => !song.title.trim() || !song.artist.trim() || (song.confidence < LOW_CONFIDENCE && !song.manuallyConfirmed));
    if (invalid) {
      setNotice({ type: "error", message: t("download_validation_error", language) });
      return;
    }
    setNotice({ type: "success", message: t("download_ready_process", language, { count: selected.length }) });
    if (autoSendAfterExtraction) await sendSongsToDownloader(selected, { mode: "auto" });
  }

  function exportJson(selectedOnly: boolean) {
    const payload = selectedOnly ? songs.filter((song) => song.selected) : songs;
    downloadTextBlob(JSON.stringify(payload, null, 2), selectedOnly ? "batch-ocr-selected.json" : "batch-ocr-all.json", "application/json");
  }

  function exportCsv() {
    const selected = songs.filter((song) => song.selected);
    const header = "title,artist,album,coverUrl,confidence,sourceImageCount,manuallyConfirmed";
    const rows = selected.map((song) => [
      song.title,
      song.artist,
      song.album ?? "",
      song.coverUrl ?? "",
      String(song.confidence),
      String(song.sourceImageIds.length),
      String(song.manuallyConfirmed),
    ].map(escapeCsv).join(","));
    downloadTextBlob([header, ...rows].join("\n"), "batch-ocr-selected.csv", "text/csv;charset=utf-8");
  }

  async function sendSongsToDownloader(sourceSongs: BatchSong[] = unsentQueueableSongs, options: { mode: "manual" | "auto" } = { mode: "manual" }) {
    if (!onSendToDownloader) return;
    const selected = sourceSongs
      .filter(isBatchSongReadyForQueue)
      .filter((song) => !sentSongKeysRef.current.has(batchSongQueueKey(song)));
    if (selected.length === 0) {
      setNotice({ type: "error", message: t("download_no_selected", language) });
      return;
    }
    setIsSendingToQueue(true);
    try {
      const sentCount = await onSendToDownloader(selected, { switchToDownloader: options.mode === "manual" });
      if (!sentCount) return;
      const keys = selected.map(batchSongQueueKey);
      setSentSongKeys((current) => {
        const next = new Set(current);
        for (const key of keys) next.add(key);
        sentSongKeysRef.current = next;
        return next;
      });
      setNotice({ type: "success", message: `Sent ${sentCount} song${sentCount === 1 ? "" : "s"} to the Downloader queue.` });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not send songs to the Downloader queue." });
    } finally {
      setIsSendingToQueue(false);
    }
  }

  return (
    <>
      <div className="mt-8 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t("download_batch_title", language)}</h1>
            <p className="text-sm text-[var(--muted)]">{t("download_batch_desc", language)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={disabled}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) void processBatch(files);
                event.currentTarget.value = "";
              }}
            />
            <button type="button" className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 disabled:opacity-50" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
              {t("download_add_images", language)}
            </button>
            <button type="button" className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 disabled:opacity-50" onClick={() => void findCoversForAllMissing()} disabled={disabled || isFindingAllCovers}>
              {isFindingAllCovers ? t("download_searching", language) : t("download_find_all_covers", language)}
            </button>
            {onSendToDownloader ? (
              <button type="button" className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-2 text-[var(--text)] disabled:opacity-50" onClick={() => void sendSongsToDownloader()} disabled={disabled || isSendingToQueue || unsentQueueableSongs.length === 0}>
                {isSendingToQueue ? "Sending..." : "Send extracted songs to Downloader"}
              </button>
            ) : null}
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={autoSendAfterExtraction}
                onChange={(event) => setAutoSendAfterExtraction(event.target.checked)}
                disabled={disabled}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span>Auto-send after extraction</span>
            </label>
            <button type="button" className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 disabled:opacity-50" onClick={clearBatch} disabled={disabled}>
              {t("download_clear_batch", language)}
            </button>
          </div>
        </div>

        {notice ? (
          <div className={`rounded-lg border p-3 text-sm ${notice.type === "error" ? "border-[color:rgba(var(--status-danger-rgb),0.45)] bg-[color:rgba(var(--status-danger-rgb),0.12)] text-[var(--status-danger)]" : "border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] text-[var(--status-success)]"}`}>
            {notice.message}
          </div>
        ) : null}

        <BatchSummary summary={summary} language={language} />
        <ImageJobList jobs={jobs} language={language} isOpen={isJobsOpen} canCollapse={jobsCanCollapse} onToggle={() => setIsJobsOpen((value) => !value)} />
        {jobs.length === 0 ? <p className="text-sm text-[var(--muted)]">{t("download_empty_jobs", language)}</p> : null}
        <SongReviewList songs={songs} language={language} coverLoadingSongIds={coverLoadingSongIds} onChangeSong={updateSong} onFindCover={(songId) => void findCoversForSong(songId, { limit: 4, autoSelect: true })} />
        {jobs.length > 0 && songs.length === 0 && jobsCanCollapse ? <p className="text-sm text-[var(--muted)]">{t("download_empty_songs", language)}</p> : null}
      </div>

      <StickyReviewBar language={language} summary={summary} onValidate={validateSelected} onExportSelectedJson={() => exportJson(true)} onExportAllJson={() => exportJson(false)} onExportCsv={exportCsv} />
    </>
  );
}

function BatchSummary({ summary, language }: { summary: { imagesProcessed: number; totalImages: number; totalSongsFound: number; duplicatesMerged: number; selectedSongs: number; songsNeedingReview: number; songsMissingCovers: number }; language: Language }) {
  const items = [
    [t("download_images_processed", language), `${summary.imagesProcessed}/${summary.totalImages}`],
    [t("download_total_found", language), String(summary.totalSongsFound)],
    [t("download_duplicates_merged", language), String(summary.duplicatesMerged)],
    [t("download_selected_count", language), String(summary.selectedSongs)],
    [t("download_needs_review", language), String(summary.songsNeedingReview)],
    [t("download_missing_cover_count", language), String(summary.songsMissingCovers)],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-xs text-[var(--muted)]">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ImageJobList({ jobs, language, isOpen, canCollapse, onToggle }: { jobs: BatchImageJob[]; language: Language; isOpen: boolean; canCollapse: boolean; onToggle: () => void }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("download_jobs", language)}</h2>
        {canCollapse ? <button type="button" className="text-sm text-[var(--muted)]" onClick={onToggle}>{isOpen ? t("download_collapse", language) : t("download_expand", language)}</button> : null}
      </div>
      {isOpen ? (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
              <img src={job.previewUrl} alt={job.file.name} className="h-12 w-12 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{job.file.name}</p>
                <p className="text-xs text-[var(--muted)]">{t(`download_status_${job.status}`, language)}</p>
                {job.error ? <p className="text-xs text-[var(--status-danger)]">{job.error}</p> : null}
              </div>
              <span className="text-sm text-[var(--muted)]">{job.foundCount}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SongReviewList({ songs, language, coverLoadingSongIds, onChangeSong, onFindCover }: { songs: BatchSong[]; language: Language; coverLoadingSongIds: string[]; onChangeSong: (songId: string, patch: Partial<BatchSong>) => void; onFindCover: (songId: string) => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filteredSongs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return songs;
    return songs.filter((song) => [
      song.title,
      song.artist,
      song.album,
      song.rawText,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery)));
  }, [query, songs]);
  const pageCount = Math.max(1, Math.ceil(filteredSongs.length / BATCH_REVIEW_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleSongs = filteredSongs.slice(safePage * BATCH_REVIEW_PAGE_SIZE, safePage * BATCH_REVIEW_PAGE_SIZE + BATCH_REVIEW_PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [query]);

  useEffect(() => {
    setPage((value) => Math.min(value, pageCount - 1));
  }, [pageCount]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("download_review_songs", language)}</h2>
          <p className="text-xs text-[var(--muted)]">
            Showing {filteredSongs.length === 0 ? 0 : safePage * BATCH_REVIEW_PAGE_SIZE + 1}-{Math.min(filteredSongs.length, safePage * BATCH_REVIEW_PAGE_SIZE + visibleSongs.length)} of {filteredSongs.length}
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:min-w-[360px] sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter title, artist, album" className="text-sm" />
          <Button type="button" size="sm" variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={safePage === 0}>Previous</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={safePage >= pageCount - 1}>Next</Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleSongs.map((song) => (
          <SongReviewCard key={song.id} song={song} language={language} loadingCover={coverLoadingSongIds.includes(song.id)} onChangeSong={onChangeSong} onFindCover={onFindCover} />
        ))}
      </div>
      {visibleSongs.length === 0 ? <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center text-sm text-[var(--muted)]">No songs match this filter.</p> : null}
    </section>
  );
}

function SongReviewCard({ song, language, loadingCover, onChangeSong, onFindCover }: { song: BatchSong; language: Language; loadingCover: boolean; onChangeSong: (songId: string, patch: Partial<BatchSong>) => void; onFindCover: (songId: string) => void }) {
  const badges = getBadges(song, language);
  const visibleCovers = visibleBatchCoverCandidates(song);
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={song.selected} onChange={(event) => onChangeSong(song.id, { selected: event.target.checked })} />
          {t("download_selected", language)}
        </label>
        <span className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-xs">{Math.round(song.confidence * 100)}%</span>
      </div>
      <div className="mb-3 space-y-2">
        {visibleCovers.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {visibleCovers.map((candidate, index) => {
              const selected = normalizeBatchCoverUrl(song.coverUrl) === candidate.url;
              return (
                <button
                  key={`${song.id}-${candidate.url}`}
                  type="button"
                  aria-label={`${t("download_choose_cover", language)} ${index + 1}`}
                  aria-pressed={selected}
                  onClick={() => onChangeSong(song.id, { coverUrl: candidate.url, manuallyEdited: true })}
                  className={`aspect-square overflow-hidden rounded border-2 bg-[var(--surface)] transition hover:border-[var(--accent)] ${selected ? "border-[var(--accent)] ring-2 ring-[var(--accent-ring)]" : "border-[var(--border)]"}`}
                >
                  <img src={candidate.url} alt={song.title || t("download_cover_candidate", language)} className="h-full w-full object-cover" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-16 items-center justify-center rounded border border-dashed border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)]">
            {t("download_no_cover", language)}
          </div>
        )}
        <button type="button" className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs" onClick={() => onFindCover(song.id)} disabled={loadingCover}>
          {loadingCover ? t("download_searching", language) : "Load more covers"}
        </button>
      </div>
      <div className="space-y-2">
        <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1" value={song.title} placeholder={t("download_title", language)} onChange={(event) => onChangeSong(song.id, { title: event.target.value, manuallyEdited: true })} />
        <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1" value={song.artist} placeholder={t("download_artist", language)} onChange={(event) => onChangeSong(song.id, { artist: event.target.value, manuallyEdited: true })} />
        <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1" value={song.album ?? ""} placeholder={t("download_album", language)} onChange={(event) => onChangeSong(song.id, { album: event.target.value, manuallyEdited: true })} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {badges.map((badge) => <span key={badge} className="rounded-full bg-[color:rgba(var(--status-warning-rgb),0.12)] px-2 py-1 text-xs text-[var(--status-warning)]">{badge}</span>)}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs" onClick={() => onChangeSong(song.id, { selected: false })}>{t("download_exclude", language)}</button>
        {hasSelectedBatchCover(song) ? (
          <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs" onClick={() => onChangeSong(song.id, { coverUrl: null, manuallyEdited: true })}>Clear cover</button>
        ) : null}
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs" onClick={() => {
          if (song.title.trim() && song.artist.trim()) onChangeSong(song.id, { manuallyConfirmed: true, needsReview: false });
        }}>
          {t("download_confirm", language)}
        </button>
      </div>
    </article>
  );
}

function StickyReviewBar({ language, summary, onValidate, onExportSelectedJson, onExportAllJson, onExportCsv }: { language: Language; summary: { totalSongsFound: number; selectedSongs: number; songsNeedingReview: number }; onValidate: () => void | Promise<void>; onExportSelectedJson: () => void; onExportAllJson: () => void; onExportCsv: () => void }) {
  return (
    <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-sm text-[var(--muted)]">
        {t("download_footer_counts", language, { total: summary.totalSongsFound, selected: summary.selectedSongs, needsReview: summary.songsNeedingReview, excluded: Math.max(summary.totalSongsFound - summary.selectedSongs, 0) })}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" onClick={() => void onValidate()}>{t("download_validate_selected", language)}</button>
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" onClick={onExportSelectedJson}>{t("download_export_json", language)}</button>
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" onClick={onExportAllJson}>{t("download_export_all_json", language)}</button>
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" onClick={onExportCsv}>{t("download_export_csv", language)}</button>
      </div>
    </div>
  );
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Operation cancelled.", "AbortError"));
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, ms));
    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException("Operation cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function requestScreenWakeLock(): Promise<TurrexWakeLockSentinel | null> {
  if (typeof navigator === "undefined") return null;
  const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<TurrexWakeLockSentinel> } }).wakeLock;
  if (!wakeLock) return null;
  return wakeLock.request("screen").catch(() => null);
}

function queueTrackKey(item: Pick<QueueItem, "artist" | "title">): string {
  return normalizeTrackKey(item.title ?? "", item.artist ?? "");
}

function hasValidTidalQueueUrl(item: Pick<QueueItem, "url">): boolean {
  const url = item.url?.trim();
  return Boolean(url && isTIDALUrl(url));
}

function isAutoAssignableTidalUrlItem(item: QueueItem): boolean {
  return !item.alreadyDownloaded && !item.url?.trim() && Boolean(item.artist?.trim() || item.title?.trim());
}

function isTidalUrlReSearchCandidate(item: QueueItem): boolean {
  if (item.alreadyDownloaded || hasValidTidalQueueUrl(item)) return false;
  if (!item.artist?.trim() || !item.title?.trim()) return false;
  const url = item.url?.trim();
  if (!url) return true;
  const searchState = `${item.errorMsg ?? ""} ${item.progressMessage ?? ""}`.toLowerCase();
  return (item.status === "error" || item.status === "skipped") && (
    searchState.includes("no tidal url") ||
    searchState.includes("missing url") ||
    searchState.includes("no match") ||
    searchState.includes("no confident match") ||
    searchState.includes("not found") ||
    searchState.includes("invalid tidal") ||
    searchState.includes("rate limit") ||
    searchState.includes("429")
  );
}

function retryAfterFromHeaders(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const numeric = Number(header);
  if (Number.isFinite(numeric) && numeric > 0) return Math.ceil(numeric);
  const dateValue = Date.parse(header);
  if (!Number.isNaN(dateValue)) return Math.max(1, Math.ceil((dateValue - Date.now()) / 1000));
  return undefined;
}

function formatTidalCandidate(candidate: TidalSearchCandidate): string {
  return [candidate.artist, candidate.title].filter(Boolean).join(" - ") || candidate.url;
}

function parseTidalSearchCandidate(value: unknown): TidalSearchCandidate | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url : "";
  const title = typeof record.title === "string" ? record.title : "";
  const artist = typeof record.artist === "string" ? record.artist : "";
  if (!url || !title) return undefined;
  return {
    url,
    title,
    artist: artist || "Unknown Artist",
    album: typeof record.album === "string" ? record.album : undefined,
    duration: typeof record.duration === "number" ? record.duration : undefined,
  };
}

async function searchTidalUrl(query: string, options?: { artist?: string; title?: string; album?: string; duration?: number; signal?: AbortSignal }): Promise<{ url?: string; best?: TidalSearchCandidate; candidates?: TidalSearchCandidate[]; error?: string; retryAfter?: number; status?: number }> {
  const trimmed = query.trim();
  const artist = options?.artist?.trim();
  const title = options?.title?.trim();
  const album = options?.album?.trim();
  if (!trimmed && !artist && !title) return { error: "Missing artist/title for TIDAL search." };
  try {
    const params = new URLSearchParams({ action: "search" });
    if (trimmed) params.set("q", trimmed);
    if (artist) params.set("artist", artist);
    if (title) params.set("title", title);
    if (album) params.set("album", album);
    if (typeof options?.duration === "number" && options.duration > 0) params.set("duration", String(Math.round(options.duration)));
    const response = await fetch(`${TIDAL_ENDPOINT}?${params.toString()}`, { cache: "no-store", signal: options?.signal });
    const payload = await response.json().catch(() => null) as { success?: unknown; best?: unknown; candidates?: unknown; url?: unknown; error?: unknown; retryAfter?: unknown } | null;
    console.log("[TIDAL DEBUG] Response:", {
      status: response.status,
      ok: response.ok,
      payload,
    });
    if (response.ok && payload?.success === true) {
      const best = parseTidalSearchCandidate(payload.best);
      const candidates = Array.isArray(payload.candidates)
        ? payload.candidates.map(parseTidalSearchCandidate).filter((c): c is TidalSearchCandidate => Boolean(c))
        : best ? [best] : [];
      const url = best?.url || (typeof payload.url === "string" ? payload.url : undefined);
      return url ? { url, best, candidates } : { error: "No match found on TIDAL", status: response.status };
    }
    const retryAfter = typeof payload?.retryAfter === "number" ? payload.retryAfter : retryAfterFromHeaders(response);
    return {
      error: typeof payload?.error === "string" ? payload.error : `Search returned ${response.status}.`,
      retryAfter,
      status: response.status,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "TIDAL search failed." };
  }
}

async function coverArtForQueueItem(item: QueueItem, fallback?: string): Promise<string | undefined> {
  if (!item.coverArt) return fallback;
  const converted = await dataUrlFromCoverReference(item.coverArt).catch(() => undefined);
  return converted ?? fallback;
}

async function dataUrlFromCoverReference(value: string): Promise<string | undefined> {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^data:image\/(?:jpeg|jpg|png);base64,/i.test(trimmed)) return trimmed;
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("/")) return undefined;
  const response = await fetch(trimmed, { cache: "force-cache" });
  if (!response.ok) return undefined;
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_COVER_IMAGE_BYTES) return undefined;
  const blob = await response.blob();
  if (!/^image\/(?:jpeg|jpg|png)$/i.test(blob.type)) return undefined;
  if (blob.size > MAX_COVER_IMAGE_BYTES) return undefined;
  return fileToDataUrl(new File([blob], "cover", { type: blob.type }));
}

async function downloadWithProgress(options: {
  url: string;
  profile: ExportProfile;
  preview: boolean;
  coverArt?: string;
  tracks?: Array<{
    artist: string;
    title: string;
    album?: string;
    year?: string;
    genre?: string;
    coverArt?: string;
    url?: string;
  }>;
  enhancements: Record<string, boolean>;
  useSoulseekFallback: boolean;
  libraryPath?: string;
  metadataOverride?: Partial<Pick<QueueItem, "artist" | "title" | "album" | "genre" | "year">>;
  force?: boolean;
  filenameTemplate?: string;
  postAction?: Exclude<PostQueueAction, "none">;
  signal: AbortSignal;
  onProgress: (event: SseProgressEvent) => void;
}): Promise<DownloadWithProgressResult> {
  const coverArt = options.coverArt?.trim() || undefined;
  const response = await fetch(TIDAL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      url: options.url,
      tracks: options.tracks,
      profile: options.profile,
      preview: options.preview,
      ...(coverArt ? { coverArt } : {}),
      enhancements: options.enhancements,
      useSoulseekFallback: options.useSoulseekFallback,
      libraryPath: options.libraryPath,
      metadataOverride: options.metadataOverride,
      force: options.force,
      filenameTemplate: options.filenameTemplate,
      postAction: options.postAction,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    let detail = "";
    let responseBody: unknown;
    try {
      const payload = await response.json() as { error?: unknown; detail?: unknown; message?: unknown; code?: unknown; retryAfter?: unknown };
      responseBody = { ...payload, status: response.status };
      detail = stringifyErrorPayload(payload.detail) || stringifyErrorPayload(payload.error) || stringifyErrorPayload(payload.message) || "";
    } catch {
      detail = await response.text().catch(() => "");
      responseBody = { status: response.status, body: detail };
    }
    throw new TidalClientError((detail || `TIDAL returned ${response.status}.`).slice(0, 1800), responseBody);
  }
  if (!response.body) throw new Error("TIDAL SSE response did not include a stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let token = "";
  let fileUrl = "";
  let skipped: DownloadWithProgressResult | null = null;
  let zipPath = "";
  let albumMeta: AlbumTrackEntry[] | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const event = parseSseEvent(part);
      if (!event) continue;
      options.onProgress(event);
      if (event.step === "error") throw new TidalClientError(event.message, event);
      if (event.step === "complete") {
        if (event.skipped) {
          skipped = { skipped: true, reason: event.reason, existingFile: event.existingFile };
          continue;
        }
        token = event.token ?? "";
        fileUrl = event.file ?? "";
        zipPath = event.zipPath ?? "";
        albumMeta = event.albumMeta;
      }
    }
  }

  if (skipped) return skipped;
  const retrieveUrl = fileUrl || `${TIDAL_ENDPOINT}?action=retrieve&token=${encodeURIComponent(token)}`;
  if (!token && !fileUrl) throw new Error("TIDAL completed without returning a download token.");
  const fileResponse = await fetch(retrieveUrl, { signal: options.signal });
  if (!fileResponse.ok) {
    const detail = await fileResponse.text().catch(() => "");
    throw new TidalClientError(detail || `TIDAL download token returned ${fileResponse.status}.`, { status: fileResponse.status, body: detail });
  }
  const blob = await fileResponse.blob();
  return {
    blob,
    fileName: fileNameFromContentDisposition(fileResponse.headers.get("content-disposition")) || "tidal-download.zip",
    zipPath: fileResponse.headers.get("x-turrex-zip-path") || zipPath || undefined,
    albumMeta: albumMetaFromHeader(fileResponse.headers.get("x-turrex-album-meta")) ?? albumMeta,
  };
}

function parseSseEvent(raw: string): SseProgressEvent | null {
  const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as Partial<SseProgressEvent>;
    return {
      step: parsed.step || "transcoding",
      progress: typeof parsed.progress === "number" ? parsed.progress : 0,
      message: parsed.message || "",
      code: typeof parsed.code === "string" ? parsed.code : undefined,
      token: parsed.token,
      file: parsed.file,
      retryAfter: parsed.retryAfter,
      status: parsed.status,
      source: parsed.source,
      skipped: parsed.skipped,
      reason: parsed.reason,
      existingFile: parsed.existingFile,
      byteLength: parsed.byteLength,
      durationSec: parsed.durationSec,
      zipPath: parsed.zipPath,
      albumMeta: Array.isArray(parsed.albumMeta) ? parsed.albumMeta : undefined,
    };
  } catch {
    return null;
  }
}

function albumMetaFromHeader(value: string | null): AlbumTrackEntry[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.map((entry, index): AlbumTrackEntry | null => {
      const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const file = typeof record.file === "string" ? record.file : "";
      if (!file) return null;
      return {
        artist: typeof record.artist === "string" ? record.artist : undefined,
        title: typeof record.title === "string" ? record.title : undefined,
        album: typeof record.album === "string" ? record.album : undefined,
        trackNumber: typeof record.trackNumber === "number" ? record.trackNumber : index + 1,
        duration: typeof record.duration === "number" ? record.duration : undefined,
        file,
        coverSource: typeof record.coverSource === "string" ? record.coverSource : undefined,
      };
    }).filter((entry): entry is AlbumTrackEntry => entry !== null);
  } catch {
    return undefined;
  }
}

async function tracksFromSpotifyImport(playlistUrl: string, fallbackText: string, keepMetadata: boolean): Promise<SpotifyImportTrack[]> {
  const typedTracks = extractSpotifyTracksFromText(fallbackText, keepMetadata);
  const trimmedUrl = playlistUrl.trim();
  if (!trimmedUrl) return typedTracks;
  try {
    return mergeSpotifyTracks([
      ...(await resolveSpotifyPlaylistTracks(trimmedUrl, keepMetadata)),
      ...typedTracks,
    ]);
  } catch (error) {
    if (typedTracks.length > 0) return typedTracks;
    const message = error instanceof Error ? error.message : "Spotify import failed.";
    throw new Error(`${message} Paste exported track rows into the fallback track list if the browser blocks Spotify.`);
  }
}

async function resolveSpotifyPlaylistTracks(playlistUrl: string, keepMetadata: boolean): Promise<SpotifyImportTrack[]> {
  const playlistId = spotifyPlaylistIdFromUrl(playlistUrl);
  if (!playlistId) throw new Error("Enter a valid open.spotify.com playlist URL.");
  const response = await fetch(`https://open.spotify.com/playlist/${encodeURIComponent(playlistId)}`, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) throw new Error(`Spotify returned ${response.status}.`);
  const html = await response.text();
  const tracks = extractSpotifyTracksFromHtml(html, keepMetadata);
  if (tracks.length === 0) throw new Error("Spotify did not expose track metadata in the page state.");
  return tracks;
}

function spotifyPlaylistIdFromUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value.trim());
    if (!parsed.hostname.toLowerCase().endsWith("spotify.com")) return undefined;
    const segments = parsed.pathname.split("/").filter(Boolean);
    const playlistIndex = segments.findIndex((segment) => segment.toLowerCase() === "playlist");
    const id = playlistIndex >= 0 ? segments[playlistIndex + 1] : undefined;
    return id && /^[A-Za-z0-9]+$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

function extractSpotifyTracksFromHtml(html: string, keepMetadata: boolean): SpotifyImportTrack[] {
  const tracks: SpotifyImportTrack[] = [];
  const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scriptMatches) {
    const raw = decodeHtmlEntities(match[1] ?? "").trim();
    if (!raw || !raw.includes("artist")) continue;
    const json = raw.startsWith("{") || raw.startsWith("[") ? raw : raw.match(/({[\s\S]+})/)?.[1];
    if (!json) continue;
    try {
      collectSpotifyTracksFromJson(JSON.parse(json) as unknown, keepMetadata, tracks);
    } catch {
      // Spotify ships several non-JSON script blocks. The next script may hold usable state.
    }
  }
  if (tracks.length === 0) {
    collectSpotifyTracksFromJson(extractJsonFragments(html), keepMetadata, tracks);
  }
  return mergeSpotifyTracks(tracks);
}

function extractJsonFragments(html: string): unknown[] {
  return Array.from(html.matchAll(/"name"\s*:\s*"([^"]+)"[\s\S]{0,900}?"artists"\s*:\s*(\[[\s\S]{0,900}?\])/g)).map((match) => ({
    name: decodeJsonString(match[1] ?? ""),
    artists: safeJsonParse(decodeHtmlEntities(match[2] ?? "[]")),
  }));
}

function collectSpotifyTracksFromJson(value: unknown, keepMetadata: boolean, tracks: SpotifyImportTrack[], seen = new WeakSet<object>(), depth = 0) {
  if (depth > 32 || tracks.length > 1200 || value === null || typeof value === "undefined") return;
  if (Array.isArray(value)) {
    for (const item of value) collectSpotifyTracksFromJson(item, keepMetadata, tracks, seen, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  const record = value as Record<string, unknown>;
  const candidate = spotifyTrackFromRecord(record, keepMetadata);
  if (candidate) tracks.push(candidate);
  for (const child of Object.values(record)) collectSpotifyTracksFromJson(child, keepMetadata, tracks, seen, depth + 1);
}

function spotifyTrackFromRecord(record: Record<string, unknown>, keepMetadata: boolean): SpotifyImportTrack | null {
  const uri = stringFromUnknown(record.uri)?.toLowerCase() ?? "";
  const type = `${stringFromUnknown(record.type) ?? ""} ${stringFromUnknown(record.__typename) ?? ""}`.toLowerCase();
  const hasTrackHint = uri.includes("spotify:track")
    || type.includes("track")
    || typeof record.duration_ms === "number"
    || typeof record.durationMilliseconds === "number"
    || Boolean(record.duration && typeof record.duration === "object");
  const title = stringFromUnknown(record.name) || stringFromUnknown((record.profile as Record<string, unknown> | undefined)?.name);
  const artists = artistNamesFromSpotifyValue(record.artists ?? record.artist ?? record.byline);
  if (!hasTrackHint && artists.length === 0) return null;
  if (!title || artists.length === 0) return null;
  const album = keepMetadata
    ? albumNameFromSpotifyValue(record.album ?? record.albumOfTrack ?? record.release)
    : undefined;
  return {
    artist: artists.join(", "),
    title,
    album,
  };
}

function artistNamesFromSpotifyValue(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => artistNamesFromSpotifyValue(entry)).filter(Boolean);
  }
  if (typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const direct = stringFromUnknown(record.name)
    || stringFromUnknown((record.profile as Record<string, unknown> | undefined)?.name)
    || stringFromUnknown(record.title);
  const children = artistNamesFromSpotifyValue(record.items ?? record.nodes ?? record.edges);
  return mergeStrings(direct ? [direct, ...children] : children);
}

function albumNameFromSpotifyValue(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return stringFromUnknown(record.name)
    || stringFromUnknown((record.profile as Record<string, unknown> | undefined)?.name)
    || stringFromUnknown(record.title);
}

function extractSpotifyTracksFromText(text: string, keepMetadata: boolean): SpotifyImportTrack[] {
  const tracks = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[\).\-\s]+/, "").trim())
    .filter(Boolean)
    .map((line) => spotifyTrackFromLine(line, keepMetadata))
    .filter((track): track is SpotifyImportTrack => Boolean(track));
  return mergeSpotifyTracks(tracks);
}

function spotifyTrackFromLine(line: string, keepMetadata: boolean): SpotifyImportTrack | null {
  const tabParts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
  if (tabParts.length >= 2) {
    return { artist: tabParts[0]!, title: tabParts[1]!, album: keepMetadata ? tabParts[2] : undefined };
  }
  const byMatch = line.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch?.[1] && byMatch[2]) {
    return { title: byMatch[1].trim(), artist: byMatch[2].trim() };
  }
  const splitMatch = line.match(/^(.+?)\s(?:-|\u2013|\u2014|\|)\s(.+)$/);
  if (!splitMatch?.[1] || !splitMatch[2]) return null;
  return { artist: splitMatch[1].trim(), title: splitMatch[2].trim() };
}

function mergeSpotifyTracks(tracks: SpotifyImportTrack[]): SpotifyImportTrack[] {
  const byKey = new Map<string, SpotifyImportTrack>();
  for (const track of tracks) {
    const artist = track.artist.trim();
    const title = track.title.trim();
    if (!artist || !title) continue;
    const key = normalizeTrackKey(title, artist);
    if (!byKey.has(key)) byKey.set(key, { artist, title, album: track.album?.trim() || undefined });
  }
  return Array.from(byKey.values());
}

function mergeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/"/g, "\\\"")}"`) as string;
  } catch {
    return value;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function firstAudioBlobFromZip(zipBlob: Blob): Promise<Blob> {
  const entries = await readStoredZipEntries(zipBlob);
  const audio = entries.find((entry) => /\.(mp3|m4a|flac)$/i.test(entry.name));
  if (!audio) throw new Error("Preview ZIP did not include an audio file.");
  return audio.blob;
}

async function statsFromZipBlob(zipBlob: Blob): Promise<{ durationSec?: number; tracks?: AlbumTrackEntry[] }> {
  try {
    const entries = await readStoredZipEntries(zipBlob);
    const manifest = entries.find((entry) => entry.name.endsWith("manifest.json"));
    const audioTracks = entries
      .filter((entry) => !entry.directory && isAudioZipPath(entry.name))
      .map((entry, index) => ({ file: entry.name.replace(/^Turrex TIDAL Export\//, "").replace(/^tracks\//, ""), trackNumber: index + 1 }));
    if (!manifest) return { tracks: audioTracks };
    const parsed = JSON.parse(await manifest.blob.text()) as {
      sourceFiles?: Array<{ durationSec?: unknown }>;
      qualityReports?: Array<{ durationSec?: unknown }>;
      albumMeta?: AlbumTrackEntry[];
    };
    const durations = [...(parsed.sourceFiles ?? []), ...(parsed.qualityReports ?? [])]
      .map((entry) => typeof entry.durationSec === "number" ? entry.durationSec : 0)
      .filter((duration) => duration > 0);
    const durationSec = durations.length ? Math.round(Math.max(...durations)) : undefined;
    return { durationSec, tracks: parsed.albumMeta?.length ? parsed.albumMeta : audioTracks };
  } catch {
    return {};
  }
}

type StoredZipEntry = { name: string; blob: Blob; directory: boolean };

async function readStoredZipEntries(zipBlob: Blob): Promise<StoredZipEntry[]> {
  const bytes = new Uint8Array(await zipBlob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: StoredZipEntry[] = [];
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === ZIP_CENTRAL_DIRECTORY_SIGNATURE || signature === ZIP_EOCD_SIGNATURE) break;
    if (signature !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) throw new Error("Unsupported ZIP structure.");
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if ((flags & 0x08) !== 0 || method !== 0 || dataEnd > bytes.length) throw new Error("Only stored ZIP entries without data descriptors are supported.");
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + fileNameLength));
    const directory = name.endsWith("/");
    if (!directory) {
      entries.push({ name, directory, blob: new Blob([bytes.slice(dataStart, dataEnd)]) });
    }
    offset = dataEnd;
  }
  return entries;
}

function enhancementsPayload(options: PolishOptions, showAdvancedAudioEnhancements: boolean): Record<string, boolean> {
  if (!showAdvancedAudioEnhancements) return {};
  const payload = {
    loudnorm: options.loudnorm,
    trimSilence: options.trimSilence,
    fadeInOut: options.fadeInOut,
    truePeakLimiter: options.truePeakLimiter,
    stereoEnhance: options.stereoEnhance,
    embedCover: options.embedAudioCover,
    embedMetadata: options.embedMetadata,
    musicbrainz: options.musicbrainz,
    lyrics: options.lyrics,
    verifyQuality: options.verifyQuality,
    coverFallback: options.coverFallback,
    generatePlaylist: options.generatePlaylist,
    resizeCover: options.resizeCover,
  };
  return payload;
}

function metadataOverrideFromQueueItem(item: QueueItem): Partial<Pick<QueueItem, "artist" | "title" | "album" | "genre" | "year">> {
  return {
    artist: item.artist,
    title: item.title,
    album: item.album,
    genre: item.genre,
    year: item.year,
  };
}

function priorityRank(priority: QueuePriority): number {
  if (priority === "high") return 0;
  if (priority === "low") return 2;
  return 1;
}

function applyQueueSort(queue: QueueItem[], sort: QueueSortSettings): QueueItem[] {
  const key = sort.key;
  if (key === "manual") return queue;
  const direction = sort.direction === "desc" ? -1 : 1;
  return queue
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      let result = 0;
      if (key === "priority") {
        result = priorityRank(a.item.priority) - priorityRank(b.item.priority);
      } else if (key === "status") {
        result = queueStatusRank(a.item.status) - queueStatusRank(b.item.status);
      } else if (key === "added") {
        result = Date.parse(a.item.addedAtIso) - Date.parse(b.item.addedAtIso);
      } else {
        result = queueSortText(a.item, key).localeCompare(queueSortText(b.item, key), undefined, { sensitivity: "base", numeric: true });
      }
      return result === 0 ? a.index - b.index : result * direction;
    })
    .map(({ item }) => item);
}

function queueSortText(item: QueueItem, key: Extract<QueueSortKey, "artist" | "title" | "album">): string {
  if (key === "artist") return item.artist ?? "";
  if (key === "album") return item.album ?? "";
  return item.title ?? "";
}

function queueStatusRank(status: QueueStatus): number {
  if (status === "processing" || status === "searching") return 0;
  if (status === "pending") return 1;
  if (status === "error") return 2;
  if (status === "skipped") return 3;
  return 4;
}

function transientRetryDelaySeconds(settings: RateLimitSettings, attempt: number): number {
  const base = clampNumber(settings.transientBackoffSeconds, MIN_TRANSIENT_BACKOFF_SECONDS, MAX_TRANSIENT_BACKOFF_SECONDS);
  const multipliers = [1, 3, 6, 12, 24];
  const multiplier = multipliers[Math.max(0, Math.min(multipliers.length - 1, attempt - 1))] ?? 1;
  return clampNumber(base * multiplier, MIN_SCHEDULER_DELAY_SECONDS, MAX_TRANSIENT_BACKOFF_SECONDS * 6);
}

function priorityIndicator(priority: QueuePriority): { label: string; className: string } {
  if (priority === "high") return { label: "High", className: "border-[color:rgba(var(--status-danger-rgb),0.45)] bg-[color:rgba(var(--status-danger-rgb),0.12)] text-[var(--status-danger)]" };
  if (priority === "low") return { label: "Low", className: "border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] text-[var(--status-success)]" };
  return { label: "Medium", className: "border-[color:rgba(var(--status-warning-rgb),0.45)] bg-[color:rgba(var(--status-warning-rgb),0.12)] text-[var(--status-warning)]" };
}

function localFileHref(filePath: string): string {
  return `file:///${filePath.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stringifyErrorPayload(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || typeof value === "undefined") return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function errorDetailsFromUnknown(error: unknown, fallback: string): { message: string; body?: unknown } {
  if (error instanceof TidalClientError) return { message: error.message || fallback, body: error.body };
  if (error instanceof Error) return { message: error.message || fallback, body: { message: error.message, name: error.name } };
  return { message: fallback, body: error };
}

function fatalQueueErrorFromUnknown(error: unknown): { kind: "token" | "rate-limit" | "storage"; message: string } | null {
  const details = errorDetailsFromUnknown(error, "");
  const body = details.body && typeof details.body === "object" ? details.body as { status?: unknown; retryAfter?: unknown; message?: unknown; code?: unknown; error?: unknown } : {};
  const status = typeof body.status === "number" ? body.status : undefined;
  const code = typeof body.code === "string" ? body.code : "";
  const text = `${details.message} ${typeof body.message === "string" ? body.message : ""} ${typeof body.error === "string" ? body.error : ""}`.toLowerCase();
  if (code === "TOKEN_EXPIRED" || status === 401 || text.includes("token expired") || text.includes("authorization failed") || text.includes("unauthorized") || text.includes("login")) {
    return { kind: "token", message: "TIDAL token expired. Please log in and resume the queue." };
  }
  if (status === 429 || typeof body.retryAfter === "number" || text.includes("rate limit") || text.includes("too many requests")) {
    return { kind: "rate-limit", message: "TIDAL rate limit could not be resolved. Progress is saved; resume the queue after the cooldown." };
  }
  if (status === 507 || code === "low-disk-space" || text.includes("low disk space") || text.includes("enospc") || text.includes("quota")) {
    return { kind: "storage", message: "Low disk space. Please free up at least 1 GB and resume the queue." };
  }
  if (status === 403 || status === 423 || code.startsWith("filesystem-") || text.includes("not writable") || text.includes("permission denied") || text.includes("file is locked") || text.includes("selected folder")) {
    return { kind: "storage", message: "The selected download location is unavailable or locked. Fix it and resume the queue." };
  }
  return null;
}

function statusFromTidalClientError(error: unknown): number | undefined {
  if (!(error instanceof TidalClientError) || !error.body || typeof error.body !== "object") return undefined;
  const body = error.body as { status?: unknown };
  return typeof body.status === "number" ? body.status : undefined;
}

function queueFailureKindFromUnknown(error: unknown, message: string): QueueFailureKind {
  const status = statusFromTidalClientError(error);
  const text = message.toLowerCase();
  if (status === 401 || text.includes("token") || text.includes("authorization") || text.includes("unauthorized") || text.includes("login")) return "auth";
  if (status === 429 || text.includes("rate limit") || text.includes("too many requests")) return "rate-limit";
  if (status === 404 || text.includes("not found") || text.includes("no tidal result")) return "not-found";
  if (status === 403 || status === 423 || status === 507 || text.includes("disk space") || text.includes("enospc") || text.includes("quota") || text.includes("not writable") || text.includes("permission denied") || text.includes("locked") || text.includes("selected folder")) return "storage";
  if (text.includes("did not produce any audio") || text.includes("did not create flac") || text.includes("no usable audio")) return "no-audio";
  if (text.includes("tidekeeper") || text.includes("not recognized") || text.includes("no such option") || text.includes("incompatible")) return "cli";
  if (text.includes("invalid tidal") || text.includes("missing")) return "validation";
  if (status === 502 || status === 503 || status === 504 || text.includes("network") || text.includes("timeout") || text.includes("timed out") || text.includes("fetch failed") || text.includes("econnreset")) return "network";
  return "other";
}

function queueFailureKindLabel(kind: QueueFailureKind): string {
  if (kind === "auth") return "authorization";
  if (kind === "rate-limit") return "rate-limit";
  if (kind === "no-audio") return "no-audio";
  if (kind === "not-found") return "not-found";
  if (kind === "cli") return "CLI";
  if (kind === "validation") return "validation";
  if (kind === "network") return "network";
  if (kind === "storage") return "storage";
  return "download";
}

function isTransientDownloadError(error: unknown): boolean {
  const details = errorDetailsFromUnknown(error, "");
  const status = statusFromTidalClientError(error);
  const text = details.message.toLowerCase();
  if (status === 401 || status === 400 || status === 404 || status === 429) return false;
  if (status === 500 && (text.includes("not recognized") || text.includes("no such option") || text.includes("not installed") || text.includes("invalid tidal"))) return false;
  return status === 502
    || status === 503
    || status === 504
    || text.includes("network")
    || text.includes("timeout")
    || text.includes("timed out")
    || text.includes("fetch failed")
    || text.includes("econnreset")
    || text.includes("temporary failure")
    || text.includes("tidal api error");
}

function retryAfterFromUnknown(error: unknown): number | undefined {
  if (!(error instanceof TidalClientError) || !error.body || typeof error.body !== "object") return undefined;
  const body = error.body as { status?: unknown; retryAfter?: unknown };
  const status = typeof body.status === "number" ? body.status : undefined;
  const retryAfter = typeof body.retryAfter === "number" ? body.retryAfter : undefined;
  if (status !== 429 && !retryAfter) return undefined;
  return Math.max(1, Math.round(retryAfter ?? 30 * 60));
}

function randomIntInclusive(min: number, max: number): number {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function schedulerDelayWithJitter(seconds: number): number {
  const safe = Math.max(MIN_SCHEDULER_DELAY_SECONDS, Math.round(seconds));
  const spread = Math.max(2, Math.round(safe * 0.15));
  return Math.max(MIN_SCHEDULER_DELAY_SECONDS, safe + randomIntInclusive(-spread, spread));
}

function formatDurationSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

function secondsFromDurationLabel(value: string): number {
  const hours = Number(value.match(/(\d+)h/)?.[1] ?? 0);
  const minutes = Number(value.match(/(\d+)m/)?.[1] ?? 0);
  const seconds = Number(value.match(/(\d+)s/)?.[1] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function contentTypeForExtension(extension: "mp3" | "m4a" | "flac"): "audio/mpeg" | "audio/mp4" | "audio/flac" {
  if (extension === "flac") return "audio/flac";
  return extension === "m4a" ? "audio/mp4" : "audio/mpeg";
}

function isImageImportFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name);
}

function isJsonImportFile(file: File): boolean {
  return file.type === "application/json" || /\.json$/i.test(file.name);
}

function dataTransferHasImportFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes("Files");
}

function coverImageValidationMessage(file: File): string | undefined {
  if (!/^image\/(?:jpeg|jpg|png)$/i.test(file.type) && !/\.(png|jpe?g)$/i.test(file.name)) {
    return "Cover art must be a JPEG or PNG image.";
  }
  if (file.size > MAX_COVER_IMAGE_BYTES) {
    return `Cover art must be smaller than ${Math.round(MAX_COVER_IMAGE_BYTES / 1024 / 1024)} MB.`;
  }
  return undefined;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_COVER_IMAGE_BYTES) {
      reject(new Error(`Cover art must be smaller than ${Math.round(MAX_COVER_IMAGE_BYTES / 1024 / 1024)} MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read cover image."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function safeSetLocalStorageItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveLocalStorageItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private modes; callers keep working without it.
  }
}

function safeGetLocalStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function queueProcessorLease(): { owner: string; expiresAt: number } | null {
  const raw = safeGetLocalStorageItem(QUEUE_PROCESSOR_LEASE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { owner?: unknown; expiresAt?: unknown };
    return typeof parsed.owner === "string" && typeof parsed.expiresAt === "number"
      ? { owner: parsed.owner, expiresAt: parsed.expiresAt }
      : null;
  } catch {
    return null;
  }
}

function acquireQueueProcessorLease(owner: string): boolean {
  const current = queueProcessorLease();
  if (current && current.owner !== owner && current.expiresAt > Date.now()) return false;
  const payload = JSON.stringify({ owner, expiresAt: Date.now() + QUEUE_PROCESSOR_LEASE_TTL_MS });
  if (!safeSetLocalStorageItem(QUEUE_PROCESSOR_LEASE_KEY, payload)) return true;
  return queueProcessorLease()?.owner === owner;
}

function renewQueueProcessorLease(owner: string): boolean {
  const current = queueProcessorLease();
  if (current && current.owner !== owner && current.expiresAt > Date.now()) return false;
  const saved = safeSetLocalStorageItem(QUEUE_PROCESSOR_LEASE_KEY, JSON.stringify({ owner, expiresAt: Date.now() + QUEUE_PROCESSOR_LEASE_TTL_MS }));
  return saved || current === null;
}

function releaseQueueProcessorLease(owner: string): void {
  const current = queueProcessorLease();
  if (!current || current.owner === owner) safeRemoveLocalStorageItem(QUEUE_PROCESSOR_LEASE_KEY);
}

function readPersistedTidalState(): string | null {
  const primary = safeGetLocalStorageItem(TIDAL_STORAGE_KEY);
  const temp = safeGetLocalStorageItem(TIDAL_STORAGE_TEMP_KEY);
  const backup = safeGetLocalStorageItem(TIDAL_STORAGE_BACKUP_KEY);
  for (const candidate of [primary, temp, backup]) {
    if (!candidate) continue;
    try {
      JSON.parse(candidate);
      if (candidate !== primary) safeSetLocalStorageItem(TIDAL_STORAGE_KEY, candidate);
      safeRemoveLocalStorageItem(TIDAL_STORAGE_TEMP_KEY);
      return candidate;
    } catch {
      // Try the next persisted copy.
    }
  }
  return null;
}

function persistedQueueStatus(item: QueueItem): QueueStatus {
  return item.status === "processing" || item.status === "searching" || item.status === "done" ? "pending" : item.status;
}

function persistedQueueError(item: QueueItem): string | undefined {
  if (item.status === "processing" || item.status === "searching") return "Interrupted during previous session - ready to retry.";
  if (item.status === "done") return item.alreadyDownloaded ? "ZIP saved to Turrex Smart Library - auto-skip ready." : "ZIP lost - please re-download.";
  return item.errorMsg;
}

function serializableQueueItem(item: QueueItem, compact: boolean) {
  const { previewBlob: _previewBlob, previewUrl: _previewUrl, zipBlob: _zipBlob, ...itemWithoutBlobs } = item;
  const status = persistedQueueStatus(item);
  const errorMsg = persistedQueueError(item);
  if (!compact) {
return {
      ...itemWithoutBlobs,
      status,
      errorMsg,
      progress: undefined,
      progressMessage: undefined,
      zipFileName: undefined,
      tidalCandidates: item.tidalCandidates?.slice(0, 10), // store up to 10
      tidalCandidateIndex: item.tidalCandidateIndex,
    };
  }
  return {
    id: item.id,
    url: item.url,
    artist: item.artist,
    title: item.title,
    album: item.album,
    genre: item.genre,
    year: item.year,
    coverArt: typeof item.coverArt === "string" && item.coverArt.length <= 120_000 ? item.coverArt : null,
    priority: item.priority,
    status,
    progress: undefined,
    progressMessage: undefined,
    errorMsg: errorMsg?.slice(0, 240),
    duplicateExistingFile: item.duplicateExistingFile,
    forceDownload: item.forceDownload,
    zipByteLength: item.zipByteLength,
    tidalMatchTitle: item.tidalMatchTitle,
    tidalMatchArtist: item.tidalMatchArtist,
    tidalMatchAlbum: item.tidalMatchAlbum,
    tidalMatchDurationSec: item.tidalMatchDurationSec,
    tidalCandidateCount: item.tidalCandidateCount,
    isPlaylist: item.isPlaylist,
    alreadyDownloaded: item.alreadyDownloaded,
    libraryDownloadedAt: item.libraryDownloadedAt,
    libraryFilePath: item.libraryFilePath,
    source: item.source,
    addedAtIso: item.addedAtIso,
  };
}

function tidalPersistPayload(queue: QueueItem[], profile: ExportProfile, polishOptions: PolishOptions, options: TidalPersistOptions, compact: boolean): string {
  return JSON.stringify({
    queue: queue.map((item) => serializableQueueItem(item, compact)),
    profile,
    polishOptions,
    ...options,
    rateLimit: clampRateLimitSettings(options.rateLimit),
    errorLog: options.errorLog.slice(0, MAX_ERROR_LOG_ENTRIES),
    downloadHistory: options.downloadHistory.slice(0, MAX_DOWNLOAD_HISTORY),
    queuePresets: options.queuePresets.slice(0, MAX_QUEUE_PRESETS),
  });
}

function commitPersistedTidalPayload(payload: string): boolean {
  const previous = safeGetLocalStorageItem(TIDAL_STORAGE_KEY);
  if (previous) safeSetLocalStorageItem(TIDAL_STORAGE_BACKUP_KEY, previous);
  safeRemoveLocalStorageItem(TIDAL_STORAGE_TEMP_KEY);
  if (!safeSetLocalStorageItem(TIDAL_STORAGE_TEMP_KEY, payload)) {
    safeRemoveLocalStorageItem(TIDAL_STORAGE_BACKUP_KEY);
    if (!safeSetLocalStorageItem(TIDAL_STORAGE_TEMP_KEY, payload)) return false;
  }
  if (safeSetLocalStorageItem(TIDAL_STORAGE_KEY, payload)) {
    safeRemoveLocalStorageItem(TIDAL_STORAGE_TEMP_KEY);
  }
  return true;
}

function persistTidalState(queue: QueueItem[], profile: ExportProfile, polishOptions: PolishOptions, options: TidalPersistOptions): "full" | "compact" | "failed" {
  try {
    const payload = tidalPersistPayload(queue, profile, polishOptions, options, false);
    if (commitPersistedTidalPayload(payload)) return "full";
    const compactPayload = tidalPersistPayload(queue, profile, polishOptions, options, true);
    return commitPersistedTidalPayload(compactPayload) ? "compact" : "failed";
  } catch {
    return "failed";
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampRateLimitSettings(settings: Partial<RateLimitSettings>): RateLimitSettings {
  return {
    delaySeconds: clampNumber(settings.delaySeconds ?? 45, MIN_SCHEDULER_DELAY_SECONDS, 180),
    songsBeforeLongPause: clampNumber(settings.songsBeforeLongPause ?? 7, 3, 20),
    longPauseMinutes: clampNumber(settings.longPauseMinutes ?? 3, 1, 15),
    adaptiveCooldown: typeof settings.adaptiveCooldown === "boolean" ? settings.adaptiveCooldown : true,
    maxTransientRetries: clampNumber(settings.maxTransientRetries ?? DEFAULT_TRANSIENT_DOWNLOAD_RETRIES, 0, MAX_TRANSIENT_DOWNLOAD_RETRIES),
    transientBackoffSeconds: clampNumber(settings.transientBackoffSeconds ?? MIN_TRANSIENT_BACKOFF_SECONDS, MIN_TRANSIENT_BACKOFF_SECONDS, MAX_TRANSIENT_BACKOFF_SECONDS),
  };
}

function rateLimitPreset(preset: "safe" | "aggressive" | "night"): RateLimitSettings {
  if (preset === "aggressive") {
    return { delaySeconds: 30, songsBeforeLongPause: 5, longPauseMinutes: 1, adaptiveCooldown: true, maxTransientRetries: 1, transientBackoffSeconds: 10 };
  }
  if (preset === "night") {
    return { delaySeconds: 90, songsBeforeLongPause: 10, longPauseMinutes: 10, adaptiveCooldown: true, maxTransientRetries: 3, transientBackoffSeconds: 10 };
  }
  return { delaySeconds: 45, songsBeforeLongPause: 7, longPauseMinutes: 3, adaptiveCooldown: true, maxTransientRetries: DEFAULT_TRANSIENT_DOWNLOAD_RETRIES, transientBackoffSeconds: MIN_TRANSIENT_BACKOFF_SECONDS };
}

function isRateLimitSettings(value: unknown): value is RateLimitSettings {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RateLimitSettings>;
  return typeof record.delaySeconds === "number"
    && typeof record.songsBeforeLongPause === "number"
    && typeof record.longPauseMinutes === "number"
    && typeof record.adaptiveCooldown === "boolean";
}

function restoreErrorLogEntry(value: unknown): ErrorLogEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ErrorLogEntry>;
  const message = stringFromUnknown(record.message);
  if (!message) return null;
  return {
    id: stringFromUnknown(record.id) || makeId(),
    timestamp: stringFromUnknown(record.timestamp) || new Date().toISOString(),
    url: stringFromUnknown(record.url),
    title: stringFromUnknown(record.title),
    artist: stringFromUnknown(record.artist),
    message,
    body: record.body,
  };
}

function restoreDownloadHistoryEntry(value: unknown): DownloadHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DownloadHistoryEntry>;
  const queueItemId = stringFromUnknown(record.queueItemId);
  const profile = isExportProfile(record.profile) ? record.profile : "audiophile-flac";
  const title = stringFromUnknown(record.title);
  const artist = stringFromUnknown(record.artist);
  const url = stringFromUnknown(record.url);
  if (!queueItemId && !title && !artist && !url) return null;
  return {
    id: stringFromUnknown(record.id) || `${queueItemId || makeId()}:${profile}`,
    queueItemId: queueItemId || makeId(),
    url,
    title,
    artist,
    album: stringFromUnknown(record.album),
    genre: stringFromUnknown(record.genre),
    year: stringFromUnknown(record.year),
    profile,
    source: record.source === "tidal" || record.source === "json" || record.source === "ocr" ? record.source : "tidal",
    downloadedAtIso: stringFromUnknown(record.downloadedAtIso) || new Date().toISOString(),
    exportedFileName: stringFromUnknown(record.exportedFileName),
    zipByteLength: typeof record.zipByteLength === "number" ? record.zipByteLength : undefined,
    durationSec: typeof record.durationSec === "number" ? record.durationSec : undefined,
  };
}

function restoreQueuePreset(value: unknown): QueuePreset | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<QueuePreset>;
  const name = stringFromUnknown(record.name);
  if (!name) return null;
  const profile = isExportProfile(record.profile) ? record.profile : "audiophile-flac";
  const polish = record.polishOptions && typeof record.polishOptions === "object"
    ? { ...defaultPolishForProfile(profile, {
      cleanMetadata: true,
      embedCover: true,
      embedAudioCover: true,
      loudnorm: false,
      trimSilence: false,
      fadeInOut: false,
      truePeakLimiter: false,
      stereoEnhance: false,
      embedMetadata: true,
      musicbrainz: false,
      lyrics: false,
      verifyQuality: false,
      coverFallback: false,
      generatePlaylist: false,
      resizeCover: false,
      includeAnalysis: false,
    }), ...(record.polishOptions as Partial<PolishOptions>) }
    : defaultPolishForProfile(profile, {
      cleanMetadata: true,
      embedCover: true,
      embedAudioCover: true,
      loudnorm: false,
      trimSilence: false,
      fadeInOut: false,
      truePeakLimiter: false,
      stereoEnhance: false,
      embedMetadata: true,
      musicbrainz: false,
      lyrics: false,
      verifyQuality: false,
      coverFallback: false,
      generatePlaylist: false,
      resizeCover: false,
      includeAnalysis: false,
    });
  return {
    id: stringFromUnknown(record.id) || makeId(),
    name,
    profile,
    polishOptions: polish,
    rateLimit: clampRateLimitSettings(record.rateLimit ?? {}),
    filenameTemplate: stringFromUnknown(record.filenameTemplate) || "{artist} - {title}.{ext}",
    postQueueAction: isPostQueueAction(record.postQueueAction) ? record.postQueueAction : "none",
    useSoulseekFallback: typeof record.useSoulseekFallback === "boolean" ? record.useSoulseekFallback : true,
    createdAtIso: stringFromUnknown(record.createdAtIso) || new Date().toISOString(),
  };
}

function restoreQueueItem(value: unknown): QueueItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<QueueItem>;
  const url = stringFromUnknown(record.url);
  const title = stringFromUnknown(record.title);
  const artist = stringFromUnknown(record.artist);
  const priority = isQueuePriority(record.priority) ? record.priority : "medium";
  if (!url && !title && !artist) return null;
  const restoredStatus = record.status;
  const status: QueueStatus = restoredStatus === "error" || restoredStatus === "skipped" ? restoredStatus : "pending";
  const recoveredProcessing = restoredStatus === "processing" || restoredStatus === "searching";
  const recoveredDoneWithoutZip = restoredStatus === "done" && !record.zipBlob;
  return {
    id: stringFromUnknown(record.id) || makeId(),
    url,
    artist: artist || (url ? "Resolving..." : ""),
    title: title || (url ? titleFromTIDALUrl(url) : "Unknown Title"),
    album: stringFromUnknown(record.album),
    genre: stringFromUnknown(record.genre),
    year: stringFromUnknown(record.year),
    coverArt: stringFromUnknown(record.coverArt),
    priority,
    status,
    progress: 0,
    errorMsg: recoveredProcessing
      ? "Interrupted during previous session - ready to retry."
      : recoveredDoneWithoutZip
        ? record.alreadyDownloaded ? "ZIP saved to Turrex Smart Library - auto-skip ready." : "ZIP lost - please re-download."
      : status === "error" || status === "skipped"
        ? stringFromUnknown(record.errorMsg)
        : (!url ? "No TIDAL URL - will be skipped until you add one." : undefined),
    isPlaylist: Boolean(record.isPlaylist) || (url ? isAlbumOrPlaylist(url) : false),
    duplicateExistingFile: stringFromUnknown(record.duplicateExistingFile),
    forceDownload: Boolean(record.forceDownload),
    zipByteLength: typeof record.zipByteLength === "number" ? record.zipByteLength : undefined,
    durationSec: typeof record.durationSec === "number" ? record.durationSec : undefined,
    serverZipPath: stringFromUnknown(record.serverZipPath),
    albumTracks: Array.isArray(record.albumTracks) ? restoreAlbumTracks(record.albumTracks) : undefined,
    tidalMatchTitle: stringFromUnknown(record.tidalMatchTitle),
    tidalMatchArtist: stringFromUnknown(record.tidalMatchArtist),
    tidalMatchAlbum: stringFromUnknown(record.tidalMatchAlbum),
    tidalMatchDurationSec: typeof record.tidalMatchDurationSec === "number" ? record.tidalMatchDurationSec : undefined,
    tidalCandidateCount: typeof record.tidalCandidateCount === "number" ? record.tidalCandidateCount : undefined,
    // *** NEW LINES START ***
    tidalCandidates: Array.isArray(record.tidalCandidates)
      ? record.tidalCandidates.map(parseTidalSearchCandidate).filter((c): c is TidalSearchCandidate => Boolean(c))
      : undefined,
    tidalCandidateIndex: typeof record.tidalCandidateIndex === "number" ? record.tidalCandidateIndex : undefined,
    // *** NEW LINES END ***
    tracksExpanded: Boolean(record.tracksExpanded),
    alreadyDownloaded: Boolean(record.alreadyDownloaded),
    libraryDownloadedAt: stringFromUnknown(record.libraryDownloadedAt),
    libraryFilePath: stringFromUnknown(record.libraryFilePath),
    source: record.source === "json" || record.source === "ocr" || record.source === "tidal" ? record.source : (url ? "tidal" : "json"),
    addedAtIso: stringFromUnknown(record.addedAtIso) || new Date().toISOString(),
  };
}

function restoreAlbumTracks(value: unknown[]): AlbumTrackEntry[] {
  return value.map((entry, index): AlbumTrackEntry | null => {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const file = stringFromUnknown(record.file);
    if (!file) return null;
    return {
      artist: stringFromUnknown(record.artist),
      title: stringFromUnknown(record.title),
      album: stringFromUnknown(record.album),
      trackNumber: typeof record.trackNumber === "number" ? record.trackNumber : index + 1,
      duration: typeof record.duration === "number" ? record.duration : undefined,
      coverSource: stringFromUnknown(record.coverSource),
      file,
    };
  }).filter((entry): entry is AlbumTrackEntry => entry !== null);
}

function mergeQueueItems(current: QueueItem[], incoming: QueueItem[]): QueueItem[] {
  const byId = new Set(current.map((item) => item.id));
  const merged = [...current];
  for (const item of incoming) {
    if (byId.has(item.id)) continue;
    byId.add(item.id);
    merged.push(item);
  }
  return merged;
}

function isExportProfile(value: unknown): value is ExportProfile {
  return typeof value === "string" && exportProfiles.some((profile) => profile.id === value);
}

function isQueuePriority(value: unknown): value is QueuePriority {
  return value === "high" || value === "medium" || value === "low";
}

function isPostQueueAction(value: unknown): value is PostQueueAction {
  return value === "none" || value === "openFolder" || value === "notify";
}

function isQueueSortKey(value: unknown): value is QueueSortKey {
  return value === "manual" || value === "artist" || value === "title" || value === "album" || value === "priority" || value === "status" || value === "added";
}

function isQueueSortDirection(value: unknown): value is QueueSortDirection {
  return value === "asc" || value === "desc";
}

function isQueueSortSettings(value: unknown): value is QueueSortSettings {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<QueueSortSettings>;
  return isQueueSortKey(record.key) && isQueueSortDirection(record.direction);
}

function defaultPolishForProfile(profile: ExportProfile, current: PolishOptions): PolishOptions {
  const capabilities = profileCapabilities[profile];
  return {
    ...current,
    truePeakLimiter: current.truePeakLimiter && capabilities.truePeakLimiter,
    stereoEnhance: current.stereoEnhance && capabilities.stereoEnhance,
    embedAudioCover: capabilities.embedCover && current.embedAudioCover,
    embedMetadata: capabilities.embedMetadata && current.embedMetadata,
  };
}

function normalizeRestoredPolishOptions(options: Partial<PolishOptions>, preserveAdvancedChoices: boolean): Partial<PolishOptions> {
  if (preserveAdvancedChoices) return options;
  return {
    ...options,
    loudnorm: false,
    trimSilence: false,
    fadeInOut: false,
    truePeakLimiter: false,
    stereoEnhance: false,
    embedAudioCover: typeof options.embedAudioCover === "boolean" ? options.embedAudioCover : true,
    embedMetadata: typeof options.embedMetadata === "boolean" ? options.embedMetadata : true,
    musicbrainz: false,
    lyrics: false,
    verifyQuality: false,
    coverFallback: false,
    generatePlaylist: false,
    resizeCover: false,
    includeAnalysis: false,
  };
}

function isTIDALUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
    const kind = segments[0] === "browse" ? segments[1] : segments[0];
    const id = segments[0] === "browse" ? segments[2] : segments[1];
    return (host === "tidal.com" || host === "listen.tidal.com" || host.endsWith(".tidal.com"))
      && ["track", "album", "playlist", "mix"].includes(kind ?? "")
      && Boolean(id);
  } catch {
    return false;
  }
}

function isAlbumOrPlaylist(value: string): boolean {
  try {
    const segments = new URL(value).pathname.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
    const kind = segments[0] === "browse" ? segments[1] : segments[0];
    return kind === "album" || kind === "playlist" || kind === "mix";
  } catch {
    return false;
  }
}

function titleFromTIDALUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const kind = segments[0]?.toLowerCase() === "browse" ? segments[1] || "track" : segments[0] || "track";
    const id = segments[0]?.toLowerCase() === "browse" ? segments[2] || "link" : segments[1] || "link";
    return `${kind[0]?.toUpperCase() ?? "T"}${kind.slice(1)} ${id.slice(0, 10)}`;
  } catch {
    return "Resolving...";
  }
}

class SongImportError extends Error {
  code: "invalid-json" | "invalid-schema" | "empty-import";

  constructor(message: string, code: SongImportError["code"]) {
    super(message);
    this.name = "SongImportError";
    this.code = code;
  }
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

function songMatchFromBatchSong(song: BatchSong): SongMatch {
  return toSongMatch({
    title: song.title,
    artist: song.artist,
    album: song.album,
    coverUrl: normalizeBatchCoverUrl(song.coverUrl),
  });
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

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function firstString(item: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (Array.isArray(value)) {
      const normalized = value.map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean).join(", ");
      if (normalized) return normalized;
    }
    const text = stringFromUnknown(value);
    if (text) return text;
  }
  return undefined;
}

function tidalStatus(diagnostics: TidalDiagnostics | null, loading: boolean): { label: string; className: string; description: string } {
  if (loading || !diagnostics) {
    return {
      label: "Checking",
      className: "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)]",
      description: "TIDAL checks run after the page mounts.",
    };
  }
  if (!diagnostics.route.reachable || !diagnostics.tidal?.available || !(diagnostics.tidal.configExists || diagnostics.tidal.loggedIn) || !diagnostics.ffmpeg?.available || !diagnostics.ffprobe?.available) {
    return {
      label: diagnostics.tidal?.available ? "Needs setup" : "Disconnected",
      className: "border-[color:rgba(var(--status-danger-rgb),0.45)] bg-[color:rgba(var(--status-danger-rgb),0.12)] text-[var(--status-danger)]",
      description: "The tidekeeper CLI, TIDAL token, ffmpeg, or ffprobe is not reachable from this frontend runtime.",
    };
  }
  const expiry = tokenExpiryStatus(diagnostics);
  if (expiry.promptLogin) {
    return {
      label: expiry.expired ? "Expired" : "Refresh soon",
      className: "border-[color:rgba(var(--status-warning-rgb),0.55)] bg-[color:rgba(var(--status-warning-rgb),0.12)] text-[var(--status-warning)]",
      description: expiry.warning || "TIDAL is connected, but the token should be refreshed before a long queue.",
    };
  }
  return {
    label: "Connected",
    className: "border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] text-[var(--status-success)]",
    description: diagnostics.soulseek?.available ? "TIDAL, Soulseek fallback, and ffmpeg are ready for local ZIP exports." : "TIDAL and ffmpeg are ready; Soulseek fallback is not available.",
  };
}

function tokenExpiryStatus(diagnostics: TidalDiagnostics | null): { ok: boolean; detail: string; warning?: string; promptLogin: boolean; expired: boolean } {
  if (!diagnostics) return { ok: false, detail: "Waiting", promptLogin: false, expired: false };
  if (!diagnostics.tokenExpiry) {
    return diagnostics.tidal?.loggedIn
      ? { ok: true, detail: "Logged in; expiry not reported by tidekeeper", promptLogin: false, expired: false }
      : { ok: false, detail: "Waiting", promptLogin: false, expired: false };
  }
  const expiryTime = Date.parse(diagnostics.tokenExpiry);
  if (!Number.isFinite(expiryTime)) return { ok: false, detail: "Expiry value is invalid", promptLogin: true, expired: false, warning: "TIDAL token expiry could not be parsed. Recheck or log in before starting a queue." };
  const remainingMs = expiryTime - Date.now();
  const expiryLabel = new Date(diagnostics.tokenExpiry).toLocaleString();
  if (remainingMs <= 0) {
    return {
      ok: false,
      detail: `Expired at ${expiryLabel}`,
      warning: "TIDAL token has expired. Log in before resuming the queue.",
      promptLogin: true,
      expired: true,
    };
  }
  if (remainingMs <= TOKEN_EXPIRING_SOON_MS) {
    return {
      ok: false,
      detail: `Expires ${expiryLabel} (${formatDurationSeconds(Math.ceil(remainingMs / 1000))} left)`,
      warning: `TIDAL token expires in ${formatDurationSeconds(Math.ceil(remainingMs / 1000))}. Refresh before a long queue.`,
      promptLogin: true,
      expired: false,
    };
  }
  return {
    ok: true,
    detail: `Expires ${expiryLabel} (${formatDurationSeconds(Math.ceil(remainingMs / 1000))} left)`,
    promptLogin: false,
    expired: false,
  };
}

function shouldShowTidalLogin(diagnostics: TidalDiagnostics | null): boolean {
  if (!diagnostics?.tidal) return false;
  if (diagnostics.tidal.loggedIn === false) return true;
  if (diagnostics.tokenExpiry) {
    const expiryTime = Date.parse(diagnostics.tokenExpiry);
    if (Number.isFinite(expiryTime) && expiryTime <= Date.now()) return true;
  }
  const authText = `${diagnostics.tidal.error ?? ""} ${diagnostics.tidal.doctor ?? ""}`.toLowerCase();
  return authText.includes("expired") || authText.includes("invalid token") || authText.includes("not logged in") || authText.includes("login required");
}

function statusBadgeClass(status: QueueStatus): string {
  if (status === "done") return "border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] text-[var(--status-success)]";
  if (status === "error") return "border-[color:rgba(var(--status-danger-rgb),0.45)] bg-[color:rgba(var(--status-danger-rgb),0.12)] text-[var(--status-danger)]";
  if (status === "searching") return "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]";
  if (status === "processing") return "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]";
  if (status === "skipped") return "border-[color:rgba(var(--status-warning-rgb),0.45)] bg-[color:rgba(var(--status-warning-rgb),0.12)] text-[var(--status-warning)]";
  return "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)]";
}

function compactVersion(version?: string): string {
  return version?.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function formatQueueItemLine(item: Pick<QueueItem, "artist" | "title" | "url">): string {
  const title = item.title?.trim() || (item.url ? titleFromTIDALUrl(item.url) : "Unknown Title");
  const artist = item.artist?.trim();
  return artist && artist !== "Resolving..." ? `${artist} - ${title}` : title;
}

function queueItemZipFileName(item: Pick<QueueItem, "id" | "artist" | "title" | "url">): string {
  const suffix = `-${item.id.replace(/[^a-z0-9]/gi, "").slice(-8) || "download"}.zip`;
  const maxStemLength = Math.max(32, 200 - suffix.length);
  const rawStem = sanitizeFileName(formatQueueItemLine(item)) || "Turrex TIDAL Track";
  const stem = rawStem.length <= maxStemLength
    ? rawStem
    : `${rawStem.slice(0, maxStemLength - 3).replace(/[ .]+$/g, "")}...`;
  return `${stem}${suffix}`;
}

function cleanMetadataText(value: string): string {
  return value.replace(/\s*\[(official|lyrics?|audio|video|visualizer|hd|hq)\]\s*/gi, " ").replace(/\s*\((official|lyrics?|audio|video|visualizer|hd|hq)\)\s*/gi, " ").replace(/\s+/g, " ").trim();
}

function sanitizeFileName(input: string): string {
  const cleaned = cleanMetadataText(input).replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || "track";
}

function pathName(input: string): string {
  const normalized = input.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "track";
  return sanitizeFileName(normalized.replace(/\.[^.]+$/, "")) + (normalized.match(/\.[^.]+$/)?.[0] || "");
}

function isAudioZipPath(input: string): boolean {
  return /\.(mp3|m4a|flac)$/i.test(input);
}

function isCoverZipPath(input: string): boolean {
  return /(^|\/)cover\.jpe?g$/i.test(input);
}

function isRootAuxiliaryZipPath(input: string): boolean {
  return /^(manifest|playlist|quality-report|failed-items)\.(json|m3u8)$/i.test(input);
}

function sanitizeZipPathSegment(segment: string): string {
  const extension = segment.match(/\.[^.]+$/)?.[0] || "";
  const stem = extension ? segment.slice(0, -extension.length) : segment;
  return `${sanitizeFileName(stem)}${extension}`;
}

function normalizeChildZipEntryPath(input: string): string | undefined {
  let normalized = input.replace(/\\/g, "/").split("/").filter(Boolean).join("/");
  normalized = normalized.replace(/^Turrex TIDAL Export\//i, "").replace(/^tracks\//i, "");
  if (!normalized || normalized.split("/").some((part) => part === "..") || normalized.includes("\u0000")) return undefined;
  if (isRootAuxiliaryZipPath(normalized)) return undefined;
  const segments = normalized.split("/").map(sanitizeZipPathSegment).filter(Boolean);
  return segments.length ? segments.join("/") : undefined;
}

function albumFolderForFinalExport(item: Pick<QueueItem, "album">): string {
  const album = item.album?.trim();
  return sanitizeFileName(album || "Unknown Album");
}

function finalExportEntryPath(entryName: string, item: QueueItem): string | undefined {
  const normalized = normalizeChildZipEntryPath(entryName);
  if (!normalized) return undefined;
  if (!normalized.includes("/") && (isAudioZipPath(normalized) || isCoverZipPath(normalized))) {
    return `${albumFolderForFinalExport(item)}/${normalized}`;
  }
  return normalized;
}

function getUniqueZipEntryPath(relativePath: string, used: Set<string>): string | undefined {
  const normalized = relativePath.replace(/\\/g, "/").split("/").filter(Boolean).join("/");
  const key = normalized.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return normalized;
  }
  if (isCoverZipPath(normalized)) return undefined;
  const segments = normalized.split("/");
  const fileName = segments.pop() || "track";
  const folder = segments.join("/");
  const extension = fileName.match(/\.[^.]+$/)?.[0] || "";
  const stem = sanitizeFileName(extension ? fileName.slice(0, -extension.length) : fileName);
  let index = 2;
  while (true) {
    const candidateName = `${stem} (${index})${extension}`;
    const candidate = folder ? `${folder}/${candidateName}` : candidateName;
    const candidateKey = candidate.toLowerCase();
    if (!used.has(candidateKey)) {
      used.add(candidateKey);
      return candidate;
    }
    index += 1;
  }
}

function playlistBlob(entries: string[]): Blob {
  const body = ["#EXTM3U", ...entries.map((entry) => entry.replace(/\\/g, "/"))].join("\n");
  return new Blob([`${body}\n`], { type: "audio/x-mpegurl" });
}

function getUniqueFileName(fileName: string, used: Set<string>): string {
  const sanitized = sanitizeFileName(fileName.replace(/\.[^.]+$/, ""));
  const ext = fileName.match(/\.[^.]+$/)?.[0] || "";
  let candidate = `${sanitized}${ext}`;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${sanitized} (${index})${ext}`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function fileNameFromContentDisposition(value: string | null): string | undefined {
  if (!value) return undefined;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return sanitizeFileName(decodeURIComponent(encoded));
  const quoted = value.match(/filename="([^"]+)"/i)?.[1];
  if (quoted) return sanitizeFileName(quoted);
  const plain = value.match(/filename=([^;]+)/i)?.[1];
  return plain ? sanitizeFileName(plain.trim()) : undefined;
}

function guessImageExtension(type: string, name: string): string {
  const normalized = type.split(";")[0].toLowerCase();
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  const fromName = name.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/)?.[1];
  if (fromName) return fromName === "jpeg" ? ".jpg" : `.${fromName}`;
  return ".jpg";
}

function dateStamp(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}-${String(date.getMinutes()).padStart(2, "0")}`;
}

function saveBlobAsDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function saveTrackZipToDisk(blob: Blob, filename: string, directoryHandle: TurrexDirectoryHandle | null): Promise<{ filePath?: string; savedToDirectory: boolean }> {
  if (directoryHandle) {
    try {
      const perm = await (directoryHandle as any).queryPermission?.({ mode: "readwrite" });
      if (perm && perm !== "granted") {
        throw new Error("Folder permission was lost. Click 'Choose folder' again, then Resume.");
      }
      const safeName = sanitizeFileName(filename || "tidal-download.zip") || "tidal-download.zip";
      const fileHandle = await directoryHandle.getFileHandle(safeName, { create: true });      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { filePath: `${directoryHandle.name}/${safeName}`, savedToDirectory: true };
    } catch (error) {
      throw new Error(`Could not save ZIP to the selected folder. Re-select the folder and resume. ${error instanceof Error ? error.message : ""}`.trim());
    }
  }
  saveBlobAsDownload(blob, filename || "tidal-download.zip");
  return { savedToDirectory: false };
}

function normalizeLibraryTrackUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.toString();
  } catch {
    return trimmed;
  }
}

function readDownloadedUrlSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = safeGetLocalStorageItem(TURREX_DOWNLOADED_URLS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(normalizeLibraryTrackUrl).filter((value): value is string => Boolean(value)));
  } catch {
    return new Set();
  }
}

function persistDownloadedUrlSet(urls: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    safeSetLocalStorageItem(TURREX_DOWNLOADED_URLS_KEY, JSON.stringify(Array.from(urls).sort()));
  } catch {
    // IndexedDB stays authoritative if localStorage is unavailable.
  }
}

function setFromLibraryTracks(tracks: LibraryTrackRecord[]): Set<string> {
  return new Set(tracks.map((track) => normalizeLibraryTrackUrl(track.trackUrl)).filter((url): url is string => Boolean(url)));
}

function mergeLibraryTrackRecords(current: LibraryTrackRecord[], record: LibraryTrackRecord): LibraryTrackRecord[] {
  const merged = new Map(current.map((track) => [track.trackUrl, track]));
  merged.set(record.trackUrl, record);
  return Array.from(merged.values()).sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt));
}

function findLibraryTrackForUrl(url: unknown, tracks: LibraryTrackRecord[], downloadedUrls: Set<string>): LibraryTrackRecord | undefined {
  const normalized = normalizeLibraryTrackUrl(url);
  if (!normalized) return undefined;
  const record = tracks.find((track) => normalizeLibraryTrackUrl(track.trackUrl) === normalized);
  if (record) return record;
  return downloadedUrls.has(normalized)
    ? {
      trackUrl: normalized,
      artist: "Unknown Artist",
      title: titleFromTIDALUrl(normalized),
      downloadedAt: "",
      quality: "UNKNOWN",
      profile: "unknown",
      fileSize: 0,
    }
    : undefined;
}

function markQueueItemsWithLibrary(items: QueueItem[], tracks: LibraryTrackRecord[], downloadedUrls: Set<string>): QueueItem[] {
  let changed = false;
  const next = items.map((item) => {
    const match = findLibraryTrackForUrl(item.url, tracks, downloadedUrls);
    const alreadyDownloaded = Boolean(match);
    if (item.alreadyDownloaded === alreadyDownloaded && item.libraryDownloadedAt === match?.downloadedAt && item.libraryFilePath === match?.filePath) {
      return item;
    }
    changed = true;
    return {
      ...item,
      alreadyDownloaded,
      libraryDownloadedAt: match?.downloadedAt,
      libraryFilePath: match?.filePath,
    };
  });
  return changed ? next : items;
}

function qualityForLibraryProfile(profile: ExportProfile): string {
  if (profile === "audiophile-flac") return "HI_RES_LOSSLESS";
  if (profile === "analysis-only") return "HIGH";
  return profile.includes("mp3") || profile.includes("aac") ? "HIGH" : "LOSSLESS";
}

function formatLibraryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

function compareLibraryTracks(a: LibraryTrackRecord, b: LibraryTrackRecord, key: LibrarySortKey, direction: LibrarySortDirection): number {
  const multiplier = direction === "asc" ? 1 : -1;
  if (key === "downloadedAt") return (Date.parse(a.downloadedAt) - Date.parse(b.downloadedAt)) * multiplier;
  if (key === "fileSize") return (a.fileSize - b.fileSize) * multiplier;
  const left = String(a[key] ?? "").toLowerCase();
  const right = String(b[key] ?? "").toLowerCase();
  return left.localeCompare(right) * multiplier;
}

function openSmartLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TURREX_LIBRARY_DB_NAME, TURREX_LIBRARY_DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open Turrex Smart Library."));
    request.onblocked = () => reject(new Error("Turrex Smart Library is open in another tab. Close the other tab and retry."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TURREX_LIBRARY_STORE)) {
        db.createObjectStore(TURREX_LIBRARY_STORE, { keyPath: "trackUrl" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

async function readSmartLibraryTracks(): Promise<LibraryTrackRecord[]> {
  const db = await openSmartLibraryDb();
  try {
    return await new Promise((resolve, reject) => {
      let records: LibraryTrackRecord[] = [];
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const tx = db.transaction(TURREX_LIBRARY_STORE, "readonly");
      const store = tx.objectStore(TURREX_LIBRARY_STORE);
      const request = store.getAll();
      request.onerror = () => fail(request.error ?? new Error("Could not read Turrex Smart Library."));
      request.onsuccess = () => {
        records = Array.isArray(request.result) ? request.result.map(normalizeLibraryRecord).filter((record): record is LibraryTrackRecord => Boolean(record)) : [];
      };
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(records.sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt)));
      };
      tx.onerror = () => fail(tx.error ?? new Error("Could not read Turrex Smart Library."));
      tx.onabort = () => fail(tx.error ?? new Error("Turrex Smart Library read was aborted."));
    });
  } finally {
    db.close();
  }
}

async function putSmartLibraryTrack(record: LibraryTrackRecord): Promise<void> {
  const db = await openSmartLibraryDb();
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const tx = db.transaction(TURREX_LIBRARY_STORE, "readwrite");
      const store = tx.objectStore(TURREX_LIBRARY_STORE);
      const request = store.put(record);
      request.onerror = () => fail(request.error ?? new Error("Could not save this track to Turrex Smart Library."));
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      tx.onerror = () => fail(tx.error ?? new Error("Could not save this track to Turrex Smart Library."));
      tx.onabort = () => fail(tx.error ?? new Error("Turrex Smart Library save was aborted."));
    });
  } finally {
    db.close();
  }
}

async function clearSmartLibraryTracks(): Promise<void> {
  const db = await openSmartLibraryDb();
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const tx = db.transaction(TURREX_LIBRARY_STORE, "readwrite");
      const store = tx.objectStore(TURREX_LIBRARY_STORE);
      const request = store.clear();
      request.onerror = () => fail(request.error ?? new Error("Could not clear Turrex Smart Library."));
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      tx.onerror = () => fail(tx.error ?? new Error("Could not clear Turrex Smart Library."));
      tx.onabort = () => fail(tx.error ?? new Error("Turrex Smart Library clear was aborted."));
    });
  } finally {
    db.close();
  }
}

function normalizeLibraryRecord(value: unknown): LibraryTrackRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<LibraryTrackRecord>;
  const trackUrl = normalizeLibraryTrackUrl(record.trackUrl);
  if (!trackUrl) return null;
  return {
    trackUrl,
    artist: stringFromUnknown(record.artist) || "Unknown Artist",
    title: stringFromUnknown(record.title) || titleFromTIDALUrl(trackUrl),
    album: stringFromUnknown(record.album),
    downloadedAt: stringFromUnknown(record.downloadedAt) || new Date().toISOString(),
    quality: stringFromUnknown(record.quality) || "UNKNOWN",
    profile: stringFromUnknown(record.profile) || "unknown",
    fileSize: typeof record.fileSize === "number" && Number.isFinite(record.fileSize) ? record.fileSize : 0,
    filePath: stringFromUnknown(record.filePath),
  };
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isDefaultCoverPlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  return value === DEFAULT_COVER_PLACEHOLDER || value.endsWith("/album-placeholder.svg");
}

function normalizeBatchCoverUrl(value: unknown): string | undefined {
  const url = normalizeCoverUrl(value);
  return url && !isDefaultCoverPlaceholder(url) ? url : undefined;
}

function hasSelectedBatchCover(song: Pick<BatchSong, "coverUrl">): boolean {
  return Boolean(normalizeBatchCoverUrl(song.coverUrl));
}

function batchSongQueueKey(song: Pick<BatchSong, "id" | "artist" | "title">): string {
  return normalizeTrackKey(song.title, song.artist) || song.id;
}

function isBatchSongReadyForQueue(song: BatchSong): boolean {
  return song.selected
    && Boolean(song.title.trim())
    && Boolean(song.artist.trim())
    && (song.confidence >= LOW_CONFIDENCE || song.manuallyConfirmed);
}

function mergeBatchCoverCandidates(current: BatchSong["coverCandidates"], incoming: BatchSong["coverCandidates"]): BatchSong["coverCandidates"] {
  const byUrl = new Map<string, BatchSong["coverCandidates"][number]>();
  for (const candidate of [...current, ...incoming]) {
    const url = normalizeBatchCoverUrl(candidate.url);
    if (!url || byUrl.has(url)) continue;
    byUrl.set(url, { ...candidate, url });
  }
  return Array.from(byUrl.values());
}

function visibleBatchCoverCandidates(song: BatchSong): BatchSong["coverCandidates"] {
  const coverUrl = normalizeBatchCoverUrl(song.coverUrl);
  const candidates = mergeBatchCoverCandidates(song.coverCandidates, []);
  const selected = coverUrl
    ? candidates.find((candidate) => candidate.url === coverUrl) ?? { url: coverUrl, source: "selected", title: song.title, artist: song.artist, album: song.album }
    : undefined;
  const recent = candidates.filter((candidate) => candidate.url !== selected?.url).slice(-4);
  return selected ? [selected, ...recent.slice(-3)] : recent.slice(-4);
}

function getBadges(song: BatchSong, language: Language): string[] {
  const badges: string[] = [];
  if (!song.title.trim()) badges.push(t("download_badge_missing_title", language));
  if (!song.artist.trim()) badges.push(t("download_badge_missing_artist", language));
  if (!hasSelectedBatchCover(song)) badges.push(t("download_badge_missing_cover", language));
  if (song.confidence < LOW_CONFIDENCE) badges.push(t("download_badge_low_confidence", language));
  if (song.duplicateMerged) badges.push(t("download_badge_duplicate_merged", language));
  if (song.manuallyConfirmed) badges.push(t("download_badge_confirmed", language));
  if (song.manuallyEdited) badges.push(t("download_badge_edited", language));
  return badges;
}

function escapeCsv(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function downloadTextBlob(content: string, filename: string, type: string) {
  saveBlobAsDownload(new Blob([content], { type }), filename);
}

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i] ?? 0;
    for (let j = 0; j < 8; j += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (~c) >>> 0;
}

function normalizeZipPath(input: string): string {
  if (/^[a-zA-Z]:/.test(input) || input.startsWith("/") || input.startsWith("\\")) throw new Error("ZIP entry path must be relative.");
  const pathValue = input.replace(/\\/g, "/").split("/").filter(Boolean).join("/");
  if (!pathValue || pathValue.split("/").some((part) => part === "..") || pathValue.includes("\u0000")) throw new Error("ZIP entry path contains an unsafe segment.");
  return pathValue;
}

function assertZip32Value(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP_UINT32_MAX) throw new Error(`ZIP entry ${label} exceeds ZIP32 limits.`);
}

function assertZip16Value(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP_UINT16_MAX) throw new Error(`ZIP entry ${label} exceeds ZIP16 limits.`);
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
  return new Blob([...local, ...central, eocd].map((chunk) => chunk as unknown as BlobPart), { type: "application/zip" });
}
