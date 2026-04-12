"use client";

import Link from "next/link";
import { useLanguage } from "../../lib/LanguageContext";

export default function DocsPage() {
  const { language } = useLanguage();
  const isBg = language === "bg";

  const sections = isBg
    ? [
        { title: "Използване на Trackly", desc: "Разпознаване, библиотека, плейлисти, история.", href: "/how-to-use" },
        { title: "AI асистент", desc: "Много разговори, action cards, discovery и insights.", href: "/assistant" },
        { title: "Импорт/експорт и backups", desc: "Сигурен трансфер на данни, версии и обобщения.", href: "/settings" },
        { title: "Developer API", desc: "API ключове и recognition endpoints за интеграции.", href: "/developers" },
        { title: "Поверителност и контрол", desc: "Профили, локални настройки, изтриване на акаунт.", href: "/settings" },
      ]
    : [
        { title: "Using Trackly", desc: "Recognition, library workflows, playlists, and history.", href: "/how-to-use" },
        { title: "AI assistant", desc: "Multi-chat history, action cards, discovery and insight flows.", href: "/assistant" },
        { title: "Import/export & backups", desc: "Safe data transfer, versioned backups, and summaries.", href: "/settings" },
        { title: "Developer API", desc: "API keys and recognition endpoints for integrations.", href: "/developers" },
        { title: "Privacy and control", desc: "Profiles, local settings, and account deletion controls.", href: "/settings" },
      ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold">{isBg ? "Документация" : "Documentation"}</h1>
      <p className="mt-3 text-[var(--muted)]">{isBg ? "Всички ключови ръководства на едно място." : "All key product guidance in one place."}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Link key={section.title} href={section.href} className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{section.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
