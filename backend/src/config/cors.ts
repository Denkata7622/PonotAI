import type { CorsOptions } from "cors";

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const defaultOrigins = ["http://localhost:3000", "http://localhost:3001"];
const envOrigins = [
  ...splitCsv(process.env.ALLOWED_ORIGINS),
  ...splitCsv(process.env.CORS_ORIGINS),
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim()] : []),
];

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

export const corsOptions: CorsOptions = {
  origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Request-ID",
    "X-Response-Time",
    "X-Trackly-Queue",
    "X-Trackly-Theme",
    "X-Trackly-Language",
    "X-Trackly-Preferences",
    "X-Trackly-Device",
    "x-recognition-attempt-id",
  ],
  exposedHeaders: ["X-Response-Time", "X-Request-ID"],
  optionsSuccessStatus: 204,
};
