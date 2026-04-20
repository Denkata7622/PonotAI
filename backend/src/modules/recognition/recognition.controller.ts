import { Request, Response } from "express";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import { addUserHistoryEntry } from "../history/history.service";
import { MissingProviderConfigError, NoVerifiedResultError } from "./providers/audd.provider";
import { recognizeSongFromAudioByMode, recognizeSongFromImage, type RecognitionMode, type SongMetadata } from "./recognition.service";
import { recalculateAchievementsForUser } from "../achievements/achievements.service";
import { validateAudioUpload, validateImageUpload, validateVideoUpload } from "../../middlewares/fileValidation";
import { normalizeTrackKey } from "../../utils/songIdentity";
import { queueSongTasteAnalysis } from "../songTaster/songTaster.service";

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
  await queueSongTasteAnalysis({
    title: metadata.songName,
    artist: metadata.artist,
  });
}

async function safePersistRecognition(req: Request, metadata: { songName: string; artist: string; album?: string; }): Promise<string[]> {
  const warnings: string[] = [];

  try {
    await persistRecognitionForUser(req, metadata);
  } catch (error) {
    warnings.push("User history persistence unavailable; recognition result returned without storage.");
    console.warn("[recognition] Failed to persist user history", error);
  }

  return warnings;
}

type UploadedImageBatch = {
  uploadedImages: Express.Multer.File[];
  truncated: boolean;
};

export function collectUploadedImageFiles(req: Request, maxImages: number): UploadedImageBatch {
  const multerFiles = (req.files && !Array.isArray(req.files)) ? req.files : undefined;
  const singleImage = req.file ? [req.file] : [];
  const imagesFromImageField = multerFiles?.image ?? [];
  const imagesFromImagesField = multerFiles?.images ?? [];
  const uploadedImages = [...singleImage, ...imagesFromImageField, ...imagesFromImagesField];
  return {
    uploadedImages: uploadedImages.slice(0, maxImages),
    truncated: uploadedImages.length > maxImages,
  };
}

export function dedupeCombinedOcrSongs(songs: SongMetadata[], maxSongs: number): SongMetadata[] {
  return songs
    .map((song, index) => ({ song, index }))
    .reduce<Array<{ song: SongMetadata; index: number }>>((acc, current) => {
      const existingIndex = acc.findIndex((item) => normalizeTrackKey(item.song.songName, item.song.artist) === normalizeTrackKey(current.song.songName, current.song.artist));
      if (existingIndex === -1) {
        acc.push(current);
        return acc;
      }
      const existing = acc[existingIndex];
      if (!existing || current.song.confidenceScore > existing.song.confidenceScore) {
        acc[existingIndex] = current;
      }
      return acc;
    }, [])
    .sort((a, b) => {
      if (b.song.confidenceScore !== a.song.confidenceScore) return b.song.confidenceScore - a.song.confidenceScore;
      return a.index - b.index;
    })
    .map((item) => item.song)
    .slice(0, maxSongs);
}

export async function recognizeAudioController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, ErrorCatalog.AUDIO_FILE_REQUIRED);
      return;
    }

    const mode = resolveMode(req.body?.mode);
    if (mode === "video") {
      if (!validateVideoUpload(req.file, res)) return;
    } else if (!validateAudioUpload(req.file, res)) {
      return;
    }
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
    const parsedMaxImages = Number.parseInt(String(req.body?.maxImages ?? ""), 10);
    const maxImages = Number.isFinite(parsedMaxImages) ? Math.max(1, Math.min(12, parsedMaxImages)) : 12;
    const { uploadedImages, truncated } = collectUploadedImageFiles(req, maxImages);

    if (uploadedImages.length === 0) {
      sendError(res, ErrorCatalog.IMAGE_FILE_REQUIRED);
      return;
    }

    const language = typeof req.body?.language === "string" ? req.body.language : undefined;
    const parsedMaxSongs = Number.parseInt(String(req.body?.maxSongs ?? ""), 10);
    const maxSongs = Number.isFinite(parsedMaxSongs) ? Math.max(1, Math.min(20, parsedMaxSongs)) : 5;
    const imageFiles = uploadedImages;

    const aggregatedWarnings: string[] = [];
    const combinedSongs: SongMetadata[] = [];
    const perImage: Array<{
      fileName: string;
      fileIndex: number;
      accepted: boolean;
      warning?: string;
      ocrPath?: "ai_primary" | "tesseract_plus_gemma";
      songCount?: number;
    }> = [];

    for (const [index, file] of imageFiles.entries()) {
      if (!validateImageUpload(file, res)) {
        return;
      }
      try {
        const result = await recognizeSongFromImage(file.buffer, language, file.mimetype, maxSongs);
        combinedSongs.push(...result.songs);
        aggregatedWarnings.push(...result.warnings);
        perImage.push({
          fileName: file.originalname,
          fileIndex: index,
          accepted: true,
          ocrPath: result.ocrPath,
          songCount: result.songs.length,
        });
      } catch (error) {
        if (error instanceof NoVerifiedResultError) {
          perImage.push({
            fileName: file.originalname,
            fileIndex: index,
            accepted: false,
            warning: "OCR_NO_MATCHES",
          });
          aggregatedWarnings.push(`OCR_IMAGE_FAILED:${index}:NO_VERIFIED_RESULT`);
          continue;
        }
        throw error;
      }
    }

    if (combinedSongs.length === 0) {
      sendError(res, ErrorCatalog.NO_VERIFIED_RESULT, {
        message: "No plausible OCR song matches were found in any uploaded image.",
        perImage,
      });
      return;
    }

    const dedupedSongs = dedupeCombinedOcrSongs(combinedSongs, maxSongs);

    const persistenceWarnings: string[] = [];
    if (req.userId) {
      const persistedKeys = new Set<string>();
      for (const song of dedupedSongs) {
        const dedupeKey = `${normalizeTrackKey(song.songName, song.artist)}|||${song.youtubeVideoId ?? ""}`;
        if (persistedKeys.has(dedupeKey)) continue;
        persistedKeys.add(dedupeKey);
        try {
          await persistRecognitionForUser(req, { songName: song.songName, artist: song.artist, album: song.album });
        } catch (error) {
          persistenceWarnings.push("User history persistence unavailable; OCR results returned without storage.");
          console.warn("[recognition] Failed to persist OCR user history entry", error);
          break;
        }
      }
    }

    res.status(200).json({
      songs: dedupedSongs,
      count: dedupedSongs.length,
      language: language ?? "eng",
      warnings: [...new Set([
        ...aggregatedWarnings,
        ...(truncated ? ["OCR_IMAGE_BATCH_TRUNCATED"] : []),
        ...persistenceWarnings,
      ])],
      ocrPath: perImage.some((entry) => entry.ocrPath === "tesseract_plus_gemma") ? "tesseract_plus_gemma" : "ai_primary",
      batch: {
        uploadedCount: uploadedImages.length,
        processedCount: imageFiles.length,
        succeededCount: perImage.filter((entry) => entry.accepted).length,
        failedCount: perImage.filter((entry) => !entry.accepted).length,
        dedupedCount: dedupedSongs.length,
        perImage,
      },
    });
  } catch (error) {
    handleRecognitionError(res, error, "IMAGE_RECOGNITION_FAILED");
  }
}
