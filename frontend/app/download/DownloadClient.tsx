"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";
import SongReviewModal from "@/components/SongReviewModal";
import type { SongMatch } from "@/features/recognition/api";
import { createLocalExportZip, saveBlobAsDownload, type LocalExportProgress, type LocalExportResultItem, type LocalExportSong } from "@/lib/localDownloadExporter";

type DownloadState = "idle" | "ready" | "exporting" | "done" | "error";

type Diagnostics = { ok: boolean; mode: "local" | "cloud" | "unknown"; downloader: { found: boolean }; ffmpeg: { found: boolean }; cache: { writable: boolean }; warnings: string[]; fixes: string[] };
type ExportSong = SongMatch & { coverUrl?: string; selected?: boolean; selectedCoverUrl?: string; source?: string; rawText?: string; sourceImageIds?: string[]; title?: string; name?: string; file?: File; blob?: Blob; audioUrl?: string; sourceUrl?: string; coverCandidates?: unknown };

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

function normalizeYoutubeVideoId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return YOUTUBE_VIDEO_ID_REGEX.test(trimmed) ? trimmed : undefined;
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

function parseImportedSongs(raw: unknown): SongMatch[] {
  const root = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === "object" && Array.isArray((raw as { songs?: unknown }).songs)
      ? (raw as { songs: unknown[] }).songs
      : []);

  const normalizedSongs: SongMatch[] = [];
  for (let index = 0; index < root.length; index += 1) {
    const entry = root[index];
    if (typeof entry === "string") {
      normalizedSongs.push(toSongMatch(entry, index));
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (item.selected === false) continue;

    const songName = [item.songName, item.title, item.name, item.rawText].find((v) => typeof v === "string" && v.trim()) as string | undefined;
    if (!songName) continue;

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
  return normalizedSongs;
}

function toSongMatch(query: string, index: number): SongMatch {
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
    audioUrl: song.audioUrl || song.sourceUrl || platformAudio,
    sourceUrl: song.sourceUrl || song.source,
    source: song.source,
    file: song.file,
    blob: song.blob,
    selectedCoverUrl: song.selectedCoverUrl,
    coverUrl: song.coverUrl,
    albumArtUrl: song.albumArtUrl,
    youtubeVideoId,
    durationSec: song.durationSec,
  };
}

export default function DownloadClient() {
  const [songName, setSongName] = useState("");
  const [state, setState] = useState<DownloadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [importedSongs, setImportedSongs] = useState<SongMatch[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [exportSongs, setExportSongs] = useState<ExportSong[]>([]);
  const [progress, setProgress] = useState<LocalExportProgress | null>(null);
  const [summary, setSummary] = useState("");
  const [resultItems, setResultItems] = useState<LocalExportResultItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState("");

  async function loadDiagnostics() {
    try {
      setDiagnosticsError("");
      const res = await fetch("/api/download/diagnostics", { cache: "no-store" });
      const data = await res.json() as Diagnostics;
      setDiagnostics(data);
    } catch {
      setDiagnosticsError("Could not load downloader diagnostics.");
    }
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("query")?.trim() ?? "";
    setSongName(query);
    void loadDiagnostics();
  }, []);

  async function handleJsonImport(file: File | null) {
    if (!file) return;
    setErrorMessage("");
    try {
      const songs = parseImportedSongs(JSON.parse(await file.text()) as unknown);
      if (songs.length === 0) {
        setState("error");
        setErrorMessage("No valid songs were found in this JSON file.");
        return;
      }
      setImportedSongs(songs);
      setShowReviewModal(true);
      setState("idle");
      setExportSongs([]);
    } catch {
      setState("error");
      setErrorMessage("Invalid JSON file. Please upload a valid songs JSON export.");
    }
  }

  function addSingleSongToExport() {
    const query = songName.trim();
    if (!query) {
      setState("error");
      setErrorMessage("Please enter a song name.");
      return;
    }
    setExportSongs([toSongMatch(query, 0)]);
    setState("ready");
    setErrorMessage("");
    setSummary("");
  }

  function handleConfirmSongs(selectedSongs: SongMatch[]) {
    setShowReviewModal(false);
    setExportSongs(selectedSongs as ExportSong[]);
    setState("ready");
    setErrorMessage("");
    setSummary("");
  }

  async function handleLocalZipExport() {
    const selectedSongs = exportSongs.filter((song) => song.selected !== false);
    if (selectedSongs.length === 0) return;

    setState("exporting");
    setProgress({ phase: "preparing", completed: 0, total: selectedSongs.length, failed: 0 });
    setErrorMessage("");

    try {
      const result = await createLocalExportZip(selectedSongs.map(toLocalExportSong), setProgress);
      setResultItems(result.items);
      const now = new Date();
      const filename = `Turrex Export ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}.zip`;
      saveBlobAsDownload(result.zipBlob, filename);
      setState("done");
      setSummary(`Exported ${result.exportedCount} of ${selectedSongs.length} songs. ${result.failedCount + result.skippedCount} songs could not export audio and were added to search-list.txt.`);
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Local export failed.");
    }
  }

  const selectedCount = useMemo(() => exportSongs.filter((song) => song.selected !== false).length, [exportSongs]);
  const phaseText = useMemo(() => ({ preparing: "Preparing export...", "fetching-audio": "Fetching audio...", "downloading-youtube": "Downloading audio via local yt-dlp...", "fetching-cover": "Fetching cover...", "adding-files": "Adding files to ZIP...", finalizing: "Finalizing ZIP..." }[progress?.phase ?? "preparing"] || ""), [progress]);

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10">
      <Card className="space-y-5 rounded-2xl p-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Local ZIP Export</h1>
          <p className="mt-1 text-sm text-text-muted">Local files and direct audio links export fastest. YouTube fallback works best when running locally with yt-dlp + ffmpeg installed. Cloud hosts like Railway may be blocked by YouTube; blocked batches will skip quickly and add songs to search-list.txt.</p>
        </div>
        <div className="space-y-2"><label htmlFor="songName" className="text-sm text-text-muted">Single song</label><Input id="songName" value={songName} onChange={(event) => setSongName(event.target.value)} placeholder="e.g. The Weeknd - Blinding Lights" /></div>
        <div className="space-y-2"><label htmlFor="songsJson" className="text-sm text-text-muted">Import OCR songs JSON</label><input id="songsJson" type="file" accept=".json" onChange={(event) => void handleJsonImport(event.target.files?.[0] ?? null)} className="block w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-muted" /></div>
        <div className="flex flex-wrap items-center gap-3"><Button onClick={addSingleSongToExport}>Add single song to export</Button><Button onClick={() => void handleLocalZipExport()} disabled={selectedCount === 0 || state === "exporting"}>Export ZIP locally</Button></div>

        <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <strong>Downloader diagnostics</strong>
            <Button onClick={() => void loadDiagnostics()}>Recheck downloader</Button>
          </div>
          {diagnosticsError ? <p className="mt-2 text-danger">{diagnosticsError}</p> : null}
          {diagnostics ? <div className="mt-2 space-y-1 text-text-muted">
            <p>{diagnostics.ok ? "Local downloader ready" : (!diagnostics.downloader.found ? "Missing yt-dlp" : !diagnostics.ffmpeg.found ? "Missing ffmpeg" : "Downloader needs attention")}</p>
            {diagnostics.mode === "cloud" ? <p>Cloud server detected. yt-dlp can be installed here, but YouTube may block datacenter IPs. For reliable YouTube fallback, run locally/private network.</p> : null}
            {!diagnostics.cache.writable ? <p>Cache not writable. Set YTDLP_CACHE_DIR to a writable path.</p> : null}
            {!diagnostics.downloader.found ? <p>yt-dlp is missing on the machine running the server. Install it or set YTDLP_PATH.</p> : null}
            {diagnostics.fixes?.[0] ? <p>Fix: {diagnostics.fixes[0]}</p> : null}
          </div> : null}
        </div>

        {selectedCount > 0 ? <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm">Selected songs: {selectedCount}</div> : null}
        {state === "exporting" && progress ? <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm space-y-1"><div>{phaseText}</div><div>Current song: {progress.currentSong || "-"}</div><div>Completed: {progress.completed} / {progress.total}</div><div>Failed/skipped: {progress.failed}</div></div> : null}
        {state === "done" ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"><div>{summary}</div>{resultItems.filter((item) => item.status !== "exported").map((item) => <div key={`${item.id}-${item.status}`} className="mt-1 text-xs">{item.artist ? `${item.artist} - ${item.title}` : item.title}: {item.error || "Skipped"}</div>)}</div> : null}
        {state === "error" ? <div className="rounded-xl border border-danger bg-surface-raised px-4 py-3 text-sm text-danger">{errorMessage}</div> : null}
      </Card>
      {showReviewModal ? <SongReviewModal songs={importedSongs} onCancel={() => setShowReviewModal(false)} onConfirm={handleConfirmSongs} /> : null}
    </section>
  );
}
