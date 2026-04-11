"use client";

import { useState } from "react";
import { apiFetch } from "@/src/lib/apiFetch";

export default function DevelopersPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);

  async function createKey() {
    const res = await apiFetch("/api/developer/keys", { method: "POST", body: JSON.stringify({ label: "My App" }) });
    if (!res.ok) return;
    const payload = await res.json();
    setApiKey(payload.apiKey);
  }

  return (
    <section className="card p-6 space-y-4">
      <h1 className="text-2xl font-bold">Developer API</h1>
      <p className="text-sm text-[var(--muted)]">Create an API key and call <code>/api/developer/v1/recognition/audio</code> with <code>x-api-key</code>.</p>
      <button className="rounded-lg border border-[var(--border)] px-4 py-2" onClick={createKey}>Create API key</button>
      {apiKey && <pre className="overflow-auto rounded-lg bg-black/30 p-3 text-xs">{apiKey}</pre>}
      <pre className="overflow-auto rounded-lg bg-black/30 p-3 text-xs">curl -X POST "$API/api/developer/v1/recognition/audio" -H "x-api-key: trk_..." -F "audio=@clip.webm"</pre>
    </section>
  );
}
