import { NextResponse } from "next/server";
import {
  EXPECTED_BACKEND_URL_EXAMPLE,
  getApiConfigStatus,
  getServerApiConfigStatus,
  normalizeApiBaseUrl,
} from "@/lib/apiConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function envPresence(name: string): { present: boolean; valid: boolean; hostname: string | null; message: string | null } {
  const raw = process.env[name];
  const normalized = normalizeApiBaseUrl(raw);
  return {
    present: Boolean(raw && raw.trim()),
    valid: normalized.ok,
    hostname: normalized.hostname,
    message: normalized.ok || !raw?.trim() ? null : normalized.message,
  };
}

function safeEnvironmentMode(): "local" | "railway" | "unknown" {
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) return "railway";
  if (process.env.NODE_ENV === "development") return "local";
  return "unknown";
}

export async function GET(): Promise<Response> {
  const publicStatus = getApiConfigStatus();
  const serverStatus = getServerApiConfigStatus();
  const warnings: string[] = [];
  const fixes: string[] = [];

  if (!publicStatus.configured && publicStatus.message) warnings.push(publicStatus.message);
  if (!serverStatus.configured && serverStatus.message) warnings.push(serverStatus.message);
  if (publicStatus.fix) fixes.push(publicStatus.fix);
  if (serverStatus.fix) fixes.push(serverStatus.fix);

  return NextResponse.json({
    ok: publicStatus.configured || serverStatus.configured,
    environment: {
      mode: safeEnvironmentMode(),
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      frontendService: true,
    },
    expectedBackendUrlShape: EXPECTED_BACKEND_URL_EXAMPLE,
    publicBuild: {
      source: publicStatus.source,
      configured: publicStatus.configured,
      code: publicStatus.code,
      hostname: publicStatus.hostname,
      message: publicStatus.message,
      env: {
        NEXT_PUBLIC_API_BASE_URL: envPresence("NEXT_PUBLIC_API_BASE_URL"),
      },
    },
    serverRuntime: {
      source: serverStatus.source,
      configured: serverStatus.configured,
      code: serverStatus.code,
      hostname: serverStatus.hostname,
      message: serverStatus.message,
      env: {
        TRACKLY_API_BASE_URL: envPresence("TRACKLY_API_BASE_URL"),
      },
    },
    downloader: {
      route: "/api/download",
      service: "frontend",
      backendRequired: false,
    },
    warnings: Array.from(new Set(warnings)),
    fixes: Array.from(new Set(fixes)),
  });
}
