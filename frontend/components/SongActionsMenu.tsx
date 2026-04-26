"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Heart, ListPlus, Play, Share2, Trash2 } from "../lucide-react";
import type { Playlist } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { stopSearchDropdownNestedEvent } from "../lib/searchDropdownEvents";
import SmartDropdown from "@/src/components/ui/SmartDropdown";

type SongActionsMenuProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  triggerClassName?: string;
  menuClassName?: string;
  onPlay?: () => void;
  onAddToQueue?: () => void;
  onSaveToLibrary?: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
  playlists?: Playlist[];
  onAddToPlaylist?: (playlistId: string) => void;
  onShare?: () => void;
  isSharing?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
  deleteConfirmMessage?: string;
  stopParentActivation?: boolean;
};

export default function SongActionsMenu({
  isOpen,
  onOpenChange,
  trigger,
  triggerClassName = "rounded-lg p-2 hover:bg-[var(--hover-bg)]",
  menuClassName = "min-w-52 p-2",
  onPlay,
  onAddToQueue,
  onSaveToLibrary,
  onToggleFavorite,
  isFavorite = false,
  playlists = [],
  onAddToPlaylist,
  onShare,
  isSharing = false,
  onDelete,
  deleteLabel,
  deleteConfirmMessage,
  stopParentActivation = false,
}: SongActionsMenuProps) {
  const { language } = useLanguage();
  const [showPlaylists, setShowPlaylists] = useState(false);
  const maybeStopParentActivation = (event: { stopPropagation: () => void; preventDefault?: () => void }, preventDefault = true) => {
    if (!stopParentActivation) return;
    stopSearchDropdownNestedEvent(event, preventDefault);
  };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("trackly-song-menu-toggle", { detail: { open: isOpen } }));
    if (!isOpen) setShowPlaylists(false);
    return () => {
      window.dispatchEvent(new CustomEvent("trackly-song-menu-toggle", { detail: { open: false } }));
    };
  }, [isOpen]);

  return (
    <SmartDropdown
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="bottom-start"
      className={menuClassName}
      trigger={(
        <button
          type="button"
          className={triggerClassName}
          onPointerDown={(event) => {
            maybeStopParentActivation(event);
          }}
          onMouseDown={(event) => {
            maybeStopParentActivation(event);
          }}
          aria-label={t("track_more_options", language)}
          title={t("track_more_options", language)}
        >
          {trigger}
        </button>
      )}
    >
      {onPlay && (
        <button
          type="button"
          className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]"
          onClick={(event) => {
            maybeStopParentActivation(event);
            onPlay();
            onOpenChange(false);
          }}
        >
          <Play className="h-[15px] w-[15px]" /> {t("song_row_play", language)}
        </button>
      )}
      {onAddToQueue && (
        <button
          type="button"
          className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]"
          onClick={(event) => {
            maybeStopParentActivation(event);
            onAddToQueue();
            onOpenChange(false);
          }}
        >
          <ListPlus className="h-[15px] w-[15px]" /> {t("btn_add_to_queue", language)}
        </button>
      )}
      {onSaveToLibrary && (
        <button
          type="button"
          className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]"
          onClick={(event) => {
            maybeStopParentActivation(event);
            onSaveToLibrary();
            onOpenChange(false);
          }}
        >
          <Heart className="h-[15px] w-[15px]" /> {t("btn_save", language)}
        </button>
      )}
      {onToggleFavorite && (
        <button
          type="button"
          className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]"
          onClick={(event) => {
            maybeStopParentActivation(event);
            onToggleFavorite();
            onOpenChange(false);
          }}
        >
          <Heart className={`h-[15px] w-[15px] ${isFavorite ? "fill-current text-[var(--accent)]" : ""}`} />
          {isFavorite ? t("song_row_unfavorite", language) : t("song_row_favorite", language)}
        </button>
      )}
      {onAddToPlaylist && (
        <>
          <div className="my-1 h-px bg-[var(--border)]" />
          <button
            type="button"
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]"
            onClick={(event) => {
              maybeStopParentActivation(event);
              setShowPlaylists((prev) => !prev);
            }}
          >
            <ListPlus className="h-[15px] w-[15px]" /> {t("song_row_add_to_playlist", language)}
          </button>
          {showPlaylists && (
            <>
              {playlists.length === 0 && (
                <p className="px-2 py-1 text-xs text-[var(--muted)]">{t("no_playlists_created", language)}</p>
              )}
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]"
                  onClick={(event) => {
                    maybeStopParentActivation(event);
                    onAddToPlaylist(playlist.id);
                    onOpenChange(false);
                  }}
                >
                  {playlist.name}
                </button>
              ))}
            </>
          )}
        </>
      )}
      {onShare && (
        <>
          <div className="my-1 h-px bg-[var(--border)]" />
          <button
            type="button"
            disabled={isSharing}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--hover-bg)] disabled:opacity-60"
            onClick={(event) => {
              maybeStopParentActivation(event);
              onShare();
            }}
          >
            <Share2 className="h-[15px] w-[15px]" /> {t("track_share_song", language)}
          </button>
        </>
      )}
      {onDelete && (
        <>
          <div className="my-1 h-px bg-[var(--border)]" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-red-500 hover:bg-red-500/10"
            onClick={(event) => {
              maybeStopParentActivation(event);
              const confirmed = window.confirm(deleteConfirmMessage ?? (language === "bg" ? "Сигурни ли сте, че искате да изтриете това?" : "Are you sure you want to delete this?"));
              if (!confirmed) return;
              onDelete();
              onOpenChange(false);
            }}
          >
            <Trash2 className="h-[15px] w-[15px]" /> {deleteLabel ?? t("song_row_delete", language)}
          </button>
        </>
      )}
    </SmartDropdown>
  );
}

export type { SongActionsMenuProps };
