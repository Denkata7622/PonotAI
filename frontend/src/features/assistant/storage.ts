'use client';

import { scopedKey } from "@/lib/ProfileContext";
import type { AssistantConversation, ChatMessage } from "./types";

const STORAGE_KEY = "ponotai.assistant.conversations.v2";
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES_PER_CONVERSATION = 120;

type AssistantStore = {
  activeConversationId: string | null;
  conversations: AssistantConversation[];
};

function createConversationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `assistant-conversation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
}

function autoTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstUserMessage) return "New conversation";
  return firstUserMessage.length > 58 ? `${firstUserMessage.slice(0, 55)}…` : firstUserMessage;
}

function validateConversation(candidate: unknown): AssistantConversation | null {
  if (!candidate || typeof candidate !== "object") return null;
  const parsed = candidate as Partial<AssistantConversation>;
  if (typeof parsed.id !== "string") return null;
  const messages = Array.isArray(parsed.messages) ? parsed.messages.filter((message): message is ChatMessage => Boolean(message && typeof message === "object" && typeof (message as ChatMessage).id === "string" && typeof (message as ChatMessage).content === "string" && typeof (message as ChatMessage).role === "string")) : [];
  const createdAt = typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString();
  const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : createdAt;
  return {
    id: parsed.id,
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : autoTitle(messages),
    customTitle: typeof parsed.customTitle === "string" ? parsed.customTitle : undefined,
    createdAt,
    updatedAt,
    messages: trimMessages(messages),
  };
}

function emptyConversation(): AssistantConversation {
  const now = new Date().toISOString();
  return {
    id: createConversationId(),
    title: "New conversation",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function storageKey(profileId: string): string {
  return scopedKey(STORAGE_KEY, profileId);
}

export function loadAssistantStore(profileId: string): AssistantStore {
  if (typeof window === "undefined") {
    const conversation = emptyConversation();
    return { activeConversationId: conversation.id, conversations: [conversation] };
  }

  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
    if (!raw) {
      const conversation = emptyConversation();
      return { activeConversationId: conversation.id, conversations: [conversation] };
    }
    const parsed = JSON.parse(raw) as Partial<AssistantStore>;
    const conversations = Array.isArray(parsed.conversations)
      ? parsed.conversations.map(validateConversation).filter((item): item is AssistantConversation => Boolean(item)).slice(0, MAX_CONVERSATIONS)
      : [];

    if (conversations.length === 0) {
      const conversation = emptyConversation();
      return { activeConversationId: conversation.id, conversations: [conversation] };
    }

    const hasActiveConversation = conversations.some((conversation) => conversation.id === parsed.activeConversationId);
    return {
      conversations,
      activeConversationId: hasActiveConversation ? parsed.activeConversationId ?? conversations[0].id : conversations[0].id,
    };
  } catch {
    const conversation = emptyConversation();
    return { activeConversationId: conversation.id, conversations: [conversation] };
  }
}

export function persistAssistantStore(profileId: string, nextStore: AssistantStore): void {
  if (typeof window === "undefined") return;
  const sanitizedConversations = nextStore.conversations
    .map((conversation) => ({
      ...conversation,
      messages: trimMessages(conversation.messages),
      title: conversation.customTitle?.trim() || autoTitle(conversation.messages),
      updatedAt: conversation.updatedAt || new Date().toISOString(),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS);
  const fallbackConversation = sanitizedConversations[0] ?? emptyConversation();
  const activeConversationId = sanitizedConversations.some((conversation) => conversation.id === nextStore.activeConversationId)
    ? nextStore.activeConversationId
    : fallbackConversation.id;

  window.localStorage.setItem(storageKey(profileId), JSON.stringify({
    activeConversationId,
    conversations: sanitizedConversations.length > 0 ? sanitizedConversations : [fallbackConversation],
  }));
}

export function createAssistantConversation(): AssistantConversation {
  return emptyConversation();
}

export function deriveAssistantConversationTitle(messages: ChatMessage[]): string {
  return autoTitle(messages);
}
