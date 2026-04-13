import crypto from "node:crypto";
import { Router } from "express";
import { createApiKey, listApiKeysByUser, revokeApiKey } from "../../db/authStore";
import { requireAuth } from "../../middlewares/auth.middleware";
import { hashApiKey, requireDeveloperApiKey } from "../../middlewares/apiKey.middleware";
import { recognizeSongFromAudioByMode } from "../recognition/recognition.service";
import { audioUpload } from "../../middlewares/upload.middleware";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";

const developerRouter = Router();

function generateRawKey(): string {
  return `trk_${crypto.randomBytes(18).toString("hex")}`;
}

developerRouter.get("/keys", requireAuth, async (req, res) => {
  const keys = await listApiKeysByUser(req.userId!);
  res.status(200).json({
    items: keys.map((key) => ({
      id: key.id,
      label: key.label,
      keyPrefix: key.keyPrefix,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
    })),
  });
});

developerRouter.post("/keys", requireAuth, async (req, res) => {
  const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 60) : "Default App";
  const rawKey = generateRawKey();
  const keyPrefix = rawKey.slice(0, 14);
  await createApiKey({
    userId: req.userId!,
    label,
    keyPrefix,
    keyHash: hashApiKey(rawKey),
  });
  res.status(201).json({ apiKey: rawKey, keyPrefix, label, warning: "Store this key securely. It will not be shown again." });
});

developerRouter.delete("/keys/:id", requireAuth, async (req, res) => {
  const ok = await revokeApiKey(req.userId!, req.params.id);
  if (!ok) return void sendError(res, ErrorCatalog.NOT_FOUND);
  res.status(200).json({ ok: true });
});

// Public developer API endpoints (x-api-key auth)
developerRouter.post("/v1/recognition/audio", requireDeveloperApiKey, audioUpload.single("audio"), async (req, res) => {
  if (!req.file) return void sendError(res, ErrorCatalog.AUDIO_FILE_REQUIRED);
  const mode = req.body?.mode === "live" || req.body?.mode === "humming" ? req.body.mode : "standard";
  const attemptId = typeof req.headers["x-recognition-attempt-id"] === "string" ? req.headers["x-recognition-attempt-id"] : undefined;
  const result = await recognizeSongFromAudioByMode(req.file.buffer, req.file.originalname, mode, req.userId, attemptId);
  res.status(200).json({ data: result, mode });
});

developerRouter.get("/v1/recommendations", requireDeveloperApiKey, async (req, res) => {
  const seed = typeof req.query.seed === "string" ? req.query.seed.toLowerCase() : "";
  const recommendations = [
    { title: "Blinding Lights", artist: "The Weeknd" },
    { title: "Numb", artist: "Linkin Park" },
    { title: "Levitating", artist: "Dua Lipa" },
  ].filter((item) => !seed || `${item.title} ${item.artist}`.toLowerCase().includes(seed));
  res.status(200).json({ items: recommendations });
});

export default developerRouter;
