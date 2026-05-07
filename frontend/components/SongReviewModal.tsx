"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "../src/components/ui/Modal";
import type { SongMatch } from "../features/recognition/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { RotateCcw } from "../lucide-react";
import { Button } from "../src/components/ui/Button";
import { Input } from "../src/components/ui/Input";
import { getApiBaseUrl } from "../lib/apiConfig";
import { lookupCoverArtUrls } from "../features/recognition/coverArt";

type CoverCandidate = { url: string; source?: string };
type EditableSong = SongMatch & {
  coverUrl?: string;
  reviewId: string;
  selected: boolean;
  editedSongName?: string;
  editedArtist?: string;
  selectedCoverUrl?: string;
  coverCandidates: CoverCandidate[];
  loadingCovers: boolean;
};

const FALLBACK_COVER = "/album-placeholder.svg";

function normalizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed ? trimmed : null;
}

function normalizeCandidates(song: SongMatch): { selectedCoverUrl?: string; coverCandidates: CoverCandidate[] } {
  const rawSong = song as SongMatch & { coverUrl?: unknown; coverCandidates?: unknown };
  const selectedCoverUrl = normalizeUrl(rawSong.coverUrl) ?? normalizeUrl(song.albumArtUrl) ?? undefined;
  const rawCandidates = Array.isArray(rawSong.coverCandidates) ? rawSong.coverCandidates : [];
  const options: CoverCandidate[] = [];

  for (const entry of rawCandidates) {
    if (typeof entry === "string") {
      const url = normalizeUrl(entry);
      if (url) options.push({ url });
      continue;
    }
    if (entry && typeof entry === "object") {
      const candidate = entry as { url?: unknown; imageUrl?: unknown; coverUrl?: unknown; source?: unknown; label?: unknown };
      const url = normalizeUrl(candidate.url) ?? normalizeUrl(candidate.imageUrl) ?? normalizeUrl(candidate.coverUrl);
      if (url) {
        const source = normalizeUrl(candidate.source) ?? normalizeUrl(candidate.label) ?? undefined;
        options.push({ url, source });
      }
    }
  }

  if (selectedCoverUrl) options.unshift({ url: selectedCoverUrl, source: "Selected" });

  const deduped: CoverCandidate[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    if (seen.has(option.url)) continue;
    seen.add(option.url);
    deduped.push(option);
  }

  return { selectedCoverUrl, coverCandidates: deduped };
}

type SongReviewModalProps = {
  songs: SongMatch[];
  onConfirm: (selectedSongs: SongMatch[]) => void | Promise<void>;
  onCancel: () => void;
};

function CoverThumb({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="flex h-full w-full items-center justify-center bg-surface-overlay text-[10px] text-text-muted">No image</div>
  ) : (
    <img src={url} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />
  );
}

export default function SongReviewModal({ songs, onConfirm, onCancel }: SongReviewModalProps) {
  const apiBaseUrl = getApiBaseUrl();
  const [editableSongs, setEditableSongs] = useState<EditableSong[]>(() => songs.map((song, index) => {
    const { selectedCoverUrl, coverCandidates } = normalizeCandidates(song);
    return {
      ...song,
      reviewId: `${song.youtubeVideoId || "song"}-${song.songName}-${song.artist}-${index}`,
      selected: true,
      selectedCoverUrl,
      coverCandidates,
      loadingCovers: false,
    };
  }));
  const { language } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState("");
  const [inlineMessage, setInlineMessage] = useState("");

  useEffect(() => {
    editableSongs.forEach((song) => {
      void loadCoverOptions(song.reviewId, false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCount = editableSongs.filter((s) => s.selected).length;
  const currentSong = editableSongs.find((song) => song.selected) ?? editableSongs[0];
  const currentSongHasCover = Boolean(currentSong?.selectedCoverUrl);

  function updateSong(reviewId: string, updater: (song: EditableSong) => EditableSong) {
    setEditableSongs((prev) => prev.map((song) => (song.reviewId === reviewId ? updater(song) : song)));
  }

  function setSelectedCover(reviewId: string, coverUrl: string) {
    const normalized = coverUrl.trim();
    updateSong(reviewId, (song) => {
      if (!normalized) {
        return { ...song, selectedCoverUrl: undefined, albumArtUrl: "", coverUrl: "" };
      }
      const exists = song.coverCandidates.some((candidate) => candidate.url === normalized);
      const coverCandidates = exists ? song.coverCandidates : [{ url: normalized, source: "Custom" }, ...song.coverCandidates];
      return { ...song, selectedCoverUrl: normalized, albumArtUrl: normalized, coverUrl: normalized, coverCandidates };
    });
    setInlineMessage("");
  }

  function setCoverToAllSongs() {
    if (!currentSong?.selectedCoverUrl) {
      setInlineMessage("Choose a cover first.");
      return;
    }
    const selectedCoverUrl = currentSong.selectedCoverUrl;
    setEditableSongs((prev) => prev.map((song) => {
      const exists = song.coverCandidates.some((candidate) => candidate.url === selectedCoverUrl);
      return {
        ...song,
        selectedCoverUrl,
        albumArtUrl: selectedCoverUrl,
        coverUrl: selectedCoverUrl,
        coverCandidates: exists ? song.coverCandidates : [{ url: selectedCoverUrl, source: "Set for all" }, ...song.coverCandidates],
      };
    }));
    setInlineMessage("");
  }

  async function loadCoverOptions(reviewId: string, useExclude: boolean) {
    const target = editableSongs.find((s) => s.reviewId === reviewId);
    if (!target) return;
    const title = target.editedSongName?.trim() || target.songName;
    const artist = target.editedArtist?.trim() || target.artist;

    updateSong(reviewId, (song) => ({ ...song, loadingCovers: true }));
    try {
      const coverUrls = await lookupCoverArtUrls(apiBaseUrl, title, artist, {
        exclude: useExclude ? target.coverCandidates.map((item) => item.url) : [],
        limit: 8,
      });
      if (coverUrls.length === 0) return;

      updateSong(reviewId, (song) => {
        const incoming = coverUrls.map((url, idx) => ({ url, source: `Candidate ${idx + 1}` }));
        const merged = [...incoming, ...song.coverCandidates];
        const deduped = merged.filter((item, index, arr) => arr.findIndex((x) => x.url === item.url) === index);
        const selectedCoverUrl = song.selectedCoverUrl ?? deduped[0]?.url;
        return { ...song, coverCandidates: deduped, selectedCoverUrl, albumArtUrl: selectedCoverUrl || "", coverUrl: selectedCoverUrl || "" };
      });
    } catch {
      // noop
    } finally {
      updateSong(reviewId, (song) => ({ ...song, loadingCovers: false }));
    }
  }

  async function handleConfirm() {
    if (isSubmitting) return;
    const selected = editableSongs.filter((song) => song.selected).map((song) => ({
      ...song,
      songName: song.editedSongName?.trim() || song.songName,
      artist: song.editedArtist?.trim() || song.artist,
      albumArtUrl: song.selectedCoverUrl || "",
      coverUrl: song.selectedCoverUrl,
      coverCandidates: song.coverCandidates.map((candidate) => candidate.url),
    }));
    setIsSubmitting(true);
    try { await onConfirm(selected); } finally { setIsSubmitting(false); }
  }

  const chosenSongSummary = useMemo(() => currentSong ? `${currentSong.songName} — ${currentSong.artist}` : "", [currentSong]);

  return <Modal isOpen onClose={onCancel} title={t("modal_review_title", language)} maxWidth="1024px" centerOnMobile panelClassName="overflow-hidden p-4 sm:p-6">
    <div className="flex h-full max-h-[min(78dvh,760px)] w-full max-w-5xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-5">
      <p className="mb-2 shrink-0 text-sm text-text-muted">{t("modal_selected_count", language, { selected: selectedCount, total: editableSongs.length })}</p>
      {currentSong ? <div className="mb-4 rounded-xl border border-border bg-surface-raised p-3">
        <p className="text-xs text-text-muted">Selected cover for</p><p className="text-sm font-medium">{chosenSongSummary}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-14 w-14 overflow-hidden rounded-lg border border-border"><CoverThumb url={currentSong.selectedCoverUrl || FALLBACK_COVER} alt="Selected cover preview" /></div>
          <Button onClick={setCoverToAllSongs} disabled={!currentSongHasCover}>Set cover to all songs</Button>
          <Button variant="secondary" onClick={() => currentSong && setSelectedCover(currentSong.reviewId, "")}>Clear cover</Button>
        </div>
        <div className="mt-2 flex gap-2">
          <Input aria-label="Custom cover URL" value={customCoverUrl} onChange={(e) => setCustomCoverUrl(e.target.value)} placeholder="https://example.com/cover.jpg" />
          <Button variant="secondary" onClick={() => { const candidate = customCoverUrl.trim(); if (!/^https?:\/\//i.test(candidate)) { setInlineMessage("Enter a valid http/https URL."); return; } if (currentSong) setSelectedCover(currentSong.reviewId, candidate); }}>Use custom cover</Button>
        </div>
        {inlineMessage ? <p className="mt-2 text-xs text-amber-300">{inlineMessage}</p> : null}
      </div> : null}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">{editableSongs.map((song) => <div key={song.reviewId} className={`rounded-xl border p-4 transition ${song.selected ? "border-[var(--accent-border)] bg-[var(--accent-soft)]" : "border-border bg-surface opacity-60"}`}>
        <div className="mb-3 flex items-center gap-3"><input type="checkbox" checked={song.selected} onChange={() => updateSong(song.reviewId, (s) => ({ ...s, selected: !s.selected }))} className="h-5 w-5 cursor-pointer accent-violet-500" /><div className="text-sm font-medium">{song.songName} — {song.artist}</div></div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">{song.coverCandidates.map((candidate, i) => <button key={`${song.reviewId}-${candidate.url}`} type="button" aria-pressed={song.selectedCoverUrl === candidate.url} onClick={() => setSelectedCover(song.reviewId, candidate.url)} className={`overflow-hidden rounded-lg border-2 ${song.selectedCoverUrl === candidate.url ? "border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]" : "border-border"}`}>
          <div className="h-16 w-full"><CoverThumb url={candidate.url} alt={`${song.songName} cover option ${i + 1}`} /></div>
          <div className="truncate px-1 py-0.5 text-[10px] text-text-muted">{candidate.source || `Candidate ${i + 1}`}</div>
        </button>)}</div>
        <button type="button" onClick={() => void loadCoverOptions(song.reviewId, true)} disabled={song.loadingCovers} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-60"><RotateCcw className={`h-3.5 w-3.5 ${song.loadingCovers ? "animate-spin" : ""}`} />Try different covers</button>
      </div>)}</div>
      <div className="mt-4 flex shrink-0 items-center justify-end gap-3 border-t border-[var(--border)] pt-4"><button onClick={onCancel} disabled={isSubmitting} className="rounded-lg border border-border px-5 py-2 hover:bg-surface-raised">{t("modal_cancel", language)}</button><button onClick={() => void handleConfirm()} disabled={selectedCount === 0 || isSubmitting} className="rounded-lg bg-[var(--accent)] px-5 py-2 font-medium hover:bg-[var(--accent-2)] disabled:cursor-not-allowed disabled:opacity-50">{selectedCount > 0 ? t("modal_confirm_count", language, { count: selectedCount }) : t("modal_confirm", language)}</button></div>
    </div>
  </Modal>;
}
