const MAX_FIELD_CHARS = 2_000;
const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|cookie|session|api[-_]?key/i;
const SENSITIVE_VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/\bAuthorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Authorization: Bearer [redacted]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/\bauthorization\s*[:=]\s*(?!Bearer\b)[^&\s"'`<>),;]+/gi, "authorization=[redacted]"],
  [/\b(token|secret|password|cookie|session|api[-_]?key)\s*[:=]\s*[^&\s"'`<>),;]+/gi, "$1=[redacted]"],
];

export type SanitizedValue = string | number | boolean | null | SanitizedValue[] | { [key: string]: SanitizedValue };

function truncate(value: string, limit = MAX_FIELD_CHARS): string {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function sanitizeString(value: string): string {
  const redacted = SENSITIVE_VALUE_PATTERNS.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), value);
  return truncate(redacted);
}

export function sanitizeClientErrorValue(value: unknown, depth = 0): SanitizedValue {
  if (depth > 4) return "[truncated]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeClientErrorValue(item, depth + 1));
  if (value && typeof value === "object") {
    const output: { [key: string]: SanitizedValue } = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeClientErrorValue(entry, depth + 1);
    }
    return output;
  }
  return String(value ?? "");
}
