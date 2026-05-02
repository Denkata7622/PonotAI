"use client";

import type { Playlist } from "../features/library/types";
import { EllipsisVertical, ListMusic, Play, Plus } from "../lucide-react";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import SongActionsMenu from "./SongActionsMenu";
import { useState } from "react";
import { Button } from "../src/components/ui/Button";

type PlaylistCardProps = {
  playlist: Playlist;
  onClick: (playlist: Playlist) => void;
  onDelete?: (playlistId: string) => void;
  onPlay?: (playlist: Playlist) => void;
  onAddToQueue?: (playlist: Playlist) => void;
  onRename?: (playlist: Playlist) => void;
  showSongPreview?: boolean;
};

function PlaylistCoverPreview({ playlist }: { playlist: Playlist }) {
  const previewSongs = playlist.songs.slice(0, 4);

  if (previewSongs.length === 0) {
    return (
      <div className="grid h-16 w-16 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
        <ListMusic className="h-5 w-5 text-[var(--muted)]" />
      </div>
    );
  }

  return (
    <div className="grid h-16 w-16 grid-cols-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
      {previewSongs.map((song, index) => (
        <div key={`${song.title}-${song.artist}-${index}`} className="bg-[var(--surface-2)]">
          {song.coverUrl ? (
            <img src={song.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <ListMusic className="h-3.5 w-3.5 text-[var(--muted)]" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function PlaylistCard({
  playlist,
  onClick,
  onDelete,
  onPlay,
  onAddToQueue,
  onRename,
  showSongPreview = true,
}: PlaylistCardProps) {
  const { language } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 md:p-5">
      <div className="flex items-start gap-3">
        <PlaylistCoverPreview playlist={playlist} />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onClick(playlist)}
            className="w-full text-left"
            aria-label={`${t("btn_open", language)} ${playlist.name}`}
          >
            <p className="truncate text-base font-semibold text-[var(--text)]">{playlist.name}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t("library_songs_count", language, { count: playlist.songs.length })}
            </p>
            {showSongPreview && playlist.songs.length > 0 ? (
              <p className="mt-2 truncate text-xs text-[var(--muted)]">
                {playlist.songs[0]?.title} • {playlist.songs[0]?.artist}
              </p>
            ) : null}
          </button>
        </div>
        {(onDelete || onAddToQueue || onRename) ? (
          <SongActionsMenu
            isOpen={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={<EllipsisVertical className="h-4 w-4 text-[var(--muted)]" />}
            onAddToQueue={onAddToQueue ? () => onAddToQueue(playlist) : undefined}
            onRename={onRename ? () => onRename(playlist) : undefined}
            renameLabel={t("playlist_rename", language)}
            onDelete={onDelete ? () => onDelete(playlist.id) : undefined}
            deleteLabel={t("track_delete_playlist", language)}
            deleteConfirmMessage={
              language === "bg"
                ? `Да изтрия ли плейлист \"${playlist.name}\"?`
                : `Delete playlist \"${playlist.name}\"?`
            }
            stopParentActivation
          />
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button
          variant="primary"
          className="justify-center sm:px-3"
          onClick={() => onPlay?.(playlist)}
          disabled={playlist.songs.length === 0}
          aria-label={t("song_row_play", language)}
          title={t("song_row_play", language)}
        >
          <Play className="h-4 w-4" fill="currentColor" />
        </Button>
        <Button
          variant="secondary"
          className="justify-center sm:px-3"
          onClick={() => onAddToQueue?.(playlist)}
          disabled={playlist.songs.length === 0}
          aria-label={t("btn_add_to_queue", language)}
          title={t("btn_add_to_queue", language)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}
