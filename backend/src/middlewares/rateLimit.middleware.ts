import { NextFunction, Request, Response } from "express";
import { sendError } from "../errors/errorCatalog";

type ClientBucket = {
  count: number;
  windowStartedAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const buckets = new Map<string, ClientBucket>();

const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 8;
const loginBuckets = new Map<string, ClientBucket>();

function resolveClientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function recognitionRateLimit(req: Request, res: Response, next: NextFunction): void {
  const clientKey = resolveClientKey(req);
  const now = Date.now();
  const existing = buckets.get(clientKey);

  if (!existing || now - existing.windowStartedAt > WINDOW_MS) {
    buckets.set(clientKey, { count: 1, windowStartedAt: now });
    next();
    return;
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    sendError(req, res, 429, "TOO_MANY_RECOGNITION_REQUESTS", {
      details: { retryAfterSeconds: Math.ceil((WINDOW_MS - (now - existing.windowStartedAt)) / 1000) },
    });
    return;
  }

  existing.count += 1;
  next();
}

export function authLoginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const clientKey = resolveClientKey(req);
  const now = Date.now();
  const existing = loginBuckets.get(clientKey);

  if (!existing || now - existing.windowStartedAt > LOGIN_WINDOW_MS) {
    loginBuckets.set(clientKey, { count: 1, windowStartedAt: now });
    next();
    return;
  }

  if (existing.count >= MAX_LOGIN_ATTEMPTS_PER_WINDOW) {
    sendError(req, res, 429, "TOO_MANY_LOGIN_ATTEMPTS", {
      details: { retryAfterSeconds: Math.ceil((LOGIN_WINDOW_MS - (now - existing.windowStartedAt)) / 1000) },
    });
    return;
  }

  existing.count += 1;
  next();
}
