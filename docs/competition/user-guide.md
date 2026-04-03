# Trackly User Guide (Competition Edition)

This guide follows the implemented UI labels and navigation in the current frontend.

## Flow 1 — Image recognition (OCR)
1. Open **Home** (`/`).
2. Click **Upload photo (OCR)**.
3. In the upload modal, click **Choose another** (or drag/drop image) and select PNG/JPG/WEBP.
4. Click **Process image**.
5. In the review modal, optionally edit **Song name** and **Artist** fields.
6. Click **Confirm ({count})**.

**Expected outcome:** recognized songs are returned, reviewed, then saved to history and available in home/library history sections.

## Flow 2 — Audio recognition
1. Open **Home** (`/`).
2. Click **Recognize with microphone**.
3. Allow microphone access in the browser prompt.
4. Wait for countdown/listening animation.
5. Review the recognition result card.
6. Use actions such as **Play**, **Save**, or **Add to queue**.

**Expected outcome:** a matched song appears with metadata and is appended to history.

## Flow 3 — Search and save
1. Open **Search** (`/search`).
2. Enter query in the search box.
3. On a result card, open **More options** (`+`).
4. Click **Add to favorites** (or **Add to playlist**).
5. Open **Library** (`/library`) and verify in **Favorites** or **Playlists**.

**Expected outcome:** selected track is persisted to the chosen library entity.

## Flow 4 — Create and edit playlist
1. Open **Library** (`/library`) and select **Playlists**.
2. Click **New Playlist**.
3. Enter a name and click **Create**.
4. Open playlist details and click **Rename** to update playlist name.
5. Remove a song with **Remove** if needed.

**Expected outcome:** playlist creation/update is reflected immediately and persists after reload.

## Flow 5 — Queue management
1. From **Search** or **Library**, add track using **Add to queue**.
2. Use the bottom player controls (**Play/Pause**, **Next**, **Previous**).
3. Continue adding tracks from additional views.
4. Observe queue progression in player state.

**Expected outcome:** tracks are queued without unwanted duplicates and playback controls update active track.

## Flow 6 — Share a song
1. Open track actions and select **Share song**.
2. Copy generated `shareUrl` (from backend response).
3. Open `/shared/{shareCode}` in another browser tab/session.
4. Confirm song and sharer metadata render in shared page.

**Expected outcome:** share link resolves publicly to the selected track details.

## Flow 7 — Switch language
1. Open **Settings** (`/settings`) or use the home language toggle (`EN` / `БГ`).
2. In settings, choose the language option.
3. Navigate back to Home/Library/Search.

**Expected outcome:** visible labels update between English and Bulgarian based on selected language.

## Flow 8 — Switch theme
1. Open **Settings** (`/settings`) or click theme toggle on Home (**Light theme** / **Dark theme**).
2. Select preferred theme.
3. Navigate between pages.

**Expected outcome:** color theme changes globally and remains applied via persisted preference.

---

## Troubleshooting

### 1) Recognition fails
- If you receive no confident match or failure response, retry with clearer input:
  - audio: reduce background noise and keep source closer to microphone,
  - image: upload a sharper screenshot with visible title/artist lines.
- If the UI shows a recognition error, retry once after a short wait.

### 2) Quota exceeded message
- YouTube API quota/rate issues can temporarily block search/resolve.
- Wait about one minute and retry; backend/provider throttling suppresses repeated failing calls during cooldown.

### 3) Login required prompt
- Some actions (favorites/playlists/share in authenticated mode) require sign-in.
- Open `/auth`, complete **Sign In** or **Sign Up**, then retry the action.
