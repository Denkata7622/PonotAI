'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { useProfile } from "@/lib/ProfileContext";
import { sendAssistantMessage } from "./api";
import { createAssistantConversation, deriveAssistantConversationTitle, loadAssistantStore, persistAssistantStore } from "./storage";
import type { AssistantConversation, ChatMessage } from "./types";

function createMessage(message: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
  const messageId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    ...message,
    id: messageId,
    createdAt: new Date().toISOString(),
  };
}

function updateConversation(conversation: AssistantConversation, updater: (messages: ChatMessage[]) => ChatMessage[]): AssistantConversation {
  const nextMessages = updater(conversation.messages);
  return {
    ...conversation,
    messages: nextMessages,
    title: conversation.customTitle?.trim() || deriveAssistantConversationTitle(nextMessages),
    updatedAt: new Date().toISOString(),
  };
}

export function useMusicAssistant() {
  const { profile } = useProfile();
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const inFlightRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0] ?? null,
    [activeConversationId, conversations],
  );
  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    const store = loadAssistantStore(profile.id);
    setConversations(store.conversations);
    setActiveConversationId(store.activeConversationId);
    setMounted(true);
  }, [profile.id]);

  useEffect(() => {
    if (!mounted || conversations.length === 0) return;
    persistAssistantStore(profile.id, { conversations, activeConversationId: activeConversation?.id ?? conversations[0]?.id ?? null });
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [conversations, activeConversation, mounted, profile.id, isLoading]);

  function replaceConversation(nextConversation: AssistantConversation) {
    setConversations((previous) => {
      const withoutActive = previous.filter((conversation) => conversation.id !== nextConversation.id);
      return [nextConversation, ...withoutActive];
    });
  }

  function appendSystemMessage(content: string) {
    if (!activeConversation) return;
    replaceConversation(updateConversation(activeConversation, (prev) => [...prev, createMessage({ role: "system", content })]));
  }

  async function sendMessage(text: string): Promise<void> {
    if (!activeConversation || inFlightRef.current || isLoading) return;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 2000) {
      setError("Message must be between 1 and 2000 characters.");
      return;
    }

    const userMessage = createMessage({ role: "user", content: trimmed });
    const nextMessages = [...activeConversation.messages, userMessage];
    replaceConversation(updateConversation(activeConversation, () => nextMessages));
    inFlightRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendAssistantMessage(nextMessages, trimmed);
      const assistantMessage = createMessage({
        role: "assistant",
        content: response.reply,
        actionIntent: response.actionIntent,
        actionState: response.actionIntent ? "pending" : undefined,
      });

      replaceConversation(updateConversation({ ...activeConversation, messages: nextMessages }, (previous) => [...previous, assistantMessage]));
    } catch (caught) {
      const err = caught as { data?: { message?: string }; response?: { data?: { message?: string } }; message?: string };
      const apiMessage = err?.data?.message
        ?? err?.response?.data?.message
        ?? err?.message
        ?? "AI Assistant is temporarily unavailable. Please try again.";
      appendSystemMessage(apiMessage);
      setError(apiMessage);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }

  function startNewConversation(): AssistantConversation {
    const conversation = createAssistantConversation();
    setConversations((previous) => [conversation, ...previous]);
    setActiveConversationId(conversation.id);
    setError(null);
    return conversation;
  }

  function resetConversation(): void {
    if (!activeConversation) return;
    replaceConversation({ ...activeConversation, messages: [], updatedAt: new Date().toISOString(), title: "New conversation", customTitle: undefined });
  }

  function openConversation(conversationId: string): void {
    setActiveConversationId(conversationId);
    setError(null);
  }

  function renameConversation(conversationId: string, title: string): void {
    const trimmed = title.trim();
    setConversations((previous) => previous.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      return {
        ...conversation,
        customTitle: trimmed.length > 0 ? trimmed : undefined,
        title: trimmed.length > 0 ? trimmed : deriveAssistantConversationTitle(conversation.messages),
        updatedAt: new Date().toISOString(),
      };
    }));
  }

  function deleteConversation(conversationId: string): void {
    setConversations((previous) => {
      const filtered = previous.filter((conversation) => conversation.id !== conversationId);
      if (filtered.length > 0) {
        if (activeConversationId === conversationId) {
          setActiveConversationId(filtered[0].id);
        }
        return filtered;
      }

      const created = createAssistantConversation();
      setActiveConversationId(created.id);
      return [created];
    });
  }

  function setActionState(messageId: string, actionState: ChatMessage["actionState"]) {
    if (!activeConversation) return;
    replaceConversation(updateConversation(activeConversation, (previous) => previous.map((message) => (
      message.id === messageId ? { ...message, actionState } : message
    ))));
  }

  function acceptAction(messageId: string): void {
    setActionState(messageId, "accepted");
  }

  function dismissAction(messageId: string): void {
    setActionState(messageId, "dismissed");
  }

  function failAction(messageId: string): void {
    setActionState(messageId, "failed");
  }

  return {
    messages,
    conversations,
    activeConversationId: activeConversation?.id ?? null,
    isLoading,
    error,
    sendMessage,
    resetConversation,
    startNewConversation,
    openConversation,
    renameConversation,
    deleteConversation,
    acceptAction,
    dismissAction,
    failAction,
    bottomRef,
  };
}
