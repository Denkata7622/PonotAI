"use client";

import { useRef, useEffect, useState } from "react";
import type { Playlist, PlaylistSong } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { Button } from "../src/components/ui/Button";
import SongRow from "./SongRow";
import NewPlaylistModal from "./NewPlaylistModal";
import { ListMusic, Plus, Trash2, X } from "../lucide-react";
import { Play } from "../lucide-react";

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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsRenaming(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRename = () => {
    if (newName.trim() && newName !== playlist.name) {
      onRenamePlaylist?.(newName.trim());
    }
    setIsRenaming(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between">
          <div className="flex-1">
            {isRenaming ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") handleRename();
                  }}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  autoFocus
                />
                <Button onClick={handleRename} size="sm">{t("track_create", language)}</Button>
                <Button onClick={() => setIsRenaming(false)} variant="secondary" size="sm">{t("modal_cancel", language)}</Button>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold text-[var(--text)]">{playlist.name}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{t("library_songs_count", language).replace("{count}", `${playlist.songs.length}`)}</p>
                {playlist.songs.length > 0 && onPlayAll ? (
                  <Button onClick={() => onPlayAll(playlist.songs)} className="mt-3">
                    <span className="inline-flex items-center gap-2"><Play className="h-[18px] w-[18px]" fill="currentColor" /> Play all ({playlist.songs.length} songs)</span>
                  </Button>
                ) : null}
                {playlist.createdAt && (
                  <p className="mt-1 text-xs text-[var(--muted)]">{new Date(playlist.createdAt).toLocaleDateString()}</p>
                )}
              </div>
            )}
          </div>

          {!isRenaming && (
            <div className="flex gap-2">
              <Button onClick={() => setIsRenaming(true)} variant="secondary" size="sm">{t("track_create", language)}</Button>
              <Button onClick={onClose} variant="secondary" size="sm">
                <X className="w-4 h-4 text-[var(--muted)]" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {playlist.songs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <ListMusic className="w-10 h-10 text-[var(--muted)]" />
              <h3 className="text-lg font-semibold text-[var(--text)]">{t("playlist_empty_heading", language)}</h3>
              <p className="text-sm text-[var(--muted)]">{t("playlist_empty_hint", language)}</p>
              <Button onClick={() => setShowAddSongsModal(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-[var(--text)]" />
                {t("playlist_add_songs", language)}
              </Button>
            </div>
          ) : (
            <div className="grid gap-2">
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
                />
              ))}
            </div>
          )}
        </div>

        {playlist.songs.length > 0 && (
          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <Button
              onClick={() => {
                if (window.confirm(`Delete playlist "${playlist.name}"?`)) {
                  onDeletePlaylist();
                  onClose();
                }
              }}
              className="w-full flex items-center justify-center gap-2 border-red-400/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
            >
              <Trash2 className="w-4 h-4 text-red-300" />
              {t("track_delete_playlist", language)}
            </Button>
          </div>
        )}
      </div>

      {showAddSongsModal && (
        <NewPlaylistModal
          existingPlaylistId={playlist.id}
          initialName={playlist.name}
          onSongsAdded={onSongsAdded}
          onToast={onToast}
          onClose={() => setShowAddSongsModal(false)}
          onCreated={() => setShowAddSongsModal(false)}
        />
      )}
    </div>
  );
}
