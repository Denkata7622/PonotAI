'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Download, Info, Play, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import SongReviewModal from "@/components/SongReviewModal";
import { recognizeFromImage, type SongMatch, type SongRecognitionResult } from "@/features/recognition/api";
import { lookupCoverArtUrls } from "@/features/recognition/coverArt";
import { normalizeTrackKey } from "@/lib/songIdentity";
import { useLanguage } from "@/lib/LanguageContext";
import { t, type Language } from "@/lib/translations";
import { getApiConfigStatus } from "@/lib/apiConfig";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";

type QueueStatus = "pending" | "processing" | "done" | "error";
type DownloadState = "idle" | "processing" | "done" | "error";
type ExportProfile = "audiophile-flac" | "hifi-mp3" | "phone-aac-plus" | "normalized-mp3" | "analysis-only";

interface QueueItem {
  id: string;
  url?: string;
  artist?: string;
  title?: string;
  album?: string;
  durationSec?: number;
  status: QueueStatus;
  progress?: number;
  progressMessage?: string;
  errorMsg?: string;
  previewBlob?: Blob;
  previewUrl?: string;
  zipBlob?: Blob;
  zipFileName?: string;
  isPlaylist?: boolean;
  source: "spotify" | "json" | "ocr";
  addedAtIso: string;

  // TIDAL matching
  alreadyDownloaded?: boolean;
  libraryDownloadedAt?: string;
  libraryFilePath?: string;
  tidalMatchTitle?: string;
  tidalMatchArtist?: string;
  tidalMatchAlbum?: string;
  tidalMatchDurationSec?: number;
  tidalMatchConfidence?: number;
  tidalCandidateCount?: number;
}

type PolishOptions = {
  cleanMetadata: boolean;
  embedCover: boolean;
  embedAudioCover: boolean;
  truePeakLimiter: boolean;
  stereoEnhance: boolean;
  embedMetadata: boolean;
  includeAnalysis: boolean;
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

type SpotiflacStatusResponse = {
  spotiflac: ToolDiagnostic;
  ffmpeg: ToolDiagnostic;
  profiles: Array<{
    id: ExportProfile;
    label: string;
    extension: "mp3" | "m4a" | "flac";
    contentType: "audio/mpeg" | "audio/mp4" | "audio/flac";
    features?: Record<string, boolean | string>;
  }>;
  tempDir: string;
  writable: boolean;
  checkedAtIso: string;
};

type SpotiflacDiagnostics = {
  checkedAtIso: string;
  route: {
    url: string;
    reachable: boolean;
    status?: number;
    message?: string;
  };
  spotiflac: ToolDiagnostic | null;
  ffmpeg: ToolDiagnostic | null;
  temp: { dir: string; writable: boolean } | null;
  profiles: SpotiflacStatusResponse["profiles"];
  warnings: string[];
  fixes: string[];
};

type SseProgressEvent = {
  step: string;
  progress: number;
  message: string;
  token?: string;
  file?: string;
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
  coverUrl?: string;
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

type Notice = { type: "success" | "error"; message: string } | null;
type LastError = { timestamp: string; item: string; message: string; body?: unknown };

class SpotiflacClientError extends Error {
  body?: unknown;

  constructor(message: string, body?: unknown) {
    super(message);
    this.name = "SpotiflacClientError";
    this.body = body;
  }
}

const LOW_CONFIDENCE = 0.75;
const SPOTIFLAC_ENDPOINT = "/api/download/spotiflac";
const SPOTIFLAC_STORAGE_KEY = "turrex-spotiflac-state";
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

export default function Download3Page() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <section className="mx-auto w-full max-w-7xl px-0 py-2 sm:px-2">
        <div className="space-y-5">
          <SpotiflacDownloadClient />
          <BatchOcrSection />
        </div>
      </section>
    </main>
  );
}

function SpotiflacDownloadClient() {
  const [mounted, setMounted] = useState(false);
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [spotifyUrlError, setSpotifyUrlError] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [exportProfile, setExportProfile] = useState<ExportProfile>("audiophile-flac");
  const [polishOptions, setPolishOptions] = useState<PolishOptions>({
    cleanMetadata: true,
    embedCover: true,
    embedAudioCover: false,
    truePeakLimiter: false,
    stereoEnhance: false,
    embedMetadata: true,
    includeAnalysis: true,
  });
  const [state, setState] = useState<DownloadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState<SpotiflacDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [showSkippedImportRows, setShowSkippedImportRows] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [importedSongs, setImportedSongs] = useState<SongMatch[]>([]);
  const [lastErrors, setLastErrors] = useState<LastError[]>([]);
  const [lastExportName, setLastExportName] = useState("");
  const [previewingItemId, setPreviewingItemId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const restoredRef = useRef(false);

  const loadSpotiflacDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    setDiagnosticsError("");
    try {
      const response = await fetch(`${SPOTIFLAC_ENDPOINT}?action=status`, { cache: "no-store" });
      if (response.ok) {
        const status = await response.json() as SpotiflacStatusResponse;
        const warnings = [
          ...(status.spotiflac.available ? [] : [status.spotiflac.error || "SpotiFLAC is unavailable."]),
          ...(status.ffmpeg.available ? [] : [status.ffmpeg.error || "ffmpeg is unavailable."]),
          ...(status.writable ? [] : ["Temporary directory is not writable."]),
        ];
        setDiagnostics({
          checkedAtIso: status.checkedAtIso,
          route: { url: `${SPOTIFLAC_ENDPOINT}?action=status`, reachable: true, status: response.status, message: "Online" },
          spotiflac: status.spotiflac,
          ffmpeg: status.ffmpeg,
          temp: { dir: status.tempDir, writable: status.writable },
          profiles: status.profiles,
          warnings,
          fixes: [
            ...(status.spotiflac.available ? [] : ["Install SpotiFLAC with `pip install spotiflac` or set SPOTIFLAC_PATH to the executable."]),
            ...(status.ffmpeg.available ? [] : ["Install ffmpeg or set FFMPEG_PATH/FFMPEG_LOCATION to the ffmpeg executable."]),
            ...(status.writable ? [] : ["Use a writable OS temporary directory for ZIP creation."]),
          ],
        });
      } else {
        const detail = await response.text().catch(() => "");
        setDiagnostics({
          checkedAtIso: new Date().toISOString(),
          route: { url: `${SPOTIFLAC_ENDPOINT}?action=status`, reachable: false, status: response.status, message: detail || `Status check returned ${response.status}.` },
          spotiflac: null,
          ffmpeg: null,
          temp: null,
          profiles: exportProfiles.map((profile) => ({ id: profile.id, label: profile.label, extension: profile.extension, contentType: contentTypeForExtension(profile.extension) })),
          warnings: [detail || `SpotiFLAC status route returned ${response.status}.`],
          fixes: ["Verify app/api/download/spotiflac/route.ts is compiled and the dev server has restarted."],
        });
        setDiagnosticsError(`SpotiFLAC status returned ${response.status}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "SpotiFLAC diagnostics are unavailable.";
      setDiagnostics({
        checkedAtIso: new Date().toISOString(),
        route: { url: `${SPOTIFLAC_ENDPOINT}?action=status`, reachable: false, message },
        spotiflac: null,
        ffmpeg: null,
        temp: null,
        profiles: exportProfiles.map((profile) => ({ id: profile.id, label: profile.label, extension: profile.extension, contentType: contentTypeForExtension(profile.extension) })),
        warnings: [message],
        fixes: ["Restart the Next.js dev server and ensure the SpotiFLAC route is available."],
      });
      setDiagnosticsError(message);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    restoreSpotiflacState();
    void loadSpotiflacDiagnostics();
    return () => {
      abortRef.current?.abort();
      for (const item of queue) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, [loadSpotiflacDiagnostics]);

  useEffect(() => {
    if (!mounted || !restoredRef.current) return;
    persistSpotiflacState(queue, exportProfile, polishOptions);
  }, [exportProfile, mounted, polishOptions, queue]);

  const queueStats = useMemo(() => ({
    total: queue.length,
    pending: queue.filter((item) => item.status === "pending").length,
    processing: queue.filter((item) => item.status === "processing").length,
    done: queue.filter((item) => item.status === "done").length,
    error: queue.filter((item) => item.status === "error").length,
    skipped: queue.filter((item) => !item.url).length,
  }), [queue]);
  const activeProfile = exportProfiles.find((profile) => profile.id === exportProfile) ?? exportProfiles[0];
  const heroStatus = spotiflacStatus(mounted ? diagnostics : null, diagnosticsLoading);

  function updateQueueItem(id: string, patch: Partial<QueueItem>) {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function recordLastError(item: Pick<QueueItem, "artist" | "title" | "url">, message: string, body?: unknown) {
    setLastErrors((current) => [
      {
        timestamp: new Date().toISOString(),
        item: formatQueueItemLine(item),
        message,
        body,
      },
      ...current,
    ].slice(0, 4));
  }

  function restoreSpotiflacState() {
    if (restoredRef.current || typeof window === "undefined") return;
    restoredRef.current = true;
    try {
      const stored = window.localStorage.getItem(SPOTIFLAC_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { queue?: unknown; profile?: unknown; polishOptions?: unknown };
      if (isExportProfile(parsed.profile)) setExportProfile(parsed.profile);
      if (Array.isArray(parsed.queue)) {
        const restored = parsed.queue.map(restoreQueueItem).filter((item): item is QueueItem => Boolean(item));
        setQueue(restored);
        if (restored.length > 0) setState("idle");
      }
      if (parsed.polishOptions && typeof parsed.polishOptions === "object") {
        setPolishOptions((current) => ({ ...current, ...(parsed.polishOptions as Partial<PolishOptions>) }));
      }
    } catch {
      window.localStorage.removeItem(SPOTIFLAC_STORAGE_KEY);
    }
  }

  function addSpotifyUrlToQueue() {
    if (state === "processing") return;
    const url = spotifyUrl.trim();
    if (!isSpotifyUrl(url)) {
      setSpotifyUrlError("Enter a Spotify track, album, or playlist URL.");
      setErrorMessage("Enter a Spotify track, album, or playlist URL.");
      setState("error");
      return;
    }
    const item: QueueItem = {
      id: makeId(),
      url,
      artist: "Resolving...",
      title: titleFromSpotifyUrl(url),
      status: "pending",
      progress: 0,
      isPlaylist: isAlbumOrPlaylist(url),
      source: "spotify",
      addedAtIso: new Date().toISOString(),
    };
    setQueue((current) => mergeQueueItems(current, [item]));
    setSpotifyUrl("");
    setSpotifyUrlError("");
    setState("idle");
    setErrorMessage("");
    setLastExportName("");
  }

  async function pasteSpotifyUrlFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setSpotifyUrl(text.trim());
      setSpotifyUrlError("");
    } catch {
      setSpotifyUrlError("Clipboard access was blocked by the browser.");
    }
  }

  async function handleJsonImport(file: File | null) {
    if (!file || state === "processing") return;
    setErrorMessage("");
    try {
      const detailed = parseImportedSpotiflacSongs(await file.text());
      setImportedSongs(detailed.songs);
      setImportReport({
        parsedCount: detailed.songs.length,
        invalidCount: detailed.invalidItems.length,
        skippedCount: detailed.skippedCount,
        firstInvalidReason: detailed.invalidItems[0],
        invalidItems: detailed.invalidItems,
        filename: file.name,
      });
      setShowSkippedImportRows(false);
      setShowReviewModal(true);
    } catch (error) {
      const message = error instanceof SongImportError ? error.message : "Could not import this JSON file.";
      setState("error");
      setImportReport({
        parsedCount: 0,
        invalidCount: 1,
        skippedCount: 0,
        firstInvalidReason: `${message} Expected an array of strings/song objects or { "songs": [...] }, { "results": [...] }, or { "matches": [...] }.`,
        invalidItems: [`${message} Expected an array of strings/song objects or { "songs": [...] }, { "results": [...] }, or { "matches": [...] }.`],
        filename: file.name,
      });
      setErrorMessage(message);
    }
  }

  function handleCancelImportedSongs() {
    setShowReviewModal(false);
    setImportedSongs([]);
  }

  function handleConfirmImportedSongs(selectedSongs: SongMatch[]) {
    const now = new Date().toISOString();
    const importedItems: QueueItem[] = selectedSongs.map((song) => ({
      id: makeId(),
      artist: song.artist.trim(),
      title: song.songName.trim(),
      status: "pending" as const,
      errorMsg: "No Spotify URL - will be skipped until you add one.",
      source: "json" as const,
      addedAtIso: now,
    })).filter((item) => item.title?.trim() || item.artist?.trim());
    setQueue((current) => mergeQueueItems(current, importedItems));
    setImportReport((current) => current ? { ...current, parsedCount: importedItems.length } : current);
    setState("idle");
    setErrorMessage("");
    setShowReviewModal(false);
    setImportedSongs([]);
  }

  async function processQueue(autoExport: boolean) {
    if (queue.length === 0 || state === "processing") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setState("processing");
    setErrorMessage("");
    setLastExportName("");

    const coverArt = polishOptions.embedAudioCover && coverImage ? await fileToDataUrl(coverImage) : undefined;
    const processed: QueueItem[] = [];
    try {
      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index]!;
        if (controller.signal.aborted) throw new DOMException("Export cancelled.", "AbortError");
        if (!item.url) {
          const errorMsg = "No Spotify URL - will be skipped.";
          const skipped = { ...item, status: "error" as const, progress: 100, progressMessage: "Skipped", errorMsg };
          processed.push(skipped);
          updateQueueItem(item.id, skipped);
          continue;
        }
        if (item.status === "done" && item.zipBlob) {
          processed.push(item);
          continue;
        }

        updateQueueItem(item.id, { status: "processing", errorMsg: undefined, progress: 5, progressMessage: "Starting SpotiFLAC..." });
        try {
          const result = await downloadWithProgress({
            url: item.url,
            profile: exportProfile,
            preview: false,
            coverArt,
            enhancements: enhancementsPayload(polishOptions),
            signal: controller.signal,
            onProgress: (event) => updateQueueItem(item.id, { progress: event.progress, progressMessage: event.message }),
          });
          const doneItem = {
            ...item,
            status: "done" as const,
            progress: 100,
            progressMessage: "ZIP ready",
            errorMsg: undefined,
            zipBlob: result.blob,
            zipFileName: result.fileName,
          };
          processed.push(doneItem);
          updateQueueItem(item.id, doneItem);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          const details = errorDetailsFromUnknown(error, "SpotiFLAC download failed.");
          const errorItem = { ...item, status: "error" as const, progress: 100, progressMessage: "Failed", errorMsg: details.message };
          processed.push(errorItem);
          recordLastError(item, details.message, details.body);
          updateQueueItem(item.id, errorItem);
        }
      }

      setState("done");
      if (autoExport) {
        const latestQueue = processed.length === queue.length ? processed : queue;
        await exportFinalZip(latestQueue);
      }
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      setState(cancelled ? "idle" : "error");
      setErrorMessage(cancelled ? "SpotiFLAC export cancelled." : error instanceof Error ? error.message : "SpotiFLAC export failed.");
    } finally {
      abortRef.current = null;
    }
  }

  async function previewQueueItem(item: QueueItem) {
    if (previewingItemId || !item.url) {
      if (!item.url) updateQueueItem(item.id, { status: "error", errorMsg: "Add a Spotify URL before previewing." });
      return;
    }
    setPreviewingItemId(item.id);
    setErrorMessage("");
    try {
      const coverArt = polishOptions.embedAudioCover && coverImage ? await fileToDataUrl(coverImage) : undefined;
      const result = await downloadWithProgress({
        url: item.url,
        profile: "hifi-mp3",
        preview: true,
        coverArt,
        enhancements: enhancementsPayload({ ...polishOptions, includeAnalysis: false }),
        signal: new AbortController().signal,
        onProgress: (event) => updateQueueItem(item.id, { progress: event.progress, progressMessage: `Preview: ${event.message}` }),
      });
      const audio = await firstAudioBlobFromZip(result.blob);
      const previewUrl = URL.createObjectURL(audio);
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      updateQueueItem(item.id, { previewBlob: audio, previewUrl, progress: undefined, progressMessage: undefined });
      setTimeout(() => {
        const player = document.getElementById(`preview-${item.id}`) as HTMLAudioElement | null;
        void player?.play().catch(() => undefined);
      }, 0);
    } catch (error) {
      const details = errorDetailsFromUnknown(error, "Preview failed.");
      recordLastError(item, details.message, details.body);
      setErrorMessage(details.message);
      updateQueueItem(item.id, { errorMsg: details.message });
    } finally {
      setPreviewingItemId(null);
    }
  }

  async function exportFinalZip(items = queue) {
    const doneItems = items.filter((item) => item.status === "done" && item.zipBlob);
    if (doneItems.length === 0) {
      setErrorMessage("No completed SpotiFLAC ZIPs are ready to export.");
      setState("error");
      return;
    }

    const files: Array<{ path: string; blob: Blob }> = [];
    const used = new Set<string>();
    for (const item of doneItems) {
      const zipBlob = item.zipBlob;
      if (!zipBlob) continue;
      const folder = sanitizeFileName(formatQueueItemLine(item) || item.id);
      try {
        const entries = await readStoredZipEntries(zipBlob);
        for (const entry of entries) {
          if (entry.directory) continue;
          const fileName = getUniqueFileName(pathName(entry.name), used);
          files.push({ path: `Turrex SpotiFLAC Export/tracks/${folder}/${fileName}`, blob: entry.blob });
        }
      } catch {
        const fallbackName = getUniqueFileName(item.zipFileName || `${folder}.zip`, used);
        files.push({ path: `Turrex SpotiFLAC Export/source-zips/${fallbackName}`, blob: zipBlob });
      }
    }

    if (coverImage && polishOptions.embedCover) {
      files.push({ path: `Turrex SpotiFLAC Export/artwork/cover${guessImageExtension(coverImage.type, coverImage.name)}`, blob: coverImage });
    }

    const manifest = {
      app: "Turrex",
      exporter: "download-3 SpotiFLAC",
      endpoint: SPOTIFLAC_ENDPOINT,
      exportDateIso: new Date().toISOString(),
      profile: exportProfile,
      polishOptions,
      diagnostics: diagnostics ? {
        route: diagnostics.route,
        spotiflac: diagnostics.spotiflac,
        ffmpeg: diagnostics.ffmpeg,
        temp: diagnostics.temp,
      } : null,
      queue: items.map((item) => ({
        id: item.id,
        url: item.url ?? null,
        title: item.title ?? null,
        artist: item.artist ?? null,
        status: item.status,
        error: item.errorMsg ?? null,
        zipFileName: item.zipFileName ?? null,
        source: item.source,
      })),
    };
    files.push({ path: "Turrex SpotiFLAC Export/manifest.json", blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) });
    files.push({ path: "Turrex SpotiFLAC Export/failed-items.json", blob: new Blob([JSON.stringify(items.filter((item) => item.status === "error"), null, 2)], { type: "application/json" }) });

    const zip = await makeZip(files);
    const filename = `Turrex SpotiFLAC Export ${dateStamp(new Date())}.zip`;
    saveBlobAsDownload(zip, filename);
    setLastExportName(filename);
    setState("done");
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
    setState("idle");
  }

  function retryFailedItems() {
    if (state === "processing") return;
    setQueue((current) => current.map((item) => item.status === "error"
      ? { ...item, status: "pending" as const, errorMsg: item.url ? undefined : "No Spotify URL - will be skipped until you add one.", progress: 0, progressMessage: undefined }
      : item));
    setErrorMessage("");
    setState("idle");
  }

  function removeQueueItem(id: string) {
    if (state === "processing") return;
    setQueue((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  }

  function moveQueueItem(index: number, direction: -1 | 1) {
    if (state === "processing") return;
    setQueue((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(target, 0, item);
      return next;
    });
  }

  function cancelActiveJob() {
    abortRef.current?.abort();
  }

  const debugPayload = useMemo(() => JSON.stringify({
    spotiflac: {
      route: diagnostics?.route ?? { url: SPOTIFLAC_ENDPOINT, reachable: false },
      selectedProfile: exportProfile,
      selectedProfileLabel: activeProfile.label,
      output: activeProfile.extension === "flac" ? "Lossless FLAC ZIP" : activeProfile.extension === "m4a" ? "AAC/M4A 192kbps ZIP" : "MP3 320kbps ZIP",
      source: "Spotify URL resolved by local SpotiFLAC CLI",
      checkedAtIso: diagnostics?.checkedAtIso ?? null,
    },
    runtime: {
      spotiflac: diagnostics?.spotiflac ? { available: diagnostics.spotiflac.available, version: compactVersion(diagnostics.spotiflac.version), errorCode: diagnostics.spotiflac.errorCode } : null,
      ffmpeg: diagnostics?.ffmpeg ? { available: diagnostics.ffmpeg.available, version: compactVersion(diagnostics.ffmpeg.version), errorCode: diagnostics.ffmpeg.errorCode } : null,
      temp: diagnostics?.temp,
      profiles: diagnostics?.profiles ?? [],
    },
    queue: queueStats,
    exportProfile,
    polishOptions,
    lastExportName,
    lastErrors,
    warnings: diagnostics?.warnings ?? [],
    fixes: diagnostics?.fixes ?? [],
  }, null, 2), [activeProfile, diagnostics, exportProfile, lastErrors, lastExportName, polishOptions, queueStats]);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Personal export tool</p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--text)]">Local ZIP Export (SpotiFLAC)</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Build a private ZIP from Spotify track, album, or playlist links using SpotiFLAC lossless retrieval and local ffmpeg profiles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Environment: Local</span>
          <span className={`rounded-[var(--radius-sm)] border px-3 py-1.5 ${heroStatus.className}`}>SpotiFLAC: {heroStatus.label}</span>
          <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Quality: FLAC / 320kbps / AAC+</span>
          <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Output: Transcoding ready</span>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="space-y-5">
          <Card className="p-4 sm:p-6">
            <div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 text-sm leading-6">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <p className="min-w-0 text-[var(--text)]">
                SpotiFLAC downloads are requested through {SPOTIFLAC_ENDPOINT}. The server pulls FLAC from the CLI, applies the selected profile locally, and returns a ZIP token.
              </p>
            </div>

            <div className="mt-6 grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
              <div className="min-w-0">
                <label htmlFor="spotifyUrl" className="text-sm font-medium text-[var(--text)]">Spotify URL</label>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Paste a Spotify track, album, or playlist URL.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-start">
                <div className="min-w-0">
                  <Input
                    id="spotifyUrl"
                    value={spotifyUrl}
                    onChange={(event) => {
                      setSpotifyUrl(event.target.value);
                      if (spotifyUrlError) setSpotifyUrlError("");
                    }}
                    placeholder="Spotify track/album/playlist URL"
                    disabled={state === "processing"}
                  />
                  {spotifyUrlError ? <p className="mt-1 text-xs text-[var(--status-danger)]">{spotifyUrlError}</p> : null}
                </div>
                <Button type="button" variant="ghost" onClick={() => void pasteSpotifyUrlFromClipboard()} disabled={state === "processing"}>
                  Paste from clipboard
                </Button>
                <Button type="button" onClick={addSpotifyUrlToQueue} disabled={state === "processing"} className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add to Queue
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
                <p className="text-xs leading-5 text-[var(--muted)]">Imported artist/title rows do not include Spotify URLs and will be skipped until edited.</p>
              </div>

              <div className="min-w-0 space-y-2">
                <label htmlFor="coverImage" className="text-sm font-medium text-[var(--text)]">Cover image</label>
                <label htmlFor="coverImage" className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)]">
                  <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{coverImage ? coverImage.name : "Choose cover art for the ZIP"}</span>
                </label>
                <input
                  id="coverImage"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setCoverImage(file);
                    setPolishOptions((current) => ({ ...current, embedAudioCover: Boolean(file), embedCover: Boolean(file) || current.embedCover }));
                  }}
                  className="sr-only"
                  disabled={state === "processing"}
                />
              </div>
            </div>

            <AudioPolishPanel
              activeProfile={activeProfile}
              coverImage={coverImage}
              disabled={state === "processing"}
              exportProfile={exportProfile}
              polishOptions={polishOptions}
              onProfileChange={(profile) => {
                setExportProfile(profile);
                setPolishOptions((current) => defaultPolishForProfile(profile, current, Boolean(coverImage)));
              }}
              onPolishChange={(patch) => setPolishOptions((current) => ({ ...current, ...patch }))}
            />

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={() => void processQueue(false)} disabled={queue.length === 0 || state === "processing"} variant="primary" className="inline-flex items-center gap-2">
                <Download className="h-4 w-4" aria-hidden="true" />
                {state === "processing" ? "Processing" : "Process Queue"}
              </Button>
              <Button onClick={() => void processQueue(true)} disabled={queue.length === 0 || state === "processing"} className="inline-flex items-center gap-2">
                <Download className="h-4 w-4" aria-hidden="true" />
                Process Queue & Export ZIP
              </Button>
              <Button onClick={() => void exportFinalZip()} disabled={queueStats.done === 0 || state === "processing"} variant="secondary" className="inline-flex items-center gap-2">
                <Download className="h-4 w-4" aria-hidden="true" />
                Export ZIP
              </Button>
              <Button onClick={retryFailedItems} disabled={queueStats.error === 0 || state === "processing"} variant="secondary" className="inline-flex items-center gap-2">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retry Failed
              </Button>
              <Button onClick={clearQueue} disabled={queue.length === 0 || state === "processing"} variant="ghost" className="inline-flex items-center gap-2">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear Queue
              </Button>
              {state === "processing" ? <Button onClick={cancelActiveJob} variant="ghost">Cancel</Button> : null}
            </div>

            <QueuePanel
              queue={queue}
              queueStats={queueStats}
              importReport={importReport}
              showSkippedImportRows={showSkippedImportRows}
              disabled={state === "processing"}
              previewingItemId={previewingItemId}
              onToggleSkipped={() => setShowSkippedImportRows((value) => !value)}
              onPreview={(item) => void previewQueueItem(item)}
              onRemove={removeQueueItem}
              onMove={moveQueueItem}
              onEdit={(id, patch) => updateQueueItem(id, patch)}
            />
          </Card>
        </div>

        <div className="space-y-5">
          <ProgressCard state={state} queueStats={queueStats} errorMessage={errorMessage} lastExportName={lastExportName} />
          <DebugDetailsCard payload={debugPayload} />
        </div>

        <SpotiflacDiagnosticsCard
          mounted={mounted}
          diagnostics={diagnostics}
          diagnosticsError={diagnosticsError}
          diagnosticsLoading={diagnosticsLoading}
          onRecheck={() => void loadSpotiflacDiagnostics()}
        />
      </div>

      {showReviewModal ? (
        <SongReviewModal
          songs={importedSongs}
          onCancel={handleCancelImportedSongs}
          onConfirm={handleConfirmImportedSongs}
        />
      ) : null}
    </>
  );
}

function AudioPolishPanel({ activeProfile, coverImage, disabled, exportProfile, polishOptions, onProfileChange, onPolishChange }: {
  activeProfile: (typeof exportProfiles)[number];
  coverImage: File | null;
  disabled: boolean;
  exportProfile: ExportProfile;
  polishOptions: PolishOptions;
  onProfileChange: (profile: ExportProfile) => void;
  onPolishChange: (patch: Partial<PolishOptions>) => void;
}) {
  return (
    <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--text)]">Audio polish</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">SpotiFLAC starts from FLAC, then the API applies metadata, cover art, limiting, stereo widening, or phone AAC processing based on the selected profile.</p>
        </div>
        <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]">
          Output: {activeProfile.extension.toUpperCase()} via {activeProfile.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <input type="checkbox" checked={polishOptions.cleanMetadata} onChange={(event) => onPolishChange({ cleanMetadata: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--text)]">Clean title/artist metadata</span>
            <span className="block text-xs leading-5 text-[var(--muted)]">Normalizes file names and manifest rows while preserving SpotiFLAC tags.</span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <input type="checkbox" checked={polishOptions.embedCover} onChange={(event) => onPolishChange({ embedCover: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--text)]">Embed cover art when available</span>
            <span className="block text-xs leading-5 text-[var(--muted)]">Adds the selected artwork to the final ZIP next to processed files.</span>
          </span>
        </label>

        <div className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-sm font-medium text-[var(--text)]">Export profile</p>
          <p className="text-xs leading-5 text-[var(--muted)]">Choose the container, metadata, and enhancement chain.</p>
          <div className="grid gap-3">
            {exportProfiles.map((profile) => (
              <label
                key={profile.id}
                className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border bg-[var(--surface-subtle)] p-3 transition hover:border-[var(--accent-border)] ${exportProfile === profile.id ? "border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]" : profile.best ? "border-amber-400/60" : "border-[var(--border)]"}`}
              >
                <input type="radio" name="spotiflac-export-profile" checked={exportProfile === profile.id} onChange={() => onProfileChange(profile.id)} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text)]">{profile.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${profile.best ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"}`}>{profile.badge}</span>
                  </span>
                  <span className="block text-xs leading-5 text-[var(--muted)]">{profile.description}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--accent)]">{profile.features}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-sm font-medium text-[var(--text)]">Enhancements</p>
          <div className="grid gap-2">
            <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <input type="checkbox" checked={polishOptions.truePeakLimiter} onChange={(event) => onPolishChange({ truePeakLimiter: event.target.checked })} disabled={disabled || exportProfile === "audiophile-flac"} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
              <span><span className="block text-sm font-medium text-[var(--text)]">True Peak Limiting</span><span className="block text-xs text-[var(--muted)]">Prevents clipping after loudness processing.</span></span>
            </label>
            <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <input type="checkbox" checked={polishOptions.stereoEnhance} onChange={(event) => onPolishChange({ stereoEnhance: event.target.checked })} disabled={disabled || exportProfile === "audiophile-flac"} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
              <span><span className="block text-sm font-medium text-[var(--text)]">Stereo Enhancement</span><span className="block text-xs text-[var(--muted)]">Adds a subtle wider soundstage for Hi-Fi MP3.</span></span>
            </label>
            <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <input type="checkbox" checked={polishOptions.embedAudioCover} onChange={(event) => onPolishChange({ embedAudioCover: event.target.checked })} disabled={disabled || !coverImage} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
              <span><span className="block text-sm font-medium text-[var(--text)]">Embed Cover Art</span><span className="block text-xs text-[var(--muted)]">Writes the selected cover into processed audio files.</span></span>
            </label>
            <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <input type="checkbox" checked={polishOptions.embedMetadata} onChange={(event) => onPolishChange({ embedMetadata: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
              <span><span className="block text-sm font-medium text-[var(--text)]">Full ID3 Metadata</span><span className="block text-xs text-[var(--muted)]">Embeds album, year, exporter, and profile tags while preserving source tags where possible.</span></span>
            </label>
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <input type="checkbox" checked={polishOptions.includeAnalysis} onChange={(event) => onPolishChange({ includeAnalysis: event.target.checked })} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--text)]">Include export analysis manifest</span>
            <span className="block text-xs leading-5 text-[var(--muted)]">Adds processing diagnostics to manifest.json inside the final ZIP.</span>
          </span>
        </label>
      </div>
    </div>
  );
}

function QueuePanel({ queue, queueStats, importReport, showSkippedImportRows, disabled, previewingItemId, onToggleSkipped, onPreview, onRemove, onMove, onEdit }: {
  queue: QueueItem[];
  queueStats: { total: number; pending: number; done: number; error: number; skipped: number };
  importReport: ImportReport | null;
  showSkippedImportRows: boolean;
  disabled: boolean;
  previewingItemId: string | null;
  onToggleSkipped: () => void;
  onPreview: (item: QueueItem) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onEdit: (id: string, patch: Partial<QueueItem>) => void;
}) {
  return (
    <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--text)]">Export queue</p>
          <p className="text-sm text-[var(--muted)]">{queue.length === 0 ? "No Spotify links queued yet." : `${queue.length} item${queue.length === 1 ? "" : "s"} queued for SpotiFLAC.`}</p>
        </div>
        {queue.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            <span className="rounded-full border border-[var(--border)] px-2 py-1">Pending {queueStats.pending}</span>
            <span className="rounded-full border border-[var(--border)] px-2 py-1">Done {queueStats.done}</span>
            <span className="rounded-full border border-[var(--border)] px-2 py-1">Errors {queueStats.error}</span>
            <span className="rounded-full border border-[var(--border)] px-2 py-1">No URL {queueStats.skipped}</span>
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
        <div className="mt-3 grid gap-2">
          {queue.map((item, index) => (
            <QueueItemCard
              key={item.id}
              item={item}
              index={index}
              total={queue.length}
              disabled={disabled}
              previewing={previewingItemId === item.id}
              onPreview={() => onPreview(item)}
              onRemove={() => onRemove(item.id)}
              onMove={(direction) => onMove(index, direction)}
              onEdit={(patch) => onEdit(item.id, patch)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 py-4 text-sm text-[var(--muted)]">
          Add a Spotify URL or import a JSON list to begin.
        </p>
      )}
    </div>
  );
}

function QueueItemCard({ item, index, total, disabled, previewing, onPreview, onRemove, onMove, onEdit }: {
  item: QueueItem;
  index: number;
  total: number;
  disabled: boolean;
  previewing: boolean;
  onPreview: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onEdit: (patch: Partial<QueueItem>) => void;
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input aria-label="Title" value={item.title ?? ""} onChange={(event) => onEdit({ title: event.target.value })} placeholder="Title" disabled={disabled} className="text-sm" />
            <Input aria-label="Artist" value={item.artist ?? ""} onChange={(event) => onEdit({ artist: event.target.value })} placeholder="Artist" disabled={disabled} className="text-sm" />
          </div>
          <Input
            aria-label="Spotify URL"
            value={item.url ?? ""}
            onChange={(event) => onEdit({ url: event.target.value.trim(), errorMsg: event.target.value.trim() ? undefined : "No Spotify URL - will be skipped.", isPlaylist: isAlbumOrPlaylist(event.target.value) })}
            placeholder="Spotify URL"
            disabled={disabled}
            className="text-sm"
          />
          {!item.url ? <p className="text-xs text-[var(--status-warning)]">No Spotify URL - will be skipped</p> : null}
          {item.zipFileName ? <p className="break-words text-xs text-[var(--muted)]">{item.zipFileName}</p> : null}
          {item.previewUrl ? (
            <audio id={`preview-${item.id}`} controls src={item.previewUrl} className="mt-1 w-full" />
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}>{item.status}</span>
          {item.isPlaylist ? <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">album/playlist</span> : null}
          <div className="flex flex-wrap justify-end gap-1">
            <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={() => onMove(-1)} disabled={disabled || index === 0}>Up</button>
            <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={() => onMove(1)} disabled={disabled || index === total - 1}>Down</button>
            <button type="button" className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={onPreview} disabled={disabled || previewing || item.status === "processing" || !item.url}>
              <Play className="h-3 w-3" aria-hidden="true" />
              {previewing ? "Previewing" : "Preview"}
            </button>
            {item.status === "error" ? (
              <button type="button" className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-danger-rgb),0.45)] px-2 py-1 text-xs text-[var(--status-danger)] hover:bg-[color:rgba(var(--status-danger-rgb),0.12)] disabled:opacity-40" onClick={onRemove} disabled={disabled}>
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Dismiss
              </button>
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
          <p className="mt-1 text-sm text-[var(--muted)]">{state === "processing" ? "SpotiFLAC jobs are running locally." : state === "done" ? "Completed items are ready for ZIP export." : "Waiting for Spotify URLs."}</p>
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
          <p className="mt-1 text-sm text-[var(--muted)]">SpotiFLAC status, ffmpeg runtime, queue state, and ZIP options.</p>
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

function SpotiflacDiagnosticsCard({ mounted, diagnostics, diagnosticsError, diagnosticsLoading, onRecheck }: {
  mounted: boolean;
  diagnostics: SpotiflacDiagnostics | null;
  diagnosticsError: string;
  diagnosticsLoading: boolean;
  onRecheck: () => void;
}) {
  const status = spotiflacStatus(mounted ? diagnostics : null, diagnosticsLoading);
  const primaryFix = diagnostics?.fixes[0];

  return (
    <Card className="h-fit p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">SpotiFLAC Diagnostics</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Checks the CLI and transcoder pieces used by /api/download/spotiflac.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
      </div>

      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{status.description}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">SpotiFLAC requests use a local CLI process and local ffmpeg transcoding.</p>

      <div className="mt-4 grid gap-2">
        <ToolRow label="SpotiFLAC" ok={Boolean(diagnostics?.spotiflac?.available)} detail={compactVersion(diagnostics?.spotiflac?.version) || (diagnostics?.spotiflac?.errorCode ? `Error ${diagnostics.spotiflac.errorCode}` : "Waiting")} />
        <ToolRow label="ffmpeg" ok={Boolean(diagnostics?.ffmpeg?.available)} detail={compactVersion(diagnostics?.ffmpeg?.version) || (diagnostics?.ffmpeg?.errorCode ? `Error ${diagnostics.ffmpeg.errorCode}` : "Waiting")} />
        <ToolRow label="Profiles" ok={Boolean(diagnostics?.profiles.length)} detail={diagnostics?.profiles.length ? diagnostics.profiles.map((profile) => profile.id).join(", ") : "Waiting"} />
        <ToolRow label="Transcode" ok={Boolean(diagnostics?.ffmpeg?.available)} detail={diagnostics?.ffmpeg?.available ? "FLAC copy, MP3 320k, AAC/M4A 192k, loudnorm, limiter" : "Needs ffmpeg"} />
        <ToolRow label="temp" ok={Boolean(diagnostics?.temp?.writable)} detail={diagnostics?.temp ? `${diagnostics.temp.writable ? "Writable" : "Not writable"} (${diagnostics.temp.dir})` : "Waiting"} />
        <ToolRow label="Output" ok detail="ZIP containing FLAC, MP3, or M4A/AAC processed from SpotiFLAC FLAC source" />
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
      {diagnostics?.warnings.length ? (
        <div className="mt-4 space-y-2">
          {diagnostics.warnings.map((warning) => <p key={warning} className="break-words text-sm leading-6 text-[var(--muted)]">{warning}</p>)}
        </div>
      ) : null}
      <Button onClick={onRecheck} disabled={!mounted || diagnosticsLoading} className="mt-5 inline-flex w-full items-center justify-center gap-2">
        <RotateCcw className={`h-4 w-4 ${diagnosticsLoading ? "animate-spin" : ""}`} aria-hidden="true" />
        {diagnosticsLoading ? "Checking SpotiFLAC" : "Recheck SpotiFLAC"}
      </Button>
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

function BatchOcrSection() {
  const { language } = useLanguage();
  const [jobs, setJobs] = useState<BatchImageJob[]>([]);
  const [songs, setSongs] = useState<BatchSong[]>([]);
  const [activeCoverSongId, setActiveCoverSongId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [isJobsOpen, setIsJobsOpen] = useState(true);
  const [isFindingAllCovers, setIsFindingAllCovers] = useState(false);
  const [coverLoadingSongIds, setCoverLoadingSongIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const activeBatchIdRef = useRef(0);

  useEffect(() => () => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    const status = getApiConfigStatus();
    setApiBaseUrl(status.baseUrl ?? "");
    if (!status.baseUrl && status.message) {
      setNotice({ type: "error", message: `${status.message} Image recognition and automatic cover lookup need the backend API, but SpotiFLAC ZIP Export remains available through the frontend service.` });
    }
  }, []);

  const summary = useMemo(() => {
    const imagesProcessed = jobs.filter((job) => job.status === "done" || job.status === "error").length;
    const totalImages = jobs.length;
    const totalSongsFound = songs.length;
    const duplicatesMerged = songs.filter((song) => song.duplicateMerged).length;
    const selectedSongs = songs.filter((song) => song.selected).length;
    const songsNeedingReview = songs.filter((song) => song.needsReview).length;
    const songsMissingCovers = songs.filter((song) => !song.coverUrl).length;
    return { imagesProcessed, totalImages, totalSongsFound, duplicatesMerged, selectedSongs, songsNeedingReview, songsMissingCovers };
  }, [jobs, songs]);

  const jobsCanCollapse = jobs.length > 0 && jobs.every((job) => job.status === "done" || job.status === "error");

  function computeNeedsReview(song: BatchSong): boolean {
    return !song.title.trim() || !song.artist.trim() || !song.coverUrl || (song.confidence < LOW_CONFIDENCE && !song.manuallyConfirmed);
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
      const base: BatchSong = {
        id: makeId(),
        title: (entry.songName || "").trim(),
        artist: (entry.artist || "").trim(),
        album: (entry.album || "").trim() || undefined,
        coverUrl: entry.albumArtUrl?.trim() || undefined,
        coverCandidates: entry.albumArtUrl?.trim()
          ? [{ url: entry.albumArtUrl.trim(), source: "ocr", title: entry.songName, artist: entry.artist, album: entry.album }]
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
    const batchId = activeBatchIdRef.current;
    setNotice(null);
    const nextJobs = files.map((file) => {
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
          const result = await recognizeFromImage(job.file, 20, "eng");
          if (activeBatchIdRef.current !== batchId) return;
          const produced = songsFromRecognition(job.id, result.songs);
          setSongs((prev) => mergeSongs(prev, produced));
          setJobs((prev) => prev.map((row) => (row.id === job.id ? { ...row, status: "done", foundCount: produced.length } : row)));
        } catch (error) {
          if (activeBatchIdRef.current !== batchId) return;
          const message = error instanceof Error ? error.message : t("download_generic_error", language);
          setJobs((prev) => prev.map((row) => (row.id === job.id ? { ...row, status: "error", error: message } : row)));
        }
      }
    };
    await Promise.all(Array.from({ length: 3 }).map(() => worker()));
  }

  function clearBatch() {
    activeBatchIdRef.current += 1;
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
    setJobs([]);
    setSongs([]);
    setNotice(null);
    setActiveCoverSongId(null);
  }

  function updateSong(songId: string, patch: Partial<BatchSong>) {
    setSongs((prev) => prev.map((song) => {
      if (song.id !== songId) return song;
      const updated = { ...song, ...patch };
      updated.needsReview = computeNeedsReview(updated);
      return updated;
    }));
  }

  const findCoversForSong = useCallback(async (songId: string, options?: { suppressNotice?: boolean }) => {
    if (!apiBaseUrl) {
      if (!options?.suppressNotice) setNotice({ type: "error", message: t("download_cover_lookup_unavailable", language) });
      return false;
    }
    const song = songs.find((item) => item.id === songId);
    if (!song) return false;
    setCoverLoadingSongIds((prev) => Array.from(new Set([...prev, songId])));
    try {
      const urls = await lookupCoverArtUrls(apiBaseUrl, song.title, song.artist, { limit: 8, exclude: song.coverCandidates.map((item) => item.url) });
      if (urls.length === 0) return true;
      setSongs((prev) => prev.map((entry) => {
        if (entry.id !== songId) return entry;
        const coverCandidates = Array.from(new Map([
          ...entry.coverCandidates.map((item) => [item.url, item] as const),
          ...urls.map((url) => [url, { url, source: "lookup", title: entry.title, artist: entry.artist, album: entry.album }] as const),
        ]).values());
        const next = { ...entry, coverCandidates };
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
      const missing = songs.filter((song) => !song.coverUrl);
      for (const song of missing) {
        const ok = await findCoversForSong(song.id, { suppressNotice: true });
        if (!ok) failedCount += 1;
      }
    } finally {
      setIsFindingAllCovers(false);
    }
    if (failedCount > 0) setNotice({ type: "error", message: t("download_cover_lookup_failed", language, { count: failedCount }) });
  }

  function validateSelected() {
    const selected = songs.filter((song) => song.selected);
    if (selected.length === 0) {
      setNotice({ type: "error", message: t("download_no_selected", language) });
      return;
    }
    const invalid = selected.find((song) => !song.title.trim() || !song.artist.trim() || !song.coverUrl || (song.confidence < LOW_CONFIDENCE && !song.manuallyConfirmed));
    if (invalid) {
      setNotice({ type: "error", message: t("download_validation_error", language) });
      return;
    }
    setNotice({ type: "success", message: t("download_ready_process", language, { count: selected.length }) });
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

  const handleModalRefresh = useCallback(() => {
    if (!activeCoverSongId) return;
    void findCoversForSong(activeCoverSongId);
  }, [activeCoverSongId, findCoversForSong]);

  return (
    <>
      <div className="mt-8 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t("download_batch_title", language)}</h1>
            <p className="text-sm text-[var(--muted)]">{t("download_batch_desc", language)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) void processBatch(files);
                event.currentTarget.value = "";
              }}
            />
            <button type="button" className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" onClick={() => fileInputRef.current?.click()}>
              {t("download_add_images", language)}
            </button>
            <button type="button" className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" onClick={() => void findCoversForAllMissing()} disabled={isFindingAllCovers}>
              {isFindingAllCovers ? t("download_searching", language) : t("download_find_all_covers", language)}
            </button>
            <button type="button" className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" onClick={clearBatch}>
              {t("download_clear_batch", language)}
            </button>
          </div>
        </div>

        {notice ? (
          <div className={`rounded-lg border p-3 text-sm ${notice.type === "error" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
            {notice.message}
          </div>
        ) : null}

        <BatchSummary summary={summary} language={language} />
        <ImageJobList jobs={jobs} language={language} isOpen={isJobsOpen} canCollapse={jobsCanCollapse} onToggle={() => setIsJobsOpen((value) => !value)} />
        {jobs.length === 0 ? <p className="text-sm text-[var(--muted)]">{t("download_empty_jobs", language)}</p> : null}
        <SongReviewList songs={songs} language={language} coverLoadingSongIds={coverLoadingSongIds} onChangeSong={updateSong} onOpenCover={(songId) => setActiveCoverSongId(songId)} onFindCover={(songId) => void findCoversForSong(songId)} />
        {jobs.length > 0 && songs.length === 0 && jobsCanCollapse ? <p className="text-sm text-[var(--muted)]">{t("download_empty_songs", language)}</p> : null}
      </div>

      <StickyReviewBar language={language} summary={summary} onValidate={validateSelected} onExportSelectedJson={() => exportJson(true)} onExportAllJson={() => exportJson(false)} onExportCsv={exportCsv} />

      <CoverPickerModal
        isOpen={Boolean(activeCoverSongId)}
        song={songs.find((song) => song.id === activeCoverSongId) ?? null}
        language={language}
        loading={Boolean(activeCoverSongId && coverLoadingSongIds.includes(activeCoverSongId))}
        onClose={() => setActiveCoverSongId(null)}
        onRefresh={handleModalRefresh}
        onPick={(url) => {
          if (!activeCoverSongId) return;
          updateSong(activeCoverSongId, { coverUrl: url });
          setActiveCoverSongId(null);
        }}
      />
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
                {job.error ? <p className="text-xs text-red-300">{job.error}</p> : null}
              </div>
              <span className="text-sm text-[var(--muted)]">{job.foundCount}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SongReviewList({ songs, language, coverLoadingSongIds, onChangeSong, onOpenCover, onFindCover }: { songs: BatchSong[]; language: Language; coverLoadingSongIds: string[]; onChangeSong: (songId: string, patch: Partial<BatchSong>) => void; onOpenCover: (songId: string) => void; onFindCover: (songId: string) => void }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("download_review_songs", language)}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {songs.map((song) => (
          <SongReviewCard key={song.id} song={song} language={language} loadingCover={coverLoadingSongIds.includes(song.id)} onChangeSong={onChangeSong} onOpenCover={onOpenCover} onFindCover={onFindCover} />
        ))}
      </div>
    </section>
  );
}

function SongReviewCard({ song, language, loadingCover, onChangeSong, onOpenCover, onFindCover }: { song: BatchSong; language: Language; loadingCover: boolean; onChangeSong: (songId: string, patch: Partial<BatchSong>) => void; onOpenCover: (songId: string) => void; onFindCover: (songId: string) => void }) {
  const badges = getBadges(song, language);
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={song.selected} onChange={(event) => onChangeSong(song.id, { selected: event.target.checked })} />
          {t("download_selected", language)}
        </label>
        <span className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-xs">{Math.round(song.confidence * 100)}%</span>
      </div>
      <div className="mb-3 flex items-center gap-3">
        <button type="button" onClick={() => onOpenCover(song.id)} className="h-16 w-16 overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)]">
          {song.coverUrl ? <img src={song.coverUrl} alt={song.title || "cover"} className="h-full w-full object-cover" /> : <span className="text-xs text-[var(--muted)]">{t("download_no_cover", language)}</span>}
        </button>
        <div className="flex flex-col gap-2">
          <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs" onClick={() => onOpenCover(song.id)}>{t("download_choose_cover", language)}</button>
          <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs" onClick={() => onFindCover(song.id)} disabled={loadingCover}>
            {loadingCover ? t("download_searching", language) : t("download_find_cover", language)}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1" value={song.title} placeholder={t("download_title", language)} onChange={(event) => onChangeSong(song.id, { title: event.target.value, manuallyEdited: true })} />
        <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1" value={song.artist} placeholder={t("download_artist", language)} onChange={(event) => onChangeSong(song.id, { artist: event.target.value, manuallyEdited: true })} />
        <input className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1" value={song.album ?? ""} placeholder={t("download_album", language)} onChange={(event) => onChangeSong(song.id, { album: event.target.value, manuallyEdited: true })} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {badges.map((badge) => <span key={badge} className="rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-300">{badge}</span>)}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs" onClick={() => onChangeSong(song.id, { selected: false })}>{t("download_exclude", language)}</button>
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs" onClick={() => {
          if (song.title.trim() && song.artist.trim() && song.coverUrl) onChangeSong(song.id, { manuallyConfirmed: true, needsReview: false });
        }}>
          {t("download_confirm", language)}
        </button>
      </div>
    </article>
  );
}

function CoverPickerModal({ isOpen, song, language, loading, onClose, onRefresh, onPick }: { isOpen: boolean; song: BatchSong | null; language: Language; loading: boolean; onClose: () => void; onRefresh: () => void; onPick: (url: string) => void }) {
  const [manualUrl, setManualUrl] = useState("");
  const autoRequestedSongIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || !song || loading || song.coverCandidates.length > 0) return;
    if (autoRequestedSongIdRef.current === song.id) return;
    autoRequestedSongIdRef.current = song.id;
    onRefresh();
  }, [isOpen, loading, onRefresh, song]);

  if (!isOpen || !song) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{t("download_cover_modal_title", language)}</h3>
            <p className="text-sm text-[var(--muted)]">{song.title || t("download_unknown_title", language)} - {song.artist || t("download_unknown_artist", language)}</p>
          </div>
          <button type="button" className="text-sm text-[var(--muted)]" onClick={onClose}>{t("modal_close", language)}</button>
        </div>
        {loading ? <p className="mb-3 text-sm text-[var(--muted)]">{t("download_searching", language)}</p> : null}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {song.coverCandidates.map((candidate) => (
            <button type="button" key={candidate.url} className="overflow-hidden rounded border border-[var(--border)]" onClick={() => onPick(candidate.url)}>
              <img src={candidate.url} alt={t("download_cover_candidate", language)} className="h-20 w-full object-cover" />
            </button>
          ))}
        </div>
        {!loading && song.coverCandidates.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">{t("download_empty_covers", language)}</p> : null}
        <div className="mt-3 flex gap-2">
          <input className="flex-1 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1" value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} placeholder="https://..." />
          <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1" onClick={() => manualUrl.trim() && onPick(manualUrl.trim())}>{t("download_use_manual_cover", language)}</button>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1" onClick={onRefresh}>{t("download_find_cover", language)}</button>
          <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1" onClick={onClose}>{t("modal_cancel", language)}</button>
        </div>
      </div>
    </div>
  );
}

function StickyReviewBar({ language, summary, onValidate, onExportSelectedJson, onExportAllJson, onExportCsv }: { language: Language; summary: { totalSongsFound: number; selectedSongs: number; songsNeedingReview: number }; onValidate: () => void; onExportSelectedJson: () => void; onExportAllJson: () => void; onExportCsv: () => void }) {
  return (
    <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-sm text-[var(--muted)]">
        {t("download_footer_counts", language, { total: summary.totalSongsFound, selected: summary.selectedSongs, needsReview: summary.songsNeedingReview, excluded: Math.max(summary.totalSongsFound - summary.selectedSongs, 0) })}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" onClick={onValidate}>{t("download_validate_selected", language)}</button>
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" onClick={onExportSelectedJson}>{t("download_export_json", language)}</button>
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" onClick={onExportAllJson}>{t("download_export_all_json", language)}</button>
        <button type="button" className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" onClick={onExportCsv}>{t("download_export_csv", language)}</button>
      </div>
    </div>
  );
}

async function downloadWithProgress(options: {
  url: string;
  profile: ExportProfile;
  preview: boolean;
  coverArt?: string;
  enhancements: Record<string, boolean>;
  signal: AbortSignal;
  onProgress: (event: SseProgressEvent) => void;
}): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(SPOTIFLAC_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      url: options.url,
      profile: options.profile,
      preview: options.preview,
      coverArt: options.coverArt,
      enhancements: options.enhancements,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    let detail = "";
    let responseBody: unknown;
    try {
      const payload = await response.json() as { error?: unknown; detail?: unknown; message?: unknown };
      responseBody = payload;
      detail = stringifyErrorPayload(payload.detail) || stringifyErrorPayload(payload.error) || stringifyErrorPayload(payload.message) || "";
    } catch {
      detail = await response.text().catch(() => "");
      responseBody = detail;
    }
    throw new SpotiflacClientError((detail || `SpotiFLAC returned ${response.status}.`).slice(0, 1800), responseBody);
  }
  if (!response.body) throw new Error("SpotiFLAC SSE response did not include a stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let token = "";
  let fileUrl = "";

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
      if (event.step === "error") throw new SpotiflacClientError(event.message, event);
      if (event.step === "complete") {
        token = event.token ?? "";
        fileUrl = event.file ?? "";
      }
    }
  }

  const retrieveUrl = fileUrl || `${SPOTIFLAC_ENDPOINT}?action=retrieve&token=${encodeURIComponent(token)}`;
  if (!token && !fileUrl) throw new Error("SpotiFLAC completed without returning a download token.");
  const fileResponse = await fetch(retrieveUrl, { signal: options.signal });
  if (!fileResponse.ok) {
    const detail = await fileResponse.text().catch(() => "");
    throw new SpotiflacClientError(detail || `SpotiFLAC download token returned ${fileResponse.status}.`, { status: fileResponse.status, body: detail });
  }
  const blob = await fileResponse.blob();
  return { blob, fileName: fileNameFromContentDisposition(fileResponse.headers.get("content-disposition")) || "spotiflac-download.zip" };
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
      token: parsed.token,
      file: parsed.file,
    };
  } catch {
    return null;
  }
}

async function firstAudioBlobFromZip(zipBlob: Blob): Promise<Blob> {
  const entries = await readStoredZipEntries(zipBlob);
  const audio = entries.find((entry) => /\.(mp3|m4a|flac)$/i.test(entry.name));
  if (!audio) throw new Error("Preview ZIP did not include an audio file.");
  return audio.blob;
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

function enhancementsPayload(options: PolishOptions): Record<string, boolean> {
  return {
    truePeakLimiter: options.truePeakLimiter,
    stereoEnhance: options.stereoEnhance,
    embedCover: options.embedAudioCover,
    embedMetadata: options.embedMetadata,
  };
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
  if (error instanceof SpotiflacClientError) return { message: error.message || fallback, body: error.body };
  if (error instanceof Error) return { message: error.message || fallback, body: { message: error.message, name: error.name } };
  return { message: fallback, body: error };
}

function contentTypeForExtension(extension: "mp3" | "m4a" | "flac"): "audio/mpeg" | "audio/mp4" | "audio/flac" {
  if (extension === "flac") return "audio/flac";
  return extension === "m4a" ? "audio/mp4" : "audio/mpeg";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read cover image."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function persistSpotiflacState(queue: QueueItem[], profile: ExportProfile, polishOptions: PolishOptions) {
  try {
    const serializableQueue = queue.map(({ previewBlob: _previewBlob, previewUrl: _previewUrl, zipBlob: _zipBlob, ...item }) => ({
      ...item,
      status: item.status === "processing" || item.status === "done" ? "pending" : item.status,
      progress: undefined,
      progressMessage: undefined,
      zipFileName: undefined,
    }));
    window.localStorage.setItem(SPOTIFLAC_STORAGE_KEY, JSON.stringify({ queue: serializableQueue, profile, polishOptions }));
  } catch {
    // Local persistence is a convenience; exports continue if storage is unavailable.
  }
}

function restoreQueueItem(value: unknown): QueueItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<QueueItem>;
  const url = stringFromUnknown(record.url);
  const title = stringFromUnknown(record.title);
  const artist = stringFromUnknown(record.artist);
  if (!url && !title && !artist) return null;
  const status: QueueStatus = record.status === "error" ? "error" : "pending";
  return {
    id: stringFromUnknown(record.id) || makeId(),
    url,
    artist: artist || (url ? "Resolving..." : ""),
    title: title || (url ? titleFromSpotifyUrl(url) : "Unknown Title"),
    status,
    progress: 0,
    errorMsg: status === "error" ? stringFromUnknown(record.errorMsg) : (!url ? "No Spotify URL - will be skipped until you add one." : undefined),
    isPlaylist: Boolean(record.isPlaylist) || (url ? isAlbumOrPlaylist(url) : false),
    source: record.source === "json" || record.source === "ocr" || record.source === "spotify" ? record.source : (url ? "spotify" : "json"),
    addedAtIso: stringFromUnknown(record.addedAtIso) || new Date().toISOString(),
  };
}

function mergeQueueItems(current: QueueItem[], incoming: QueueItem[]): QueueItem[] {
  const queueKey = (item: QueueItem) => item.url ? `url:${item.url.trim().toLowerCase()}` : normalizeTrackKey(item.title ?? "", item.artist ?? "");
  const byKey = new Map(current.map((item) => [queueKey(item), item]));
  for (const item of incoming) {
    const key = queueKey(item);
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return Array.from(byKey.values());
}

function isExportProfile(value: unknown): value is ExportProfile {
  return typeof value === "string" && exportProfiles.some((profile) => profile.id === value);
}

function defaultPolishForProfile(profile: ExportProfile, current: PolishOptions, hasCover: boolean): PolishOptions {
  const capabilities = profileCapabilities[profile];
  return {
    ...current,
    truePeakLimiter: capabilities.truePeakLimiter,
    stereoEnhance: capabilities.stereoEnhance,
    embedAudioCover: hasCover && capabilities.embedCover && current.embedAudioCover,
    embedMetadata: capabilities.embedMetadata,
  };
}

function isSpotifyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split("/").filter(Boolean);
    return (host === "open.spotify.com" || host.endsWith(".spotify.com"))
      && ["track", "album", "playlist"].includes(segments[0] ?? "")
      && Boolean(segments[1]);
  } catch {
    return false;
  }
}

function isAlbumOrPlaylist(value: string): boolean {
  try {
    const kind = new URL(value).pathname.split("/").filter(Boolean)[0];
    return kind === "album" || kind === "playlist";
  } catch {
    return false;
  }
}

function titleFromSpotifyUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const kind = segments[0] || "track";
    const id = segments[1] || "link";
    return `${kind[0]?.toUpperCase() ?? "S"}${kind.slice(1)} ${id.slice(0, 10)}`;
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

function parseImportedSpotiflacSongs(text: string): { songs: SongMatch[]; invalidItems: string[]; skippedCount: number } {
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
  if (songs.length === 0 && invalidItems.length === 0) throw new SongImportError("The JSON file did not contain any selected songs.", "empty-import");
  return { songs, invalidItems, skippedCount };
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

function spotiflacStatus(diagnostics: SpotiflacDiagnostics | null, loading: boolean): { label: string; className: string; description: string } {
  if (loading || !diagnostics) {
    return {
      label: "Checking",
      className: "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)]",
      description: "SpotiFLAC checks run after the page mounts.",
    };
  }
  if (!diagnostics.route.reachable || !diagnostics.spotiflac?.available || !diagnostics.ffmpeg?.available) {
    return {
      label: diagnostics.spotiflac?.available ? "Needs setup" : "Not Installed",
      className: "border-[color:rgba(var(--status-danger-rgb),0.45)] bg-[color:rgba(var(--status-danger-rgb),0.12)] text-[var(--status-danger)]",
      description: "The SpotiFLAC CLI or ffmpeg transcoder is not reachable from this frontend runtime.",
    };
  }
  return {
    label: "Connected",
    className: "border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] text-[var(--status-success)]",
    description: "SpotiFLAC and ffmpeg are ready for local ZIP exports.",
  };
}

function statusBadgeClass(status: QueueStatus): string {
  if (status === "done") return "border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] text-[var(--status-success)]";
  if (status === "error") return "border-[color:rgba(var(--status-danger-rgb),0.45)] bg-[color:rgba(var(--status-danger-rgb),0.12)] text-[var(--status-danger)]";
  if (status === "processing") return "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]";
  return "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)]";
}

function compactVersion(version?: string): string {
  return version?.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function formatQueueItemLine(item: Pick<QueueItem, "artist" | "title" | "url">): string {
  const title = item.title?.trim() || (item.url ? titleFromSpotifyUrl(item.url) : "Unknown Title");
  const artist = item.artist?.trim();
  return artist && artist !== "Resolving..." ? `${artist} - ${title}` : title;
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

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getBadges(song: BatchSong, language: Language): string[] {
  const badges: string[] = [];
  if (!song.title.trim()) badges.push(t("download_badge_missing_title", language));
  if (!song.artist.trim()) badges.push(t("download_badge_missing_artist", language));
  if (!song.coverUrl) badges.push(t("download_badge_missing_cover", language));
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
