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
const LAST_ERRORS_KEY = "ponotai_last_client_errors";
const MAX_STORED_ERRORS = 20;

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

export function getStoredClientErrors(): ClientErrorReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LAST_ERRORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is ClientErrorReport => Boolean(item && typeof item === "object" && typeof (item as { message?: unknown }).message === "string")) : [];
  } catch {
    return [];
  }
}

export function clearStoredClientErrors(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_ERRORS_KEY);
  } catch {
    // Storage can be unavailable in private contexts.
  }
}

function rememberClientError(report: ClientErrorReport): void {
  if (typeof window === "undefined") return;
  try {
    const next = [report, ...getStoredClientErrors()].slice(0, MAX_STORED_ERRORS);
    window.localStorage.setItem(LAST_ERRORS_KEY, JSON.stringify(next));
  } catch {
    // Storage is optional; server reporting still continues.
  }
}

export function reportClientError(input: { message: string; stack?: string; source?: string }): void {
  if (typeof window === "undefined") return;
  if (shouldIgnoreClientError(input.message, input.source)) return;

  const now = Date.now();
  cleanup(now);
  const key = `${input.message}|${input.source ?? ""}|${input.stack?.slice(0, 120) ?? ""}`;
  if (recentReports.has(key)) return;
  recentReports.set(key, now);

  const report = buildClientErrorReport(input);
  rememberClientError(report);

  if (process.env.NODE_ENV !== "production") {
    console.error("[client-error]", report.message, report.source ?? "", report.stack ?? "");
  }

  const payload = JSON.stringify(report);
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
