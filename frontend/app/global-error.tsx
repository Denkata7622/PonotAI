"use client";

import { useEffect, useId } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const generatedId = useId().replace(/:/g, "");
  const diagnosticId = error.digest || `global-${generatedId}`;

  useEffect(() => {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        source: "global-error-boundary",
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
        timestamp: new Date().toISOString(),
        diagnosticId,
      }),
    }).catch(() => undefined);
  }, [diagnosticId, error.message, error.stack]);

  return (
    <html lang="bg">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", background: "#0b0d12", color: "white" }}>
          <section style={{ maxWidth: "560px", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "16px", padding: "24px", background: "rgba(255,255,255,0.06)" }}>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.62)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Application error</p>
            <h1 style={{ margin: "8px 0 0", fontSize: "28px" }}>Turrex could not continue.</h1>
            <p style={{ color: "rgba(255,255,255,0.72)", lineHeight: 1.6 }}>The error was captured for server logs. Retry the page and keep this diagnostic ID if it repeats.</p>
            <code style={{ display: "block", overflowX: "auto", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "10px", padding: "10px", color: "white" }}>{diagnosticId}</code>
            <button type="button" onClick={reset} style={{ marginTop: "18px", border: 0, borderRadius: "10px", padding: "10px 14px", fontWeight: 700 }}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
