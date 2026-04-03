import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { readFileSync } from "node:fs";
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
import { corsOptions } from "./config/cors";

const app = express();
const YAML = require("js-yaml");
const swaggerUi = require("swagger-ui-express");
const openApiSpec = YAML.load(readFileSync(path.resolve(__dirname, "..", "openapi.yaml"), "utf8"));


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
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
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

app.use(errorMiddleware);

registerProcessErrorHandlers();

export default app;
