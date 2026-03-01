"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HeroSection from "./HeroSection";
import ResultCard from "./ResultCard";
import HistoryGrid from "./HistoryGrid";
import UploadModal from "./UploadModal";
import LibrarySidebar from "./LibrarySidebar";
import TrackCard from "./TrackCard";
import SongReviewModal from "./SongReviewModal";
import { usePlayer } from "./PlayerProvider";
import { useLibrary } from "../features/library/useLibrary";
import {
  recognizeFromAudio,
  recognizeFromImage,
  type AudioRecognitionResult,
  type ImageRecognitionResult,
  type SongMatch,
  type SongRecognitionResult,
} from "../features/recognition/api";
import { recentTracksSeed } from "../features/tracks/seed";
import type { Track } from "../features/tracks/types";
import { useLanguage } from "../lib/LanguageContext";
import { useTheme } from "../lib/ThemeContext";
import { t } from "../lib/translations";
import { scopedKey, useProfile } from "../lib/ProfileContext";
import { useUser } from "../src/context/UserContext";
import { apiFetch } from "../src/lib/apiFetch";
import { Button } from "../src/components/ui/Button";
import { Input } from "../src/components/ui/Input";
import { Card } from "../src/components/ui/Card";

type Toast = { id: string; kind: "success" | "error" | "info"; message: string };
type HistoryEntry = { id: string; source: "audio" | "ocr"; createdAt: string; song: SongMatch };
type BackendHistoryItem = {
  id: string;
  method?: string;
  title?: string;
  songName?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  youtubeVideoId?: string;
  recognized?: boolean;
  createdAt: string;
};

const IMAGE_MAX_MB = 10;
const IMAGE_MIME_WHITELIST = ["image/png", "image/jpeg", "image/webp"];
const HISTORY_KEY = "ponotai-history";
const MAX_SONGS_KEY = "ponotai.settings.maxSongs";
const OCR_LANGUAGE_KEY = "ponotai.settings.ocrLanguage";

function songMatchToRecognitionResult(match: SongMatch, source: "audio" | "image"): SongRecognitionResult {
  return { ...match, source };
}

function toRecognizedTrack(result: SongRecognitionResult): Track {
  return {
    id: `recognized-${result.songName}-${result.artist}`.toLowerCase().replace(/\s+/g, "-"),
    title: result.songName,
    artistName: result.artist,
    artistId: `artist-${result.artist}`.toLowerCase().replace(/\s+/g, "-"),
    artworkUrl: result.albumArtUrl || "https://picsum.photos/seed/recognized/80",
    license: "COPYRIGHTED",
  };
}

export function HomeContent() {
  const { addToHistory, addFavorite, addManualSubmission } = useUser();
  const [audioResult, setAudioResult] = useState<AudioRecognitionResult | null>(null);
  const [imageResult, setImageResult] = useState<ImageRecognitionResult | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingImageResult, setPendingImageResult] = useState<ImageRecognitionResult | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [maxSongs, setMaxSongs] = useState(10);
  const [ocrLanguage, setOcrLanguage] = useState("eng");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [favoritesMenuOpen, setFavoritesMenuOpen] = useState<string | null>(null);

  const imageCache = useRef<Map<string, ImageRecognitionResult>>(new Map());

  const { addToQueue } = usePlayer();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { profile } = useProfile();
  const profileHistoryKey = scopedKey(HISTORY_KEY, profile.id);
  const profileMaxSongsKey = scopedKey(MAX_SONGS_KEY, profile.id);
  const profileOcrLanguageKey = scopedKey(OCR_LANGUAGE_KEY, profile.id);
  const { playlists, favoritesSet, toggleFavorite, createPlaylist, deletePlaylist, addSongToPlaylist, removeSongFromPlaylist } = useLibrary(profile.id);

  // Adapter functions to convert track data for playlist operations
  const handleAddSongToPlaylist = (trackId: string, playlistId: string) => {
    // Find the track in our tracks list
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;

    addSongToPlaylist(playlistId, {
      title: track.title,
      artist: track.artistName,
      coverUrl: track.artworkUrl,
    });
  };

  const handleRemoveSongFromPlaylist = (trackId: string, playlistId: string) => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;

    removeSongFromPlaylist(playlistId, track.title, track.artistName);
  };

  const latestResult: SongRecognitionResult | null = useMemo(() => {
    if (audioResult) return songMatchToRecognitionResult(audioResult.primaryMatch, "audio");
    if (imageResult?.songs[0]) return songMatchToRecognitionResult(imageResult.songs[0], "image");
    return null;
  }, [audioResult, imageResult]);

  const tracks = useMemo(() => {
    const recognizedTrack = latestResult ? [toRecognizedTrack(latestResult)] : [];
    const uniqueTracks = new Map<string, Track>();
    [...recognizedTrack, ...recentTracksSeed].forEach((track) => uniqueTracks.set(track.id, track));
    return [...uniqueTracks.values()];
  }, [latestResult]);

  const stats = useMemo(() => {
    return {
      totalHistory: history.length,
      totalFavorites: favoritesSet.size,
      totalPlaylists: playlists.length,
    };
  }, [history.length, favoritesSet.size, playlists.length]);

  useEffect(() => {
    // Source-of-truth rule: fetch from backend first, write to localStorage as cache.
    // Fall back to localStorage silently if backend is unreachable.
    async function loadHistory() {
      try {
        const res = await apiFetch("/api/history?limit=18");
        if (res.ok) {
          const data = (await res.json()) as
            | { items?: BackendHistoryItem[]; total?: number }
            | BackendHistoryItem[];
          const rawItems: BackendHistoryItem[] = Array.isArray(data)
            ? data
            : (data.items ?? []);

          const mapped: HistoryEntry[] = rawItems
            .filter((item) => item.title || item.songName)
            .map((item) => ({
              id: item.id,
              source: (item.method === "album-image" ? "ocr" : "audio") as "audio" | "ocr",
              createdAt: item.createdAt,
              song: {
                songName: item.title ?? item.songName ?? "Unknown Song",
                artist: item.artist ?? "Unknown Artist",
                album: item.album ?? "Unknown Album",
                genre: "Unknown Genre",
                releaseYear: null,
                platformLinks: {},
                youtubeVideoId: item.youtubeVideoId,
                albumArtUrl: item.coverUrl ?? "https://picsum.photos/seed/recognized/120",
                confidence: 0.8,
                durationSec: 0,
              },
            }));

          setHistory(mapped);
          // Write backend result into localStorage as offline cache
          localStorage.setItem(profileHistoryKey, JSON.stringify(mapped));
          return;
        }
      } catch {
        // Backend unreachable — fall through to localStorage cache
      }

      // Offline fallback: read from localStorage cache
      try {
        const saved = localStorage.getItem(profileHistoryKey);
        setHistory(saved ? (JSON.parse(saved) as HistoryEntry[]) : []);
      } catch {
        setHistory([]);
      }
    }

    void loadHistory();
  }, [profileHistoryKey]);

  useEffect(() => {
    const storedMaxSongs = Number(localStorage.getItem(profileMaxSongsKey) ?? 10);
    const storedOcrLanguage = localStorage.getItem(profileOcrLanguageKey) ?? "eng";
    setMaxSongs(Math.min(20, Math.max(1, storedMaxSongs || 10)));
    setOcrLanguage(storedOcrLanguage);
  }, [profileMaxSongsKey, profileOcrLanguageKey]);

  useEffect(() => {
    localStorage.setItem(profileHistoryKey, JSON.stringify(history.slice(0, 18)));
  }, [history, profileHistoryKey]);

  useEffect(() => {
    localStorage.setItem(profileMaxSongsKey, String(maxSongs));
  }, [maxSongs, profileMaxSongsKey]);

  useEffect(() => {
    localStorage.setItem(profileOcrLanguageKey, ocrLanguage);
  }, [ocrLanguage, profileOcrLanguageKey]);

  function pushToast(kind: Toast["kind"], message: string) {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }

  function addToHistoryLocal(source: HistoryEntry["source"], songs: SongMatch[]) {
    const createdAt = new Date().toISOString();
    const entries = songs.map((song) => ({ id: crypto.randomUUID(), source, createdAt, song }));
    setHistory((prev) => [...entries, ...prev].slice(0, 18));
  }

  async function recordAudioClip(durationMs: number): Promise<Blob> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return new Promise((resolve, reject) => {
      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorder.ondataavailable = (event: BlobEvent) => event.data.size > 0 && chunks.push(event.data);
      mediaRecorder.onerror = () => reject(new Error(t("error_audio_capture_failed", language)));
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        resolve(new Blob(chunks, { type: "audio/webm" }));
      };
      mediaRecorder.start();
      window.setTimeout(() => mediaRecorder.state !== "inactive" && mediaRecorder.stop(), Math.min(durationMs, 10_000));
    });
  }

  async function handleRecognizeAudio() {
    if (isLoadingAudio || isLoadingImage) return;
    setErrorMessage(null);
    setIsLoadingAudio(true);
    setIsRecording(true);
    try {
      const audioBlob = await recordAudioClip(8_000);
      setIsRecording(false);
      const recognized = await recognizeFromAudio(audioBlob);
      setAudioResult(recognized);
      setImageResult(null);
      // Update local history grid immediately (source-of-truth: backend is written to first via addToHistory)
      addToHistoryLocal("audio", [recognized.primaryMatch]);
      await addToHistory({
        id: crypto.randomUUID(),
        method: "audio-record",
        title: recognized.primaryMatch.songName,
        artist: recognized.primaryMatch.artist,
        album: recognized.primaryMatch.album,
        coverUrl: recognized.primaryMatch.albumArtUrl,
        recognized: true,
        createdAt: new Date().toISOString(),
      });
      pushToast("success", t("toast_recognized", language, { song: recognized.primaryMatch.songName }));
    } catch (error) {
      setErrorMessage((error as Error).message || t("toast_audio_failed", language));
      await addToHistory({
        id: crypto.randomUUID(),
        method: "audio-record",
        recognized: false,
        createdAt: new Date().toISOString(),
      });
      pushToast("error", t("toast_audio_failed", language));
    } finally {
      setIsRecording(false);
      setIsLoadingAudio(false);
    }
  }

  function validateImage(file: File): string | null {
    if (!IMAGE_MIME_WHITELIST.includes(file.type)) return t("toast_unsupported_type", language);
    if (file.size > IMAGE_MAX_MB * 1024 * 1024) return t("toast_file_too_large", language, { max: IMAGE_MAX_MB });
    return null;
  }

  function handleSelectUploadFile(file: File) {
    const validationError = validateImage(file);
    if (validationError) {
      setErrorMessage(validationError);
      pushToast("error", validationError);
      return;
    }
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
    setErrorMessage(null);
  }

  async function handleSubmitUpload() {
    if (!uploadFile) return;
    setIsLoadingImage(true);
    try {
      const cacheKey = `${uploadFile.name}-${uploadFile.size}-${maxSongs}-${ocrLanguage}`;
      if (imageCache.current.has(cacheKey)) {
        const cachedResult = imageCache.current.get(cacheKey)!;
        setPendingImageResult(cachedResult);
        setShowReviewModal(true);
        setIsUploadOpen(false);
        pushToast("info", t("toast_cache_loaded", language));
        return;
      }

      const recognized = await recognizeFromImage(uploadFile, maxSongs, ocrLanguage);
      imageCache.current.set(cacheKey, recognized);
      setPendingImageResult(recognized);
      setShowReviewModal(true);
      setIsUploadOpen(false);
      pushToast("info", t("toast_found_review", language, { count: recognized.count }));
    } catch (error) {
      setErrorMessage((error as Error).message || t("error_recognition_failed", language));
      pushToast("error", t("toast_image_failed", language));
    } finally {
      setIsLoadingImage(false);
    }
  }

  async function handleConfirmSongs(selectedSongs: SongMatch[]) {
    if (!pendingImageResult) return;
    const updatedResult = { ...pendingImageResult, songs: selectedSongs, count: selectedSongs.length };
    setImageResult(updatedResult);
    setAudioResult(null);
    // Update local history grid immediately
    addToHistoryLocal("ocr", selectedSongs);
    for (const song of selectedSongs) {
      await addToHistory({
        id: crypto.randomUUID(),
        method: "album-image",
        title: song.songName,
        artist: song.artist,
        album: song.album,
        coverUrl: song.albumArtUrl,
        recognized: true,
        createdAt: new Date().toISOString(),
      });
    }
    setShowReviewModal(false);
    setPendingImageResult(null);
    pushToast("success", t("toast_added", language, { count: selectedSongs.length }));
  }

  function saveSong(song: SongMatch) {
    addToHistoryLocal("audio", [song]);
    void addFavorite({ title: song.songName, artist: song.artist, album: song.album, coverUrl: song.albumArtUrl });
    pushToast("success", t("toast_saved", language, { song: song.songName }));
  }

  function favoriteSong(song: SongMatch) {
    addFavorite({
      id: `${song.songName}-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
      savedAt: new Date().toISOString(),
      title: song.songName,
      artist: song.artist,
      album: song.album,
      coverUrl: song.albumArtUrl,
    });
    pushToast("success", `Added ${song.songName} to favorites`);
  }

  function playSong(song: SongMatch) {
    addToQueue({
      title: song.songName,
      artist: song.artist,
      artistId: `artist-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
      artworkUrl: song.albumArtUrl || "https://picsum.photos/seed/recognized/80",
      query: `${song.songName} ${song.artist} official audio`,
      videoId: song.youtubeVideoId ?? song.platformLinks.youtube,
      license: "COPYRIGHTED",
    });
  }

  return (
    <main className="min-h-screen transition-colors">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <HeroSection
              language={language}
              isListening={isRecording || isLoadingAudio}
              onRecognize={handleRecognizeAudio}
              onOpenUpload={() => setIsUploadOpen(true)}
              onToggleLanguage={() => setLanguage(language === "en" ? "bg" : "en")}
              onToggleTheme={toggleTheme}
              onToggleLibrary={() => setIsLibraryOpen((prev) => !prev)}
              isLibraryOpen={isLibraryOpen}
              theme={theme}
            />

            <Card className="rounded-3xl p-5">
              <h3 className="mb-4 text-lg font-semibold">{t("settings_title", language)}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-text-muted">{t("stats_max_ocr_songs", language)}</span>
                  <Input type="number" min={1} max={20} value={maxSongs} onChange={(e) => setMaxSongs(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-text-muted">{t("stats_ocr_language", language)}</span>
                  <select value={ocrLanguage} onChange={(e) => setOcrLanguage(e.target.value)} className="w-full bg-surface border border-border text-text-primary rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200">
                    <option value="eng">{t("ocr_lang_english", language)}</option>
                    <option value="spa">{t("ocr_lang_spanish", language)}</option>
                    <option value="fra">{t("ocr_lang_french", language)}</option>
                    <option value="deu">{t("ocr_lang_german", language)}</option>
                    <option value="ita">{t("ocr_lang_italian", language)}</option>
                    <option value="por">{t("ocr_lang_portuguese", language)}</option>
                  </select>
                </label>
              </div>
            </Card>

            {errorMessage && <p className="rounded-2xl border border-danger bg-surface-raised px-4 py-3 text-sm text-danger">{errorMessage}</p>}

            {errorMessage && (
              <Card className="rounded-2xl p-4">
                <h3 className="text-base font-semibold">Manual submission</h3>
                <p className="text-xs text-text-muted">Could not recognize? Submit manually.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => addManualSubmission({
                    id: crypto.randomUUID(),
                    submittedAt: new Date().toISOString(),
                    title: latestResult?.songName || "Unknown title",
                    artist: latestResult?.artist || "Unknown artist",
                    album: latestResult?.album || "Unknown album",
                  })}
                >
                  Submit pending review
                </Button>
              </Card>
            )}

            <ResultCard language={language} song={latestResult} onSave={saveSong} onPlay={playSong} onFavorite={favoriteSong} />

            <HistoryGrid language={language} items={history} onDelete={(id) => setHistory((prev) => prev.filter((entry) => entry.id !== id))} onPlay={playSong} />

            {(stats.totalFavorites > 0 || stats.totalPlaylists > 0) && (
              <Card className="rounded-3xl bg-gradient-to-br from-brand-500/10 to-brand-600/5 border border-brand-300/20 p-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{stats.totalFavorites}</p>
                    <p className="text-xs text-text-muted mt-1">Favorites</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{stats.totalPlaylists}</p>
                    <p className="text-xs text-text-muted mt-1">Playlists</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{stats.totalHistory}</p>
                    <p className="text-xs text-text-muted mt-1">History</p>
                  </div>
                </div>
              </Card>
            )}

            {playlists.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Recent Playlists</h2>
                  <Button variant="ghost" size="sm" onClick={() => setIsLibraryOpen(!isLibraryOpen)}>View all</Button>
                </div>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                  {playlists.slice(0, 4).map((playlist) => (
                    <Card key={playlist.id} className="p-4 hover:border-brand-500/50 transition cursor-pointer" onClick={() => setIsLibraryOpen(true)}>
                      <p className="font-medium text-text-primary truncate">{playlist.name}</p>
                      <p className="text-xs text-text-muted mt-1">{playlist.songs.length} songs</p>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {favoritesSet.size > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Your Favorites</h2>
                  <span className="text-xs text-text-muted bg-surface rounded-full px-2 py-1">{favoritesSet.size} songs</span>
                </div>
                <div className="space-y-2">
                  {Array.from(favoritesSet).slice(0, 6).map((trackId) => {
                    const songTitle = trackId.split("-").slice(0, -1).join(" ");
                    const coverUrl = `https://picsum.photos/seed/${trackId}/200`;
                    const isMenuOpen = favoritesMenuOpen === trackId;
                    return (
                      <div key={trackId} className="group relative flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 transition-all hover:border-[var(--accent)]/50 hover:shadow-lg">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[var(--border)]">
                          <img src={coverUrl} alt={songTitle} className="h-full w-full object-cover" />
                          <button onClick={() => playSong({ songName: songTitle, artist: "Favorite", album: "Collection", albumArtUrl: coverUrl, youtubeVideoId: "", genre: "Unknown", releaseYear: null, platformLinks: {}, confidence: 0.5, durationSec: 0 })} className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100"><span className="h-8 w-8 grid place-items-center rounded-full bg-[var(--accent)] text-white text-sm">▶</span></button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-text-primary truncate text-sm">{songTitle}</p>
                          <p className="text-xs text-text-muted">Favorite</p>
                        </div>
                        <div className="relative">
                          <button onClick={() => setFavoritesMenuOpen(isMenuOpen ? null : trackId)} className="rounded-lg p-2 opacity-0 transition group-hover:opacity-100 hover:bg-surface-raised">⋯</button>
                          {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg z-50">
                              <button onClick={() => { toggleFavorite(trackId); setFavoritesMenuOpen(null); }} className="block w-full px-4 py-2 text-left text-sm hover:bg-surface-raised text-text-primary rounded-t-lg">Remove from Favorites</button>
                              {playlists.length > 0 && (<><hr className="border-[var(--border)]" />{playlists.slice(0, 3).map((playlist) => (<button key={playlist.id} onClick={() => { handleAddSongToPlaylist(trackId, playlist.id); setFavoritesMenuOpen(null); }} className="block w-full px-4 py-2 text-left text-sm hover:bg-surface-raised text-text-primary">Add to {playlist.name}</button>))}</>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {favoritesSet.size > 6 && <p className="text-xs text-center text-text-muted py-2">+{favoritesSet.size - 6} more in Library</p>}
              </section>
            )}

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">{t("songs_heading", language)}</h2>
              {tracks.length > 0 ? tracks.map((track) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  playlists={playlists}
                  isFavorite={favoritesSet.has(track.id)}
                  onToggleFavorite={toggleFavorite}
                  onAddToPlaylist={handleAddSongToPlaylist}
                  onCreatePlaylist={createPlaylist}
                  onDeletePlaylist={deletePlaylist}
                  onRemoveFromPlaylist={handleRemoveSongFromPlaylist}
                  onPlay={(currentTrack) =>
                    addToQueue({
                      title: currentTrack.title,
                      artist: currentTrack.artistName,
                      artistId: currentTrack.artistId,
                      artworkUrl: currentTrack.artworkUrl,
                      query: `${currentTrack.title} ${currentTrack.artistName} official audio`,
                      videoId: currentTrack.youtubeVideoId,
                      license: currentTrack.license,
                    })
                  }
                />
              )) : <Card className="p-6 text-center"><p className="text-text-muted">Start recognizing songs to build your collection!</p></Card>}
            </section>
          </div>

          {isLibraryOpen && <LibrarySidebar playlists={playlists} tracks={tracks} favoritesSet={favoritesSet} />}
        </div>
      </div>

      <UploadModal
        language={language}
        open={isUploadOpen}
        previewUrl={uploadPreview}
        onClose={() => setIsUploadOpen(false)}
        onSelectFile={handleSelectUploadFile}
        onSubmit={handleSubmitUpload}
        disabled={isLoadingImage}
      />

      {showReviewModal && pendingImageResult && (
        <SongReviewModal
          songs={pendingImageResult.songs}
          onConfirm={handleConfirmSongs}
          onCancel={() => {
            setShowReviewModal(false);
            setPendingImageResult(null);
          }}
        />
      )}

      <div className="fixed bottom-4 right-4 z-50 flex w-[320px] flex-col gap-3">
        {toasts.map((toast) => (
          <div key={toast.id} className={`rounded-xl border px-4 py-3 shadow-xl ${toast.kind === "success" ? "border-emerald-300/40 bg-emerald-500/15" : toast.kind === "error" ? "border-red-300/40 bg-red-500/15" : "border-sky-300/40 bg-sky-500/15"}`}>
            <p className="text-sm">{toast.message}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
