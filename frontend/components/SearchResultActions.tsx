"use client";

import { Plus } from "../lucide-react";
import type { Playlist } from "../features/library/types";
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
  return (
    <div className="relative" data-result-actions={resultId}>
      <SongActionsMenu
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        trigger={<Plus className="w-4 h-4 text-[var(--text)]" />}
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
