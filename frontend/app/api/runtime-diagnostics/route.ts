import { NextResponse } from "next/server";
import { getApiConfigStatus } from "@/lib/apiConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeOrigin(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  const api = getApiConfigStatus();
  const warnings: string[] = [];
  const fixes: string[] = [];

  if (!api.configured) {
    warnings.push(api.message ?? "Backend API URL is not configured.");
    fixes.push("Set NEXT_PUBLIC_API_BASE_URL=https://<backend-public-domain> on the frontend service, then rebuild/redeploy the frontend.");
  }

  return NextResponse.json({
    ok: api.configured,
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    api: {
      configured: api.configured,
      source: api.source,
      backendOrigin: safeOrigin(api.baseUrl),
    },
    clientErrorEndpointReady: true,
    warnings,
    fixes,
  });
}
