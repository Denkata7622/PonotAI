"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { SongMatch } from "../features/recognition/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { RotateCcw, X } from "../lucide-react";
import { Button } from "../src/components/ui/Button";
import { Input } from "../src/components/ui/Input";
import { getApiConfigStatus, getApiSetupMessage } from "../lib/apiConfig";
import { lookupCoverArtUrls } from "../features/recognition/coverArt";

type CoverCandidate = { url: string; source?: string };
type ReviewableSong = Omit<SongMatch, "albumArtUrl"> & {
  albumArtUrl?: string | null;
  coverUrl?: string | null;
  coverCandidates?: unknown;
};
type EditableSong = ReviewableSong & {
  reviewId: string;
  selected: boolean;
  editedSongName?: string;
  editedArtist?: string;
  selectedCoverUrl?: string | null;
  coverCandidates: CoverCandidate[];
  loadingCovers: boolean;
};

const FALLBACK_COVER = "/album-placeholder.svg";
const NO_MISSING_COVERS = "Every selected song already has cover art.";
const REVIEW_PAGE_SIZE = 100;

function normalizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) return trimmed;
  return null;
}

function isValidCoverUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function isRealCoverUrl(input: unknown): boolean {
  const normalized = normalizeUrl(input);
  return Boolean(normalized && normalized !== FALLBACK_COVER);
}

function normalizeLabel(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function dedupeCoverCandidates(candidates: CoverCandidate[]): CoverCandidate[] {
  const seen = new Set<string>();
  const deduped: CoverCandidate[] = [];
  for (const candidate of candidates) {
    if (!isValidCoverUrl(candidate.url)) continue;
    const normalized = candidate.url.trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push({ ...candidate, url: normalized });
  }
  return deduped;
}

function getSongCover(song: EditableSong): string | undefined {
  const candidates = [
    normalizeUrl(song.selectedCoverUrl),
    normalizeUrl(song.coverUrl),
    normalizeUrl(song.albumArtUrl),
  ].filter(Boolean) as string[];
  const realCover = candidates.find((url) => isRealCoverUrl(url));
  return realCover ?? candidates[0];
}

function setSongCover(song: EditableSong, coverUrl: string | null): EditableSong {
  const normalized = normalizeUrl(coverUrl);
  if (!normalized) {
    return { ...song, selectedCoverUrl: null, albumArtUrl: null, coverUrl: null };
  }
  const merged = dedupeCoverCandidates([{ url: normalized, source: "Selected" }, ...song.coverCandidates]);
  return { ...song, selectedCoverUrl: normalized, albumArtUrl: normalized, coverUrl: normalized, coverCandidates: merged };
}

function normalizeCandidates(song: ReviewableSong): { selectedCoverUrl?: string; coverCandidates: CoverCandidate[] } {
  const rawSong = song as ReviewableSong & { coverUrl?: unknown; coverCandidates?: unknown };
  const options: CoverCandidate[] = [];
  const rawCandidates = Array.isArray(rawSong.coverCandidates) ? rawSong.coverCandidates : [];
  for (const entry of rawCandidates) {
    if (typeof entry === "string") {
      const url = normalizeUrl(entry);
      if (url) options.push({ url });
      continue;
    }
    if (entry && typeof entry === "object") {
      const candidate = entry as {
        url?: unknown;
        imageUrl?: unknown;
        coverUrl?: unknown;
        source?: unknown;
        label?: unknown;
      };
      const url =
        normalizeUrl(candidate.url) ??
        normalizeUrl(candidate.imageUrl) ??
        normalizeUrl(candidate.coverUrl);
      if (url) {
        options.push({ url, source: normalizeLabel(candidate.source) ?? normalizeLabel(candidate.label) });
      }
    }
  }
  const selectedCoverUrl =
    normalizeUrl(rawSong.coverUrl) ?? normalizeUrl(song.albumArtUrl) ?? normalizeUrl(options[0]?.url) ?? undefined;
  return {
    selectedCoverUrl,
    coverCandidates: dedupeCoverCandidates(selectedCoverUrl ? [{ url: selectedCoverUrl, source: "Selected" }, ...options] : options),
  };
}

type SongReviewModalProps = {
  songs: SongMatch[];
  onConfirm: (selectedSongs: SongMatch[]) => void | Promise<void>;
  onCancel: () => void;
  submittingMessage?: string;
};

function missingCover(song: EditableSong): boolean {
  return !isValidCoverUrl(song.selectedCoverUrl) &&
    !isValidCoverUrl(song.coverUrl) &&
    !isValidCoverUrl(song.albumArtUrl);
}

function CoverThumb({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? (
      <div className="flex h-full w-full items-center justify-center bg-surface-overlay text-[10px] text-text-muted">
        No image
      </div>
    )
    : (
      <img
        src={url}
        alt={alt}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
}

export default function SongReviewModal({ songs, onConfirm, onCancel, submittingMessage }: SongReviewModalProps) {
  const apiConfig = useMemo(() => getApiConfigStatus(), []);
  const apiBaseUrl = apiConfig.baseUrl;
  const apiSetupMessage = apiConfig.message ?? getApiSetupMessage();
  const [editableSongs, setEditableSongs] = useState<EditableSong[]>(() =>
    songs.map((song, index) => {
      const { selectedCoverUrl, coverCandidates } = normalizeCandidates(song);
      return {
        ...song,
        reviewId: `${song.youtubeVideoId || "song"}-${song.songName}-${song.artist}-${index}`,
        selected: true,
        selectedCoverUrl,
        coverCandidates,
        loadingCovers: false,
      };
    }),
  );

  const { language } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState("");
  const [inlineMessage, setInlineMessage] = useState("");
  const [batchCoverLoading, setBatchCoverLoading] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewPage, setReviewPage] = useState(0);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.body,
  );

  const selectedCount = editableSongs.filter((s) => s.selected).length;
  const currentSongFromActive = activeReviewId
    ? editableSongs.find((song) => song.reviewId === activeReviewId)
    : undefined;

  const currentSong =
    currentSongFromActive
    || editableSongs.find((song) => song.selected)
    || editableSongs[0];

  const currentSongHasCover = Boolean(currentSong && isRealCoverUrl(getSongCover(currentSong)));
  const anySongHasCover = editableSongs.some((song) => isRealCoverUrl(getSongCover(song)));
  const filteredEditableSongs = useMemo(() => {
    const normalizedQuery = reviewQuery.trim().toLowerCase();
    if (!normalizedQuery) return editableSongs;
    return editableSongs.filter((song) => [
      song.editedSongName,
      song.songName,
      song.editedArtist,
      song.artist,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery)));
  }, [editableSongs, reviewQuery]);
  const reviewPageCount = Math.max(1, Math.ceil(filteredEditableSongs.length / REVIEW_PAGE_SIZE));
  const safeReviewPage = Math.min(reviewPage, reviewPageCount - 1);
  const visibleEditableSongs = filteredEditableSongs.slice(safeReviewPage * REVIEW_PAGE_SIZE, safeReviewPage * REVIEW_PAGE_SIZE + REVIEW_PAGE_SIZE);

  useEffect(() => {
    setReviewPage(0);
  }, [reviewQuery]);

  useEffect(() => {
    setReviewPage((value) => Math.min(value, reviewPageCount - 1));
  }, [reviewPageCount]);

  useEffect(() => {
    setPortalRoot(document.body);
    const previousBodyOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [onCancel]);

  function updateSong(reviewId: string, updater: (song: EditableSong) => EditableSong) {
    setEditableSongs((prev) => prev.map((song) => (song.reviewId === reviewId ? updater(song) : song)));
  }

  function clearSongCover(reviewId: string) {
    setActiveReviewId(reviewId);
    updateSong(reviewId, (song) => setSongCover(song, null));
    setInlineMessage("");
  }

  function clearAllCovers() {
    setEditableSongs((prev) => prev.map((song) => setSongCover(song, null)));
    setInlineMessage("");
  }
  async function searchCoverCandidatesForSong(song: EditableSong): Promise<string[]> {
    if (!apiBaseUrl) throw new Error(apiSetupMessage);
    const title = song.editedSongName?.trim() || song.songName;
    const artist = song.editedArtist?.trim() || song.artist;
    const exclude = song.coverCandidates.map((item) => item.url);
    const urls = await lookupCoverArtUrls(apiBaseUrl, title, artist, { exclude, limit: 4 });
    return dedupeCoverCandidates(urls.map((url) => ({ url }))).map((item) => item.url);
  }

  function setSelectedCover(reviewId: string, coverUrl: string) {
    setActiveReviewId(reviewId);
    updateSong(reviewId, (song) => setSongCover(song, coverUrl));
    setInlineMessage("");
  }

  function setCoverToAllSongs() {
    if (!currentSong) return;
    const selectedCoverUrl = getSongCover(currentSong);
    if (!isRealCoverUrl(selectedCoverUrl)) {
      setInlineMessage("Choose a real cover first.");
      return;
    }
    setEditableSongs((prev) => prev.map((song) => setSongCover(song, selectedCoverUrl as string)));
    setInlineMessage("");
  }

  async function loadCoverOptions(reviewId: string, useExclude: boolean) {
    if (!apiBaseUrl) {
      setInlineMessage(apiSetupMessage);
      return;
    }
    const target = editableSongs.find((s) => s.reviewId === reviewId);
    if (!target) return;
    const title = target.editedSongName?.trim() || target.songName;
    const artist = target.editedArtist?.trim() || target.artist;

    updateSong(reviewId, (song) => ({ ...song, loadingCovers: true }));
    try {
      const coverUrls = await lookupCoverArtUrls(apiBaseUrl, title, artist, {
        exclude: useExclude ? target.coverCandidates.map((item) => item.url) : [],
        limit: 4,
      });
      if (!coverUrls.length) return;
      updateSong(reviewId, (song) => {
        const merged = dedupeCoverCandidates([...song.coverCandidates, ...coverUrls.map((url, idx) => ({ url, source: `Candidate ${idx + 1}` }))]);
        const next = { ...song, coverCandidates: merged };
        return isRealCoverUrl(getSongCover(next)) ? next : setSongCover(next, merged[0]?.url || "");
      });
    } catch (error) {
      setInlineMessage(error instanceof Error ? error.message : "Cover lookup failed.");
    } finally {
      updateSong(reviewId, (song) => ({ ...song, loadingCovers: false }));
    }
  }

  async function findCoversForMissingSongs() {
    if (!apiBaseUrl) {
      setInlineMessage(apiSetupMessage);
      return;
    }
    const missing = editableSongs.filter((song) => missingCover(song));
    if (!missing.length) {
      setInlineMessage(NO_MISSING_COVERS);
      return;
    }

    setBatchCoverLoading(true);
    let found = 0;
    let failures = 0;
    const maxConcurrent = 3;

    try {
      const queue = [...missing];
      let processed = 0;

      const worker = async () => {
        while (queue.length > 0) {
          const target = queue.shift();
          if (!target) return;

          setInlineMessage(`Searching covers ${processed + 1}/${missing.length}...`);
          try {
            const coverUrls = await searchCoverCandidatesForSong(target);
            if (coverUrls.length > 0) {
              let addedCover = false;
              updateSong(target.reviewId, (song) => {
                const merged = dedupeCoverCandidates([
                  ...song.coverCandidates,
                  ...coverUrls.map((url, idx) => ({ url, source: `Candidate ${idx + 1}` })),
                ]);
                const next = { ...song, coverCandidates: merged };
                const hadCoverBefore = !missingCover(song);
                if (!hadCoverBefore && merged[0]?.url) {
                  addedCover = true;
                  return setSongCover(next, merged[0].url);
                }
                return next;
              });
              if (addedCover) found += 1;
            }
          } catch {
            failures += 1;
          } finally {
            processed += 1;
            setInlineMessage(`Searching covers ${processed}/${missing.length}...`);
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(maxConcurrent, missing.length) }, () => worker()));

      if (found === 0) {
        setInlineMessage(failures > 0 ? "No new covers were found. Some lookups failed." : "No new covers were found.");
      } else if (failures > 0) {
        setInlineMessage(`Found covers for ${found} of ${missing.length} songs. Some lookups failed.`);
      } else {
        setInlineMessage(`Found covers for ${found} of ${missing.length} songs.`);
      }
    } finally {
      setBatchCoverLoading(false);
    }

  }

  async function handleConfirm() {
    if (isSubmitting) return;
    const selected = editableSongs
      .filter((song) => song.selected)
      .map((song) => {
        const cover = getSongCover(song) ?? null;
        return {
          ...song,
          songName: song.editedSongName?.trim() || song.songName,
          artist: song.editedArtist?.trim() || song.artist,
          albumArtUrl: cover,
          coverUrl: cover,
          coverCandidates: song.coverCandidates.map((candidate) => candidate.url),
        };
      });

    setIsSubmitting(true);
    try {
      await onConfirm(selected as SongMatch[]);
    } catch (error) {
      setInlineMessage(error instanceof Error ? error.message : "Could not queue the selected songs.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const chosenSongSummary = useMemo(() => (currentSong ? `${currentSong.songName} - ${currentSong.artist}` : ""), [currentSong]);

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-review-title"
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-6">
          <h2 id="song-review-title" className="text-lg font-semibold text-[var(--text)]">{t("modal_review_title", language)}</h2>
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="rounded-lg border border-border px-3 py-1 text-sm hover:bg-surface-raised disabled:opacity-60">
            {t("modal_close", language)}
          </button>
        </div>
        <div className="flex min-h-0 flex-col p-3 sm:p-5">
        <p className="mb-2 shrink-0 text-sm text-text-muted">
          {t("modal_selected_count", language, { selected: selectedCount, total: editableSongs.length })}
        </p>
        {!apiBaseUrl ? (
          <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-500/12 px-3 py-2 text-xs leading-5 text-amber-100">
            {apiSetupMessage} Imported songs remain reviewable and local ZIP export is still available.
          </div>
        ) : null}
        <div className="mb-3 flex gap-2">
          <Button variant="secondary" onClick={() => void findCoversForMissingSongs()} disabled={batchCoverLoading || !apiBaseUrl}>
            Find covers for missing
          </Button>
          <Button variant="secondary" onClick={clearAllCovers} disabled={!anySongHasCover}>
            Clear all covers
          </Button>
        </div>
        {currentSong && (
          <div className="mb-4 rounded-xl border border-border bg-surface-raised p-3">
            <p className="text-xs text-text-muted">Selected cover for</p>
            <p className="text-sm font-medium">{chosenSongSummary}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-14 w-14 overflow-hidden rounded-lg border border-border">
                <CoverThumb url={getSongCover(currentSong) || FALLBACK_COVER} alt="Selected cover preview" />
              </div>
              <Button onClick={setCoverToAllSongs} disabled={!currentSongHasCover}>
                Set cover to all songs
              </Button>
              <Button variant="secondary" onClick={() => currentSong && clearSongCover(currentSong.reviewId)}>
                Clear cover
              </Button>
            </div>
            <div className="mt-2 flex gap-2">
              <Input aria-label="Custom cover URL" value={customCoverUrl} onChange={(e) => setCustomCoverUrl(e.target.value)} placeholder="https://example.com/cover.jpg" />
              <Button
                variant="secondary"
                onClick={() => {
                  const candidate = customCoverUrl.trim();
                  if (!/^https?:\/\//i.test(candidate)) {
                    setInlineMessage("Enter a valid http/https URL.");
                    return;
                  }
                  if (currentSong) {
                    setActiveReviewId(currentSong.reviewId);
                    setSelectedCover(currentSong.reviewId, candidate);
                  }
                }}
              >
                Use for this song
              </Button>
            </div>
            {inlineMessage && <p className="mt-2 text-xs text-amber-300">{inlineMessage}</p>}
          </div>
        )}

        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <Input
            aria-label="Filter reviewed songs"
            value={reviewQuery}
            onChange={(event) => setReviewQuery(event.target.value)}
            placeholder="Filter by title or artist"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span>
              Showing {filteredEditableSongs.length === 0 ? 0 : safeReviewPage * REVIEW_PAGE_SIZE + 1}-{Math.min(filteredEditableSongs.length, safeReviewPage * REVIEW_PAGE_SIZE + visibleEditableSongs.length)} of {filteredEditableSongs.length}
            </span>
            <Button type="button" size="sm" variant="secondary" onClick={() => setReviewPage((value) => Math.max(0, value - 1))} disabled={safeReviewPage === 0}>
              Previous
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setReviewPage((value) => Math.min(reviewPageCount - 1, value + 1))} disabled={safeReviewPage >= reviewPageCount - 1}>
              Next
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {visibleEditableSongs.map((song) => (
            <div
              key={song.reviewId}
              onClick={() => setActiveReviewId(song.reviewId)}
              className={`rounded-xl border p-4 transition ${song.selected ? "border-[var(--accent-border)] bg-[var(--accent-soft)]" : "border-border bg-surface opacity-60"}`}
            >
              <div className="mb-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={song.selected}
                  onChange={() => updateSong(song.reviewId, (s) => ({ ...s, selected: !s.selected }))}
                  className="h-5 w-5 cursor-pointer accent-violet-500"
                />
                <div className="text-sm font-medium">
                  {song.songName} - {song.artist}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {song.coverCandidates.map((candidate, i) => (
                  <div
                    key={`${song.reviewId}-${candidate.url}`}
                    className={`relative overflow-hidden rounded-lg border-2 ${song.selectedCoverUrl === candidate.url ? "border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]" : "border-border"}`}
                  >
                    {song.selectedCoverUrl === candidate.url ? (
                      <button
                        type="button"
                        aria-label={`Clear cover for ${song.songName}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          clearSongCover(song.reviewId);
                        }}
                        className="absolute right-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-pressed={song.selectedCoverUrl === candidate.url}
                      onClick={() => setSelectedCover(song.reviewId, candidate.url)}
                      className="block w-full overflow-hidden text-left"
                    >
                      <div className="h-16 w-full">
                        <CoverThumb url={candidate.url} alt={`${song.songName} cover option ${i + 1}`} />
                      </div>
                      <div className="truncate px-1 py-0.5 text-[10px] text-text-muted">
                        {candidate.source || `Candidate ${i + 1}`}
                      </div>
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveReviewId(song.reviewId);
                  void loadCoverOptions(song.reviewId, true);
                }}
                disabled={song.loadingCovers || !apiBaseUrl}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-60"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${song.loadingCovers ? "animate-spin" : ""}`} />
                Try different covers
              </button>
            </div>
          ))}
          {visibleEditableSongs.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface-raised p-6 text-center text-sm text-text-muted">
              No songs match this filter.
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
          {isSubmitting && submittingMessage ? <p className="mr-auto text-sm text-text-muted">{submittingMessage}</p> : null}
          <button onClick={onCancel} disabled={isSubmitting} className="rounded-lg border border-border px-5 py-2 hover:bg-surface-raised">
            {t("modal_cancel", language)}
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={selectedCount === 0 || isSubmitting}
            className="rounded-lg bg-[var(--accent)] px-5 py-2 font-medium hover:bg-[var(--accent-2)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting && submittingMessage ? submittingMessage : selectedCount > 0 ? t("modal_confirm_count", language, { count: selectedCount }) : t("modal_confirm", language)}
          </button>
        </div>
      </div>
      </div>
    </div>
  );

  return portalRoot ? createPortal(modal, portalRoot) : modal;
}
