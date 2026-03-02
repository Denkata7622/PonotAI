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
import { upsertTrack, type QueueTrack } from "../features/player/state";

type PlayerContextValue = {
  queue: QueueTrack[];
  currentTrack: QueueTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isInitializing: boolean;
  playerError: string | null;
  addToQueue: (track: Omit<QueueTrack, "id"> & { id?: string }) => void;
  togglePlayPause: () => void;
  skipNext: () => void;
  skipPrevious: () => void;
  seekToPercent: (percent: number) => void;
  setVolume: (volume: number) => void;
};

type YTPlayerLike = {
  playVideo: () => void;
  pauseVideo: () => void;
  getDuration: () => number;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume: (value: number) => void;
  loadVideoById: (videoId: string) => void;
};

type YouTubeWindow = Window & {
  YT?: {
    Player: new (elementId: string, options: Record<string, unknown>) => YTPlayerLike;
    PlayerState: {
      PLAYING: number;
      PAUSED: number;
      ENDED: number;
      CUED: number;
    };
  };
  onYouTubeIframeAPIReady?: () => void;
};

const STORAGE_KEY = "ponotai.player.state.v1";
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

function readStoredState() {
  if (typeof window === "undefined") {
    return { queue: [] as QueueTrack[], activeIndex: 0, volume: 70 };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { queue: [] as QueueTrack[], activeIndex: 0, volume: 70 };
    }

    const parsed = JSON.parse(raw) as { queue?: QueueTrack[]; activeIndex?: number; volume?: number };

    return {
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      activeIndex: typeof parsed.activeIndex === "number" ? Math.max(0, parsed.activeIndex) : 0,
      volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(100, parsed.volume)) : 70,
    };
  } catch {
    return { queue: [] as QueueTrack[], activeIndex: 0, volume: 70 };
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

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const initialState = readStoredState();
  const [queue, setQueue] = useState<QueueTrack[]>(initialState.queue);
  const [activeIndex, setActiveIndex] = useState(initialState.activeIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(initialState.volume);
  const [isInitializing, setIsInitializing] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const playerRef = useRef<YTPlayerLike | null>(null);

  const currentTrack = queue[activeIndex] ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        queue,
        activeIndex,
        volume,
      }),
    );
  }, [queue, activeIndex, volume]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ytWindow = window as YouTubeWindow;
    const setupPlayer = () => {
      if (!ytWindow.YT || playerRef.current) return;

      playerRef.current = new ytWindow.YT.Player("ponotai-hidden-yt-player", {
        width: "1",
        height: "1",
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: () => {
            playerRef.current?.setVolume(volume);
            setIsInitializing(false);
            setPlayerError(null);
          },
          onError: (event: { data: number }) => {
            const message = `Playback error (${event.data}).`;
            setPlayerError(message);
            console.warn(`[analytics] playback_error code=${event.data}`);
          },
          onStateChange: (event: { data: number }) => {
            const state = ytWindow.YT?.PlayerState;
            if (!state) return;

            if (event.data === state.PLAYING) setIsPlaying(true);
            if (event.data === state.PAUSED || event.data === state.CUED) setIsPlaying(false);
            if (event.data === state.ENDED) {
              setIsPlaying(false);
              setActiveIndex((previous) => {
                const nextIndex = previous + 1;
                return nextIndex < queue.length ? nextIndex : previous;
              });
            }
          },
        },
      });
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }

    const previousHandler = ytWindow.onYouTubeIframeAPIReady;
    ytWindow.onYouTubeIframeAPIReady = () => {
      previousHandler?.();
      setupPlayer();
    };

    if (ytWindow.YT?.Player) setupPlayer();

    return () => {
      ytWindow.onYouTubeIframeAPIReady = previousHandler;
    };
  }, [queue.length, volume]);

  useEffect(() => {
    if (!playerRef.current || !currentTrack) return;

    const resolvedVideoId = normalizeVideoId(currentTrack.videoId);

    if (resolvedVideoId) {
      playerRef.current.loadVideoById(resolvedVideoId);
      const startPlayback = window.setTimeout(() => playerRef.current?.playVideo(), 250);
      return () => window.clearTimeout(startPlayback);
    }

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

        setQueue((previous) =>
          previous.map((item, index) => (index === activeIndex ? { ...item, videoId: fetchedVideoId } : item)),
        );
        setPlayerError(null);
      } catch {
        if (!cancelled) setPlayerError("Could not resolve a playable YouTube video.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeIndex, currentTrack]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!playerRef.current) return;
      if (playerRef.current?.getCurrentTime) {
        setCurrentTime(playerRef.current.getCurrentTime() || 0);
      }
      if (playerRef.current?.getDuration) {
        setDuration(playerRef.current.getDuration() || 0);
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, []);

  const addToQueue = useCallback((track: Omit<QueueTrack, "id"> & { id?: string }) => {
    const queueTrack: QueueTrack = {
      id: track.id ?? `${track.title}-${track.artist}`.toLowerCase().replace(/\s+/g, "-"),
      title: track.title,
      artist: track.artist,
      artistId: track.artistId,
      artworkUrl: track.artworkUrl,
      license: track.license,
      query: track.query,
      videoId: normalizeVideoId(track.videoId),
    };

    setQueue((previousQueue) => {
      const result = upsertTrack(previousQueue, queueTrack);
      setActiveIndex(result.activeIndex);
      return result.queue;
    });
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!playerRef.current || !currentTrack) return;
    if (isPlaying) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }, [currentTrack, isPlaying]);

  const skipNext = useCallback(() => {
    setActiveIndex((previous) => Math.min(previous + 1, Math.max(0, queue.length - 1)));
  }, [queue.length]);

  const skipPrevious = useCallback(() => {
    setActiveIndex((previous) => Math.max(previous - 1, 0));
  }, []);

  const seekToPercent = useCallback(
    (percent: number) => {
      if (!playerRef.current || !duration) return;
      const seconds = (Math.max(0, Math.min(100, percent)) / 100) * duration;
      playerRef.current.seekTo(seconds, true);
      setCurrentTime(seconds);
    },
    [duration],
  );

  const setVolume = useCallback((nextVolume: number) => {
    const normalized = Math.max(0, Math.min(100, nextVolume));
    setVolumeState(normalized);
    playerRef.current?.setVolume(normalized);
  }, []);

  const contextValue = useMemo<PlayerContextValue>(
    () => ({
      queue,
      currentTrack,
      isPlaying,
      currentTime,
      duration,
      volume,
      isInitializing,
      playerError,
      addToQueue,
      togglePlayPause,
      skipNext,
      skipPrevious,
      seekToPercent,
      setVolume,
    }),
    [
      queue,
      currentTrack,
      isPlaying,
      currentTime,
      duration,
      volume,
      isInitializing,
      playerError,
      addToQueue,
      togglePlayPause,
      skipNext,
      skipPrevious,
      seekToPercent,
      setVolume,
    ],
  );

  return (
    <PlayerContext.Provider value={contextValue}>
      {children}
      <div id="ponotai-hidden-yt-player" className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px" aria-hidden />
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within PlayerProvider");
  }
  return context;
}
