import type { CorsOptions } from "cors";

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveAllowedOrigins(): string[] {
  const defaultOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://trackly-production.up.railway.app",
  ];
  const envOrigins = [
    ...splitCsv(process.env.ALLOWED_ORIGINS),
    ...splitCsv(process.env.CORS_ORIGINS),
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim()] : []),
    ...splitCsv(process.env.FRONTEND_URLS),
  ];

  return Array.from(new Set([...defaultOrigins, ...envOrigins]));
}

export function getCorsOptions(): CorsOptions {
  return {
  origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
    const allowedOrigins = resolveAllowedOrigins();
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "authorization",
    "content-type",
    "X-Request-ID",
    "X-Response-Time",
    "X-Trackly-Queue",
    "x-trackly-queue",
    "X-Trackly-Theme",
    "x-trackly-theme",
    "X-Trackly-Language",
    "x-trackly-language",
    "X-Trackly-Preferences",
    "x-trackly-preferences",
    "X-Trackly-Device",
    "x-trackly-device",
    "X-Api-Key",
    "x-api-key",
    "x-recognition-attempt-id",
    "X-Recognition-Attempt-Id",
    "x-requested-with",
  ],
  exposedHeaders: ["X-Response-Time", "X-Request-ID"],
  optionsSuccessStatus: 204,
  };
}
