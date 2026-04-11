"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/src/lib/apiFetch";

export default function AdminPage() {
  const [overview, setOverview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/admin/overview")
      .then(async (res) => {
        if (!res.ok) {
          setError("Admin access required.");
          return;
        }
        setOverview(await res.json());
      })
      .catch(() => setError("Failed to load admin overview."));
  }, []);

  async function createDemo(persona: "gym" | "indie" | "nostalgia") {
    const res = await apiFetch("/api/admin/demo-account", { method: "POST", body: JSON.stringify({ persona }) });
    if (!res.ok) return;
    const payload = await res.json();
    alert(`Demo account created: ${payload.username}`);
  }

  if (error) return <section className="card p-6">{error}</section>;
  if (!overview) return <section className="card p-6">Loading admin dashboard...</section>;

  return (
    <section className="card p-6 space-y-4">
      <h1 className="text-2xl font-bold">Admin Console</h1>
      <p className="text-sm text-[var(--muted)]">Users: {overview.users.length} • Recognitions: {overview.stats.totalRecognitions}</p>
      <div className="grid gap-2 md:grid-cols-3">
        <button className="rounded-lg border border-[var(--border)] p-3" onClick={() => createDemo("gym")}>Generate Gym Demo</button>
        <button className="rounded-lg border border-[var(--border)] p-3" onClick={() => createDemo("indie")}>Generate Indie Demo</button>
        <button className="rounded-lg border border-[var(--border)] p-3" onClick={() => createDemo("nostalgia")}>Generate Nostalgia Demo</button>
      </div>
    </section>
  );
}
