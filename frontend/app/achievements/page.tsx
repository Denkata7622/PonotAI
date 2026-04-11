"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/src/lib/apiFetch";

export default function AchievementsPage() {
  const [items, setItems] = useState<Array<{ id: string; key: string; unlockedAt: string }>>([]);
  const formatUtcDateTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  };

  useEffect(() => {
    apiFetch("/api/achievements").then(async (res) => {
      if (!res.ok) return;
      const payload = (await res.json()) as { items: Array<{ id: string; key: string; unlockedAt: string }> };
      setItems(payload.items ?? []);
    });
  }, []);

  return (
    <section className="card p-6">
      <h1 className="text-2xl font-bold">Achievements</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Milestones are tracked server-side for anti-spoofing.</p>
      <div className="mt-4 space-y-2">
        {items.length === 0 && <p className="text-sm text-[var(--muted)]">No achievements yet.</p>}
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="font-medium">{item.key.replace(/_/g, " ")}</p>
            <p className="text-xs text-[var(--muted)]">Unlocked {formatUtcDateTime(item.unlockedAt)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
