"use client";

import type { Playlist } from "../features/library/types";
import { Heart } from "./icons";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import PlaylistCard from "./PlaylistCard";

type LibrarySidebarProps = {
  playlists: Playlist[];
  favoritesSet?: Set<string>;
  onDeletePlaylist?: (playlistId: string) => void;
};

export default function LibrarySidebar({ playlists, favoritesSet, onDeletePlaylist }: LibrarySidebarProps) {
  const { language } = useLanguage();

  return (
    <aside className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] p-4 shadow-[var(--sidebar-shadow)]">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-[var(--accent)]" />
          <p className="text-sm font-semibold text-[var(--text)]">{t("library_favorites", language)}</p>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {t("library_songs_count", language, { count: favoritesSet?.size ?? 0 })}
        </p>
      </div>

      <h2 className="mt-4 text-lg font-semibold text-[var(--text)]">{t("library_playlists", language)}</h2>
      <div className="mt-3 space-y-3">
        {playlists.length === 0 && <p className="text-sm text-[var(--muted)]">{t("no_playlists_created", language)}</p>}
        {playlists.map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            onClick={() => undefined}
            onDelete={onDeletePlaylist}
            showSongPreview={false}
          />
        ))}
      </div>
    </aside>
  );
}
