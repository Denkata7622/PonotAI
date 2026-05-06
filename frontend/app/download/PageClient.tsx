"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recognizeFromImage, type SongRecognitionResult } from "@/features/recognition/api";
import { lookupCoverArtUrls } from "@/features/recognition/coverArt";
import { normalizeTrackKey } from "@/lib/songIdentity";
import { useLanguage } from "@/lib/LanguageContext";
import { t } from "@/lib/translations";
import { getApiBaseUrl } from "@/lib/apiConfig";
import DownloadClient from "./DownloadClient";

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

const LOW_CONFIDENCE = 0.75;

export default function DownloadPageClient() {
  const { language } = useLanguage();
  const apiBaseUrl = typeof window !== "undefined" ? getApiBaseUrl() : "";
  const [jobs, setJobs] = useState<BatchImageJob[]>([]);
  const [songs, setSongs] = useState<BatchSong[]>([]);
  const [activeCoverSongId, setActiveCoverSongId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
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

  const jobsCanCollapse = jobs.length > 0 && jobs.every((j) => j.status === "done" || j.status === "error");

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
        id: crypto.randomUUID(),
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
      return { id: crypto.randomUUID(), file, previewUrl, status: "queued" as const, foundCount: 0 };
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
    if (!song) return;
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
    downloadBlob(JSON.stringify(payload, null, 2), filename, "application/json");
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
    downloadBlob([header, ...rows].join("\n"), "batch-ocr-selected.csv", "text/csv;charset=utf-8");
  }

  const handleModalRefresh = useCallback(() => {
    if (!activeCoverSongId) return;
    void findCoversForSong(activeCoverSongId);
  }, [activeCoverSongId, findCoversForSong]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
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

        <ImageJobList jobs={jobs} language={language} isOpen={isJobsOpen} canCollapse={jobsCanCollapse} onToggle={() => setIsJobsOpen((v) => !v)} />
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

      <section className="mt-6">
        <DownloadClient />
      </section>

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
    </main>
  );
}

function BatchSummary({ summary, language }: { summary: { imagesProcessed: number; totalImages: number; totalSongsFound: number; duplicatesMerged: number; selectedSongs: number; songsNeedingReview: number; songsMissingCovers: number }; language: "en" | "bg" }) {
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

function ImageJobList({ jobs, language, isOpen, canCollapse, onToggle }: { jobs: BatchImageJob[]; language: "en" | "bg"; isOpen: boolean; canCollapse: boolean; onToggle: () => void }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("download_jobs", language)}</h2>
        {canCollapse ? <button type="button" className="text-sm text-[var(--muted)]" onClick={onToggle}>{isOpen ? t("download_collapse", language) : t("download_expand", language)}</button> : null}
      </div>
      {isOpen && (
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
      )}
    </section>
  );
}

function SongReviewList({ songs, language, coverLoadingSongIds, onChangeSong, onOpenCover, onFindCover }: { songs: BatchSong[]; language: "en" | "bg"; coverLoadingSongIds: string[]; onChangeSong: (songId: string, patch: Partial<BatchSong>) => void; onOpenCover: (songId: string) => void; onFindCover: (songId: string) => void }) {
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

function SongReviewCard({ song, language, loadingCover, onChangeSong, onOpenCover, onFindCover }: { song: BatchSong; language: "en" | "bg"; loadingCover: boolean; onChangeSong: (songId: string, patch: Partial<BatchSong>) => void; onOpenCover: (songId: string) => void; onFindCover: (songId: string) => void }) {
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

function CoverPickerModal({ isOpen, song, language, loading, onClose, onRefresh, onPick }: { isOpen: boolean; song: BatchSong | null; language: "en" | "bg"; loading: boolean; onClose: () => void; onRefresh: () => void; onPick: (url: string) => void }) {
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
            <p className="text-sm text-[var(--muted)]">{song.title || t("download_unknown_title", language)} · {song.artist || t("download_unknown_artist", language)}</p>
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

function StickyReviewBar({ language, summary, onValidate, onExportSelectedJson, onExportAllJson, onExportCsv }: { language: "en" | "bg"; summary: { totalSongsFound: number; selectedSongs: number; songsNeedingReview: number }; onValidate: () => void; onExportSelectedJson: () => void; onExportAllJson: () => void; onExportCsv: () => void }) {
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

function getBadges(song: BatchSong, language: "en" | "bg"): string[] {
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

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
