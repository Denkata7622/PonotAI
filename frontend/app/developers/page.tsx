"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/src/lib/apiFetch";
import { useLanguage } from "../../lib/LanguageContext";

export default function DevelopersPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const { language } = useLanguage();
  const isBg = language === "bg";

  async function createKey() {
    const res = await apiFetch("/api/developer/keys", { method: "POST", body: JSON.stringify({ label: "My App" }) });
    if (!res.ok) return;
    const payload = await res.json();
    setApiKey(payload.apiKey);
  }

  return (
    <section className="mx-auto max-w-4xl space-y-4 rounded-2xl border border-border bg-surface p-6">
      <h1 className="text-2xl font-bold">{isBg ? "Developer API" : "Developer API"}</h1>
      <p className="text-sm text-[var(--muted)]">{isBg ? "Създай API ключ и извикай recognition endpoint-ите с x-api-key." : "Create an API key and call recognition endpoints with x-api-key."}</p>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg border border-[var(--border)] px-4 py-2" onClick={createKey}>{isBg ? "Създай API ключ" : "Create API key"}</button>
        <Link href="/docs" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">{isBg ? "Към docs" : "Open docs"}</Link>
      </div>
      {apiKey && <pre className="overflow-auto rounded-lg bg-black/30 p-3 text-xs">{apiKey}</pre>}
      <pre className="overflow-auto rounded-lg bg-black/30 p-3 text-xs">curl -X POST "$API/api/developer/v1/recognition/audio" -H "x-api-key: trk_..." -F "audio=@clip.webm"</pre>
      <pre className="overflow-auto rounded-lg bg-black/30 p-3 text-xs">curl "$API/api/developer/v1/recommendations?seed=weeknd" -H "x-api-key: trk_..."</pre>
    </section>
  );
}
