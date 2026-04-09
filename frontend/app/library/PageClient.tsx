"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { scopedKey, useProfile } from "../../lib/ProfileContext";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { usePlayer } from "../../components/PlayerProvider";
import { useUser } from "../../src/context/UserContext";
import PlaylistDetail from "../../components/PlaylistDetail";
import PlaylistCard from "../../components/PlaylistCard";
import SongRow from "../../components/SongRow";
import NewPlaylistModal from "../../components/NewPlaylistModal";
import type { Playlist } from "../../features/library/types";
import { useLibrary } from "../../features/library/useLibrary";
import {
getPlaylists,
createPlaylist,
deletePlaylist,
updatePlaylistName,
removeSongFromPlaylist,
} from "../../features/library/api";
import { Button } from "../../src/components/ui/Button";
import { BarChart2, Clock, Heart, ListMusic, Plus } from "../../components/icons";
import { dedupeByTrack, normalizeTrackKey } from "../../lib/dedupe";

type Song = {
id: string;
title?: string;
artist?: string;
album?: string;
coverUrl?: string;
createdAt?: string;
};

function parseStorage<T>(key: string, fallback: T): T {
if (typeof window === "undefined") return fallback;
try {
return JSON.parse(window.localStorage.getItem(key) ?? JSON.stringify(fallback)) as T;
} catch {
return fallback;
}
}

export default function LibraryPage() {
const { language } = useLanguage();
const { addToQueue, addManyToQueue, clearQueue, playNow } = usePlayer();
const { favorites: userFavorites, removeFavorite, deleteHistoryItem, isAuthenticated, isLoading } = useUser();
const { profile } = useProfile();

const getScoped = (key: string) => (profile?.id ? scopedKey(key, profile.id) : key);

const historyKey = getScoped("ponotai-history");
const { favoritesList, toggleFavorite } = useLibrary(profile.id);

const normalizeSong = (item: any): Song => ({
  id:
    item.id ??
    `${item.title ?? item.songName ?? item.song?.songName ?? "unknown"}-${
      item.artist ?? item.song?.artist ?? "unknown"
    }`,

  title:
    item.title ??
    item.songName ??
    item.song?.songName ??
    t("unknown_song", language),

  artist:
    item.artist ??
    item.song?.artist ??
    "-",

  album:
    item.album ??
    item.song?.album ??
    undefined,

  coverUrl:
    item.coverUrl ??
    item.song?.coverUrl ??
    undefined,

  createdAt: item.createdAt ?? undefined,
});


const [playlists, setPlaylists] = useState<Playlist[]>([]);
const [loading, setLoading] = useState(true);
const [loadError, setLoadError] = useState<string | null>(null);

const [history, setHistory] = useState<Song[]>(() => {
const raw = parseStorage<any[]>(historyKey, []);
return (raw || []).map(normalizeSong);
});

const [selectedTab, setSelectedTab] = useState<"favorites" | "playlists" | "history">("history");
const [searchQuery, setSearchQuery] = useState("");
const [showNewPlaylistModal, setShowNewPlaylistModal] = useState(false);
const [isCreating, setIsCreating] = useState(false);
const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
const [showPlaylistDetail, setShowPlaylistDetail] = useState(false);
const [showUndoToast, setShowUndoToast] = useState(false);
const [statusToast, setStatusToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
const deletedPlaylistRef = useRef<Playlist | null>(null);
const deleteTimerRef = useRef<number | null>(null);

// refresh local reads when profile or language changes
useEffect(() => {
const rawHistory = parseStorage<any[]>(historyKey, []);
setHistory((rawHistory || []).map(normalizeSong));

}, [historyKey, profile?.id, language]);

const dedupedHistory = useMemo(
() => dedupeByTrack(history, (item) => item.title ?? "", (item) => item.artist ?? ""),
[history],
);

// load playlists from backend for authenticated users, otherwise from guest library state
useEffect(() => {
async function loadPlaylists() {
if (isAuthenticated) {
setLoading(true);
setLoadError(null);
try {
const loaded = await getPlaylists();
setPlaylists(loaded);
} catch {
setLoadError(language === "bg" ? "Грешка при зареждане на плейлистите." : "Failed to load playlists.");
setPlaylists([]);
}
setLoading(false);
return;
}

setLoadError(null);
setPlaylists([]);
setLoading(false);
}

void loadPlaylists();
}, [isAuthenticated, language]);

// favorites source: cloud for authenticated users, local library state for guests
const mergedFavorites = useMemo(() => {
const baseFavorites = isAuthenticated
? (userFavorites || []).map(normalizeSong)
: favoritesList.map((favorite) =>
    normalizeSong({
      id: favorite.key,
      title: favorite.title,
      artist: favorite.artist,
      coverUrl: favorite.artworkUrl,
    }),
  );

return dedupeByTrack(baseFavorites, (item) => item.title ?? "", (item) => item.artist ?? "");
}, [favoritesList, isAuthenticated, userFavorites, language]);

// clear search when switching tabs
useEffect(() => {
setSearchQuery("");
}, [selectedTab]);

const recentSongs = useMemo(() => dedupedHistory.slice(0, 12), [dedupedHistory]);

const filteredHistory = useMemo(() => {
if (!searchQuery) return recentSongs;
const q = searchQuery.toLowerCase();
return recentSongs.filter(
(item) =>
(item.title ?? "").toLowerCase().includes(q) ||
(item.artist ?? "").toLowerCase().includes(q) ||
(item.album ?? "").toLowerCase().includes(q)
);
}, [recentSongs, searchQuery]);

const filteredFavorites = useMemo(() => {
if (!searchQuery) return mergedFavorites;
const q = searchQuery.toLowerCase();
return mergedFavorites.filter(
(fav) =>
(fav.title ?? "").toLowerCase().includes(q) ||
(fav.artist ?? "").toLowerCase().includes(q) ||
(fav.album ?? "").toLowerCase().includes(q)
);
}, [mergedFavorites, searchQuery]);

const filteredPlaylists = useMemo(() => {
if (!searchQuery) return playlists;
const query = searchQuery.toLowerCase();
return playlists.filter((p) => p.name.toLowerCase().includes(query));
}, [playlists, searchQuery]);

function handlePlaySong(song: Song | any) {
if (!song?.title || !song?.artist) return;

addToQueue({
  id: `${song.title}-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
  title: song.title,
  artist: song.artist,
  artistId: `artist-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
  artworkUrl: song.coverUrl || "https://picsum.photos/seed/library/80",
  license: "COPYRIGHTED",
  query: `${song.title} ${song.artist} official audio`,
});

}

async function handleDeleteHistoryItem(id: string) {
if (isAuthenticated) {
  await deleteHistoryItem(id);
}
setHistory((prev) => {
  const updated = prev.filter((entry) => entry.id !== id);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(historyKey, JSON.stringify(updated));
  }
  return updated;
});
}

async function handleCreatePlaylist(name: string) {
if (isCreating) return null;
if (!name.trim()) return null;

setIsCreating(true);
try {
  if (!isAuthenticated) return null;

  const created = await createPlaylist(name);
  if (created) {
    setPlaylists((prev) => [...prev, created]);
  }
  return created;
} finally {
  setIsCreating(false);
}
}

async function handleDeletePlaylist(playlistId: string) {
const target = playlists.find((playlist) => playlist.id === playlistId);
if (!target) return;

if (deleteTimerRef.current) {
  window.clearTimeout(deleteTimerRef.current);
}

deletedPlaylistRef.current = target;
setPlaylists((prev) => prev.filter((playlist) => playlist.id !== playlistId));
setShowUndoToast(true);

deleteTimerRef.current = window.setTimeout(async () => {
  if (!deletedPlaylistRef.current) return;
  if (isAuthenticated) {
    await deletePlaylist(playlistId);
  }
  deletedPlaylistRef.current = null;
  setShowUndoToast(false);
  deleteTimerRef.current = null;
}, 4000);
}

function handlePlayPlaylistSong(song: any) {
if (!song?.title || !song?.artist) return;
playNow({
id: `playlist-${song.title}-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
title: song.title,
artist: song.artist,
artistId: `artist-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
artworkUrl: song.coverUrl || "https://picsum.photos/seed/playlist/80",
videoId: song.videoId,
license: "COPYRIGHTED",
query: `${song.title} ${song.artist} official audio`,
}, "playlist");
}


function handlePlayPlaylist(playlist: Playlist) {
  if (playlist.songs.length === 0) return;
  const [firstSong, ...restSongs] = playlist.songs;
  if (!firstSong) return;
  playNow({
    id: `playlist-${firstSong.title}-${firstSong.artist}`.toLowerCase().replace(/\s+/g, "-"),
    title: firstSong.title,
    artist: firstSong.artist,
    artistId: `artist-${firstSong.artist}`.toLowerCase().replace(/\s+/g, "-"),
    artworkUrl: firstSong.coverUrl || "https://picsum.photos/seed/playlist/80",
    videoId: firstSong.videoId,
    license: "COPYRIGHTED",
    query: `${firstSong.title} ${firstSong.artist} official audio`,
  }, "playlist");
  if (restSongs.length > 0) {
    addManyToQueue(restSongs.map((song) => ({
      id: `playlist-${song.title}-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
      title: song.title,
      artist: song.artist,
      artistId: `artist-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
      artworkUrl: song.coverUrl || "https://picsum.photos/seed/playlist/80",
      videoId: song.videoId,
      license: "COPYRIGHTED",
      query: `${song.title} ${song.artist} official audio`,
    })), "playlist");
  }
}

function handlePlayAllFromDetail(songs: Array<{ title: string; artist: string; coverUrl?: string; videoId?: string }>) {
  clearQueue();
  const [firstSong, ...restSongs] = songs;
  if (!firstSong) return;
  playNow({
    id: `playlist-${firstSong.title}-${firstSong.artist}`.toLowerCase().replace(/\s+/g, "-"),
    title: firstSong.title,
    artist: firstSong.artist,
    artistId: `artist-${firstSong.artist}`.toLowerCase().replace(/\s+/g, "-"),
    artworkUrl: firstSong.coverUrl || "https://picsum.photos/seed/playlist/80",
    videoId: firstSong.videoId,
    license: "COPYRIGHTED",
    query: `${firstSong.title} ${firstSong.artist} official audio`,
  }, "playlist");
  if (restSongs.length > 0) {
    addManyToQueue(restSongs.map((song) => ({
      id: `playlist-${song.title}-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
      title: song.title,
      artist: song.artist,
      artistId: `artist-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
      artworkUrl: song.coverUrl || "https://picsum.photos/seed/playlist/80",
      videoId: song.videoId,
      license: "COPYRIGHTED",
      query: `${song.title} ${song.artist} official audio`,
    })), "playlist");
  }
}
async function handleRemoveSongFromPlaylist(playlistId: string, title: string, artist: string) {
try {
const removedPlaylist = await removeSongFromPlaylist(playlistId, title, artist);
if (!removedPlaylist && isAuthenticated) {
console.error("Failed to remove song from playlist via API", { playlistId, title, artist });
}
} catch (error) {
console.error("Failed to remove song from playlist", { playlistId, title, artist, error });
}
setPlaylists((prev) =>
prev.map((p) =>
p.id === playlistId
? { ...p, songs: p.songs.filter((s) => !(s.title === title && s.artist === artist)) }
: p
)
);
if (selectedPlaylist?.id === playlistId) {
setSelectedPlaylist((prev) =>
prev
? { ...prev, songs: prev.songs.filter((s) => !(s.title === title && s.artist === artist)) }
: null
);
}
}

function handlePlaylistDetailClose() {
setShowPlaylistDetail(false);
setSelectedPlaylist(null);
}

function handlePlaylistCardClick(playlist: Playlist) {
setSelectedPlaylist(playlist);
setShowPlaylistDetail(true);
}

async function handlePlaylistDetailDelete(playlistId: string) {
await handleDeletePlaylist(playlistId);
handlePlaylistDetailClose();
}

async function handlePlaylistRename(playlistId: string, newName: string) {
const success = await updatePlaylistName(playlistId, newName);
if (success) {
setPlaylists((prev) =>
prev.map((p) => (p.id === playlistId ? { ...p, name: newName } : p))
);
if (selectedPlaylist?.id === playlistId) {
setSelectedPlaylist((prev) => (prev ? { ...prev, name: newName } : null));
}
}
}

function showStatusToast(kind: "success" | "error", message: string) {
  setStatusToast({ kind, message });
  window.setTimeout(() => setStatusToast(null), 3000);
}

function handleSongsAddedToPlaylist(playlistId: string, songs: Array<{ title: string; artist: string; album?: string; coverUrl?: string; videoId?: string }>) {
  if (songs.length === 0) return;
  setPlaylists((prev) =>
    prev.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;
      const nextSongs = [...playlist.songs];
      for (const song of songs) {
        const songKey = normalizeTrackKey(song.title, song.artist);
        const exists = nextSongs.some((existingSong) => normalizeTrackKey(existingSong.title, existingSong.artist) === songKey);
        if (!exists) {
          nextSongs.push(song);
        }
      }
      return { ...playlist, songs: nextSongs };
    }),
  );
  setSelectedPlaylist((prev) => {
    if (!prev || prev.id !== playlistId) return prev;
    const nextSongs = [...prev.songs];
    for (const song of songs) {
      const songKey = normalizeTrackKey(song.title, song.artist);
      const exists = nextSongs.some((existingSong) => normalizeTrackKey(existingSong.title, existingSong.artist) === songKey);
      if (!exists) {
        nextSongs.push(song);
      }
    }
    return { ...prev, songs: nextSongs };
  });
}


function handleUndoDeletePlaylist() {
if (deleteTimerRef.current) {
window.clearTimeout(deleteTimerRef.current);
deleteTimerRef.current = null;
}
if (deletedPlaylistRef.current) {
setPlaylists((prev) => [deletedPlaylistRef.current as Playlist, ...prev]);
}
deletedPlaylistRef.current = null;
setShowUndoToast(false);
}

useEffect(() => () => {
if (deleteTimerRef.current) {
window.clearTimeout(deleteTimerRef.current);
}
}, []);

if (isLoading) {
return <section className="space-y-4"><div className="card p-6"><div className="h-28 animate-pulse rounded-xl bg-[var(--surface-raised)]" /></div><div className="card p-6"><div className="h-64 animate-pulse rounded-xl bg-[var(--surface-raised)]" /></div></section>;
}

return ( <section className="space-y-6"> <div className="card p-6"> <h1 className="cardTitle text-3xl font-bold">{t("nav_library", language)}</h1> <p className="cardText mt-2">
{language === "bg"
? "Управлявай любимите си песни, плейлистите и историята на едно място."
: "Manage your favorites, playlists and history in one place."} </p>
{isAuthenticated && <p className="cardText mt-2 text-xs">Cloud synced</p>} </div>

  <div className="grid gap-4 md:grid-cols-4">
    <div className="card p-5">
      <p className="cardText text-sm">{t("library_favorites", language)}</p>
      <p className="cardTitle mt-2 text-3xl font-semibold">{mergedFavorites.length}</p>
    </div>
    <div className="card p-5">
      <p className="cardText text-sm">{t("library_playlists", language)}</p>
      <p className="cardTitle mt-2 text-3xl font-semibold">{playlists.length}</p>
    </div>
    <div className="card p-5">
      <p className="cardText text-sm">{t("history_title", language)}</p>
      <p className="cardTitle mt-2 text-3xl font-semibold">{dedupedHistory.length}</p>
    </div>
    <div className="card p-5 bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent-2)]/10">
      <p className="cardText text-sm">Total Collection</p>
      <p className="cardTitle mt-2 text-3xl font-semibold">
        {mergedFavorites.length + playlists.reduce((sum, p) => sum + p.songs.length, 0) + dedupedHistory.length}
      </p>
    </div>
  </div>

  {loadError && <div className="card p-4 text-sm text-red-300">{loadError}</div>}

  {showUndoToast && (
    <div className="card relative overflow-hidden p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span>{t("toast_playlist_deleted", language)}</span>
        <button type="button" className="font-semibold text-[var(--accent)]" onClick={handleUndoDeletePlaylist}>{t("toast_undo", language)}</button>
      </div>
      <div className="absolute bottom-0 left-0 h-[2px] bg-[var(--accent)]" style={{ animation: "shrink 4s linear forwards" }} />
    </div>
  )}
  {statusToast && (
    <div className={`card p-4 text-sm ${statusToast.kind === "success" ? "border-emerald-300/40 bg-emerald-500/15" : "border-red-300/40 bg-red-500/15"}`}>
      {statusToast.message}
    </div>
  )}

  {history.length > 0 && (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="cardTitle text-xl font-semibold flex items-center gap-2"><BarChart2 className="w-5 h-5 text-[var(--muted)]" />Insights</h2>
      </div>
      {mergedFavorites && <p className="cardText">You have {mergedFavorites.length} favorite songs.</p>}
    </div>
  )}

  <div className="card p-0 border-b border-[var(--border)]">
    <div className="flex gap-0 divide-x divide-[var(--border)]">
      {(["history", "favorites", "playlists"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setSelectedTab(tab)}
          className={`flex-1 px-4 py-4 text-sm font-medium transition ${
            selectedTab === tab
              ? "border-b-2 border-[var(--accent)] bg-[var(--active-bg)] text-[var(--text)]"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          {tab === "history" && "Recent"}
          {tab === "favorites" && "Favorites"}
          {tab === "playlists" && "Playlists"}
        </button>
      ))}
    </div>
  </div>

  <div className="min-h-96">
    {selectedTab === "history" && (
      <section className="card p-6 space-y-4">
        <div>
          <h2 className="cardTitle text-2xl font-bold">{t("history_title", language)}</h2>
          <p className="cardText mt-1">
            {language === "bg" ? "Търси в историята по песен или изпълнител." : "Search your history by song or artist."}
          </p>
        </div>

        <input
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder={t("history_search_placeholder", language)}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="space-y-2">
          {filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center"><Clock className="w-10 h-10 text-[var(--muted)]" /><p className="font-semibold">{t("empty_history_heading", language)}</p><p className="cardText">{t("empty_history_hint", language)}</p></div>
          ) : (
            filteredHistory.map((item) => (
              <SongRow
                key={item.id}
                id={item.id}
                title={item.title ?? t("unknown_song", language)}
                artist={item.artist ?? "-"}
                artworkUrl={item.coverUrl}
                onPlay={() => handlePlaySong(item)}
                onDelete={() => void handleDeleteHistoryItem(item.id)}
              />
            ))
          )}
        </div>
      </section>
    )}

    {selectedTab === "favorites" && (
      <section className="card p-6 space-y-4">
        <div>
          <h2 className="cardTitle text-2xl font-bold">{t("library_favorites", language)}</h2>
          <p className="cardText mt-1">{language === "bg" ? "Търси в любимите си песни." : "Search your favorite songs."}</p>
        </div>

        <input
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder={`Search favorites...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="space-y-2">
          {filteredFavorites.length > 0 ? (
            filteredFavorites.map((fav, idx) => (
              <SongRow
                key={fav.id ?? idx}
                id={fav.id ?? `${fav.title}-${fav.artist}-${idx}`}
                title={fav.title ?? t("unknown_song", language)}
                artist={fav.artist ?? "-"}
                artworkUrl={fav.coverUrl}
                onPlay={() => handlePlaySong(fav)}
                isFavorite
                onFavorite={() => {
                  const favoriteKey = normalizeTrackKey(fav.title ?? "", fav.artist ?? "");
                  if (isAuthenticated) {
                    void removeFavorite(favoriteKey);
                    return;
                  }
                  toggleFavorite(favoriteKey, fav.title, fav.artist, fav.coverUrl);
                }}
              />
            ))
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center"><Heart className="w-10 h-10 text-[var(--muted)]" /><p className="font-semibold">{t("empty_favorites_heading", language)}</p><p className="cardText">{t("empty_favorites_hint", language)}</p></div>
          )}
        </div>
      </section>
    )}

    {selectedTab === "playlists" && (
      <div className="space-y-4">
        <div className="card p-4">
          <Button onClick={() => setShowNewPlaylistModal(true)} className="w-full flex items-center justify-center gap-2" disabled={!isAuthenticated}>
            <Plus className="w-4 h-4 text-[var(--text)]" />
            {t("playlist_new", language)}
          </Button>
        </div>

        {loading ? (
          <div className="card p-12 text-center"><div className="mx-auto h-16 w-full max-w-md animate-pulse rounded-xl bg-[var(--surface-raised)]" /></div>
        ) : !isAuthenticated ? (
          <div className="col-span-full card p-12 text-center"><div className="flex flex-col items-center gap-2"><ListMusic className="w-10 h-10 text-[var(--muted)]" /><p className="font-semibold">Sign in to manage playlists</p></div></div>
        ) : filteredPlaylists.length === 0 ? (
          <div className="col-span-full card p-12 text-center"><div className="flex flex-col items-center gap-2"><ListMusic className="w-10 h-10 text-[var(--muted)]" /><p className="font-semibold">No playlists yet — create your first one</p></div></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                onClick={handlePlaylistCardClick}
                onDelete={handleDeletePlaylist}
                onPlay={handlePlayPlaylist}
              />
            ))}
          </div>
        )}
      </div>
    )}
  </div>

  {showNewPlaylistModal && (
    <NewPlaylistModal
      onClose={() => setShowNewPlaylistModal(false)}
      onCreatePlaylist={handleCreatePlaylist}
      onCreated={(playlist) => {
        setPlaylists((prev) => [...prev.filter((p) => p.id !== playlist.id), playlist]);
        setShowNewPlaylistModal(false);
      }}
    />
  )}

  {showPlaylistDetail && selectedPlaylist && (
    <PlaylistDetail
      playlist={selectedPlaylist}
      onClose={handlePlaylistDetailClose}
      onPlaySong={handlePlayPlaylistSong}
      onRemoveSong={(title, artist) => handleRemoveSongFromPlaylist(selectedPlaylist.id, title, artist)}
      onSongsAdded={handleSongsAddedToPlaylist}
      onToast={showStatusToast}
      onDeletePlaylist={() => handlePlaylistDetailDelete(selectedPlaylist.id)}
      onRenamePlaylist={(newName) => handlePlaylistRename(selectedPlaylist.id, newName)}
      onPlayAll={handlePlayAllFromDetail}
    />
  )}
</section>

);
}
