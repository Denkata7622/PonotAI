-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "recommendationDataSharingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recommendationMode" TEXT NOT NULL DEFAULT 'balanced',
    "repeatedArtistTolerance" TEXT NOT NULL DEFAULT 'normal',
    "energyPreference" TEXT NOT NULL DEFAULT 'mixed',
    "themePresetId" TEXT,
    "emailVerifiedAt" DATETIME,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "avatarBase64" TEXT,
    "bio" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "title" TEXT,
    "artist" TEXT,
    "album" TEXT,
    "coverUrl" TEXT,
    "recognized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LegacyHistoryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songName" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "youtubeVideoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "coverUrl" TEXT,
    "ultraLiked" BOOLEAN NOT NULL DEFAULT false,
    "ultraLikedAt" DATETIME,
    "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SharedSong" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "coverUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedSong_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SharedPlaylist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "songCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedPlaylist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SharedPlaylist_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SharedRecognition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "coverUrl" TEXT,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedRecognition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaylistTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "coverUrl" TEXT,
    "videoId" TEXT,
    "position" INTEGER NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,
    CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrackTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "trackKey" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "tempo" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrackTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SongTaste" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackKey" TEXT NOT NULL,
    "title" TEXT,
    "artist" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "stage1Status" TEXT NOT NULL DEFAULT 'not_started',
    "stage2Status" TEXT NOT NULL DEFAULT 'not_started',
    "stage3Status" TEXT NOT NULL DEFAULT 'not_started',
    "stage1Data" JSONB,
    "stage2Data" JSONB,
    "stage3Data" JSONB,
    "stage1Confidence" JSONB,
    "stage1AnalyzedAt" DATETIME,
    "stage2AnalyzedAt" DATETIME,
    "stage3AnalyzedAt" DATETIME,
    "stage1Error" TEXT,
    "stage2Error" TEXT,
    "stage3Error" TEXT,
    "analysisVersion" TEXT,
    "lastQueuedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SongTasteQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songTasteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SongTasteQueue_songTasteId_fkey" FOREIGN KEY ("songTasteId") REFERENCES "SongTaste" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MusicPackDrop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "songCount" INTEGER NOT NULL,
    "generatedAt" DATETIME NOT NULL,
    "openedAt" DATETIME,
    "outcomeAt" DATETIME,
    "savedPlaylistId" TEXT,
    "nextDropAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MusicPackDrop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_createdAt_idx" ON "EmailVerificationToken"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

-- CreateIndex
CREATE INDEX "SearchHistory_userId_createdAt_idx" ON "SearchHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LegacyHistoryEntry_createdAt_idx" ON "LegacyHistoryEntry"("createdAt");

-- CreateIndex
CREATE INDEX "Favorite_userId_savedAt_idx" ON "Favorite"("userId", "savedAt");

-- CreateIndex
CREATE INDEX "Favorite_userId_ultraLiked_ultraLikedAt_idx" ON "Favorite"("userId", "ultraLiked", "ultraLikedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_title_artist_key" ON "Favorite"("userId", "title", "artist");

-- CreateIndex
CREATE UNIQUE INDEX "SharedSong_shareCode_key" ON "SharedSong"("shareCode");

-- CreateIndex
CREATE INDEX "SharedSong_userId_createdAt_idx" ON "SharedSong"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SharedPlaylist_shareCode_key" ON "SharedPlaylist"("shareCode");

-- CreateIndex
CREATE INDEX "SharedPlaylist_userId_createdAt_idx" ON "SharedPlaylist"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SharedRecognition_shareCode_key" ON "SharedRecognition"("shareCode");

-- CreateIndex
CREATE INDEX "SharedRecognition_userId_createdAt_idx" ON "SharedRecognition"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Playlist_userId_updatedAt_idx" ON "Playlist"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "PlaylistTrack_playlistId_position_idx" ON "PlaylistTrack"("playlistId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistTrack_playlistId_title_artist_key" ON "PlaylistTrack"("playlistId", "title", "artist");

-- CreateIndex
CREATE INDEX "Achievement_userId_unlockedAt_idx" ON "Achievement"("userId", "unlockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_userId_key_key" ON "Achievement"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyPrefix_key" ON "ApiKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "ApiKey_userId_createdAt_idx" ON "ApiKey"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TrackTag_userId_updatedAt_idx" ON "TrackTag"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackTag_userId_trackKey_key" ON "TrackTag"("userId", "trackKey");

-- CreateIndex
CREATE UNIQUE INDEX "SongTaste_trackKey_key" ON "SongTaste"("trackKey");

-- CreateIndex
CREATE INDEX "SongTaste_status_updatedAt_idx" ON "SongTaste"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "SongTaste_stage1Status_updatedAt_idx" ON "SongTaste"("stage1Status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SongTasteQueue_songTasteId_key" ON "SongTasteQueue"("songTasteId");

-- CreateIndex
CREATE INDEX "SongTasteQueue_status_availableAt_updatedAt_idx" ON "SongTasteQueue"("status", "availableAt", "updatedAt");

-- CreateIndex
CREATE INDEX "MusicPackDrop_userId_generatedAt_idx" ON "MusicPackDrop"("userId", "generatedAt");

-- CreateIndex
CREATE INDEX "MusicPackDrop_userId_updatedAt_idx" ON "MusicPackDrop"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MusicPackDrop_userId_packId_key" ON "MusicPackDrop"("userId", "packId");
