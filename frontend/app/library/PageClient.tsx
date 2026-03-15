"use client";

import { useMemo, useState, useEffect } from "react";
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
import { dedupeByTrack } from "../../lib/dedupe";

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
const { addToQueue } = usePlayer();
const { favorites: userFavorites, isAuthenticated, isLoading } = useUser();
const { profile } = useProfile();

const getScoped = (key: string) => (profile?.id ? scopedKey(key, profile.id) : key);

const historyKey = getScoped("ponotai-history");
const favoritesKey = getScoped("ponotai.library.favorites");

const { playlists: guestPlaylists, createPlaylist: createGuestPlaylist, deletePlaylist: deleteGuestPlaylist } = useLibrary(profile.id);

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

const [favoritesLocal, setFavoritesLocal] = useState<Song[]>(() => {
const raw = parseStorage<any[]>(favoritesKey, []);
return (raw || []).map(normalizeSong);
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

// refresh local reads when profile or language changes
useEffect(() => {
const rawFav = parseStorage<any[]>(favoritesKey, []);
setFavoritesLocal((rawFav || []).map(normalizeSong));

const rawHistory = parseStorage<any[]>(historyKey, []);
setHistory((rawHistory || []).map(normalizeSong));

}, [favoritesKey, historyKey, profile?.id, language]);

const dedupedFavoritesLocal = useMemo(
() => dedupeByTrack(favoritesLocal, (item) => item.title ?? "", (item) => item.artist ?? ""),
[favoritesLocal],
);

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
setPlaylists(guestPlaylists);
setLoading(false);
}

void loadPlaylists();
}, [isAuthenticated, guestPlaylists, language]);

// merge local and cloud favorites, dedupe by title+artist
const mergedFavorites = useMemo(() => {
const local = dedupedFavoritesLocal || [];
const cloud = userFavorites || [];
const map = new Map<string, Song>();

const add = (s: any) => {
  const normalized = normalizeSong(s);
  const key = `${(normalized.title ?? "").toLowerCase()}|||${(normalized.artist ?? "").toLowerCase()}`;
  if (!map.has(key)) map.set(key, normalized);
};

local.forEach(add);
cloud.forEach(add);

return Array.from(map.values());

}, [dedupedFavoritesLocal, userFavorites, language]);

const dedupedMergedFavorites = useMemo(
() => dedupeByTrack(mergedFavorites, (item) => item.title ?? "", (item) => item.artist ?? ""),
[mergedFavorites],
);

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
if (!searchQuery) return dedupedMergedFavorites;
const q = searchQuery.toLowerCase();
return dedupedMergedFavorites.filter(
(fav) =>
(fav.title ?? "").toLowerCase().includes(q) ||
(fav.artist ?? "").toLowerCase().includes(q) ||
(fav.album ?? "").toLowerCase().includes(q)
);
}, [dedupedMergedFavorites, searchQuery]);

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

function handleDeleteHistoryItem(id: string) {
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
  if (isAuthenticated) {
    const created = await createPlaylist(name);
    if (created) {
      setPlaylists((prev) => [...prev, created]);
    }
    return created;
  }

  const created = await createGuestPlaylist(name);
  if (created) {
    setPlaylists((prev) => [...prev, created]);
  }
  return created;
} finally {
  setIsCreating(false);
}
}

async function handleDeletePlaylist(playlistId: string) {
if (isAuthenticated) {
  const success = await deletePlaylist(playlistId);
  if (success) {
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
  }
  return;
}

await deleteGuestPlaylist(playlistId);
setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
}

function handlePlayPlaylistSong(song: any) {
if (!song?.title || !song?.artist) return;
addToQueue({
id: `playlist-${song.title}-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
title: song.title,
artist: song.artist,
artistId: `artist-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
artworkUrl: song.coverUrl || "https://picsum.photos/seed/playlist/80",
videoId: song.videoId,
license: "COPYRIGHTED",
query: `${song.title} ${song.artist} official audio`,
});
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
if (isAuthenticated) {
const success = await deletePlaylist(playlistId);
if (success) {
setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
handlePlaylistDetailClose();
}
return;
}

await deleteGuestPlaylist(playlistId);
setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
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
      <p className="cardTitle mt-2 text-3xl font-semibold">{dedupedMergedFavorites.length}</p>
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
        {dedupedMergedFavorites.length + playlists.reduce((sum, p) => sum + p.songs.length, 0) + dedupedHistory.length}
      </p>
    </div>
  </div>

  {loadError && <div className="card p-4 text-sm text-red-300">{loadError}</div>}

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
                onDelete={() => handleDeleteHistoryItem(item.id)}
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
          <Button onClick={() => setShowNewPlaylistModal(true)} className="w-full flex items-center justify-center gap-2">
            <Plus className="w-4 h-4 text-[var(--text)]" />
            {t("playlist_new", language)}
          </Button>
        </div>

        {loading ? (
          <div className="card p-12 text-center"><div className="mx-auto h-16 w-full max-w-md animate-pulse rounded-xl bg-[var(--surface-raised)]" /></div>
        ) : filteredPlaylists.length === 0 ? (
          <div className="col-span-full card p-12 text-center"><div className="flex flex-col items-center gap-2"><ListMusic className="w-10 h-10 text-[var(--muted)]" /><p className="font-semibold">{t("empty_playlists_heading", language)}</p><p className="cardText">{t("empty_playlists_hint", language)}</p></div></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                onClick={handlePlaylistCardClick}
                onDelete={handleDeletePlaylist}
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
      onDeletePlaylist={() => handlePlaylistDetailDelete(selectedPlaylist.id)}
      onRenamePlaylist={(newName) => handlePlaylistRename(selectedPlaylist.id, newName)}
    />
  )}
</section>

);
}
