import type { Response } from "express";

export interface AppError {
  code: string;
  message: string;
  httpStatus: number;
}

export const ErrorCatalog = {
  // Auth
  UNAUTHORIZED: { code: "UNAUTHORIZED", message: "Authentication required", httpStatus: 401 },
  FORBIDDEN: { code: "FORBIDDEN", message: "Insufficient permissions", httpStatus: 403 },
  INVALID_CREDENTIALS: { code: "INVALID_CREDENTIALS", message: "Invalid email or password", httpStatus: 401 },
  TOKEN_EXPIRED: { code: "TOKEN_EXPIRED", message: "Session expired, please log in again", httpStatus: 401 },

  // Validation
  VALIDATION_ERROR: { code: "VALIDATION_ERROR", message: "Invalid request data", httpStatus: 400 },
  MISSING_REQUIRED_FIELD: { code: "MISSING_REQUIRED_FIELD", message: "Required field missing", httpStatus: 400 },
  INVALID_PAYLOAD: { code: "INVALID_PAYLOAD", message: "Invalid request payload", httpStatus: 400 },
  INVALID_USERNAME: { code: "INVALID_USERNAME", message: "Username format is invalid", httpStatus: 400 },
  INVALID_EMAIL: { code: "INVALID_EMAIL", message: "Email format is invalid", httpStatus: 400 },
  WEAK_PASSWORD: { code: "WEAK_PASSWORD", message: "Password must be at least 8 characters", httpStatus: 400 },
  INVALID_PASSWORD: { code: "INVALID_PASSWORD", message: "Password change payload is invalid", httpStatus: 400 },
  INVALID_NAME: { code: "INVALID_NAME", message: "Name is required", httpStatus: 400 },
  MISSING_SONG_INFO: { code: "MISSING_SONG_INFO", message: "Song title and artist are required", httpStatus: 400 },
  METHOD_REQUIRED: { code: "METHOD_REQUIRED", message: "Recognition method is required", httpStatus: 400 },
  AUDIO_FILE_REQUIRED: { code: "AUDIO_FILE_REQUIRED", message: "Audio file is required in field 'audio'", httpStatus: 400 },
  IMAGE_FILE_REQUIRED: { code: "IMAGE_FILE_REQUIRED", message: "Image file is required in field 'image'", httpStatus: 400 },
  USERNAME_TAKEN: { code: "USERNAME_TAKEN", message: "Username is already taken", httpStatus: 409 },
  EMAIL_TAKEN: { code: "EMAIL_TAKEN", message: "Email is already taken", httpStatus: 409 },

  // Recognition
  RECOGNITION_FAILED: { code: "RECOGNITION_FAILED", message: "Could not recognize audio or image", httpStatus: 422 },
  RECOGNITION_PROVIDER_ERROR: {
    code: "RECOGNITION_PROVIDER_ERROR",
    message: "Recognition service unavailable",
    httpStatus: 503,
  },
  NO_VERIFIED_RESULT: { code: "NO_VERIFIED_RESULT", message: "No verified result found", httpStatus: 404 },
  PROVIDER_CONFIG_ERROR: {
    code: "PROVIDER_CONFIG_ERROR",
    message: "Recognition provider is not configured correctly",
    httpStatus: 500,
  },
  AUDIO_RECOGNITION_FAILED: { code: "AUDIO_RECOGNITION_FAILED", message: "Audio recognition failed", httpStatus: 500 },
  IMAGE_RECOGNITION_FAILED: { code: "IMAGE_RECOGNITION_FAILED", message: "Image recognition failed", httpStatus: 500 },

  // Library
  TRACK_NOT_FOUND: { code: "TRACK_NOT_FOUND", message: "Track not found in library", httpStatus: 404 },
  PLAYLIST_NOT_FOUND: { code: "PLAYLIST_NOT_FOUND", message: "Playlist not found", httpStatus: 404 },
  DUPLICATE_TRACK: {
    code: "DUPLICATE_TRACK",
    message: "Track already exists in this collection",
    httpStatus: 409,
  },
  NOT_FOUND: { code: "NOT_FOUND", message: "Requested resource was not found", httpStatus: 404 },

  // API/Quota
  QUOTA_EXCEEDED: { code: "QUOTA_EXCEEDED", message: "API quota exceeded, please try again later", httpStatus: 429 },
  RATE_LIMIT_EXCEEDED: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests", httpStatus: 429 },
  TOO_MANY_RECOGNITION_REQUESTS: {
    code: "TOO_MANY_RECOGNITION_REQUESTS",
    message: "Too many recognition requests. Please retry in a minute",
    httpStatus: 429,
  },
  TOO_MANY_LOGIN_ATTEMPTS: {
    code: "TOO_MANY_LOGIN_ATTEMPTS",
    message: "Too many login attempts. Please retry later",
    httpStatus: 429,
  },

  // Server
  INTERNAL_ERROR: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", httpStatus: 500 },
  SERVICE_UNAVAILABLE: { code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable", httpStatus: 503 },
  INTERNAL_SERVER_ERROR: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error", httpStatus: 500 },
  SYNC_FAILED: { code: "SYNC_FAILED", message: "Library sync failed", httpStatus: 500 },
  GET_LIBRARY_FAILED: { code: "GET_LIBRARY_FAILED", message: "Failed to load library", httpStatus: 500 },
  CREATE_FAILED: { code: "CREATE_FAILED", message: "Creation failed", httpStatus: 500 },
  GET_FAILED: { code: "GET_FAILED", message: "Failed to fetch resource", httpStatus: 500 },
  UPDATE_FAILED: { code: "UPDATE_FAILED", message: "Update failed", httpStatus: 500 },
  ADD_SONG_FAILED: { code: "ADD_SONG_FAILED", message: "Failed to add song", httpStatus: 500 },
  REMOVE_SONG_FAILED: { code: "REMOVE_SONG_FAILED", message: "Failed to remove song", httpStatus: 500 },
  DELETE_FAILED: { code: "DELETE_FAILED", message: "Deletion failed", httpStatus: 500 },

  // Assistant
  ASSISTANT_CONTEXT_BUILD_FAILED: {
    code: "ASSISTANT_CONTEXT_BUILD_FAILED",
    message: "Could not build assistant context",
    httpStatus: 500,
  },
  AI_SERVICE_UNAVAILABLE: {
    code: "AI_SERVICE_UNAVAILABLE",
    message: "AI service is temporarily unavailable",
    httpStatus: 503,
  },
} as const satisfies Record<string, AppError>;

export type ErrorCatalogKey = keyof typeof ErrorCatalog;

export type StandardErrorResponse = {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
};

export function sendError(
  res: Response,
  errorKey: AppError,
  details?: unknown,
  requestId?: string,
): void {
  const headerRequestId = res.req?.headers["x-request-id"];
  const resolvedRequestId =
    requestId ||
    (typeof headerRequestId === "string" && headerRequestId.trim()
      ? headerRequestId.trim()
      : Array.isArray(headerRequestId) && headerRequestId[0]?.trim()
        ? headerRequestId[0].trim()
        : undefined);

  const response: StandardErrorResponse = {
    code: errorKey.code,
    message: errorKey.message,
    ...(details !== undefined ? { details } : {}),
    ...(resolvedRequestId ? { requestId: resolvedRequestId } : {}),
  };

  res.status(errorKey.httpStatus).json(response);
}
