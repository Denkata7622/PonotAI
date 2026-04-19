import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { findApiKeyByPrefix, findUserById, touchApiKey } from "../db/authStore";
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
  const incomingBuffer = Buffer.from(incomingHash, "hex");
  const storedBuffer = Buffer.from(apiKeyRecord.keyHash, "hex");
  if (incomingBuffer.length !== storedBuffer.length || !crypto.timingSafeEqual(incomingBuffer, storedBuffer)) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  await touchApiKey(apiKeyRecord.id);
  const user = await findUserById(apiKeyRecord.userId);
  if (!user || !user.emailVerifiedAt) {
    sendError(res, ErrorCatalog.EMAIL_NOT_VERIFIED);
    return;
  }
  req.userId = apiKeyRecord.userId;
  next();
}
