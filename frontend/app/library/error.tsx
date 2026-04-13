"use client";

export default function LibraryError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card p-6 space-y-3">
      <h2 className="text-lg font-semibold">Library error</h2>
      <p className="text-sm status-danger">{error.message}</p>
      <button onClick={reset} className="rounded-lg border border-border px-3 py-2">Try again</button>
    </section>
  );
}
