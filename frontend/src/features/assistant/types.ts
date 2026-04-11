'use client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  actionIntent?: ActionIntent | null;
  actionState?: 'pending' | 'accepted' | 'dismissed' | 'failed';
}

export interface ActionIntent {
  type:
    | 'ADD_TO_QUEUE'
    | 'CREATE_PLAYLIST'
    | 'FAVORITE_TRACK'
    | 'SEARCH_AND_SUGGEST'
    | 'CHANGE_THEME'
    | 'CHANGE_LANGUAGE'
    | 'INSIGHT_REQUEST'
    | 'PLAYLIST_GENERATION'
    | 'MOOD_RECOMMENDATION'
    | 'CONTEXT_RECOMMENDATION'
    | 'TAG_SUGGESTION'
    | 'DISCOVERY_REQUEST';
  confidence: number;
  payload: Record<string, unknown>;
  requiresConfirmation: boolean;
  reason?: string;
}

export interface AssistantMeta {
  model: string;
  latencyMs: number;
  contextTracksCount: number;
}

export class AssistantApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
