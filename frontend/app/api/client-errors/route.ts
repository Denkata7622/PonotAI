export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAYLOAD_CHARS = 16_384;
const MAX_FIELD_CHARS = 2_000;
const DEDUPE_WINDOW_MS = 60_000;
const recentErrors = new Map<string, number>();
const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|cookie|session|api[-_]?key/i;
const SENSITIVE_VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/\bAuthorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Authorization: Bearer [redacted]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/\bauthorization\s*[:=]\s*(?!Bearer\b)[^&\s"'`<>),;]+/gi, "authorization=[redacted]"],
  [/\b(token|secret|password|cookie|session|api[-_]?key)\s*[:=]\s*[^&\s"'`<>),;]+/gi, "$1=[redacted]"],
];

type SanitizedValue = string | number | boolean | null | SanitizedValue[] | { [key: string]: SanitizedValue };

function truncate(value: string, limit = MAX_FIELD_CHARS): string {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function sanitizeString(value: string): string {
  const redacted = SENSITIVE_VALUE_PATTERNS.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), value);
  return truncate(redacted);
}

function sanitize(value: unknown, depth = 0): SanitizedValue {
  if (depth > 4) return "[truncated]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    const output: { [key: string]: SanitizedValue } = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitize(entry, depth + 1);
    }
    return output;
  }
  return String(value ?? "");
}

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

    const sanitized = sanitize(parsed) as Record<string, SanitizedValue>;
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

export const __clientErrorTestUtils = { sanitize };
