import { useRef, useEffect, useState } from "react";
import type { PlaylistSong } from "../features/library/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";

type PlaylistSongCardProps = {
  song: PlaylistSong;
  index: number;
  onPlay: (song: PlaylistSong) => void;
  onRemove: (title: string, artist: string) => void;
};

export default function PlaylistSongCard({
  song,
  index,
  onPlay,
  onRemove,
}: PlaylistSongCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { language } = useLanguage();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isMenuOpen]);

  const searchQuery = encodeURIComponent(`${song.title} ${song.artist}`);

  return (
    <article className="group relative flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 transition-all duration-200 hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)]">
      {/* Cover Image */}
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-[var(--border)]">
        {song.coverUrl ? (
          <img
            src={song.coverUrl}
            alt={`${song.title} cover`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent)]/5 flex items-center justify-center text-xs text-[var(--muted)]">
            🎵
          </div>
        )}
        
        {/* Play Button on Hover */}
        <button
          type="button"
          onClick={() => onPlay(song)}
          className="absolute inset-0 grid place-items-center rounded-md bg-black/40 opacity-0 transition group-hover:opacity-100"
          title="Play song"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-sm text-white">
            ▶
          </span>
        </button>
      </div>

      {/* Song Info */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-[var(--text)]">
          {song.title}
        </h3>
        <p className="truncate text-xs text-[var(--muted)]">{song.artist}</p>
        {song.album && (
          <p className="truncate text-xs text-[var(--muted)] opacity-70">
            {song.album}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="relative flex items-center gap-1 opacity-0 transition group-hover:opacity-100" ref={menuRef}>
        {/* Play Button (also visible on hover) */}
        <button
          type="button"
          onClick={() => onPlay(song)}
          className="rounded-full bg-[var(--accent)] p-2 text-white hover:bg-[var(--accent)]/90 transition"
          title="Play song"
        >
          ▶
        </button>

        {/* More Options Button */}
        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="rounded-full p-2 hover:bg-[var(--hover-bg)] transition text-[var(--muted)] hover:text-[var(--text)]"
          title="More options"
        >
          ⋮
        </button>

        {/* Options Menu */}
        {isMenuOpen && (
          <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shadow-lg overflow-hidden">
            {/* Open in Spotify */}
            <a
              href={`https://open.spotify.com/search/${searchQuery}`}
              target="_blank"
              rel="noreferrer"
              className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--hover-bg)] text-[var(--text)] transition"
            >
              🎵 Open in Spotify
            </a>

            {/* Open in YouTube */}
            <a
              href={`https://www.youtube.com/results?search_query=${searchQuery}`}
              target="_blank"
              rel="noreferrer"
              className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--hover-bg)] text-[var(--text)] transition"
            >
              ▶ Open in YouTube
            </a>

            {/* Open in Apple Music */}
            <a
              href={`https://music.apple.com/us/search?term=${searchQuery}`}
              target="_blank"
              rel="noreferrer"
              className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--hover-bg)] text-[var(--text)] transition"
            >
              🎶 Open in Apple Music
            </a>

            {/* Copy Song Name */}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(`${song.title} — ${song.artist}`);
                setIsMenuOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--hover-bg)] text-[var(--text)] transition"
            >
              📋 Copy Song Name
            </button>

            <hr className="border-[var(--border)]" />

            {/* Remove from Playlist */}
            <button
              type="button"
              onClick={() => {
                onRemove(song.title, song.artist);
                setIsMenuOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-red-500/10 text-red-300 transition"
            >
              🗑️ Remove from Playlist
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
