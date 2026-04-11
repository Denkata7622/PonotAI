import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { findApiKeyByPrefix, touchApiKey } from "../db/authStore";
import { ErrorCatalog, sendError } from "../errors/errorCatalog";

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export async function requireDeveloperApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const incoming = req.header("x-api-key")?.trim();
  if (!incoming || !incoming.startsWith("trk_")) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  const keyPrefix = incoming.slice(0, 14);
  const apiKeyRecord = await findApiKeyByPrefix(keyPrefix);
  if (!apiKeyRecord) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  const incomingHash = hashApiKey(incoming);
  if (incomingHash !== apiKeyRecord.keyHash) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  await touchApiKey(apiKeyRecord.id);
  req.userId = apiKeyRecord.userId;
  next();
}
