import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { Request, Response } from "express";
import { errorMiddleware } from "./middlewares/error.middleware";
import authRouter from "./modules/auth/auth.routes";
import historyRouter from "./modules/history/history.routes";
import favoritesRouter from "./modules/favorites/favorites.routes";
import shareRouter from "./modules/share/share.routes";
import libraryRouter from "./modules/library/library.routes";
import playlistsRouter from "./modules/playlists/playlists.routes";
import recognitionRouter from "./modules/recognition/recognition.routes";
import statsRouter from "./modules/stats/stats.routes";
import { apiRateLimit, recognitionRateLimit } from "./middlewares/rateLimit.middleware";
import { responseTimeMiddleware } from "./middlewares/responseTime.middleware";
import assistantRouter from "./routes/assistant";

const app = express();
const YAML = require("js-yaml");
const swaggerUi = require("swagger-ui-express");
const openApiPathCandidates = [
  path.join(__dirname, "..", "openapi.yaml"),
  path.join(__dirname, "../../openapi.yaml"),
];
const openApiPath = openApiPathCandidates.find((candidate) => existsSync(candidate)) ?? openApiPathCandidates[0];
const openApiSpec = YAML.load(readFileSync(openApiPath, "utf8"));


let processHandlersRegistered = false;

function registerProcessErrorHandlers(): void {
  if (processHandlersRegistered) return;
  processHandlersRegistered = true;

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
  });
}

app.use(
  helmet({
    hsts: true,
    noSniff: true,
    // Equivalent to an XSS filter header where supported.
    xXssProtection: true,
    frameguard: { action: "deny" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
      },
    },
  }),
);
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
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
      "x-trackly-queue",
      "x-trackly-theme",
      "x-trackly-language",
    ],
    exposedHeaders: ["X-Response-Time", "X-Request-ID"],
  }),
);

// Handle preflight for all routes
app.options("*", cors());
app.use(express.json());
app.use(responseTimeMiddleware);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use("/api", apiRateLimit);
app.use("/api/recognition", recognitionRateLimit, recognitionRouter);
app.use("/api/history", historyRouter);
app.use("/api/auth", authRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/share", shareRouter);
app.use("/api/library", libraryRouter);
app.use("/api/playlists", playlistsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/assistant", assistantRouter);

app.use(errorMiddleware);

registerProcessErrorHandlers();

export default app;
