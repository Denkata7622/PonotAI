"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart2, Music, Users } from "lucide-react";
import { getApiBaseUrl } from "../../lib/apiConfig";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { apiFetch } from "@/src/lib/apiFetch";
import { useUser } from "@/src/context/UserContext";

type GlobalStats = {
  totalRecognitions: number;
  totalUsers: number;
  topArtists: Array<{ name: string; count: number }>;
};

type ActivityPeriod = {
  period: "daily" | "weekly" | "monthly";
  totalPlays: number;
  tracksRecognized: number;
  streakDays: number;
  trend: string;
  topArtists: Array<{ name: string; count: number }>;
  favoriteGenres: Array<{ name: string; count: number }>;
  topTracks: Array<{ title: string; artist: string; count: number }>;
};

type ActivitySummary = {
  generatedAt: string;
  daily: ActivityPeriod;
  weekly: ActivityPeriod;
  monthly: ActivityPeriod;
};

function ActivityCard({ title, data }: { title: string; data: ActivityPeriod }) {
  const hasData = data.totalPlays > 0;
  return (
    <article className="card p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      {!hasData ? (
        <p className="mt-3 text-sm text-[var(--muted)]">No listening data yet. Play tracks and check back for insights.</p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <p>Plays: <strong>{data.totalPlays}</strong> · Recognized: <strong>{data.tracksRecognized}</strong> · Streak: <strong>{data.streakDays} days</strong></p>
          <p className="text-[var(--muted)]">{data.trend}</p>
          <p>Top genres: {data.favoriteGenres.slice(0, 3).map((item) => item.name).join(", ") || "—"}</p>
          <p>Top artists: {data.topArtists.slice(0, 3).map((item) => item.name).join(", ") || "—"}</p>
          <p>Top tracks: {data.topTracks.slice(0, 2).map((item) => `${item.title} — ${item.artist}`).join(" · ") || "—"}</p>
        </div>
      )}
    </article>
  );
}

export default function StatsPage() {
  const { language } = useLanguage();
  const { isAuthenticated } = useUser();
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/stats/global`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((payload) => setStats(payload as GlobalStats))
      .catch(() => setError("Could not load global stats."));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setActivity(null);
      return;
    }
    apiFetch("/api/ai/insights/activity", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((payload) => setActivity(payload as ActivitySummary))
      .catch(() => setActivity(null));
  }, [isAuthenticated]);

  if (error) return <section className="card p-4 sm:p-6">{error}</section>;
  if (!stats) return <section className="card p-4 sm:p-6"><div className="h-20 animate-pulse rounded-xl bg-[var(--surface-raised)]" /></section>;

  return (
    <section
      className="space-y-6"
      style={{ paddingBottom: "calc(var(--player-bar-height, 80px) + 32px + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="card p-4 sm:p-6">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("nav_stats", language)}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Track your daily, weekly, and monthly listening activity with AI-ready summaries.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <p className="cardText inline-flex items-center gap-2"><Music className="w-4 h-4 text-[var(--accent)]" />{t("stats_total_recognitions", language)}</p>
          <p className="cardTitle mt-2 text-2xl font-semibold sm:text-3xl">{stats.totalRecognitions}</p>
        </div>
        <div className="card p-5">
          <p className="cardText inline-flex items-center gap-2"><Users className="w-4 h-4 text-[var(--accent)]" />{t("stats_total_users", language)}</p>
          <p className="cardTitle mt-2 text-2xl font-semibold sm:text-3xl">{stats.totalUsers}</p>
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

      <section className="space-y-3">
        <h2 className="inline-flex items-center gap-2 text-xl font-semibold"><BarChart2 className="h-5 w-5 text-[var(--accent)]" /> Your listening activity</h2>
        {!isAuthenticated ? (
          <div className="card p-5 text-sm text-[var(--muted)]">Sign in to unlock daily, weekly, and monthly activity insights.</div>
        ) : !activity ? (
          <div className="card p-5 text-sm text-[var(--muted)]">Loading personal activity insights…</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <ActivityCard title="Daily" data={activity.daily} />
            <ActivityCard title="Weekly" data={activity.weekly} />
            <ActivityCard title="Monthly" data={activity.monthly} />
          </div>
        )}
      </section>
    </section>
  );
}
