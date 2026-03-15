"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Heart, EllipsisVertical, Music, Play, Trash2 } from "../lucide-react";
import type { Playlist } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";

type SongRowProps = {
  id: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  videoId?: string;
  onPlay?: () => void;
  actionIcon?: ReactNode;
  actionLabel?: string;
  onDelete?: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  onAddToPlaylist?: (playlistId: string) => void;
  showMoreMenu?: boolean;
  playlists?: Playlist[];
  isHighlighted?: boolean;
  className?: string;
};

export default function SongRow({
  id,
  title,
  artist,
  artworkUrl,
  onPlay,
  actionIcon,
  actionLabel,
  onDelete,
  onFavorite,
  isFavorite = false,
  onAddToPlaylist,
  showMoreMenu = false,
  playlists = [],
  isHighlighted = false,
  className = "",
}: SongRowProps) {
  const { language } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      return () => document.removeEventListener("mousedown", handleOutsideClick);
    }
  }, [menuOpen]);

  return (
    <article
      data-song-id={id}
      className={`group relative flex w-full items-center gap-3 rounded-2xl border bg-[var(--surface)] p-3 transition-all duration-200 hover:border-[color:var(--accent)]/50 hover:bg-[var(--surface-2)] ${
        isHighlighted
          ? "border-[var(--accent)] border-l-[3px]"
          : "border-[var(--border)]"
      } ${className}`}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
        {artworkUrl ? (
          <img src={artworkUrl} alt={`${title} cover`} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[var(--surface-2)]">
            <Music className="w-6 h-6 text-[var(--muted)]" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-[var(--text)]">{title}</p>
        <p className="truncate text-sm text-[var(--muted)]">{artist}</p>
      </div>

      <div className="relative flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" ref={menuRef}>
        {onFavorite && (
          <button
            type="button"
            onClick={onFavorite}
            className="rounded-lg p-2 hover:bg-[var(--hover-bg)]"
            aria-label={isFavorite ? t("song_row_unfavorite", language) : t("song_row_favorite", language)}
            title={isFavorite ? t("song_row_unfavorite", language) : t("song_row_favorite", language)}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? "fill-current text-[var(--accent)]" : "text-[var(--muted)]"}`} />
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-2 hover:bg-[var(--hover-bg)]"
            aria-label={t("song_row_delete", language)}
            title={t("song_row_delete", language)}
          >
            <Trash2 className="w-4 h-4 text-[var(--muted)]" />
          </button>
        )}

        {onPlay && (
          <button
            type="button"
            onClick={onPlay}
            className="rounded-full bg-[var(--accent)] p-2 text-white"
            aria-label={actionLabel ?? t("song_row_play", language)}
            title={actionLabel ?? t("song_row_play", language)}
          >
            {actionIcon ?? <Play className="w-4 h-4 text-white" />}
          </button>
        )}

        {showMoreMenu && (
          <>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="rounded-lg p-2 hover:bg-[var(--hover-bg)]"
              aria-label={t("track_more_options", language)}
              title={t("track_more_options", language)}
            >
              <EllipsisVertical className="w-4 h-4 text-[var(--muted)]" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-10 z-20 min-w-52 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2 shadow-2xl">
                <p className="px-2 py-1 text-xs text-[var(--muted)]">{t("song_row_add_to_playlist", language)}</p>
                {playlists.length === 0 && (
                  <p className="px-2 py-1 text-xs text-[var(--muted)]">{t("no_playlists_created", language)}</p>
                )}
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]"
                    onClick={() => {
                      onAddToPlaylist?.(playlist.id);
                      setMenuOpen(false);
                    }}
                  >
                    {playlist.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

export type { SongRowProps };
