import { getApiBaseUrl } from "./apiConfig";

export type DiscoverSearchResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
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

export async function runUnifiedSearch(query: string, token?: string | null): Promise<UnifiedSearchResponse> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { discover: [], personalized: [], isUnavailable: false };
  }

  const discoverPromise = fetch(`/api/search?q=${encodeURIComponent(trimmed)}`).then(async (response) => {
    if (response.status === 503) return { items: [] as DiscoverSearchResult[], unavailable: true };
    if (!response.ok) return { items: [] as DiscoverSearchResult[], unavailable: false };
    const payload = (await response.json()) as DiscoverSearchResult[];
    return { items: Array.isArray(payload) ? payload : [], unavailable: false };
  });

  const personalizedPromise = token
    ? fetch(`${getApiBaseUrl()}/api/search/fuzzy?q=${encodeURIComponent(trimmed)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) return [] as PersonalizedSearchResult[];
        const payload = (await response.json()) as { items?: PersonalizedSearchResult[] };
        return Array.isArray(payload.items) ? payload.items : [];
      })
      .catch(() => [] as PersonalizedSearchResult[])
    : Promise.resolve([] as PersonalizedSearchResult[]);

  const [discover, personalized] = await Promise.all([discoverPromise, personalizedPromise]);
  return {
    discover: discover.items,
    personalized,
    isUnavailable: discover.unavailable,
  };
}
