import type { Express } from "express";

export type TrustProxyValue = ReturnType<Express["get"]>;

function parseTrustProxyValue(rawValue: string): boolean | number | string {
  const trimmed = rawValue.trim();
  if (!trimmed) return false;

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  const asNumber = Number(trimmed);
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber;

  return trimmed;
}

export function resolveTrustProxySetting(): boolean | number | string {
  const explicit = process.env.TRUST_PROXY?.trim();
  if (explicit) return parseTrustProxyValue(explicit);

  return process.env.NODE_ENV === "production" ? 1 : false;
}
