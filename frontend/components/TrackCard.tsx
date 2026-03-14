import { useEffect, useRef, useState } from "react";
import type { Playlist } from "../features/library/types";
import type { Track } from "../features/tracks/types";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";

type TrackCardProps = {
  track: Track;
  playlists: Playlist[];
  isFavorite: boolean;
  onToggleFavorite: (trackId: string, title?: string, artist?: string) => void;
  onAddToPlaylist: (trackId: string, playlistId: string) => void;
  onCreatePlaylist: (playlistName: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveFromPlaylist?: (trackId: string, playlistId: string) => void;
  activePlaylistId?: string;
  onPlay?: (track: Track) => void;
};

export default function TrackCard({
  track,
  playlists,
  isFavorite,
  onToggleFavorite,
  onAddToPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
  onRemoveFromPlaylist,
  activePlaylistId,
  onPlay,
}: TrackCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { language } = useLanguage();

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    }

    if (isMenuOpen) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isMenuOpen]);

  const searchQuery = encodeURIComponent(`${track.title} ${track.artistName}`);
  const showRemoveFromPlaylist = Boolean(activePlaylistId && onRemoveFromPlaylist);

  return (
    <article tabIndex={0} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && onPlay) { event.preventDefault(); onPlay(track); } }} className="group relative flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--accent)]/50 hover:shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[var(--border)]">
        <img src={track.artworkUrl} alt={`${track.title} cover`} className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={() => onPlay?.(track)}
          className="absolute inset-0 grid place-items-center rounded-xl bg-surface-overlay text-text-primary opacity-0 transition group-hover:opacity-100"
          aria-label={t("btn_play", language)}
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent)] text-sm">▶</span>
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-[var(--text)]">{track.title}</h3>
        <p className="truncate text-xs text-[var(--muted)]">{track.artistName}</p>
      </div>

      <div className="relative flex items-center gap-2 self-start" ref={menuRef}>
        <button
          type="button"
          onClick={() => onToggleFavorite(track.id, track.title, track.artistName)}
          className="rounded-full p-1.5 text-base transition hover:bg-[var(--hover-bg)]"
          aria-label={isFavorite ? t("track_remove_from_favorites", language) : t("track_add_to_favorites", language)}
          title={isFavorite ? t("track_remove_from_favorites", language) : t("track_add_to_favorites", language)}
        >
          <span className={isFavorite ? "text-rose-500" : "text-[var(--muted)]"}>{isFavorite ? "♥" : "♡"}</span>
        </button>

        <button
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className="rounded-full p-1.5 text-xl leading-none text-[var(--muted)] opacity-70 transition hover:bg-[var(--hover-bg)] hover:text-[var(--text)] group-hover:opacity-100"
          aria-label={t("track_more_options", language)}
          title={t("track_more_options", language)}
        >
          ⋮
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 top-9 z-20 w-60 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 shadow-2xl backdrop-blur">
            <div className="space-y-2 text-xs">
              <label className="block text-[var(--muted)]">{t("track_add_to_playlist", language)}</label>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-[var(--text)]"
                value={selectedPlaylistId}
                onChange={(event) => setSelectedPlaylistId(event.target.value)}
              >
                <option value="">{t("track_select_playlist", language)}</option>
                {playlists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-left hover:bg-[var(--hover-bg)] disabled:opacity-50"
                disabled={!selectedPlaylistId}
                onClick={() => {
                  if (!selectedPlaylistId) return;
                  onAddToPlaylist(track.id, selectedPlaylistId);
                  setIsMenuOpen(false);
                }}
              >
                + {t("track_add_to_playlist", language)}
              </button>

              <input
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5"
                placeholder={t("track_new_playlist_placeholder", language)}
                value={newPlaylistName}
                onChange={(event) => setNewPlaylistName(event.target.value)}
              />

              <button
                type="button"
                className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-left hover:bg-[var(--hover-bg)]"
                onClick={() => {
                  if (!newPlaylistName.trim()) return;
                  onCreatePlaylist(newPlaylistName);
                  setNewPlaylistName("");
                }}
              >
                + {t("track_create", language)}
              </button>

              {showRemoveFromPlaylist && (
                <button
                  type="button"
                  className="w-full rounded-lg border border-rose-400/40 px-2 py-1.5 text-left text-rose-300 hover:bg-rose-500/10"
                  onClick={() => {
                    onRemoveFromPlaylist?.(track.id, activePlaylistId!);
                    setIsMenuOpen(false);
                  }}
                >
                  {t("track_remove_from_playlist", language)}
                </button>
              )}

              <button
                type="button"
                className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-left hover:bg-[var(--hover-bg)]"
                onClick={() => {
                  navigator.clipboard.writeText(`${track.title} — ${track.artistName}`);
                  setIsMenuOpen(false);
                }}
              >
                {t("track_share_song", language)}
              </button>

              <div className="grid grid-cols-1 gap-1">
                <a className="rounded-md px-2 py-1 hover:bg-[var(--hover-bg)]" href={`https://open.spotify.com/search/${searchQuery}`} target="_blank" rel="noreferrer">Spotify</a>
                <a className="rounded-md px-2 py-1 hover:bg-[var(--hover-bg)]" href={`https://music.apple.com/us/search?term=${searchQuery}`} target="_blank" rel="noreferrer">Apple Music</a>
                <a className="rounded-md px-2 py-1 hover:bg-[var(--hover-bg)]" href={`https://www.youtube.com/results?search_query=${searchQuery}`} target="_blank" rel="noreferrer">YouTube</a>
              </div>

              {selectedPlaylistId && (
                <button
                  type="button"
                  className="w-full rounded-lg border border-red-400/40 px-2 py-1.5 text-left text-red-300 hover:bg-red-500/10"
                  onClick={() => {
                    onDeletePlaylist(selectedPlaylistId);
                    setSelectedPlaylistId("");
                  }}
                >
                  {t("track_delete_playlist", language)}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
