"use client";

import { useEffect, useState } from "react";
import { BarChart2, Library, Sparkles, Users } from "lucide-react";
import { apiFetch } from "@/src/lib/apiFetch";
import { useUser } from "@/src/context/UserContext";

type PersonaOption = {
  key: "gym" | "indie" | "nostalgia" | "chill" | "mainstream";
  description: string;
  usernamePrefix: string;
};

type DemoAccount = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "user";
  persona: string;
  personaDescription: string;
  createdAt: string;
  seededSongs: number;
  seededFavorites: number;
  seededPlaylists: number;
  seededListeningLogs: number;
  activityWindowDays: number;
};

type AdminOverview = {
  totals: {
    users: number;
    playlists: number;
    shares: number;
    recognitions: number;
    demoAccounts: number;
    achievementsAwarded: number;
    apiKeys: number;
  };
  users: { recent: Array<{ id: string; username: string; email: string; role: string; isDemo: boolean; createdAt: string }> };
  activity: {
    recentSignups: Array<{ id: string; username: string; role: string; createdAt: string }>;
    recentRecognitions: Array<{ id: string; title?: string; artist?: string; method: string; createdAt: string }>;
    recentPlaylists: Array<{ id: string; name: string; songCount: number; updatedAt: string }>;
  };
  shares: {
    counts: { songs: number; playlists: number; recognitions: number };
    recent: Array<{ id: string; type: string; createdAt: string }>;
  };
  demos: { recentProfiles: Array<{ id: string; username: string; email: string; createdAt: string; seededHistory: number; seededFavorites: number; seededPlaylists: number }> };
  developerApi: {
    totalKeys: number;
    recentKeys: Array<{ id: string; userId: string; label: string; keyPrefix: string; createdAt: string; revokedAt?: string }>;
  };
  ai: { assistantAvailable: boolean; mode: string; recentFailures: number; assistantRequests: number };
};

export default function AdminPage() {
  const { user, isLoading } = useUser();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<PersonaOption["key"]>("gym");
  const [lastGenerated, setLastGenerated] = useState<DemoAccount | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const formatUtcDateTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  };

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== "admin") {
      setError("Admin access required.");
      return;
    }
    Promise.all([
      apiFetch("/api/admin/overview", { cache: "no-store" }),
      apiFetch("/api/admin/demo-personas", { cache: "no-store" }),
    ])
      .then(async ([overviewResponse, personasResponse]) => {
        if (!overviewResponse.ok || !personasResponse.ok) {
          setError("Admin access required.");
          return;
        }
        const overviewPayload = (await overviewResponse.json()) as AdminOverview;
        const personasPayload = (await personasResponse.json()) as { items: PersonaOption[] };
        setOverview(overviewPayload);
        setPersonas(personasPayload.items);
      })
      .catch(() => setError("Failed to load admin overview."));
  }, [isLoading, user]);

  async function createDemo() {
    setIsGenerating(true);
    setActionMessage(null);
    const res = await apiFetch("/api/admin/demo-account", { method: "POST", body: JSON.stringify({ persona: selectedPersona }), cache: "no-store" });
    setIsGenerating(false);
    if (!res.ok) {
      setActionMessage("Failed to generate demo account.");
      return;
    }
    const payload = (await res.json()) as { account: DemoAccount };
    setLastGenerated(payload.account);
    setActionMessage(`Generated ${payload.account.name} (${payload.account.persona}). Password is shown once.`);
    const overviewResponse = await apiFetch("/api/admin/overview", { cache: "no-store" });
    if (overviewResponse.ok) {
      setOverview((await overviewResponse.json()) as AdminOverview);
    }
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setActionMessage(`${label} copied to clipboard.`);
  }

  if (error) return <section className="card p-4 sm:p-6">{error}</section>;
  if (!overview) return <section className="card p-4 sm:p-6">Loading admin dashboard...</section>;

  return (
    <section className="space-y-6 pb-[calc(var(--layout-bottom-offset)+20px)]">
      <header className="card p-4 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Admin Operations Dashboard</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Monitor product usage, demo profile generation, recent content activity, and AI system status.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Users", value: overview.totals.users, Icon: Users },
          { label: "Recognitions", value: overview.totals.recognitions, Icon: BarChart2 },
          { label: "Playlists", value: overview.totals.playlists, Icon: Library },
          { label: "Assistant requests", value: overview.ai.assistantRequests, Icon: Sparkles },
          { label: "Shares", value: overview.totals.shares, Icon: Sparkles },
          { label: "Demo accounts", value: overview.totals.demoAccounts, Icon: Users },
          { label: "Achievements", value: overview.totals.achievementsAwarded, Icon: Sparkles },
          { label: "Developer API keys", value: overview.totals.apiKeys, Icon: Sparkles },
        ].map(({ label, value, Icon }) => (
          <article key={label} className="card p-4">
            <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted)]"><Icon className="h-3.5 w-3.5" />{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-5 space-y-4">
          <h2 className="text-xl font-semibold">Demo profile management</h2>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Persona</span>
            <select className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" value={selectedPersona} onChange={(event) => setSelectedPersona(event.target.value as PersonaOption["key"])}>
              {personas.map((persona) => <option key={persona.key} value={persona.key}>{persona.key} — {persona.description}</option>)}
            </select>
          </label>
          <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isGenerating} onClick={createDemo}>
            {isGenerating ? "Generating…" : "Generate demo account"}
          </button>
          {actionMessage ? <p className="text-sm text-[var(--muted)]">{actionMessage}</p> : null}

          {lastGenerated ? (
            <div className="grid gap-2 text-sm">
              {[["Email", lastGenerated.email], ["Password", lastGenerated.password], ["Persona", lastGenerated.persona], ["Songs", String(lastGenerated.seededSongs)], ["Favorites", String(lastGenerated.seededFavorites)], ["Playlists", String(lastGenerated.seededPlaylists)], ["Logs", String(lastGenerated.seededListeningLogs)], ["Activity window", `${lastGenerated.activityWindowDays} days`]].map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2">
                  <span className="text-[var(--muted)]">{label}</span>
                  <code>{value}</code>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button className="rounded-lg border border-[var(--border)] px-3 py-1.5" onClick={() => copyText(lastGenerated.email, "Email")}>Copy email</button>
                <button className="rounded-lg border border-[var(--border)] px-3 py-1.5" onClick={() => copyText(lastGenerated.password, "Password")}>Copy password</button>
                <button className="rounded-lg border border-[var(--border)] px-3 py-1.5" onClick={() => copyText(`${lastGenerated.email}\n${lastGenerated.password}`, "Credentials")}>Copy credentials</button>
              </div>
              <p className="rounded-lg border border-[var(--border)] p-2 text-xs text-[var(--muted)]">
                Persona summary: {lastGenerated.personaDescription}
              </p>
            </div>
          ) : null}
        </section>

        <section className="card p-5">
          <h2 className="text-xl font-semibold">Recently generated demo profiles</h2>
          <div className="mt-3 space-y-2 text-sm">
            {overview.demos.recentProfiles.length === 0 ? <p className="text-[var(--muted)]">No demo profiles generated yet.</p> : overview.demos.recentProfiles.map((profile) => (
              <div key={profile.id} className="rounded-lg border border-[var(--border)] p-3">
                <p className="font-medium">{profile.username}</p>
                <p className="text-[var(--muted)]">{profile.email}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">History logs: {profile.seededHistory} · Playlists: {profile.seededPlaylists} · Created: {formatUtcDateTime(profile.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-xl font-semibold">Activity overview</h2>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <p className="font-medium">Recent signups</p>
              <ul className="mt-2 space-y-1 text-[var(--muted)]">{overview.activity.recentSignups.slice(0, 5).map((row) => <li key={row.id}>{row.username} · {formatUtcDateTime(row.createdAt)}</li>)}</ul>
            </div>
            <div>
              <p className="font-medium">Recent recognitions</p>
              <ul className="mt-2 space-y-1 text-[var(--muted)]">{overview.activity.recentRecognitions.slice(0, 5).map((row) => <li key={row.id}>{row.title || "Unknown"} · {row.method}</li>)}</ul>
            </div>
            <div>
              <p className="font-medium">Recent playlists</p>
              <ul className="mt-2 space-y-1 text-[var(--muted)]">{overview.activity.recentPlaylists.slice(0, 5).map((row) => <li key={row.id}>{row.name} ({row.songCount})</li>)}</ul>
            </div>
            <div>
              <p className="font-medium">Recent shares</p>
              <ul className="mt-2 space-y-1 text-[var(--muted)]">{overview.shares.recent.slice(0, 5).map((row) => <li key={row.id}>{row.type} · {formatUtcDateTime(row.createdAt)}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-xl font-semibold">System and AI</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p>Assistant provider: <strong>{overview.ai.mode}</strong> ({overview.ai.assistantAvailable ? "available" : "unavailable"})</p>
            <p>Recent AI failures: <strong>{overview.ai.recentFailures}</strong></p>
            <p>Assistant requests: <strong>{overview.ai.assistantRequests}</strong></p>
            <p>Share counts — songs: {overview.shares.counts.songs}, playlists: {overview.shares.counts.playlists}, recognitions: {overview.shares.counts.recognitions}</p>
          </div>
          <h3 className="mt-4 font-medium">Recent API keys</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {overview.developerApi.recentKeys.slice(0, 5).map((key) => (
              <li key={key.id} className="rounded-md border border-[var(--border)] p-2">{key.label} · {key.keyPrefix} · {key.revokedAt ? "revoked" : "active"}</li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
