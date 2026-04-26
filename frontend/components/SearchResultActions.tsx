"use client";

import { EllipsisVertical, Save } from "../lucide-react";
import type { Playlist } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { stopNestedInteractiveEvent } from "../lib/domEvents";
import SongActionsMenu from "./SongActionsMenu";

type SearchResultActionsProps = {
  resultId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToQueue: () => void;
  onSaveToLibrary?: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  onAddToPlaylist?: (playlistId: string) => void;
  playlists?: Playlist[];
  showQuickSave?: boolean;
};

export default function SearchResultActions({
  resultId,
  isOpen,
  onOpenChange,
  onAddToQueue,
  onSaveToLibrary,
  onShare,
  onAddToPlaylist,
  playlists = [],
  showQuickSave = true,
}: SearchResultActionsProps) {
  const { language } = useLanguage();

  function handleQuickSave() {
    if (!onSaveToLibrary) return;
    void onSaveToLibrary();
  }

  return (
    <div
      className="relative flex items-center gap-1"
      data-result-actions={resultId}
      onPointerDown={(event) => stopNestedInteractiveEvent(event, false)}
      onMouseDown={(event) => stopNestedInteractiveEvent(event, false)}
      onClick={(event) => stopNestedInteractiveEvent(event, false)}
    >
      {showQuickSave && onSaveToLibrary ? (
        <button
          type="button"
          className="rounded-full border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]"
          onPointerDown={(event) => {
            stopNestedInteractiveEvent(event);
          }}
          onMouseDown={(event) => {
            stopNestedInteractiveEvent(event);
          }}
          onClick={(event) => {
            stopNestedInteractiveEvent(event, false);
            handleQuickSave();
          }}
          aria-label={t("btn_save", language)}
          title={t("btn_save", language)}
        >
          <Save className="w-4 h-4 text-[var(--text)]" />
        </button>
      ) : null}

      <SongActionsMenu
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        trigger={<EllipsisVertical className="w-4 h-4 text-[var(--text)]" />}
        triggerClassName="rounded-full border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]"
        menuClassName="min-w-52 p-2"
        onAddToQueue={onAddToQueue}
        onShare={onShare}
        playlists={playlists}
        onAddToPlaylist={onAddToPlaylist}
        stopParentActivation
      />
    </div>
  );
}
