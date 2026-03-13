"use client";

import type { Playlist } from "../../features/library/types";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";

export default function HomePlaylistsSection({ playlists, onOpenLibrary }: { playlists: Playlist[]; onOpenLibrary: () => void }) {
  if (playlists.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Recent Playlists</h2>
        <Button variant="ghost" size="sm" onClick={onOpenLibrary}>View all</Button>
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {playlists.slice(0, 4).map((playlist) => (
          <Card key={playlist.id} className="p-4 hover:border-brand-500/50 transition cursor-pointer" onClick={onOpenLibrary}>
            <p className="font-medium text-text-primary truncate">{playlist.name}</p>
            <p className="text-xs text-text-muted mt-1">{playlist.songs.length} songs</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
