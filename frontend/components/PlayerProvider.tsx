"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getNextQueueIndex, mapYouTubeState, type QueueTrack, type RepeatMode } from "../features/player/state";

export type QueuedTrack = {
  queueId: string;
  track: QueueTrack;
  addedAt: string;
  source: "manual" | "playlist" | "assistant";
};

type PlayerContextValue = {
  queue: QueuedTrack[];
  currentIndex: number;
  currentTrack: QueueTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isInitializing: boolean;
  isBuffering: boolean;
  playerError: string | null;
  currentVideoId: string | null;
  repeatMode: RepeatMode;
  addToQueue: (track: Omit<QueueTrack, "id"> & { id?: string }, source?: QueuedTrack["source"]) => void;
  playNow: (track: Omit<QueueTrack, "id"> & { id?: string }, source?: QueuedTrack["source"]) => void;
  addManyToQueue: (tracks: Array<Omit<QueueTrack, "id"> & { id?: string }>, source?: QueuedTrack["source"]) => void;
  removeFromQueue: (queueId: string) => void;
  clearQueue: () => void;
  playNext: () => void;
  playPrevious: () => void;
  playFromQueue: (queueId: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  togglePlayPause: () => void;
  skipNext: () => void;
  skipPrevious: () => void;
  seekToPercent: (percent: number) => void;
  setVolume: (volume: number) => void;
  cycleRepeatMode: () => void;
};

type YTPlayerLike = {
  playVideo: () => void;
  pauseVideo: () => void;
  getDuration: () => number;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume: (value: number) => void;
  loadVideoById: (videoId: string) => void;
  destroy?: () => void;
};

type YouTubeWindow = Window & {
  YT?: {
    Player: new (elementId: string, options: Record<string, unknown>) => YTPlayerLike;
    PlayerState: {
      PLAYING: number;
      PAUSED: number;
      ENDED: number;
      CUED: number;
      BUFFERING: number;
    };
  };
  onYouTubeIframeAPIReady?: () => void;
};

const QUEUE_STORAGE_KEY = "ponotai.queue.v1";
const VOLUME_STORAGE_KEY = "ponotai.player.volume.v1";
const REPEAT_MODE_STORAGE_KEY = "ponotai.player.repeat-mode.v1";
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

function readStoredState(): {
  queue: QueuedTrack[];
  currentIndex: number;
  volume: number;
  repeatMode: RepeatMode;
} {
  if (typeof window === "undefined") {
    return { queue: [] as QueuedTrack[], currentIndex: 0, volume: 70, repeatMode: "normal" as RepeatMode };
  }

  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    const rawVolume = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { queue?: QueuedTrack[]; currentIndex?: number }) : {};
    const rawRepeatMode = window.localStorage.getItem(REPEAT_MODE_STORAGE_KEY);
    const repeatMode = rawRepeatMode === "queue" || rawRepeatMode === "track" ? rawRepeatMode : "normal";
    return {
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      currentIndex: typeof parsed.currentIndex === "number" ? Math.max(0, parsed.currentIndex) : 0,
      volume: rawVolume ? Math.max(0, Math.min(100, Number(rawVolume) || 70)) : 70,
      repeatMode,
    };
  } catch {
    return { queue: [] as QueuedTrack[], currentIndex: 0, volume: 70, repeatMode: "normal" as RepeatMode };
  }
}

function normalizeVideoId(input?: string) {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      const shortId = url.pathname.replace(/^\//, "").split("/")[0];
      if (VIDEO_ID_PATTERN.test(shortId)) return shortId;
    }
    if (url.hostname.includes("youtube.com")) {
      const watchId = url.searchParams.get("v");
      if (watchId && VIDEO_ID_PATTERN.test(watchId)) return watchId;
      const parts = url.pathname.split("/").filter(Boolean);
      if ((parts[0] === "embed" || parts[0] === "shorts") && parts[1] && VIDEO_ID_PATTERN.test(parts[1])) {
        return parts[1];
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function normalizeTrack(track: Omit<QueueTrack, "id"> & { id?: string }): QueueTrack {
  return {
    id: track.id ?? `${track.title}-${track.artist}`.toLowerCase().replace(/\s+/g, "-"),
    title: track.title,
    artist: track.artist,
    artistId: track.artistId,
    artworkUrl: track.artworkUrl,
    license: track.license,
    query: track.query,
    videoId: normalizeVideoId(track.videoId),
  };
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const initial = readStoredState();
  const [queue, setQueue] = useState<QueuedTrack[]>(initial.queue);
  const [currentIndex, setCurrentIndex] = useState(initial.currentIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(initial.volume);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(initial.repeatMode ?? "normal");
  const [isInitializing, setIsInitializing] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const lastVolumeBeforeMuteRef = useRef(initial.volume || 70);
  const playerRef = useRef<YTPlayerLike | null>(null);
  const isPlayerReadyRef = useRef(false);
  const pendingVideoIdRef = useRef<string | null>(null);
  const requestedPlaybackRef = useRef<"play" | "pause" | null>(null);
  const trackLoadTokenRef = useRef(0);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const repeatModeRef = useRef(repeatMode);
  const durationRef = useRef(duration);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const safePlayerCall = useCallback((fn: (player: YTPlayerLike) => void) => {
    if (!playerRef.current || !isPlayerReadyRef.current) return;
    try {
      fn(playerRef.current);
    } catch {
      // Player can be destroyed between checks during fast unmount/remount cycles.
    }
  }, []);

  const currentEntry = queue[currentIndex] ?? null;
  const currentTrack = currentEntry?.track ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      QUEUE_STORAGE_KEY,
      JSON.stringify({ queue, currentIndex }),
    );
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    window.localStorage.setItem(REPEAT_MODE_STORAGE_KEY, repeatMode);
  }, [queue, currentIndex, volume, repeatMode]);

  const playNext = useCallback(() => {
    setCurrentIndex((previous) => (previous + 1 < queue.length ? previous + 1 : previous));
  }, [queue.length]);

  const playPrevious = useCallback(() => {
    setCurrentIndex((previous) => Math.max(previous - 1, 0));
  }, []);

  const handleTrackEnded = useCallback(() => {
    const nextIndex = getNextQueueIndex(
      currentIndexRef.current,
      queueRef.current.length,
      repeatModeRef.current,
    );

    if (nextIndex === null) {
      requestedPlaybackRef.current = "pause";
      setIsPlaying(false);
      setIsBuffering(false);
      setCurrentTime(durationRef.current || 0);
      return;
    }

    if (nextIndex === currentIndexRef.current) {
      requestedPlaybackRef.current = "play";
      setCurrentTime(0);
      setDuration(durationRef.current || 0);
      safePlayerCall((player) => {
        player.seekTo?.(0, true);
        player.playVideo?.();
      });
      return;
    }

    requestedPlaybackRef.current = "play";
    setCurrentIndex(nextIndex);
    setCurrentTime(0);
    setDuration(0);
  }, [safePlayerCall]);

  const initializePlayer = useCallback(() => {
    if (typeof window === "undefined") return false;
    const ytWindow = window as YouTubeWindow;
    if (!ytWindow.YT?.Player || playerRef.current) return false;
    if (!document.getElementById("ponotai-yt-player")) return false;

    playerRef.current = new ytWindow.YT.Player("ponotai-yt-player", {
      width: "100%",
      height: "100%",
      playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, enablejsapi: 1 },
      events: {
        onReady: (event: { target: YTPlayerLike }) => {
          playerRef.current = event.target;
          isPlayerReadyRef.current = true;
          safePlayerCall((player) => player.setVolume?.(volume));
          if (pendingVideoIdRef.current) {
            const queuedVideoId = pendingVideoIdRef.current;
            safePlayerCall((player) => player.loadVideoById?.(queuedVideoId));
            pendingVideoIdRef.current = null;
          }
          if (requestedPlaybackRef.current === "play") {
            safePlayerCall((player) => player.playVideo?.());
          } else if (requestedPlaybackRef.current === "pause") {
            safePlayerCall((player) => player.pauseVideo?.());
          }
          setIsInitializing(false);
          setPlayerError(null);
        },
        onError: (event: { data: number }) => {
          setPlayerError(`Playback error (${event.data}).`);
        },
        onStateChange: (event: { data: number }) => {
          const state = ytWindow.YT?.PlayerState;
          if (!state) return;
          const snapshot = mapYouTubeState(event.data, state);
          setIsPlaying(snapshot.isPlaying);
          setIsBuffering(snapshot.isBuffering);
          if (snapshot.ended) {
            handleTrackEnded();
          }
        },
      },
    });
    return true;
  }, [handleTrackEnded, safePlayerCall, volume]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ytWindow = window as YouTubeWindow;
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => setPlayerError("YouTube player failed to initialize.");
      document.body.appendChild(script);
    }

    const previousHandler = ytWindow.onYouTubeIframeAPIReady;
    ytWindow.onYouTubeIframeAPIReady = () => {
      previousHandler?.();
      initializePlayer();
    };

    if (ytWindow.YT?.Player) initializePlayer();
    return () => {
      ytWindow.onYouTubeIframeAPIReady = previousHandler;
    };
  }, [initializePlayer]);

  useEffect(() => {
    if (!currentVideoId || playerRef.current) return;
    initializePlayer();
  }, [currentVideoId, initializePlayer]);

  useEffect(() => {
    return () => {
      isPlayerReadyRef.current = false;
      pendingVideoIdRef.current = null;
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy();
        } catch {
          // noop
        }
      }
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    safePlayerCall((player) => player.setVolume?.(volume));
  }, [safePlayerCall, volume]);

  useEffect(() => {
    if (!currentTrack) return;
    setCurrentTime(0);
    setDuration(0);
    trackLoadTokenRef.current += 1;
    const loadToken = trackLoadTokenRef.current;
    const queueId = currentEntry?.queueId;
    const resolvedVideoId = normalizeVideoId(currentTrack.videoId);
    setCurrentVideoId(resolvedVideoId ?? null);

    if (!resolvedVideoId) {
      let cancelled = false;
      (async () => {
        try {
          const response = await fetch(`/api/youtube/resolve?query=${encodeURIComponent(currentTrack.query)}`);
          if (!response.ok) {
            setPlayerError("Could not resolve a playable YouTube video.");
            return;
          }
          const payload = (await response.json()) as { videoId?: string };
          const fetchedVideoId = normalizeVideoId(payload.videoId);
          if (!fetchedVideoId || cancelled) {
            setPlayerError("Could not resolve a playable YouTube video.");
            return;
          }
          if (loadToken !== trackLoadTokenRef.current) return;
          setCurrentVideoId(fetchedVideoId);
          setQueue((prev) => prev.map((item) => (item.queueId === queueId ? { ...item, track: { ...item.track, videoId: fetchedVideoId } } : item)));
          setPlayerError(null);
        } catch {
          if (!cancelled) setPlayerError("Could not resolve a playable YouTube video.");
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    if (!isPlayerReadyRef.current) {
      pendingVideoIdRef.current = resolvedVideoId;
      return;
    }
    safePlayerCall((player) => player.loadVideoById?.(resolvedVideoId));
    const startPlayback = window.setTimeout(() => {
      if (loadToken !== trackLoadTokenRef.current) return;
      if (requestedPlaybackRef.current === "pause") {
        safePlayerCall((player) => player.pauseVideo());
        return;
      }
      requestedPlaybackRef.current = "play";
      safePlayerCall((player) => player.playVideo());
    }, 250);
    return () => window.clearTimeout(startPlayback);
  }, [currentEntry?.queueId, currentTrack, safePlayerCall]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      safePlayerCall((player) => {
        setCurrentTime(player.getCurrentTime?.() || 0);
        setDuration(player.getDuration?.() || 0);
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, [safePlayerCall]);

  const addToQueue = useCallback((track: Omit<QueueTrack, "id"> & { id?: string }, source: QueuedTrack["source"] = "manual") => {
    const nextEntry: QueuedTrack = { queueId: crypto.randomUUID(), track: normalizeTrack(track), addedAt: new Date().toISOString(), source };
    setQueue((prev) => {
      const next = [...prev, nextEntry];
      if (prev.length === 0) setCurrentIndex(0);
      return next;
    });
  }, []);

  const playNow = useCallback((track: Omit<QueueTrack, "id"> & { id?: string }, source: QueuedTrack["source"] = "manual") => {
    const nextEntry: QueuedTrack = { queueId: crypto.randomUUID(), track: normalizeTrack(track), addedAt: new Date().toISOString(), source };
    setQueue((prev) => {
      const next = [...prev, nextEntry];
      setCurrentIndex(next.length - 1);
      return next;
    });
    requestedPlaybackRef.current = "play";
    setIsPlaying(true);
  }, []);

  const addManyToQueue = useCallback((tracks: Array<Omit<QueueTrack, "id"> & { id?: string }>, source: QueuedTrack["source"] = "manual") => {
    if (tracks.length === 0) return;
    const now = new Date().toISOString();
    const mapped = tracks.map((track) => ({ queueId: crypto.randomUUID(), track: normalizeTrack(track), addedAt: now, source }));
    setQueue((prev) => {
      const next = [...prev, ...mapped];
      if (prev.length === 0) setCurrentIndex(0);
      return next;
    });
  }, []);

  const removeFromQueue = useCallback((queueId: string) => {
    setQueue((prev) => {
      const removeIndex = prev.findIndex((item) => item.queueId === queueId);
      if (removeIndex < 0) return prev;
      const next = prev.filter((item) => item.queueId !== queueId);
      setCurrentIndex((current) => {
        if (next.length === 0) return 0;
        if (removeIndex < current) return current - 1;
        if (removeIndex === current) return Math.min(current, next.length - 1);
        return current;
      });
      return next;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setCurrentIndex(0);
    setCurrentTime(0);
    setDuration(0);
    setCurrentVideoId(null);
    setIsPlaying(false);
    safePlayerCall((player) => player.pauseVideo());
  }, []);

  const playFromQueue = useCallback((queueId: string) => {
    const nextIndex = queue.findIndex((entry) => entry.queueId === queueId);
    if (nextIndex >= 0) setCurrentIndex(nextIndex);
  }, [queue]);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setCurrentIndex((current) => {
        if (current === fromIndex) return toIndex;
        if (fromIndex < current && toIndex >= current) return current - 1;
        if (fromIndex > current && toIndex <= current) return current + 1;
        return current;
      });
      return next;
    });
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!currentTrack) return;
    if (isPlaying) {
      requestedPlaybackRef.current = "pause";
      if (!isPlayerReadyRef.current) {
        setIsPlaying(false);
        return;
      }
      safePlayerCall((player) => player.pauseVideo?.());
      return;
    }
    requestedPlaybackRef.current = "play";
    if (!isPlayerReadyRef.current) {
      setIsPlaying(true);
      return;
    }
      safePlayerCall((player) => player.playVideo?.());
  }, [currentTrack, isPlaying, safePlayerCall]);

  const seekToPercent = useCallback((percent: number) => {
    if (!duration) return;
    const seconds = (Math.max(0, Math.min(100, percent)) / 100) * duration;
    safePlayerCall((player) => player.seekTo?.(seconds, true));
    setCurrentTime(seconds);
  }, [duration, safePlayerCall]);

  const setVolume = useCallback((nextVolume: number) => {
    const normalized = Math.max(0, Math.min(100, nextVolume));
    setVolumeState(normalized);
    safePlayerCall((player) => player.setVolume?.(normalized));
  }, [safePlayerCall]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((previous) => {
      if (previous === "normal") return "queue";
      if (previous === "queue") return "track";
      return "normal";
    });
  }, []);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlayPause();
      } else if (event.key === "ArrowRight") {
        playNext();
      } else if (event.key === "ArrowLeft") {
        playPrevious();
      } else if (event.key.toLowerCase() === "m") {
        if (volume === 0) setVolume(lastVolumeBeforeMuteRef.current || 70);
        else {
          lastVolumeBeforeMuteRef.current = volume;
          setVolume(0);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playNext, playPrevious, setVolume, togglePlayPause, volume]);

  const value = useMemo<PlayerContextValue>(() => ({
    queue,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isInitializing,
    isBuffering,
    playerError,
    currentVideoId,
    repeatMode,
    addToQueue,
    playNow,
    addManyToQueue,
    removeFromQueue,
    clearQueue,
    playNext,
    playPrevious,
    playFromQueue,
    reorderQueue,
    togglePlayPause,
    skipNext: playNext,
    skipPrevious: playPrevious,
    seekToPercent,
    setVolume,
    cycleRepeatMode,
  }), [
    queue,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isInitializing,
    isBuffering,
    playerError,
    currentVideoId,
    repeatMode,
    addToQueue,
    playNow,
    addManyToQueue,
    removeFromQueue,
    clearQueue,
    playNext,
    playPrevious,
    playFromQueue,
    reorderQueue,
    togglePlayPause,
    seekToPercent,
    setVolume,
    cycleRepeatMode,
  ]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within PlayerProvider");
  return context;
}
