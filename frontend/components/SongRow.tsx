"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { EllipsisVertical, Music, Play } from "../lucide-react";
import type { Playlist } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { formatArtist } from "../lib/formatArtist";
import { usePlayer } from "./PlayerProvider";
import { useUser } from "../src/context/UserContext";
import { normalizeVisibleText } from "@/lib/text";
import SongActionsMenu from "./SongActionsMenu";

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
  onUltraLikeToggle?: () => void;
  isUltraLiked?: boolean;
  deleteLabel?: string;
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
  onUltraLikeToggle,
  isUltraLiked = false,
  deleteLabel,
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

      <div className="relative flex items-center gap-1">
        {onPlay && (
          <button
            type="button"
            onClick={onPlay}
            className="rounded-full bg-[var(--accent)] p-2.5 text-[var(--accent-foreground)] shadow-[0_0_0_1px_var(--accent-border)]"
            aria-label={actionLabel ?? t("song_row_play", language)}
            title={actionLabel ?? t("song_row_play", language)}
          >
            {actionIcon ?? <Play className="w-4 h-4 text-white" />}
          </button>
        )}

        {(showMoreMenu || onDelete || onFavorite || onUltraLikeToggle) && (
          <SongActionsMenu
            isOpen={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={<EllipsisVertical className="w-4 h-4 text-[var(--muted)]" />}
            triggerClassName="rounded-lg p-2.5 hover:bg-[var(--hover-bg)]"
            onPlay={onPlay}
            onAddToQueue={() => {
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
            }}
            onToggleFavorite={onFavorite}
            isFavorite={isFavorite}
            onUltraLikeToggle={onUltraLikeToggle}
            isUltraLiked={isUltraLiked}
            playlists={playlists}
            onAddToPlaylist={onAddToPlaylist}
            onShare={() => {
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
            isSharing={isSharing}
            onDelete={onDelete}
            deleteLabel={deleteLabel}
            deleteConfirmMessage={language === "bg" ? "Наистина ли искате да изтриете тази песен?" : "Are you sure you want to delete this song?"}
          />
        )}
      </div>
    </article>
  );
}

export type { SongRowProps };
