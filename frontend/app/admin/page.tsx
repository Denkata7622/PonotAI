"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/src/lib/apiFetch";
import { useUser } from "@/src/context/UserContext";

type PersonaOption = {
  key: "gym" | "indie" | "nostalgia";
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
    recentRecognitions: Array<{ id: string; title?: string; artist?: string; method: string; createdAt: string }>;
    recentPlaylists: Array<{ id: string; name: string; songCount: number; updatedAt: string }>;
  };
  shares: {
    counts: { songs: number; playlists: number; recognitions: number };
    recent: Array<{ id: string; type: string; createdAt: string }>;
  };
  developerApi: {
    totalKeys: number;
    recentKeys: Array<{ id: string; userId: string; label: string; keyPrefix: string; createdAt: string; revokedAt?: string }>;
  };
  ai: { assistantAvailable: boolean; mode: string; recentFailures: number };
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
    setActionMessage(`Generated demo credentials for ${payload.account.name}. Password is shown once.`);
    const overviewResponse = await apiFetch("/api/admin/overview", { cache: "no-store" });
    if (overviewResponse.ok) {
      setOverview((await overviewResponse.json()) as AdminOverview);
    }
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setActionMessage(`${label} copied to clipboard.`);
  }

  if (error) return <section className="card p-6">{error}</section>;
  if (!overview) return <section className="card p-6">Loading admin dashboard...</section>;

  return (
    <section className="space-y-6 pb-8">
      <header className="card p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Admin Dashboard</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Operational overview, demo account generation, and system status for Trackly admins.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total users", overview.totals.users],
          ["Total playlists", overview.totals.playlists],
          ["Total shares", overview.totals.shares],
          ["Total recognitions", overview.totals.recognitions],
          ["Demo accounts", overview.totals.demoAccounts],
          ["Achievements awarded", overview.totals.achievementsAwarded],
          ["Developer API keys", overview.totals.apiKeys],
        ].map(([label, value]) => (
          <article key={label} className="card p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-5 space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Generate demo account</h2>
            <p className="text-sm text-[var(--muted)]">Create temporary demo credentials for QA, demos, and onboarding walkthroughs.</p>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Persona</span>
            <select
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
              value={selectedPersona}
              onChange={(event) => setSelectedPersona(event.target.value as PersonaOption["key"])}
            >
              {personas.map((persona) => (
                <option key={persona.key} value={persona.key}>{persona.key} — {persona.usernamePrefix}</option>
              ))}
            </select>
          </label>
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
            {personas.find((persona) => persona.key === selectedPersona)?.description}
          </p>
          <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isGenerating} onClick={createDemo}>
            {isGenerating ? "Generating…" : "Generate account"}
          </button>
          <p className="text-xs text-[var(--warning)]">Temporary password is only shown once in this panel. It is hashed in storage.</p>
          {actionMessage ? <p className="text-sm text-[var(--muted)]">{actionMessage}</p> : null}
        </section>

        <section className="card p-5">
          <h2 className="text-xl font-semibold">Generated credentials</h2>
          {!lastGenerated ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Generate a demo account to view one-time login credentials and seeded data summary.</p>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              {[
                ["Display Name", lastGenerated.name],
                ["Email", lastGenerated.email],
                ["Temporary Password", lastGenerated.password],
                ["Persona", `${lastGenerated.persona} — ${lastGenerated.personaDescription}`],
                ["Seeded Songs", String(lastGenerated.seededSongs)],
                ["Seeded Favorites", String(lastGenerated.seededFavorites)],
                ["Seeded Playlists", String(lastGenerated.seededPlaylists)],
                ["Seeded Listening Logs", String(lastGenerated.seededListeningLogs)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
                  <span className="text-[var(--muted)]">{label}</span>
                  <code className="max-w-[60%] truncate">{value}</code>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button className="rounded-lg border border-[var(--border)] px-3 py-1.5" onClick={() => copyText(lastGenerated.email, "Email")}>Copy email</button>
                <button className="rounded-lg border border-[var(--border)] px-3 py-1.5" onClick={() => copyText(lastGenerated.password, "Password")}>Copy password</button>
                <button className="rounded-lg border border-[var(--border)] px-3 py-1.5" onClick={() => copyText(`${lastGenerated.email}\n${lastGenerated.password}`, "Credentials")}>Copy credentials</button>
                <a className="rounded-lg border border-[var(--border)] px-3 py-1.5" href="/auth" target="_blank" rel="noreferrer">Open login page</a>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-xl font-semibold">Recent users</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-[var(--muted)]">
                <tr><th className="py-2">User</th><th>Email</th><th>Role</th><th>Created</th></tr>
              </thead>
              <tbody>
                {overview.users.recent.map((userRow) => (
                  <tr key={userRow.id} className="border-t border-[var(--border)]">
                    <td className="py-2">{userRow.username}{userRow.isDemo ? " (demo)" : ""}</td>
                    <td>{userRow.email}</td>
                    <td>{userRow.role}</td>
                    <td>{new Date(userRow.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-xl font-semibold">Shares, AI, and developer API</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p>Share counts — songs: {overview.shares.counts.songs}, playlists: {overview.shares.counts.playlists}, recognitions: {overview.shares.counts.recognitions}</p>
            <p>Assistant availability: {overview.ai.assistantAvailable ? "Available" : "Unavailable"} ({overview.ai.mode} mode)</p>
            <p>Recent AI failures: {overview.ai.recentFailures}</p>
            <p>Total API keys: {overview.developerApi.totalKeys}</p>
          </div>
          <h3 className="mt-4 font-medium">Recent API keys</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {overview.developerApi.recentKeys.slice(0, 5).map((key) => (
              <li key={key.id} className="rounded-md border border-[var(--border)] p-2">
                {key.label} · {key.keyPrefix} · {key.revokedAt ? "revoked" : "active"}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
