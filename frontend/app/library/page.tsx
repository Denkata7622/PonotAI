"use client";

import { useMemo, useState, useEffect } from "react";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { usePlayer } from "../../components/PlayerProvider";
import { useUser } from "../../src/context/UserContext";
import { LibraryStatistics } from "../../src/components/LibraryStatistics";
import PlaylistDetail from "../../components/PlaylistDetail";
import type { Playlist } from "../../features/library/types";
import { getPlaylists, createPlaylist, deletePlaylist, updatePlaylistName, addSongToPlaylist, removeSongFromPlaylist } from "../../features/library/api";
import { Button } from "../../src/components/ui/Button";

type HistoryItem = {
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
  const { favorites: userFavorites, isAuthenticated } = useUser();
  const [favorites] = useState<string[]>(() => parseStorage<string[]>("ponotai.library.favorites", []));
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [history] = useState<HistoryItem[]>(() => parseStorage<HistoryItem[]>("ponotai-history", []));
  const [selectedTab, setSelectedTab] = useState<"favorites" | "playlists" | "history">("history");
  const [searchQuery, setSearchQuery] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showNewPlaylistInput, setShowNewPlaylistInput] = useState(false);
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);
  const [songMenuOpen, setSongMenuOpen] = useState<{ playlistId: string; songIndex: number } | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [showPlaylistDetail, setShowPlaylistDetail] = useState(false);

  // Load playlists from backend when authenticated
  useEffect(() => {
    async function loadPlaylists() {
      if (isAuthenticated) {
        setLoading(true);
        const loaded = await getPlaylists();
        setPlaylists(loaded);
        setLoading(false);
      } else {
        // Load from localStorage if not authenticated
        const stored = parseStorage<Playlist[]>("ponotai.library.playlists", []);
        setPlaylists(stored);
        setLoading(false);
      }
    }
    loadPlaylists();
  }, [isAuthenticated]);

  const recentSongs = useMemo(() => history.slice(0, 12), [history]);

  const filteredHistory = useMemo(() => {
    if (!searchQuery) return recentSongs;
    const query = searchQuery.toLowerCase();
    return recentSongs.filter(
      (item) =>
        (item.title?.toLowerCase().includes(query)) ||
        (item.artist?.toLowerCase().includes(query)) ||
        (item.album?.toLowerCase().includes(query))
    );
  }, [recentSongs, searchQuery]);

  const filteredFavorites = useMemo(() => {
    if (!searchQuery || !userFavorites) return userFavorites || [];
    const query = searchQuery.toLowerCase();
    return userFavorites.filter(
      (fav) =>
        fav.title.toLowerCase().includes(query) ||
        fav.artist.toLowerCase().includes(query) ||
        (fav.album?.toLowerCase().includes(query))
    );
  }, [userFavorites, searchQuery]);

  const filteredPlaylists = useMemo(() => {
    if (!searchQuery) return playlists;
    const query = searchQuery.toLowerCase();
    return playlists.filter((p) => p.name.toLowerCase().includes(query));
  }, [playlists, searchQuery]);

  function handlePlaySong(song: HistoryItem | any) {
    if (!song?.title && !song?.songName) return;
    const title = song.title || song.songName;
    const artist = song.artist;
    if (!title || !artist) return;

    addToQueue({
      id: `history-${title}-${artist}`.toLowerCase().replace(/\s+/g, "-"),
      title: title,
      artistName: artist,
      artistId: `artist-${artist}`.toLowerCase().replace(/\s+/g, "-"),
      artworkUrl: song.coverUrl || "https://picsum.photos/seed/library/80",
      license: "COPYRIGHTED",
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
      artistName: song.artist,
      artistId: `artist-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
      artworkUrl: song.coverUrl || "https://picsum.photos/seed/playlist/80",
      license: "COPYRIGHTED",
    });
  }

  async function handleRemoveSongFromPlaylist(playlistId: string, title: string, artist: string) {
    await removeSongFromPlaylist(playlistId, title, artist);
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === playlistId
          ? {
              ...p,
              songs: p.songs.filter((s) => !(s.title === title && s.artist === artist)),
            }
          : p
      )
    );
    if (selectedPlaylist?.id === playlistId) {
      setSelectedPlaylist((prev) =>
        prev
          ? {
              ...prev,
              songs: prev.songs.filter((s) => !(s.title === title && s.artist === artist)),
            }
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

  return (
    <section className="space-y-6">
      {/* Header Card */}
      <div className="card p-6">
        <h1 className="cardTitle text-3xl font-bold">{t("nav_library", language)}</h1>
        <p className="cardText mt-2">
          {language === "bg" 
            ? "Управлявай любимите си песни, плейлистите и историята на едно място." 
            : "Manage your favorites, playlists and history in one place."}
        </p>
        {isAuthenticated && <p className="cardText mt-2 text-xs">✓ Cloud synced</p>}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="card p-5">
          <p className="cardText text-sm">{t("library_favorites", language)}</p>
          <p className="cardTitle mt-2 text-3xl font-semibold">{Math.max(favorites.length, userFavorites?.length ?? 0)}</p>
        </div>
        <div className="card p-5">
          <p className="cardText text-sm">{t("library_playlists", language)}</p>
          <p className="cardTitle mt-2 text-3xl font-semibold">{playlists.length}</p>
        </div>
        <div className="card p-5">
          <p className="cardText text-sm">{t("history_title", language)}</p>
          <p className="cardTitle mt-2 text-3xl font-semibold">{history.length}</p>
        </div>
        <div className="card p-5 bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent-2)]/10">
          <p className="cardText text-sm">Total Collection</p>
          <p className="cardTitle mt-2 text-3xl font-semibold">{
            Math.max(favorites.length, userFavorites?.length ?? 0) + 
            playlists.reduce((sum, p) => sum + p.songs.length, 0) + 
            history.length
          }</p>
        </div>
      </div>

      {/* Statistics Section */}
      {history.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="cardTitle text-xl font-semibold">📊 Insights</h2>
          </div>
          {userFavorites && (
            <LibraryStatistics history={history} favorites={userFavorites.map(f => ({ id: "", ...f, savedAt: new Date().toISOString() }))} />
          )}
        </div>
      )}

      {/* Tabs */}
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

      {/* Search Bar */}
      {selectedTab !== "playlists" && (
        <div className="card p-4">
          <input
            type="text"
            placeholder={`Search ${selectedTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
      )}

      {/* Tab Content */}
      <div className="min-h-96">
        {/* History Tab */}
        {selectedTab === "history" && (
          <div className="space-y-3">
            {filteredHistory.length === 0 ? (
              <div className="card p-12 text-center">
                <p className="cardText">{searchQuery ? "No results found" : t("history_empty", language)}</p>
              </div>
            ) : (
              filteredHistory.map((item) => (
                <div key={item.id} className="group flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)]">
                  {item.coverUrl && (
                    <img 
                      src={item.coverUrl} 
                      alt="cover"
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-[var(--text)]">{item.title}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{item.artist}</p>
                    {item.album && <p className="truncate text-xs text-[var(--muted)] opacity-75">{item.album}</p>}
                  </div>
                  {item.createdAt && (
                    <p className="text-xs text-[var(--muted)] whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  )}
                  <button
                    onClick={() => handlePlaySong(item)}
                    className="rounded-full bg-[var(--accent)] p-2.5 text-white opacity-0 transition group-hover:opacity-100"
                    title="Play"
                  >
                    ▶
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Favorites Tab */}
        {selectedTab === "favorites" && (
          <div className="space-y-3">
            {filteredFavorites.length > 0 ? (
              filteredFavorites.map((fav, idx) => (
                <div key={idx} className="group flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)]">
                  {fav.coverUrl && (
                    <img 
                      src={fav.coverUrl} 
                      alt="cover"
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-[var(--text)]">{fav.title}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{fav.artist}</p>
                    {fav.album && <p className="truncate text-xs text-[var(--muted)] opacity-75">{fav.album}</p>}
                  </div>
                  <button
                    onClick={() => handlePlaySong(fav)}
                    className="rounded-full bg-[var(--accent)] p-2.5 text-white opacity-0 transition group-hover:opacity-100"
                    title="Play"
                  >
                    ▶
                  </button>
                </div>
              ))
            ) : (
              <div className="card p-12 text-center">
                <p className="cardText">{searchQuery ? "No favorites match your search" : "No favorites yet. Save songs while browsing!"}</p>
              </div>
            )}
          </div>
        )}

        {/* Playlists Tab */}
        {selectedTab === "playlists" && (
          <div className="space-y-4">
            {/* Create New Playlist */}
            {isAuthenticated && (
              <div className="card p-4">
                {!showNewPlaylistInput ? (
                  <Button onClick={() => setShowNewPlaylistInput(true)} className="w-full">
                    + Create New Playlist
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Playlist name..."
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter") handleCreatePlaylist();
                      }}
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      autoFocus
                    />
                    <Button onClick={handleCreatePlaylist} className="flex-shrink-0">
                      Create
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowNewPlaylistInput(false);
                        setNewPlaylistName("");
                      }}
                      className="flex-shrink-0"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Playlists Grid */}
            {loading ? (
              <div className="card p-12 text-center">
                <p className="cardText">Loading playlists...</p>
              </div>
            ) : filteredPlaylists.length === 0 ? (
              <div className="col-span-full card p-12 text-center">
                <p className="cardText">{searchQuery ? "No playlists match your search" : "No playlists created yet."}</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredPlaylists.map((playlist) => (
                  <div
                    key={playlist.id}
                    onClick={() => handlePlaylistCardClick(playlist)}
                    className="card p-5 hover:border-[var(--accent)]/50 transition cursor-pointer hover:bg-[var(--surface-2)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-[var(--text)]">{playlist.name}</h3>
                        <p className="text-sm text-[var(--muted)] mt-1">
                          {playlist.songs.length} {playlist.songs.length === 1 ? "song" : "songs"}
                        </p>
                        {playlist.songs.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {playlist.songs.slice(0, 2).map((song, idx) => (
                              <p key={idx} className="text-xs text-[var(--muted)]">
                                {song.title} • {song.artist}
                              </p>
                            ))}
                            {playlist.songs.length > 2 && (
                              <p className="text-xs text-[var(--muted)]">+{playlist.songs.length - 2} more</p>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePlaylist(playlist.id);
                        }}
                        className="rounded-lg border border-red-400/40 px-2 py-1.5 text-red-300 hover:bg-red-500/10 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Playlist Detail Modal */}
      {showPlaylistDetail && selectedPlaylist && (
        <PlaylistDetail
          playlist={selectedPlaylist}
          onClose={handlePlaylistDetailClose}
          onPlaySong={handlePlayPlaylistSong}
          onRemoveSong={handleRemoveSongFromPlaylist}
          onDeletePlaylist={handlePlaylistDetailDelete}
          onRenamePlaylist={handlePlaylistRename}
        />
      )}
    </section>
  );
}
