"use client";

import { useEffect } from "react";

type ClientErrorReport = {
  message: string;
  stack?: string;
  route?: string;
  userAgent?: string;
  source?: string;
  timestamp: string;
  appEnv?: string;
};

const DEDUPE_WINDOW_MS = 30_000;
const recentReports = new Map<string, number>();

export function shouldIgnoreClientError(message: string, source?: string): boolean {
  const normalized = `${message} ${source ?? ""}`.toLowerCase();
  return normalized.includes("chrome-extension://")
    || normalized.includes("moz-extension://")
    || normalized.includes("resizeobserver loop limit exceeded")
    || normalized.includes("resizeobserver loop completed with undelivered notifications");
}

function cleanup(now: number) {
  for (const [key, timestamp] of recentReports.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS) recentReports.delete(key);
  }
}

export function buildClientErrorReport(input: {
  message: string;
  stack?: string;
  source?: string;
}): ClientErrorReport {
  return {
    message: input.message.slice(0, 1_000),
    stack: input.stack?.slice(0, 2_000),
    source: input.source?.slice(0, 300),
    route: typeof window !== "undefined" ? window.location.pathname : undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
    timestamp: new Date().toISOString(),
    appEnv: process.env.NODE_ENV,
  };
}

export function reportClientError(input: { message: string; stack?: string; source?: string }): void {
  if (typeof window === "undefined") return;
  if (shouldIgnoreClientError(input.message, input.source)) return;

  const now = Date.now();
  cleanup(now);
  const key = `${input.message}|${input.source ?? ""}|${input.stack?.slice(0, 120) ?? ""}`;
  if (recentReports.has(key)) return;
  recentReports.set(key, now);

  const payload = JSON.stringify(buildClientErrorReport(input));
  try {
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon("/api/client-errors", new Blob([payload], { type: "application/json" }));
      if (sent) return;
    }
  } catch {
    // Fall back to fetch below.
  }

  fetch("/api/client-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

export default function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError({
        message: event.message || "Unhandled browser error",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        source: event.filename,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportClientError({
        message: reason instanceof Error ? reason.message : String(reason ?? "Unhandled promise rejection"),
        stack: reason instanceof Error ? reason.stack : undefined,
        source: "unhandledrejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
