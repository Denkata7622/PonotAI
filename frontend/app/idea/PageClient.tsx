"use client";

import { useLanguage } from "../../lib/LanguageContext";

export default function IdeaPage() {
  const { language } = useLanguage();
  const isBg = language === "bg";

  return (
    <main className="mx-auto max-w-5xl px-6 py-16 text-text-primary">
      <section className="mb-16 text-center">
        <h1 className="mt-6 text-5xl font-semibold tracking-tight leading-tight">
          {isBg ? "Идеята зад ПонотИИ" : "The idea behind PonotAI"}
        </h1>
        <p className="mx-auto mt-5 max-w-3xl text-lg text-text-muted leading-relaxed">
          {isBg
            ? "ПонотИИ решава проблема след разпознаването: не само каква е песента, а къде да я слушаш бързо, сигурно и легално."
            : "PonotAI solves the problem after recognition: not only what song it is, but where to listen quickly, safely, and legally."}
        </p>
      </section>

      <section className="mb-14 grid gap-4 md:grid-cols-3">
        {[
          {
            title: isBg ? "Проблем" : "Problem",
            heading: isBg ? "Разпознаване без следваща стъпка" : "Recognition without a next step",
            text: isBg
              ? "След разпознаване потребителят често търси ръчно в няколко платформи и губи време."
              : "After recognition, users often search manually across platforms and lose time.",
          },
          {
            title: isBg ? "Решение" : "Solution",
            heading: isBg ? "Един резултат → легален достъп" : "One result → legal access",
            text: isBg
              ? "ПонотИИ предлага директни действия към Spotify, YouTube Music и Apple Music."
              : "PonotAI provides direct actions to Spotify, YouTube Music, and Apple Music.",
          },
          {
            title: isBg ? "Изпълнение" : "Implementation",
            heading: isBg ? "Модерен интерфейс + API" : "Modern interface + API",
            text: isBg
              ? "Frontend и backend работят заедно за разпознаване, метаданни и история."
              : "Frontend and backend work together for recognition, metadata, and history.",
          },
        ].map((item) => (
          <div key={item.heading} className="rounded-2xl border border-border bg-surface p-6 backdrop-blur-xl">
            <div className="text-xs text-text-muted">{item.title}</div>
            <h3 className="mt-2 text-lg font-semibold">{item.heading}</h3>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">{item.text}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-8 backdrop-blur-xl">
        <h2 className="mb-3 text-2xl font-semibold">{isBg ? "Защо това е важно" : "Why this matters"}</h2>
        <p className="leading-relaxed text-text-muted">
          {isBg
            ? "Целта е ясна: бърз път от „чувам песен“ до „слушам легално“. Това подкрепя артистите, намалява объркването и прави демонстрацията на продукта реална и убедителна."
            : "The goal is clear: a fast path from “I hear a song” to “I listen legally.” It supports artists, reduces friction, and makes the product demo practical and convincing."}
        </p>
      </section>
    </main>
  );
}
