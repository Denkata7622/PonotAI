type ExternalTrackSample = {
  title: string;
  artist: string;
  album?: string;
  previewUrl?: string;
};

export type ExternalArtistCandidate = {
  artist: string;
  source: "deezer" | "itunes" | "genre_seed";
  similarityScore: number;
  anchorArtist?: string;
  sampleTracks: ExternalTrackSample[];
};

export type ExternalDiscoveryClient = {
  findSimilarArtistsByArtist: (artist: string) => Promise<ExternalArtistCandidate[]>;
  findArtistsByGenre: (genre: string) => Promise<ExternalArtistCandidate[]>;
};

const cache = new Map<string, { expiresAt: number; value: ExternalArtistCandidate[] }>();
const TEN_MINUTES_MS = 10 * 60 * 1000;

async function safeFetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTrackSamples(artist: string): Promise<ExternalTrackSample[]> {
  const query = encodeURIComponent(artist);
  const url = `https://itunes.apple.com/search?term=${query}&entity=song&limit=5`;
  const data = await safeFetchJson<{ results?: Array<{ trackName?: string; artistName?: string; collectionName?: string; previewUrl?: string }> }>(url);
  if (!data?.results?.length) return [];
  return data.results
    .filter((item) => item.trackName && item.artistName)
    .slice(0, 3)
    .map((item) => ({
      title: String(item.trackName),
      artist: String(item.artistName),
      album: item.collectionName,
      previewUrl: item.previewUrl,
    }));
}

async function findSimilarArtistsByArtist(artist: string): Promise<ExternalArtistCandidate[]> {
  const key = `artist:${artist.toLowerCase().trim()}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const searchUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=1`;
  const search = await safeFetchJson<{ data?: Array<{ id: number; name: string }> }>(searchUrl);
  const artistId = search?.data?.[0]?.id;
  if (!artistId) return [];

  const relatedUrl = `https://api.deezer.com/artist/${artistId}/related?limit=8`;
  const related = await safeFetchJson<{ data?: Array<{ name: string; nb_fan?: number }> }>(relatedUrl);
  if (!related?.data?.length) return [];

  const top = related.data.slice(0, 6);
  const enriched = await Promise.all(top.map(async (item, idx) => ({
    artist: item.name,
    source: "deezer" as const,
    similarityScore: Math.max(0.45, 0.9 - idx * 0.08),
    anchorArtist: artist,
    sampleTracks: await fetchTrackSamples(item.name),
  })));

  cache.set(key, { value: enriched, expiresAt: now + TEN_MINUTES_MS });
  return enriched;
}

async function findArtistsByGenre(genre: string): Promise<ExternalArtistCandidate[]> {
  const key = `genre:${genre.toLowerCase().trim()}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(genre)}&entity=song&limit=20`;
  const data = await safeFetchJson<{ results?: Array<{ artistName?: string; trackName?: string; collectionName?: string; previewUrl?: string }> }>(url);
  const grouped = new Map<string, ExternalTrackSample[]>();
  for (const item of data?.results ?? []) {
    if (!item.artistName || !item.trackName) continue;
    const bucket = grouped.get(item.artistName) ?? [];
    if (bucket.length < 2) {
      bucket.push({
        title: item.trackName,
        artist: item.artistName,
        album: item.collectionName,
        previewUrl: item.previewUrl,
      });
    }
    grouped.set(item.artistName, bucket);
  }

  const results = [...grouped.entries()].slice(0, 8).map(([artist, sampleTracks], idx) => ({
    artist,
    source: "genre_seed" as const,
    similarityScore: Math.max(0.35, 0.72 - idx * 0.06),
    sampleTracks,
  }));

  cache.set(key, { value: results, expiresAt: now + TEN_MINUTES_MS });
  return results;
}

let client: ExternalDiscoveryClient = {
  findSimilarArtistsByArtist,
  findArtistsByGenre,
};

export function getExternalDiscoveryClient(): ExternalDiscoveryClient {
  return client;
}

export function __setExternalDiscoveryClientForTests(next: ExternalDiscoveryClient | null): void {
  client = next ?? { findSimilarArtistsByArtist, findArtistsByGenre };
}
