"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Heart, EllipsisVertical, Music, Play, Trash2, ListPlus, Share2 } from "../lucide-react";
import type { Playlist } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { formatArtist } from "../lib/formatArtist";
import { usePlayer } from "./PlayerProvider";
import SmartDropdown from "@/src/components/ui/SmartDropdown";
import { useUser } from "../src/context/UserContext";
import { normalizeVisibleText } from "@/lib/text";

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
  videoId,
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
  const { addToQueue } = usePlayer();
  const { isAuthenticated, shareSong } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const safeTitle = normalizeVisibleText(title) || title;
  const safeArtist = normalizeVisibleText(artist) || artist;

  return (
    <article
      data-song-id={id}
      className={`group relative flex w-full items-center gap-3 rounded-2xl border bg-[var(--surface)] p-3 transition-[transform,border-color] duration-150 hover:translate-x-1 hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)] ${
        isHighlighted
          ? "themed-selected border-l-[3px]"
          : "border-[var(--border)]"
      } ${className}`}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
        {artworkUrl ? (
          <img src={artworkUrl} alt={`${safeTitle} cover`} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[var(--surface-2)]">
            <Music className="w-6 h-6 text-[var(--muted)]" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-[var(--text)]">{safeTitle}</p>
        <p className="truncate text-sm text-[var(--muted)]">{formatArtist(safeArtist)}</p>
      </div>

      <div className="relative flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
            className="rounded-full bg-[var(--accent)] p-2 text-[var(--accent-foreground)] shadow-[0_0_0_1px_var(--accent-border)]"
            aria-label={actionLabel ?? t("song_row_play", language)}
            title={actionLabel ?? t("song_row_play", language)}
          >
            {actionIcon ?? <Play className="w-4 h-4 text-white" />}
          </button>
        )}

        {showMoreMenu && (
          <SmartDropdown
            isOpen={menuOpen}
            onOpenChange={setMenuOpen}
            placement="bottom-start"
            className="min-w-52 p-2"
            trigger={(
              <button
                type="button"
                className="rounded-lg p-2 hover:bg-[var(--hover-bg)]"
                aria-label={t("track_more_options", language)}
                title={t("track_more_options", language)}
              >
                <EllipsisVertical className="w-4 h-4 text-[var(--muted)]" />
              </button>
            )}
          >
            {onPlay && (
              <button
                type="button"
                className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onPlay();
                  setMenuOpen(false);
                }}
              >
                <Play className="h-[15px] w-[15px]" /> {t("song_row_play", language)}
              </button>
            )}
            <button
              type="button"
              className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                addToQueue({
                  id,
                  title: safeTitle,
                  artist: safeArtist,
                  artistId: `artist-${safeArtist}`.toLowerCase().replace(/\s+/g, "-"),
                  artworkUrl: artworkUrl || "https://picsum.photos/seed/song-row/80",
                  videoId,
                  license: "COPYRIGHTED",
                  query: `${safeTitle} ${safeArtist}`,
                }, "manual");
                window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: "Added to queue" } }));
                setMenuOpen(false);
              }}
            >
              <ListPlus className="h-[15px] w-[15px]" /> {t("btn_add_to_queue", language)}
            </button>
            {onFavorite && (
              <button
                type="button"
                className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onFavorite();
                  setMenuOpen(false);
                }}
              >
                <Heart className={`h-[15px] w-[15px] ${isFavorite ? "fill-current text-[var(--accent)]" : ""}`} />
                {isFavorite ? t("song_row_unfavorite", language) : t("song_row_favorite", language)}
              </button>
            )}
            <div className="my-1 h-px bg-[var(--border)]" />
            <p className="px-2 py-1 text-xs text-[var(--muted)]">{t("song_row_add_to_playlist", language)}</p>
            {playlists.length === 0 && (
              <p className="px-2 py-1 text-xs text-[var(--muted)]">{t("no_playlists_created", language)}</p>
            )}
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onAddToPlaylist?.(playlist.id);
                  setMenuOpen(false);
                }}
              >
                {playlist.name}
              </button>
            ))}
            <div className="my-1 h-px bg-[var(--border)]" />
            <button
              type="button"
              disabled={isSharing}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)] disabled:opacity-60"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!isAuthenticated) {
                  window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: language === "bg" ? "Влез, за да споделяш песни." : "Sign in to share songs." } }));
                  setMenuOpen(false);
                  return;
                }
                if (isSharing) return;
                setIsSharing(true);
                void shareSong({ title: safeTitle, artist: safeArtist, coverUrl: artworkUrl }).then((url) => {
                  if (url) {
                    void navigator.clipboard.writeText(url);
                    window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: language === "bg" ? "Линкът е копиран." : "Share link copied." } }));
                  }
                }).catch(() => {
                  window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: language === "bg" ? "Споделянето е неуспешно." : "Sharing failed." } }));
                }).finally(() => {
                  setIsSharing(false);
                  setMenuOpen(false);
                });
              }}
            >
              <Share2 className="h-[15px] w-[15px]" /> {t("track_share_song", language)}
            </button>
          </SmartDropdown>
        )}
      </div>
    </article>
  );
}

export type { SongRowProps };
