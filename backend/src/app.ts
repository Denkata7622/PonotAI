import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import { corsOptions } from "./config/cors";
import { errorMiddleware } from "./middlewares/error.middleware";
import authRouter from "./modules/auth/auth.routes";
import historyRouter from "./modules/history/history.routes";
import favoritesRouter from "./modules/favorites/favorites.routes";
import shareRouter from "./modules/share/share.routes";
import libraryRouter from "./modules/library/library.routes";
import playlistsRouter from "./modules/playlists/playlists.routes";
import recognitionRouter from "./modules/recognition/recognition.routes";
import { recognitionRateLimit } from "./middlewares/rateLimit.middleware";

const app = express();

app.use(cors(corsOptions));
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// recognitionRateLimit: 30 requests/minute per IP — see middlewares/rateLimit.middleware.ts
app.use("/api/recognition", recognitionRateLimit, recognitionRouter);
app.use("/api/history", historyRouter);
app.use("/api/auth", authRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/share", shareRouter);
app.use("/api/library", libraryRouter);
app.use("/api/playlists", playlistsRouter);

app.use(errorMiddleware);

export default app;
