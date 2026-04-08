'use client';

import { useEffect, useRef, useState } from "react";
import { sendAssistantMessage } from "./api";
import { clearConversation, loadConversation, saveConversation } from "./storage";
import type { ChatMessage } from "./types";

function createMessage(message: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
  return {
    ...message,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

export function useMusicAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(loadConversation());
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      saveConversation(messages);
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function sendMessage(text: string): Promise<void> {
    if (isLoading) return;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 2000) {
      setError("Message must be between 1 and 2000 characters.");
      return;
    }

    const userMessage = createMessage({ role: "user", content: trimmed });
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendAssistantMessage(messages, trimmed);
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
    } catch (error) {
      const err = error as Error & { response?: { data?: { message?: string } }; message?: string };
      const errorText = err?.response?.data?.message || err?.message || "Please try again.";
      setMessages((prev) => [...prev, createMessage({ role: "system", content: errorText })]);
      setError(errorText);
    } finally {
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
