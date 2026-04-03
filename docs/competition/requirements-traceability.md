# Requirements Traceability Matrix

Scope: complete traceability from implemented frontend pages/components to backend routes and existing automated tests.

| Requirement ID | User Story | Frontend Component/Page | Backend Route | Test File |
|---|---|---|---|---|
| RQ-01 | As a user, I can recognize a song from microphone audio. | `frontend/app/page.tsx`, `frontend/components/HeroSection.tsx` (Recognize button), `frontend/components/HomeContent.tsx` | `POST /api/recognition/audio` (`backend/src/modules/recognition/recognition.routes.ts`, `recognizeAudioController`) | `frontend/tests/recognition-flow.integration.test.ts`, `backend/tests/recognition.provider.test.ts` |
| RQ-02 | As a user, I can recognize songs from an uploaded image. | `frontend/components/UploadModal.tsx`, `frontend/components/SongReviewModal.tsx`, `frontend/components/HomeContent.tsx` | `POST /api/recognition/image` (`backend/src/modules/recognition/recognition.routes.ts`, `recognizeImageController`) | `backend/tests/recognition.ocr-interpreter.test.ts` |
| RQ-03 | As a user, I can browse recognition history. | `frontend/components/home/HomeHistorySection.tsx`, `frontend/components/HistoryGrid.tsx`, `frontend/app/library/PageClient.tsx` | `GET /api/history`, `POST /api/history`, `DELETE /api/history/:id`, `DELETE /api/history` | test pending |
| RQ-04 | As a user, I can add/remove favorites. | `frontend/components/SearchResultActions.tsx`, `frontend/components/SongRow.tsx`, `frontend/components/home/HomeFavoritesSection.tsx`, `frontend/app/library/PageClient.tsx` | `GET /api/favorites`, `POST /api/favorites`, `DELETE /api/favorites/:id` | `frontend/tests/useLibrary.test.ts`, `frontend/tests/useLibrary-test.ts` |
| RQ-05 | As a user, I can create playlists. | `frontend/components/NewPlaylistModal.tsx`, `frontend/components/PlaylistCard.tsx`, `frontend/app/library/PageClient.tsx` | `POST /api/playlists`, `GET /api/playlists` | `frontend/tests/playlist-integration.test.ts`, `backend/tests/playlists.test.ts` |
| RQ-06 | As a user, I can edit playlist name and song membership. | `frontend/components/PlaylistDetail.tsx`, `frontend/app/library/PageClient.tsx`, `frontend/components/SearchResultActions.tsx` | `PATCH /api/playlists/:playlistId`, `POST /api/playlists/:playlistId/songs`, `DELETE /api/playlists/:playlistId/songs` | `backend/tests/playlists.test.ts` |
| RQ-07 | As a user, I can delete playlists. | `frontend/components/PlaylistDetail.tsx`, `frontend/app/library/PageClient.tsx` | `DELETE /api/playlists/:playlistId` | `backend/tests/playlists.test.ts` |
| RQ-08 | As a user, I can manage playback queue (add/play/next/previous). | `frontend/components/PlayerProvider.tsx`, `frontend/components/BottomPlayBar.tsx`, `frontend/components/SearchResultActions.tsx`, `frontend/components/SongRow.tsx` | `GET /api/youtube/resolve` (`frontend/app/api/youtube/resolve/route.ts`) | `frontend/tests/player-state.test.ts`, `frontend/tests/recognition-flow.integration.test.ts` |
| RQ-09 | As a user, I can share a song with a share link. | `frontend/components/SearchResultActions.tsx`, `frontend/components/SharedSongClient.tsx`, `frontend/app/shared/[shareCode]/page.tsx` | `POST /api/share`, `GET /api/share/:shareCode` | test pending |
| RQ-10 | As a user, I can register, sign in, sign out, and manage account. | `frontend/src/screens/AuthPage.tsx`, `frontend/app/auth/page.tsx`, `frontend/src/screens/ProfilePage.tsx`, `frontend/src/context/UserContext.tsx` | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET/PATCH/DELETE /api/auth/me`, `POST /api/auth/change-password` | test pending |
| RQ-11 | As a user, I can view global usage statistics. | `frontend/app/stats/page.tsx`, `frontend/app/stats/PageClient.tsx` | `GET /api/stats/global` | test pending |
| RQ-12 | As a user, I can search songs and save search results to library entities. | `frontend/app/search/PageClient.tsx`, `frontend/components/SearchInput.tsx`, `frontend/components/SearchResultActions.tsx` | `GET /api/search` (`frontend/app/api/search/route.ts`, uses YouTube Data API) | test pending |
| RQ-13 | As a user, I can switch application theme. | `frontend/lib/ThemeContext.tsx`, `frontend/src/screens/SettingsPage.tsx`, `frontend/components/HeroSection.tsx` | N/A (client-side setting persisted in localStorage) | test pending |
| RQ-14 | As a user, I can switch application language (i18n). | `frontend/lib/LanguageContext.tsx`, `frontend/lib/translations.ts`, `frontend/src/screens/SettingsPage.tsx`, `frontend/components/HeroSection.tsx` | N/A (client-side translation dictionary) | test pending |

## Fast jury navigation (feature → evidence)

- Audio recognition: RQ-01.
- Image recognition: RQ-02.
- History: RQ-03.
- Favorites: RQ-04.
- Playlists: RQ-05, RQ-06, RQ-07.
- Queue/player: RQ-08.
- Share: RQ-09.
- Authentication: RQ-10.
- Stats: RQ-11.
- Search: RQ-12.
- Theming: RQ-13.
- i18n: RQ-14.
