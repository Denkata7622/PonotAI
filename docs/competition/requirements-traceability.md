# Requirements Traceability Matrix

Scope: matrix based on currently implemented Trackly flows in frontend routes/components and backend modules.

## Matrix: Requirement ID → User flow → Route/component → Test case

| Requirement ID | User flow | Frontend route/component(s) | Backend route/controller(s) | Existing automated tests | Suggested manual acceptance check |
|---|---|---|---|---|---|
| RQ-01 | Recognize song from microphone audio | `/` (`frontend/app/page.tsx`), `HomeContent`, `HeroSection`, `ResultCard` | `POST /api/recognition/audio`, `recognizeAudioController`, `recognizeSongFromAudio` | `frontend/tests/recognition-flow.integration.test.ts` (recognize → verify → queue), `backend/tests/recognition.provider.test.ts` (provider retry policy) | Start recording from home page, receive recognized song card, verify item appears in history |
| RQ-02 | Recognize song(s) from uploaded image (OCR) | `/` + `UploadModal`, `SongReviewModal`, `HomeContent` | `POST /api/recognition/image`, `recognizeImageController`, OCR pipeline in `recognition.service.ts` | `backend/tests/recognition.ocr-interpreter.test.ts` | Upload PNG/JPG/WEBP screenshot, confirm extracted songs, verify selected songs are saved to history |
| RQ-03 | Save recognized or searched song to favorites | `TrackCard`, `SongRow`, `SearchResultActions`, `useLibrary`, `UserContext` | `GET/POST/DELETE /api/favorites` | `frontend/tests/useLibrary.test.ts`, `frontend/tests/useLibrary-test.ts` | From Search or Home, click favorite action and confirm song appears in Library > Favorites |
| RQ-04 | Create and manage playlist (create, rename, delete, remove song) | `/library` (`LibraryPageClient`), `PlaylistCard`, `PlaylistDetail`, `NewPlaylistModal` | `GET/POST/PATCH/DELETE /api/playlists`, `POST/DELETE /api/playlists/:playlistId/songs` | `frontend/tests/playlist-integration.test.ts`, `backend/tests/playlists.test.ts` | Create playlist from library, add song, rename playlist, remove song, then delete playlist |
| RQ-05 | Queue playback and control player | `PlayerProvider`, `BottomPlayBar`, `SongRow`, `SearchResultActions` | `GET /api/youtube/resolve` (Next API route), uses YouTube ID resolution | `frontend/tests/player-state.test.ts`, `frontend/tests/recognition-flow.integration.test.ts` | Add tracks to queue from Search and Library, confirm play/pause, next/previous, and duplicate handling |
| RQ-06 | Share a song via share code/page | `SearchResultActions` (share entry point), `/shared/[shareCode]`, `SharedSongClient` | `POST /api/share`, `GET /api/share/:shareCode` | No dedicated automated test file currently present | Create share link for a song and open `/shared/{code}` in a new session/browser |

## Functional path coverage notes

### Happy paths currently covered in code
- Recognition supports audio and image inputs with route-specific validation.  
- Library actions support favorites, playlists, and queue handoff from multiple UI entry points.  
- Share flow has create and resolve endpoints with a dedicated public page.

### Failure paths currently covered in code
- Audio/image uploads return `400` when required files are missing.  
- Recognition returns specific codes for no verified match (`NO_VERIFIED_RESULT`) and provider configuration errors (`PROVIDER_CONFIG_ERROR`).  
- Favorites/playlists enforce payload validation and authentication.

### Traceability maintenance rule
For every new user-visible feature, add one row with:
1. New requirement ID (`RQ-XX`),
2. Exact route/component path,
3. Exact backend endpoint path,
4. At least one automated test file reference or an explicit documented manual test.
