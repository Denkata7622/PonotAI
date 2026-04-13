import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ErrorCatalog, sendError } from "../errors/errorCatalog";
import { HttpError } from "../utils/httpError";

export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    const candidate = error.code ? (ErrorCatalog as Record<string, (typeof ErrorCatalog)[keyof typeof ErrorCatalog]>)[error.code] : undefined;
    const catalogError = candidate ?? ErrorCatalog.INTERNAL_ERROR;
    sendError(res, catalogError);
    return;
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

  sendError(res, ErrorCatalog.INTERNAL_ERROR, process.env.NODE_ENV === "production" ? undefined : { cause: (error as Error).message });
}
