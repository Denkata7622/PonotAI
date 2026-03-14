"use client";

import { useMemo, useState, useEffect } from "react";
import { scopedKey, useProfile } from "../../lib/ProfileContext";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { usePlayer } from "../../components/PlayerProvider";
import { useUser } from "../../src/context/UserContext";
import PlaylistDetail from "../../components/PlaylistDetail";
import type { Playlist } from "../../features/library/types";
import {
getPlaylists,
createPlaylist,
deletePlaylist,
updatePlaylistName,
addSongToPlaylist,
removeSongFromPlaylist,
} from "../../features/library/api";
import { Button } from "../../src/components/ui/Button";
import { BarChart2, Clock, Heart, ListMusic, Play, Plus } from "../../components/icons";
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
const downloadsKey = getScoped("ponotai.library.downloads");
const favoritesKey = getScoped("ponotai.library.favorites");
const playlistsKey = getScoped("ponotai.library.playlists");

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

const [downloads] = useState<Song[]>(() => {
const raw = parseStorage<any[]>(downloadsKey, []);
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
const [newPlaylistName, setNewPlaylistName] = useState("");
const [showNewPlaylistInput, setShowNewPlaylistInput] = useState(false);
const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);
const [songMenuOpen, setSongMenuOpen] = useState<{ playlistId: string; songIndex: number } | null>(null);
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

// load playlists from backend or localStorage
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
} else {
const stored = parseStorage<Playlist[]>(playlistsKey, []);
setPlaylists(stored);
setLoading(false);
}
}
loadPlaylists();
}, [isAuthenticated, playlistsKey]);

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
  query: "",
});

}

async function handleCreatePlaylist() {
if (!newPlaylistName.trim()) return;
const created = await createPlaylist(newPlaylistName);
if (created) {
setPlaylists((prev) => [...prev, created]);
setNewPlaylistName("");
setShowNewPlaylistInput(false);
}
}

async function handleDeletePlaylist(playlistId: string) {
const success = await deletePlaylist(playlistId);
if (success) {
setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
setExpandedPlaylistId(null);
}
}

function handlePlayPlaylistSong(song: any) {
if (!song?.title || !song?.artist) return;
addToQueue({
id: `playlist-${song.title}-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
title: song.title,
artist: song.artist,
artistId: `artist-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
artworkUrl: song.coverUrl || "[https://picsum.photos/seed/playlist/80](https://picsum.photos/seed/playlist/80)",
videoId: song.videoId,
license: "COPYRIGHTED",
query: "",
});
}

async function handleRemoveSongFromPlaylist(playlistId: string, title: string, artist: string) {
await removeSongFromPlaylist(playlistId, title, artist);
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
const success = await deletePlaylist(playlistId);
if (success) {
setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
handlePlaylistDetailClose();
}
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
              <div
                key={item.id}
                className="group flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)]"
              >
                {item.coverUrl && <img src={item.coverUrl} alt="cover" className="h-12 w-12 rounded-lg object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-[var(--text)]">{item.title ?? t("unknown_song", language)}</p>
                  <p className="truncate text-sm cardText">{item.artist ?? "-"}</p>
                  {item.album && <p className="truncate text-xs text-[var(--muted)] opacity-75">{item.album}</p>}
                </div>
                {item.createdAt && <p className="text-xs text-[var(--muted)] whitespace-nowrap">{new Date(item.createdAt).toLocaleDateString()}</p>}
                <button onClick={() => handlePlaySong(item)} className="rounded-full bg-[var(--accent)] p-2.5 text-white opacity-0 transition group-hover:opacity-100" title="Play"><Play className="w-4 h-4 text-white" /></button>
              </div>
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
              <div key={fav.id ?? idx} className="group flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)]">
                {fav.coverUrl && <img src={fav.coverUrl} alt="cover" className="h-12 w-12 rounded-lg object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-[var(--text)]">{fav.title}</p>
                  <p className="truncate text-sm cardText">{fav.artist}</p>
                  {fav.album && <p className="truncate text-xs text-[var(--muted)] opacity-75">{fav.album}</p>}
                </div>
                <button onClick={() => handlePlaySong(fav)} className="rounded-full bg-[var(--accent)] p-2.5 text-white opacity-0 transition group-hover:opacity-100" title="Play"><Play className="w-4 h-4 text-white" /></button>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center"><Heart className="w-10 h-10 text-[var(--muted)]" /><p className="font-semibold">{t("empty_favorites_heading", language)}</p><p className="cardText">{t("empty_favorites_hint", language)}</p></div>
          )}
        </div>
      </section>
    )}

    {selectedTab === "playlists" && (
      <div className="space-y-4">
        {isAuthenticated && (
          <div className="card p-4">
            {!showNewPlaylistInput ? (
              <Button onClick={() => setShowNewPlaylistInput(true)} className="w-full flex items-center justify-center gap-2"><Plus className="w-4 h-4 text-[var(--text)]" />Create New Playlist</Button>
            ) : (
              <div className="flex gap-2">
                <input type="text" placeholder="Playlist name..." value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} onKeyPress={(e) => { if (e.key === "Enter") handleCreatePlaylist(); }} className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-4 py-2 text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" autoFocus />
                <Button onClick={handleCreatePlaylist} className="flex-shrink-0">Create</Button>
                <Button variant="secondary" onClick={() => { setShowNewPlaylistInput(false); setNewPlaylistName(""); }} className="flex-shrink-0">Cancel</Button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="card p-12 text-center"><div className="mx-auto h-16 w-full max-w-md animate-pulse rounded-xl bg-[var(--surface-raised)]" /></div>
        ) : filteredPlaylists.length === 0 ? (
          <div className="col-span-full card p-12 text-center"><div className="flex flex-col items-center gap-2"><ListMusic className="w-10 h-10 text-[var(--muted)]" /><p className="font-semibold">{t("empty_playlists_heading", language)}</p><p className="cardText">{t("empty_playlists_hint", language)}</p></div></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredPlaylists.map((playlist) => (
              <div key={playlist.id} onClick={() => handlePlaylistCardClick(playlist)} className="card p-5 hover:border-[var(--accent)]/50 transition cursor-pointer hover:bg-[var(--surface-2)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-[var(--text)]">{playlist.name}</h3>
                    <p className="text-sm text-[var(--muted)] mt-1">{playlist.songs.length} {playlist.songs.length === 1 ? "song" : "songs"}</p>
                    {playlist.songs.length > 0 && <div className="mt-3 space-y-1">{playlist.songs.slice(0, 2).map((song, idx) => (<p key={idx} className="text-xs text-[var(--muted)]">{song.title} • {song.artist}</p>))}{playlist.songs.length > 2 && <p className="text-xs text-[var(--muted)]">+{playlist.songs.length - 2} more</p>}</div>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(playlist.id); }} className="rounded-lg border border-red-400/40 px-2 py-1.5 text-red-300 hover:bg-red-500/10 text-xs">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </div>

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
