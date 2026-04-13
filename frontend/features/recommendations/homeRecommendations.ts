import type { Track } from "../tracks/types";
import type { StoredFavorite } from "../library/types";
import type { TasteProfile } from "../../src/features/onboarding/tasteProfile";

type HistoryEntry = {
  song: {
    songName: string;
    artist: string;
    albumArtUrl?: string;
    youtubeVideoId?: string;
  };
};

type CuratedTrack = Track & {
  genres: string[];
  moods: string[];
  popularity: number;
};

const CURATED_POOL: CuratedTrack[] = [
  { id: "curated-midnight-city", title: "Midnight City", artistName: "M83", artistId: "artist-m83", artworkUrl: "https://picsum.photos/seed/midnight-city/80", youtubeVideoId: "dX3k_QDnzHE", license: "COPYRIGHTED", genres: ["electronic", "indie"], moods: ["night", "focus"], popularity: 92 },
  { id: "curated-get-lucky", title: "Get Lucky", artistName: "Daft Punk", artistId: "artist-daft-punk", artworkUrl: "https://picsum.photos/seed/get-lucky/80", youtubeVideoId: "5NV6Rdv1a3I", license: "COPYRIGHTED", genres: ["funk", "electronic", "pop"], moods: ["party", "happy"], popularity: 95 },
  { id: "curated-bad-guy", title: "bad guy", artistName: "Billie Eilish", artistId: "artist-billie-eilish", artworkUrl: "https://picsum.photos/seed/bad-guy/80", youtubeVideoId: "DyDfgMOUjCI", license: "COPYRIGHTED", genres: ["pop", "alt"], moods: ["bold", "energetic"], popularity: 94 },
  { id: "curated-heat-waves", title: "Heat Waves", artistName: "Glass Animals", artistId: "artist-glass-animals", artworkUrl: "https://picsum.photos/seed/heat-waves/80", youtubeVideoId: "mRD0-GxqHVo", license: "COPYRIGHTED", genres: ["indie", "pop"], moods: ["chill", "night"], popularity: 91 },
  { id: "curated-blinding-lights", title: "Blinding Lights", artistName: "The Weeknd", artistId: "artist-the-weeknd", artworkUrl: "https://picsum.photos/seed/blinding-lights-home/80", youtubeVideoId: "4NRXx6U8ABQ", license: "COPYRIGHTED", genres: ["pop", "synthwave"], moods: ["night", "energetic"], popularity: 97 },
  { id: "curated-adore-you", title: "Adore You", artistName: "Harry Styles", artistId: "artist-harry-styles", artworkUrl: "https://picsum.photos/seed/adore-you/80", youtubeVideoId: "VF-r5TtlT9w", license: "COPYRIGHTED", genres: ["pop"], moods: ["feel-good", "chill"], popularity: 90 },
  { id: "curated-lost-in-japan", title: "Lost in Japan", artistName: "Shawn Mendes", artistId: "artist-shawn-mendes", artworkUrl: "https://picsum.photos/seed/lost-in-japan/80", youtubeVideoId: "ycy30LIbq4w", license: "COPYRIGHTED", genres: ["pop", "funk"], moods: ["sunny", "easy"], popularity: 85 },
  { id: "curated-summertime-sadness", title: "Summertime Sadness", artistName: "Lana Del Rey", artistId: "artist-lana-del-rey", artworkUrl: "https://picsum.photos/seed/summertime/80", youtubeVideoId: "TdrL3QxjyVw", license: "COPYRIGHTED", genres: ["alt", "pop"], moods: ["melancholy", "dreamy"], popularity: 88 },
  { id: "curated-midnight-sky", title: "Midnight Sky", artistName: "Miley Cyrus", artistId: "artist-miley-cyrus", artworkUrl: "https://picsum.photos/seed/midnight-sky/80", youtubeVideoId: "aS1no1myeTM", license: "COPYRIGHTED", genres: ["pop", "rock"], moods: ["confident", "energetic"], popularity: 87 },
  { id: "curated-sunflower", title: "Sunflower", artistName: "Post Malone", artistId: "artist-post-malone", artworkUrl: "https://picsum.photos/seed/sunflower/80", youtubeVideoId: "ApXoWvfEYVU", license: "COPYRIGHTED", genres: ["hip-hop", "pop"], moods: ["chill", "happy"], popularity: 93 },
];

export type RecommendationMode = "starter" | "taste" | "history";

export type HomeRecommendations = {
  mode: RecommendationMode;
  title: string;
  description: string;
  tracks: Track[];
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function stableShuffle<T>(items: T[], seed: string): T[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    hash = (hash * 1664525 + 1013904223) | 0;
    const index = Math.abs(hash) % (i + 1);
    [next[i], next[index]] = [next[index]!, next[i]!];
  }
  return next;
}

function scoreTrack(track: CuratedTrack, tokens: Set<string>): number {
  const genreHits = track.genres.reduce((sum, genre) => sum + (tokens.has(normalize(genre)) ? 1 : 0), 0);
  const moodHits = track.moods.reduce((sum, mood) => sum + (tokens.has(normalize(mood)) ? 1 : 0), 0);
  const artistHit = tokens.has(normalize(track.artistName)) ? 2 : 0;
  return genreHits * 3 + moodHits * 2 + artistHit + track.popularity / 100;
}

export function getHomeRecommendations({
  language,
  userId,
  history,
  favorites,
  tasteProfile,
  limit = 6,
}: {
  language: "en" | "bg";
  userId: string;
  history: HistoryEntry[];
  favorites: StoredFavorite[];
  tasteProfile: TasteProfile | null;
  limit?: number;
}): HomeRecommendations {
  const historyArtists = history.map((entry) => normalize(entry.song.artist));
  const favoriteArtists = favorites.map((entry) => normalize(entry.artist));
  const hasHistorySignal = history.length >= 3 || favorites.length >= 3;

  if (hasHistorySignal) {
    const tokens = new Set<string>([...historyArtists, ...favoriteArtists]);
    const ranked = [...CURATED_POOL]
      .map((track) => ({ track, score: scoreTrack(track, tokens) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.track)
      .slice(0, limit);
    return {
      mode: "history",
      title: language === "bg" ? "Препоръчано за теб" : "Recommended for you",
      description: language === "bg" ? "Избрано от твоите любими изпълнители и последни разпознавания." : "Picked from your favorites and recent recognitions.",
      tracks: ranked,
    };
  }

  if (tasteProfile && !tasteProfile.skipped) {
    const tokens = new Set<string>([
      ...tasteProfile.artists.map(normalize),
      ...tasteProfile.genres.map(normalize),
      ...tasteProfile.moods.map(normalize),
      ...tasteProfile.goals.map(normalize),
    ]);
    const ranked = [...CURATED_POOL]
      .map((track) => ({ track, score: scoreTrack(track, tokens) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.track)
      .slice(0, limit);

    return {
      mode: "taste",
      title: language === "bg" ? "Според вкуса ти" : "Based on your taste",
      description: language === "bg" ? "Стартови препоръки по жанровете и настроенията от onboarding-а." : "Starter recommendations from your onboarding taste profile.",
      tracks: ranked,
    };
  }

  const starter = stableShuffle(CURATED_POOL, `${userId}-${new Date().toISOString().slice(0, 10)}`).slice(0, limit);
  return {
    mode: "starter",
    title: language === "bg" ? "Започни оттук" : "Start here",
    description: language === "bg" ? "Подбрани популярни песни за ново начало в Trackly." : "Curated popular tracks to kick off your Trackly library.",
    tracks: starter,
  };
}
