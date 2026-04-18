"use client";

import { EllipsisVertical, Plus } from "../lucide-react";
import type { Playlist } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import SongActionsMenu from "./SongActionsMenu";

type SearchResultActionsProps = {
  resultId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onPlayNow: () => void;
  onAddToQueue: () => void;
  onSaveToLibrary: () => void;
  onToggleFavorite: () => void;
  isFavorite: boolean;
  onAddToPlaylist: (playlistId: string) => void;
  playlists: Playlist[];
};

export default function SearchResultActions({
  resultId,
  isOpen,
  onOpenChange,
  onPlayNow,
  onAddToQueue,
  onSaveToLibrary,
  onToggleFavorite,
  isFavorite,
  onAddToPlaylist,
  playlists,
}: SearchResultActionsProps) {
  const { language } = useLanguage();

  function handleQuickQueueAdd() {
    onAddToQueue();
    window.dispatchEvent(new CustomEvent("ponotai-toast", {
      detail: {
        text: language === "bg" ? "Добавено в опашката" : "Added to queue",
      },
    }));
  }

  return (
    <div className="relative flex items-center gap-1" data-result-actions={resultId}>
      <button
        type="button"
        className="rounded-full border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          handleQuickQueueAdd();
        }}
        aria-label={t("btn_add_to_queue", language)}
        title={t("btn_add_to_queue", language)}
      >
        <Plus className="w-4 h-4 text-[var(--text)]" />
      </button>

      <SongActionsMenu
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        trigger={<EllipsisVertical className="w-4 h-4 text-[var(--text)]" />}
        triggerClassName="rounded-full border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]"
        menuClassName="min-w-52 p-2"
        onPlay={onPlayNow}
        onAddToQueue={onAddToQueue}
        onSaveToLibrary={onSaveToLibrary}
        onToggleFavorite={onToggleFavorite}
        isFavorite={isFavorite}
        playlists={playlists}
        onAddToPlaylist={onAddToPlaylist}
      />
    </div>
  );
}
