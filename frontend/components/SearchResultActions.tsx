"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, ListMusic, ListPlus, Play, Plus } from "../lucide-react";
import type { Playlist } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";

type SearchResultActionsProps = {
  resultId: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPlayNow: () => void;
  onAddToQueue: () => void;
  onAddToFavorites: () => void;
  onAddToPlaylist: (playlistId: string) => void;
  playlists: Playlist[];
  onGoToLibrary: () => void;
};

export default function SearchResultActions({
  resultId,
  isOpen,
  onToggle,
  onClose,
  onPlayNow,
  onAddToQueue,
  onAddToFavorites,
  onAddToPlaylist,
  playlists,
  onGoToLibrary,
}: SearchResultActionsProps) {
  const { language } = useLanguage();
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [justFavorited, setJustFavorited] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setShowPlaylists(false);
      return;
    }

    function onOutsideMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      onClose();
    }

    const buttonRect = buttonRef.current?.getBoundingClientRect();
    if (buttonRect) {
      setOpenAbove(buttonRect.top > window.innerHeight / 2);
    }

    window.addEventListener("mousedown", onOutsideMouseDown);
    return () => window.removeEventListener("mousedown", onOutsideMouseDown);
  }, [isOpen, onClose]);

  return (
    <div className="relative" data-result-actions={resultId}>
      <button
        ref={buttonRef}
        type="button"
        className="rounded-full border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onToggle}
        aria-label={t("track_more_options", language)}
      >
        <Plus className="w-4 h-4 text-[var(--text)]" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={`absolute right-0 z-[9999] min-w-48 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1 shadow-2xl ${openAbove ? "bottom-11" : "top-11"}`}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--hover-bg)]"
            onClick={() => {
              onPlayNow();
              onClose();
            }}
          >
            <Play className="w-4 h-4 text-[var(--muted)]" />
            {t("search_play_now", language)}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--hover-bg)]"
            onClick={() => {
              onAddToQueue();
              onClose();
            }}
          >
            <ListMusic className="w-4 h-4 text-[var(--muted)]" />
            {t("search_add_to_queue", language)}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--hover-bg)]"
            onClick={() => {
              onAddToFavorites();
              setJustFavorited(true);
              window.setTimeout(() => setJustFavorited(false), 800);
            }}
          >
            <Heart className={`w-4 h-4 ${justFavorited ? "fill-current text-rose-500" : "text-[var(--muted)]"}`} />
            {t("search_add_to_favorites", language)}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--hover-bg)]"
            onClick={() => setShowPlaylists((prev) => !prev)}
          >
            <ListPlus className="w-4 h-4 text-[var(--muted)]" />
            {t("search_add_to_playlist", language)}
          </button>
          {showPlaylists && (
            <div className="mt-1 border-t border-[var(--border)] pt-1">
              {playlists.length === 0 ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[var(--hover-bg)]"
                  onClick={() => {
                    onGoToLibrary();
                    onClose();
                  }}
                >
                  <Plus className="w-4 h-4 text-[var(--muted)]" />
                  {t("search_no_playlists", language)}
                </button>
              ) : (
                playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--hover-bg)]"
                    onClick={() => {
                      onAddToPlaylist(playlist.id);
                      onClose();
                    }}
                  >
                    {playlist.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
