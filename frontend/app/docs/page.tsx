"use client";

import Link from "next/link";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";

export default function DocsPage() {
  const { language } = useLanguage();

  const sections = [
    { title: t("docs_using_trackly_title", language), desc: t("docs_using_trackly_desc", language), href: "/how-to-use" },
    { title: t("docs_ai_assistant_title", language), desc: t("docs_ai_assistant_desc", language), href: "/assistant" },
    { title: t("docs_import_export_title", language), desc: t("docs_import_export_desc", language), href: "/settings" },
    { title: t("docs_developer_api_title", language), desc: t("docs_developer_api_desc", language), href: "/developers" },
    { title: t("docs_privacy_title", language), desc: t("docs_privacy_desc", language), href: "/settings" },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t("docs_title", language)}</h1>
      <p className="mt-3 text-[var(--muted)]">{t("docs_subtitle", language)}</p>
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
