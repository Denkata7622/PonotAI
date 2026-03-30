import { Request, Response } from "express";
import { sendError } from "../../errors/errorCatalog";
import { addHistoryEntry } from "../history/history.service";
import { MissingProviderConfigError, NoVerifiedResultError } from "./providers/audd.provider";
import { recognizeSongFromAudio, recognizeSongFromImage } from "./recognition.service";

function handleRecognitionError(req: Request, res: Response, error: unknown, code: "AUDIO_RECOGNITION_FAILED" | "IMAGE_RECOGNITION_FAILED"): void {
  if (error instanceof NoVerifiedResultError) {
    sendError(req, res, 404, "NO_VERIFIED_RESULT", {
      message: error.message,
    });
    return;
  }

  if (error instanceof MissingProviderConfigError) {
    sendError(req, res, 500, "PROVIDER_CONFIG_ERROR", {
      message: error.message,
    });
    return;
  }

  sendError(req, res, 500, code, {
    details: (error as Error).message,
  });
}

export async function recognizeAudioController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      sendError(req, res, 400, "AUDIO_FILE_REQUIRED");
      return;
    }

    const metadata = await recognizeSongFromAudio(req.file.buffer, req.file.originalname);
    await addHistoryEntry({
      songName: metadata.songName,
      artist: metadata.artist,
      youtubeVideoId: metadata.youtubeVideoId,
    });
    res.status(200).json(metadata);
  } catch (error) {
    handleRecognitionError(req, res, error, "AUDIO_RECOGNITION_FAILED");
  }
}

export async function recognizeImageController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      sendError(req, res, 400, "IMAGE_FILE_REQUIRED");
      return;
    }

    const language = typeof req.body?.language === "string" ? req.body.language : undefined;
    // maxSongs is accepted for backwards compatibility but not used by the deterministic OCR pipeline.
    void req.body?.maxSongs;

    const songs = await recognizeSongFromImage(req.file.buffer, language);

    for (const song of songs) {
      await addHistoryEntry({
        songName: song.songName,
        artist: song.artist,
        youtubeVideoId: song.youtubeVideoId,
      });
    }

    res.status(200).json({
      songs,
      count: songs.length,
      language: language ?? "eng",
    });
  } catch (error) {
    handleRecognitionError(req, res, error, "IMAGE_RECOGNITION_FAILED");
  }
}
