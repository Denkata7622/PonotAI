'use client';

import { useEffect, useRef, useState } from "react";
import { sendAssistantMessage } from "./api";
import { clearConversation, loadConversation, saveConversation } from "./storage";
import type { ChatMessage } from "./types";

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

export function useMusicAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const inFlightRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(loadConversation());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (messages.length > 0) {
      saveConversation(messages);
    }
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages, mounted, isLoading]);

  function appendSystemMessage(content: string) {
    setMessages((prev) => [...prev, createMessage({ role: "system", content })]);
  }

  async function sendMessage(text: string): Promise<void> {
    if (inFlightRef.current || isLoading) return;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 2000) {
      setError("Message must be between 1 and 2000 characters.");
      return;
    }

    const userMessage = createMessage({ role: "user", content: trimmed });
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
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
      setMessages((prev) => {
        const updated = [...prev, assistantMessage];
        saveConversation(updated);
        return updated;
      });
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; response?: { data?: { message?: string } }; message?: string };
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

  function resetConversation(): void {
    setMessages([]);
    clearConversation();
  }

  function acceptAction(messageId: string): void {
    setMessages((prev) => prev.map((message) => (message.id === messageId ? { ...message, actionState: "accepted" } : message)));
  }

  function dismissAction(messageId: string): void {
    setMessages((prev) => prev.map((message) => (message.id === messageId ? { ...message, actionState: "dismissed" } : message)));
  }

  function failAction(messageId: string): void {
    setMessages((prev) => prev.map((message) => (message.id === messageId ? { ...message, actionState: "failed" } : message)));
  }

  return { messages, isLoading, error, sendMessage, resetConversation, acceptAction, dismissAction, failAction, bottomRef };
}
