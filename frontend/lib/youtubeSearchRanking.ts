import { normalizeVisibleText } from "@/lib/text";

export type RankedSearchKind = "song" | "channel" | "other";

export type RankedSearchInput = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSec?: number;
};

export type RankedSearchResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationSec?: number;
  rankScore: number;
  kind: RankedSearchKind;
  isTopicChannel: boolean;
};

const COMPILATION_MARKERS = [
  "full album",
  "complete album",
  "album full",
  "all songs",
  "greatest hits",
  "best of",
  "playlist",
  "mix",
  "compilation",
  "mega mix",
  "non stop",
  "1 hour",
  "2 hour",
  "3 hour",
  "hour mix",
  "20 min",
  "30 min",
  "45 min",
];

const SONG_QUALIFIERS = ["official audio", "official music video", "official video", "audio", "lyrics", "lyric video"];
const ALT_VERSION_MARKERS = ["live", "remix", "cover", "sped up", "slowed", "nightcore", "karaoke", "instrumental"];
const SINGLE_SONG_INTENT_MARKERS = ["song", "lyrics", "audio", "official", "video"];

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function overlapRatio(tokens: string[], pool: Set<string>): number {
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const token of tokens) {
    if (pool.has(token)) hits += 1;
  }
  return hits / tokens.length;
}

function includesAny(haystack: string, terms: string[]): boolean {
  return terms.some((term) => haystack.includes(term));
}

export function parseIsoDurationToSec(isoDuration: string | undefined): number | undefined {
  if (!isoDuration) return undefined;
  const match = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return undefined;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return (hours * 3600) + (minutes * 60) + seconds;
}

export function rankYouTubeSearchResults(query: string, inputs: RankedSearchInput[]): RankedSearchResult[] {
  const normalizedQuery = normalizeVisibleText(query).toLowerCase();
  const queryTokens = tokenize(normalizedQuery);
  const queryTokenSet = new Set(queryTokens);
  const queryLooksLikeSingleSongIntent =
    queryTokens.length <= 5 &&
    !includesAny(normalizedQuery, COMPILATION_MARKERS) &&
    (queryTokens.length <= 2 || includesAny(normalizedQuery, SINGLE_SONG_INTENT_MARKERS) || queryTokens.length >= 2);

  return inputs
    .map((item) => {
      const title = normalizeVisibleText(item.title);
      const artist = normalizeVisibleText(item.channelTitle);
      const normalizedTitle = title.toLowerCase();
      const normalizedArtist = artist.toLowerCase();
      const titleTokens = tokenize(normalizedTitle);
      const artistTokens = tokenize(normalizedArtist);
      const titleTokenSet = new Set(titleTokens);
      const artistTokenSet = new Set(artistTokens);

      const titleOverlap = overlapRatio(queryTokens, titleTokenSet);
      const artistOverlap = overlapRatio(queryTokens, artistTokenSet);

      let score = 0;
      score += titleOverlap * 3.2;
      score += artistOverlap * 1.5;

      if (normalizedTitle.includes(normalizedQuery)) score += 1.5;
      if (normalizedArtist.includes(normalizedQuery)) score += 0.8;

      const isTopicChannel = normalizedArtist.endsWith("- topic");
      if (isTopicChannel) score += 0.65;
      if (includesAny(normalizedTitle, SONG_QUALIFIERS)) score += 0.25;

      const hasCompilationSignals = includesAny(normalizedTitle, COMPILATION_MARKERS);
      const hasAltVersionSignals = includesAny(normalizedTitle, ALT_VERSION_MARKERS);
      const queryAllowsAltVersions = includesAny(normalizedQuery, ALT_VERSION_MARKERS);

      if (hasCompilationSignals) score -= queryLooksLikeSingleSongIntent ? 2.3 : 0.8;
      if (hasAltVersionSignals && !queryAllowsAltVersions) score -= 0.5;

      const durationSec = item.durationSec;
      if (durationSec !== undefined) {
        const queryAsksForLongForm = /\b(full|album|mix|playlist|hour|min)\b/i.test(normalizedQuery);
        if (!queryAsksForLongForm && queryLooksLikeSingleSongIntent) {
          if (durationSec > 1200) score -= 2.2;
          else if (durationSec > 720) score -= 1.2;
          else if (durationSec > 540) score -= 0.65;
          else if (durationSec >= 110 && durationSec <= 390) score += 0.45;
          else if (durationSec < 45) score -= 0.4;
        }
      }

      if (queryTokenSet.size > 0) {
        const missingTokens = queryTokens.filter((token) => !titleTokenSet.has(token) && !artistTokenSet.has(token)).length;
        score -= missingTokens * 0.25;
      }

      const kind: RankedSearchKind = hasCompilationSignals || (durationSec !== undefined && durationSec > 900)
        ? "other"
        : (isTopicChannel ? "channel" : "song");

      return {
        videoId: item.videoId,
        title,
        artist,
        thumbnailUrl: item.thumbnailUrl,
        durationSec,
        rankScore: Number(score.toFixed(4)),
        kind,
        isTopicChannel,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}
