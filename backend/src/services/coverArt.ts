export interface CoverArtResult {
  url: string;
  source: "itunes";
  width: number;
  height: number;
}

function toHighResArtwork(url: string): string {
  return url
    .replace("100x100bb", "600x600bb")
    .replace("60x60bb", "600x600bb");
}

export async function searchCoverArt(title: string, artist: string, limit = 4): Promise<CoverArtResult[]> {
  const query = encodeURIComponent(`${artist} ${title}`);
  const url = `https://itunes.apple.com/search?term=${query}&media=music&limit=20&entity=song`;

  const response = await fetch(url, {
    headers: { "User-Agent": "PonotAI/1.0" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return [];

  const data = (await response.json()) as { results?: Array<{ artworkUrl100?: string; artworkUrl60?: string }> };
  const results: CoverArtResult[] = [];
  const seen = new Set<string>();
  for (const item of data.results ?? []) {
    const rawUrl = item.artworkUrl100 ?? item.artworkUrl60 ?? "";
    if (!rawUrl) continue;
    const highRes = toHighResArtwork(rawUrl);
    if (seen.has(highRes)) continue;
    seen.add(highRes);
    results.push({ url: highRes, source: "itunes", width: 600, height: 600 });
    if (results.length >= limit) break;
  }
  return results;
}

export async function searchMoreCoverArt(
  title: string,
  artist: string,
  excludeUrls: string[],
  limit = 4,
): Promise<CoverArtResult[]> {
  const queries = [`${artist} ${title} album`, artist];
  const excludeSet = new Set(excludeUrls);
  const allResults: CoverArtResult[] = [];

  for (const query of queries) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=25&entity=album`;
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "PonotAI/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as { results?: Array<{ artworkUrl100?: string }> };
      for (const item of data.results ?? []) {
        const rawUrl = item.artworkUrl100 ?? "";
        if (!rawUrl) continue;
        const highRes = toHighResArtwork(rawUrl);
        if (excludeSet.has(highRes)) continue;
        excludeSet.add(highRes);
        allResults.push({ url: highRes, source: "itunes", width: 600, height: 600 });
        if (allResults.length >= limit) return allResults;
      }
    } catch {
      continue;
    }
  }

  return allResults.slice(0, limit);
}
