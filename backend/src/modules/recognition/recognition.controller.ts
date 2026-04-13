import { Request, Response } from "express";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import { addHistoryEntry, addUserHistoryEntry } from "../history/history.service";
import { MissingProviderConfigError, NoVerifiedResultError } from "./providers/audd.provider";
import { recognizeSongFromAudioByMode, recognizeSongFromImage, type RecognitionMode } from "./recognition.service";
import { recalculateAchievementsForUser } from "../achievements/achievements.service";

function handleRecognitionError(
  res: Response,
  error: unknown,
  code: "AUDIO_RECOGNITION_FAILED" | "IMAGE_RECOGNITION_FAILED",
): void {
  if (error instanceof NoVerifiedResultError) {
    sendError(res, ErrorCatalog.NO_VERIFIED_RESULT);
    return;
  }

  if (error instanceof MissingProviderConfigError) {
    sendError(res, ErrorCatalog.PROVIDER_CONFIG_ERROR);
    return;
  }

  const errorKey = code === "AUDIO_RECOGNITION_FAILED" ? ErrorCatalog.AUDIO_RECOGNITION_FAILED : ErrorCatalog.IMAGE_RECOGNITION_FAILED;
  sendError(res, errorKey, process.env.NODE_ENV === "production" ? undefined : { cause: (error as Error).message });
}

function resolveMode(input: unknown): RecognitionMode {
  if (input === "live" || input === "humming" || input === "video") return input;
  return "standard";
}

async function persistRecognitionForUser(req: Request, metadata: { songName: string; artist: string; album?: string; }): Promise<void> {
  if (!req.userId) return;
  await addUserHistoryEntry(req.userId, {
    method: "recognition",
    title: metadata.songName,
    artist: metadata.artist,
    album: metadata.album,
    recognized: true,
  });
  await recalculateAchievementsForUser(req.userId);
}

async function safePersistRecognition(req: Request, metadata: { songName: string; artist: string; album?: string; youtubeVideoId?: string; }): Promise<string[]> {
  const warnings: string[] = [];
  try {
    await addHistoryEntry({
      songName: metadata.songName,
      artist: metadata.artist,
      youtubeVideoId: metadata.youtubeVideoId,
    });
  } catch (error) {
    warnings.push("History persistence unavailable; recognition result returned without storage.");
    console.warn("[recognition] Failed to persist global history", error);
  }

  try {
    await persistRecognitionForUser(req, metadata);
  } catch (error) {
    warnings.push("User history persistence unavailable; recognition result returned without storage.");
    console.warn("[recognition] Failed to persist user history", error);
  }

  return warnings;
}

export async function recognizeAudioController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, ErrorCatalog.AUDIO_FILE_REQUIRED);
      return;
    }

    if (!req.file.buffer?.length || !req.file.mimetype?.startsWith("audio/")) {
      sendError(res, ErrorCatalog.INVALID_PAYLOAD, { message: "Audio upload must include a non-empty audio/* file" });
      return;
    }

    const mode = resolveMode(req.body?.mode);
    const attemptId = typeof req.headers["x-recognition-attempt-id"] === "string" ? req.headers["x-recognition-attempt-id"] : undefined;
    const metadata = await recognizeSongFromAudioByMode(req.file.buffer, req.file.originalname, mode, req.userId, attemptId);
    const persistenceWarnings = await safePersistRecognition(req, metadata);

    res.status(200).json({
      ...metadata,
      mode,
      notes: [
        ...(mode === "humming"
        ? ["Humming mode works best with a clear short melody."]
        : mode === "video"
          ? ["Video input recognized via audio track extraction path."]
          : mode === "live"
            ? ["Difficult mode enabled: uses bounded multi-clip checks."]
            : []),
        ...persistenceWarnings,
      ],
    });
  } catch (error) {
    handleRecognitionError(res, error, "AUDIO_RECOGNITION_FAILED");
  }
}

export async function recognizeImageController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, ErrorCatalog.IMAGE_FILE_REQUIRED);
      return;
    }

    if (!req.file.buffer?.length || !req.file.mimetype?.startsWith("image/")) {
      sendError(res, ErrorCatalog.INVALID_PAYLOAD, { message: "Image upload must include a non-empty image/* file" });
      return;
    }

    const language = typeof req.body?.language === "string" ? req.body.language : undefined;
    const parsedMaxSongs = Number.parseInt(String(req.body?.maxSongs ?? ""), 10);
    const maxSongs = Number.isFinite(parsedMaxSongs) ? Math.max(1, Math.min(20, parsedMaxSongs)) : 5;

    const result = await recognizeSongFromImage(req.file.buffer, language, req.file.mimetype, maxSongs);

    const persistenceWarnings: string[] = [];
    for (const song of result.songs) {
      try {
        await addHistoryEntry({
          songName: song.songName,
          artist: song.artist,
          youtubeVideoId: song.youtubeVideoId,
        });
      } catch (error) {
        persistenceWarnings.push("History persistence unavailable; OCR results returned without storage.");
        console.warn("[recognition] Failed to persist OCR history entry", error);
        break;
      }
    }

    res.status(200).json({
      songs: result.songs,
      count: result.songs.length,
      language: language ?? "eng",
      warnings: [...result.warnings, ...persistenceWarnings],
      ocrPath: result.ocrPath,
    });
  } catch (error) {
    handleRecognitionError(res, error, "IMAGE_RECOGNITION_FAILED");
  }
}
