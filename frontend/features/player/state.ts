export type QueueTrack = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  artworkUrl: string;
  videoId?: string;
  query: string;
  license: "COPYRIGHTED" | "CREATIVE_COMMONS" | "UNKNOWN";
};

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
