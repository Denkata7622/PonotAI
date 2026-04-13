"use client";

import { useEffect, useMemo, useState } from "react";
import { scopedKey, useProfile } from "../lib/ProfileContext";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { normalizeTrackKey } from "../lib/dedupe";
import { useLibrary } from "../features/library/useLibrary";
import { Button } from "../src/components/ui/Button";
import Modal from "../src/components/ui/Modal";
import SongRow from "./SongRow";
import { Check, Clock, Heart, Plus, Search } from "../lucide-react";
import type { Playlist, PlaylistSong } from "../features/library/types";

type ModalTrack = PlaylistSong & { id: string };

type NewPlaylistModalProps = {
  onClose: () => void;
  onCreated?: (playlist: Playlist) => void;
  onSongsAdded?: (playlistId: string, songs: PlaylistSong[]) => void | Promise<void>;
  onToast?: (kind: "success" | "error", message: string) => void;
  onCreatePlaylist?: (name: string) => Promise<Playlist | null> | Playlist | null;
  existingPlaylistId?: string;
  initialName?: string;
};

function parseStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? JSON.stringify(fallback)) as T;
  } catch {
    return fallback;
  }
}

export default function NewPlaylistModal({
  onClose,
  onCreated,
  onSongsAdded,
  onToast,
  onCreatePlaylist,
  existingPlaylistId,
  initialName = "",
}: NewPlaylistModalProps) {
  const { language } = useLanguage();
  const { profile } = useProfile();
  const { createPlaylist, addSongsToPlaylist } = useLibrary(profile.id);

  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"recognized" | "favorites" | "search">("recognized");
  const [historySongs, setHistorySongs] = useState<ModalTrack[]>([]);
  const [favoriteSongs, setFavoriteSongs] = useState<ModalTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ModalTrack[]>([]);
  const [selectedSongs, setSelectedSongs] = useState<Map<string, ModalTrack>>(new Map());

  const historyKey = profile?.id ? scopedKey("ponotai-history", profile.id) : "ponotai-history";
  const favoritesKey = profile?.id ? scopedKey("ponotai.library.favorites", profile.id) : "ponotai.library.favorites";

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    const historyRaw = parseStorage<any[]>(historyKey, []);
    const normalizedHistory = historyRaw.map((item, index) => ({
      id: item.id ?? `history-${index}-${item.title ?? item.songName ?? "song"}`,
      title: item.title ?? item.songName ?? item.song?.songName ?? t("unknown_song", language),
      artist: item.artist ?? item.song?.artist ?? "-",
      album: item.album ?? item.song?.album,
      coverUrl: item.coverUrl ?? item.song?.coverUrl,
      videoId: item.videoId ?? item.song?.videoId,
    }));
    setHistorySongs(normalizedHistory);

    const favoritesRaw = parseStorage<any[]>(favoritesKey, []);
    const normalizedFavorites = favoritesRaw.map((item, index) => ({
      id: item.id ?? `favorite-${index}-${item.title ?? item.songName ?? "song"}`,
      title: item.title ?? item.songName ?? item.song?.songName ?? t("unknown_song", language),
      artist: item.artist ?? item.song?.artist ?? "-",
      album: item.album ?? item.song?.album,
      coverUrl: item.coverUrl ?? item.song?.coverUrl,
      videoId: item.videoId ?? item.song?.videoId,
    }));
    setFavoriteSongs(normalizedFavorites);
  }, [favoritesKey, historyKey, language]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearchQuery("");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 500);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedSearchQuery || debouncedSearchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    fetch(`/api/search?q=${encodeURIComponent(debouncedSearchQuery)}`)
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) {
            setSearchResults([]);
          }
          return;
        }
        const payload = (await response.json()) as Array<{ videoId?: string; title: string; artist: string; thumbnailUrl?: string }>;
        if (cancelled) return;
        const normalizedResults = payload.map((item, index) => ({
          id: item.videoId ?? `search-${index}-${item.title}`,
          title: item.title,
          artist: item.artist,
          coverUrl: item.thumbnailUrl,
          videoId: item.videoId,
        }));
        setSearchResults(normalizedResults);
      })
      .catch(() => {
        if (!cancelled) {
          setSearchResults([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearchQuery]);


  const tracksByTab = useMemo(() => {
    if (selectedTab === "favorites") return favoriteSongs;
    if (selectedTab === "search") return searchResults;
    return historySongs;
  }, [favoriteSongs, historySongs, searchResults, selectedTab]);

  function toggleTrackSelection(track: ModalTrack) {
    const key = normalizeTrackKey(track.title, track.artist);
    setSelectedSongs((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, track);
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    if (!existingPlaylistId && !name.trim()) return;

    setIsSubmitting(true);
    try {
      let createdPlaylist: Playlist | null = null;
      let targetPlaylistId = existingPlaylistId;

      if (!targetPlaylistId) {
        createdPlaylist = onCreatePlaylist ? await onCreatePlaylist(name.trim()) : await createPlaylist(name.trim());
        targetPlaylistId = createdPlaylist?.id;
      }

      if (!targetPlaylistId) return;

      const songsToAdd = Array.from(selectedSongs.values()).map((song) => ({
        title: song.title,
        artist: song.artist,
        album: song.album,
        coverUrl: song.coverUrl,
        videoId: song.videoId,
      }));

      const successfulAdds = await addSongsToPlaylist(targetPlaylistId, songsToAdd);

      if (createdPlaylist) {
        onCreated?.({
          ...createdPlaylist,
          songs: [...createdPlaylist.songs, ...Array.from(selectedSongs.values())],
        });
      }

      if (successfulAdds > 0) {
        await onSongsAdded?.(targetPlaylistId, songsToAdd);
        onToast?.("success", t("toast_added", language, { count: successfulAdds }));
      } else if (songsToAdd.length > 0) {
        onToast?.("error", t("toast_audio_failed", language));
        return;
      }

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedCountLabel = t("playlist_modal_songs_selected", language).replace("{n}", `${selectedSongs.size}`);
  const isNameValid = existingPlaylistId ? true : name.trim().length > 0;

  return (
    <Modal isOpen onClose={onClose} title={t("playlist_modal_title", language)} maxWidth="960px">
      <div className="flex max-h-[70vh] w-full flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] p-1">
          <input
            type="text"
            value={name}
            disabled={Boolean(existingPlaylistId)}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("playlist_modal_name_placeholder", language)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            autoFocus
          />
          <div className="app-tabs mt-3">
            <button type="button" onClick={() => setSelectedTab("recognized")} className={`app-tab ${selectedTab === "recognized" ? "app-tab-active" : ""}`}>
              <Clock className="h-4 w-4" />
              {t("playlist_modal_tab_recognized", language)}
            </button>
            <button type="button" onClick={() => setSelectedTab("favorites")} className={`app-tab ${selectedTab === "favorites" ? "app-tab-active" : ""}`}>
              <Heart className="h-4 w-4" />
              {t("playlist_modal_tab_favorites", language)}
            </button>
            <button type="button" onClick={() => setSelectedTab("search")} className={`app-tab ${selectedTab === "search" ? "app-tab-active" : ""}`}>
              <Search className="h-4 w-4" />
              {t("playlist_modal_tab_search", language)}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {selectedTab === "search" && (
            <div className="mb-3">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("playlist_modal_tab_search", language)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
          )}

          <div className="space-y-2">
            {tracksByTab.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--muted)]">{t("no_songs_yet", language)}</p>
            ) : (
              tracksByTab.map((track) => {
                const key = normalizeTrackKey(track.title, track.artist);
                const selected = selectedSongs.has(key);
                return (
                  <SongRow
                    key={`${track.id}-${key}`}
                    id={track.id}
                    title={track.title}
                    artist={track.artist}
                    artworkUrl={track.coverUrl}
                    onPlay={() => toggleTrackSelection(track)}
                    actionIcon={selected ? <Check className="w-4 h-4 text-[var(--accent)]" /> : <Plus className="w-4 h-4 text-[var(--muted)]" />}
                    actionLabel={selected ? t("modal_confirm", language) : t("track_add_to_playlist", language)}
                  />
                );
              })
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] p-4">
          <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs text-[var(--muted)]">{selectedCountLabel}</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>{t("modal_cancel", language)}</Button>
            <Button onClick={() => void handleSubmit()} disabled={!isNameValid || isSubmitting}>
              {existingPlaylistId ? t("playlist_add_songs", language) : t("track_create", language)}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
