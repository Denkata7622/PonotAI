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
import { YT_STAGE_READY_EVENTS } from "../lib/playerEvents";

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
  getPlayerState?: () => number;
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
type YouTubeStateMap = NonNullable<YouTubeWindow["YT"]>["PlayerState"];

const QUEUE_STORAGE_KEY = "ponotai.queue.v1";
const VOLUME_STORAGE_KEY = "ponotai.player.volume.v1";
const REPEAT_MODE_STORAGE_KEY = "ponotai.player.repeat-mode.v1";
const PLAYER_MOUNT_NODE_ID = "ponotai-yt-player";
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const PLAYBACK_RECOVERABLE_ERROR_CODES = new Set([100, 101, 150]);
const DEBUG_PLAYER_PROVIDER = process.env.NODE_ENV !== "production";

function logPlayerDebug(message: string, extra?: Record<string, unknown>) {
  if (!DEBUG_PLAYER_PROVIDER) return;
  if (extra) {
    console.debug(`[PlayerProvider] ${message}`, extra);
    return;
  }
  console.debug(`[PlayerProvider] ${message}`);
}

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
    const normalizedQueue = Array.isArray(parsed.queue)
      ? parsed.queue
        .filter((item): item is QueuedTrack & { track: Omit<QueueTrack, "id"> & { id?: string } } => Boolean(item?.track?.title && item?.track?.artist))
        .map((item) => ({ ...item, track: normalizeTrack(item.track) }))
      : [];
    const normalizedCurrentIndex = typeof parsed.currentIndex === "number" ? Math.max(0, parsed.currentIndex) : 0;
    return {
      queue: normalizedQueue,
      currentIndex: normalizedQueue.length === 0 ? 0 : Math.min(normalizedCurrentIndex, normalizedQueue.length - 1),
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
  const normalizedVideoId = normalizeVideoId(track.videoId);
  const fallbackId = `${track.title}-${track.artist}`.toLowerCase().replace(/\s+/g, "-");
  const normalizedId = (track.id?.trim() || normalizedVideoId || fallbackId).toLowerCase();
  const normalizedQuery = track.query?.trim() || `${track.title} ${track.artist} official audio`;
  return {
    id: normalizedId,
    title: track.title,
    artist: track.artist,
    artistId: track.artistId,
    artworkUrl: track.artworkUrl,
    license: track.license,
    query: normalizedQuery,
    videoId: normalizedVideoId,
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
  const failedVideoIdsRef = useRef<Set<string>>(new Set());
  const recoveryInFlightRef = useRef<Set<string>>(new Set());
  const trackLoadTokenRef = useRef(0);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const repeatModeRef = useRef(repeatMode);
  const durationRef = useRef(duration);
  const currentTrackRef = useRef<QueueTrack | null>(null);
  const currentVideoIdRef = useRef<string | null>(currentVideoId);

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
    if (!playerRef.current || !isPlayerReadyRef.current) return false;
    try {
      fn(playerRef.current);
      return true;
    } catch {
      return false;
    }
  }, []);

  const requestLoadVideo = useCallback((videoId: string, playback: "play" | "pause" | null = null) => {
    if (!videoId) return false;
    pendingVideoIdRef.current = videoId;
    if (playback) requestedPlaybackRef.current = playback;
    logPlayerDebug("loading video id", { videoId, playback });
    const loaded = safePlayerCall((player) => player.loadVideoById?.(videoId));
    if (loaded) pendingVideoIdRef.current = null;
    else logPlayerDebug("loadVideoById deferred because player is not ready yet", { videoId });
    return loaded;
  }, [safePlayerCall]);

  const requestPlayback = useCallback((playback: "play" | "pause") => {
    requestedPlaybackRef.current = playback;
    return safePlayerCall((player) => {
      if (playback === "play") {
        logPlayerDebug("playVideo");
        player.playVideo?.();
      } else {
        logPlayerDebug("pauseVideo");
        player.pauseVideo?.();
      }
    });
  }, [safePlayerCall]);

  const currentEntry = queue[currentIndex] ?? null;
  const currentTrack = currentEntry?.track ?? null;

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    currentVideoIdRef.current = currentVideoId;
  }, [currentVideoId]);

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
    const nextIndex = getNextQueueIndex(currentIndexRef.current, queueRef.current.length, repeatModeRef.current);
    if (nextIndex === null) {
      requestedPlaybackRef.current = "pause";
      setIsPlaying(false);
      setIsBuffering(false);
      setCurrentTime(durationRef.current || 0);
      requestPlayback("pause");
      return;
    }
    requestedPlaybackRef.current = "play";
    if (nextIndex === currentIndexRef.current) {
      setCurrentTime(0);
      safePlayerCall((player) => {
        player.seekTo?.(0, true);
        player.playVideo?.();
      });
      return;
    }
    setCurrentIndex(nextIndex);
    setCurrentTime(0);
    setDuration(0);
  }, [safePlayerCall]);

  const playPrevious = useCallback(() => {
    requestedPlaybackRef.current = "play";
    setCurrentIndex((previous) => {
      const nextIndex = Math.max(previous - 1, 0);
      if (nextIndex === previous) {
        setCurrentTime(0);
        safePlayerCall((player) => {
          player.seekTo?.(0, true);
          player.playVideo?.();
        });
      }
      return nextIndex;
    });
  }, [safePlayerCall]);

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

  const syncFromPlayerState = useCallback((playerState: number | undefined, playerStateMap?: YouTubeStateMap) => {
    if (typeof playerState !== "number" || !playerStateMap) return;
    const snapshot = mapYouTubeState(playerState, playerStateMap);
    setIsPlaying(snapshot.isPlaying);
    setIsBuffering(snapshot.isBuffering);
    if (snapshot.ended) {
      handleTrackEnded();
    }
  }, [handleTrackEnded]);

  const applyYouTubeIframePolicy = useCallback(() => {
    const iframe = document.getElementById(PLAYER_MOUNT_NODE_ID);
    if (iframe?.tagName !== "IFRAME") return;
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    iframe.setAttribute("allowfullscreen", "");
  }, []);

  const recoverFromPlaybackError = useCallback((errorCode: number, failedVideoIdOverride?: string | null) => {
    if (!PLAYBACK_RECOVERABLE_ERROR_CODES.has(errorCode)) return false;
    const track = currentTrackRef.current ?? queueRef.current[currentIndexRef.current]?.track ?? null;
    const failedVideoId = failedVideoIdOverride ?? currentVideoIdRef.current;
    if (!track || !failedVideoId) return false;
    const failureKey = `${track.id}:${failedVideoId}`;
    if (recoveryInFlightRef.current.has(failureKey)) return true;
    if (failedVideoIdsRef.current.has(failureKey)) return false;
    recoveryInFlightRef.current.add(failureKey);
    failedVideoIdsRef.current.add(failureKey);

    const loadToken = trackLoadTokenRef.current;
    const queueIndex = currentIndexRef.current;
    const recoveryQuery = track.query?.trim() || `${track.title} ${track.artist}`;
    setPlayerError("Trying another embeddable YouTube result...");

    void (async () => {
      try {
        const params = new URLSearchParams({ query: recoveryQuery, exclude: failedVideoId });
        const response = await fetch(`/api/youtube/resolve?${params.toString()}`);
        if (!response.ok) {
          setPlayerError(`Playback error (${errorCode}).`);
          return;
        }
        const payload = (await response.json()) as { videoId?: string };
        const replacementVideoId = normalizeVideoId(payload.videoId);
        if (!replacementVideoId || replacementVideoId === failedVideoId || loadToken !== trackLoadTokenRef.current) {
          logPlayerDebug("resolver returned null");
          setPlayerError(`Playback error (${errorCode}).`);
          return;
        }
        logPlayerDebug("resolver returned videoId", { videoId: replacementVideoId });

        currentVideoIdRef.current = replacementVideoId;
        setCurrentVideoId(replacementVideoId);
        setQueue((prev) => prev.map((item, index) => (
          index === queueIndex ? { ...item, track: { ...item.track, videoId: replacementVideoId } } : item
        )));
        setPlayerError(null);
        requestedPlaybackRef.current = "play";
        requestLoadVideo(replacementVideoId, "play");
      } catch {
        if (loadToken === trackLoadTokenRef.current) setPlayerError(`Playback error (${errorCode}).`);
      } finally {
        recoveryInFlightRef.current.delete(failureKey);
      }
    })();

    return true;
  }, [requestLoadVideo]);

  const initializePlayer = useCallback(() => {
    if (typeof window === "undefined") return false;
    const ytWindow = window as YouTubeWindow;
    if (!ytWindow.YT?.Player || playerRef.current) return false;
    const mountNode = document.getElementById(PLAYER_MOUNT_NODE_ID);
    if (!mountNode || !mountNode.isConnected) {
      logPlayerDebug("mount missing", { isConnected: mountNode?.isConnected ?? false });
      return false;
    }
    logPlayerDebug("mount exists", { tagName: mountNode.tagName, isConnected: mountNode.isConnected });
    const initialVideoId = pendingVideoIdRef.current ?? currentVideoIdRef.current;
    if (!initialVideoId) return false;

    logPlayerDebug("initializing YT.Player", { initialVideoId });
    playerRef.current = new ytWindow.YT.Player(PLAYER_MOUNT_NODE_ID, {
      width: "100%",
      height: "100%",
      videoId: initialVideoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin,
        widget_referrer: window.location.href,
      },
      events: {
        onReady: (event: { target: YTPlayerLike }) => {
          logPlayerDebug("onReady");
          playerRef.current = event.target;
          isPlayerReadyRef.current = true;
          applyYouTubeIframePolicy();
          safePlayerCall((player) => player.setVolume?.(volume));
          if (pendingVideoIdRef.current && pendingVideoIdRef.current !== initialVideoId) {
            const queuedVideoId = pendingVideoIdRef.current;
            requestLoadVideo(queuedVideoId);
            pendingVideoIdRef.current = null;
          }
          if (requestedPlaybackRef.current === "play") {
            requestPlayback("play");
          } else if (requestedPlaybackRef.current === "pause") {
            requestPlayback("pause");
          }
          setIsInitializing(false);
          setPlayerError(null);
        },
        onError: (event: { data: number | string }) => {
          const errorCode = Number(event.data);
          if (!recoverFromPlaybackError(errorCode, initialVideoId)) {
            setPlayerError(`Playback error (${Number.isFinite(errorCode) ? errorCode : event.data}).`);
          }
        },
        onStateChange: (event: { data: number }) => {
          const state = ytWindow.YT?.PlayerState;
          syncFromPlayerState(event.data, state);
        },
      },
    });
    return true;
  }, [applyYouTubeIframePolicy, recoverFromPlaybackError, safePlayerCall, syncFromPlayerState, volume]);

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
    if (typeof window === "undefined") return;

    const handleStageMounted = () => {
      initializePlayer();

      if (pendingVideoIdRef.current) {
        const pendingVideoId = pendingVideoIdRef.current;
        requestLoadVideo(pendingVideoId);
        pendingVideoIdRef.current = null;
      } else if (
        currentVideoIdRef.current
        && playerRef.current
        && isPlayerReadyRef.current
        && requestedPlaybackRef.current === "play"
      ) {
        requestLoadVideo(currentVideoIdRef.current);
      }

      if (requestedPlaybackRef.current === "play" && playerRef.current && isPlayerReadyRef.current) {
        requestPlayback("play");
      }
    };

    YT_STAGE_READY_EVENTS.forEach((eventName) => window.addEventListener(eventName, handleStageMounted));
    return () => {
      YT_STAGE_READY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, handleStageMounted));
    };
  }, [initializePlayer, requestLoadVideo, requestPlayback]);

  useEffect(() => {
    if (!playerRef.current || !isPlayerReadyRef.current) {
      initializePlayer();
      return;
    }

    if (pendingVideoIdRef.current) {
      const pendingVideoId = pendingVideoIdRef.current;
      requestLoadVideo(pendingVideoId);
      pendingVideoIdRef.current = null;
    }

    if (requestedPlaybackRef.current === "play") {
      requestPlayback("play");
    } else if (requestedPlaybackRef.current === "pause") {
      requestPlayback("pause");
    }
  }, [initializePlayer, requestLoadVideo, requestPlayback, currentVideoId]);

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
    if (currentTrack) return;
    requestedPlaybackRef.current = "pause";
    setCurrentVideoId(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsBuffering(false);
    requestPlayback("pause");
  }, [currentTrack, safePlayerCall]);

  useEffect(() => {
    if (!currentTrack) return;
    setCurrentTime(0);
    setDuration(0);
    setIsBuffering(true);
    setIsPlaying(false);
    trackLoadTokenRef.current += 1;
    const loadToken = trackLoadTokenRef.current;
    const queueId = currentEntry?.queueId;
    const resolvedVideoId = normalizeVideoId(currentTrack.videoId);
    currentVideoIdRef.current = resolvedVideoId ?? null;
    setCurrentVideoId(resolvedVideoId ?? null);

    if (!resolvedVideoId) {
      let cancelled = false;
      (async () => {
        try {
          const resolverQuery = currentTrack.query?.trim() || `${currentTrack.title} ${currentTrack.artist} official audio`;
          const response = await fetch(`/api/youtube/resolve?query=${encodeURIComponent(resolverQuery)}`);
          if (!response.ok) {
            setPlayerError("Could not resolve a playable YouTube video.");
            return;
          }
          const payload = (await response.json()) as { videoId?: string };
          const fetchedVideoId = normalizeVideoId(payload.videoId);
          if (!fetchedVideoId || cancelled) {
            logPlayerDebug("resolver returned null");
            setPlayerError("Could not resolve a playable YouTube video.");
            return;
          }
          logPlayerDebug("resolver returned videoId", { videoId: fetchedVideoId });
          if (loadToken !== trackLoadTokenRef.current) return;
          currentVideoIdRef.current = fetchedVideoId;
          setCurrentVideoId(fetchedVideoId);
          setQueue((prev) => prev.map((item) => (item.queueId === queueId ? { ...item, track: { ...item.track, videoId: fetchedVideoId } } : item)));
          setPlayerError(null);
          requestedPlaybackRef.current = "play";
          if (!isPlayerReadyRef.current) {
            pendingVideoIdRef.current = fetchedVideoId;
            initializePlayer();
            return;
          }
          requestLoadVideo(fetchedVideoId, "play");
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
      initializePlayer();
      return;
    }
    requestedPlaybackRef.current = "play";
    requestLoadVideo(resolvedVideoId, "play");
    const startPlayback = window.setTimeout(() => {
      if (loadToken !== trackLoadTokenRef.current) return;
      if (requestedPlaybackRef.current === "pause") {
        requestPlayback("pause");
        return;
      }
      requestedPlaybackRef.current = "play";
      requestPlayback("play");
    }, 250);
    return () => window.clearTimeout(startPlayback);
  }, [currentEntry?.queueId, currentTrack, initializePlayer, requestLoadVideo, safePlayerCall]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      safePlayerCall((player) => {
        const ytWindow = window as YouTubeWindow;
        syncFromPlayerState(player.getPlayerState?.(), ytWindow.YT?.PlayerState);
        setCurrentTime(player.getCurrentTime?.() || 0);
        setDuration(player.getDuration?.() || 0);
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, [safePlayerCall, syncFromPlayerState]);

  const requestPlay = useCallback(() => {
    if (!currentTrackRef.current) return;
    requestedPlaybackRef.current = "play";
    requestPlayback("play");
  }, [safePlayerCall]);

  const requestPause = useCallback(() => {
    requestedPlaybackRef.current = "pause";
    setIsPlaying(false);
    setIsBuffering(false);
    requestPlayback("pause");
  }, [safePlayerCall]);

  const stopPlayback = useCallback(() => {
    if (!currentTrackRef.current) return;
    requestPause();
    setCurrentTime(0);
    safePlayerCall((player) => player.seekTo?.(0, true));
  }, [requestPause, safePlayerCall]);

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
    requestPlayback("pause");
  }, []);

  const playFromQueue = useCallback((queueId: string) => {
    const nextIndex = queue.findIndex((entry) => entry.queueId === queueId);
    if (nextIndex >= 0) {
      requestedPlaybackRef.current = "play";
      setCurrentIndex(nextIndex);
    }
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
    const playerState = playerRef.current?.getPlayerState?.();
    const ytState = (typeof window !== "undefined" ? (window as YouTubeWindow).YT?.PlayerState : undefined);
    const playerReportsPlaying = typeof playerState === "number" && ytState ? playerState === ytState.PLAYING : isPlaying;

    if (playerReportsPlaying) {
      requestPause();
      return;
    }
    requestPlay();
  }, [currentTrack, isPlaying, requestPause, requestPlay]);

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
      } else if (event.code === "MediaPlayPause") {
        event.preventDefault();
        togglePlayPause();
      } else if (event.code === "MediaPlay") {
        event.preventDefault();
        requestPlay();
      } else if (event.code === "MediaPause") {
        event.preventDefault();
        requestPause();
      } else if (event.code === "MediaStop") {
        event.preventDefault();
        stopPlayback();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        playNext();
      } else if (event.code === "MediaTrackNext") {
        event.preventDefault();
        playNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        playPrevious();
      } else if (event.code === "MediaTrackPrevious") {
        event.preventDefault();
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
  }, [playNext, playPrevious, requestPause, requestPlay, setVolume, stopPlayback, togglePlayPause, volume]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", requestPlay);
    navigator.mediaSession.setActionHandler("pause", requestPause);
    navigator.mediaSession.setActionHandler("nexttrack", playNext);
    navigator.mediaSession.setActionHandler("previoustrack", playPrevious);
    navigator.mediaSession.setActionHandler("stop", stopPlayback);

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("stop", null);
    };
  }, [playNext, playPrevious, requestPause, requestPlay, stopPlayback]);

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
