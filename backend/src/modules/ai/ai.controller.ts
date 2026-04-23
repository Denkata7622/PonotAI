import type { Request, Response } from "express";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import {
  applyTags,
  getCrossArtistRecommendations,
  getTasteIdentitySummary,
  generateSmartPlaylist,
  generateFeaturedMusicPack,
  getContextualRecommendations,
  getDailyDiscovery,
  getListeningInsights,
  getActivitySummaries,
  getListeningTrends,
  getMoodRecommendations,
  getSurpriseDiscovery,
  saveGeneratedPlaylist,
  saveFeaturedMusicPack,
  suggestTags,
} from "./ai.service";

function parseNumber(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function getWeeklyInsightsController(req: Request, res: Response): Promise<void> {
  try {
    const data = await getListeningInsights(req.userId!, "weekly");
    res.status(200).json(data);
  } catch (error) {
    console.error("weekly insights error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function getDailyInsightsController(req: Request, res: Response): Promise<void> {
  try {
    const data = await getListeningInsights(req.userId!, "daily");
    res.status(200).json(data);
  } catch (error) {
    console.error("daily insights error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function getMonthlyInsightsController(req: Request, res: Response): Promise<void> {
  try {
    const data = await getListeningInsights(req.userId!, "monthly");
    res.status(200).json(data);
  } catch (error) {
    console.error("monthly insights error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function getTrendsController(req: Request, res: Response): Promise<void> {
  try {
    const data = await getListeningTrends(req.userId!);
    res.status(200).json(data);
  } catch (error) {
    console.error("trend insights error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function getActivitySummaryController(req: Request, res: Response): Promise<void> {
  try {
    const data = await getActivitySummaries(req.userId!);
    res.status(200).json(data);
  } catch (error) {
    console.error("activity summary error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function generatePlaylistController(req: Request, res: Response): Promise<void> {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "prompt" });
    return;
  }

  const confirmed = req.body?.confirmed === true;
  try {
    const preview = await generateSmartPlaylist(req.userId!, prompt);
    if (!confirmed) {
      res.status(200).json({ ...preview, saved: false });
      return;
    }

    const tracksToSave = preview.playlist.tracks
      .filter((track) => Boolean(track.title && track.artist))
      .map((track) => ({
        title: String(track.title),
        artist: String(track.artist),
        album: track.album,
        coverUrl: track.coverUrl,
      }));

    const saved = await saveGeneratedPlaylist(req.userId!, {
      name: preview.playlist.name,
      tracks: tracksToSave,
    });

    res.status(200).json({ ...preview, saved: true, playlistId: saved.id });
  } catch (error) {
    console.error("generate playlist error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function updatePlaylistController(req: Request, res: Response): Promise<void> {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "prompt" });
    return;
  }

  try {
    const preview = await generateSmartPlaylist(req.userId!, prompt);
    res.status(200).json({ confirmationRequired: true, updatePreview: preview.playlist });
  } catch (error) {
    console.error("update playlist error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function moodRecommendationsController(req: Request, res: Response): Promise<void> {
  const mood = typeof req.query.mood === "string" ? req.query.mood : "relax";
  try {
    const data = await getMoodRecommendations(req.userId!, mood);
    res.status(200).json(data);
  } catch (error) {
    console.error("mood recommendation error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function contextualRecommendationsController(req: Request, res: Response): Promise<void> {
  try {
    const data = await getContextualRecommendations(req.userId!, {
      latitude: parseNumber(req.query.lat),
      longitude: parseNumber(req.query.lon),
      deviceType: typeof req.query.deviceType === "string" ? req.query.deviceType.slice(0, 30) : undefined,
    });
    res.status(200).json(data);
  } catch (error) {
    console.error("context recommendation error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function suggestTagsController(req: Request, res: Response): Promise<void> {
  try {
    const data = await suggestTags(req.userId!);
    res.status(200).json(data);
  } catch (error) {
    console.error("tag suggestion error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function applyTagsController(req: Request, res: Response): Promise<void> {
  const tags = Array.isArray(req.body?.tags) ? req.body.tags : null;
  const confirmed = req.body?.confirmed === true;
  if (tags === null) {
    sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "tags" });
    return;
  }
  try {
    const result = await applyTags(req.userId!, tags, confirmed);
    res.status(200).json(result);
  } catch (error) {
    if ((error as Error).message === "INVALID_TAG_PAYLOAD") {
      sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "tags", reason: "Malformed tags payload" });
      return;
    }
    if ((error as Error).message === "SAFE_GUARD_EMPTY_TAG_REPLACE") {
      sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "tags", reason: "Refusing empty tag overwrite without destructive intent" });
      return;
    }
    console.error("tag apply error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function dailyDiscoveryController(req: Request, res: Response): Promise<void> {
  try {
    const data = await getDailyDiscovery(req.userId!);
    res.status(200).json(data);
  } catch (error) {
    console.error("daily discovery error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function surpriseDiscoveryController(req: Request, res: Response): Promise<void> {
  try {
    const data = await getSurpriseDiscovery(req.userId!);
    res.status(200).json(data);
  } catch (error) {
    console.error("surprise discovery error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function crossArtistRecommendationsController(req: Request, res: Response): Promise<void> {
  const differentArtistsOnly = req.query.differentArtistsOnly !== "false";
  const limit = parseNumber(req.query.limit);
  try {
    const data = await getCrossArtistRecommendations(req.userId!, {
      differentArtistsOnly,
      limit,
    });
    res.status(200).json(data);
  } catch (error) {
    console.error("cross artist recommendation error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function generateFeaturedMusicPackController(req: Request, res: Response): Promise<void> {
  const payload = req.body && typeof req.body === "object" ? req.body as {
    onboardingSeed?: {
      genres?: string[];
      moods?: string[];
      contexts?: string[];
      favoriteArtists?: string[];
    };
  } : {};

  try {
    const data = await generateFeaturedMusicPack(req.userId!, payload);
    res.status(200).json(data);
  } catch (error) {
    console.error("music pack generation error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function getTasteIdentitySummaryController(req: Request, res: Response): Promise<void> {
  const payload = req.body && typeof req.body === "object" ? req.body as {
    onboardingSeed?: {
      genres?: string[];
      moods?: string[];
      contexts?: string[];
      favoriteArtists?: string[];
    };
  } : {};

  try {
    const data = await getTasteIdentitySummary(req.userId!, payload);
    res.status(200).json(data);
  } catch (error) {
    console.error("taste identity summary error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}

export async function saveFeaturedMusicPackController(req: Request, res: Response): Promise<void> {
  const payload = req.body && typeof req.body === "object" ? req.body as {
    packId?: string;
    title?: string;
    tracks?: Array<{ title?: string; artist?: string; album?: string; coverUrl?: string; trackKey?: string }>;
    selectedTrackKeys?: string[];
  } : {};

  const packId = typeof payload.packId === "string" ? payload.packId.trim() : "";
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  const selectedTrackKeys = Array.isArray(payload.selectedTrackKeys)
    ? payload.selectedTrackKeys.filter((item): item is string => typeof item === "string")
    : [];

  if (!packId || !title || tracks.length === 0) {
    sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "musicPack" });
    return;
  }

  try {
    const data = await saveFeaturedMusicPack(req.userId!, {
      packId,
      title,
      tracks: tracks.map((track) => ({
        title: String(track.title ?? ""),
        artist: String(track.artist ?? ""),
        album: track.album,
        coverUrl: track.coverUrl,
        trackKey: track.trackKey,
      })),
      selectedTrackKeys,
    });
    res.status(200).json(data);
  } catch (error) {
    if ((error as Error).message === "MUSIC_PACK_EMPTY") {
      sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "tracks", reason: "Pack contains no valid tracks." });
      return;
    }
    console.error("music pack save error", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}
