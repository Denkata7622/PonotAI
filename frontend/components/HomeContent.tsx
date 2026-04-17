"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import HeroSection from "./HeroSection";
import ResultCard from "./ResultCard";
import SongRow from "./SongRow";

import UploadModal from "./UploadModal";
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
import { getVisibleOcrCandidates } from "../features/recognition/ui";
import type { Track } from "../features/tracks/types";
import { getHomeRecommendations } from "../features/recommendations/homeRecommendations";
import { readTasteProfile } from "../src/features/onboarding/tasteProfile";
import { useLanguage } from "../lib/LanguageContext";
import { useTheme } from "../lib/ThemeContext";
import { t } from "../lib/translations";
import { normalizeTrackKey } from "../lib/dedupe";
import { scopedKey, useProfile } from "../lib/ProfileContext";
import { useUser } from "../src/context/UserContext";
import { apiFetch } from "../src/lib/apiFetch";
import HomeHistorySection from "./home/HomeHistorySection";
import HomeFavoritesSection from "./home/HomeFavoritesSection";
import HomePlaylistsSection from "./home/HomePlaylistsSection";
import NewPlaylistModal from "./NewPlaylistModal";
import { Button } from "../src/components/ui/Button";
import { Input } from "../src/components/ui/Input";
import { Card } from "../src/components/ui/Card";
import { Library, Mic, Music, Play, Sparkles, X } from "../lucide-react";

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
const DEMO_SEEN_KEY = "ponotai.demo.seen";

const DEMO_FALLBACKS = [
  { title: "Blinding Lights", artist: "The Weeknd", artworkUrl: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=600&q=80" },
  { title: "Morning Sun", artist: "Luna Waves", artworkUrl: "https://picsum.photos/seed/ponotai-api-fallback/600" },
];

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
  const { addToHistory, addFavorite, addManualSubmission, isAuthenticated, saveToLibrary } = useUser();
  const [audioResult, setAudioResult] = useState<AudioRecognitionResult | null>(null);
  const [imageResult, setImageResult] = useState<ImageRecognitionResult | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingImageResult, setPendingImageResult] = useState<ImageRecognitionResult | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [recognitionStage, setRecognitionStage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isSavingReviewedSongs, setIsSavingReviewedSongs] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canRetryRecognition, setCanRetryRecognition] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [maxSongs, setMaxSongs] = useState(10);
  const [ocrLanguage, setOcrLanguage] = useState("eng");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [showAssistantHints, setShowAssistantHints] = useState(true);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [demoSeen, setDemoSeen] = useState(true);
  const [showNewPlaylistModal, setShowNewPlaylistModal] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);

  const imageCache = useRef<Map<string, ImageRecognitionResult>>(new Map());
  const deletedPlaylistRef = useRef<any | null>(null);
  const deletePlaylistTimeoutRef = useRef<number | null>(null);
  const [showPlaylistUndoToast, setShowPlaylistUndoToast] = useState(false);

  const { addToQueue, playNow } = usePlayer();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { profile } = useProfile();
  const profileHistoryKey = scopedKey(HISTORY_KEY, profile.id);
  const profileMaxSongsKey = scopedKey(MAX_SONGS_KEY, profile.id);
  const profileOcrLanguageKey = scopedKey(OCR_LANGUAGE_KEY, profile.id);
  const { playlists, favoritesSet, favoritesList, toggleFavorite, createPlaylist, deletePlaylist, addSongToPlaylist, removeSongFromPlaylist } = useLibrary(profile.id);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowAssistantHints(window.localStorage.getItem("ponotai-assistant-hints") !== "off");
  }, []);

  // Adapter functions to convert track data for playlist operations
  const handleAddSongToPlaylist = (trackId: string, playlistId: string, videoId?: string) => {
    // Find the track in our tracks list
    const track = recommendationState.tracks.find((t) => t.id === trackId);
    if (!track) return;

    addSongToPlaylist(playlistId, {
      title: track.title,
      artist: track.artistName,
      coverUrl: track.artworkUrl,
      videoId: videoId ?? track.youtubeVideoId,
    });
  };
  const addSongMatchToPlaylist = (song: SongMatch, playlistId: string) => {
    addSongToPlaylist(playlistId, {
      title: song.songName,
      artist: song.artist,
      coverUrl: song.albumArtUrl,
      videoId: song.youtubeVideoId,
    });
  };

  const handleRemoveSongFromPlaylist = (trackId: string, playlistId: string) => {
    const track = recommendationState.tracks.find((t) => t.id === trackId);
    if (!track) return;

    removeSongFromPlaylist(playlistId, track.title, track.artistName);
  };


  async function handleCreatePlaylist(name: string) {
    if (isCreatingPlaylist) return null;
    if (!name.trim()) return null;

    setIsCreatingPlaylist(true);
    try {
      return await createPlaylist(name);
    } finally {
      setIsCreatingPlaylist(false);
    }
  }

  const latestResult: SongRecognitionResult | null = useMemo(() => {
    if (audioResult) return songMatchToRecognitionResult(audioResult.primaryMatch, "audio");
    if (imageResult?.songs[0]) return songMatchToRecognitionResult(imageResult.songs[0], "image");
    return null;
  }, [audioResult, imageResult]);

  const tasteProfile = useMemo(() => readTasteProfile(), []);

  const recommendationState = useMemo(() => {
    const generated = getHomeRecommendations({
      language,
      userId: profile.id,
      history,
      favorites: favoritesList,
      tasteProfile,
      limit: 6,
    });

    const recognizedTrack = latestResult ? [toRecognizedTrack(latestResult)] : [];
    const uniqueTracks = new Map<string, Track>();
    [...recognizedTrack, ...generated.tracks].forEach((track) => uniqueTracks.set(track.id, track));

    return {
      ...generated,
      tracks: [...uniqueTracks.values()],
    };
  }, [favoritesList, history, language, latestResult, profile.id, tasteProfile]);

  const stats = useMemo(() => {
    return {
      totalHistory: history.length,
      totalFavorites: favoritesSet.size,
      totalPlaylists: playlists.length,
    };
  }, [history.length, favoritesSet.size, playlists.length]);

  const favoritedKeys = useMemo(() => {
    return new Set(favoritesSet);
  }, [favoritesSet]);

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

  useEffect(() => {
    const seen = window.localStorage.getItem(scopedKey(DEMO_SEEN_KEY, profile.id)) === "true";
    setDemoSeen(seen);
  }, [profile.id]);

  useEffect(() => () => {
    if (deletePlaylistTimeoutRef.current) {
      window.clearTimeout(deletePlaylistTimeoutRef.current);
    }
  }, []);

  async function handleDeleteHistoryItem(id: string) {
    if (isAuthenticated) {
      try {
        const response = await apiFetch(`/api/history/${id}`, { method: "DELETE" });
        if (!response.ok) {
          pushToast("error", "Failed to remove song from history.");
          return;
        }
      } catch {
        pushToast("error", "Failed to remove song from history.");
        return;
      }
    }

    setHistory((prev) => {
      const updated = prev.filter((entry) => entry.id !== id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(profileHistoryKey, JSON.stringify(updated));
      }
      return updated;
    });
  }

  function handleDemoRecognition() {
    const fallback = DEMO_FALLBACKS[Math.floor(Math.random() * DEMO_FALLBACKS.length)] ?? DEMO_FALLBACKS[0];
    if (!fallback) return;
    const demoSong: SongMatch = {
      songName: fallback.title,
      artist: fallback.artist,
      album: "Demo",
      genre: "Pop",
      releaseYear: null,
      platformLinks: {},
      albumArtUrl: fallback.artworkUrl,
      confidence: 0.8,
      durationSec: 0,
    };
    setAudioResult({ primaryMatch: demoSong, alternatives: [] });
    setImageResult(null);
    addToHistoryLocal("audio", [demoSong]);
    window.localStorage.setItem(scopedKey(DEMO_SEEN_KEY, profile.id), "true");
    setDemoSeen(true);
  }

  function pushToast(kind: Toast["kind"], message: string) {
    const id = crypto.randomUUID();
    setToasts((prev) => [{ id, kind, message }, ...prev]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }


  function handleDeletePlaylistWithUndo(playlistId: string) {
    const playlistToDelete = playlists.find((playlist) => playlist.id === playlistId);
    if (!playlistToDelete) return;

    if (deletePlaylistTimeoutRef.current) {
      window.clearTimeout(deletePlaylistTimeoutRef.current);
    }

    deletedPlaylistRef.current = playlistToDelete;
    setShowPlaylistUndoToast(true);

    deletePlaylistTimeoutRef.current = window.setTimeout(() => {
      if (deletedPlaylistRef.current?.id === playlistId) {
        void deletePlaylist(playlistId);
      }
      deletedPlaylistRef.current = null;
      setShowPlaylistUndoToast(false);
      deletePlaylistTimeoutRef.current = null;
    }, 4000);
  }

  function handleUndoDeletePlaylist() {
    if (deletePlaylistTimeoutRef.current) {
      window.clearTimeout(deletePlaylistTimeoutRef.current);
      deletePlaylistTimeoutRef.current = null;
    }
    deletedPlaylistRef.current = null;
    setShowPlaylistUndoToast(false);
  }

  function addToHistoryLocal(source: HistoryEntry["source"], songs: SongMatch[]) {
    const createdAt = new Date().toISOString();
    setHistory((prev) => {
      let next = [...prev];
      for (const song of songs) {
        const key = normalizeTrackKey(song.songName, song.artist);
        const hadDuplicate = next.some(
          (entry) => normalizeTrackKey(entry.song.songName, entry.song.artist) === key,
        );
        const filtered = next.filter(
          (entry) => normalizeTrackKey(entry.song.songName, entry.song.artist) !== key,
        );
        if (hadDuplicate) {
          pushToast("info", t("toast_duplicate_history", language));
        }
        next = [{ id: crypto.randomUUID(), source, createdAt, song }, ...filtered];
      }
      return next.slice(0, 18);
    });
  }

  async function runRecognitionCountdown() {
    for (let value = 3; value >= 1; value -= 1) {
      setCountdown(value);
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    setCountdown(null);
  }

  async function recordAudioClip(durationMs: number): Promise<Blob> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setMicrophoneStream(stream);
    return new Promise((resolve, reject) => {
      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorder.ondataavailable = (event: BlobEvent) => event.data.size > 0 && chunks.push(event.data);
      mediaRecorder.onerror = () => reject(new Error(t("error_audio_capture_failed", language)));
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setMicrophoneStream(null);
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
    setRecognitionStage("listening");
    try {
      await runRecognitionCountdown();
      setIsRecording(true);
      setRecognitionStage("cleaning audio");
      const audioBlob = await recordAudioClip(8_000);
      if (audioBlob.size < 8_000) {
        throw new Error(language === "bg"
          ? "Записът е твърде кратък или тих. Приближи се до източника на звук и опитай отново."
          : "The recording is too short or quiet. Move closer to the audio source and try again.");
      }
      setIsRecording(false);
      setRecognitionStage("checking match");
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
      if (recognized.primaryMatch.resultState === "possible_matches") setRecognitionStage("possible matches");
      else if (recognized.primaryMatch.resultState === "need_better_sample") setRecognitionStage("need a clearer sample");
      else setRecognitionStage("likely match");
      setCanRetryRecognition(false);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(scopedKey(DEMO_SEEN_KEY, profile.id), "true");
        setDemoSeen(true);
      }
    } catch (error) {
      const err = error as Error & { name?: string };
      if (err.name === "NotAllowedError") {
        setErrorMessage(t("error_microphone_denied", language));
      } else if (err.name === "NotFoundError") {
        setErrorMessage(t("error_microphone_not_found", language));
      } else {
        setErrorMessage(err.message || t("toast_audio_failed", language));
      }
      setCanRetryRecognition(true);
      await addToHistory({
        id: crypto.randomUUID(),
        method: "audio-record",
        recognized: false,
        createdAt: new Date().toISOString(),
      });
      pushToast("error", t("toast_audio_failed", language));
    } finally {
      setIsRecording(false);
      setMicrophoneStream(null);
      setIsLoadingAudio(false);
      window.setTimeout(() => setRecognitionStage(null), 2200);
    }
  }


  async function isImageReadable(file: File): Promise<boolean> {
    const imageUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("Could not decode image."));
        element.src = imageUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = Math.min(200, image.width);
      canvas.height = Math.min(200, image.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return true;

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i] ?? 0;
        const g = pixels[i + 1] ?? 0;
        const b = pixels[i + 2] ?? 0;
        sum += (r + g + b) / 3;
      }

      const avgBrightness = sum / (pixels.length / 4);
      return avgBrightness > 18;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  function validateImage(file: File): string | null {
    if (!IMAGE_MIME_WHITELIST.includes(file.type)) return t("toast_unsupported_type", language);
    if (file.size > IMAGE_MAX_MB * 1024 * 1024) return t("toast_file_too_large", language, { max: IMAGE_MAX_MB });
    return null;
  }

  async function handleSelectUploadFile(file: File) {
    const validationError = validateImage(file);
    if (validationError) {
      setErrorMessage(validationError);
      pushToast("error", validationError);
      return;
    }
    const readable = await isImageReadable(file);
    if (!readable) {
      const warning = language === "bg" ? "Изображението е твърде тъмно за надеждно OCR разчитане." : "Image is too dark/blank for reliable OCR.";
      setErrorMessage(warning);
      pushToast("error", warning);
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
    if (!pendingImageResult || isSavingReviewedSongs) return;
    setIsSavingReviewedSongs(true);
    try {
      const updatedResult = { ...pendingImageResult, songs: selectedSongs, count: selectedSongs.length };
      setImageResult(updatedResult);
      setAudioResult(null);
      // Update local history grid immediately
      addToHistoryLocal("ocr", selectedSongs);
      await Promise.all(selectedSongs.map((song) => addToHistory({
        id: crypto.randomUUID(),
        method: "album-image",
        title: song.songName,
        artist: song.artist,
        album: song.album,
        coverUrl: song.albumArtUrl,
        recognized: true,
        createdAt: new Date().toISOString(),
      })));
      setShowReviewModal(false);
      setPendingImageResult(null);
      pushToast("success", t("toast_added", language, { count: selectedSongs.length }));
    } catch (error) {
      setErrorMessage((error as Error).message || t("toast_image_failed", language));
      pushToast("error", t("toast_image_failed", language));
    } finally {
      setIsSavingReviewedSongs(false);
    }
  }

  function saveSong(song: SongMatch) {
    addToHistoryLocal("audio", [song]);
    void saveToLibrary({
      title: song.songName,
      artist: song.artist,
      album: song.album,
      coverUrl: song.albumArtUrl,
      method: "audio-recognition",
      recognized: true,
    });
    pushToast("success", t("toast_saved", language, { song: song.songName }));
  }

  function favoriteSong(song: SongMatch) {
    const favoriteKey = normalizeTrackKey(song.songName, song.artist);
    if (favoritesSet.has(favoriteKey)) {
      toggleFavorite(favoriteKey, song.songName, song.artist, song.albumArtUrl, song.youtubeVideoId);
      return;
    }
    void addFavorite({
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
    playNow({
      title: song.songName,
      artist: song.artist,
      artistId: `artist-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
      artworkUrl: song.albumArtUrl || "https://picsum.photos/seed/recognized/80",
      query: `${song.songName} ${song.artist} official audio`,
      videoId: song.youtubeVideoId ?? song.platformLinks.youtube,
      license: "COPYRIGHTED",
    }, "manual");
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const intent = params.get("intent");
    if (!intent) return;

    if (intent === "recognize-audio") {
      void handleRecognizeAudio();
    } else if (intent === "recognize-ocr") {
      setIsUploadOpen(true);
    }

    params.delete("intent");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen w-full overflow-x-hidden transition-colors">
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            {!isAuthenticated && history.length === 0 && !demoSeen && (
              <Card className="resultEnter mb-6">
                <p className="text-sm uppercase tracking-[0.22em] text-text-muted">Trackly</p>
                <h3 className="mt-2 text-2xl font-bold">{language === "bg" ? "Добре дошъл в Trackly" : "Welcome to Trackly"}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="homeStepCard p-3 text-sm"><Mic className="w-5 h-5 text-[var(--accent)]" /><p className="mt-2">{language === "bg" ? "1. Слушай" : "1. Listen"}</p></div>
                  <div className="homeStepCard p-3 text-sm"><Music className="w-5 h-5 text-[var(--accent)]" /><p className="mt-2">{language === "bg" ? "2. Разпознай" : "2. Identify"}</p></div>
                  <div className="homeStepCard p-3 text-sm"><Library className="w-5 h-5 text-[var(--accent)]" /><p className="mt-2">{language === "bg" ? "3. Запази" : "3. Save"}</p></div>
                </div>
                <Button className="mt-5 inline-flex items-center gap-2" onClick={handleDemoRecognition}><Play className="w-4 h-4 text-white" />{language === "bg" ? "Пробвай демо" : "Try a demo"}</Button>
              </Card>
            )}

            <HeroSection
              language={language}
              isListening={isRecording}
              preparingCountdown={countdown}
              microphoneStream={microphoneStream}
              onRecognize={handleRecognizeAudio}
              onOpenUpload={() => setIsUploadOpen(true)}
              onToggleLanguage={() => setLanguage(language === "en" ? "bg" : "en")}
              onToggleTheme={toggleTheme}
              onToggleLibrary={() => setIsLibraryOpen((prev) => !prev)}
              onStreamReady={(stream) => setMicrophoneStream(stream)}
              isLibraryOpen={isLibraryOpen}
              theme={theme}
            />

            <Card className="space-y-3">
              <h3 className="text-lg font-semibold">{language === "bg" ? "Бързи действия" : "Quick actions"}</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button onClick={() => void handleRecognizeAudio()} className="justify-center">{language === "bg" ? "Разпознай от звук" : "Recognize from audio"}</Button>
                <Button variant="secondary" onClick={() => setIsUploadOpen(true)} className="justify-center">{language === "bg" ? "OCR от снимка" : "OCR from photo"}</Button>
                <Link href="/assistant" className="homeQuickLink inline-flex items-center justify-center px-4 py-2 text-sm font-medium transition">{language === "bg" ? "Попитай AI асистента" : "Ask AI assistant"}</Link>
              </div>
            </Card>

            {showAssistantHints ? <Card className="p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{language === "bg" ? "Асистент" : "Assistant"}</p>
              <h3 className="inline-flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-4 w-4 text-[var(--accent)]" /> AI can do more than chat</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">Ask Trackly Assistant to generate playlists, summarize your daily/weekly/monthly trends, suggest discovery tracks, and build your queue instantly.</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {["Build playlist", "Analyze trends", "Mood recommendations", "Discovery picks", "Queue actions"].map((item) => (
                  <span key={item} className="rounded-full border border-[var(--border)] px-2 py-1">{item}</span>
                ))}
              </div>
            </Card> : null}

            <Card className="p-5">
              <h3 className="mb-4 text-lg font-semibold">{t("settings_title", language)}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-text-muted">{t("stats_max_ocr_songs", language)}</span>
                  <Input type="number" min={1} max={20} value={maxSongs} onChange={(e) => setMaxSongs(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-text-muted">{t("stats_ocr_language", language)}</span>
                  <select value={ocrLanguage} onChange={(e) => setOcrLanguage(e.target.value)} className="w-full bg-surface border border-border text-text-primary rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] focus:border-transparent transition-all duration-200">
                    <option value="bul+eng">{language === "bg" ? "Български + Английски" : "Bulgarian + English"}</option>
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

            {countdown && <Card className="rounded-2xl p-4 text-center text-2xl font-bold">{countdown}</Card>}
            {recognitionStage && <Card className="rounded-2xl p-3 text-center text-sm uppercase tracking-wide">{recognitionStage}</Card>}

            {errorMessage && <p className="rounded-2xl border border-danger bg-surface-raised px-4 py-3 text-sm text-danger">{errorMessage}</p>}
            {canRetryRecognition && <Button variant="secondary" onClick={() => void handleRecognizeAudio()}>{language === "bg" ? "Опитай отново" : "Try again"}</Button>}

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

            <ResultCard language={language} song={latestResult} onSave={saveSong} onPlay={playSong} onFavorite={favoriteSong} favoritedKeys={favoritedKeys} />
            {getVisibleOcrCandidates(imageResult).length > 0 && (
              <Card className="space-y-3 p-4">
                <h3 className="text-base font-semibold">
                  {language === "bg" ? "OCR кандидати" : "OCR candidates"}
                </h3>
                <div className="space-y-2">
                  {getVisibleOcrCandidates(imageResult).map((song, index) => (
                    <SongRow
                      key={`${song.songName}-${song.artist}-${index}`}
                      id={`ocr-${song.songName}-${song.artist}-${index}`.toLowerCase().replace(/\s+/g, "-")}
                      title={song.songName}
                      artist={`${song.artist} • ${Math.round((song.confidence ?? 0) * 100)}%`}
                      artworkUrl={song.albumArtUrl}
                      videoId={song.youtubeVideoId}
                      onPlay={() => playSong(song)}
                      isFavorite={favoritedKeys.has(normalizeTrackKey(song.songName, song.artist))}
                      onFavorite={() => favoriteSong(song)}
                      showMoreMenu
                      playlists={playlists}
                      onAddToPlaylist={(playlistId) => addSongMatchToPlaylist(song, playlistId)}
                    />
                  ))}
                </div>
              </Card>
            )}

            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{language === "bg" ? "Последна активност" : "Recent activity"}</h2>
              <HomeHistorySection
                language={language}
                items={history}
                onDelete={handleDeleteHistoryItem}
                onPlay={playSong}
                favoritesSet={favoritesSet}
                onFavorite={toggleFavorite}
                playlists={playlists}
                onAddToPlaylist={addSongMatchToPlaylist}
              />
            </div>

            {(stats.totalFavorites > 0 || stats.totalPlaylists > 0) && (
              <Card className="homeStatsCard p-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <Link href="/library?tab=favorites" className="rounded-xl p-2 transition hover:opacity-80">
                    <p className="text-2xl font-bold text-text-primary">{stats.totalFavorites}</p>
                    <p className="mt-1 text-xs text-text-muted">Favorites</p>
                  </Link>
                  <Link href="/library?tab=playlists" className="rounded-xl p-2 transition hover:opacity-80">
                    <p className="text-2xl font-bold text-text-primary">{stats.totalPlaylists}</p>
                    <p className="mt-1 text-xs text-text-muted">Playlists</p>
                  </Link>
                  <Link href="/library?tab=history" className="rounded-xl p-2 transition hover:opacity-80">
                    <p className="text-2xl font-bold text-text-primary">{stats.totalHistory}</p>
                    <p className="mt-1 text-xs text-text-muted">History</p>
                  </Link>
                </div>
              </Card>
            )}

            <HomePlaylistsSection playlists={playlists} language={language} isAuthenticated={isAuthenticated} onOpenNewPlaylist={() => setShowNewPlaylistModal(true)} onDeletePlaylist={handleDeletePlaylistWithUndo} />

            <Card className="space-y-2">
              <h3 className="text-lg font-semibold">{language === "bg" ? "Откривай по-бързо" : "Discover faster"}</h3>
              <p className="text-sm text-text-muted">{language === "bg" ? "Разпознавай моментално, подреждай в плейлисти и продължавай с AI предложения." : "Recognize instantly, save to playlists, and keep exploring with AI suggestions."}</p>
            </Card>

            <HomeFavoritesSection
              language={language}
              favoritesList={favoritesList}
              playSong={playSong}
              toggleFavorite={toggleFavorite}
              playlists={playlists}
              addToPlaylist={handleAddSongToPlaylist}
              tracks={recommendationState.tracks}
            />

            <section className="space-y-3">
              <Card className="space-y-2">
                <h2 className="text-xl font-semibold">{recommendationState.title}</h2>
                <p className="text-sm text-text-muted">{recommendationState.description}</p>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  {recommendationState.mode === "history"
                    ? (language === "bg" ? "История + любими" : "History + favorites")
                    : recommendationState.mode === "taste"
                      ? (language === "bg" ? "Onboarding вкус" : "Onboarding taste profile")
                      : (language === "bg" ? "Курирани стартови предложения" : "Curated starter picks")}
                </p>
              </Card>
              {recommendationState.tracks.length > 0 ? recommendationState.tracks.map((track) => {
                const trackKey = normalizeTrackKey(track.title, track.artistName);
                return (
                  <TrackCard
                    key={track.id}
                    track={track}
                    playlists={playlists}
                    isFavorite={favoritesSet.has(trackKey)}
                    onToggleFavorite={toggleFavorite}
                    onAddToPlaylist={handleAddSongToPlaylist}
                    onCreatePlaylist={createPlaylist}
                    onDeletePlaylist={handleDeletePlaylistWithUndo}
                    onRemoveFromPlaylist={handleRemoveSongFromPlaylist}
                    onPlay={(currentTrack) =>
                      playNow({
                        title: currentTrack.title,
                        artist: currentTrack.artistName,
                        artistId: currentTrack.artistId,
                        artworkUrl: currentTrack.artworkUrl,
                        query: `${currentTrack.title} ${currentTrack.artistName} official audio`,
                        videoId: currentTrack.youtubeVideoId,
                        license: currentTrack.license,
                      }, "manual")
                    }
                  />
                );
              }) : <Card className="homeEmptyState p-6 text-center"><p className="text-text-muted">{language === "bg" ? "Няма предложения за момента." : "No recommendations right now."}</p></Card>}
            </section>
          </div>

          {isLibraryOpen && (
            <aside className="space-y-4">
              <Card className="space-y-3">
                <h3 className="text-lg font-semibold">{language === "bg" ? "Бърз преглед" : "Library snapshot"}</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Link href="/library?tab=history" className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-2">
                    <p className="text-lg font-semibold">{stats.totalHistory}</p>
                    <p className="text-xs text-[var(--muted)]">{language === "bg" ? "Последни" : "Recent"}</p>
                  </Link>
                  <Link href="/library?tab=favorites" className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-2">
                    <p className="text-lg font-semibold">{stats.totalFavorites}</p>
                    <p className="text-xs text-[var(--muted)]">{language === "bg" ? "Любими" : "Favorites"}</p>
                  </Link>
                  <Link href="/library?tab=playlists" className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-2">
                    <p className="text-lg font-semibold">{stats.totalPlaylists}</p>
                    <p className="text-xs text-[var(--muted)]">{language === "bg" ? "Плейлисти" : "Playlists"}</p>
                  </Link>
                </div>
              </Card>
              <Card className="space-y-3">
                <h3 className="text-base font-semibold">{language === "bg" ? "Продължи от последно" : "Continue listening"}</h3>
                {history.slice(0, 4).map((item) => (
                  <SongRow
                    key={item.id}
                    id={item.id}
                    title={item.song.songName}
                    artist={item.song.artist}
                    artworkUrl={item.song.albumArtUrl}
                    onPlay={() => playSong(item.song)}
                    onFavorite={() => toggleFavorite(normalizeTrackKey(item.song.songName, item.song.artist), item.song.songName, item.song.artist, item.song.albumArtUrl, item.song.youtubeVideoId)}
                    isFavorite={favoritesSet.has(normalizeTrackKey(item.song.songName, item.song.artist))}
                    showMoreMenu
                    playlists={playlists}
                    onAddToPlaylist={(playlistId) => addSongMatchToPlaylist(item.song, playlistId)}
                  />
                ))}
                {history.length === 0 ? <p className="text-sm text-[var(--muted)]">{language === "bg" ? "Няма история още. Пусни демо разпознаване." : "No recent recognitions yet. Run a quick demo."}</p> : null}
              </Card>
              <Card className="space-y-2">
                <h3 className="text-base font-semibold">{language === "bg" ? "Бързи действия" : "Quick next steps"}</h3>
                <Button variant="secondary" onClick={() => setShowNewPlaylistModal(true)}>{language === "bg" ? "Създай плейлист" : "Create playlist"}</Button>
                <Link href="/assistant" className="homeQuickLink inline-flex items-center justify-center px-4 py-2 text-sm font-medium transition">{language === "bg" ? "Попитай асистента за идеи" : "Ask assistant for ideas"}</Link>
              </Card>
            </aside>
          )}
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

      {showNewPlaylistModal && (
        <NewPlaylistModal
          onClose={() => setShowNewPlaylistModal(false)}
          onCreatePlaylist={handleCreatePlaylist}
          onCreated={() => setShowNewPlaylistModal(false)}
        />
      )}

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

      <div className="fixed left-2 right-2 top-4 z-50 flex w-auto max-w-[calc(100vw-1rem)] flex-col gap-3 sm:left-auto sm:right-4 sm:w-[320px] sm:max-w-[320px]">
        {showPlaylistUndoToast && (
          <div role="status" className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm">{t("toast_playlist_deleted", language)}</p>
              <button type="button" className="text-xs font-semibold text-[var(--accent)] hover:opacity-80" onClick={handleUndoDeletePlaylist}>{t("toast_undo", language)}</button>
            </div>
            <div className="absolute bottom-0 left-0 h-[2px] bg-[var(--accent)]" style={{ animation: "shrink 4s linear forwards" }} />
          </div>
        )}
        {toasts.map((toast) => (
          <div role="status" key={toast.id} className={`relative overflow-hidden rounded-xl border px-4 py-3 shadow-xl ${toast.kind === "success" ? "status-surface-success" : toast.kind === "error" ? "status-surface-danger" : "status-surface-info"}`}>
            <button
              type="button"
              className="absolute right-2 top-2 rounded p-1 text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)]"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}
              aria-label={t("modal_close", language)}
            >
              <X className="w-3 h-3 text-[var(--muted)]" />
            </button>
            <p className="pr-6 text-sm">{toast.message}</p>
            <div className="absolute bottom-0 left-0 h-[2px] bg-[var(--accent)]" style={{ animation: "shrink 3.5s linear forwards" }} />
          </div>
        ))}
      </div>
    </main>
  );
}
