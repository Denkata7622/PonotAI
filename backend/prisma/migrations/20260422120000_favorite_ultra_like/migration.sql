-- Add ultra-like preference signal above favorite on canonical user-song records.
ALTER TABLE "Favorite"
  ADD COLUMN "ultraLiked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ultraLikedAt" TIMESTAMP(3);

CREATE INDEX "Favorite_userId_ultraLiked_ultraLikedAt_idx"
  ON "Favorite"("userId", "ultraLiked", "ultraLikedAt");
