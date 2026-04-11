import type { NextFunction, Request, Response } from "express";
import { findUserById } from "../db/authStore";
import { ErrorCatalog, sendError } from "../errors/errorCatalog";

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    sendError(res, ErrorCatalog.UNAUTHORIZED);
    return;
  }

  if (req.userRole === "admin") {
    next();
    return;
  }

  const user = await findUserById(req.userId);
  if (!user || user.role !== "admin") {
    sendError(res, ErrorCatalog.FORBIDDEN);
    return;
  }

  req.userRole = "admin";
  next();
}
