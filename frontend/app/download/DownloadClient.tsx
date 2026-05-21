"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Download, Info, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";
import SongReviewModal from "@/components/SongReviewModal";
import type { SongMatch } from "@/features/recognition/api";
import { createLocalExportZip, saveBlobAsDownload, type LocalExportProgress, type LocalExportResultItem, type LocalExportSong } from "@/lib/localDownloadExporter";
import { clearStoredClientErrors, getStoredClientErrors } from "@/src/components/ClientErrorReporter";

type DownloadState = "idle" | "ready" | "exporting" | "done" | "error";

type ToolDiagnostic = {
  found: boolean;
  version?: string;
  errorCode?: string;
  error?: string;
  fix?: string;
  looksStale?: boolean;
};

type Diagnostics = {
  ok: boolean;
  mode: "local" | "cloud" | "unknown";
  platform: string;
  nodeVersion: string;
  runningInFrontendService?: boolean;
  serviceRole?: string;
  downloader: ToolDiagnostic & { binary: string };
  ffmpeg: ToolDiagnostic;
  ffprobe: ToolDiagnostic;
  cache: { dir: string; writable: boolean; error?: string };
  temp: { dir: string; writable: boolean; error?: string };
  config: {
    ytdlpPathConfigured: boolean;
    ffmpegLocationConfigured: boolean;
    cookiesConfigured: boolean;
    cacheDirConfigured: boolean;
    cacheDisabled?: boolean;
    timeoutMs: number;
    envFlagsPresent?: Record<string, boolean>;
  };
  frontendVsBackend?: {
    downloaderRouteRunsOn: string;
    backendPythonPackagesMatter: boolean;
    frontendDockerfileMatters: boolean;
  };
  warnings: string[];
  fixes: string[];
};

type RuntimeConfig = {
  ok: boolean;
  environment: { mode: "local" | "railway" | "unknown"; nodeEnv: string; frontendService: boolean };
  expectedBackendUrlShape: string;
  publicBuild: {
    configured: boolean;
    source: string;
    code: string | null;
    hostname: string | null;
    message: string | null;
  };
  serverRuntime: {
    configured: boolean;
    source: string;
    code: string | null;
    hostname: string | null;
    message: string | null;
  };
  downloader: { route: string; service: string; backendRequired: boolean };
  warnings: string[];
  fixes: string[];
};

type ExportSong = SongMatch & {
  coverUrl?: string;
  selected?: boolean;
  selectedCoverUrl?: string;
  source?: string;
  rawText?: string;
  sourceImageIds?: string[];
  title?: string;
  name?: string;
  file?: File;
  blob?: Blob;
  audioUrl?: string;
  sourceUrl?: string;
  youtubeUrl?: string;
  coverCandidates?: unknown;
};

type ImportReport = {
  parsedCount: number;
  invalidCount: number;
  skippedCount: number;
  firstInvalidReason?: string;
  filename?: string;
};

type ResultSummary = {
  total: number;
  exported: number;
  failed: number;
  skipped: number;
};

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export class SongImportError extends Error {
  code: "invalid-json" | "invalid-schema" | "empty-import";

  constructor(message: string, code: SongImportError["code"]) {
    super(message);
    this.name = "SongImportError";
    this.code = code;
  }
}

function normalizeYoutubeVideoId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return YOUTUBE_VIDEO_ID_REGEX.test(trimmed) && !trimmed.startsWith("import-") && !trimmed.startsWith("local-") && trimmed !== "index-only" && !/^\d+$/.test(trimmed)
    ? trimmed
    : undefined;
}

function getPlatformAudioCandidate(platformLinks: unknown): string | undefined {
  if (!platformLinks || typeof platformLinks !== "object") return undefined;
  const record = platformLinks as Record<string, unknown>;
  for (const key of ["audioUrl", "previewUrl", "preview", "downloadUrl"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function getPlatformYoutubeCandidate(platformLinks: unknown): string | undefined {
  if (!platformLinks || typeof platformLinks !== "object") return undefined;
  const record = platformLinks as Record<string, unknown>;
  for (const key of ["youtube", "youtubeMusic"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function getImportedSongArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const record = raw as { songs?: unknown; data?: unknown };
    if (Array.isArray(record.songs)) return record.songs;
    if (record.data && typeof record.data === "object" && Array.isArray((record.data as { songs?: unknown }).songs)) {
      return (record.data as { songs: unknown[] }).songs;
    }
  }
  throw new SongImportError("Unsupported JSON shape. Upload an array of songs or an object with a songs array.", "invalid-schema");
}

export function parseImportedSongsDetailed(raw: unknown): { songs: SongMatch[]; invalidItems: string[]; skippedCount: number } {
  const root = getImportedSongArray(raw);

  const normalizedSongs: SongMatch[] = [];
  const invalidItems: string[] = [];
  let skippedCount = 0;
  for (let index = 0; index < root.length; index += 1) {
    const entry = root[index];
    if (typeof entry === "string") {
      const query = entry.trim();
      if (query) normalizedSongs.push(toSongMatch(query));
      else invalidItems.push(`Item ${index + 1} is an empty string.`);
      continue;
    }
    if (!entry || typeof entry !== "object") {
      invalidItems.push(`Item ${index + 1} is not a song object.`);
      continue;
    }
    const item = entry as Record<string, unknown>;
    if (item.selected === false) {
      skippedCount += 1;
      continue;
    }

    const songName = [item.songName, item.title, item.name, item.rawText].find((v) => typeof v === "string" && v.trim()) as string | undefined;
    if (!songName) {
      invalidItems.push(`Item ${index + 1} is missing songName/title/name.`);
      continue;
    }

    const candidates = Array.isArray(item.coverCandidates) ? item.coverCandidates : [];
    const firstCandidate = candidates.find((candidate) => {
      if (typeof candidate === "string") return candidate.trim().length > 0;
      if (candidate && typeof candidate === "object") {
        const c = candidate as Record<string, unknown>;
        return typeof c.url === "string" || typeof c.coverUrl === "string" || typeof c.imageUrl === "string";
      }
      return false;
    });

    const firstCandidateUrl = typeof firstCandidate === "string"
      ? firstCandidate
      : (firstCandidate && typeof firstCandidate === "object"
        ? (firstCandidate as Record<string, unknown>).url || (firstCandidate as Record<string, unknown>).coverUrl || (firstCandidate as Record<string, unknown>).imageUrl
        : "");

    const albumArtUrl = ((typeof item.selectedCoverUrl === "string" && item.selectedCoverUrl)
      || (typeof item.coverUrl === "string" && item.coverUrl)
      || (typeof item.albumArtUrl === "string" && item.albumArtUrl)
      || (typeof firstCandidateUrl === "string" && firstCandidateUrl)
      || "").trim();

    normalizedSongs.push({
      songName: songName.trim(),
      artist: typeof item.artist === "string" ? item.artist.trim() : "",
      album: typeof item.album === "string" ? item.album.trim() : "Unknown Album",
      genre: typeof item.genre === "string" ? item.genre : "",
      releaseYear: typeof item.releaseYear === "number" ? item.releaseYear : null,
      platformLinks: typeof item.platformLinks === "object" && item.platformLinks ? item.platformLinks as SongMatch["platformLinks"] : {},
      albumArtUrl,
      confidence: typeof item.confidence === "number" ? item.confidence : 1,
      durationSec: typeof item.durationSec === "number" ? item.durationSec : 0,
      ...(normalizeYoutubeVideoId(item.youtubeVideoId) ? { youtubeVideoId: normalizeYoutubeVideoId(item.youtubeVideoId) } : {}),
      ...(typeof item.youtubeUrl === "string" ? { youtubeUrl: item.youtubeUrl.trim() } : {}),
      ...(getPlatformYoutubeCandidate(item.platformLinks) ? { youtubeUrl: getPlatformYoutubeCandidate(item.platformLinks) } : {}),
      ...(typeof item.coverUrl === "string" ? { coverUrl: item.coverUrl } : {}),
      ...(typeof item.selectedCoverUrl === "string" ? { selectedCoverUrl: item.selectedCoverUrl } : {}),
      ...(Array.isArray(item.coverCandidates) ? { coverCandidates: item.coverCandidates } : {}),
      ...(typeof item.rawText === "string" ? { rawText: item.rawText } : {}),
      ...(typeof item.source === "string" ? { source: item.source } : {}),
      ...(Array.isArray(item.sourceImageIds) ? { sourceImageIds: item.sourceImageIds } : {}),
      ...(typeof item.selected === "boolean" ? { selected: item.selected } : {}),
      ...(typeof item.audioUrl === "string" ? { audioUrl: item.audioUrl } : {}),
      ...(typeof item.sourceUrl === "string" ? { sourceUrl: item.sourceUrl } : {}),
    } as SongMatch);
  }
  if (normalizedSongs.length === 0) {
    throw new SongImportError(
      invalidItems.length > 0
        ? `No valid songs were found. ${invalidItems.slice(0, 3).join(" ")}`
        : "No valid songs were found in this JSON file.",
      "empty-import",
    );
  }
  return { songs: normalizedSongs, invalidItems, skippedCount };
}

export function parseImportedSongs(raw: unknown): SongMatch[] {
  return parseImportedSongsDetailed(raw).songs;
}

function toSongMatch(query: string): SongMatch {
  const [left, ...rest] = query.split(" - ");
  const artist = rest.length > 0 ? left.trim() : "";
  const songName = rest.length > 0 ? rest.join(" - ").trim() : query.trim();
  return { songName, artist, album: "Unknown Album", genre: "", releaseYear: null, platformLinks: {}, albumArtUrl: "/album-placeholder.svg", confidence: 1, durationSec: 0 };
}

function toLocalExportSong(song: ExportSong, idx: number): LocalExportSong {
  const title = song.songName?.trim() || song.title?.trim() || song.name?.trim() || "Unknown Title";
  const artist = song.artist?.trim() || "";
  const platformAudio = getPlatformAudioCandidate(song.platformLinks);
  const youtubeVideoId = normalizeYoutubeVideoId(song.youtubeVideoId);

  return {
    id: youtubeVideoId || `${title}-${artist}-${idx}`,
    title,
    artist,
    originalTitle: song.songName,
    originalArtist: song.artist,
    audioUrl: song.audioUrl || platformAudio,
    sourceUrl: song.sourceUrl || song.source,
    source: song.source,
    file: song.file,
    blob: song.blob,
    selectedCoverUrl: song.selectedCoverUrl,
    coverUrl: song.coverUrl,
    albumArtUrl: song.albumArtUrl,
    youtubeVideoId,
    youtubeUrl: song.youtubeUrl || getPlatformYoutubeCandidate(song.platformLinks),
    durationSec: song.durationSec,
  };
}

function phaseLabel(phase?: LocalExportProgress["phase"]): string {
  switch (phase) {
    case "preparing": return "Preparing export";
    case "fetching-audio": return "Fetching direct audio";
    case "downloading-youtube": return "Running YouTube fallback";
    case "fetching-cover": return "Fetching cover art";
    case "adding-files": return "Adding files to ZIP";
    case "finalizing": return "Finalizing ZIP";
    case "done": return "Done";
    default: return "Ready";
  }
}

function diagnosticStatus(diagnostics: Diagnostics | null): { label: string; className: string; description: string } {
  if (!diagnostics) {
    return {
      label: "Checking",
      className: "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)]",
      description: "Downloader checks run after the page mounts.",
    };
  }
  const oldYtdlp = diagnostics.warnings.some((warning) => warning.toLowerCase().includes("appears old"));
  if (!diagnostics.ok) {
    return {
      label: "Needs setup",
      className: "border-[color:rgba(var(--status-danger-rgb),0.45)] bg-[color:rgba(var(--status-danger-rgb),0.12)] text-[var(--status-danger)]",
      description: "One or more required server tools are missing or not writable.",
    };
  }
  if (oldYtdlp) {
    return {
      label: "Old yt-dlp warning",
      className: "border-[color:rgba(var(--status-warning-rgb),0.5)] bg-[color:rgba(var(--status-warning-rgb),0.13)] text-[var(--status-warning)]",
      description: "yt-dlp is installed, but it should be updated for YouTube reliability.",
    };
  }
  if (diagnostics.mode === "cloud") {
    return {
      label: "Cloud warning",
      className: "border-[color:rgba(var(--status-warning-rgb),0.5)] bg-[color:rgba(var(--status-warning-rgb),0.13)] text-[var(--status-warning)]",
      description: "Server tools are present, but YouTube may block cloud/datacenter IPs.",
    };
  }
  return {
    label: "Ready",
    className: "border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] text-[var(--status-success)]",
    description: "Direct audio and YouTube fallback are ready in this server environment.",
  };
}

function compactVersion(version?: string): string {
  return version?.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

export default function DownloadClient() {
  const [mounted, setMounted] = useState(false);
  const [songName, setSongName] = useState("");
  const [state, setState] = useState<DownloadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [importedSongs, setImportedSongs] = useState<SongMatch[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [exportSongs, setExportSongs] = useState<ExportSong[]>([]);
  const [progress, setProgress] = useState<LocalExportProgress | null>(null);
  const [resultSummary, setResultSummary] = useState<ResultSummary | null>(null);
  const [resultItems, setResultItems] = useState<LocalExportResultItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [showAllFailures, setShowAllFailures] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [clientErrors, setClientErrors] = useState<ReturnType<typeof getStoredClientErrors>>([]);

  async function loadDiagnostics() {
    try {
      setDiagnosticsLoading(true);
      setDiagnosticsError("");
      const [diagnosticsRes, runtimeRes] = await Promise.all([
        fetch("/api/download/diagnostics", { cache: "no-store" }),
        fetch("/api/runtime-config", { cache: "no-store" }),
      ]);
      const diagnosticsData = await diagnosticsRes.json() as Diagnostics;
      const runtimeData = await runtimeRes.json() as RuntimeConfig;
      setDiagnostics(diagnosticsData);
      setRuntimeConfig(runtimeData);
      setClientErrors(getStoredClientErrors());
    } catch {
      setDiagnosticsError("Could not load downloader diagnostics.");
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
      const query = new URLSearchParams(window.location.search).get("query")?.trim() ?? "";
    setSongName(query);
    setClientErrors(getStoredClientErrors());
    void loadDiagnostics();
  }, []);

  async function handleJsonImport(file: File | null) {
    if (!file) return;
    setErrorMessage("");
    setResultItems([]);
    setResultSummary(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text()) as unknown;
      } catch {
        throw new SongImportError("Invalid JSON file. Upload a valid songs JSON export.", "invalid-json");
      }
      const detailed = parseImportedSongsDetailed(parsed);
      const songs = detailed.songs;
      setImportedSongs(songs);
      setImportReport({
        parsedCount: songs.length,
        invalidCount: detailed.invalidItems.length,
        skippedCount: detailed.skippedCount,
        firstInvalidReason: detailed.invalidItems[0],
        filename: file.name,
      });
      setShowReviewModal(true);
      setState("idle");
      setExportSongs([]);
    } catch (error) {
      setState("error");
      const message = error instanceof SongImportError ? error.message : "Could not import this JSON file.";
      setImportReport({
        parsedCount: 0,
        invalidCount: 1,
        skippedCount: 0,
        firstInvalidReason: `${message} Expected an array of strings/song objects or { "songs": [...] }.`,
        filename: file.name,
      });
      setErrorMessage(message);
    }
  }

  function addSingleSongToExport() {
    const query = songName.trim();
    if (!query) {
      setState("error");
      setErrorMessage("Enter a song name or artist - title query first.");
      return;
    }
    setExportSongs((prev) => [...prev, toSongMatch(query) as ExportSong]);
    setState("ready");
    setErrorMessage("");
    setResultSummary(null);
    setResultItems([]);
    setImportReport(null);
  }

  function clearExportList() {
    if (state === "exporting") return;
    setExportSongs([]);
    setProgress(null);
    setResultSummary(null);
    setResultItems([]);
    setErrorMessage("");
    setState("idle");
  }

  function handleConfirmSongs(selectedSongs: SongMatch[]) {
    setShowReviewModal(false);
    setExportSongs(selectedSongs as ExportSong[]);
    setState("ready");
    setErrorMessage("");
    setResultSummary(null);
    setResultItems([]);
  }

  async function handleLocalZipExport() {
    const selectedSongs = exportSongs.filter((song) => song.selected !== false);
    if (selectedSongs.length === 0 || state === "exporting") return;

    setState("exporting");
    setProgress({ phase: "preparing", completed: 0, total: selectedSongs.length, failed: 0, exported: 0, skipped: 0 });
    setErrorMessage("");
    setResultItems([]);
    setResultSummary(null);
    setShowAllFailures(false);

    try {
      const result = await createLocalExportZip(selectedSongs.map(toLocalExportSong), setProgress);
      setResultItems(result.items);
      setResultSummary({
        total: selectedSongs.length,
        exported: result.exportedCount,
        failed: result.failedCount,
        skipped: result.skippedCount,
      });
      const now = new Date();
      const filename = `Turrex Export ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}.zip`;
      saveBlobAsDownload(result.zipBlob, filename);
      setState("done");
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Local export failed.");
    }
  }

  const selectedCount = useMemo(() => exportSongs.filter((song) => song.selected !== false).length, [exportSongs]);
  const selectedPreview = useMemo(() => exportSongs.filter((song) => song.selected !== false).slice(0, 12), [exportSongs]);
  const unresolvedItems = useMemo(() => resultItems.filter((item) => item.status !== "exported"), [resultItems]);
  const visibleFailures = showAllFailures ? unresolvedItems : unresolvedItems.slice(0, 8);
  const progressPct = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  const setupIssue = useMemo(() => {
    const global = unresolvedItems.find((item) => item.code === "missing-binary" || item.code === "ffmpeg-missing" || item.code === "binary-permission" || item.code === "youtube-blocked");
    return global ? { code: global.code, message: global.error || global.fix || "YouTube fallback stopped early." } : null;
  }, [unresolvedItems]);
  const heroStatus = diagnosticStatus(mounted ? diagnostics : null);
  const environmentLabel = runtimeConfig?.environment.mode === "railway"
    ? "Cloud"
    : runtimeConfig?.environment.mode === "local" || diagnostics?.mode === "local"
      ? "Local"
      : diagnostics?.mode === "cloud"
        ? "Cloud"
        : "Unknown";

  return (
    <section className="mx-auto w-full max-w-7xl px-0 py-2 sm:px-2">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Personal export tool</p>
            <h1 className="mt-1 text-3xl font-semibold text-[var(--text)]">Local ZIP Export</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Build a private ZIP with audio tracks, cover art, a playlist, and recovery files for anything unresolved.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Environment: {environmentLabel}</span>
            <span className={`rounded-[var(--radius-sm)] border px-3 py-1.5 ${heroStatus.className}`}>Downloader: {heroStatus.label}</span>
            <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Files first</span>
            <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">Direct audio URLs</span>
            <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5">YouTube fallback</span>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_minmax(320px,0.8fr)]">
          <div className="space-y-5">
            <Card className="p-4 sm:p-6">
              <div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 text-sm leading-6">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                <p className="min-w-0 text-[var(--text)]">
                  Files and direct audio links are fastest. YouTube fallback requires yt-dlp and ffmpeg on the server. Cloud hosts may be blocked by YouTube, so blocked batches fail fast and keep unresolved songs in search-list.txt.
                </p>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-2">
                  <label htmlFor="songName" className="text-sm font-medium text-[var(--text)]">Single song</label>
                  <Input
                    id="songName"
                    value={songName}
                    onChange={(event) => setSongName(event.target.value)}
                    placeholder="Artist - Title"
                    disabled={state === "exporting"}
                  />
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
                    onChange={(event) => void handleJsonImport(event.target.files?.[0] ?? null)}
                    className="sr-only"
                    disabled={state === "exporting"}
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button onClick={addSingleSongToExport} disabled={state === "exporting"} className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add single song
                </Button>
                <Button onClick={() => void handleLocalZipExport()} disabled={selectedCount === 0 || state === "exporting"} variant="primary" className="inline-flex items-center gap-2">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {state === "exporting" ? "Exporting" : "Export ZIP"}
                </Button>
                <Button onClick={clearExportList} disabled={selectedCount === 0 || state === "exporting"} variant="ghost" className="inline-flex items-center gap-2">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Clear list
                </Button>
              </div>

              <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Export queue</p>
                    <p className="text-sm text-[var(--muted)]">{selectedCount === 0 ? "No songs queued yet." : `${selectedCount} song${selectedCount === 1 ? "" : "s"} ready for ZIP export.`}</p>
                  </div>
                </div>
                {importReport ? (
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <Metric label="Parsed" value={String(importReport.parsedCount)} />
                    <Metric label="Invalid" value={String(importReport.invalidCount)} />
                    <Metric label="Skipped" value={String(importReport.skippedCount)} />
                  </div>
                ) : null}
                {importReport?.firstInvalidReason ? (
                  <p className="mt-3 break-words rounded-[var(--radius-sm)] border border-[color:rgba(var(--status-warning-rgb),0.45)] bg-[color:rgba(var(--status-warning-rgb),0.12)] p-3 text-sm leading-6 text-[var(--text)]">
                    {importReport.firstInvalidReason}
                  </p>
                ) : null}
                {selectedPreview.length > 0 ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {selectedPreview.map((song, index) => {
                      const title = song.songName || song.title || song.name || "Unknown Title";
                      const artist = song.artist || "Unknown artist";
                      return (
                        <div key={`${title}-${artist}-${index}`} className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                          <p className="break-words text-sm font-medium text-[var(--text)]">{title}</p>
                          <p className="break-words text-xs text-[var(--muted)]">{artist}</p>
                        </div>
                      );
                    })}
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
            <ProgressCard state={state} progress={progress} progressPct={progressPct} />
            <ResultCard
              state={state}
              errorMessage={errorMessage}
              summary={resultSummary}
              unresolvedItems={unresolvedItems}
              visibleFailures={visibleFailures}
              setupIssue={setupIssue}
              showAllFailures={showAllFailures}
              onToggleFailures={() => setShowAllFailures((value) => !value)}
            />
            <DebugDetailsCard
              runtimeConfig={runtimeConfig}
              diagnostics={diagnostics}
              clientErrors={clientErrors}
              onClearClientErrors={() => {
                clearStoredClientErrors();
                setClientErrors([]);
              }}
            />
          </div>

          <DiagnosticsCard
            mounted={mounted}
            diagnostics={diagnostics}
            runtimeConfig={runtimeConfig}
            diagnosticsError={diagnosticsError}
            diagnosticsLoading={diagnosticsLoading}
            onRecheck={() => void loadDiagnostics()}
          />
        </div>
      </div>

      {showReviewModal ? <SongReviewModal songs={importedSongs} onCancel={() => setShowReviewModal(false)} onConfirm={handleConfirmSongs} /> : null}
    </section>
  );
}

function DiagnosticsCard({ mounted, diagnostics, runtimeConfig, diagnosticsError, diagnosticsLoading, onRecheck }: { mounted: boolean; diagnostics: Diagnostics | null; runtimeConfig: RuntimeConfig | null; diagnosticsError: string; diagnosticsLoading: boolean; onRecheck: () => void }) {
  const status = diagnosticStatus(mounted ? diagnostics : null);
  const primaryFix = diagnostics?.fixes[0] || diagnostics?.downloader.fix || diagnostics?.ffmpeg.fix || diagnostics?.ffprobe.fix || runtimeConfig?.fixes[0];

  return (
    <Card className="h-fit p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">Downloader diagnostics</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Checks the frontend service runtime used by /api/download.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
      </div>

      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{status.description}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        Backend service Python packages do not affect this route. The frontend service runtime and Dockerfile control yt-dlp, ffmpeg, ffprobe, cache, and temp access.
      </p>

      <div className="mt-4 grid gap-2">
        <ToolRow label="yt-dlp" ok={Boolean(diagnostics?.downloader.found)} detail={compactVersion(diagnostics?.downloader.version) || (diagnostics?.downloader.errorCode ? `Error ${diagnostics.downloader.errorCode}` : "Waiting")} />
        <ToolRow label="ffmpeg" ok={Boolean(diagnostics?.ffmpeg.found)} detail={compactVersion(diagnostics?.ffmpeg.version) || (diagnostics?.ffmpeg.errorCode ? `Error ${diagnostics.ffmpeg.errorCode}` : "Waiting")} />
        <ToolRow label="ffprobe" ok={Boolean(diagnostics?.ffprobe.found)} detail={compactVersion(diagnostics?.ffprobe.version) || (diagnostics?.ffprobe.errorCode ? `Error ${diagnostics.ffprobe.errorCode}` : "Waiting")} />
        <ToolRow label="cache" ok={Boolean(diagnostics?.cache.writable)} detail={diagnostics ? `${diagnostics.cache.writable ? "Writable" : diagnostics.cache.error || "Not writable"} (${diagnostics.cache.dir})` : "Waiting"} />
        <ToolRow label="temp" ok={Boolean(diagnostics?.temp.writable)} detail={diagnostics ? `${diagnostics.temp.writable ? "Writable" : diagnostics.temp.error || "Not writable"} (${diagnostics.temp.dir})` : "Waiting"} />
      </div>

      <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-sm leading-6 text-[var(--text)]">
        <p className="font-medium">Backend API config</p>
        <p className="mt-1 text-[var(--muted)]">
          Browser build: {runtimeConfig?.publicBuild.configured ? runtimeConfig.publicBuild.hostname : runtimeConfig?.publicBuild.message || "checking"}.
        </p>
        <p className="text-[var(--muted)]">
          Server runtime: {runtimeConfig?.serverRuntime.configured ? runtimeConfig.serverRuntime.hostname : runtimeConfig?.serverRuntime.message || "checking"}.
        </p>
        <p className="mt-1 text-[var(--muted)]">Downloader export does not require the backend API URL.</p>
      </div>

      {diagnostics?.mode === "cloud" ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[color:rgba(var(--status-warning-rgb),0.45)] bg-[color:rgba(var(--status-warning-rgb),0.12)] p-3 text-sm leading-6 text-[var(--text)]">
          Cloud server detected. Keep yt-dlp current, but expect some YouTube requests to fail from datacenter IP controls.
        </div>
      ) : null}

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

      <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs leading-5 text-[var(--muted)]">
        <p className="font-medium text-[var(--text)]">Setup commands</p>
        <p>Windows: winget install yt-dlp.yt-dlp and winget install Gyan.FFmpeg</p>
        <p>macOS: brew install yt-dlp ffmpeg</p>
        <p>Linux: python3 -m pip install -U yt-dlp and sudo apt install ffmpeg</p>
        <p>Railway frontend Dockerfile: YTDLP_PATH=/usr/local/bin/yt-dlp, FFMPEG_LOCATION=/usr/bin</p>
      </div>

      <Button onClick={onRecheck} disabled={!mounted || diagnosticsLoading} className="mt-5 inline-flex w-full items-center justify-center gap-2">
        <RotateCcw className={`h-4 w-4 ${diagnosticsLoading ? "animate-spin" : ""}`} aria-hidden="true" />
        {diagnosticsLoading ? "Checking downloader" : "Recheck downloader"}
      </Button>
    </Card>
  );
}

function DebugDetailsCard({ runtimeConfig, diagnostics, clientErrors, onClearClientErrors }: {
  runtimeConfig: RuntimeConfig | null;
  diagnostics: Diagnostics | null;
  clientErrors: ReturnType<typeof getStoredClientErrors>;
  onClearClientErrors: () => void;
}) {
  const payload = JSON.stringify({
    runtime: runtimeConfig ? {
      environment: runtimeConfig.environment,
      publicBuild: {
        configured: runtimeConfig.publicBuild.configured,
        source: runtimeConfig.publicBuild.source,
        code: runtimeConfig.publicBuild.code,
        hostname: runtimeConfig.publicBuild.hostname,
      },
      serverRuntime: {
        configured: runtimeConfig.serverRuntime.configured,
        source: runtimeConfig.serverRuntime.source,
        code: runtimeConfig.serverRuntime.code,
        hostname: runtimeConfig.serverRuntime.hostname,
      },
    } : null,
    downloader: diagnostics ? {
      ok: diagnostics.ok,
      mode: diagnostics.mode,
      platform: diagnostics.platform,
      nodeVersion: diagnostics.nodeVersion,
      ytdlp: { found: diagnostics.downloader.found, version: compactVersion(diagnostics.downloader.version), stale: diagnostics.downloader.looksStale },
      ffmpeg: { found: diagnostics.ffmpeg.found, version: compactVersion(diagnostics.ffmpeg.version) },
      ffprobe: { found: diagnostics.ffprobe.found, version: compactVersion(diagnostics.ffprobe.version) },
      cache: { writable: diagnostics.cache.writable, dir: diagnostics.cache.dir },
      temp: { writable: diagnostics.temp.writable, dir: diagnostics.temp.dir },
      envFlagsPresent: diagnostics.config.envFlagsPresent,
      warnings: diagnostics.warnings,
      fixes: diagnostics.fixes,
    } : null,
    clientErrors: clientErrors.slice(0, 5).map((entry) => ({
      message: entry.message,
      source: entry.source,
      route: entry.route,
      timestamp: entry.timestamp,
    })),
  }, null, 2);

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">Debug details</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Safe diagnostics only: hostnames, booleans, request codes, and recent client errors.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) void navigator.clipboard.writeText(payload);
            }}
          >
            Copy diagnostics
          </Button>
          <Button size="sm" variant="ghost" onClick={onClearClientErrors} disabled={clientErrors.length === 0}>Clear errors</Button>
        </div>
      </div>
      <textarea
        className="mt-4 h-48 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 font-mono text-xs leading-5 text-[var(--muted)]"
        readOnly
        value={payload}
      />
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

function ProgressCard({ state, progress, progressPct }: { state: DownloadState; progress: LocalExportProgress | null; progressPct: number }) {
  if (state !== "exporting" || !progress) return null;
  return (
    <Card className="p-4 sm:p-6" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">{phaseLabel(progress.phase)}</h2>
          <p className="mt-1 break-words text-sm text-[var(--muted)]">{progress.currentSong || "Preparing next item"}</p>
          {progress.currentSourceType ? <p className="mt-1 text-xs text-[var(--muted)]">Source: {progress.currentSourceType}</p> : null}
        </div>
        <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-sm font-medium text-[var(--text)]">{progress.completed}/{progress.total}</span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--surface-subtle)]" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
        <Metric label="Exported" value={String(progress.exported ?? 0)} />
        <Metric label="Failed" value={String(Math.max(progress.failed - (progress.skipped ?? 0), 0))} />
        <Metric label="Skipped" value={String(progress.skipped ?? 0)} />
        <Metric label="Progress" value={`${progressPct}%`} />
      </div>
    </Card>
  );
}

function ResultCard({ state, errorMessage, summary, unresolvedItems, visibleFailures, setupIssue, showAllFailures, onToggleFailures }: {
  state: DownloadState;
  errorMessage: string;
  summary: ResultSummary | null;
  unresolvedItems: LocalExportResultItem[];
  visibleFailures: LocalExportResultItem[];
  setupIssue: { code?: string; message: string } | null;
  showAllFailures: boolean;
  onToggleFailures: () => void;
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
  const groupedFailures = Array.from(unresolvedItems.reduce((map, item) => {
    const key = item.code || item.status;
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries());

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">ZIP downloaded</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Unresolved songs were added to search-list.txt and failed-items.json.</p>
        </div>
        <span className="rounded-full border border-[color:rgba(var(--status-success-rgb),0.45)] bg-[color:rgba(var(--status-success-rgb),0.12)] px-3 py-1 text-sm font-medium text-[var(--status-success)]">
          Exported {summary.exported} of {summary.total}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Metric label="Exported" value={String(summary.exported)} />
        <Metric label="Failed" value={String(summary.failed)} />
        <Metric label="Skipped" value={String(summary.skipped)} />
      </div>

      {setupIssue ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[color:rgba(var(--status-warning-rgb),0.45)] bg-[color:rgba(var(--status-warning-rgb),0.12)] p-3 text-sm leading-6 text-[var(--text)]">
          <span className="font-medium">{setupIssue.code || "YouTube fallback"}: </span>{setupIssue.message}
        </div>
      ) : null}

      {unresolvedItems.length > 0 ? (
        <div className="mt-5">
          {groupedFailures.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {groupedFailures.map(([code, count]) => (
                <span key={code} className="rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-1 text-xs text-[var(--muted)]">
                  {code}: {count}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">Unresolved items</h3>
            {unresolvedItems.length > 8 ? (
              <button type="button" className="text-sm text-[var(--accent)] hover:underline" onClick={onToggleFailures}>
                {showAllFailures ? "Show fewer" : `Show all ${unresolvedItems.length}`}
              </button>
            ) : null}
          </div>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {visibleFailures.map((item, index) => (
              <div key={`${item.id}-${item.status}-${index}`} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-[var(--text)]">{item.artist ? `${item.artist} - ${item.title}` : item.title}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-[var(--muted)]">{item.error || item.fix || "Skipped"}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-[var(--muted)]">
                      Source: {item.sourceAttempted || "none"}{item.requestId ? ` | Request ${item.requestId}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">{item.code || item.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
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
