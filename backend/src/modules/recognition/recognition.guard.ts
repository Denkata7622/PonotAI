import crypto from "node:crypto";
import type { SongMetadata } from "./recognition.service";

export type RecognitionMode = "standard" | "live" | "humming" | "video";
export type ProviderName = "audd" | "acrcloud" | "shazam";
export type GuardedProviderErrorKind = "quota" | "overload" | "network" | "other";

export type AttemptBudget = {
  maxProviderCalls: number;
  maxMetadataCalls: number;
};

export type AttemptContext = {
  attemptId: string;
  mode: RecognitionMode;
  userId: string;
  audioHash: string;
  dedupeKey: string;
  budget: AttemptBudget;
};

type InFlightAttempt = {
  startedAt: number;
  promise: Promise<SongMetadata>;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type ProviderCircuit = {
  blockedUntil: number;
  reason: "quota" | "overload" | null;
};

const ATTEMPT_WINDOW_MS = 20_000;
const ATTEMPT_CACHE_TTL_MS = 25_000;
const PROVIDER_CACHE_TTL_MS = 8 * 60_000;
const PROVIDER_QPS_INTERVAL_MS: Record<ProviderName, number> = {
  audd: 750,
  acrcloud: 1_500,
  shazam: 900,
};

const providerLastCallAt = new Map<ProviderName, number>();
const providerCircuits = new Map<ProviderName, ProviderCircuit>();
const inFlightByDedupe = new Map<string, InFlightAttempt>();
const resultCache = new Map<string, CacheEntry<SongMetadata>>();
const providerCache = new Map<string, CacheEntry<unknown>>();

function pruneExpired<T>(store: Map<string, CacheEntry<T>>, now = Date.now()): void {
  for (const [key, value] of store.entries()) {
    if (value.expiresAt <= now) store.delete(key);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hashAudioBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function buildAttemptContext(input: {
  mode: RecognitionMode;
  userId?: string;
  audioHash: string;
  requestedAttemptId?: string;
}): AttemptContext {
  const attemptId = input.requestedAttemptId?.trim() || crypto.randomUUID();
  const userId = input.userId || "guest";
  const windowBucket = Math.floor(Date.now() / ATTEMPT_WINDOW_MS);
  const dedupeKey = `${userId}:${input.mode}:${input.audioHash}:${windowBucket}`;

  const budget: AttemptBudget = input.mode === "live"
    ? { maxProviderCalls: 3, maxMetadataCalls: 2 }
    : { maxProviderCalls: 2, maxMetadataCalls: 1 };

  return {
    attemptId,
    mode: input.mode,
    userId,
    audioHash: input.audioHash,
    dedupeKey,
    budget,
  };
}

export function getCachedAttemptResult(ctx: AttemptContext): SongMetadata | null {
  pruneExpired(resultCache);
  const entry = resultCache.get(ctx.dedupeKey);
  return entry?.value ?? null;
}

export function setCachedAttemptResult(ctx: AttemptContext, value: SongMetadata): void {
  resultCache.set(ctx.dedupeKey, { value, expiresAt: Date.now() + ATTEMPT_CACHE_TTL_MS });
}

export function withAttemptDedupe(ctx: AttemptContext, run: () => Promise<SongMetadata>): Promise<SongMetadata> {
  const now = Date.now();
  const existing = inFlightByDedupe.get(ctx.dedupeKey);
  if (existing && now - existing.startedAt < ATTEMPT_CACHE_TTL_MS) {
    return existing.promise;
  }

  const promise = run().finally(() => {
    inFlightByDedupe.delete(ctx.dedupeKey);
  });

  inFlightByDedupe.set(ctx.dedupeKey, { startedAt: now, promise });
  return promise;
}

export function getProviderCachedResult<T>(provider: ProviderName, audioHash: string): T | null {
  pruneExpired(providerCache);
  const key = `${provider}:${audioHash}`;
  return (providerCache.get(key)?.value as T | undefined) ?? null;
}

export function setProviderCachedResult<T>(provider: ProviderName, audioHash: string, value: T): void {
  const key = `${provider}:${audioHash}`;
  providerCache.set(key, { value, expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS });
}

export function classifyProviderError(error: unknown): GuardedProviderErrorKind {
  const message = (error as Error)?.message?.toLowerCase?.() ?? "";
  if (message.includes("quota") || message.includes("rate limit") || message.includes("429") || message.includes("403")) {
    return "quota";
  }
  if (message.includes("overload") || message.includes("timeout") || message.includes("503")) {
    return "overload";
  }
  if (message.includes("network") || message.includes("socket")) {
    return "network";
  }
  return "other";
}

export function isProviderBlocked(provider: ProviderName): boolean {
  const state = providerCircuits.get(provider);
  return Boolean(state && state.blockedUntil > Date.now());
}

export function markProviderFailure(provider: ProviderName, kind: GuardedProviderErrorKind): void {
  if (kind === "quota") {
    providerCircuits.set(provider, { blockedUntil: Date.now() + 20 * 60_000, reason: "quota" });
    return;
  }

  if (kind === "overload") {
    providerCircuits.set(provider, { blockedUntil: Date.now() + 45_000, reason: "overload" });
  }
}

export async function beforeProviderCall(provider: ProviderName): Promise<void> {
  const now = Date.now();
  const state = providerCircuits.get(provider);
  if (state && state.blockedUntil > now) {
    throw new Error(`${provider} circuit open: ${state.reason ?? "unknown"}`);
  }

  const interval = PROVIDER_QPS_INTERVAL_MS[provider];
  const lastCall = providerLastCallAt.get(provider) ?? 0;
  const waitMs = Math.max(0, interval - (now - lastCall));
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  providerLastCallAt.set(provider, Date.now());
}
