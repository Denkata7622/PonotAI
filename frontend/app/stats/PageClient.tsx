"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Music, Users } from "lucide-react";
import { getApiBaseUrl } from "../../lib/apiConfig";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";

type GlobalStats = {
  totalRecognitions: number;
  totalUsers: number;
  topArtists: Array<{ name: string; count: number }>;
};

export default function StatsPage() {
  const { language } = useLanguage();
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/stats/global`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((payload) => setStats(payload as GlobalStats))
      .catch(() => setError("Could not load global stats."));
  }, []);

  if (error) return <section className="card p-6">{error}</section>;
  if (!stats) return <section className="card p-6"><div className="h-20 animate-pulse rounded-xl bg-[var(--surface-raised)]" /></section>;

  return (
    <section className="space-y-6">
      <div className="card p-6">
        <h1 className="text-3xl font-bold">{t("nav_stats", language)}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <p className="cardText inline-flex items-center gap-2"><Music className="w-4 h-4 text-[var(--accent)]" />{t("stats_total_recognitions", language)}</p>
          <p className="cardTitle mt-2 text-3xl font-semibold">{stats.totalRecognitions}</p>
        </div>
        <div className="card p-5">
          <p className="cardText inline-flex items-center gap-2"><Users className="w-4 h-4 text-[var(--accent)]" />{t("stats_total_users", language)}</p>
          <p className="cardTitle mt-2 text-3xl font-semibold">{stats.totalUsers}</p>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-xl font-semibold">{t("stats_top_artists", language)}</h2>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.topArtists.slice(0, 5)}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="var(--accent)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
