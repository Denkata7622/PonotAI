"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiFetch } from "@/src/lib/apiFetch";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";

export default function DevelopersPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { language } = useLanguage();

  const endpointRows = useMemo(() => [
    { method: "POST", path: "/api/developer/keys", auth: "session", desc: t("dev_endpoint_create_key", language) },
    { method: "GET", path: "/api/developer/keys", auth: "session", desc: t("dev_endpoint_list_keys", language) },
    { method: "DELETE", path: "/api/developer/keys/:id", auth: "session", desc: t("dev_endpoint_revoke_key", language) },
    { method: "POST", path: "/api/developer/v1/recognition/audio", auth: "x-api-key", desc: t("dev_endpoint_recognize_audio", language) },
    { method: "GET", path: "/api/developer/v1/recommendations?seed=", auth: "x-api-key", desc: t("dev_endpoint_recommendations", language) },
  ], [language]);

  async function createKey() {
    setError(null);
    const res = await apiFetch("/api/developer/keys", { method: "POST", body: JSON.stringify({ label: "My App" }) });
    if (!res.ok) {
      setError(t("dev_create_key_failed", language));
      return;
    }
    const payload = await res.json();
    setApiKey(payload.apiKey);
  }

  return (
    <section className="mx-auto max-w-4xl space-y-4 rounded-2xl border border-border bg-surface p-6">
      <h1 className="text-2xl font-bold">{t("dev_api_title", language)}</h1>
      <p className="text-sm text-[var(--muted)]">{t("dev_api_intro", language)}</p>

      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg border border-[var(--border)] px-4 py-2" onClick={createKey}>{t("dev_create_key", language)}</button>
        <Link href="/docs" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">{t("dev_open_docs", language)}</Link>
      </div>

      {error ? <p className="text-sm text-[var(--status-danger)]">{error}</p> : null}
      {apiKey ? (
        <pre className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs">{apiKey}</pre>
      ) : null}

      <h2 className="pt-2 text-lg font-semibold">{t("dev_api_reference", language)}</h2>
      <div className="overflow-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--surface-subtle)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">{t("dev_col_method", language)}</th>
              <th className="px-3 py-2">{t("dev_col_path", language)}</th>
              <th className="px-3 py-2">{t("dev_col_auth", language)}</th>
              <th className="px-3 py-2">{t("dev_col_description", language)}</th>
            </tr>
          </thead>
          <tbody>
            {endpointRows.map((row) => (
              <tr key={`${row.method}-${row.path}`} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-mono text-xs">{row.method}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.path}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.auth}</td>
                <td className="px-3 py-2">{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="pt-2 text-lg font-semibold">{t("dev_examples", language)}</h2>
      <pre className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs">curl -X POST "$API/api/developer/v1/recognition/audio" -H "x-api-key: trk_..." -F "audio=@clip.webm" -F "mode=standard"</pre>
      <pre className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs">curl "$API/api/developer/v1/recommendations?seed=weeknd" -H "x-api-key: trk_..."</pre>

      <h2 className="pt-2 text-lg font-semibold">{t("dev_external_services", language)}</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
        <li>{t("dev_external_youtube", language)}</li>
        <li>{t("dev_external_audd", language)}</li>
        <li>{t("dev_external_gemini", language)}</li>
      </ul>
    </section>
  );
}
