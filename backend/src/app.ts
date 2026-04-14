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
import achievementsRouter from "./modules/achievements/achievements.routes";
import searchRouter from "./modules/search/search.routes";
import developerRouter from "./modules/developer/developer.routes";
import adminRouter from "./modules/admin/admin.routes";
import { apiRateLimit, recognitionRateLimit } from "./middlewares/rateLimit.middleware";
import { responseTimeMiddleware } from "./middlewares/responseTime.middleware";
import { getCorsOptions } from "./config/cors";
import assistantRouter from "./routes/assistant";
import coverArtRouter from "./routes/coverArt";
import aiRouter from "./modules/ai/ai.routes";
import { getPersistenceHealth, refreshPersistenceHealth } from "./db/persistence";

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

const corsOptions = getCorsOptions();
app.use(cors(corsOptions));
// Handle preflight for all routes
app.options("*", cors(corsOptions));
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
app.use(express.json());
app.use(responseTimeMiddleware);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/api/health", async (_req: Request, res: Response) => {
  await refreshPersistenceHealth();
  const persistence = getPersistenceHealth();
  const db = persistence.connected ? "connected" : "disconnected";
  const ai = process.env.GEMINI_API_KEY?.trim() ? "ok" : "degraded";
  const status = db === "connected" ? "ok" : "partial";
  res.status(status === "ok" ? 200 : 503).json({
    db,
    ai,
    status,
    mode: persistence.mode,
    ...(persistence.lastError ? { error: persistence.lastError } : {}),
  });
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
app.use("/api/achievements", achievementsRouter);
app.use("/api/search", searchRouter);
app.use("/api/developer", developerRouter);
app.use("/api/admin", adminRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/ai", aiRouter);
app.use("/api/cover-art", coverArtRouter);

app.use(errorMiddleware);

registerProcessErrorHandlers();

export default app;
