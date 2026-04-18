import { normalizeTrackKey } from "./songIdentity";

export { normalizeTrackKey };

export function dedupeByTrack<T>(
  items: T[],
  getTitle: (item: T) => string,
  getArtist: (item: T) => string,
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = normalizeTrackKey(getTitle(item), getArtist(item));
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}
