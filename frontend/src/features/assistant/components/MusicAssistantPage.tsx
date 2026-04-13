'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ListPlus, Plus, RotateCcw, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { useUser } from "@/src/context/UserContext";
import { useLanguage } from "@/lib/LanguageContext";
import { t } from "@/lib/translations";
import { useMusicAssistant } from "../useMusicAssistant";
import MessageBubble from "./MessageBubble";
import StarterPrompts from "./StarterPrompts";
import TypingIndicator from "./TypingIndicator";

const capabilityPrompts = [
  { key: "assistant_capability_playlists", prompt: "Build a playlist from my recent favorites for tonight." },
  { key: "assistant_capability_insights", prompt: "Analyze my listening trends from the last 7 days." },
  { key: "assistant_capability_discovery", prompt: "Give me discovery picks outside my usual artists." },
  { key: "assistant_capability_queue", prompt: "Create a focused queue for the next 45 minutes." },
] as const;

export default function MusicAssistantPage({ mode = "page" }: { mode?: "page" | "sidebar" }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useUser();
  const { language } = useLanguage();
  const {
    messages,
    conversations,
    activeConversationId,
    isLoading,
    sendMessage,
    resetConversation,
    startNewConversation,
    openConversation,
    renameConversation,
    deleteConversation,
    startAction,
    acceptAction,
    dismissAction,
    failAction,
    bottomRef,
  } = useMusicAssistant();
  const [input, setInput] = useState("");
  const [promptSeed, setPromptSeed] = useState(() => `session-${Date.now()}`);
  const [showHints, setShowHints] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(mode === "page");

  useEffect(() => {
    if (mode === 'page' && !authLoading && !isAuthenticated) router.replace("/auth");
  }, [authLoading, isAuthenticated, mode, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowHints(window.localStorage.getItem("ponotai-assistant-hints") !== "off");
    if (mode === "sidebar") {
      setHistoryOpen(window.matchMedia("(min-width: 1024px)").matches);
    }
  }, []);

  async function submitMessage() {
    if (!input.trim() || isLoading) return;
    const value = input;
    setInput("");
    await sendMessage(value);
  }

  function handleNewConversation() {
    if (messages.length > 3 && !window.confirm(language === "bg" ? "Да започнем нов разговор?" : "Start a new conversation?")) return;
    startNewConversation();
    setPromptSeed(`session-${Date.now()}`);
  }

  const conversationOptions = useMemo(() => conversations.map((conversation) => (
    <button
      key={conversation.id}
      type="button"
      onClick={() => openConversation(conversation.id)}
      className={`w-full rounded-xl border px-3 py-2 text-left transition ${conversation.id === activeConversationId ? "border-[var(--accent)] bg-[var(--surface-raised)]" : "border-[var(--border)]"}`}
    >
      <p className="truncate text-sm font-semibold">{conversation.title}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{new Date(conversation.updatedAt).toLocaleString()}</p>
    </button>
  )), [activeConversationId, conversations, openConversation]);

  if (!isAuthenticated && mode === 'sidebar') {
    return <div className="grid h-full place-items-center p-6 text-center text-sm text-[var(--muted)]">{t("assistant_signin_hint", language)}</div>;
  }

  return (
    <section className={`assistant-page ${mode === 'sidebar' ? 'assistant-page--sidebar' : ''}`}>
      <header className="assistant-header" style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", padding: mode === 'sidebar' ? '12px 14px' : "16px 20px" }}>
        <h1><Sparkles width={20} height={20} strokeWidth={1.8} /> {t("assistant_title", language)}</h1>
        <button type="button" onClick={handleNewConversation}><Plus width={15} height={15} strokeWidth={1.8} /> {t("assistant_new", language)}</button>
      </header>

      <div className={`grid flex-1 min-h-0 ${historyOpen ? "md:grid-cols-[220px_minmax(0,1fr)]" : "grid-cols-1"}`}>
        {historyOpen ? <aside className="hidden border-r border-[var(--border)] p-2 md:block">
          <div className="mb-2 flex items-center justify-between text-xs text-[var(--muted)]">
            <span>{language === "bg" ? "Разговори" : "Conversations"}</span>
          </div>
          <div className="space-y-2 max-h-[45vh] overflow-auto">{conversationOptions}</div>
        </aside> : null}

        <div className="flex min-h-0 flex-col">
          <div className="border-b border-[var(--border)] px-3 py-2">
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs" onClick={() => setHistoryOpen((prev) => !prev)}>
                {historyOpen ? <ChevronLeft className="inline h-3.5 w-3.5" /> : <ListPlus className="inline h-3.5 w-3.5" />} {language === "bg" ? "Разговори" : "Conversations"}
              </button>
              {!historyOpen ? <select className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" value={activeConversationId ?? ""} onChange={(event) => openConversation(event.target.value)}>
                {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
              </select> : <span className="text-xs text-[var(--muted)]">{language === "bg" ? "Историята е отворена" : "History expanded"}</span>}
              {historyOpen ? <button type="button" className="hidden rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs md:inline-flex" onClick={() => setHistoryOpen(false)}><ChevronRight className="h-3.5 w-3.5" /></button> : null}
            </div>
          </div>

          <div className="assistant-thread" style={{ flex: 1, minHeight: 0 }}>
            {messages.length === 0 ? (
              <div className="assistant-empty w-full max-w-3xl space-y-4 px-2">
                {showHints ? <div className="assistant-capability-grid">
                  {capabilityPrompts.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="assistant-capability-card assistant-capability-card-button"
                      onClick={() => void sendMessage(item.prompt)}
                    >
                      {t(item.key, language)}
                    </button>
                  ))}
                </div> : null}
                <StarterPrompts seedKey={`${mode}-${promptSeed}`} onSelect={(prompt) => void sendMessage(prompt)} />
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble key={message.id} message={message} onApplyStart={() => startAction(message.id)} onApplySuccess={() => acceptAction(message.id)} onDismiss={() => dismissAction(message.id)} onApplyFailure={() => failAction(message.id)} />
              ))
            )}
            {isLoading ? <TypingIndicator /> : null}
            <div ref={bottomRef} />
          </div>

          <footer className="assistant-input-wrap" style={{ marginBottom: mode === 'sidebar' ? 0 : 'var(--keyboard-height, 0px)', paddingBottom: mode === "sidebar" ? "12px" : undefined }}>
            <textarea value={input} placeholder={t("assistant_input_placeholder", language)} onChange={(event) => setInput(event.target.value)} rows={1} maxLength={2000} disabled={isLoading}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitMessage(); } }} />
            <button type="button" onClick={() => void submitMessage()} disabled={!input.trim() || isLoading}><Send width={18} height={18} strokeWidth={1.8} /></button>
          </footer>

          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            <button type="button" className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs" onClick={() => resetConversation()}><RotateCcw width={12} height={12} className="inline" /> {language === "bg" ? "Изчисти" : "Clear"}</button>
            <button type="button" className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs" onClick={() => {
              if (!activeConversationId) return;
              const next = window.prompt(language === "bg" ? "Ново име" : "Rename conversation", "");
              if (next !== null) renameConversation(activeConversationId, next);
            }}><Save width={12} height={12} className="inline" /> {language === "bg" ? "Преименувай" : "Rename"}</button>
            <button type="button" className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-red-300" onClick={() => {
              if (!activeConversationId) return;
              if (window.confirm(language === "bg" ? "Да изтрием този разговор?" : "Delete this conversation?")) {
                deleteConversation(activeConversationId);
              }
            }}><Trash2 width={12} height={12} className="inline" /> {language === "bg" ? "Изтрий" : "Delete"}</button>
          </div>
        </div>
      </div>

      {input.length > 1800 ? <p className="assistant-counter">{input.length}/2000</p> : null}
    </section>
  );
}
