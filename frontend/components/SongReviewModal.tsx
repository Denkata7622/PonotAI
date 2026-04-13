"use client";

import { useEffect, useState } from "react";
import Modal from "../src/components/ui/Modal";
import type { SongMatch } from "../features/recognition/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { RotateCcw } from "../lucide-react";
import { getApiBaseUrl } from "../lib/apiConfig";

type EditableSong = SongMatch & {
  selected: boolean;
  editedSongName?: string;
  editedArtist?: string;
  selectedArtIndex: number;
  coverOptions: string[];
  loadingCovers: boolean;
};

type SongReviewModalProps = {
  songs: SongMatch[];
  onConfirm: (selectedSongs: SongMatch[]) => void;
  onCancel: () => void;
};

export default function SongReviewModal({ songs, onConfirm, onCancel }: SongReviewModalProps) {
  const apiBaseUrl = getApiBaseUrl();
  const [editableSongs, setEditableSongs] = useState<EditableSong[]>(
    songs.map((song) => ({
      ...song,
      selected: true,
      selectedArtIndex: 0,
      coverOptions: song.albumArtUrl ? [song.albumArtUrl] : [],
      loadingCovers: false,
    })),
  );
  const { language } = useLanguage();

  useEffect(() => {
    songs.forEach((_, index) => {
      void loadCoverOptions(index, false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSelection(index: number) {
    setEditableSongs((prev) =>
      prev.map((song, i) => (i === index ? { ...song, selected: !song.selected } : song)),
    );
  }

  function updateSongName(index: number, value: string) {
    setEditableSongs((prev) =>
      prev.map((song, i) => (i === index ? { ...song, editedSongName: value } : song)),
    );
  }

  function updateArtist(index: number, value: string) {
    setEditableSongs((prev) =>
      prev.map((song, i) => (i === index ? { ...song, editedArtist: value } : song)),
    );
  }

  function selectArtwork(index: number, artIndex: number) {
    setEditableSongs((prev) =>
      prev.map((song, i) => (i === index ? { ...song, selectedArtIndex: artIndex } : song)),
    );
  }

  async function loadCoverOptions(index: number, useExclude: boolean) {
    const target = editableSongs[index];
    if (!target) return;

    const title = encodeURIComponent(target.editedSongName?.trim() || target.songName);
    const artist = encodeURIComponent(target.editedArtist?.trim() || target.artist);
    const excludeQuery = useExclude && target.coverOptions.length > 0
      ? `&exclude=${encodeURIComponent(target.coverOptions.join(","))}`
      : "";

    setEditableSongs((prev) => prev.map((song, i) => (i === index ? { ...song, loadingCovers: true } : song)));
    try {
      const response = await fetch(`${apiBaseUrl}/api/cover-art?title=${title}&artist=${artist}${excludeQuery}`);
      if (!response.ok) return;
      const payload = (await response.json()) as { covers?: Array<{ url: string }> };
      const coverUrls = (payload.covers ?? []).map((cover) => cover.url).slice(0, 4);
      if (coverUrls.length === 0) return;

      setEditableSongs((prev) => prev.map((song, i) => (
        i === index
          ? { ...song, coverOptions: coverUrls, selectedArtIndex: 0 }
          : song
      )));
    } catch {
      // Keep existing artwork options if lookup fails.
    } finally {
      setEditableSongs((prev) => prev.map((song, i) => (i === index ? { ...song, loadingCovers: false } : song)));
    }
  }

  function handleConfirm() {
    const selected = editableSongs
      .filter((song) => song.selected)
      .map((song) => ({
        ...song,
        songName: song.editedSongName?.trim() || song.songName,
        artist: song.editedArtist?.trim() || song.artist,
        albumArtUrl: getArtworkOptions(song)[song.selectedArtIndex] || song.albumArtUrl,
      }));
    onConfirm(selected);
  }

  function getArtworkOptions(song: EditableSong): string[] {
    if (song.coverOptions.length > 0) {
      return song.coverOptions;
    }
    return song.albumArtUrl ? [song.albumArtUrl] : [];
  }

  const selectedCount = editableSongs.filter((s) => s.selected).length;

  return (
    <Modal isOpen onClose={onCancel} title={t("modal_review_title", language)} maxWidth="960px">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="mb-6 text-sm text-text-muted">
          {t("modal_selected_count", language, { selected: selectedCount, total: editableSongs.length })}
        </p>

        <div className="space-y-4">
          {editableSongs.map((song, index) => {
            const artworkOptions = getArtworkOptions(song);

            return (
              <div
                key={index}
                className={`rounded-xl border p-4 transition ${
                  song.selected
                    ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
                    : "border-border bg-surface opacity-60"
                }`}
              >
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={song.selected}
                    onChange={() => toggleSelection(index)}
                    className="mt-1 h-5 w-5 cursor-pointer accent-violet-500"
                  />

                  <div>
                    <p className="mb-2 text-xs text-text-muted">{t("modal_choose_cover", language)}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {song.loadingCovers && artworkOptions.length === 0
                        ? Array.from({ length: 4 }).map((_, artIndex) => (
                          <div
                            key={artIndex}
                            className="h-16 w-16 animate-pulse rounded-lg border border-border bg-surface-overlay"
                          />
                        ))
                        : artworkOptions.map((url, artIndex) => (
                          <button
                            key={url}
                            onClick={() => selectArtwork(index, artIndex)}
                            className={`h-16 w-16 overflow-hidden rounded-lg border-2 transition ${
                              song.selectedArtIndex === artIndex
                                ? "border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]"
                                : "border-border opacity-60 hover:opacity-100"
                            }`}
                          >
                            <img src={url} alt={`Cover ${artIndex + 1}`} className="h-full w-full object-cover" />
                          </button>
                        ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadCoverOptions(index, true)}
                      disabled={song.loadingCovers}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-60"
                    >
                      <RotateCcw className={`h-3.5 w-3.5 ${song.loadingCovers ? "animate-spin" : ""}`} />
                      Try different covers
                    </button>
                  </div>

                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs text-text-muted">{t("modal_song_name", language)}</label>
                      <input
                        type="text"
                        value={song.editedSongName ?? song.songName}
                        onChange={(e) => updateSongName(index, e.target.value)}
                        onBlur={() => void loadCoverOptions(index, false)}
                        disabled={!song.selected}
                        className="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-text-muted">{t("modal_artist", language)}</label>
                      <input
                        type="text"
                        value={song.editedArtist ?? song.artist}
                        onChange={(e) => updateArtist(index, e.target.value)}
                        onBlur={() => void loadCoverOptions(index, false)}
                        disabled={!song.selected}
                        className="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-5 py-2 hover:bg-surface-raised"
          >
            {t("modal_cancel", language)}
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className="rounded-lg bg-[var(--accent)] px-5 py-2 font-medium hover:bg-[var(--accent-2)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {selectedCount > 0
              ? t("modal_confirm_count", language, { count: selectedCount })
              : t("modal_confirm", language)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
