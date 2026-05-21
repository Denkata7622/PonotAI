import { NextResponse } from "next/server";
import { EXPECTED_BACKEND_URL_EXAMPLE, getApiConfigStatus, getServerApiConfigStatus } from "@/lib/apiConfig";

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
  const publicApi = getApiConfigStatus();
  const serverApi = getServerApiConfigStatus();
  const warnings: string[] = [];
  const fixes: string[] = [];

  if (!publicApi.configured) {
    warnings.push(publicApi.message ?? "Backend API URL is not configured for browser features.");
    if (publicApi.fix) fixes.push(publicApi.fix);
  }
  if (!serverApi.configured) {
    warnings.push(serverApi.message ?? "Backend API URL is not configured for server runtime features.");
    if (serverApi.fix) fixes.push(serverApi.fix);
  }

  return NextResponse.json({
    ok: publicApi.configured || serverApi.configured,
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    api: {
      configured: publicApi.configured,
      source: publicApi.source,
      backendOrigin: safeOrigin(publicApi.baseUrl),
      code: publicApi.code,
      expectedValue: EXPECTED_BACKEND_URL_EXAMPLE,
    },
    serverApi: {
      configured: serverApi.configured,
      source: serverApi.source,
      backendOrigin: safeOrigin(serverApi.baseUrl),
      code: serverApi.code,
    },
    clientErrorEndpointReady: true,
    warnings,
    fixes,
  });
}
