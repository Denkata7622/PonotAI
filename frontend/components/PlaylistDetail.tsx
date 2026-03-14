import { useRef, useEffect, useState } from "react";
import type { Playlist, PlaylistSong } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { Button } from "../src/components/ui/Button";
import PlaylistSongCard from "./PlaylistSongCard";

type PlaylistDetailProps = {
  playlist: Playlist;
  onClose: () => void;
  onPlaySong: (song: PlaylistSong) => void;
  onRemoveSong: (title: string, artist: string) => void;
  onDeletePlaylist: () => void;
  onRenamePlaylist?: (newName: string) => void;
};

export default function PlaylistDetail({
  playlist,
  onClose,
  onPlaySong,
  onRemoveSong,
  onDeletePlaylist,
  onRenamePlaylist,
}: PlaylistDetailProps) {
  const { language } = useLanguage();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(playlist.name);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        {/* Header */}
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
                <Button onClick={handleRename} size="sm">
                  Save
                </Button>
                <Button onClick={() => setIsRenaming(false)} variant="secondary" size="sm">
                  Cancel
                </Button>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold text-[var(--text)]">
                  {playlist.name}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {playlist.songs.length} {playlist.songs.length === 1 ? "song" : "songs"}
                </p>
                {playlist.createdAt && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Created {new Date(playlist.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </div>

          {!isRenaming && (
            <div className="flex gap-2">
              <Button
                onClick={() => setIsRenaming(true)}
                variant="secondary"
                size="sm"
              >
                ✏️ Rename
              </Button>
              <Button onClick={onClose} variant="secondary" size="sm">
                ✕
              </Button>
            </div>
          )}
        </div>

        {/* Songs Grid */}
        <div className="space-y-2">
          {playlist.songs.length === 0 ? (
            <p className="py-8 text-center text-[var(--muted)]">
              No songs in this playlist yet
            </p>
          ) : (
            <div className="grid gap-2">
              {playlist.songs.map((song, idx) => (
                <PlaylistSongCard
                  key={`${song.title}-${song.artist}-${idx}`}
                  song={song}
                  index={idx}
                  onPlay={onPlaySong}
                  onRemove={onRemoveSong}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {playlist.songs.length > 0 && (
          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <Button
              onClick={() => {
                if (
                  window.confirm(
                    `Delete playlist "${playlist.name}"? This cannot be undone.`
                  )
                ) {
                  onDeletePlaylist();
                  onClose();
                }
              }}
              className="w-full border-red-400/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
            >
              🗑️ Delete Playlist
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
