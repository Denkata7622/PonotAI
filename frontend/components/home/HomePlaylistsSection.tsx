"use client";

import Link from "next/link";
import type { Playlist } from "../../features/library/types";
import { Card } from "../../src/components/ui/Card";

export default function HomePlaylistsSection({ playlists }: { playlists: Playlist[] }) {
  if (playlists.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Recent Playlists</h2>
        <Link href="/library?tab=playlists" className="text-sm text-text-muted hover:opacity-80">View all</Link>
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {playlists.slice(0, 4).map((playlist) => (
          <Link key={playlist.id} href="/library?tab=playlists"><Card className="p-4 transition hover:border-brand-500/50 hover:opacity-90 cursor-pointer">
            <p className="font-medium text-text-primary truncate">{playlist.name}</p>
            <p className="text-xs text-text-muted mt-1">{playlist.songs.length} songs</p>
          </Card></Link>
        ))}
      </div>
    </section>
  );
}
