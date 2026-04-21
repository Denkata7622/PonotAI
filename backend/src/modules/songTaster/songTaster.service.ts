import { randomUUID } from "node:crypto";
import { SongTasteQueueStatus, SongTasteStageStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { normalizeTrackKey } from "../../utils/songIdentity";

type Stage1GenreFamily = "pop" | "rock" | "hip-hop" | "electronic" | "rnb" | "folk" | "jazz" | "classical" | "other";
type Stage1Mood = "uplifting" | "melancholic" | "intense" | "chill" | "romantic" | "neutral";
type Stage1Energy = "low" | "medium" | "high";
type Stage1PaceBucket = "slow" | "mid" | "fast";
type Stage1VocalPresence = "vocal" | "instrumental" | "unknown";

type Stage1Data = {
  genreFamily: Stage1GenreFamily;
  secondaryGenreHint: string;
  mood: Stage1Mood;
  energy: Stage1Energy;
  paceBucket: Stage1PaceBucket;
  vocalOrInstrumental: Stage1VocalPresence;
  contextTags: string[];
};

type Stage1Confidence = {
  genreFamily: number;
  secondaryGenreHint: number;
  mood: number;
  energy: number;
  paceBucket: number;
  vocalOrInstrumental: number;
  contextTags: number;
  overall: number;
};

export type SongTasteAdminFilters = {
  limit?: number;
  stage1Status?: SongTasteStageStatus;
  queueStatus?: SongTasteQueueStatus;
};

type SongTasteAdminActionLookup = {
  id?: string;
  trackKey?: string;
};

function confidenceFromSignal(signal: number): number {
  const clamped = Math.max(0, Math.min(1, signal));
  return Number((0.35 + clamped * 0.6).toFixed(2));
}

function analyzeStage1(title: string, artist: string): { data: Stage1Data; confidence: Stage1Confidence } {
  const text = `${title} ${artist}`.toLowerCase();
  const tokenCount = text.split(/\s+/).filter(Boolean).length;

  const genreFamily: Stage1GenreFamily =
    /rap|hip hop|trap|drill/.test(text) ? "hip-hop"
      : /rock|metal|punk|guitar/.test(text) ? "rock"
      : /house|techno|edm|electro|dance/.test(text) ? "electronic"
      : /jazz|swing|blues/.test(text) ? "jazz"
      : /symphony|orchestra|sonata|concerto/.test(text) ? "classical"
      : /folk|acoustic|country/.test(text) ? "folk"
      : /soul|rnb|rhythm and blues/.test(text) ? "rnb"
      : /pop/.test(text) ? "pop"
      : "other";

  const mood: Stage1Mood =
    /sad|blue|alone|cry|tears|empty/.test(text) ? "melancholic"
      : /party|dance|fire|energy|rise|up/.test(text) ? "uplifting"
      : /dark|rage|storm|fight/.test(text) ? "intense"
      : /calm|dream|night|ambient|sleep/.test(text) ? "chill"
      : /love|heart|kiss|romance/.test(text) ? "romantic"
      : "neutral";

  const energy: Stage1Energy =
    /rage|fire|dance|club|boost|power/.test(text) ? "high"
      : /calm|soft|ambient|sleep|piano/.test(text) ? "low"
      : "medium";

  const paceBucket: Stage1PaceBucket =
    /fast|rush|speed|run|turbo/.test(text) ? "fast"
      : /slow|ballad|calm|lento/.test(text) ? "slow"
      : "mid";

  const vocalOrInstrumental: Stage1VocalPresence =
    /instrumental|karaoke|score|ost/.test(text) ? "instrumental"
      : tokenCount > 0 ? "vocal"
      : "unknown";

  const secondaryGenreHint =
    genreFamily === "other"
      ? "general"
      : genreFamily === "electronic"
        ? "dance"
        : genreFamily === "hip-hop"
          ? "urban"
          : genreFamily;

  const contextTags = [
    mood === "uplifting" ? "workout" : null,
    mood === "chill" ? "focus" : null,
    mood === "romantic" ? "date-night" : null,
    mood === "melancholic" ? "late-night" : null,
    energy === "high" ? "high-energy" : null,
    paceBucket === "slow" ? "wind-down" : null,
  ].filter((value): value is string => Boolean(value));

  const signal = Math.min(1, tokenCount / 8);
  const overall = confidenceFromSignal(signal);

  return {
    data: {
      genreFamily,
      secondaryGenreHint,
      mood,
      energy,
      paceBucket,
      vocalOrInstrumental,
      contextTags,
    },
    confidence: {
      genreFamily: confidenceFromSignal(signal),
      secondaryGenreHint: confidenceFromSignal(signal * 0.92),
      mood: confidenceFromSignal(signal * 0.9),
      energy: confidenceFromSignal(signal * 0.87),
      paceBucket: confidenceFromSignal(signal * 0.82),
      vocalOrInstrumental: confidenceFromSignal(signal * 0.78),
      contextTags: confidenceFromSignal(signal * 0.75),
      overall,
    },
  };
}

export async function queueSongTasteAnalysis(input: { title: string; artist: string; force?: boolean }): Promise<{ trackKey: string; queued: boolean }> {
  const title = input.title.trim();
  const artist = input.artist.trim();
  const trackKey = normalizeTrackKey(title, artist);

  const queued = await prisma.$transaction(async (tx) => {
    const existing = await tx.songTaste.findUnique({ where: { trackKey } });

    const songTaste = existing
      ? await tx.songTaste.update({
        where: { id: existing.id },
        data: {
          title,
          artist,
          lastQueuedAt: new Date(),
        },
      })
      : await tx.songTaste.create({
        data: {
          id: randomUUID(),
          trackKey,
          title,
          artist,
          status: SongTasteStageStatus.queued,
          stage1Status: SongTasteStageStatus.queued,
          stage2Status: SongTasteStageStatus.not_started,
          stage3Status: SongTasteStageStatus.not_started,
          analysisVersion: "song-taster-v1-stage1",
          lastQueuedAt: new Date(),
        },
      });

    const stage1AlreadyComplete = songTaste.stage1Status === SongTasteStageStatus.completed;
    if (stage1AlreadyComplete && !input.force) {
      return false;
    }

    const shouldMarkQueued = songTaste.stage1Status !== SongTasteStageStatus.processing;
    if (shouldMarkQueued) {
      await tx.songTaste.update({
        where: { id: songTaste.id },
        data: {
          status: SongTasteStageStatus.queued,
          stage1Status: SongTasteStageStatus.queued,
          stage1Error: null,
          stage2Status: songTaste.stage2Status ?? SongTasteStageStatus.not_started,
          stage3Status: songTaste.stage3Status ?? SongTasteStageStatus.not_started,
        },
      });

      await tx.songTasteQueue.upsert({
        where: { songTasteId: songTaste.id },
        create: {
          id: randomUUID(),
          songTasteId: songTaste.id,
          status: SongTasteQueueStatus.queued,
          availableAt: new Date(),
        },
        update: {
          status: SongTasteQueueStatus.queued,
          availableAt: new Date(),
          startedAt: null,
          finishedAt: null,
          lastError: null,
        },
      });
      return true;
    }

    return false;
  });

  if (queued) {
    triggerSongTasteProcessing();
  }

  return { trackKey, queued };
}

let processingLoop: Promise<void> | null = null;

function triggerSongTasteProcessing(): void {
  if (processingLoop) return;
  processingLoop = (async () => {
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const processed = await processNextSongTasteQueue();
        if (!processed) break;
      }
    } finally {
      processingLoop = null;
    }
  })();
}

export async function processNextSongTasteQueue(): Promise<boolean> {
  const queued = await prisma.songTasteQueue.findFirst({
    where: {
      status: SongTasteQueueStatus.queued,
      availableAt: { lte: new Date() },
    },
    orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    include: { songTaste: true },
  });

  if (!queued) return false;

  await prisma.songTasteQueue.update({
    where: { id: queued.id },
    data: {
      status: SongTasteQueueStatus.processing,
      attempts: { increment: 1 },
      startedAt: new Date(),
      lastError: null,
    },
  });

  await prisma.songTaste.update({
    where: { id: queued.songTasteId },
    data: {
      status: SongTasteStageStatus.processing,
      stage1Status: SongTasteStageStatus.processing,
      stage1Error: null,
    },
  });

  try {
    const sourceTitle = queued.songTaste.title?.trim() || "Unknown Song";
    const sourceArtist = queued.songTaste.artist?.trim() || "Unknown Artist";
    const analysis = analyzeStage1(sourceTitle, sourceArtist);

    await prisma.$transaction(async (tx) => {
      await tx.songTaste.update({
        where: { id: queued.songTasteId },
        data: {
          status: SongTasteStageStatus.completed,
          stage1Status: SongTasteStageStatus.completed,
          stage1Data: analysis.data,
          stage1Confidence: analysis.confidence,
          stage1AnalyzedAt: new Date(),
          stage1Error: null,
          stage2Status: SongTasteStageStatus.not_started,
          stage3Status: SongTasteStageStatus.not_started,
          analysisVersion: "song-taster-v1-stage1",
        },
      });

      await tx.songTasteQueue.delete({ where: { id: queued.id } });
    });
  } catch (error) {
    const message = (error as Error).message || "Stage 1 analysis failed";
    await prisma.$transaction(async (tx) => {
      await tx.songTaste.update({
        where: { id: queued.songTasteId },
        data: {
          status: SongTasteStageStatus.failed,
          stage1Status: SongTasteStageStatus.failed,
          stage1Error: message,
        },
      });

      await tx.songTasteQueue.update({
        where: { id: queued.id },
        data: {
          status: SongTasteQueueStatus.failed,
          lastError: message,
          finishedAt: new Date(),
        },
      });
    });
  }

  return true;
}

export async function getSongTasteAdminSnapshot(filters: SongTasteAdminFilters = {}) {
  const limit = Math.max(1, Math.min(filters.limit ?? 30, 100));

  const [
    total,
    stage1NotStarted,
    stage1Completed,
    stage1Failed,
    stage1Queued,
    stage1Processing,
    queueQueued,
    queueProcessing,
    queueFailed,
    recent,
  ] = await Promise.all([
    prisma.songTaste.count(),
    prisma.songTaste.count({ where: { stage1Status: SongTasteStageStatus.not_started } }),
    prisma.songTaste.count({ where: { stage1Status: SongTasteStageStatus.completed } }),
    prisma.songTaste.count({ where: { stage1Status: SongTasteStageStatus.failed } }),
    prisma.songTaste.count({ where: { stage1Status: SongTasteStageStatus.queued } }),
    prisma.songTaste.count({ where: { stage1Status: SongTasteStageStatus.processing } }),
    prisma.songTasteQueue.count({ where: { status: SongTasteQueueStatus.queued } }),
    prisma.songTasteQueue.count({ where: { status: SongTasteQueueStatus.processing } }),
    prisma.songTasteQueue.count({ where: { status: SongTasteQueueStatus.failed } }),
    prisma.songTaste.findMany({
      where: {
        ...(filters.stage1Status ? { stage1Status: filters.stage1Status } : {}),
        ...(filters.queueStatus
          ? { queue: { is: { status: filters.queueStatus } } }
          : {}),
      },
      include: { queue: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
  ]);

  return {
    totals: {
      songs: total,
      stage1NotStarted,
      stage1Completed,
      stage1Failed,
      stage1Queued,
      stage1Processing,
      stage2Scaffolded: total,
      stage3Scaffolded: total,
    },
    queue: {
      queued: queueQueued,
      processing: queueProcessing,
      completed: stage1Completed,
      failed: queueFailed,
    },
    items: recent.map((item) => ({
      id: item.id,
      trackKey: item.trackKey,
      title: item.title,
      artist: item.artist,
      status: item.status,
      stage1Status: item.stage1Status,
      stage2Status: item.stage2Status,
      stage3Status: item.stage3Status,
      stage1AnalyzedAt: item.stage1AnalyzedAt?.toISOString() ?? null,
      stage1Error: item.stage1Error,
      analysisVersion: item.analysisVersion,
      queue: item.queue
        ? {
          status: item.queue.status,
          attempts: item.queue.attempts,
          availableAt: item.queue.availableAt.toISOString(),
          startedAt: item.queue.startedAt?.toISOString() ?? null,
          finishedAt: item.queue.finishedAt?.toISOString() ?? null,
          createdAt: item.queue.createdAt.toISOString(),
          updatedAt: item.queue.updatedAt.toISOString(),
          lastError: item.queue.lastError,
        }
        : null,
      createdAt: item.createdAt.toISOString(),
      lastQueuedAt: item.lastQueuedAt?.toISOString() ?? null,
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

async function findSongTasteForAdminLookup(input: SongTasteAdminActionLookup) {
  if (input.id?.trim()) {
    return prisma.songTaste.findUnique({
      where: { id: input.id.trim() },
      include: { queue: true },
    });
  }

  if (input.trackKey?.trim()) {
    return prisma.songTaste.findUnique({
      where: { trackKey: input.trackKey.trim() },
      include: { queue: true },
    });
  }

  return null;
}

function toSongTasteAdminItem(item: Awaited<ReturnType<typeof findSongTasteForAdminLookup>>) {
  if (!item) return null;
  return {
    id: item.id,
    trackKey: item.trackKey,
    title: item.title,
    artist: item.artist,
    status: item.status,
    stage1Status: item.stage1Status,
    stage2Status: item.stage2Status,
    stage3Status: item.stage3Status,
    stage1Data: item.stage1Data,
    stage1Confidence: item.stage1Confidence,
    stage1AnalyzedAt: item.stage1AnalyzedAt?.toISOString() ?? null,
    stage2AnalyzedAt: item.stage2AnalyzedAt?.toISOString() ?? null,
    stage3AnalyzedAt: item.stage3AnalyzedAt?.toISOString() ?? null,
    stage1Error: item.stage1Error,
    stage2Error: item.stage2Error,
    stage3Error: item.stage3Error,
    analysisVersion: item.analysisVersion,
    createdAt: item.createdAt.toISOString(),
    lastQueuedAt: item.lastQueuedAt?.toISOString() ?? null,
    updatedAt: item.updatedAt.toISOString(),
    queue: item.queue
      ? {
        id: item.queue.id,
        status: item.queue.status,
        attempts: item.queue.attempts,
        availableAt: item.queue.availableAt.toISOString(),
        startedAt: item.queue.startedAt?.toISOString() ?? null,
        finishedAt: item.queue.finishedAt?.toISOString() ?? null,
        createdAt: item.queue.createdAt.toISOString(),
        updatedAt: item.queue.updatedAt.toISOString(),
        lastError: item.queue.lastError,
      }
      : null,
  };
}

export async function getSongTasteAdminItem(input: SongTasteAdminActionLookup) {
  const item = await findSongTasteForAdminLookup(input);
  return toSongTasteAdminItem(item);
}

export async function adminAnalyzeSongTasteNow(input: SongTasteAdminActionLookup & { force?: boolean }) {
  const songTaste = await findSongTasteForAdminLookup(input);
  if (!songTaste) {
    return { ok: false as const, code: "NOT_FOUND" as const, message: "Song Taster entry not found." };
  }

  const result = await queueSongTasteAnalysis({
    title: songTaste.title?.trim() || "Unknown Song",
    artist: songTaste.artist?.trim() || "Unknown Artist",
    force: Boolean(input.force),
  });

  const fresh = await getSongTasteAdminItem({ id: songTaste.id });
  return {
    ok: true as const,
    queued: result.queued,
    trackKey: result.trackKey,
    item: fresh,
  };
}

export async function adminRetryFailedSongTaste(input: SongTasteAdminActionLookup) {
  const songTaste = await findSongTasteForAdminLookup(input);
  if (!songTaste) {
    return { ok: false as const, code: "NOT_FOUND" as const, message: "Song Taster entry not found." };
  }

  const hasFailure = songTaste.stage1Status === SongTasteStageStatus.failed
    || songTaste.queue?.status === SongTasteQueueStatus.failed;

  if (!hasFailure) {
    return { ok: false as const, code: "NOT_FAILED" as const, message: "Retry is only available for failed Stage 1 entries." };
  }

  const result = await queueSongTasteAnalysis({
    title: songTaste.title?.trim() || "Unknown Song",
    artist: songTaste.artist?.trim() || "Unknown Artist",
    force: true,
  });

  const fresh = await getSongTasteAdminItem({ id: songTaste.id });
  return {
    ok: true as const,
    queued: result.queued,
    trackKey: result.trackKey,
    item: fresh,
  };
}
