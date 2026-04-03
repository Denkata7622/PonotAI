import type { Request, Response } from "express";

export type ErrorCode =
  | "INTERNAL_SERVER_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_PAYLOAD"
  | "INVALID_USERNAME"
  | "INVALID_EMAIL"
  | "WEAK_PASSWORD"
  | "USERNAME_TAKEN"
  | "EMAIL_TAKEN"
  | "INVALID_CREDENTIALS"
  | "INVALID_PASSWORD"
  | "INVALID_NAME"
  | "MISSING_SONG_INFO"
  | "METHOD_REQUIRED"
  | "NO_VERIFIED_RESULT"
  | "PROVIDER_CONFIG_ERROR"
  | "AUDIO_FILE_REQUIRED"
  | "IMAGE_FILE_REQUIRED"
  | "AUDIO_RECOGNITION_FAILED"
  | "IMAGE_RECOGNITION_FAILED"
  | "TOO_MANY_RECOGNITION_REQUESTS"
  | "TOO_MANY_LOGIN_ATTEMPTS"
  | "RATE_LIMIT_EXCEEDED"
  | "SYNC_FAILED"
  | "GET_LIBRARY_FAILED"
  | "CREATE_FAILED"
  | "GET_FAILED"
  | "UPDATE_FAILED"
  | "ADD_SONG_FAILED"
  | "REMOVE_SONG_FAILED"
  | "DELETE_FAILED";

export type StandardErrorResponse = {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
  retryAfter?: number;
};

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INTERNAL_SERVER_ERROR: "Internal server error.",
  UNAUTHORIZED: "Authentication is required.",
  FORBIDDEN: "You do not have access to this resource.",
  NOT_FOUND: "Requested resource was not found.",
  INVALID_PAYLOAD: "Request payload is invalid.",
  INVALID_USERNAME: "Username format is invalid.",
  INVALID_EMAIL: "Email format is invalid.",
  WEAK_PASSWORD: "Password must be at least 8 characters.",
  USERNAME_TAKEN: "Username is already taken.",
  EMAIL_TAKEN: "Email is already taken.",
  INVALID_CREDENTIALS: "Invalid email or password.",
  INVALID_PASSWORD: "Password change payload is invalid.",
  INVALID_NAME: "Name is required.",
  MISSING_SONG_INFO: "Song title and artist are required.",
  METHOD_REQUIRED: "Recognition method is required.",
  NO_VERIFIED_RESULT: "No verified result found.",
  PROVIDER_CONFIG_ERROR: "Recognition provider is not configured correctly.",
  AUDIO_FILE_REQUIRED: "Audio file is required in field 'audio'.",
  IMAGE_FILE_REQUIRED: "Image file is required in field 'image'.",
  AUDIO_RECOGNITION_FAILED: "Audio recognition failed.",
  IMAGE_RECOGNITION_FAILED: "Image recognition failed.",
  TOO_MANY_RECOGNITION_REQUESTS: "Too many recognition requests. Please retry in a minute.",
  TOO_MANY_LOGIN_ATTEMPTS: "Too many login attempts. Please retry later.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please try again later.",
  SYNC_FAILED: "Library sync failed.",
  GET_LIBRARY_FAILED: "Failed to load library.",
  CREATE_FAILED: "Creation failed.",
  GET_FAILED: "Failed to fetch resource.",
  UPDATE_FAILED: "Update failed.",
  ADD_SONG_FAILED: "Failed to add song.",
  REMOVE_SONG_FAILED: "Failed to remove song.",
  DELETE_FAILED: "Deletion failed.",
};

function resolveRequestId(req: Request): string | undefined {
  const raw = req.headers["x-request-id"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return undefined;
}

export function buildErrorResponse(
  req: Request,
  code: ErrorCode,
  options?: { message?: string; details?: unknown; retryAfter?: number },
): StandardErrorResponse {
  return {
    code,
    message: options?.message ?? ERROR_MESSAGES[code],
    ...(options?.details !== undefined ? { details: options.details } : {}),
    ...(resolveRequestId(req) ? { requestId: resolveRequestId(req) } : {}),
    ...(options?.retryAfter !== undefined ? { retryAfter: options.retryAfter } : {}),
  };
}

export function sendError(
  req: Request,
  res: Response,
  statusCode: number,
  code: ErrorCode,
  options?: { message?: string; details?: unknown; retryAfter?: number },
): void {
  res.status(statusCode).json(buildErrorResponse(req, code, options));
}
