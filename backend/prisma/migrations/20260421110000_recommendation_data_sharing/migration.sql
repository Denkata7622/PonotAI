ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "recommendationDataSharingEnabled" BOOLEAN NOT NULL DEFAULT false;
