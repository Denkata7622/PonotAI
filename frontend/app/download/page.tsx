import { Suspense } from "react";
import DownloadPageClient from "./PageClient";

function DownloadPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="animate-pulse space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="h-7 w-64 rounded bg-[var(--surface-2)]" />
        <div className="h-4 w-96 rounded bg-[var(--surface-2)]" />
        <div className="h-12 rounded-xl bg-[var(--surface-2)]" />
        <div className="h-12 rounded-xl bg-[var(--surface-2)]" />
      </div>
    </main>
  );
}

export default function DownloadPage() {
  return (
    <Suspense fallback={<DownloadPageSkeleton />}>
      <DownloadPageClient />
    </Suspense>
  );
}
