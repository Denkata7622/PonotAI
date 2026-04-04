export type AssistantActionType =
  | "ADD_TO_QUEUE"
  | "CREATE_PLAYLIST"
  | "FAVORITE_TRACK"
  | "SEARCH_AND_SUGGEST"
  | "CHANGE_THEME"
  | "CHANGE_LANGUAGE";

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
  stats?: {
    topGenres: LibraryStatItem[];
    topArtists: LibraryStatItem[];
  };
}

export interface GeminiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GeminiResponse {
  text: string;
  model: "gemini-1.5-flash";
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
