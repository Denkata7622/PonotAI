import { NextFunction, Request, Response } from "express";
import { ErrorCatalog, sendError } from "../errors/errorCatalog";

type ClientBucket = {
  count: number;
  windowStartedAt: number;
};

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
};

const MAX_BUCKETS_PER_LIMITER = 5_000;


const recognitionBuckets = new Map<string, ClientBucket>();
const authBuckets = new Map<string, ClientBucket>();
const apiBuckets = new Map<string, ClientBucket>();
const assistantBuckets = new Map<string, ClientBucket>();

function resolveClientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function pruneBuckets(buckets: Map<string, ClientBucket>, options: RateLimitOptions, now: number): void {
  if (buckets.size < MAX_BUCKETS_PER_LIMITER) return;

  for (const [key, value] of buckets) {
    if (now - value.windowStartedAt > options.windowMs) {
      buckets.delete(key);
    }
  }
}


function enforceRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
  buckets: Map<string, ClientBucket>,
  options: RateLimitOptions,
): void {
  const clientKey = resolveClientKey(req);
  const now = Date.now();
  pruneBuckets(buckets, options, now);
  const existing = buckets.get(clientKey);

  if (!existing || now - existing.windowStartedAt > options.windowMs) {
    buckets.set(clientKey, { count: 1, windowStartedAt: now });
    next();
    return;
  }

  if (existing.count >= options.maxRequests) {
    const retryAfter = Math.ceil((options.windowMs - (now - existing.windowStartedAt)) / 1000);
    sendError(res, ErrorCatalog.RATE_LIMIT_EXCEEDED, {
      retryAfter,
    });
    return;
  }

  existing.count += 1;
  next();
}

export function recognitionRateLimit(req: Request, res: Response, next: NextFunction): void {
  enforceRateLimit(req, res, next, recognitionBuckets, {
    windowMs: 60_000,
    maxRequests: 30,
  });
}

export function authSensitiveRateLimit(req: Request, res: Response, next: NextFunction): void {
  enforceRateLimit(req, res, next, authBuckets, {
    windowMs: 15 * 60_000,
    maxRequests: 10,
  });
}

export function apiRateLimit(req: Request, res: Response, next: NextFunction): void {
  enforceRateLimit(req, res, next, apiBuckets, {
    windowMs: 60_000,
    maxRequests: 100,
  });
}

export function assistantRateLimit(req: Request, res: Response, next: NextFunction): void {
  enforceRateLimit(req, res, next, assistantBuckets, {
    windowMs: 60_000,
    maxRequests: 12,
  });
}
