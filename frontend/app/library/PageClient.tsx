"use client";

import { useMemo, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useProfile } from "../../lib/ProfileContext";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { usePlayer } from "../../components/PlayerProvider";
import { useUser } from "../../src/context/UserContext";
import PlaylistDetail from "../../components/PlaylistDetail";
import PlaylistCard from "../../components/PlaylistCard";
import SongRow from "../../components/SongRow";
import NewPlaylistModal from "../../components/NewPlaylistModal";
import type { Playlist, PlaylistSong } from "../../features/library/types";
import { useLibrary } from "../../features/library/useLibrary";
import {
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  updatePlaylistName,
  removeSongFromPlaylist,
} from "../../features/library/api";
import { Button } from "../../src/components/ui/Button";
import { Clock, Gem, Heart, ListMusic, Plus } from "../../components/icons";
import { dedupeByTrack } from "../../lib/dedupe";
import { toCanonicalSong, toSongKey } from "../../lib/songIdentity";

type Song = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  createdAt?: string;
  videoId?: string;
};

type SongInput = {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  createdAt?: string;
  videoId?: string;
};

function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] py-10 text-center">
      {icon}
      <p className="font-semibold text-[var(--text)]">{title}</p>
      <p className="cardText px-4">{hint}</p>
    </div>
  );
}

export default function LibraryPage() {
  const { language } = useLanguage();
  const { addManyToQueue, playNow } = usePlayer();
  const {
    favorites: userFavorites,
    history: userHistory,
    deleteHistoryItem,
    isAuthenticated,
    isLoading,
  } = useUser();
  const { profile } = useProfile();
  const { toggleFavorite, ultraLikedSet, toggleUltraLike } = useLibrary(profile.id);

  const normalizeSong = (item: SongInput): Song => {
    const canonical = toCanonicalSong(item);
    return {
      id: item.id ?? canonical.key,
      title: canonical.title || t("unknown_song", language),
      artist: canonical.artist || "-",
      album: canonical.album,
      coverUrl: canonical.coverUrl,
      createdAt: item.createdAt,
      videoId: item.videoId,
    };
  };

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewPlaylistModal, setShowNewPlaylistModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"saved" | "playlists" | "history">("saved");
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [showPlaylistDetail, setShowPlaylistDetail] = useState(false);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [statusToast, setStatusToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const deletedPlaylistRef = useRef<Playlist | null>(null);
  const deleteTimerRef = useRef<number | null>(null);

  const searchParams = useSearchParams();
  const playlistFocusId = searchParams.get("playlistId");
  const tabParam = searchParams.get("tab");

  useEffect(() => {
    if (tabParam === "saved" || tabParam === "favorites") {
      setSelectedTab("saved");
    } else if (tabParam === "playlists" || tabParam === "history") {
      setSelectedTab(tabParam);
    }
  }, [tabParam]);

  const history = useMemo(
    () => userHistory.map((item) => normalizeSong(item as SongInput)),
    [language, userHistory],
  );

  const dedupedHistory = useMemo(
    () => dedupeByTrack(history, (item) => item.title ?? "", (item) => item.artist ?? ""),
    [history],
  );

  const mergedFavorites = useMemo(() => {
    const baseFavorites = (userFavorites || []).map((item) => normalizeSong(item as SongInput));
    return dedupeByTrack(baseFavorites, (item) => item.title ?? "", (item) => item.artist ?? "");
  }, [language, userFavorites]);

  const ultraLikedFavorites = useMemo(
    () => mergedFavorites.filter((favorite) => ultraLikedSet.has(toSongKey(favorite))),
    [mergedFavorites, ultraLikedSet],
  );

  const standardFavorites = useMemo(
    () => mergedFavorites.filter((favorite) => !ultraLikedSet.has(toSongKey(favorite))),
    [mergedFavorites, ultraLikedSet],
  );

  const loadPlaylists = useCallback(async () => {
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
  }, [isAuthenticated, language]);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists, playlistFocusId]);

  useEffect(() => {
    if (!playlistFocusId) return;
    const target = playlists.find((playlist) => playlist.id === playlistFocusId);
    if (!target) return;
    setSelectedTab("playlists");
    setSelectedPlaylist(target);
    setShowPlaylistDetail(true);
  }, [playlistFocusId, playlists]);

  useEffect(() => () => {
    if (deleteTimerRef.current) {
      window.clearTimeout(deleteTimerRef.current);
    }
  }, []);

  const filteredHistory = useMemo(() => {
    if (selectedTab !== "history" || !searchQuery) return dedupedHistory;
    const q = searchQuery.toLowerCase();
    return dedupedHistory.filter(
      (item) =>
        (item.title ?? "").toLowerCase().includes(q)
        || (item.artist ?? "").toLowerCase().includes(q)
        || (item.album ?? "").toLowerCase().includes(q),
    );
  }, [dedupedHistory, searchQuery, selectedTab]);

  const filteredStandardFavorites = useMemo(() => {
    if (selectedTab !== "saved" || !searchQuery) return standardFavorites;
    const q = searchQuery.toLowerCase();
    return standardFavorites.filter(
      (item) =>
        (item.title ?? "").toLowerCase().includes(q)
        || (item.artist ?? "").toLowerCase().includes(q)
        || (item.album ?? "").toLowerCase().includes(q),
    );
  }, [searchQuery, selectedTab, standardFavorites]);

  const filteredUltraLikedFavorites = useMemo(() => {
    if (selectedTab !== "saved" || !searchQuery) return ultraLikedFavorites;
    const q = searchQuery.toLowerCase();
    return ultraLikedFavorites.filter(
      (item) =>
        (item.title ?? "").toLowerCase().includes(q)
        || (item.artist ?? "").toLowerCase().includes(q)
        || (item.album ?? "").toLowerCase().includes(q),
    );
  }, [searchQuery, selectedTab, ultraLikedFavorites]);

  const filteredPlaylists = useMemo(() => {
    if (selectedTab !== "playlists" || !searchQuery) return playlists;
    const query = searchQuery.toLowerCase();
    return playlists.filter((playlist) => playlist.name.toLowerCase().includes(query));
  }, [playlists, searchQuery, selectedTab]);
  const visibleHistory = useMemo(() => {
    if (showAllHistory) return filteredHistory;
    return filteredHistory.slice(0, 20);
  }, [filteredHistory, showAllHistory]);

  function toPlayableSong(song: Song | PlaylistSong) {
    const safeTitle = song.title || t("unknown_song", language);
    const safeArtist = song.artist || "-";
    return {
      id: `${safeTitle}-${safeArtist}`.toLowerCase().replace(/\s+/g, "-"),
      title: safeTitle,
      artist: safeArtist,
      artistId: `artist-${safeArtist}`.toLowerCase().replace(/\s+/g, "-"),
      artworkUrl: song.coverUrl || "https://picsum.photos/seed/library/80",
      videoId: "videoId" in song ? song.videoId : undefined,
      license: "COPYRIGHTED" as const,
      query: `${safeTitle} ${safeArtist} official audio`,
    };
  }

  function handlePlaySong(song: Song | PlaylistSong) {
    playNow(toPlayableSong(song), "manual");
  }

  function handleAddPlaylistToQueue(playlist: Playlist) {
    if (playlist.songs.length === 0) return;
    addManyToQueue(playlist.songs.map((song) => toPlayableSong(song)), "playlist");
    showStatusToast("success", t("playlist_added_to_queue", language));
  }

  function handlePlayPlaylist(playlist: Playlist) {
    if (playlist.songs.length === 0) return;
    const [firstSong, ...restSongs] = playlist.songs;
    if (!firstSong) return;
    playNow(toPlayableSong(firstSong), "playlist");
    if (restSongs.length > 0) {
      addManyToQueue(restSongs.map((song) => toPlayableSong(song)), "playlist");
    }
  }

  function handlePlayAllFromDetail(songs: PlaylistSong[]) {
    const [firstSong, ...restSongs] = songs;
    if (!firstSong) return;
    playNow(toPlayableSong(firstSong), "playlist");
    if (restSongs.length > 0) {
      addManyToQueue(restSongs.map((song) => toPlayableSong(song)), "playlist");
    }
  }

  async function handleDeleteHistoryItem(id: string) {
    if (!isAuthenticated) return;
    await deleteHistoryItem(id);
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
      const pendingDelete = deletedPlaylistRef.current;
      if (!pendingDelete) return;
      if (isAuthenticated) {
        try {
          await deletePlaylist(playlistId);
        } catch {
          setPlaylists((prev) => [pendingDelete, ...prev]);
          showStatusToast("error", language === "bg" ? "Плейлистът не можа да бъде изтрит." : "Failed to delete playlist.");
        }
      }
      deletedPlaylistRef.current = null;
      setShowUndoToast(false);
      deleteTimerRef.current = null;
    }, 4000);
  }

  async function handleRemoveSongFromPlaylist(playlistId: string, title: string, artist: string) {
    if (!isAuthenticated) {
      showStatusToast("error", language === "bg" ? "Влез, за да редактираш плейлисти." : "Sign in to edit playlists.");
      return;
    }
    try {
      await removeSongFromPlaylist(playlistId, title, artist);
    } catch {
      showStatusToast("error", language === "bg" ? "Песента не можа да бъде премахната." : "Failed to remove song from playlist.");
      return;
    }
    setPlaylists((prev) => prev.map((playlist) => (playlist.id === playlistId
      ? { ...playlist, songs: playlist.songs.filter((song) => toSongKey(song) !== toSongKey({ title, artist })) }
      : playlist)));

    if (selectedPlaylist?.id === playlistId) {
      setSelectedPlaylist((prev) => (prev
        ? { ...prev, songs: prev.songs.filter((song) => toSongKey(song) !== toSongKey({ title, artist })) }
        : null));
    }
  }

  async function handlePlaylistRename(playlistId: string, newName: string) {
    const success = await updatePlaylistName(playlistId, newName);
    if (!success) return;
    setPlaylists((prev) => prev.map((playlist) => (playlist.id === playlistId ? { ...playlist, name: newName } : playlist)));
    setSelectedPlaylist((prev) => (prev?.id === playlistId ? { ...prev, name: newName } : prev));
  }

  function handlePromptRename(playlist: Playlist) {
    const nextName = window.prompt(t("playlist_rename_prompt", language), playlist.name);
    if (!nextName || nextName.trim() === playlist.name) return;
    void handlePlaylistRename(playlist.id, nextName.trim());
  }

  function showStatusToast(kind: "success" | "error", message: string) {
    setStatusToast({ kind, message });
    window.setTimeout(() => setStatusToast(null), 3000);
  }

  function handleSongsAddedToPlaylist(playlistId: string, songs: PlaylistSong[]) {
    if (songs.length === 0) return;
    setPlaylists((prev) => prev.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;
      const nextSongs = [...playlist.songs];
      for (const song of songs) {
        const key = toSongKey(song);
        if (!nextSongs.some((existing) => toSongKey(existing) === key)) {
          nextSongs.push(song);
        }
      }
      return { ...playlist, songs: nextSongs };
    }));

    setSelectedPlaylist((prev) => {
      if (!prev || prev.id !== playlistId) return prev;
      const nextSongs = [...prev.songs];
      for (const song of songs) {
        const key = toSongKey(song);
        if (!nextSongs.some((existing) => toSongKey(existing) === key)) {
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

  const uniqueLibrarySongsCount = useMemo(() => {
    const keys = new Set<string>();
    for (const favorite of mergedFavorites) {
      keys.add(toSongKey(favorite));
    }
    for (const historySong of dedupedHistory) {
      keys.add(toSongKey(historySong));
    }
    for (const playlist of playlists) {
      for (const song of playlist.songs) {
        keys.add(toSongKey(song));
      }
    }
    return keys.size;
  }, [dedupedHistory, mergedFavorites, playlists]);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="card p-4 sm:p-6"><div className="h-28 animate-pulse rounded-xl bg-[var(--surface-raised)]" /></div>
        <div className="card p-4 sm:p-6"><div className="h-64 animate-pulse rounded-xl bg-[var(--surface-raised)]" /></div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <header className="card space-y-2 p-4 sm:p-5">
        <h1 className="cardTitle text-2xl font-bold">{t("nav_library", language)}</h1>
        <p className="cardText text-sm">{language === "bg" ? "Бърз достъп до любими, плейлисти и история." : "Quick access to favorites, playlists, and history."}</p>
        {isAuthenticated ? <p className="cardText text-xs">{t("library_cloud_synced", language)}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">{t("library_saved_songs", language)}: {mergedFavorites.length}</span>
          <span className="rounded-full border border-sky-400/30 px-3 py-1 text-xs text-sky-300">{t("library_super_liked", language)}: {ultraLikedFavorites.length}</span>
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">{t("library_playlists", language)}: {playlists.length}</span>
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">{t("library_tracks_total", language)}: {uniqueLibrarySongsCount}</span>
        </div>
      </header>

      <div className="card p-2">
        <div className="app-tabs">
          {(["saved", "playlists", "history"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setSelectedTab(tab);
                setSearchQuery("");
              }}
              className={`app-tab ${selectedTab === tab ? "app-tab-active" : ""}`}
            >
              {tab === "saved" ? `${language === "bg" ? "Запазени" : "Saved"} (${mergedFavorites.length})` : null}
              {tab === "playlists" ? `${t("library_playlists", language)} (${playlists.length})` : null}
              {tab === "history" ? `${t("history_title", language)} (${dedupedHistory.length})` : null}
            </button>
          ))}
        </div>
      </div>
      <div className="card p-3">
        <input
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder={selectedTab === "saved" ? (language === "bg" ? "Търси в запазени песни" : "Search saved songs") : selectedTab === "history" ? (language === "bg" ? "Търси в историята" : "Search history") : (language === "bg" ? "Търси плейлисти" : "Search playlists")}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      {loadError ? <div className="card p-4 text-sm status-danger">{loadError}</div> : null}
      {showUndoToast ? (
        <div className="card relative overflow-hidden p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>{t("toast_playlist_deleted", language)}</span>
            <button type="button" className="font-semibold text-[var(--accent)]" onClick={handleUndoDeletePlaylist}>{t("toast_undo", language)}</button>
          </div>
          <div className="absolute bottom-0 left-0 h-[2px] bg-[var(--accent)]" style={{ animation: "shrink 4s linear forwards" }} />
        </div>
      ) : null}
      {statusToast ? (
        <div className={`card p-4 text-sm ${statusToast.kind === "success" ? "status-surface-success" : "status-surface-danger"}`}>
          {statusToast.message}
        </div>
      ) : null}

      {selectedTab === "saved" ? <section className="card space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="cardTitle text-xl font-semibold">{t("library_favorites", language)}</h2>
            <p className="cardText mt-1">{t("library_saved_songs_hint", language)}</p>
          </div>
        </div>
        {filteredUltraLikedFavorites.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-sky-400/30 bg-sky-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-sky-300">
                <Gem className="h-4 w-4" />
                {t("library_super_liked", language)}
              </p>
              <span className="rounded-full border border-sky-400/30 px-2 py-0.5 text-xs text-sky-300">{filteredUltraLikedFavorites.length}</span>
            </div>
            {filteredUltraLikedFavorites.map((song, index) => {
              const key = toSongKey({ title: song.title, artist: song.artist });
              return (
                <SongRow
                  key={song.id ?? index}
                  id={song.id ?? `${song.title}-${song.artist}-${index}`}
                  title={song.title ?? t("unknown_song", language)}
                  artist={song.artist ?? "-"}
                  artworkUrl={song.coverUrl}
                  onPlay={() => handlePlaySong(song)}
                  showMoreMenu
                  isFavorite
                  onFavorite={() => toggleFavorite(key, song.title, song.artist, song.coverUrl)}
                  onUltraLikeToggle={() => {
                    void toggleUltraLike(key);
                  }}
                  isUltraLiked
                  playlists={playlists}
                  onAddToPlaylist={(playlistId) => handleSongsAddedToPlaylist(playlistId, [{
                    title: song.title ?? t("unknown_song", language),
                    artist: song.artist ?? "-",
                    album: song.album,
                    coverUrl: song.coverUrl,
                    videoId: song.videoId,
                  }])}
                />
              );
            })}
          </div>
        ) : null}

        <div className="space-y-2">
          {filteredStandardFavorites.length === 0 && filteredUltraLikedFavorites.length === 0 ? (
            <EmptyState
              icon={<Heart className="h-10 w-10 text-[var(--muted)]" />}
              title={t("empty_favorites_heading", language)}
              hint={t("empty_favorites_hint", language)}
            />
          ) : filteredStandardFavorites.map((song, index) => {
            const key = toSongKey({ title: song.title, artist: song.artist });
            return (
              <SongRow
                key={song.id ?? index}
                id={song.id ?? `${song.title}-${song.artist}-${index}`}
                title={song.title ?? t("unknown_song", language)}
                artist={song.artist ?? "-"}
                artworkUrl={song.coverUrl}
                onPlay={() => handlePlaySong(song)}
                showMoreMenu
                isFavorite
                onFavorite={() => toggleFavorite(key, song.title, song.artist, song.coverUrl)}
                onUltraLikeToggle={() => {
                  void toggleUltraLike(key);
                }}
                playlists={playlists}
                onAddToPlaylist={(playlistId) => handleSongsAddedToPlaylist(playlistId, [{
                  title: song.title ?? t("unknown_song", language),
                  artist: song.artist ?? "-",
                  album: song.album,
                  coverUrl: song.coverUrl,
                  videoId: song.videoId,
                }])}
              />
            );
          })}
        </div>
      </section> : null}

      {selectedTab === "history" ? <section className="card space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="cardTitle text-xl font-semibold">{t("history_title", language)}</h2>
          <p className="cardText mt-1">{language === "bg" ? "Наскоро разпознати песни." : "Recently recognized songs."}</p>
        </div>
        <div className="space-y-2">
          {filteredHistory.length === 0 ? (
            <EmptyState icon={<Clock className="h-10 w-10 text-[var(--muted)]" />} title={t("empty_history_heading", language)} hint={t("empty_history_hint", language)} />
          ) : visibleHistory.map((song) => {
            const key = toSongKey({ title: song.title, artist: song.artist });
            const isFavorite = mergedFavorites.some((favorite) => toSongKey(favorite) === key);
            return (
              <SongRow
                key={song.id}
                id={song.id}
                title={song.title ?? t("unknown_song", language)}
                artist={song.artist ?? "-"}
                artworkUrl={song.coverUrl}
                onPlay={() => handlePlaySong(song)}
                onDelete={() => void handleDeleteHistoryItem(song.id)}
                showMoreMenu
                onFavorite={() => toggleFavorite(key, song.title, song.artist, song.coverUrl)}
                onUltraLikeToggle={() => {
                  void toggleUltraLike(key);
                }}
                isFavorite={isFavorite}
                isUltraLiked={ultraLikedSet.has(key)}
                playlists={playlists}
                onAddToPlaylist={(playlistId) => handleSongsAddedToPlaylist(playlistId, [{
                  title: song.title ?? t("unknown_song", language),
                  artist: song.artist ?? "-",
                  album: song.album,
                  coverUrl: song.coverUrl,
                  videoId: song.videoId,
                }])}
              />
            );
          })}
          {filteredHistory.length > 20 ? (
            <div className="pt-2">
              <Button variant="secondary" size="sm" onClick={() => setShowAllHistory((prev) => !prev)}>
                {showAllHistory ? (language === "bg" ? "Покажи по-малко" : "Show less") : (language === "bg" ? "Покажи още" : "Show more")}
              </Button>
            </div>
          ) : null}
        </div>
      </section> : null}

      {selectedTab === "playlists" ? <section className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="cardTitle text-xl font-semibold">{t("library_playlists", language)}</h2>
            <p className="cardText mt-1">{t("library_playlists_hint", language)}</p>
          </div>
          <Button onClick={() => setShowNewPlaylistModal(true)} className="inline-flex items-center gap-2" disabled={!isAuthenticated}>
            <Plus className="h-4 w-4 text-white" />
            {t("playlist_new", language)}
          </Button>
        </div>

        {loading ? (
          <div className="h-20 animate-pulse rounded-xl bg-[var(--surface-raised)]" />
        ) : !isAuthenticated ? (
          <EmptyState
            icon={<ListMusic className="h-10 w-10 text-[var(--muted)]" />}
            title={t("library_sign_in_for_playlists", language)}
            hint={t("library_sign_in_for_playlists_hint", language)}
          />
        ) : filteredPlaylists.length === 0 ? (
          <EmptyState icon={<ListMusic className="h-10 w-10 text-[var(--muted)]" />} title={t("empty_playlists_heading", language)} hint={t("empty_playlists_hint", language)} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filteredPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                onClick={(target) => {
                  setSelectedPlaylist(target);
                  setShowPlaylistDetail(true);
                }}
                onDelete={(playlistId) => {
                  void handleDeletePlaylist(playlistId);
                }}
                onPlay={handlePlayPlaylist}
                onAddToQueue={handleAddPlaylistToQueue}
                onRename={handlePromptRename}
              />
            ))}
          </div>
        )}
      </section> : null}

      {showNewPlaylistModal ? (
        <NewPlaylistModal
          onClose={() => setShowNewPlaylistModal(false)}
          onCreatePlaylist={handleCreatePlaylist}
          onCreated={(playlist) => {
            setPlaylists((prev) => [...prev.filter((entry) => entry.id !== playlist.id), playlist]);
            setShowNewPlaylistModal(false);
          }}
        />
      ) : null}

      {showPlaylistDetail && selectedPlaylist ? (
        <PlaylistDetail
          playlist={selectedPlaylist}
          onClose={() => {
            setShowPlaylistDetail(false);
            setSelectedPlaylist(null);
          }}
          onPlaySong={(song) => handlePlaySong(song)}
          onRemoveSong={(title, artist) => {
            void handleRemoveSongFromPlaylist(selectedPlaylist.id, title, artist);
          }}
          onSongsAdded={handleSongsAddedToPlaylist}
          onToast={showStatusToast}
          onDeletePlaylist={() => {
            void handleDeletePlaylist(selectedPlaylist.id);
          }}
          onRenamePlaylist={(newName) => {
            void handlePlaylistRename(selectedPlaylist.id, newName);
          }}
          onPlayAll={handlePlayAllFromDetail}
        />
      ) : null}
    </section>
  );
}
