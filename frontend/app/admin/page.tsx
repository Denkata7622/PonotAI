"use client";

import { useEffect, useState } from "react";
import { BarChart2, Heart, Library, Settings, Share2, Sparkles, TrendingUp, Users } from "lucide-react";
import { apiFetch } from "@/src/lib/apiFetch";
import { useUser } from "@/src/context/UserContext";

type PersonaOption = {
  key: "gym" | "indie" | "nostalgia" | "chill" | "mainstream";
  description: string;
  usernamePrefix: string;
};

type DemoGenerationConfig = {
  activityWindowDays: number;
  playlistCount: number;
  playlistSize: number;
  favoritesCount: number;
  seed: string;
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
  generationConfig?: {
    playlistCount: number;
    playlistSize: number;
    favoritesCount: number;
    seedApplied: boolean;
  };
};

type AdminOverview = {
  totals: {
    users: number;
    playlists: number;
    favorites: number;
    shares: number;
    recognitions: number;
    historyEntries: number;
    demoAccounts: number;
    achievementsAwarded: number;
    apiKeys: number;
  };
  users: {
    recent: Array<{ id: string; username: string; email: string; role: string; isDemo: boolean; createdAt: string }>;
    roleBreakdown: { admins: number; users: number };
    signups: { last7d: number; last30d: number };
    activeUsers: { recognizedLast7d: number; recognizedLast30d: number };
  };
  activity: {
    recentSignups: Array<{ id: string; username: string; role: string; createdAt: string }>;
    recentRecognitions: Array<{ id: string; title?: string; artist?: string; method: string; recognized: boolean; createdAt: string }>;
    recentPlaylists: Array<{ id: string; name: string; songCount: number; updatedAt: string }>;
  };
  recognitions: {
    totals: { recorded: number; recognized: number; failed: number };
    recent: { last7d: number; last30d: number };
    methodBreakdown: Record<string, number>;
  };
  shares: {
    counts: { songs: number; playlists: number; recognitions: number };
    recentCount7d: number;
    recent: Array<{ id: string; type: string; createdAt: string }>;
  };
  library: {
    favoritesTotal: number;
    playlistSongCount: number;
    averages: { favoritesPerUser: number; playlistsPerUser: number };
  };
  demos: {
    recentProfiles: Array<{ id: string; username: string; email: string; createdAt: string; seededHistory: number; seededFavorites: number; seededPlaylists: number }>;
    personaDistribution: Array<{ key: string; usernamePrefix: string; count: number }>;
  };
  developerApi: {
    totalKeys: number;
    activeKeys: number;
    revokedKeys: number;
    usedLast7d: number;
    recentKeys: Array<{ id: string; userId: string; label: string; keyPrefix: string; createdAt: string; revokedAt?: string }>;
  };
  providerAvailability: Record<string, boolean>;
  health: {
    persistence: { status: "ok" | "degraded"; mode: string; message?: string };
    aiAssistant: { status: "ok" | "degraded"; mode: string };
    recognitionProviders: { status: "ok" | "degraded"; availableCount: number; providers: Record<string, boolean> };
  };
  ai: { assistantAvailable: boolean; mode: string; recentFailures: number; assistantRequests: number };
};

type AiObservability = {
  generatedAt: string;
  assistant: { available: boolean; mode: string; requestsTotal: number; requestsLast7d: number; failuresLast7d: number };
  providerStatus: Record<string, boolean>;
  recommendationSignals: { recognitionEventsLast7d: number; uniqueArtistsLast7d: number; themeActionSignalsLast7d: number };
  notes: { themeActionTracking: string };
};

export default function AdminPage() {
  const { user, isLoading } = useUser();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<PersonaOption["key"]>("gym");
  const [lastGenerated, setLastGenerated] = useState<DemoAccount | null>(null);
  const [demoConfig, setDemoConfig] = useState<DemoGenerationConfig>({
    activityWindowDays: 30,
    playlistCount: 4,
    playlistSize: 25,
    favoritesCount: 36,
    seed: "",
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [demoConfirmed, setDemoConfirmed] = useState(false);
  const [isAdminDemoLoggingIn, setIsAdminDemoLoggingIn] = useState(false);
  const [aiObservability, setAiObservability] = useState<AiObservability | null>(null);

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
      apiFetch("/api/admin/ai-observability", { cache: "no-store" }),
    ])
      .then(async ([overviewResponse, personasResponse, aiObsResponse]) => {
        if (!overviewResponse.ok || !personasResponse.ok || !aiObsResponse.ok) {
          setError("Admin access required.");
          return;
        }
        const overviewPayload = (await overviewResponse.json()) as AdminOverview;
        const personasPayload = (await personasResponse.json()) as { items: PersonaOption[] };
        const aiObsPayload = (await aiObsResponse.json()) as AiObservability;
        setOverview(overviewPayload);
        setPersonas(personasPayload.items);
        setAiObservability(aiObsPayload);
      })
      .catch(() => setError("Failed to load admin overview."));
  }, [isLoading, user]);

  async function createDemo() {
    setIsGenerating(true);
    setActionMessage(null);
    const res = await apiFetch("/api/admin/demo-account", {
      method: "POST",
      body: JSON.stringify({
        persona: selectedPersona,
        confirmGeneration: demoConfirmed,
        options: {
          activityWindowDays: demoConfig.activityWindowDays,
          playlistCount: demoConfig.playlistCount,
          playlistSize: demoConfig.playlistSize,
          favoritesCount: demoConfig.favoritesCount,
          seed: demoConfig.seed.trim() || undefined,
        },
      }),
      cache: "no-store",
    });
    setIsGenerating(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      setActionMessage(payload?.message ?? "Failed to generate demo account.");
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

  async function loginAsAdminDemo() {
    setIsAdminDemoLoggingIn(true);
    setActionMessage(null);
    try {
      const response = await apiFetch("/api/admin/demo-login", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Could not start admin demo session.");
      }
      const payload = (await response.json()) as { token: string; user: { email: string } };
      window.localStorage.setItem("ponotii_token", payload.token);
      setActionMessage(`Logged in as admin demo user (${payload.user.email}). Redirecting…`);
      window.location.assign("/admin");
    } catch (error) {
      setActionMessage((error as Error).message);
    } finally {
      setIsAdminDemoLoggingIn(false);
    }
  }

  if (error) return <section className="card p-4 sm:p-6">{error}</section>;
  if (!overview) return <section className="card p-4 sm:p-6">Loading admin dashboard...</section>;

  const recognitionMethods = Object.entries(overview.recognitions.methodBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <section className="space-y-6 pb-[calc(var(--layout-bottom-offset)+20px)]">
      <header className="card p-4 sm:p-6">
        <p className="mb-3 inline-flex rounded-full border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-wide text-[var(--muted)]">Trackly control center</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Admin Operations Dashboard</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Live operational visibility for users, recognition quality, demos, provider coverage, and subsystem health.</p>
        <div className="mt-4">
          <button
            className="rounded-lg border border-[var(--accent-border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
            onClick={loginAsAdminDemo}
            disabled={isAdminDemoLoggingIn}
          >
            {isAdminDemoLoggingIn ? "Starting admin demo session…" : "Log in as admin demo"}
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Users", value: overview.totals.users, Icon: Users },
          { label: "Recognitions", value: overview.totals.recognitions, Icon: BarChart2 },
          { label: "History entries", value: overview.totals.historyEntries, Icon: TrendingUp },
          { label: "Shares", value: overview.totals.shares, Icon: Share2 },
          { label: "Favorites", value: overview.totals.favorites, Icon: Heart },
          { label: "Playlists", value: overview.totals.playlists, Icon: Library },
          { label: "Assistant requests", value: overview.ai.assistantRequests, Icon: Sparkles },
          { label: "API keys", value: overview.totals.apiKeys, Icon: Settings },
        ].map(({ label, value, Icon }) => (
          <article key={label} className="card p-4 border-[var(--accent-border)]/40">
            <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted)]"><Icon className="h-3.5 w-3.5" />{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </article>
        ))}
      </div>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Operational insights</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">User growth, recognition quality, and subsystem readiness at a glance.</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] p-4">
          <h3 className="text-xl font-semibold">User overview</h3>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p>Admins: <strong>{overview.users.roleBreakdown.admins}</strong></p>
            <p>Standard users: <strong>{overview.users.roleBreakdown.users}</strong></p>
            <p>Signups (7d): <strong>{overview.users.signups.last7d}</strong></p>
            <p>Signups (30d): <strong>{overview.users.signups.last30d}</strong></p>
            <p>Active recognizers (7d): <strong>{overview.users.activeUsers.recognizedLast7d}</strong></p>
            <p>Active recognizers (30d): <strong>{overview.users.activeUsers.recognizedLast30d}</strong></p>
          </div>
          <h3 className="mt-4 font-medium">Recent signups</h3>
          <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
            {overview.activity.recentSignups.slice(0, 6).map((row) => <li key={row.id}>{row.username} · {row.role} · {formatUtcDateTime(row.createdAt)}</li>)}
          </ul>
        </section>

        <section className="rounded-xl border border-[var(--border)] p-4">
          <h3 className="text-xl font-semibold">Recognition & AI</h3>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p>Recognized: <strong>{overview.recognitions.totals.recognized}</strong></p>
            <p>Failed: <strong>{overview.recognitions.totals.failed}</strong></p>
            <p>Recognition events (7d): <strong>{overview.recognitions.recent.last7d}</strong></p>
            <p>Recognition events (30d): <strong>{overview.recognitions.recent.last30d}</strong></p>
            <p>Assistant mode: <strong>{overview.ai.mode}</strong></p>
            <p>Recent AI failures (7d): <strong>{overview.ai.recentFailures}</strong></p>
          </div>
          <h3 className="mt-4 font-medium">Method mix</h3>
          <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
            {recognitionMethods.length === 0 ? <li>No recognition activity yet.</li> : recognitionMethods.map(([method, count]) => <li key={method}>{method}: {count}</li>)}
          </ul>
        </section>
      </div>
      </section>

      {aiObservability ? (
        <section className="card p-5">
          <h2 className="text-lg font-semibold">AI observability (concise)</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Assistant readiness and recommendation telemetry grounded in stored activity.</p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p>Assistant available: <strong>{aiObservability.assistant.available ? "yes" : "no"}</strong></p>
            <p>Mode: <strong>{aiObservability.assistant.mode}</strong></p>
            <p>Assistant requests (total): <strong>{aiObservability.assistant.requestsTotal}</strong></p>
            <p>Assistant requests (7d): <strong>{aiObservability.assistant.requestsLast7d}</strong></p>
            <p>Assistant failures (7d): <strong>{aiObservability.assistant.failuresLast7d}</strong></p>
            <p>Recognition events (7d): <strong>{aiObservability.recommendationSignals.recognitionEventsLast7d}</strong></p>
            <p>Unique artists seen (7d): <strong>{aiObservability.recommendationSignals.uniqueArtistsLast7d}</strong></p>
            <p>Theme action signals (7d): <strong>{aiObservability.recommendationSignals.themeActionSignalsLast7d}</strong></p>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">{aiObservability.notes.themeActionTracking}</p>
        </section>
      ) : null}

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Content & infrastructure</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Sharing footprint, library density, and provider/system health posture.</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] p-4">
          <h2 className="text-xl font-semibold">Sharing, playlists, favorites</h2>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p>Shared songs: <strong>{overview.shares.counts.songs}</strong></p>
            <p>Shared playlists: <strong>{overview.shares.counts.playlists}</strong></p>
            <p>Shared recognitions: <strong>{overview.shares.counts.recognitions}</strong></p>
            <p>Shares in last 7d: <strong>{overview.shares.recentCount7d}</strong></p>
            <p>Playlist tracks total: <strong>{overview.library.playlistSongCount}</strong></p>
            <p>Favorites total: <strong>{overview.library.favoritesTotal}</strong></p>
            <p>Avg favorites per user: <strong>{overview.library.averages.favoritesPerUser}</strong></p>
            <p>Avg playlists per user: <strong>{overview.library.averages.playlistsPerUser}</strong></p>
          </div>
          <h3 className="mt-4 font-medium">Recent shares</h3>
          <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
            {overview.shares.recent.slice(0, 6).map((row) => <li key={row.id}>{row.type} · {formatUtcDateTime(row.createdAt)}</li>)}
          </ul>
        </section>

        <section className="rounded-xl border border-[var(--border)] p-4">
          <h3 className="text-xl font-semibold">System health & providers</h3>
          <div className="mt-3 grid gap-2 text-sm">
            <p>Persistence: <strong>{overview.health.persistence.status}</strong> ({overview.health.persistence.mode})</p>
            <p>AI assistant: <strong>{overview.health.aiAssistant.status}</strong> ({overview.health.aiAssistant.mode})</p>
            <p>Recognition provider coverage: <strong>{overview.health.recognitionProviders.availableCount}</strong> configured</p>
            {overview.health.persistence.message ? <p className="text-amber-300">Persistence warning: {overview.health.persistence.message}</p> : null}
          </div>
          <h3 className="mt-4 font-medium">Provider availability</h3>
          <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
            {Object.entries(overview.providerAvailability).map(([provider, enabled]) => <li key={provider}>{provider}: {enabled ? "available" : "unavailable"}</li>)}
          </ul>
        </section>
      </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Admin tools</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Generate demo populations and inspect API-key lifecycle with safe one-time credential handling.</p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] p-4 space-y-4">
          <h2 className="text-xl font-semibold">Demo profile management</h2>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Persona</span>
            <select className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" value={selectedPersona} onChange={(event) => setSelectedPersona(event.target.value as PersonaOption["key"])}>
              {personas.map((persona) => <option key={persona.key} value={persona.key}>{persona.key} — {persona.description}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Activity window (days)</span>
              <input type="number" min={7} max={120} value={demoConfig.activityWindowDays} onChange={(event) => setDemoConfig((prev) => ({ ...prev, activityWindowDays: Number(event.target.value) }))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Playlist count</span>
              <input type="number" min={1} max={8} value={demoConfig.playlistCount} onChange={(event) => setDemoConfig((prev) => ({ ...prev, playlistCount: Number(event.target.value) }))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Songs per playlist</span>
              <input type="number" min={5} max={50} value={demoConfig.playlistSize} onChange={(event) => setDemoConfig((prev) => ({ ...prev, playlistSize: Number(event.target.value) }))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Favorites to seed</span>
              <input type="number" min={0} max={120} value={demoConfig.favoritesCount} onChange={(event) => setDemoConfig((prev) => ({ ...prev, favoritesCount: Number(event.target.value) }))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Optional deterministic seed</span>
            <input type="text" value={demoConfig.seed} onChange={(event) => setDemoConfig((prev) => ({ ...prev, seed: event.target.value }))} placeholder="leave empty for random behavior" className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" />
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-2 text-xs text-[var(--muted)]">
            <input type="checkbox" className="mt-0.5" checked={demoConfirmed} onChange={(event) => setDemoConfirmed(event.target.checked)} />
            <span>I confirm demo-account creation will seed synthetic activity and expose one-time credentials in this session.</span>
          </label>
          <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_0_0_1px_var(--accent-border)] disabled:opacity-60" disabled={isGenerating || !demoConfirmed} onClick={createDemo}>
            {isGenerating ? "Generating…" : "Generate demo account"}
          </button>
          {actionMessage ? <p className="text-sm text-[var(--muted)]">{actionMessage}</p> : null}

          {lastGenerated ? (
            <div className="grid gap-2 text-sm">
              {[["Email", lastGenerated.email], ["Password", lastGenerated.password], ["Persona", lastGenerated.persona], ["Songs", String(lastGenerated.seededSongs)], ["Favorites", String(lastGenerated.seededFavorites)], ["Playlists", String(lastGenerated.seededPlaylists)], ["Logs", String(lastGenerated.seededListeningLogs)], ["Activity window", `${lastGenerated.activityWindowDays} days`], ["Seed mode", lastGenerated.generationConfig?.seedApplied ? "deterministic" : "random"], ["Playlist seed", `${lastGenerated.generationConfig?.playlistCount ?? "-"} x ${lastGenerated.generationConfig?.playlistSize ?? "-"}`], ["Favorites seed", String(lastGenerated.generationConfig?.favoritesCount ?? "-")]].map(([label, value]) => (
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
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-[var(--border)] p-4">
          <h3 className="text-xl font-semibold">Demo distribution & API keys</h3>
          <h4 className="font-medium">Persona distribution</h4>
          <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
            {overview.demos.personaDistribution.map((row) => <li key={row.key}>{row.key} ({row.usernamePrefix}*): {row.count}</li>)}
          </ul>
          <h4 className="mt-4 font-medium">Developer API</h4>
          <p className="mt-2 text-sm">Active keys: <strong>{overview.developerApi.activeKeys}</strong> · Revoked: <strong>{overview.developerApi.revokedKeys}</strong> · Used in 7d: <strong>{overview.developerApi.usedLast7d}</strong></p>
          <ul className="mt-2 space-y-2 text-sm">
            {overview.developerApi.recentKeys.slice(0, 5).map((key) => (
              <li key={key.id} className="rounded-md border border-[var(--border)] p-2">{key.label} · {key.keyPrefix} · {key.revokedAt ? "revoked" : "active"}</li>
            ))}
          </ul>
        </section>
      </div>
      </section>
    </section>
  );
}
