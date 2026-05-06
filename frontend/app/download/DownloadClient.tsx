"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";
import SongReviewModal from "@/components/SongReviewModal";
import type { SongMatch } from "@/features/recognition/api";

type DownloadState = "idle" | "loading" | "success" | "error";

type DownloadPayload = { filePath?: string; message?: string; error?: string };
type ZipPayload = { zipUrl?: string; message?: string; missingFiles?: string[] };

type ProgressState = {
  total: number;
  current: number;
  status: string;
  running: boolean;
};

function parseSongList(raw: unknown): string[] {
  const root = Array.isArray(raw) ? raw : (raw && typeof raw === "object" && Array.isArray((raw as { songs?: unknown }).songs) ? (raw as { songs: unknown[] }).songs : []);
  const deduped = new Set<string>();

  for (const entry of root) {
    let normalized = "";
    if (typeof entry === "string") normalized = entry;
    else if (entry && typeof entry === "object") {
      const item = entry as Record<string, unknown>;
      if (item.selected === false) continue;
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const artist = typeof item.artist === "string" ? item.artist.trim() : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const rawText = typeof item.rawText === "string" ? item.rawText.trim() : "";
      if (title && artist) normalized = `${artist} - ${title}`;
      else if (name) normalized = name;
      else if (title) normalized = title;
      else if (rawText) normalized = rawText;
    }

    const cleaned = normalized.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    deduped.add(cleaned);
  }

  return Array.from(deduped);
}

function toSongMatch(query: string, index: number): SongMatch {
  const [left, ...rest] = query.split(" - ");
  const hasDash = rest.length > 0;
  const artist = hasDash ? left.trim() : "";
  const songName = hasDash ? rest.join(" - ").trim() : query.trim();

  return {
    songName,
    artist,
    album: "Unknown Album",
    genre: "",
    releaseYear: null,
    platformLinks: {},
    albumArtUrl: "https://picsum.photos/seed/recognized/120",
    confidence: 1,
    durationSec: 0,
    youtubeVideoId: `import-${index}`,
  };
}

export default function DownloadClient() {
  const searchParams = useSearchParams();
  const prefillQuery = useMemo(() => searchParams.get("query")?.trim() ?? "", [searchParams]);
  const autoTriggeredRef = useRef(false);

  const [songName, setSongName] = useState(prefillQuery);
  const [state, setState] = useState<DownloadState>("idle");
  const [successPath, setSuccessPath] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [importedSongs, setImportedSongs] = useState<string[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({ total: 0, current: 0, status: "", running: false });
  const [summary, setSummary] = useState<{ success: string[]; failed: string[] } | null>(null);
  const [zipUrl, setZipUrl] = useState("");

  function resetProgress() {
    setProgress({ total: 0, current: 0, status: "", running: false });
  }

  function resetBulkResults() {
    resetProgress();
    setSummary(null);
    setZipUrl("");
  }

  useEffect(() => {
    setSongName(prefillQuery);
  }, [prefillQuery]);

  async function runDownload(nameOverride?: string) {
    const query = (nameOverride ?? songName).trim();
    if (!query) {
      setState("error");
      setErrorMessage("Please enter a song name.");
      setSuccessPath("");
      return;
    }

    resetBulkResults();
    setState("loading");
    setErrorMessage("");
    setSuccessPath("");

    try {
      const response = await fetch("/api/music/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songName: query }),
      });

      const payload = (await response.json().catch(() => ({}))) as DownloadPayload;

      if (!response.ok) {
        setState("error");
        setErrorMessage(payload.message || payload.error || "Download failed. Please try again.");
        return;
      }

      setState("success");
      setSuccessPath(payload.filePath || "Download completed successfully.");
    } catch {
      setState("error");
      setErrorMessage("Network error while contacting downloader service.");
    }
  }

  async function handleJsonImport(file: File | null) {
    if (!file) return;
    setErrorMessage("");

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const songs = parseSongList(parsed);
      if (songs.length === 0) {
        setState("error");
        setErrorMessage("No valid songs were found in this JSON file.");
        return;
      }

      setImportedSongs(songs);
      setShowReviewModal(true);
      setState("idle");
      resetBulkResults();
    } catch {
      setState("error");
      setErrorMessage("Invalid JSON file. Please upload a valid songs JSON export.");
    }
  }

  async function startBulkDownload(selectedSongs: SongMatch[]) {
    const normalized = selectedSongs
      .map((song) => {
        const title = song.songName.trim();
        const artist = song.artist.trim();
        return artist ? `${artist} - ${title}` : title;
      })
      .filter(Boolean);
    if (normalized.length === 0) {
      setState("error");
      setErrorMessage("No songs selected for download.");
      return;
    }

    setShowReviewModal(false);
    setState("loading");
    resetBulkResults();
    const success: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < normalized.length; i += 1) {
      const currentSong = normalized[i] as string;
      setProgress({ total: normalized.length, current: i + 1, status: `Downloading ${i + 1} of ${normalized.length}...`, running: true });
      try {
        const response = await fetch("/api/music/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ songName: currentSong }),
        });
        const payload = (await response.json().catch(() => ({}))) as DownloadPayload;
        const filePath = typeof payload.filePath === "string" ? payload.filePath : "";
        if (!response.ok || !filePath) {
          failed.push(currentSong);
          continue;
        }
        success.push(filePath);
      } catch {
        failed.push(currentSong);
      }
    }

    let zipError = "";
    if (success.length > 0) {
      setProgress({ total: normalized.length, current: normalized.length, status: "Creating ZIP archive...", running: true });
      try {
        const zipResponse = await fetch("/api/music/zip-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePaths: success }),
        });
        const zipPayload = (await zipResponse.json().catch(() => ({}))) as ZipPayload;
        if (!zipResponse.ok || !zipPayload.zipUrl) {
          zipError = zipPayload.message || "ZIP creation failed.";
        } else {
          setZipUrl(zipPayload.zipUrl);
        }
      } catch {
        zipError = "Network error while creating ZIP archive.";
      }
    }

    setSummary({ success, failed });
    resetProgress();

    if (success.length > 0 && !zipError) {
      setState("success");
      setSuccessPath(`Downloaded ${success.length} song(s).`);
      setErrorMessage("");
    } else {
      setState("error");
      setErrorMessage(zipError || "All downloads failed.");
    }
  }

  useEffect(() => {
    if (!prefillQuery || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    void runDownload(prefillQuery);
  }, [prefillQuery]);

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Card className="space-y-5 rounded-2xl p-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Music Downloader</h1>
          <p className="mt-1 text-sm text-text-muted">Download a song by name as MP3.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="songName" className="text-sm text-text-muted">Song name</label>
          <Input id="songName" value={songName} onChange={(event) => setSongName(event.target.value)} placeholder="e.g. Blinding Lights The Weeknd" disabled={state === "loading"} />
        </div>

        <div className="space-y-2">
          <label htmlFor="songsJson" className="text-sm text-text-muted">Import OCR songs JSON</label>
          <input
            id="songsJson"
            type="file"
            accept=".json"
            onChange={(event) => void handleJsonImport(event.target.files?.[0] ?? null)}
            className="block w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-muted"
            disabled={state === "loading"}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => void runDownload()} disabled={state === "loading"}>{state === "loading" ? "Downloading..." : "Download"}</Button>
        </div>

        {progress.running || progress.status ? (
          <div className="space-y-2">
            <p className="text-sm text-text-muted">{progress.status}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-overlay">
              <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        ) : null}

        {zipUrl ? <a className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" href={zipUrl}>Download ZIP</a> : null}

        {summary ? <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm"><p>Bulk download complete.</p><p>Success: {summary.success.length}</p><p>Failed: {summary.failed.length}</p></div> : null}

        {state === "success" && (<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">Download completed. File: {successPath}</div>)}
        {state === "error" && (<div className="rounded-xl border border-danger bg-surface-raised px-4 py-3 text-sm text-danger">{errorMessage}</div>)}
      </Card>
      {showReviewModal ? <SongReviewModal songs={importedSongs.map(toSongMatch)} onCancel={() => { setShowReviewModal(false); resetBulkResults(); }} onConfirm={startBulkDownload} /> : null}
    </main>
  );
}
