import { sanitizeClientErrorValue, type SanitizedValue } from "@/lib/clientErrorSanitizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAYLOAD_CHARS = 16_384;
const DEDUPE_WINDOW_MS = 60_000;
const recentErrors = new Map<string, number>();

function cleanupDedupe(now: number): void {
  for (const [key, timestamp] of recentErrors.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS) recentErrors.delete(key);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.text();
    if (raw.length > MAX_PAYLOAD_CHARS) {
      console.warn("[client-error] oversized payload ignored", { size: raw.length });
      return new Response(null, { status: 204 });
    }

    let parsed: unknown = {};
    try {
      parsed = raw ? JSON.parse(raw) as unknown : {};
    } catch {
      parsed = { message: "Malformed client error payload" };
    }

    const sanitized = sanitizeClientErrorValue(parsed) as Record<string, SanitizedValue>;
    const key = JSON.stringify({
      message: sanitized.message,
      route: sanitized.route,
      source: sanitized.source,
    }).slice(0, 600);
    const now = Date.now();
    cleanupDedupe(now);
    if (!recentErrors.has(key)) {
      recentErrors.set(key, now);
      console.error("[client-error]", JSON.stringify({
        ...sanitized,
        receivedAt: new Date(now).toISOString(),
      }));
    }
  } catch (error) {
    console.warn("[client-error] report handling failed", error instanceof Error ? error.message : String(error));
  }

  return new Response(null, { status: 204 });
}
