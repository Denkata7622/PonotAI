"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListMusic, Plus } from "../icons";
import { Button } from "../../src/components/ui/Button";
import type { Playlist } from "../../features/library/types";
import { t, type Language } from "../../lib/translations";
import PlaylistCard from "../PlaylistCard";

export default function HomePlaylistsSection({ playlists, language, onOpenNewPlaylist }: { playlists: Playlist[]; language: Language; onOpenNewPlaylist?: () => void }) {
  const router = useRouter();

  if (playlists.length === 0) {
    return (
      <section className="rounded-3xl border border-border bg-surface p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <ListMusic className="w-10 h-10 text-[var(--muted)]" />
          <p className="text-lg font-semibold">{t("empty_playlists_heading", language)}</p>
          <p className="text-sm text-text-muted">{t("empty_playlists_hint", language)}</p>
          <Button onClick={onOpenNewPlaylist} className="mt-2 flex items-center gap-2" disabled={!onOpenNewPlaylist}>
            <Plus className="w-4 h-4 text-[var(--text)]" />
            {t("playlist_new", language)}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t("library_playlists", language)}</h2>
        <div className="flex items-center gap-2">
          <Button onClick={onOpenNewPlaylist} className="flex items-center gap-2" disabled={!onOpenNewPlaylist}>
            <Plus className="w-4 h-4 text-[var(--text)]" />
            {t("playlist_new", language)}
          </Button>
          <Link href="/library?tab=playlists" className="text-sm text-text-muted hover:opacity-80">{t("btn_open", language)}</Link>
        </div>
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {playlists.slice(0, 4).map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            onClick={() => router.push("/library?tab=playlists")}
          />
        ))}
      </div>
    </section>
  );
}
