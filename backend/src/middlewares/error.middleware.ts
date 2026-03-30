import type { NextFunction, Request, Response } from "express";
import { sendError } from "../errors/errorCatalog";
import { HttpError } from "../utils/httpError";

export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const req = _req;
  if (error instanceof HttpError) {
    sendError(req, res, error.statusCode, (error.code as any) || "INTERNAL_SERVER_ERROR", {
      message: error.message,
    });
    return;
  }

  sendError(req, res, 500, "INTERNAL_SERVER_ERROR", {
    details: (error as Error).message,
  });
}
