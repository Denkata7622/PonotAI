import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ErrorCatalog, sendError } from "../errors/errorCatalog";
import { HttpError } from "../utils/httpError";

function isJsonParseError(error: unknown): boolean {
  if (!(error instanceof SyntaxError) || !error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; statusCode?: unknown; type?: unknown; body?: unknown };
  return (candidate.status === 400 || candidate.statusCode === 400)
    && candidate.type === "entity.parse.failed"
    && candidate.body !== undefined;
}

export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    const candidate = error.code ? (ErrorCatalog as Record<string, (typeof ErrorCatalog)[keyof typeof ErrorCatalog]>)[error.code] : undefined;
    const catalogError = candidate ?? ErrorCatalog.INTERNAL_ERROR;
    sendError(res, catalogError);
    return;
  }

  const codedError = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : null;
  if (typeof codedError?.code === "string") {
    const candidate = (ErrorCatalog as Record<string, (typeof ErrorCatalog)[keyof typeof ErrorCatalog]>)[codedError.code];
    if (candidate) {
      sendError(res, candidate, typeof codedError.message === "string" ? { message: codedError.message } : undefined);
      return;
    }
  }


  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      sendError(res, ErrorCatalog.VALIDATION_ERROR, { code: error.code, field: error.field, message: "Uploaded file exceeds size limits" });
      return;
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      sendError(res, ErrorCatalog.INVALID_PAYLOAD, { code: error.code, field: error.field, message: "Unexpected upload field or file type" });
      return;
    }

    sendError(res, ErrorCatalog.INVALID_PAYLOAD, { code: error.code, field: error.field, message: error.message });
    return;
  }

  if (isJsonParseError(error)) {
    sendError(res, ErrorCatalog.INVALID_PAYLOAD, { message: "Request body must be valid JSON." });
    return;
  }

  console.error("[api-error]", error);
  sendError(res, ErrorCatalog.INTERNAL_ERROR, process.env.NODE_ENV === "production" ? undefined : { cause: (error as Error).message });
}
