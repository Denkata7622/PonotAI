"use client";

import { useEffect, useId } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const generatedId = useId().replace(/:/g, "");
  const diagnosticId = error.digest || `client-${generatedId}`;

  useEffect(() => {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        source: "app-error-boundary",
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
        timestamp: new Date().toISOString(),
        diagnosticId,
      }),
    }).catch(() => undefined);
  }, [diagnosticId, error.message, error.stack]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-surface)] p-6 shadow-[var(--shadow-soft)]">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Something went wrong</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text)]">This view could not load.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          The error was captured for server logs. Try again, and keep this diagnostic ID if the problem repeats.
        </p>
        <code className="mt-4 block overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs text-[var(--text)]">
          {diagnosticId}
        </code>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
