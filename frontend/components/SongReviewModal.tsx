"use client";

import { useMemo, useState } from "react";
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
const BG_NO_MISSING = "Всички песни вече имат корици.";

function normalizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function normalizeLabel(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function dedupeCoverCandidates(candidates: CoverCandidate[]): CoverCandidate[] {
  const seen = new Set<string>();
  const deduped: CoverCandidate[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate.url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push({ ...candidate, url: normalized });
  }
  return deduped;
}

function getSongCover(song: EditableSong): string | undefined {
  return normalizeUrl(song.selectedCoverUrl) ?? normalizeUrl(song.coverUrl) ?? normalizeUrl(song.albumArtUrl) ?? undefined;
}

function setSongCover(song: EditableSong, coverUrl: string): EditableSong {
  const normalized = normalizeUrl(coverUrl);
  if (!normalized) return { ...song, selectedCoverUrl: undefined, albumArtUrl: "", coverUrl: "" };
  const merged = dedupeCoverCandidates([{ url: normalized, source: "Selected" }, ...song.coverCandidates]);
  return { ...song, selectedCoverUrl: normalized, albumArtUrl: normalized, coverUrl: normalized, coverCandidates: merged };
}

function normalizeCandidates(song: SongMatch): { selectedCoverUrl?: string; coverCandidates: CoverCandidate[] } {
  const rawSong = song as SongMatch & { coverUrl?: unknown; coverCandidates?: unknown };
  const options: CoverCandidate[] = [];
  const rawCandidates = Array.isArray(rawSong.coverCandidates) ? rawSong.coverCandidates : [];
  for (const entry of rawCandidates) {
    if (typeof entry === "string") {
      const url = normalizeUrl(entry);
      if (url) options.push({ url });
      continue;
    }
    if (entry && typeof entry === "object") {
      const candidate = entry as { url?: unknown; imageUrl?: unknown; coverUrl?: unknown; source?: unknown; label?: unknown };
      const url = normalizeUrl(candidate.url) ?? normalizeUrl(candidate.imageUrl) ?? normalizeUrl(candidate.coverUrl);
      if (url) options.push({ url, source: normalizeLabel(candidate.source) ?? normalizeLabel(candidate.label) });
    }
  }
  const selectedCoverUrl = normalizeUrl(rawSong.coverUrl) ?? normalizeUrl(song.albumArtUrl) ?? normalizeUrl(options[0]?.url) ?? undefined;
  return { selectedCoverUrl, coverCandidates: dedupeCoverCandidates(selectedCoverUrl ? [{ url: selectedCoverUrl, source: "Selected" }, ...options] : options) };
}

type SongReviewModalProps = {
  songs: SongMatch[];
  onConfirm: (selectedSongs: SongMatch[]) => void | Promise<void>;
  onCancel: () => void;
};

function CoverThumb({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="flex h-full w-full items-center justify-center bg-surface-overlay text-[10px] text-text-muted">No image</div> : <img src={url} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />;
}

export default function SongReviewModal({ songs, onConfirm, onCancel }: SongReviewModalProps) {
  const apiBaseUrl = getApiBaseUrl();
  const [editableSongs, setEditableSongs] = useState<EditableSong[]>(() => songs.map((song, index) => {
    const { selectedCoverUrl, coverCandidates } = normalizeCandidates(song);
    return { ...song, reviewId: `${song.youtubeVideoId || "song"}-${song.songName}-${song.artist}-${index}`, selected: true, selectedCoverUrl, coverCandidates, loadingCovers: false };
  }));
  const { language } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState("");
  const [inlineMessage, setInlineMessage] = useState("");
  const [batchCoverLoading, setBatchCoverLoading] = useState(false);

  const selectedCount = editableSongs.filter((s) => s.selected).length;
  const currentSong = editableSongs.find((song) => song.selected) ?? editableSongs[0];
  const currentSongHasCover = Boolean(currentSong && getSongCover(currentSong));

  function updateSong(reviewId: string, updater: (song: EditableSong) => EditableSong) {
    setEditableSongs((prev) => prev.map((song) => (song.reviewId === reviewId ? updater(song) : song)));
  }

  function setSelectedCover(reviewId: string, coverUrl: string) {
    updateSong(reviewId, (song) => setSongCover(song, coverUrl));
    setInlineMessage("");
  }

  function setCoverToAllSongs() {
    if (!currentSong) return;
    const selectedCoverUrl = getSongCover(currentSong);
    if (!selectedCoverUrl) {
      setInlineMessage("Choose a cover first.");
      return;
    }
    setEditableSongs((prev) => prev.map((song) => setSongCover(song, selectedCoverUrl)));
    setInlineMessage("");
  }

  async function loadCoverOptions(reviewId: string, useExclude: boolean) {
    const target = editableSongs.find((s) => s.reviewId === reviewId);
    if (!target) return;
    const title = target.editedSongName?.trim() || target.songName;
    const artist = target.editedArtist?.trim() || target.artist;
    updateSong(reviewId, (song) => ({ ...song, loadingCovers: true }));
    try {
      const coverUrls = await lookupCoverArtUrls(apiBaseUrl, title, artist, { exclude: useExclude ? target.coverCandidates.map((item) => item.url) : [], limit: 8 });
      if (!coverUrls.length) return;
      updateSong(reviewId, (song) => {
        const merged = dedupeCoverCandidates([...song.coverCandidates, ...coverUrls.map((url, idx) => ({ url, source: `Candidate ${idx + 1}` }))]);
        const next = { ...song, coverCandidates: merged };
        return getSongCover(next) ? next : setSongCover(next, merged[0]?.url || "");
      });
    } finally {
      updateSong(reviewId, (song) => ({ ...song, loadingCovers: false }));
    }
  }

  async function findCoversForMissingSongs() {
    const missing = editableSongs.filter((song) => !normalizeUrl(song.selectedCoverUrl) && !normalizeUrl(song.coverUrl) && !normalizeUrl(song.albumArtUrl));
    if (!missing.length) {
      setInlineMessage(BG_NO_MISSING);
      return;
    }
    setBatchCoverLoading(true);
    let found = 0;
    for (let i = 0; i < missing.length; i += 1) {
      const target = missing[i] as EditableSong;
      setInlineMessage(`Търсене на корици ${i + 1}/${missing.length}...`);
      try {
        const title = target.editedSongName?.trim() || target.songName;
        const artist = target.editedArtist?.trim() || target.artist;
        const coverUrls = await lookupCoverArtUrls(apiBaseUrl, title, artist, { exclude: target.coverCandidates.map((item) => item.url), limit: 8 });
        if (!coverUrls.length) continue;
        found += 1;
        updateSong(target.reviewId, (song) => {
          const merged = dedupeCoverCandidates([...song.coverCandidates, ...coverUrls.map((url, idx) => ({ url, source: `Candidate ${idx + 1}` }))]);
          const next = { ...song, coverCandidates: merged };
          return getSongCover(next) ? next : setSongCover(next, merged[0]?.url || "");
        });
      } catch {
        // keep partial success
      }
    }
    setBatchCoverLoading(false);
    setInlineMessage(`Намерени корици за ${found} от ${missing.length} песни.`);
  }

  async function handleConfirm() {
    if (isSubmitting) return;
    const selected = editableSongs.filter((song) => song.selected).map((song) => ({ ...song, albumArtUrl: getSongCover(song) || "", coverUrl: getSongCover(song), coverCandidates: song.coverCandidates.map((candidate) => candidate.url) }));
    setIsSubmitting(true);
    try { await onConfirm(selected); } finally { setIsSubmitting(false); }
  }

  const chosenSongSummary = useMemo(() => currentSong ? `${currentSong.songName} — ${currentSong.artist}` : "", [currentSong]);

  return <Modal isOpen onClose={onCancel} title={t("modal_review_title", language)} maxWidth="1024px" centerOnMobile panelClassName="overflow-hidden p-4 sm:p-6">
    <div className="flex h-full max-h-[min(78dvh,760px)] w-full max-w-5xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-5">
      <p className="mb-2 shrink-0 text-sm text-text-muted">{t("modal_selected_count", language, { selected: selectedCount, total: editableSongs.length })}</p>
      <div className="mb-3 flex gap-2"><Button variant="secondary" onClick={() => void findCoversForMissingSongs()} disabled={batchCoverLoading}>Намери корици за липсващите</Button></div>
      {currentSong ? <div className="mb-4 rounded-xl border border-border bg-surface-raised p-3">
        <p className="text-xs text-text-muted">Selected cover for</p><p className="text-sm font-medium">{chosenSongSummary}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-14 w-14 overflow-hidden rounded-lg border border-border"><CoverThumb url={getSongCover(currentSong) || FALLBACK_COVER} alt="Selected cover preview" /></div>
          <Button onClick={setCoverToAllSongs} disabled={!currentSongHasCover}>Set cover to all songs</Button>
          <Button variant="secondary" onClick={() => currentSong && setSelectedCover(currentSong.reviewId, "")}>Clear cover</Button>
        </div>
        <div className="mt-2 flex gap-2">
          <Input aria-label="Custom cover URL" value={customCoverUrl} onChange={(e) => setCustomCoverUrl(e.target.value)} placeholder="https://example.com/cover.jpg" />
          <Button variant="secondary" onClick={() => { const candidate = customCoverUrl.trim(); if (!/^https?:\/\//i.test(candidate)) { setInlineMessage("Enter a valid http/https URL."); return; } if (currentSong) setSelectedCover(currentSong.reviewId, candidate); }}>Use for this song</Button>
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
