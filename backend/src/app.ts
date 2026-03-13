import cors from "cors";
import express from "express";
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
import { recognitionRateLimit } from "./middlewares/rateLimit.middleware";

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : ["http://localhost:3000"];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
};

const app = express();

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use("/api/recognition", recognitionRateLimit, recognitionRouter);
app.use("/api/history", historyRouter);
app.use("/api/auth", authRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/share", shareRouter);
app.use("/api/library", libraryRouter);
app.use("/api/playlists", playlistsRouter);
app.use("/api/stats", statsRouter);

app.use(errorMiddleware);

export default app;
