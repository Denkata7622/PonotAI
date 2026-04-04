"use client";

import type { Playlist } from "../features/library/types";
import { Trash2 } from "./icons";
import { Play } from "../lucide-react";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";

type PlaylistCardProps = {
  playlist: Playlist;
  onClick: (playlist: Playlist) => void;
  onDelete?: (playlistId: string) => void;
  onPlay?: (playlist: Playlist) => void;
  showSongPreview?: boolean;
};

export default function PlaylistCard({
  playlist,
  onClick,
  onDelete,
  onPlay,
  showSongPreview = true,
}: PlaylistCardProps) {
  const { language } = useLanguage();

  return (
    <div
      onClick={() => onClick(playlist)}
      className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)] cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[var(--text)]">{playlist.name}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t("library_songs_count", language, { count: playlist.songs.length })}
          </p>

          {showSongPreview && playlist.songs.length > 0 && (
            <div className="mt-3 space-y-1">
              {playlist.songs.slice(0, 2).map((song, index) => (
                <p key={`${song.title}-${song.artist}-${index}`} className="truncate text-xs text-[var(--muted)]">
                  {song.title} • {song.artist}
                </p>
              ))}
            </div>
          )}
        </div>

        {onDelete && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(playlist.id);
            }}
            className="rounded-lg border border-red-400/40 p-2 text-red-300 transition hover:bg-red-500/10"
            aria-label={t("track_delete_playlist", language)}
            title={t("track_delete_playlist", language)}
          >
            <Trash2 className="w-4 h-4 text-red-300" />
          </button>
        )}
        {onPlay && playlist.songs.length > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPlay(playlist);
            }}
            className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white md:opacity-0 md:transition md:group-hover:opacity-100"
          >
            <span className="inline-flex items-center gap-1"><Play className="h-4 w-4" fill="currentColor" /> Play</span>
          </button>
        )}
      </div>
    </div>
  );
}
