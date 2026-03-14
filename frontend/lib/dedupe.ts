export function normalizeTrackKey(title: string, artist: string): string {
  const normalizePart = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return `${normalizePart(title)}|||${normalizePart(artist)}`;
}

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
