import { apiFetch } from "@/src/lib/apiFetch";

export type DiscoverSearchResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationSec?: number;
  rankScore?: number;
  kind?: "song" | "channel" | "other";
  isTopicChannel?: boolean;
};

export type PersonalizedSearchResult = {
  id: string;
  type: "history" | "favorite" | "playlist";
  title: string;
  artist: string;
  score: number;
};

export type UnifiedSearchResponse = {
  discover: DiscoverSearchResult[];
  personalized: PersonalizedSearchResult[];
  isUnavailable: boolean;
};

type SearchRequestOptions = {
  signal?: AbortSignal;
};

export async function runDiscoverSearch(query: string, options: SearchRequestOptions = {}): Promise<{
  items: DiscoverSearchResult[];
  unavailable: boolean;
}> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { items: [], unavailable: false };
  }

  const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: options.signal });
  if (response.status === 503) return { items: [] as DiscoverSearchResult[], unavailable: true };
  if (!response.ok) return { items: [] as DiscoverSearchResult[], unavailable: false };
  const payload = (await response.json()) as DiscoverSearchResult[];
  return { items: Array.isArray(payload) ? payload : [], unavailable: false };
}

export async function runPersonalizedSearch(
  query: string,
  token?: string | null,
  options: SearchRequestOptions = {},
): Promise<PersonalizedSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || !token) {
    return [];
  }

  return apiFetch(`/api/search/fuzzy?q=${encodeURIComponent(trimmed)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: options.signal,
  })
    .then(async (response) => {
      if (!response.ok) return [] as PersonalizedSearchResult[];
      const payload = (await response.json()) as { items?: PersonalizedSearchResult[] };
      return Array.isArray(payload.items) ? payload.items : [];
    })
    .catch(() => [] as PersonalizedSearchResult[]);
}

export async function runUnifiedSearch(
  query: string,
  token?: string | null,
  options: SearchRequestOptions = {},
): Promise<UnifiedSearchResponse> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { discover: [], personalized: [], isUnavailable: false };
  }

  const discoverPromise = runDiscoverSearch(trimmed, options);

  const personalizedPromise = runPersonalizedSearch(trimmed, token, options);

  const [discover, personalized] = await Promise.all([discoverPromise, personalizedPromise]);
  return {
    discover: discover.items,
    personalized,
    isUnavailable: discover.unavailable,
  };
}
