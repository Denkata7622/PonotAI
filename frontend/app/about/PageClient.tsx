"use client";

import Link from "next/link";
import { useLanguage } from "../../lib/LanguageContext";

const featureCards = {
  en: [
    { title: "Music recognition", text: "Identify tracks from live audio, humming, video clips, or screenshots with OCR-assisted fallback." },
    { title: "Personal library", text: "Keep favorites, history, and playlists synced so every recognition turns into reusable context." },
    { title: "AI assistant", text: "Ask for playlists, insights, trends, and discovery recommendations using your listening profile." },
    { title: "Insights & sharing", text: "Understand listening habits and share songs with links that stay useful across devices." },
  ],
  bg: [
    { title: "Разпознаване на музика", text: "Откривай песни от жив аудио, тананикане, видео клипове и OCR снимки с надежден fallback." },
    { title: "Лична библиотека", text: "Запазвай любими, история и плейлисти, за да превръщаш всяко разпознаване в полезен контекст." },
    { title: "AI асистент", text: "Поискай плейлисти, анализи, трендове и discovery препоръки според твоя профил." },
    { title: "Статистики и споделяне", text: "Разбирай навиците си и споделяй песни с линкове, които работят навсякъде." },
  ],
} as const;

export default function AboutPage() {
  const { language } = useLanguage();
  const isBg = language === "bg";
  const cards = featureCards[language];

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <section className="rounded-3xl border border-border bg-surface p-8">
        <h1 className="text-3xl font-bold">{isBg ? "За Trackly" : "About Trackly"}</h1>
        <p className="mt-4 max-w-3xl text-[var(--muted)]">
          {isBg
            ? "Trackly е цялостна музикална платформа за разпознаване, организиране и откриване на песни. Приложението комбинира audio fingerprinting, OCR, персонална библиотека и AI асистент в един свързан продукт."
            : "Trackly is a full product for recognizing, organizing, and rediscovering music. It combines audio fingerprinting, OCR, personal library workflows, and an AI assistant into one connected experience."}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <article key={card.title} className="rounded-2xl border border-border bg-surface-raised p-5">
            <h2 className="text-lg font-semibold">{card.title}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{card.text}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 text-sm text-[var(--muted)] space-y-3">
        <h3 className="text-xl font-semibold text-[var(--text)]">{isBg ? "Как Trackly помага" : "How Trackly helps"}</h3>
        <p>{isBg ? "• За слушатели: намираш песен бързо и я добавяш към колекции без ръчно търсене." : "• For listeners: quickly identify tracks and save them without manual searching."}</p>
        <p>{isBg ? "• За създатели на плейлисти: AI асистентът предлага селекции от реалната ти история, не от случайни шаблони." : "• For playlist builders: AI suggestions are grounded in your actual history, not random templates."}</p>
        <p>{isBg ? "• За екипи и жури: има ясни developer и admin повърхности, демо профили и публични документационни входни точки." : "• For judges and teams: includes developer/admin surfaces, demo profiles, and clear documentation entry points."}</p>
        <p>{isBg ? "• За поверителност: контролираш език, тема, архивиране, импорт/експорт и изтриване на акаунта." : "• For privacy and control: manage language, theme, backup/import/export, and account deletion."}</p>
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href="/how-to-use" className="rounded-full border border-border px-4 py-2 text-sm">{isBg ? "Ръководство" : "User guide"}</Link>
        <Link href="/developers" className="rounded-full border border-border px-4 py-2 text-sm">{isBg ? "Developer docs" : "Developer docs"}</Link>
        <Link href="/assistant" className="rounded-full border border-border px-4 py-2 text-sm">{isBg ? "Към AI асистента" : "Open AI assistant"}</Link>
      </section>
    </main>
  );
}
