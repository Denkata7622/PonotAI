DO $$
BEGIN
  CREATE TYPE "RecommendationMode" AS ENUM ('safe_familiar', 'balanced', 'mostly_discovery');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "RepeatedArtistTolerance" AS ENUM ('lower', 'normal', 'higher');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "EnergyPreference" AS ENUM ('calmer', 'mixed', 'more_energetic');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "recommendationMode" "RecommendationMode" NOT NULL DEFAULT 'balanced',
ADD COLUMN IF NOT EXISTS "repeatedArtistTolerance" "RepeatedArtistTolerance" NOT NULL DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS "energyPreference" "EnergyPreference" NOT NULL DEFAULT 'mixed';
