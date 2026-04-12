'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Send, Sparkles } from "lucide-react";
import { useUser } from "@/src/context/UserContext";
import { useMusicAssistant } from "../useMusicAssistant";
import MessageBubble from "./MessageBubble";
import StarterPrompts from "./StarterPrompts";
import TypingIndicator from "./TypingIndicator";

export default function MusicAssistantPage({ mode = "page" }: { mode?: "page" | "sidebar" }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useUser();
  const { messages, isLoading, sendMessage, resetConversation, acceptAction, dismissAction, bottomRef } = useMusicAssistant();
  const [input, setInput] = useState("");
  const [promptSeed, setPromptSeed] = useState(() => `session-${Date.now()}`);
  const [showHints, setShowHints] = useState(true);

  useEffect(() => {
    if (mode === 'page' && !authLoading && !isAuthenticated) router.replace("/auth");
  }, [authLoading, isAuthenticated, mode, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowHints(window.localStorage.getItem("ponotai-assistant-hints") !== "off");
  }, []);

  async function submitMessage() {
    if (!input.trim() || isLoading) return;
    const value = input;
    setInput("");
    await sendMessage(value);
  }

  function handleNewConversation() {
    if (messages.length > 3 && !window.confirm("Start a new conversation?")) return;
    resetConversation();
    setPromptSeed(`session-${Date.now()}`);
  }

  if (!isAuthenticated && mode === 'sidebar') {
    return <div className="grid h-full place-items-center p-6 text-center text-sm text-[var(--muted)]">Sign in to use the AI assistant.</div>;
  }

  return (
    <section className={`assistant-page ${mode === 'sidebar' ? 'assistant-page--sidebar' : ''}`}>
      <header className="assistant-header" style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", padding: mode === 'sidebar' ? '12px 14px' : "16px 20px" }}>
        <h1><Sparkles width={20} height={20} strokeWidth={1.8} /> PonotAI Assistant</h1>
        <button type="button" onClick={handleNewConversation}><RotateCcw width={15} height={15} strokeWidth={1.8} /> New</button>
      </header>

      <div className="assistant-thread" style={{ flex: 1, minHeight: 0 }}>
        {messages.length === 0 ? (
          <div className="assistant-empty w-full max-w-3xl space-y-4 px-2">
            {showHints ? <div className="assistant-capability-grid">
              <div className="assistant-capability-card"><strong>Smart playlists</strong>Generate themed sets from favorites and listening habits.</div>
              <div className="assistant-capability-card"><strong>Daily insights</strong>Ask for today, this week, or monthly listening summaries.</div>
              <div className="assistant-capability-card"><strong>Discovery mode</strong>Find adjacent artists and tracks outside your usual lane.</div>
              <div className="assistant-capability-card"><strong>Queue + library help</strong>Build queues, organize tracks, and tune settings.</div>
            </div> : null}
            <StarterPrompts seedKey={`${mode}-${promptSeed}`} onSelect={(prompt) => void sendMessage(prompt)} />
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} onAccept={() => acceptAction(message.id)} onDismiss={() => dismissAction(message.id)} />
          ))
        )}
        {isLoading ? <TypingIndicator /> : null}
        <div ref={bottomRef} />
      </div>

      <footer className="assistant-input-wrap" style={{ marginBottom: mode === 'sidebar' ? 0 : 'var(--keyboard-height, 0px)', paddingBottom: mode === "sidebar" ? "12px" : undefined }}>
        <textarea value={input} placeholder="Ask about your music..." onChange={(event) => setInput(event.target.value)} rows={1} maxLength={2000} disabled={isLoading}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitMessage(); } }} />
        <button type="button" onClick={() => void submitMessage()} disabled={!input.trim() || isLoading}><Send width={18} height={18} strokeWidth={1.8} /></button>
      </footer>
      {input.length > 1800 ? <p className="assistant-counter">{input.length}/2000</p> : null}
    </section>
  );
}
