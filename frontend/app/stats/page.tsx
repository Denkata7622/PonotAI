"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl } from "../../lib/apiConfig";

type GlobalStats = {
  totalRecognitions: number;
  totalUsers: number;
  topArtists: Array<{ name: string; count: number }>;
};

export default function StatsPage() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/stats/global`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((payload) => setStats(payload as GlobalStats))
      .catch(() => setError("Could not load global stats."));
  }, []);

  if (error) return <section className="card p-6">{error}</section>;
  if (!stats) return <section className="card p-6">Loading stats…</section>;

  const max = Math.max(1, ...stats.topArtists.map((artist) => artist.count));

  return (
    <section className="space-y-6">
      <div className="card p-6">
        <h1 className="text-3xl font-bold">Competition Stats</h1>
        <p className="cardText mt-2">Live jury dashboard from backend persistence.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <p className="cardText">Total recognized songs</p>
          <p className="cardTitle mt-2 text-3xl font-semibold">{stats.totalRecognitions}</p>
        </div>
        <div className="card p-5">
          <p className="cardText">Total users</p>
          <p className="cardTitle mt-2 text-3xl font-semibold">{stats.totalUsers}</p>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-xl font-semibold">Top artists</h2>
        <div className="mt-4 space-y-3">
          {stats.topArtists.map((artist) => (
            <div key={artist.name}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{artist.name}</span>
                <span className="text-text-muted">{artist.count}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-overlay">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(artist.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
