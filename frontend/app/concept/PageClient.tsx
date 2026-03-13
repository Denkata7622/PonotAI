"use client";

import { useLanguage } from "../../lib/LanguageContext";

export default function ConceptPage() {
  const { language } = useLanguage();
  const isBg = language === "bg";

  return (
    <main className="mx-auto max-w-5xl px-6 py-16 text-text-primary">
      <section className="mb-16 text-center">
        <h1 className="mt-6 text-5xl font-semibold tracking-tight">
          {isBg ? "Концепция: разпознаването е начало, не край" : "Concept: recognition is the start, not the end"}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-text-muted">
          {isBg
            ? "ПонотИИ превръща разпознаването в завършен потребителски поток: откриване, проверен резултат и легален достъп."
            : "PonotAI turns recognition into a complete user flow: discovery, verified result, and legal access."}
        </p>
      </section>

      <section className="mb-12 rounded-2xl border border-border bg-surface p-8 backdrop-blur-xl">
        <h2 className="mb-3 text-2xl font-semibold">{isBg ? "Основна идея" : "Core idea"}</h2>
        <p className="leading-relaxed text-text-muted">
          {isBg
            ? "Повечето приложения спират до заглавието на песента. Ние продължаваме с най-важното: официални източници, ясни бутони и история на резултатите."
            : "Most apps stop at the song title. We continue with what matters most: official sources, clear actions, and result history."}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            h: isBg ? "Минимално действие" : "Minimal interaction",
            t: isBg ? "Един основен бутон и чист интерфейс без шум." : "One primary action and a clean UI without noise.",
          },
          {
            h: isBg ? "Незабавен резултат" : "Instant result",
            t: isBg ? "Показваме полезни данни и готови следващи стъпки." : "We return meaningful data and immediate next steps.",
          },
          {
            h: isBg ? "Легален приоритет" : "Legal-first",
            t: isBg ? "Насочване към официални платформи вместо рискови източници." : "Routing to official platforms instead of risky sources.",
          },
        ].map((item) => (
          <div key={item.h} className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-2 font-semibold">{item.h}</h3>
            <p className="text-sm leading-relaxed text-text-muted">{item.t}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
