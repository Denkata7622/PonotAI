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
