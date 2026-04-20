import type { SongMatch } from "./api";

type CoverArtApiResponse = { covers?: Array<{ url?: string }> };

function normalizeLookupValue(value: string): string {
  return value
    .replace(/[“”„‟"']/g, " ")
    .replace(/[()\[\]{}]+/g, " ")
    .replace(/[–—-]+/g, " ")
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLookupVariants(value: string): string[] {
  const raw = value.trim();
  if (!raw) return [];
  const normalized = normalizeLookupValue(raw);
  if (!normalized || normalized.toLowerCase() === raw.toLowerCase()) return [raw];
  return [raw, normalized];
}

export async function lookupCoverArtUrls(
  apiBaseUrl: string,
  title: string,
  artist: string,
  options?: { exclude?: string[]; limit?: number },
): Promise<string[]> {
  const exclude = (options?.exclude ?? []).filter(Boolean);
  const limit = Math.max(1, options?.limit ?? 4);
  const titleVariants = buildLookupVariants(title);
  const artistVariants = buildLookupVariants(artist);

  if (titleVariants.length === 0 || artistVariants.length === 0) return [];

  const seen = new Set<string>();
  const results: string[] = [];

  for (const titleCandidate of titleVariants) {
    for (const artistCandidate of artistVariants) {
      const params = new URLSearchParams({
        title: titleCandidate,
        artist: artistCandidate,
      });
      if (exclude.length > 0) params.set("exclude", exclude.join(","));

      try {
        const response = await fetch(`${apiBaseUrl}/api/cover-art?${params.toString()}`);
        if (!response.ok) continue;
        const payload = (await response.json()) as CoverArtApiResponse;
        for (const item of payload.covers ?? []) {
          const url = item.url?.trim();
          if (!url || seen.has(url)) continue;
          seen.add(url);
          results.push(url);
          if (results.length >= limit) return results;
        }
      } catch {
        // ignore and continue lookup fallbacks
      }
    }
  }

  return results;
}

export async function enrichSongCoverArt(apiBaseUrl: string, song: SongMatch): Promise<SongMatch> {
  const fetched = await lookupCoverArtUrls(apiBaseUrl, song.songName, song.artist, {
    exclude: song.albumArtUrl ? [song.albumArtUrl] : [],
    limit: 1,
  });

  if (fetched.length === 0) return song;
  return {
    ...song,
    albumArtUrl: fetched[0]!,
  };
}
