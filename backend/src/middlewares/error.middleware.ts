import type { NextFunction, Request, Response } from "express";
import { ErrorCatalog, sendError } from "../errors/errorCatalog";
import { HttpError } from "../utils/httpError";

export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    const candidate = error.code ? (ErrorCatalog as Record<string, (typeof ErrorCatalog)[keyof typeof ErrorCatalog]>)[error.code] : undefined;
    const catalogError = candidate ?? ErrorCatalog.INTERNAL_ERROR;
    sendError(res, catalogError);
    return;
  }

  sendError(res, ErrorCatalog.INTERNAL_ERROR, process.env.NODE_ENV === "production" ? undefined : { cause: (error as Error).message });
}
