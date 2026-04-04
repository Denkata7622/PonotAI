import { Request, Response } from "express";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import { addHistoryEntry } from "../history/history.service";
import { MissingProviderConfigError, NoVerifiedResultError } from "./providers/audd.provider";
import { recognizeSongFromAudio, recognizeSongFromImage } from "./recognition.service";

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

/**
 * Accepts an uploaded audio file and returns normalized recognition metadata.
 * @route POST /api/recognition/audio
 * @auth No authentication required.
 * @example curl -F "audio=@clip.webm" http://localhost:4000/api/recognition/audio
 * @param req Express multipart request with an `audio` file field.
 * @param res Express response returning normalized song metadata.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected provider/storage failures through shared error handler.
 */
export async function recognizeAudioController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, ErrorCatalog.AUDIO_FILE_REQUIRED);
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
    handleRecognitionError(res, error, "AUDIO_RECOGNITION_FAILED");
  }
}

/**
 * Accepts an uploaded image and returns one or more recognized song candidates.
 * @route POST /api/recognition/image
 * @auth No authentication required.
 * @example curl -F "image=@playlist.png" -F "language=eng" http://localhost:4000/api/recognition/image
 * @param req Express multipart request with an `image` file and optional `language`.
 * @param res Express response returning recognized song candidates.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected provider/storage failures through shared error handler.
 */
export async function recognizeImageController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, ErrorCatalog.IMAGE_FILE_REQUIRED);
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
    handleRecognitionError(res, error, "IMAGE_RECOGNITION_FAILED");
  }
}
