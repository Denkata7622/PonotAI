"use client";

import { useLanguage } from "../../lib/LanguageContext";

export default function TheFuturePage() {
  const { language } = useLanguage();
  const isBg = language === "bg";

  return (
    <main className="mx-auto max-w-5xl px-6 py-16 text-[var(--text)]">
      <section className="text-center mb-16">
        <h1 className="mt-6 text-5xl font-semibold tracking-tight">
          {isBg ? "Бъдещето на ПонотИИ" : "The future of PonotAI"}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-text-muted leading-relaxed">
          {isBg
            ? "След демонстрацията целта ни е ПонотИИ да се развие в цялостна музикална платформа с библиотека, профили и препоръки."
            : "After the demo, our goal is to evolve PonotAI into a complete music platform with library, profiles, and recommendations."}
        </p>
      </section>

      <section className="mb-12 rounded-2xl border border-border bg-surface p-10 backdrop-blur-xl">
        <h2 className="mb-4 text-2xl font-semibold text-text-primary">{isBg ? "Пътна карта" : "Roadmap"}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-overlay p-5">
            <h3 className="font-semibold">{isBg ? "Етап 1: Реално разпознаване" : "Phase 1: Real recognition"}</h3>
            <p className="mt-2 text-sm text-text-muted">
              {isBg ? "Стабилен backend endpoint и проверка на достъпност в платформи." : "Stable backend endpoint and platform availability verification."}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-overlay p-5">
            <h3 className="font-semibold">{isBg ? "Етап 2: Библиотека и синхронизация" : "Phase 2: Library and sync"}</h3>
            <p className="mt-2 text-sm text-text-muted">
              {isBg ? "Плейлисти, любими и синхронизация между устройства." : "Playlists, favorites, and cross-device synchronization."}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-overlay p-5">
            <h3 className="font-semibold">{isBg ? "Етап 3: Откриване" : "Phase 3: Discovery"}</h3>
            <p className="mt-2 text-sm text-text-muted">
              {isBg ? "Препоръки по артист, жанр и настроение." : "Recommendations by artist, genre, and mood."}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-overlay p-5">
            <h3 className="font-semibold">{isBg ? "Етап 4: Оптимизация" : "Phase 4: Optimization"}</h3>
            <p className="mt-2 text-sm text-text-muted">
              {isBg ? "По-висока производителност, кеширане и по-добро потребителско изживяване." : "Higher performance, caching, and UX refinements."}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
