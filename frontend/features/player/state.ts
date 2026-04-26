export type QueueTrack = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  artworkUrl: string;
  videoId?: string;
  query: string;
  license: "COPYRIGHTED" | "CREATIVE_COMMONS" | "UNKNOWN" | "FREE";
};

export type PlaybackSnapshot = {
  isPlaying: boolean;
  isBuffering: boolean;
  ended: boolean;
};

export type RepeatMode = "normal" | "queue" | "track";

export function mapYouTubeState(playerState: number, stateMap: { PLAYING: number; PAUSED: number; ENDED: number; CUED: number; BUFFERING: number }): PlaybackSnapshot {
  if (playerState === stateMap.PLAYING) return { isPlaying: true, isBuffering: false, ended: false };
  if (playerState === stateMap.BUFFERING) return { isPlaying: false, isBuffering: true, ended: false };
  if (playerState === stateMap.ENDED) return { isPlaying: false, isBuffering: false, ended: true };
  if (playerState === stateMap.PAUSED || playerState === stateMap.CUED) return { isPlaying: false, isBuffering: false, ended: false };
  return { isPlaying: false, isBuffering: false, ended: false };
}

export function upsertTrack(
  queue: QueueTrack[],
  track: QueueTrack,
): { queue: QueueTrack[]; activeIndex: number; added: boolean } {
  const existingIndex = queue.findIndex((item) => item.id === track.id);
  if (existingIndex >= 0) {
    return { queue, activeIndex: existingIndex, added: false };
  }

  const nextQueue = [...queue, track];
  return { queue: nextQueue, activeIndex: nextQueue.length - 1, added: true };
}

export function getNextQueueIndex(
  currentIndex: number,
  queueLength: number,
  repeatMode: RepeatMode,
): number | null {
  if (queueLength <= 0 || currentIndex < 0 || currentIndex >= queueLength) return null;
  if (repeatMode === "track") return currentIndex;
  if (currentIndex + 1 < queueLength) return currentIndex + 1;
  if (repeatMode === "queue") return 0;
  return null;
}

export function shouldLoadVideoById(
  loadedVideoId: string | null,
  requestedVideoId: string | null,
  force = false,
): boolean {
  if (!requestedVideoId) return false;
  if (force) return true;
  return loadedVideoId !== requestedVideoId;
}

export function percentToDurationSeconds(percent: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const normalizedPercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (normalizedPercent / 100) * duration;
}
