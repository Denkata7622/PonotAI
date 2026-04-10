'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Send, Sparkles } from "lucide-react";
import { useUser } from "@/src/context/UserContext";
import { useMusicAssistant } from "../useMusicAssistant";
import MessageBubble from "./MessageBubble";
import StarterPrompts from "./StarterPrompts";
import TypingIndicator from "./TypingIndicator";

export default function MusicAssistantPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useUser();
  const { messages, isLoading, sendMessage, resetConversation, acceptAction, dismissAction, bottomRef } = useMusicAssistant();
  const [input, setInput] = useState("");
  const [mounted, setMounted] = useState(false);
  const [showInitialSkeleton, setShowInitialSkeleton] = useState(true);

  useEffect(() => {
    setMounted(true);
    const timer = window.setTimeout(() => setShowInitialSkeleton(false), 500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/auth");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const handler = () => {
      const keyboardHeight = Math.max(0, window.innerHeight - viewport.height);
      document.documentElement.style.setProperty("--keyboard-height", `${Math.round(keyboardHeight)}px`);
    };
    handler();
    viewport.addEventListener("resize", handler);
    return () => viewport.removeEventListener("resize", handler);
  }, []);

  if (!mounted || showInitialSkeleton) {
    return (
      <section className="assistant-page grid place-items-center">
        <div className="flex items-center gap-2 text-[var(--muted)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          Loading assistant...
        </div>
      </section>
    );
  }

  async function submitMessage() {
    if (!input.trim() || isLoading) return;
    const value = input;
    setInput("");
    await sendMessage(value);
  }

  function handleNewConversation() {
    if (messages.length > 3 && !window.confirm("Start a new conversation?")) {
      return;
    }
    resetConversation();
  }

  return (
    <section
      className="assistant-page"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        maxHeight: "100vh",
        paddingBottom: "var(--player-bar-height, 80px)",
        boxSizing: "border-box",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <header className="assistant-header" style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "16px 20px" }}>
        <h1><Sparkles width={20} height={20} strokeWidth={1.8} /> PonotAI Assistant</h1>
        <button type="button" onClick={handleNewConversation}><RotateCcw width={15} height={15} strokeWidth={1.8} /> New conversation</button>
      </header>

      <div
        className="assistant-thread"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          paddingBottom: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          minHeight: 0,
        }}
      >
        {messages.length === 0 ? (
          <div className="assistant-empty"><StarterPrompts onSelect={(prompt) => void sendMessage(prompt)} /></div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onAccept={() => acceptAction(message.id)}
              onDismiss={() => dismissAction(message.id)}
            />
          ))
        )}
        {isLoading ? <TypingIndicator /> : null}
        <div ref={bottomRef} />
      </div>

      <footer
        className="assistant-input-wrap"
        style={{
          flexShrink: 0,
          padding: "12px 20px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid var(--border)",
          background: "var(--bg)",
          marginBottom: "var(--keyboard-height, 0px)",
        }}
      >
        <textarea
          value={input}
          placeholder="Ask about your music..."
          onChange={(event) => setInput(event.target.value)}
          rows={1}
          maxLength={2000}
          disabled={isLoading}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submitMessage();
            }
          }}
        />
        <button type="button" onClick={() => void submitMessage()} disabled={!input.trim() || isLoading}><Send width={18} height={18} strokeWidth={1.8} /></button>
      </footer>
      {input.length > 1800 ? <p className="assistant-counter">{input.length}/2000</p> : null}
    </section>
  );
}
