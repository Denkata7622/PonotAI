"use client";

import { useEffect, useState } from "react";
import { Heart, ListMusic, ListPlus, Play, Plus } from "../lucide-react";
import type { Playlist } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import SmartDropdown from "@/components/ui/SmartDropdown";

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
  const [playlistSubmitId, setPlaylistSubmitId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setShowPlaylists(false);
  }, [isOpen]);

  return (
    <div className="relative" data-result-actions={resultId}>
      <SmartDropdown
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setShowPlaylists(false);
            onClose();
            return;
          }
          onToggle();
        }}
        placement="bottom-start"
        className="min-w-48 p-1"
        trigger={(
          <button
            type="button"
            className="rounded-full border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]"
            onMouseDown={(event) => event.preventDefault()}
            aria-label={t("track_more_options", language)}
          >
            <Plus className="w-4 h-4 text-[var(--text)]" />
          </button>
        )}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--hover-bg)]"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPlayNow();
            setShowPlaylists(false);
            onClose();
          }}
        >
          <Play className="w-4 h-4 text-[var(--muted)]" />
          {t("search_play_now", language)}
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--hover-bg)]"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onAddToQueue();
            setShowPlaylists(false);
            onClose();
          }}
        >
          <ListMusic className="w-4 h-4 text-[var(--muted)]" />
          {t("search_add_to_queue", language)}
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--hover-bg)]"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
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
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setShowPlaylists((prev) => !prev);
          }}
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
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
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
                  disabled={playlistSubmitId === playlist.id}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--hover-bg)]"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (playlistSubmitId) return;
                    setPlaylistSubmitId(playlist.id);
                    Promise.resolve(onAddToPlaylist(playlist.id)).finally(() => {
                      setPlaylistSubmitId(null);
                    });
                    setShowPlaylists(false);
                    onClose();
                  }}
                >
                  {playlist.name}
                </button>
              ))
            )}
          </div>
        )}
      </SmartDropdown>
    </div>
  );
}
