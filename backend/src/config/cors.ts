import type { CorsOptions } from "cors";

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isWildcardOrigin(origin: string): boolean {
  return origin === "*";
}

export const KNOWN_FRONTEND_ORIGINS = [
  "https://ponotai-production.up.railway.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;

export function resolveAllowedOrigins(): string[] {
  const isProduction = process.env.NODE_ENV === "production";
  const devOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
  ];
  const envOrigins = [
    ...splitCsv(process.env.ALLOWED_ORIGINS),
    ...splitCsv(process.env.CORS_ORIGINS),
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim()] : []),
    ...splitCsv(process.env.FRONTEND_URLS),
  ];

  const productionDefaults = isProduction ? [KNOWN_FRONTEND_ORIGINS[0]] : [];
  const configured = Array.from(new Set([...productionDefaults, ...(isProduction ? [] : devOrigins), ...envOrigins]));
  return configured.filter((origin) => !isWildcardOrigin(origin));
}

export function getCorsDiagnostics() {
  const allowedOrigins = resolveAllowedOrigins();
  return {
    credentials: true,
    allowedOrigins,
    allowedOriginCount: allowedOrigins.length,
    wildcardWithCredentials: false,
  };
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
