"use client";

import { EllipsisVertical, Play, Save } from "../lucide-react";
import type { Playlist } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { stopNestedInteractiveEvent } from "../lib/domEvents";
import SongActionsMenu from "./SongActionsMenu";
import { useUser } from "../src/context/UserContext";

type SearchResultActionsProps = {
  resultId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onPlayNow: () => void;
  onAddToQueue: () => void;
  onSaveToLibrary: () => void;
  sharePayload: { title: string; artist: string; coverUrl?: string };
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
  sharePayload,
  onAddToPlaylist,
  playlists,
}: SearchResultActionsProps) {
  const { language } = useLanguage();
  const { isAuthenticated, shareSong } = useUser();

  function handleQuickSave() {
    onSaveToLibrary();
    window.dispatchEvent(new CustomEvent("ponotai-toast", {
      detail: {
        text: language === "bg" ? "Запазено в библиотеката" : "Saved to library",
      },
    }));
  }

  return (
    <div
      className="relative flex items-center gap-1"
      data-result-actions={resultId}
      onPointerDown={(event) => stopNestedInteractiveEvent(event, false)}
      onMouseDown={(event) => stopNestedInteractiveEvent(event, false)}
      onClick={(event) => stopNestedInteractiveEvent(event, false)}
    >
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
          onPlayNow();
        }}
        aria-label={t("song_row_play", language)}
        title={t("song_row_play", language)}
      >
        <Play className="w-4 h-4 text-[var(--text)]" fill="currentColor" />
      </button>

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

      <SongActionsMenu
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        trigger={<EllipsisVertical className="w-4 h-4 text-[var(--text)]" />}
        triggerClassName="rounded-full border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]"
        menuClassName="min-w-52 p-2"
        onPlay={onPlayNow}
        showPlayAction={false}
        onAddToQueue={onAddToQueue}
        playlists={playlists}
        onAddToPlaylist={onAddToPlaylist}
        onShare={() => {
          if (!isAuthenticated) {
            window.dispatchEvent(new CustomEvent("ponotai-toast", {
              detail: { text: language === "bg" ? "Влез, за да споделяш песни." : "Sign in to share songs." },
            }));
            onOpenChange(false);
            return;
          }
          void shareSong(sharePayload).then((url) => {
            if (url) {
              void navigator.clipboard.writeText(url);
              window.dispatchEvent(new CustomEvent("ponotai-toast", {
                detail: { text: language === "bg" ? "Линкът е копиран." : "Share link copied." },
              }));
            }
          }).catch(() => {
            window.dispatchEvent(new CustomEvent("ponotai-toast", {
              detail: { text: language === "bg" ? "Споделянето е неуспешно." : "Sharing failed." },
            }));
          }).finally(() => {
            onOpenChange(false);
          });
        }}
        stopParentActivation
      />
    </div>
  );
}
