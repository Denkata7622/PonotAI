-- Song Taster v1 scaffold (3-stage with Stage 1 active)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SongTasteStageStatus') THEN
    CREATE TYPE "SongTasteStageStatus" AS ENUM ('not_started', 'queued', 'processing', 'completed', 'failed');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SongTasteQueueStatus') THEN
    CREATE TYPE "SongTasteQueueStatus" AS ENUM ('queued', 'processing', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SongTaste" (
  "id" TEXT NOT NULL,
  "trackKey" TEXT NOT NULL,
  "title" TEXT,
  "artist" TEXT,
  "status" "SongTasteStageStatus" NOT NULL DEFAULT 'not_started',
  "stage1Status" "SongTasteStageStatus" NOT NULL DEFAULT 'not_started',
  "stage2Status" "SongTasteStageStatus" NOT NULL DEFAULT 'not_started',
  "stage3Status" "SongTasteStageStatus" NOT NULL DEFAULT 'not_started',
  "stage1Data" JSONB,
  "stage2Data" JSONB,
  "stage3Data" JSONB,
  "stage1Confidence" JSONB,
  "stage1AnalyzedAt" TIMESTAMP(3),
  "stage2AnalyzedAt" TIMESTAMP(3),
  "stage3AnalyzedAt" TIMESTAMP(3),
  "stage1Error" TEXT,
  "stage2Error" TEXT,
  "stage3Error" TEXT,
  "analysisVersion" TEXT,
  "lastQueuedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SongTaste_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SongTasteQueue" (
  "id" TEXT NOT NULL,
  "songTasteId" TEXT NOT NULL,
  "status" "SongTasteQueueStatus" NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SongTasteQueue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SongTaste_trackKey_key" ON "SongTaste"("trackKey");
CREATE INDEX IF NOT EXISTS "SongTaste_status_updatedAt_idx" ON "SongTaste"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "SongTaste_stage1Status_updatedAt_idx" ON "SongTaste"("stage1Status", "updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "SongTasteQueue_songTasteId_key" ON "SongTasteQueue"("songTasteId");
CREATE INDEX IF NOT EXISTS "SongTasteQueue_status_availableAt_updatedAt_idx" ON "SongTasteQueue"("status", "availableAt", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SongTasteQueue_songTasteId_fkey'
  ) THEN
    ALTER TABLE "SongTasteQueue"
    ADD CONSTRAINT "SongTasteQueue_songTasteId_fkey"
    FOREIGN KEY ("songTasteId") REFERENCES "SongTaste"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
