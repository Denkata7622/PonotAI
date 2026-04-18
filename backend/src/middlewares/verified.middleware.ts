import type { NextFunction, Request, Response } from "express";
import { findUserById } from "../db/authStore";
import { ErrorCatalog, sendError } from "../errors/errorCatalog";

export async function requireVerifiedEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  const user = await findUserById(req.userId);
  if (!user) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  if (!user.emailVerifiedAt) {
    sendError(res, ErrorCatalog.EMAIL_NOT_VERIFIED);
    return;
  }

  next();
}
