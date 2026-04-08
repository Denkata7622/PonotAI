"use client";

import { useState } from "react";
import Modal from "../src/components/ui/Modal";
import type { SongMatch } from "../features/recognition/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";

type EditableSong = SongMatch & {
  selected: boolean;
  editedSongName?: string;
  editedArtist?: string;
  selectedArtIndex: number;
};

type SongReviewModalProps = {
  songs: SongMatch[];
  onConfirm: (selectedSongs: SongMatch[]) => void;
  onCancel: () => void;
};

export default function SongReviewModal({ songs, onConfirm, onCancel }: SongReviewModalProps) {
  const [editableSongs, setEditableSongs] = useState<EditableSong[]>(
    songs.map((song) => ({
      ...song,
      selected: true,
      selectedArtIndex: 0,
    }))
  );
  const { language } = useLanguage();

  function toggleSelection(index: number) {
    setEditableSongs((prev) =>
      prev.map((song, i) => (i === index ? { ...song, selected: !song.selected } : song))
    );
  }

  function updateSongName(index: number, value: string) {
    setEditableSongs((prev) =>
      prev.map((song, i) => (i === index ? { ...song, editedSongName: value } : song))
    );
  }

  function updateArtist(index: number, value: string) {
    setEditableSongs((prev) =>
      prev.map((song, i) => (i === index ? { ...song, editedArtist: value } : song))
    );
  }

  function selectArtwork(index: number, artIndex: number) {
    setEditableSongs((prev) =>
      prev.map((song, i) => (i === index ? { ...song, selectedArtIndex: artIndex } : song))
    );
  }

  function handleConfirm() {
    const selected = editableSongs
      .filter((song) => song.selected)
      .map((song) => ({
        ...song,
        songName: song.editedSongName?.trim() || song.songName,
        artist: song.editedArtist?.trim() || song.artist,
        albumArtUrl: getArtworkOptions(song)[song.selectedArtIndex],
      }));
    onConfirm(selected);
  }

  function getArtworkOptions(song: EditableSong): string[] {
    const base = song.albumArtUrl;
    const artist = (song.editedArtist || song.artist).toLowerCase().replace(/\s+/g, "-");
    const songName = (song.editedSongName || song.songName).toLowerCase().replace(/\s+/g, "-");

    return [
      base,
      `https://picsum.photos/seed/${artist}-${songName}-1/300/300`,
      `https://picsum.photos/seed/${artist}-${songName}-2/300/300`,
      `https://picsum.photos/seed/${artist}-${songName}-3/300/300`,
    ];
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
                    ? "border-violet-400/40 bg-violet-500/10"
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
                    <div className="flex gap-2">
                      {artworkOptions.map((url, artIndex) => (
                        <button
                          key={artIndex}
                          onClick={() => selectArtwork(index, artIndex)}
                          className={`h-16 w-16 overflow-hidden rounded-lg border-2 transition ${
                            song.selectedArtIndex === artIndex
                              ? "border-violet-400 ring-2 ring-violet-400/50"
                              : "border-border opacity-60 hover:opacity-100"
                          }`}
                        >
                          <img src={url} alt={`Cover ${artIndex + 1}`} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs text-text-muted">{t("modal_song_name", language)}</label>
                      <input
                        type="text"
                        value={song.editedSongName ?? song.songName}
                        onChange={(e) => updateSongName(index, e.target.value)}
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
            className="rounded-lg bg-violet-600 px-5 py-2 font-medium hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
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
