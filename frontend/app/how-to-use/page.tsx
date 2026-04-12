"use client";

import Link from "next/link";
import { useLanguage } from "../../lib/LanguageContext";

export default function HowToUsePage() {
  const { language } = useLanguage();
  const isBg = language === "bg";

  const steps = isBg
    ? [
        { n: "01", title: "Слушай или качи", text: "Използвай микрофон за живо разпознаване или качи изображение за OCR." },
        { n: "02", title: "Провери резултата", text: "Виж confidence, алтернативи и официални линкове към платформи." },
        { n: "03", title: "Запази в библиотека", text: "Добавяй в любими, история и плейлисти за по-добър AI контекст." },
        { n: "04", title: "Използвай AI асистента", text: "Създавай плейлисти, откривай музика и преглеждай инсайти от активността." },
      ]
    : [
        { n: "01", title: "Listen or upload", text: "Use live microphone recognition or upload an image for OCR extraction." },
        { n: "02", title: "Validate results", text: "Review confidence, alternatives, and official listening links." },
        { n: "03", title: "Save into library", text: "Add tracks to favorites, history, and playlists for stronger AI context." },
        { n: "04", title: "Use AI assistant", text: "Generate playlists, discover tracks, and inspect listening insights." },
      ];

  return (
    <main className="min-h-screen px-6 py-14 text-[var(--text)]">
      <section className="mx-auto max-w-5xl rounded-3xl border border-border bg-surface px-10 py-12 backdrop-blur-xl">
        <h1 className="text-5xl font-semibold tracking-tight">{isBg ? "Как да използваш Trackly" : "How to use Trackly"}</h1>
        <p className="mt-5 max-w-2xl text-[var(--muted)] leading-relaxed">
          {isBg ? "Бърз работен поток: разпознаване, проверка, запазване и интелигентни предложения." : "A practical flow: recognize, verify, save, and take action with intelligent suggestions."}
        </p>
      </section>

      <section className="mx-auto mt-14 max-w-6xl grid gap-6 md:grid-cols-2">
        {steps.map((s) => (
          <div key={s.n} className="rounded-2xl border border-border bg-surface p-7 backdrop-blur-xl">
            <div className="text-sm font-semibold text-text-muted">{s.n}</div>
            <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{s.text}</p>
          </div>
        ))}
      </section>

      <div className="mx-auto mt-10 max-w-6xl flex flex-wrap gap-3">
        <Link href="/docs" className="rounded-full border border-border bg-surface px-5 py-2 text-sm hover:bg-surface-raised">{isBg ? "Всички docs" : "All docs"}</Link>
        <Link href="/settings" className="rounded-full border border-border bg-surface px-5 py-2 text-sm hover:bg-surface-raised">{isBg ? "Импорт/експорт" : "Import/export"}</Link>
        <Link href="/" className="rounded-full border border-border bg-surface px-5 py-2 text-sm hover:bg-surface-raised">{isBg ? "Към приложението" : "Back to app"}</Link>
      </div>
    </main>
  );
}
