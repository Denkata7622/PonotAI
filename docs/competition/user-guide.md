# Trackly User Guide (Competition Edition)

This guide documents six implemented user flows in the current app.

---

## Flow 1 — Recognize a song from live audio
**Goal:** Identify currently playing music through the microphone.

1. Open **Home** (`/`).
2. Click **Recognize with microphone**.
3. Grant microphone permission when prompted.
4. Wait for countdown/listening state.
5. Review recognition result card (song, artist, confidence, links).
6. Optionally play/queue/save from the result.

**Annotated notes**
- If microphone permission is denied, a specific error toast is shown.
- A successful recognition writes an entry to history (cloud for auth users, local fallback for guest flow).

---

## Flow 2 — Recognize songs from an image (OCR)
**Goal:** Extract one or more songs from a screenshot/photo of a music app.

1. Open **Home** (`/`).
2. Click **Upload photo (OCR)**.
3. Drop/select a PNG/JPG/WEBP image.
4. Click **Process image**.
5. In review modal, confirm extracted songs.
6. Confirm to store selected songs to history.

**Annotated notes**
- The backend returns a list (`songs`) with count and language metadata.
- If no verified result is found, a clear error path is returned.

---

## Flow 3 — Save a song to favorites
**Goal:** Add a track to favorites for faster retrieval.

1. From **Home**, **Search**, or **Library**, open song actions.
2. Click **Add to favorites** (heart action).
3. Open **Library** (`/library`) and switch to **Favorites**.
4. Confirm the track appears in favorites.

**Annotated notes**
- Authenticated users sync favorites via backend `/api/favorites`.
- Guest users use local library state via `useLibrary`.

---

## Flow 4 — Create and manage a playlist
**Goal:** Create a playlist, add songs, and manage playlist contents.

1. Open **Library** (`/library`) and go to **Playlists** tab.
2. Click **New Playlist** and enter a name.
3. Add songs from Search/Home actions into the playlist.
4. Open the playlist card to enter **PlaylistDetail**.
5. Rename playlist, remove songs, or delete the playlist.

**Annotated notes**
- Playlist detail modal supports inline rename and song-level actions.
- Delete flow includes temporary undo behavior before final removal.

---

## Flow 5 — Queue playback and control the player
**Goal:** Build a queue and play music through visible YouTube embed.

1. Add a track to queue from Search/Home/Library actions.
2. Open the bottom player bar.
3. Use **Play/Pause**, **Next**, **Previous**, volume, and seek controls.
4. Continue adding songs; duplicate queue items are de-duplicated.

**Annotated notes**
- Queue/player state persists in local storage (`ponotai.player.state.v1`).
- If a track lacks a video ID, frontend resolves it through `/api/youtube/resolve`.

---

## Flow 6 — Share a song
**Goal:** Generate a public share link for a specific song.

1. Trigger share action for a track (authenticated flow).
2. Backend returns `shareCode` and `shareUrl` from `/api/share`.
3. Open the URL `/shared/{shareCode}`.
4. View shared song details and sharer metadata.

**Annotated notes**
- Public page fetches `GET /api/share/:shareCode`.
- Invalid/non-existent share codes return `NOT_FOUND`.

---

## Known limitations
- External provider/API availability can affect recognition/search quality.
- Guest mode relies on local storage and is device/browser scoped.
- Some flows are partially covered by automated tests and still rely on manual acceptance checks for full UI validation.
