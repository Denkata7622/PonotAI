"use client";

import Link from "next/link";
import { useLanguage } from "../../../lib/LanguageContext";

type TrackDetailsClientProps = {
  id: string;
};

export default function TrackDetailsClient({ id }: TrackDetailsClientProps) {
  const { language } = useLanguage();
  const isBg = language === "bg";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="rounded-2xl border border-border bg-surface p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-violet-200/80">
          {isBg ? "Детайли за песен" : "Track details"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-text-primary">Track ID: {id}</h1>
        <p className="mt-4 text-sm text-text-muted">
          {isBg
            ? "Това е временна страница с детайли, за да не водят картите към 404."
            : "This is a placeholder details page so track links do not lead to 404."}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-lg border border-border px-3 py-2 text-sm text-text-primary hover:bg-surface-raised"
        >
          {isBg ? "← Обратно към разпознаването" : "← Back to recognition"}
        </Link>
      </div>
    </main>
  );
}
