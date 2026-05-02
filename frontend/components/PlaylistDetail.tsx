"use client";

import { useState } from "react";
import type { Playlist, PlaylistSong } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { Button } from "../src/components/ui/Button";
import Modal from "../src/components/ui/Modal";
import SongRow from "./SongRow";
import NewPlaylistModal from "./NewPlaylistModal";
import { ListMusic, Play, Plus, Trash2, X } from "../lucide-react";

type PlaylistDetailProps = {
  playlist: Playlist;
  onClose: () => void;
  onPlaySong: (song: PlaylistSong) => void;
  onRemoveSong: (title: string, artist: string) => void;
  onSongsAdded?: (playlistId: string, songs: PlaylistSong[]) => void | Promise<void>;
  onToast?: (kind: "success" | "error", message: string) => void;
  onDeletePlaylist: () => void;
  onRenamePlaylist?: (newName: string) => void;
  onPlayAll?: (songs: PlaylistSong[]) => void;
};

export default function PlaylistDetail({
  playlist,
  onClose,
  onPlaySong,
  onRemoveSong,
  onSongsAdded,
  onToast,
  onDeletePlaylist,
  onRenamePlaylist,
  onPlayAll,
}: PlaylistDetailProps) {
  const { language } = useLanguage();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(playlist.name);
  const [showAddSongsModal, setShowAddSongsModal] = useState(false);

  const handleRename = () => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== playlist.name) {
      onRenamePlaylist?.(trimmed);
    }
    setIsRenaming(false);
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="960px">
      <div className="max-h-[80vh] w-full overflow-auto p-1">
        <header className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              {isRenaming ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleRename();
                    }}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleRename} size="sm">{t("playlist_rename", language)}</Button>
                    <Button onClick={() => setIsRenaming(false)} variant="secondary" size="sm">{t("modal_cancel", language)}</Button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="truncate text-xl font-semibold text-[var(--text)] sm:text-2xl">{playlist.name}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {t("library_songs_count", language, { count: playlist.songs.length })}
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {onPlayAll ? (
                <Button onClick={() => onPlayAll(playlist.songs)} variant="primary" disabled={playlist.songs.length === 0}>
                  <span className="inline-flex items-center gap-1.5"><Play className="h-4 w-4" fill="currentColor" />{t("playlist_play_all", language)}</span>
                </Button>
              ) : null}
              <Button onClick={() => setShowAddSongsModal(true)} size="sm" className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4 text-white" />{t("playlist_add_songs", language)}
              </Button>
              {onRenamePlaylist ? (
                <Button onClick={() => setIsRenaming(true)} variant="secondary" size="sm">
                  <span className="inline-flex items-center gap-1.5">{t("playlist_rename", language)}</span>
                </Button>
              ) : null}
              <Button onClick={onClose} variant="secondary" size="sm" aria-label={t("modal_close", language)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {playlist.songs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] py-12 text-center">
            <ListMusic className="h-10 w-10 text-[var(--muted)]" />
            <h3 className="text-lg font-semibold text-[var(--text)]">{t("playlist_empty_heading", language)}</h3>
            <p className="text-sm text-[var(--muted)]">{t("playlist_empty_hint", language)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {playlist.songs.map((song, idx) => (
              <SongRow
                key={`${song.title}-${song.artist}-${idx}`}
                id={`${song.title}-${song.artist}-${idx}`}
                title={song.title}
                artist={song.artist}
                artworkUrl={song.coverUrl}
                videoId={song.videoId}
                onPlay={() => onPlaySong(song)}
                onDelete={() => onRemoveSong(song.title, song.artist)}
                deleteLabel={t("track_remove_from_playlist", language)}
                showMoreMenu
              />
            ))}
          </div>
        )}

        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <Button
            onClick={() => {
              if (window.confirm(language === "bg" ? `Да изтрия ли плейлист \"${playlist.name}\"?` : `Delete playlist \"${playlist.name}\"?`)) {
                onDeletePlaylist();
                onClose();
              }
            }}
            className="w-full justify-center border-red-400/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
          >
            <span className="inline-flex items-center gap-1.5"><Trash2 className="h-4 w-4" />{t("track_delete_playlist", language)}</span>
          </Button>
        </div>
      </div>

      {showAddSongsModal ? (
        <NewPlaylistModal
          existingPlaylistId={playlist.id}
          initialName={playlist.name}
          onSongsAdded={onSongsAdded}
          onToast={onToast}
          onClose={() => setShowAddSongsModal(false)}
          onCreated={() => setShowAddSongsModal(false)}
        />
      ) : null}
    </Modal>
  );
}
