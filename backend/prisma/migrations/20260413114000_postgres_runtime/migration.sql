-- PostgreSQL runtime schema for PonotAI persistence
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'user',
  "isDemo" BOOLEAN NOT NULL DEFAULT FALSE,
  "avatarBase64" TEXT,
  "bio" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SearchHistory" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "method" TEXT NOT NULL,
  "title" TEXT,
  "artist" TEXT,
  "album" TEXT,
  "coverUrl" TEXT,
  "recognized" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SearchHistory_userId_createdAt_idx" ON "SearchHistory"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "LegacyHistoryEntry" (
  "id" TEXT PRIMARY KEY,
  "songName" TEXT NOT NULL,
  "artist" TEXT NOT NULL,
  "youtubeVideoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "LegacyHistoryEntry_createdAt_idx" ON "LegacyHistoryEntry"("createdAt");

CREATE TABLE IF NOT EXISTS "Favorite" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "artist" TEXT NOT NULL,
  "album" TEXT,
  "coverUrl" TEXT,
  "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_title_artist_key" ON "Favorite"("userId", "title", "artist");
CREATE INDEX IF NOT EXISTS "Favorite_userId_savedAt_idx" ON "Favorite"("userId", "savedAt");

CREATE TABLE IF NOT EXISTS "Playlist" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Playlist_userId_updatedAt_idx" ON "Playlist"("userId", "updatedAt");

CREATE TABLE IF NOT EXISTS "PlaylistTrack" (
  "id" TEXT PRIMARY KEY,
  "playlistId" TEXT NOT NULL REFERENCES "Playlist"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "artist" TEXT NOT NULL,
  "album" TEXT,
  "coverUrl" TEXT,
  "videoId" TEXT,
  "position" INTEGER NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlaylistTrack_playlistId_title_artist_key" ON "PlaylistTrack"("playlistId", "title", "artist");
CREATE INDEX IF NOT EXISTS "PlaylistTrack_playlistId_position_idx" ON "PlaylistTrack"("playlistId", "position");

CREATE TABLE IF NOT EXISTS "SharedSong" (
  "id" TEXT PRIMARY KEY,
  "shareCode" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "artist" TEXT NOT NULL,
  "album" TEXT,
  "coverUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SharedSong_userId_createdAt_idx" ON "SharedSong"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "SharedPlaylist" (
  "id" TEXT PRIMARY KEY,
  "shareCode" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "playlistId" TEXT NOT NULL REFERENCES "Playlist"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "songCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SharedPlaylist_userId_createdAt_idx" ON "SharedPlaylist"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "SharedRecognition" (
  "id" TEXT PRIMARY KEY,
  "shareCode" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "artist" TEXT NOT NULL,
  "album" TEXT,
  "coverUrl" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SharedRecognition_userId_createdAt_idx" ON "SharedRecognition"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "Achievement" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "key" TEXT NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meta" JSONB
);
CREATE UNIQUE INDEX IF NOT EXISTS "Achievement_userId_key_key" ON "Achievement"("userId", "key");
CREATE INDEX IF NOT EXISTS "Achievement_userId_unlockedAt_idx" ON "Achievement"("userId", "unlockedAt");

CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL UNIQUE,
  "keyHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "ApiKey_userId_createdAt_idx" ON "ApiKey"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "TrackTag" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "trackKey" TEXT NOT NULL,
  "genre" TEXT NOT NULL,
  "mood" TEXT NOT NULL,
  "tempo" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrackTag_userId_trackKey_key" ON "TrackTag"("userId", "trackKey");
CREATE INDEX IF NOT EXISTS "TrackTag_userId_updatedAt_idx" ON "TrackTag"("userId", "updatedAt");
