export type AssistantActionType =
  | "ADD_TO_QUEUE"
  | "CREATE_PLAYLIST"
  | "FAVORITE_TRACK"
  | "SEARCH_AND_SUGGEST"
  | "CHANGE_THEME"
  | "CHANGE_LANGUAGE"
  | "INSIGHT_REQUEST"
  | "PLAYLIST_GENERATION"
  | "MOOD_RECOMMENDATION"
  | "CONTEXT_RECOMMENDATION"
  | "TAG_SUGGESTION"
  | "DISCOVERY_REQUEST"
  | "CROSS_ARTIST_DISCOVERY"
  | "SHOW_SIMILAR_ARTISTS"
  | "SEARCH_ARTIST"
  | "PREVIEW_DISCOVERY_PLAYLIST"
  | "CREATE_DISCOVERY_PLAYLIST";

export interface ActionIntent {
  type: AssistantActionType;
  confidence: number;
  payload: Record<string, unknown>;
  requiresConfirmation: true;
  reason?: string;
}

export interface LibraryTrack {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  playCount: number;
  isFavorite: boolean;
  lastPlayedAt?: string;
}

export interface LibraryHistoryEntry {
  trackId: string;
  title: string;
  artist: string;
  createdAt: string;
}

export interface LibraryPlaylistSummary {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  tracks?: Array<{ trackId: string; title: string; artist: string }>;
}

export interface LibraryStatItem {
  name: string;
  count: number;
}

export interface LibraryContextPayload {
  profile: {
    totalTracks: number;
    firstRecognitionDate?: string;
    lastRecognitionDate?: string;
  };
  topTracks: LibraryTrack[];
  recentHistory: LibraryHistoryEntry[];
  playlists: LibraryPlaylistSummary[];
  currentTheme?: "light" | "dark" | "system";
  currentLanguage?: "en" | "bg";
  currentQueue?: string[];
  context?: {
    deviceType?: string;
    dayOfWeek?: string;
    hourUtc?: number;
  };
  stats?: {
    topGenres: LibraryStatItem[];
    topArtists: LibraryStatItem[];
  };
  statedPreferences?: {
    genres: string[];
    artists: string[];
    moods: string[];
    goals: string[];
    source: "onboarding";
  };
}

export interface GeminiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GeminiHistoryMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface GeminiResponse {
  text: string;
  model: string;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  latencyMs: number;
}

export class GeminiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
  }
}
