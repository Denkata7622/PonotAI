import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";

type TokenPayload = { sub: string; exp: number };

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("[auth] JWT_SECRET must be configured in production.");
  }

  return "dev-secret";
}

function base64url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function signPart(payload: string) {
  return crypto.createHmac("sha256", resolveJwtSecret()).update(payload).digest("base64url");
}

export function signAuthToken(userId: string): string {
  const payload: TokenPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${signPart(encoded)}`;
}

function verifyToken(token: string): TokenPayload | null {
  const [payloadPart, signature] = token.split(".");
  if (!payloadPart || !signature) return null;
  if (signPart(payloadPart) !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as TokenPayload;
    if (!payload?.sub || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const payload = verifyToken(header.slice("Bearer ".length).trim());
  if (!payload) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  req.userId = payload.sub;
  next();
}

export function attachUserIfPresent(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();

  const payload = verifyToken(header.slice("Bearer ".length).trim());
  if (payload) req.userId = payload.sub;
  next();
}
