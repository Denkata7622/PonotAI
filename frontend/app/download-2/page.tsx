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
type DownloadState = "idle" | "ready" | "exporting" | "done" | "error";
type LucidaPhase = "preparing" | "downloading" | "adding-files" | "finalizing" | "done";

type QueueSong = {
  id: string;
  artist: string;
  title: string;
  url?: string;
  status: QueueStatus;
  errorMsg?: string;
  progress?: number;
  progressMessage?: string;
  progressStep?: string;
  retryCount?: number;
  coverFile?: File | null;
  coverPreview?: string | null;
  coverUrl?: string | null;
  coverCandidates?: string[];
  blob?: Blob;
  contentType?: string;
  fileName?: string;
  extension?: "mp3" | "m4a" | "flac";
  profile?: ExportProfile;
  analysis?: Record<string, unknown> | null;
  source: "single" | "json" | "url";
  addedAtIso: string;
};

type ExportProfile = "audiophile-flac" | "hifi-mp3" | "phone-aac-plus" | "normalized-mp3" | "analysis-only";

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
  found: boolean;
  version?: string;
  errorCode?: string;
  error?: string;
};

type LucidaStatusResponse = {
  online: boolean;
  lucidaUrl: string;
  docsStatus?: number;
  ffmpeg: ToolDiagnostic;
  ffprobe: ToolDiagnostic;
  temp: { dir: string; writable: boolean; error?: string };
  profiles: Array<{ id: ExportProfile; label: string; extension: "mp3" | "m4a" | "flac"; contentType: "audio/mpeg" | "audio/mp4" | "audio/flac"; features?: Record<string, boolean | string> }>;
  audioAnalysisAvailable: boolean;
  checkedAtIso: string;
};

type LucidaDiagnostics = {
  checkedAtIso: string;
  route: {
    url: string;
    reachable: boolean;
    status?: number;
    message?: string;
  };
  lucidaUrl?: string;
  ffmpeg: ToolDiagnostic | null;
  ffprobe: ToolDiagnostic | null;
  temp: { dir: string; writable: boolean; error?: string } | null;
  profiles: LucidaStatusResponse["profiles"];
  audioAnalysisAvailable: boolean;
  warnings: string[];
  fixes: string[];
};

type LucidaProgress = {
  phase: LucidaPhase;
  currentSong?: string;
  completed: number;
  total: number;
  failed: number;
  exported: number;
};

type LucidaResultSummary = {
  total: number;
  exported: number;
  failed: number;
  mp3: number;
  m4a: number;
  flac: number;
  coversIncluded: number;
  manifestIncluded: boolean;
  analysisIncluded: boolean;
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
type LastError = { timestamp: string; song: string; message: string; body?: unknown };

class LucidaClientError extends Error {
  body?: unknown;

  constructor(message: string, body?: unknown) {
    super(message);
    this.name = "LucidaClientError";
    this.body = body;
  }
}

const LOW_CONFIDENCE = 0.75;
const LUCIDA_ENDPOINT = "/api/download/lucida";
const LUCIDA_STORAGE_KEY = "turrex-lucida-queue";
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

export default function Download2Page() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <section className="mx-auto w-full max-w-7xl px-0 py-2 sm:px-2">
        <div className="space-y-5">
          <LucidaDownloadClient />
          <BatchOcrSection />
        </div>
      </section>
    </main>
  );
}

function LucidaDownloadClient() {
  const [mounted, setMounted] = useState(false);
  const [songName, setSongName] = useState("");
  const [singleSongError, setSingleSongError] = useState("");
  const [directUrl, setDirectUrl] = useState("");
  const [directUrlError, setDirectUrlError] = useState("");
  const [songQueue, setSongQueue] = useState<QueueSong[]>([]);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [exportProfile, setExportProfile] = useState<ExportProfile>("hifi-mp3");
  const [polishOptions, setPolishOptions] = useState<PolishOptions>({
    cleanMetadata: true,
    embedCover: true,
    embedAudioCover: false,
    truePeakLimiter: true,
    stereoEnhance: true,
    embedMetadata: true,
    includeAnalysis: true,
  });
  const [estimatedRemaining, setEstimatedRemaining] = useState("");
  const [previewingSongId, setPreviewingSongId] = useState<string | null>(null);
  const [state, setState] = useState<DownloadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [progress, setProgress] = useState<LucidaProgress | null>(null);
  const [resultSummary, setResultSummary] = useState<LucidaResultSummary | null>(null);
  const [diagnostics, setDiagnostics] = useState<LucidaDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [showSkippedImportRows, setShowSkippedImportRows] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [importedSongs, setImportedSongs] = useState<SongMatch[]>([]);
  const [lastZipItems, setLastZipItems] = useState<QueueSong[]>([]);
  const [lastErrors, setLastErrors] = useState<LastError[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const restoredRef = useRef(false);

  const loadLucidaDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    setDiagnosticsError("");
    try {
      const response = await fetch(`${LUCIDA_ENDPOINT}?action=status`, { cache: "no-store" });
      if (response.ok) {
        const status = await response.json() as LucidaStatusResponse;
        setDiagnostics({
          checkedAtIso: status.checkedAtIso,
          route: {
            url: `${LUCIDA_ENDPOINT}?action=status`,
            reachable: status.online,
            status: status.docsStatus,
            message: status.online ? "Online" : "Lucida FastAPI /docs is not reachable.",
          },
          lucidaUrl: status.lucidaUrl,
          ffmpeg: status.ffmpeg,
          ffprobe: status.ffprobe,
          temp: status.temp,
          profiles: status.profiles,
          audioAnalysisAvailable: status.audioAnalysisAvailable,
          warnings: [
            ...(status.online ? [] : ["Lucida Python API is offline or /docs did not respond."]),
            ...(status.ffmpeg.found ? [] : [status.ffmpeg.error || "ffmpeg is unavailable."]),
            ...(status.ffprobe.found ? [] : [status.ffprobe.error || "ffprobe is unavailable."]),
            ...(status.temp.writable ? [] : [status.temp.error || "Temporary directory is not writable."]),
          ],
          fixes: [
            ...(status.online ? [] : ["Start lucida-flow at http://127.0.0.1:8000 and verify /docs opens locally."]),
            ...(status.ffmpeg.found ? [] : ["Install ffmpeg or set FFMPEG_LOCATION to the directory containing ffmpeg and ffprobe."]),
            ...(status.temp.writable ? [] : ["Use a writable OS temporary directory for transcoding files."]),
          ],
        });
      } else {
        const detail = await response.text().catch(() => "");
        setDiagnostics({
          checkedAtIso: new Date().toISOString(),
          route: {
            url: `${LUCIDA_ENDPOINT}?action=status`,
            reachable: false,
            status: response.status,
            message: detail || `Status check returned ${response.status}.`,
          },
          ffmpeg: null,
          ffprobe: null,
          temp: null,
          profiles: exportProfiles.map((profile) => ({
            id: profile.id,
            label: profile.label,
            extension: profile.extension,
            contentType: contentTypeForExtension(profile.extension),
          })),
          audioAnalysisAvailable: false,
          warnings: [detail || `Lucida status route returned ${response.status}.`],
          fixes: ["Verify app/api/download/lucida/route.ts is compiled and the dev server has restarted."],
        });
        setDiagnosticsError(`Lucida status returned ${response.status}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lucida diagnostics are unavailable.";
      setDiagnostics({
        checkedAtIso: new Date().toISOString(),
        route: { url: `${LUCIDA_ENDPOINT}?action=status`, reachable: false, message },
        ffmpeg: null,
        ffprobe: null,
        temp: null,
        profiles: exportProfiles.map((profile) => ({
          id: profile.id,
          label: profile.label,
          extension: profile.extension,
          contentType: contentTypeForExtension(profile.extension),
        })),
        audioAnalysisAvailable: false,
        warnings: [message],
        fixes: ["Restart the Next.js dev server and ensure the Lucida route is available."],
      });
      setDiagnosticsError(message);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    restoreLucidaState();
    void loadLucidaDiagnostics();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadLucidaDiagnostics]);

  useEffect(() => {
    if (!mounted || !restoredRef.current) return;
    persistLucidaState(songQueue, exportProfile, polishOptions);
  }, [exportProfile, mounted, polishOptions, songQueue]);

  const selectedPreview = useMemo(() => songQueue, [songQueue]);
  const queueStats = useMemo(() => ({
    total: songQueue.length,
    pending: songQueue.filter((song) => song.status === "pending").length,
    processing: songQueue.filter((song) => song.status === "processing").length,
    done: songQueue.filter((song) => song.status === "done").length,
    error: songQueue.filter((song) => song.status === "error").length,
  }), [songQueue]);
  const progressPct = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  const heroStatus = lucidaStatus(mounted ? diagnostics : null, diagnosticsLoading);
  const environmentLabel = "Local";
  const activeProfile = exportProfiles.find((profile) => profile.id === exportProfile) ?? exportProfiles[0];

  function updateQueueSong(id: string, patch: Partial<QueueSong>) {
    setSongQueue((current) => current.map((song) => (song.id === id ? { ...song, ...patch } : song)));
  }

  function recordLastError(song: Pick<QueueSong, "artist" | "title">, message: string, body?: unknown) {
    setLastErrors((current) => [
      {
        timestamp: new Date().toISOString(),
        song: formatSongLine(song),
        message,
        body,
      },
      ...current,
    ].slice(0, 3));
  }

  function restoreLucidaState() {
    if (restoredRef.current || typeof window === "undefined") return;
    restoredRef.current = true;
    try {
      const stored = window.localStorage.getItem(LUCIDA_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        queue?: unknown;
        profile?: unknown;
        polishOptions?: unknown;
      };
      if (isExportProfile(parsed.profile)) setExportProfile(parsed.profile);
      if (Array.isArray(parsed.queue)) {
        const restored = parsed.queue.map(restoreQueueSong).filter((song): song is QueueSong => Boolean(song));
        setSongQueue(restored);
        if (restored.length > 0) setState("ready");
      }
      if (parsed.polishOptions && typeof parsed.polishOptions === "object") {
        setPolishOptions((current) => ({ ...current, ...(parsed.polishOptions as Partial<PolishOptions>) }));
      }
    } catch {
      window.localStorage.removeItem(LUCIDA_STORAGE_KEY);
    }
  }

  async function handleJsonImport(file: File | null) {
    if (!file || state === "exporting") return;
    setErrorMessage("");
    setResultSummary(null);
    setLastZipItems([]);
    try {
      const detailed = parseImportedLucidaSongs(await file.text());
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

  function addSingleSongToExport() {
    if (state === "exporting") return;
    const parsed = parseStrictSongQuery(songName);
    if (!parsed) {
      setState("error");
      setSingleSongError("Please use \"Artist - Title\" format.");
      setErrorMessage("Please use \"Artist - Title\" format.");
      return;
    }

    const song: QueueSong = {
      id: makeId(),
      artist: parsed.artist,
      title: parsed.title,
      status: "pending",
      source: "single",
      addedAtIso: new Date().toISOString(),
    };
    setSongQueue((current) => mergeQueueSongs(current, [song]));
    setSongName("");
    setSingleSongError("");
    setState("ready");
    setProgress(null);
    setErrorMessage("");
    setResultSummary(null);
    setLastZipItems([]);
  }

  function addDirectUrlToExport() {
    if (state === "exporting") return;
    const url = directUrl.trim();
    if (!isHttpUrl(url)) {
      setState("error");
      setDirectUrlError("Enter a valid http or https URL.");
      setErrorMessage("Enter a valid http or https URL.");
      return;
    }

    const song: QueueSong = {
      id: makeId(),
      artist: "",
      title: titleFromDirectUrl(url),
      url,
      status: "pending",
      source: "url",
      addedAtIso: new Date().toISOString(),
    };
    setSongQueue((current) => mergeQueueSongs(current, [song]));
    setDirectUrl("");
    setDirectUrlError("");
    setState("ready");
    setProgress(null);
    setErrorMessage("");
    setResultSummary(null);
    setLastZipItems([]);
  }

  function handleCancelImportedSongs() {
    setShowReviewModal(false);
    setImportedSongs([]);
  }

  function handleConfirmImportedSongs(selectedSongs: SongMatch[]) {
    const now = new Date().toISOString();
    const importedQueueItems: QueueSong[] = selectedSongs.map((song) => ({
      id: makeId(),
      artist: song.artist.trim(),
      title: song.songName.trim(),
      status: "pending" as const,
      coverPreview: getSongMatchCover(song) ?? null,
      coverUrl: getSongMatchCover(song) ?? null,
      coverCandidates: getSongMatchCoverCandidates(song),
      source: "json" as const,
      addedAtIso: now,
    })).filter((song) => song.title.trim());
    setSongQueue((current) => mergeQueueSongs(current, importedQueueItems));
    setImportReport((current) => current ? { ...current, parsedCount: importedQueueItems.length } : current);
    setState("ready");
    setErrorMessage("");
    setResultSummary(null);
    setLastZipItems([]);
    setShowReviewModal(false);
    setImportedSongs([]);
  }

  async function handleLucidaZipExport() {
    if (songQueue.length === 0 || state === "exporting") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setState("exporting");
    setErrorMessage("");
    setResultSummary(null);
    setLastZipItems([]);
    setEstimatedRemaining("");
    setProgress({ phase: "preparing", completed: 0, total: songQueue.length, failed: 0, exported: 0 });

    const processed: QueueSong[] = [];
    let failed = 0;
    let exported = 0;
    const startedAt = Date.now();

    try {
      const coverArt = polishOptions.embedAudioCover && coverImage ? await fileToDataUrl(coverImage) : undefined;
      for (let index = 0; index < songQueue.length; index += 1) {
        const song = songQueue[index];
        const line = formatSongLine(song);
        setProgress({ phase: "downloading", currentSong: line, completed: index, total: songQueue.length, failed, exported });

        if (controller.signal.aborted) throw new DOMException("Export cancelled.", "AbortError");
        if (song.status === "done" && song.blob) {
          processed.push(song);
          exported += 1;
          updateQueueSong(song.id, { progress: 100, progressMessage: "Already processed" });
          setProgress({ phase: "adding-files", currentSong: line, completed: index + 1, total: songQueue.length, failed, exported });
          continue;
        }

        updateQueueSong(song.id, { status: "processing", errorMsg: undefined, progress: 5, progressMessage: "Starting Lucida pipeline..." });
        let downloaded: Awaited<ReturnType<typeof downloadLucidaSong>> | null = null;
        let clientRetryCount = song.retryCount ?? 0;
        let lastDownloadError = "";
        let lastDownloadBody: unknown;
        while (!downloaded) {
          try {
            downloaded = await downloadLucidaSong(song, exportProfile, polishOptions, coverArt, false, controller.signal, (event) => {
              updateQueueSong(song.id, { progress: event.progress, progressMessage: event.message, progressStep: event.step });
            });
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            const details = errorDetailsFromUnknown(error, "Lucida download failed.");
            lastDownloadError = details.message;
            lastDownloadBody = details.body;
            if (clientRetryCount < 1) {
              clientRetryCount += 1;
              updateQueueSong(song.id, {
                retryCount: clientRetryCount,
                status: "processing",
                progress: 5,
                progressMessage: `Retrying once after error: ${details.message}`,
                errorMsg: undefined,
              });
              continue;
            }
            break;
          }
        }

        if (downloaded) {
          const doneSong = {
            ...song,
            status: "done" as const,
            progress: 100,
            progressMessage: "Download ready",
            retryCount: clientRetryCount,
            blob: downloaded.blob,
            contentType: downloaded.contentType,
            fileName: downloaded.fileName,
            extension: downloaded.extension,
            profile: exportProfile,
            analysis: downloaded.analysis,
            errorMsg: undefined,
          };
          processed.push(doneSong);
          exported += 1;
          updateQueueSong(song.id, doneSong);
        } else {
          const message = lastDownloadError || "Lucida download failed.";
          failed += 1;
          recordLastError(song, message, lastDownloadBody ?? { message });
          const errorSong = { ...song, status: "error" as const, retryCount: clientRetryCount, progress: 100, progressMessage: "Failed", errorMsg: message };
          processed.push(errorSong);
          updateQueueSong(song.id, errorSong);
        }

        const averageMs = (Date.now() - startedAt) / Math.max(index + 1, 1);
        setEstimatedRemaining(formatRemainingTime(averageMs * Math.max(songQueue.length - index - 1, 0)));
        setProgress({ phase: "adding-files", currentSong: line, completed: index + 1, total: songQueue.length, failed, exported });
      }

      const exportedSongs = processed.filter((song) => song.status === "done" && song.blob);
      if (exportedSongs.length === 0) throw new Error("No Lucida downloads completed, so no ZIP was created.");

      setProgress({ phase: "finalizing", completed: songQueue.length, total: songQueue.length, failed, exported });
      const zip = await createLucidaZip(exportedSongs, processed, coverImage, polishOptions, exportProfile, diagnostics);
      const now = new Date();
      const filename = `Turrex Lucida Export ${dateStamp(now)}.zip`;
      saveBlobAsDownload(zip, filename);
      setLastZipItems(processed);
      setResultSummary({
        total: processed.length,
        exported: exportedSongs.length,
        failed,
        mp3: exportedSongs.filter((song) => song.extension === "mp3" || !song.extension).length,
        m4a: exportedSongs.filter((song) => song.extension === "m4a").length,
        flac: exportedSongs.filter((song) => song.extension === "flac").length,
        coversIncluded: polishOptions.embedCover ? (coverImage ? 1 : 0) + exportedSongs.filter((song) => song.coverFile).length : 0,
        manifestIncluded: true,
        analysisIncluded: polishOptions.includeAnalysis || exportProfile === "analysis-only",
      });
      setProgress({ phase: "done", completed: songQueue.length, total: songQueue.length, failed, exported });
      setState("done");
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      setState(cancelled ? "idle" : "error");
      setErrorMessage(cancelled ? "Lucida export cancelled." : error instanceof Error ? error.message : "Lucida ZIP export failed.");
    } finally {
      abortRef.current = null;
      setEstimatedRemaining("");
    }
  }

  function clearExportList() {
    if (state === "exporting") return;
    setSongQueue([]);
    setProgress(null);
    setResultSummary(null);
    setLastZipItems([]);
    setErrorMessage("");
    setImportReport(null);
    setState("idle");
  }

  function cancelActiveJob() {
    abortRef.current?.abort();
  }

  function removeQueueSong(id: string) {
    if (state === "exporting") return;
    setSongQueue((current) => current.filter((song) => song.id !== id));
  }

  function retryFailedSongs() {
    if (state === "exporting") return;
    setSongQueue((current) => current.map((song) => song.status === "error"
      ? {
        ...song,
        status: "pending" as const,
        errorMsg: undefined,
        progress: 0,
        progressMessage: undefined,
        progressStep: undefined,
        retryCount: 0,
      }
      : song));
    setErrorMessage("");
    setResultSummary(null);
    setLastZipItems([]);
    setProgress(null);
    setState("ready");
  }

  function moveQueueSong(index: number, direction: -1 | 1) {
    if (state === "exporting") return;
    setSongQueue((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(target, 0, item);
      return next;
    });
  }

  async function pasteDirectUrlFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setDirectUrl(text.trim());
      setDirectUrlError("");
    } catch {
      setDirectUrlError("Clipboard access was blocked by the browser.");
    }
  }

  async function previewQueueSong(song: QueueSong) {
    if (previewingSongId) return;
    setPreviewingSongId(song.id);
    setErrorMessage("");
    try {
      const coverArt = polishOptions.embedAudioCover && coverImage ? await fileToDataUrl(coverImage) : undefined;
      const preview = await downloadLucidaSong(song, "hifi-mp3", { ...polishOptions, includeAnalysis: false }, coverArt, true, new AbortController().signal, (event) => {
        updateQueueSong(song.id, { progress: event.progress, progressMessage: `Preview: ${event.message}`, progressStep: event.step });
      });
      playPreviewBlob(preview.blob);
      updateQueueSong(song.id, { progress: undefined, progressMessage: undefined, progressStep: undefined });
    } catch (error) {
      const details = errorDetailsFromUnknown(error, "Preview failed.");
      recordLastError(song, details.message, details.body);
      setErrorMessage(details.message);
    } finally {
      setPreviewingSongId(null);
    }
  }

  const debugPayload = useMemo(() => JSON.stringify({
    lucida: {
      route: diagnostics?.route ?? { url: LUCIDA_ENDPOINT, reachable: false },
      baseUrl: diagnostics?.lucidaUrl ?? "http://127.0.0.1:8000",
      selectedProfile: exportProfile,
      selectedProfileLabel: activeProfile.label,
      output: activeProfile.extension === "flac" ? "Lossless FLAC" : activeProfile.extension === "m4a" ? "AAC/M4A 192kbps" : "MP3 320kbps",
      source: "lossless stream via local Lucida flow",
      checkedAtIso: diagnostics?.checkedAtIso ?? null,
    },
    runtime: {
      ffmpeg: diagnostics?.ffmpeg ? { found: diagnostics.ffmpeg.found, version: compactVersion(diagnostics.ffmpeg.version), errorCode: diagnostics.ffmpeg.errorCode } : null,
      ffprobe: diagnostics?.ffprobe ? { found: diagnostics.ffprobe.found, version: compactVersion(diagnostics.ffprobe.version), errorCode: diagnostics.ffprobe.errorCode } : null,
      temp: diagnostics?.temp,
      profiles: diagnostics?.profiles ?? [],
      audioAnalysisAvailable: diagnostics?.audioAnalysisAvailable ?? false,
    },
    queue: {
      total: queueStats.total,
      pending: queueStats.pending,
      processing: queueStats.processing,
      done: queueStats.done,
      error: queueStats.error,
    },
    exportProfile,
    polishOptions,
    lastResult: resultSummary,
    lastErrors,
    warnings: diagnostics?.warnings ?? [],
    fixes: diagnostics?.fixes ?? [],
  }, null, 2), [activeProfile, diagnostics, exportProfile, lastErrors, polishOptions, queueStats, resultSummary]);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Personal export tool</p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--text)]">Local ZIP Export (Lucida)</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Build a private ZIP with high-quality audio tracks, cover art, and analysis using Lucida transcoding pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Environment: {environmentLabel}</span>
          <span className={`rounded-[var(--radius-sm)] border px-3 py-1.5 ${heroStatus.className}`}>Lucida: {heroStatus.label}</span>
          <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Quality: FLAC / 320kbps MP3 / AAC+</span>
          <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Output: Transcoding ready</span>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="space-y-5">
          <Card className="p-4 sm:p-6">
            <div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 text-sm leading-6">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <p className="min-w-0 text-[var(--text)]">
                Lucida downloads are requested through {LUCIDA_ENDPOINT}. The server fetches FLAC from lucida-flow, then transcodes locally to the selected export profile.
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-2">
                <label htmlFor="songName" className="text-sm font-medium text-[var(--text)]">Single song</label>
                <Input
                  id="songName"
                  value={songName}
                  onChange={(event) => {
                    setSongName(event.target.value);
                    if (singleSongError) setSingleSongError("");
                  }}
                  placeholder="Artist - Title"
                  disabled={state === "exporting"}
                />
                {singleSongError ? <p className="text-xs text-[var(--status-danger)]">{singleSongError}</p> : null}
              </div>
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
                  disabled={state === "exporting"}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
              <div className="min-w-0">
                <label htmlFor="directUrl" className="text-sm font-medium text-[var(--text)]">Direct URL</label>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Paste a YouTube, SoundCloud, or supported source link to skip the yt-dlp search step.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-start">
                <div className="min-w-0">
                  <Input
                    id="directUrl"
                    value={directUrl}
                    onChange={(event) => {
                      setDirectUrl(event.target.value);
                      if (directUrlError) setDirectUrlError("");
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={state === "exporting"}
                  />
                  {directUrlError ? <p className="mt-1 text-xs text-[var(--status-danger)]">{directUrlError}</p> : null}
                </div>
                <Button type="button" variant="ghost" onClick={() => void pasteDirectUrlFromClipboard()} disabled={state === "exporting"}>
                  Paste
                </Button>
                <Button type="button" onClick={addDirectUrlToExport} disabled={state === "exporting"} className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add URL to Queue
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
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
                disabled={state === "exporting"}
              />
            </div>

            <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                    <p className="text-sm font-medium text-[var(--text)]">Audio polish</p>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Lucida starts from FLAC, then the API applies metadata, cover art, limiting, stereo widening, or phone AAC processing based on the selected profile.</p>
                </div>
                <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]">
                  Output: {activeProfile.extension.toUpperCase()} via {activeProfile.label}
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
                  <input
                    type="checkbox"
                    checked={polishOptions.cleanMetadata}
                    onChange={(event) => setPolishOptions((current) => ({ ...current, cleanMetadata: event.target.checked }))}
                    disabled={state === "exporting"}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text)]">Clean title/artist metadata</span>
                    <span className="block text-xs leading-5 text-[var(--muted)]">Normalizes file names and manifest rows while preserving the visible song title and artist.</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
                  <input
                    type="checkbox"
                    checked={polishOptions.embedCover}
                    onChange={(event) => setPolishOptions((current) => ({ ...current, embedCover: event.target.checked }))}
                    disabled={state === "exporting"}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text)]">Embed cover art when available</span>
                    <span className="block text-xs leading-5 text-[var(--muted)]">Adds the selected artwork to the ZIP next to the Lucida MP3 files.</span>
                  </span>
                </label>

                <div className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
                  <p className="text-sm font-medium text-[var(--text)]">Export profile</p>
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    Choose the container, metadata, and enhancement chain. Hi-Fi MP3 is tuned as the best default.
                  </p>
                  <div className="grid gap-3">
                    {exportProfiles.map((profile) => (
                      <label
                        key={profile.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border bg-[var(--surface-subtle)] p-3 transition hover:border-[var(--accent-border)] ${exportProfile === profile.id ? "border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]" : profile.best ? "border-amber-400/60" : "border-[var(--border)]"}`}
                      >
                        <input
                          type="radio"
                          name="lucida-export-audio-profile"
                          checked={exportProfile === profile.id}
                          onChange={() => {
                            setExportProfile(profile.id);
                            setPolishOptions((current) => defaultPolishForProfile(profile.id, current, Boolean(coverImage)));
                          }}
                          disabled={state === "exporting"}
                          className="mt-1 h-4 w-4 accent-[var(--accent)]"
                        />
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
                      <input type="checkbox" checked={polishOptions.truePeakLimiter} onChange={(event) => setPolishOptions((current) => ({ ...current, truePeakLimiter: event.target.checked }))} disabled={state === "exporting" || exportProfile === "audiophile-flac"} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                      <span><span className="block text-sm font-medium text-[var(--text)]">True Peak Limiting</span><span className="block text-xs text-[var(--muted)]">Prevents clipping after loudness processing.</span></span>
                    </label>
                    <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                      <input type="checkbox" checked={polishOptions.stereoEnhance} onChange={(event) => setPolishOptions((current) => ({ ...current, stereoEnhance: event.target.checked }))} disabled={state === "exporting" || exportProfile === "audiophile-flac"} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                      <span><span className="block text-sm font-medium text-[var(--text)]">Stereo Enhancement</span><span className="block text-xs text-[var(--muted)]">Adds a subtle wider soundstage for Hi-Fi MP3.</span></span>
                    </label>
                    <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                      <input type="checkbox" checked={polishOptions.embedAudioCover} onChange={(event) => setPolishOptions((current) => ({ ...current, embedAudioCover: event.target.checked }))} disabled={state === "exporting" || !coverImage} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                      <span><span className="block text-sm font-medium text-[var(--text)]">Embed Cover Art</span><span className="block text-xs text-[var(--muted)]">Writes the selected cover into the exported audio file.</span></span>
                    </label>
                    <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                      <input type="checkbox" checked={polishOptions.embedMetadata} onChange={(event) => setPolishOptions((current) => ({ ...current, embedMetadata: event.target.checked }))} disabled={state === "exporting"} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                      <span><span className="block text-sm font-medium text-[var(--text)]">Full ID3 Metadata</span><span className="block text-xs text-[var(--muted)]">Embeds artist, title, album, year, and genre tags.</span></span>
                    </label>
                  </div>
                </div>

                <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
                  <input
                    type="checkbox"
                    checked={polishOptions.includeAnalysis}
                    onChange={(event) => setPolishOptions((current) => ({ ...current, includeAnalysis: event.target.checked }))}
                    disabled={state === "exporting"}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text)]">Include before/after audio analysis</span>
                    <span className="block text-xs leading-5 text-[var(--muted)]">Adds a Lucida processing report to manifest.json and analysis/audio-comparison.json.</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={addSingleSongToExport} disabled={state === "exporting"} className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add single song
              </Button>
              <Button onClick={() => void handleLucidaZipExport()} disabled={songQueue.length === 0 || state === "exporting"} variant="primary" className="inline-flex items-center gap-2">
                <Download className="h-4 w-4" aria-hidden="true" />
                {state === "exporting" ? "Processing" : "Process Queue & Export ZIP"}
              </Button>
              <Button onClick={retryFailedSongs} disabled={queueStats.error === 0 || state === "exporting"} variant="secondary" className="inline-flex items-center gap-2">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retry Failed
              </Button>
              <Button onClick={clearExportList} disabled={songQueue.length === 0 || state === "exporting"} variant="ghost" className="inline-flex items-center gap-2">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear Queue
              </Button>
              {state === "exporting" ? (
                <Button onClick={cancelActiveJob} variant="ghost" className="inline-flex items-center gap-2">
                  Cancel
                </Button>
              ) : null}
            </div>

            <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">Export queue</p>
                  <p className="text-sm text-[var(--muted)]">{songQueue.length === 0 ? "No songs queued yet." : `${songQueue.length} song${songQueue.length === 1 ? "" : "s"} queued for Lucida.`}</p>
                </div>
                {songQueue.length > 0 ? (
                  <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                    <span className="rounded-full border border-[var(--border)] px-2 py-1">Pending {queueStats.pending}</span>
                    <span className="rounded-full border border-[var(--border)] px-2 py-1">Done {queueStats.done}</span>
                    <span className="rounded-full border border-[var(--border)] px-2 py-1">Errors {queueStats.error}</span>
                  </div>
                ) : null}
              </div>

              {importReport ? (
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <Metric label="Imported" value={String(importReport.parsedCount)} />
                  <Metric label="Queued" value={String(songQueue.length)} />
                  <Metric label="Skipped rows" value={String(importReport.invalidCount + importReport.skippedCount)} />
                </div>
              ) : null}
              {importReport?.firstInvalidReason ? (
                <div className="mt-3 rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-warning-rgb),0.45)] bg-[color:rgba(var(--status-warning-rgb),0.12)] p-3 text-sm leading-6 text-[var(--text)]">
                  <p className="break-words">{importReport.firstInvalidReason}</p>
                  {importReport.invalidItems && importReport.invalidItems.length > 1 ? (
                    <button type="button" className="mt-2 text-sm font-medium text-[var(--accent)] hover:underline" onClick={() => setShowSkippedImportRows((value) => !value)}>
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
              {selectedPreview.length > 0 ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {selectedPreview.map((song, index) => (
                    <QueueSongCard
                      key={song.id}
                      song={song}
                      index={index}
                      total={selectedPreview.length}
                      disabled={state === "exporting"}
                      previewing={previewingSongId === song.id}
                      onPreview={() => void previewQueueSong(song)}
                      onRemove={() => removeQueueSong(song.id)}
                      onMove={(direction) => moveQueueSong(index, direction)}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 py-4 text-sm text-[var(--muted)]">
                  Add one song manually or import a JSON list to begin.
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <LucidaProgressCard state={state} progress={progress} progressPct={progressPct} estimatedRemaining={estimatedRemaining} />
          <LucidaResultCard
            state={state}
            errorMessage={errorMessage}
            summary={resultSummary}
            zipItems={lastZipItems}
          />
          <DebugDetailsCard payload={debugPayload} />
        </div>

        <LucidaDiagnosticsCard
          mounted={mounted}
          diagnostics={diagnostics}
          diagnosticsError={diagnosticsError}
          diagnosticsLoading={diagnosticsLoading}
          onRecheck={() => void loadLucidaDiagnostics()}
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

function QueueSongCard({ song, index, total, disabled, previewing, onPreview, onRemove, onMove }: {
  song: QueueSong;
  index: number;
  total: number;
  disabled: boolean;
  previewing: boolean;
  onPreview: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const statusClass = statusBadgeClass(song.status);
  return (
    <div className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 gap-3">
          {song.coverPreview ? (
            <img src={song.coverPreview} alt={`${formatSongLine(song)} cover`} className="h-12 w-12 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="break-words text-sm font-medium text-[var(--text)]">{song.title}</p>
            <p className="break-words text-xs text-[var(--muted)]">{song.artist || "Unknown artist"}</p>
            {song.url ? <p className="mt-1 break-words text-xs text-[var(--muted)]">{song.url}</p> : null}
            {song.fileName ? <p className="mt-1 break-words text-xs text-[var(--muted)]">{song.fileName}</p> : null}
            {song.coverFile ? <p className="mt-1 break-words text-xs text-[var(--muted)]">Cover: {song.coverFile.name}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass}`}>{song.status}</span>
          <div className="flex flex-wrap justify-end gap-1">
            <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={() => onMove(-1)} disabled={disabled || index === 0} aria-label="Move up">↑</button>
            <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={() => onMove(1)} disabled={disabled || index === total - 1} aria-label="Move down">↓</button>
            <button type="button" className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={onPreview} disabled={disabled || previewing || song.status === "processing"}>
              <Play className="h-3 w-3" aria-hidden="true" />
              {previewing ? "Previewing" : "Preview"}
            </button>
            {song.status === "error" ? (
              <button type="button" className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-danger-rgb),0.45)] px-2 py-1 text-xs text-[var(--status-danger)] hover:bg-[color:rgba(var(--status-danger-rgb),0.12)] disabled:opacity-40" onClick={onRemove} disabled={disabled} aria-label="Dismiss failed song">
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Dismiss
              </button>
            ) : null}
            {song.status !== "error" ? (
              <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-40" onClick={onRemove} disabled={disabled} aria-label="Remove song">Remove</button>
            ) : null}
          </div>
        </div>
      </div>
      {typeof song.progress === "number" && song.progress > 0 ? (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--accent-soft)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.max(0, Math.min(100, song.progress))}%` }} />
          </div>
          {song.progressMessage ? <p className="mt-1 text-xs text-[var(--muted)]">{song.progressMessage}</p> : null}
        </div>
      ) : null}
      {song.errorMsg ? <p className="mt-2 break-words text-xs leading-5 text-[var(--status-danger)]">{song.errorMsg}</p> : null}
    </div>
  );
}

function LucidaProgressCard({ state, progress, progressPct, estimatedRemaining }: { state: DownloadState; progress: LucidaProgress | null; progressPct: number; estimatedRemaining: string }) {
  if (state !== "exporting" || !progress) return null;
  return (
    <Card className="p-4 sm:p-6" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">{lucidaPhaseLabel(progress.phase)}</h2>
          <p className="mt-1 break-words text-sm text-[var(--muted)]">{progress.currentSong || "Preparing next item"}</p>
          {estimatedRemaining ? <p className="mt-1 text-xs text-[var(--muted)]">~{estimatedRemaining} remaining</p> : null}
        </div>
        <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-sm font-medium text-[var(--text)]">{progress.completed}/{progress.total}</span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--surface-subtle)]" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
        <Metric label="Exported" value={String(progress.exported)} />
        <Metric label="Failed" value={String(progress.failed)} />
        <Metric label="Queue" value={String(progress.total)} />
        <Metric label="Progress" value={`${progressPct}%`} />
      </div>
    </Card>
  );
}

function LucidaResultCard({ state, errorMessage, summary, zipItems }: {
  state: DownloadState;
  errorMessage: string;
  summary: LucidaResultSummary | null;
  zipItems: QueueSong[];
}) {
  if (state === "error") {
    return (
      <Card className="border-[color:rgba(var(--status-danger-rgb),0.5)] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-[var(--status-danger)]">Export failed</h2>
      <p className="mt-2 break-words text-sm leading-6 text-[var(--text)]">{errorMessage}</p>
      </Card>
    );
  }

  if (state !== "done" || !summary) return null;
  const failures = zipItems.filter((item) => item.status === "error");

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">{summary.manifestIncluded ? "ZIP downloaded" : "MP3 downloaded"}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Lucida returned the selected transcoded output for completed songs.</p>
        </div>
        <span className="rounded-full border border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] px-3 py-1 text-sm font-medium text-[var(--status-success)]">
          Exported {summary.exported} of {summary.total}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Metric label="Exported" value={String(summary.exported)} />
        <Metric label="Failed" value={String(summary.failed)} />
        <Metric label="MP3" value={String(summary.mp3)} />
        <Metric label="M4A" value={String(summary.m4a)} />
        <Metric label="FLAC" value={String(summary.flac)} />
        <Metric label="Covers" value={String(summary.coversIncluded)} />
        <Metric label="Manifest" value={summary.manifestIncluded ? "Yes" : "No"} />
        <Metric label="Analysis" value={summary.analysisIncluded ? "Yes" : "No"} />
      </div>

      {failures.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-[var(--text)]">Unresolved items</h3>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {failures.map((item) => (
              <div key={item.id} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                <p className="break-words text-sm font-medium text-[var(--text)]">{formatSongLine(item)}</p>
                <p className="mt-1 break-words text-xs leading-5 text-[var(--muted)]">{item.errorMsg || "Lucida did not return a file."}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function DebugDetailsCard({ payload }: { payload: string }) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">Debug details</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Lucida route, ffmpeg runtime, temp access, queue state, and ZIP options.</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.clipboard) void navigator.clipboard.writeText(payload);
          }}
        >
          Copy diagnostics
        </Button>
      </div>
      <textarea
        className="mt-4 h-48 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 font-mono text-xs leading-5 text-[var(--muted)]"
        readOnly
        value={payload}
      />
    </Card>
  );
}

function LucidaDiagnosticsCard({ mounted, diagnostics, diagnosticsError, diagnosticsLoading, onRecheck }: {
  mounted: boolean;
  diagnostics: LucidaDiagnostics | null;
  diagnosticsError: string;
  diagnosticsLoading: boolean;
  onRecheck: () => void;
}) {
  const status = lucidaStatus(mounted ? diagnostics : null, diagnosticsLoading);
  const primaryFix = diagnostics?.fixes[0];

  return (
    <Card className="h-fit p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">Lucida Diagnostics</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Checks the route and transcoder pieces used by /api/download/lucida.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
      </div>

      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{status.description}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        Lucida requests use only the local Lucida flow and the server MP3 transcoder.
      </p>

      <div className="mt-4 grid gap-2">
        <ToolRow label="Lucida API" ok={Boolean(diagnostics?.route.reachable)} detail={diagnostics ? `${diagnostics.route.reachable ? "Reachable" : "Unreachable"}${diagnostics.route.status ? ` (${diagnostics.route.status})` : ""}` : "Waiting"} />
        <ToolRow label="ffmpeg" ok={Boolean(diagnostics?.ffmpeg?.found)} detail={compactVersion(diagnostics?.ffmpeg?.version) || (diagnostics?.ffmpeg?.errorCode ? `Error ${diagnostics.ffmpeg.errorCode}` : "Waiting")} />
        <ToolRow label="ffprobe" ok={Boolean(diagnostics?.ffprobe?.found)} detail={compactVersion(diagnostics?.ffprobe?.version) || (diagnostics?.ffprobe?.errorCode ? `Error ${diagnostics.ffprobe.errorCode}` : "Waiting")} />
        <ToolRow label="Profiles" ok={Boolean(diagnostics?.profiles.length)} detail={diagnostics?.profiles.length ? diagnostics.profiles.map((profile) => profile.id).join(", ") : "Waiting"} />
        <ToolRow label="Transcode" ok={Boolean(diagnostics?.ffmpeg?.found)} detail={diagnostics?.ffmpeg?.found ? "FLAC copy, MP3 320k, AAC/M4A 192k, loudnorm, limiter" : "Needs ffmpeg"} />
        <ToolRow label="Analysis" ok={Boolean(diagnostics?.audioAnalysisAvailable)} detail={diagnostics ? (diagnostics.audioAnalysisAvailable ? "Available" : "Needs ffmpeg and ffprobe") : "Waiting"} />
        <ToolRow label="temp" ok={Boolean(diagnostics?.temp?.writable)} detail={diagnostics?.temp ? `${diagnostics.temp.writable ? "Writable" : diagnostics.temp.error || "Not writable"} (${diagnostics.temp.dir})` : "Waiting"} />
        <ToolRow label="Output" ok detail="FLAC, MP3, or M4A/AAC from Lucida FLAC source" />
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
          {diagnostics.warnings.map((warning) => (
            <p key={warning} className="break-words text-sm leading-6 text-[var(--muted)]">{warning}</p>
          ))}
        </div>
      ) : null}

      <Button onClick={onRecheck} disabled={!mounted || diagnosticsLoading} className="mt-5 inline-flex w-full items-center justify-center gap-2">
        <RotateCcw className={`h-4 w-4 ${diagnosticsLoading ? "animate-spin" : ""}`} aria-hidden="true" />
        {diagnosticsLoading ? "Checking Lucida" : "Recheck Lucida"}
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
      setNotice({ type: "error", message: `${status.message} Image recognition and automatic cover lookup need the backend API, but Lucida ZIP Export remains available through the frontend service.` });
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
    return !song.title.trim()
      || !song.artist.trim()
      || !song.coverUrl
      || (song.confidence < LOW_CONFIDENCE && !song.manuallyConfirmed);
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

    const queue = [...nextJobs];
    const worker = async () => {
      while (queue.length > 0) {
        const job = queue.shift();
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
    const invalid = selected.find((song) => !song.title.trim()
      || !song.artist.trim()
      || !song.coverUrl
      || (song.confidence < LOW_CONFIDENCE && !song.manuallyConfirmed));

    if (invalid) {
      setNotice({ type: "error", message: t("download_validation_error", language) });
      return;
    }
    setNotice({ type: "success", message: t("download_ready_process", language, { count: selected.length }) });
  }

  function exportJson(selectedOnly: boolean) {
    const payload = selectedOnly ? songs.filter((song) => song.selected) : songs;
    const filename = selectedOnly ? "batch-ocr-selected.json" : "batch-ocr-all.json";
    downloadTextBlob(JSON.stringify(payload, null, 2), filename, "application/json");
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

        <SongReviewList
          songs={songs}
          language={language}
          coverLoadingSongIds={coverLoadingSongIds}
          onChangeSong={updateSong}
          onOpenCover={(songId) => setActiveCoverSongId(songId)}
          onFindCover={(songId) => void findCoversForSong(songId)}
        />
        {jobs.length > 0 && songs.length === 0 && jobsCanCollapse ? <p className="text-sm text-[var(--muted)]">{t("download_empty_songs", language)}</p> : null}
      </div>

      <StickyReviewBar
        language={language}
        summary={summary}
        onValidate={validateSelected}
        onExportSelectedJson={() => exportJson(true)}
        onExportAllJson={() => exportJson(false)}
        onExportCsv={exportCsv}
      />

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
          <SongReviewCard
            key={song.id}
            song={song}
            language={language}
            loadingCover={coverLoadingSongIds.includes(song.id)}
            onChangeSong={onChangeSong}
            onOpenCover={onOpenCover}
            onFindCover={onFindCover}
          />
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
        <button
          type="button"
          className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs"
          onClick={() => {
            if (song.title.trim() && song.artist.trim() && song.coverUrl) {
              onChangeSong(song.id, { manuallyConfirmed: true, needsReview: false });
            }
          }}
        >
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

async function downloadLucidaSong(
  song: Pick<QueueSong, "artist" | "title" | "url">,
  profile: ExportProfile,
  polishOptions: PolishOptions,
  coverArt: string | undefined,
  preview: boolean,
  signal: AbortSignal,
  onProgress: (event: LucidaSseEvent) => void,
): Promise<{ blob: Blob; fileName: string; contentType: string; extension: "mp3" | "m4a" | "flac"; analysis: Record<string, unknown> | null }> {
  const commonBody = { profile, preview, coverArt, metadata: { artist: song.artist, title: song.title }, enhancements: enhancementsPayload(polishOptions), analyze: polishOptions.includeAnalysis || profile === "analysis-only", retryCount: 2 };
  const requestBody = song.url
    ? { url: song.url, ...commonBody }
    : { artist: song.artist, title: song.title, ...commonBody };
  return fetchWithProgress(requestBody, signal, onProgress);
}

type LucidaSseEvent = {
  step: string;
  progress: number;
  message: string;
  file?: string;
  token?: string;
};

async function fetchWithProgress(
  body: Record<string, unknown>,
  signal: AbortSignal,
  onProgress: (event: LucidaSseEvent) => void,
): Promise<{ blob: Blob; fileName: string; contentType: string; extension: "mp3" | "m4a" | "flac"; analysis: Record<string, unknown> | null }> {
  const response = await fetch(LUCIDA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
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
    throw new LucidaClientError((detail || `Lucida returned ${response.status}.`).slice(0, 1800), responseBody);
  }

  if (!response.body) throw new Error("Lucida SSE response did not include a stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
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
      onProgress(event);
      if (event.step === "error") throw new LucidaClientError(event.message, event);
      if (event.step === "complete" && event.file) fileUrl = event.file;
    }
  }

  if (!fileUrl) throw new Error("Lucida completed without returning a download token.");
  const fileResponse = await fetch(fileUrl, { signal });
  if (!fileResponse.ok) {
    const detail = await fileResponse.text().catch(() => "");
    throw new LucidaClientError(detail || `Lucida download token returned ${fileResponse.status}.`, { status: fileResponse.status, body: detail });
  }
  const blob = await fileResponse.blob();
  const contentType = fileResponse.headers.get("content-type") || "audio/mpeg";
  const extension = extensionFromContentType(contentType);
  const analysis = decodeAnalysisHeader(fileResponse.headers.get("x-audio-analysis"));
  const fileName = fileNameFromContentDisposition(fileResponse.headers.get("content-disposition"))
    || `lucida-export.${extension}`;
  return { blob, contentType, extension, analysis, fileName: ensureExtension(fileName, `.${extension}`) };
}

function parseSseEvent(raw: string): LucidaSseEvent | null {
  const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as Partial<LucidaSseEvent>;
    return {
      step: parsed.step || "transcoding",
      progress: typeof parsed.progress === "number" ? parsed.progress : 0,
      message: parsed.message || "",
      file: parsed.file,
      token: parsed.token,
    };
  } catch {
    return null;
  }
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
  if (error instanceof LucidaClientError) {
    return { message: error.message || fallback, body: error.body };
  }
  if (error instanceof Error) {
    return { message: error.message || fallback, body: { message: error.message, name: error.name } };
  }
  return { message: fallback, body: error };
}

function enhancementsPayload(options: PolishOptions): Record<string, boolean> {
  return {
    truePeakLimiter: options.truePeakLimiter,
    stereoEnhance: options.stereoEnhance,
    embedCover: options.embedAudioCover,
    embedMetadata: options.embedMetadata,
  };
}

function extensionFromContentType(contentType: string): "mp3" | "m4a" | "flac" {
  const lower = contentType.toLowerCase();
  if (lower.includes("flac")) return "flac";
  if (lower.includes("mp4") || lower.includes("aac")) return "m4a";
  return "mp3";
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

function playPreviewBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  audio.onerror = () => URL.revokeObjectURL(url);
  void audio.play().catch(() => {
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
}

async function createLucidaZip(exportedSongs: QueueSong[], allSongs: QueueSong[], coverImage: File | null, polishOptions: PolishOptions, exportProfile: ExportProfile, diagnostics: LucidaDiagnostics | null): Promise<Blob> {
  const files: Array<{ path: string; blob: Blob }> = [];
  const usedTrackNames = new Set<string>();
  const usedCoverNames = new Set<string>();
  const playlistLines = ["#EXTM3U"];
  const manifestItems = allSongs.map((song) => ({
    id: song.id,
    title: polishOptions.cleanMetadata ? cleanMetadataText(song.title) : song.title,
    artist: polishOptions.cleanMetadata ? cleanMetadataText(song.artist) : song.artist,
    status: song.status,
    error: song.errorMsg,
    fileName: song.fileName,
    sourceUrl: song.url ?? null,
    coverFileName: song.coverFile?.name,
    coverUrl: song.coverUrl ?? null,
    coverCandidates: song.coverCandidates ?? [],
    source: song.source,
  }));

  for (const song of exportedSongs) {
    if (!song.blob) continue;
    const trackName = getUniqueFileName(song.fileName || `${sanitizeFileName(formatSongLine(song))}.mp3`, usedTrackNames);
    files.push({ path: `Turrex Lucida Export/tracks/${trackName}`, blob: song.blob });
    if (song.coverFile && polishOptions.embedCover) {
      const coverExt = guessImageExtension(song.coverFile.type, song.coverFile.name);
      const coverName = getUniqueFileName(`${trackName.replace(/\.[^.]+$/, "")}-cover${coverExt}`, usedCoverNames);
      files.push({ path: `Turrex Lucida Export/artwork/${coverName}`, blob: song.coverFile });
    }
    if ((polishOptions.includeAnalysis || exportProfile === "analysis-only") && song.analysis) {
      const analysisName = `${trackName.replace(/\.[^.]+$/, "")}.analysis.json`;
      files.push({
        path: `Turrex Lucida Export/analysis/${analysisName}`,
        blob: new Blob([JSON.stringify(song.analysis, null, 2)], { type: "application/json" }),
      });
    }
    playlistLines.push(`#EXTINF:-1,${formatSongLine(song)}`);
    playlistLines.push(`tracks/${trackName}`);
  }

  if (coverImage && polishOptions.embedCover) {
    const coverExt = guessImageExtension(coverImage.type, coverImage.name);
    const coverName = getUniqueFileName(`cover${coverExt}`, usedCoverNames);
    files.push({ path: `Turrex Lucida Export/artwork/${coverName}`, blob: coverImage });
  }

  const manifest = {
    app: "Turrex",
    exporter: "download-2 Lucida",
    endpoint: LUCIDA_ENDPOINT,
    exportDateIso: new Date().toISOString(),
    output: {
      profile: exportProfile,
      codec: exportProfile === "audiophile-flac" ? "flac" : exportProfile === "phone-aac-plus" ? "aac" : "mp3",
      bitrate: exportProfile === "audiophile-flac" ? "lossless" : exportProfile === "phone-aac-plus" ? "192kbps" : "320kbps",
      source: "Lucida FLAC stream",
    },
    polishOptions,
    diagnostics: diagnostics ? {
      route: diagnostics.route,
      ffmpeg: diagnostics.ffmpeg ? { found: diagnostics.ffmpeg.found, version: compactVersion(diagnostics.ffmpeg.version), errorCode: diagnostics.ffmpeg.errorCode } : null,
      ffprobe: diagnostics.ffprobe ? { found: diagnostics.ffprobe.found, version: compactVersion(diagnostics.ffprobe.version), errorCode: diagnostics.ffprobe.errorCode } : null,
      temp: diagnostics.temp,
      profiles: diagnostics.profiles,
    } : null,
    totalSelected: allSongs.length,
    exportedCount: exportedSongs.length,
    failedCount: allSongs.filter((song) => song.status === "error").length,
    items: manifestItems,
  };

  files.push({ path: "Turrex Lucida Export/manifest.json", blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) });
  files.push({ path: "Turrex Lucida Export/metadata/manifest.json", blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) });
  files.push({ path: "Turrex Lucida Export/playlist.m3u", blob: new Blob([`${playlistLines.join("\n")}\n`], { type: "audio/x-mpegurl" }) });
  files.push({ path: "Turrex Lucida Export/playlists/export.m3u", blob: new Blob([`${playlistLines.join("\n")}\n`], { type: "audio/x-mpegurl" }) });

  const failures = allSongs.filter((song) => song.status === "error");
  files.push({ path: "Turrex Lucida Export/failed-items.json", blob: new Blob([JSON.stringify(failures, null, 2)], { type: "application/json" }) });
  files.push({ path: "Turrex Lucida Export/search-list.txt", blob: new Blob([failures.map(formatSongLine).join("\n")], { type: "text/plain" }) });

  if (polishOptions.includeAnalysis) {
    const analysis = {
      generatedAtIso: new Date().toISOString(),
      note: "Lucida returns a server-transcoded file. API analysis headers are saved per track when available.",
      counts: {
        exported: exportedSongs.length,
        failed: failures.length,
      },
      items: exportedSongs.map((song) => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        output: song.extension === "flac" ? "Lossless FLAC" : song.extension === "m4a" ? "AAC/M4A 192kbps" : "MP3 320kbps",
        source: "Lucida FLAC stream",
        analysis: song.analysis ?? null,
      })),
    };
    const analysisBlob = new Blob([JSON.stringify(analysis, null, 2)], { type: "application/json" });
    files.push({ path: "Turrex Lucida Export/analysis/audio-comparison.json", blob: analysisBlob });
    files.push({ path: "Turrex Lucida Export/metadata/audio-comparison.json", blob: analysisBlob });
  }

  return makeZip(files);
}

function parseSongQuery(value: string): { artist: string; title: string } {
  const query = value.trim();
  if (!query) return { artist: "", title: "" };
  const [left, ...rest] = query.split(" - ");
  if (rest.length === 0) return { artist: "", title: query };
  return { artist: left.trim(), title: rest.join(" - ").trim() };
}

function parseStrictSongQuery(value: string): { artist: string; title: string } | null {
  const query = value.trim();
  const match = query.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) return null;
  const artist = match[1]?.trim() ?? "";
  const title = match[2]?.trim() ?? "";
  return artist && title ? { artist, title } : null;
}

class SongImportError extends Error {
  code: "invalid-json" | "invalid-schema" | "empty-import";

  constructor(message: string, code: SongImportError["code"]) {
    super(message);
    this.name = "SongImportError";
    this.code = code;
  }
}

function parseImportedLucidaSongs(text: string): { songs: SongMatch[]; invalidItems: string[]; skippedCount: number } {
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
      if (song.title) songs.push(toLucidaSongMatch({ title: song.title, artist: song.artist }));
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

    const titleCandidate = firstString(item, ["songName", "title", "name", "track", "query", "rawText"]);
    const artist = normalizeArtists(item.artist) || normalizeArtists(item.artists) || stringFromUnknown(item.channel) || "";
    const parsedQuery = titleCandidate ? parseSongQuery(titleCandidate) : { artist: "", title: "" };
    const title = parsedQuery.title;
    const resolvedArtist = artist || parsedQuery.artist;
    if (!title) {
      invalidItems.push(`Item ${index + 1} is missing a usable title or query.`);
      return;
    }
    songs.push(toLucidaSongMatch({
      title,
      artist: resolvedArtist,
      album: stringFromUnknown(item.album),
      genre: stringFromUnknown(item.genre),
      releaseYear: typeof item.releaseYear === "number" ? item.releaseYear : null,
      platformLinks: typeof item.platformLinks === "object" && item.platformLinks ? item.platformLinks as SongMatch["platformLinks"] : {},
      albumArtUrl: getImportedCoverUrl(item),
      confidence: typeof item.confidence === "number" ? item.confidence : 1,
      durationSec: typeof item.durationSec === "number" ? item.durationSec : 0,
      coverUrl: stringFromUnknown(item.coverUrl),
      selectedCoverUrl: stringFromUnknown(item.selectedCoverUrl),
      coverCandidates: Array.isArray(item.coverCandidates) ? item.coverCandidates : undefined,
      rawText: stringFromUnknown(item.rawText),
      source: stringFromUnknown(item.source),
      sourceImageIds: Array.isArray(item.sourceImageIds) ? item.sourceImageIds : undefined,
      originalImport: item,
    }));
  });

  if (songs.length === 0) {
    throw new SongImportError(
      invalidItems.length > 0
        ? `No valid songs were found. ${invalidItems.slice(0, 3).join(" ")}`
        : "No valid songs were found in this JSON file.",
      "empty-import",
    );
  }

  return { songs, invalidItems, skippedCount };
}

type LucidaReviewSongInput = {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  releaseYear?: number | null;
  platformLinks?: SongMatch["platformLinks"];
  albumArtUrl?: string;
  confidence?: number;
  durationSec?: number;
  coverUrl?: string;
  selectedCoverUrl?: string;
  coverCandidates?: unknown;
  rawText?: string;
  source?: string;
  sourceImageIds?: unknown[];
  originalImport?: Record<string, unknown>;
};

function toLucidaSongMatch(input: LucidaReviewSongInput): SongMatch {
  const albumArtUrl = normalizeCoverUrl(input.selectedCoverUrl)
    ?? normalizeCoverUrl(input.coverUrl)
    ?? normalizeCoverUrl(input.albumArtUrl)
    ?? "/album-placeholder.svg";
  const base: SongMatch = {
    songName: input.title.trim(),
    artist: input.artist.trim(),
    album: input.album?.trim() || "Unknown Album",
    genre: input.genre ?? "",
    releaseYear: input.releaseYear ?? null,
    platformLinks: input.platformLinks ?? {},
    albumArtUrl,
    confidence: input.confidence ?? 1,
    durationSec: input.durationSec ?? 0,
  };
  return Object.assign(base, {
    ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
    ...(input.selectedCoverUrl ? { selectedCoverUrl: input.selectedCoverUrl } : {}),
    ...(input.coverCandidates ? { coverCandidates: input.coverCandidates } : {}),
    ...(input.rawText ? { rawText: input.rawText } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.sourceImageIds ? { sourceImageIds: input.sourceImageIds } : {}),
    ...(input.originalImport ? { metadata: { originalImport: input.originalImport } } : {}),
  }) as SongMatch;
}

function getImportedCoverUrl(item: Record<string, unknown>): string | undefined {
  const direct = normalizeCoverUrl(item.selectedCoverUrl)
    ?? normalizeCoverUrl(item.coverUrl)
    ?? normalizeCoverUrl(item.albumArtUrl);
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

function getSongMatchCover(song: SongMatch): string | undefined {
  const record = song as SongMatch & { coverUrl?: unknown; selectedCoverUrl?: unknown };
  return normalizeCoverUrl(record.selectedCoverUrl)
    ?? normalizeCoverUrl(record.coverUrl)
    ?? normalizeCoverUrl(song.albumArtUrl);
}

function getSongMatchCoverCandidates(song: SongMatch): string[] {
  const record = song as SongMatch & { coverCandidates?: unknown };
  const candidates = Array.isArray(record.coverCandidates)
    ? record.coverCandidates.map(getCoverCandidateUrl).filter((url): url is string => Boolean(url))
    : [];
  const cover = getSongMatchCover(song);
  return Array.from(new Set(cover ? [cover, ...candidates] : candidates));
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

function mergeQueueSongs(current: QueueSong[], incoming: QueueSong[]): QueueSong[] {
  const queueKey = (song: QueueSong) => song.url ? `url:${song.url.trim().toLowerCase()}` : normalizeTrackKey(song.title, song.artist);
  const byKey = new Map(current.map((song) => [queueKey(song), song]));
  for (const song of incoming) {
    const key = queueKey(song);
    if (!byKey.has(key)) byKey.set(key, song);
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

function persistLucidaState(queue: QueueSong[], profile: ExportProfile, polishOptions: PolishOptions) {
  try {
    const serializableQueue = queue.map(({ blob: _blob, coverFile: _coverFile, ...song }) => ({
      ...song,
      status: song.status === "processing" ? "pending" : song.status,
      progress: undefined,
      progressMessage: undefined,
      progressStep: undefined,
    }));
    window.localStorage.setItem(LUCIDA_STORAGE_KEY, JSON.stringify({ queue: serializableQueue, profile, polishOptions }));
  } catch {
    // Local persistence is a convenience; export should keep working if storage is unavailable.
  }
}

function restoreQueueSong(value: unknown): QueueSong | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<QueueSong>;
  const title = stringFromUnknown(record.title);
  const url = stringFromUnknown(record.url);
  if (!title && !url) return null;
  const status: QueueStatus = record.status === "done" || record.status === "error" ? record.status : "pending";
  return {
    id: stringFromUnknown(record.id) || makeId(),
    artist: stringFromUnknown(record.artist) || "",
    title: title || (url ? titleFromDirectUrl(url) : "Unknown Title"),
    url,
    status,
    errorMsg: status === "error" ? stringFromUnknown(record.errorMsg) : undefined,
    retryCount: typeof record.retryCount === "number" && Number.isFinite(record.retryCount) ? Math.max(0, Math.floor(record.retryCount)) : 0,
    coverPreview: stringFromUnknown(record.coverPreview) || null,
    coverUrl: stringFromUnknown(record.coverUrl) || null,
    coverCandidates: Array.isArray(record.coverCandidates) ? record.coverCandidates.filter((item): item is string => typeof item === "string") : [],
    contentType: stringFromUnknown(record.contentType),
    fileName: stringFromUnknown(record.fileName),
    extension: record.extension === "m4a" || record.extension === "flac" || record.extension === "mp3" ? record.extension : undefined,
    profile: isExportProfile(record.profile) ? record.profile : undefined,
    analysis: null,
    source: record.source === "json" || record.source === "url" || record.source === "single" ? record.source : (url ? "url" : "single"),
    addedAtIso: stringFromUnknown(record.addedAtIso) || new Date().toISOString(),
  };
}

function formatRemainingTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function firstString(item: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringFromUnknown(item[key]);
    if (value) return value;
  }
  return undefined;
}

function normalizeArtists(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (entry && typeof entry === "object") {
          const record = entry as Record<string, unknown>;
          return stringFromUnknown(record.name) || stringFromUnknown(record.artist) || "";
        }
        return "";
      })
      .filter(Boolean)
      .join(", ");
  }
  return stringFromUnknown(value) || "";
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function titleFromDirectUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const videoId = parsed.searchParams.get("v");
    if (videoId) return `YouTube ${videoId}`;
    const lastSegment = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return lastSegment || parsed.hostname || "Direct URL";
  } catch {
    return "Direct URL";
  }
}

function lucidaStatus(diagnostics: LucidaDiagnostics | null, loading: boolean): { label: string; className: string; description: string } {
  if (loading || !diagnostics) {
    return {
      label: "Checking",
      className: "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)]",
      description: "Lucida checks run after the page mounts.",
    };
  }
  if (!diagnostics.route.reachable || !diagnostics.ffmpeg?.found) {
    return {
      label: diagnostics.route.reachable ? "Needs setup" : "Offline",
      className: "border-[color:rgba(var(--status-danger-rgb),0.45)] bg-[color:rgba(var(--status-danger-rgb),0.12)] text-[var(--status-danger)]",
      description: "The Lucida route or ffmpeg transcoder is not reachable from this frontend runtime.",
    };
  }
  return {
    label: "Connected",
    className: "border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] text-[var(--status-success)]",
    description: "Lucida and the MP3 transcoder are ready for local exports.",
  };
}

function lucidaPhaseLabel(phase: LucidaPhase): string {
  switch (phase) {
    case "preparing": return "Preparing export";
    case "downloading": return "Downloading from Lucida";
    case "adding-files": return "Adding files to ZIP";
    case "finalizing": return "Finalizing ZIP";
    case "done": return "Done";
    default: return "Ready";
  }
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

function formatSongLine(song: Pick<QueueSong, "artist" | "title">): string {
  const title = song.title.trim() || "Unknown Title";
  const artist = song.artist.trim();
  return artist ? `${artist} - ${title}` : title;
}

function cleanMetadataText(value: string): string {
  return value
    .replace(/\s*\[(official|lyrics?|audio|video|visualizer|hd|hq)\]\s*/gi, " ")
    .replace(/\s*\((official|lyrics?|audio|video|visualizer|hd|hq)\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeFileName(input: string): string {
  const cleaned = input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "track";
}

function ensureExtension(fileName: string, extension: string): string {
  return fileName.toLowerCase().endsWith(extension) ? fileName : `${fileName}${extension}`;
}

function getUniqueFileName(fileName: string, used: Set<string>): string {
  const sanitized = sanitizeFileName(fileName.replace(/\.[^.]+$/, ""));
  const extMatch = fileName.match(/\.[^.]+$/);
  const ext = extMatch?.[0] || "";
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

function decodeAnalysisHeader(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(decoded) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
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
  const blob = new Blob([content], { type });
  saveBlobAsDownload(blob, filename);
}

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let j = 0; j < 8; j += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (~c) >>> 0;
}

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
