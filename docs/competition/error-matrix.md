# Error matrix

Standard backend error response shape:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "details": {},
  "requestId": "optional-request-id"
}
```

| Feature | Failure scenario | HTTP status | Error code | Frontend message shown to user |
| --- | --- | ---: | --- | --- |
| Auth | Missing `Authorization` header on protected endpoint | 401 | `UNAUTHORIZED` | Please sign in to continue. |
| Auth | Invalid/expired bearer token | 401 | `UNAUTHORIZED` | Your session is not valid. Please sign in again. |
| Auth | Login with missing email/password | 401 | `INVALID_CREDENTIALS` | Invalid email or password. |
| Auth | Login with unknown email | 401 | `INVALID_CREDENTIALS` | Invalid email or password. |
| Auth | Login with wrong password | 401 | `INVALID_CREDENTIALS` | Invalid email or password. |
| Auth | Register with invalid username format | 400 | `INVALID_USERNAME` | Username must be 3–30 letters, numbers, or underscore. |
| Auth | Register/profile update with invalid email format | 400 | `INVALID_EMAIL` | Enter a valid email address. |
| Auth | Register with weak password | 400 | `WEAK_PASSWORD` | Password must be at least 8 characters. |
| Auth | Register/profile update where username already exists | 409 | `USERNAME_TAKEN` | That username is already in use. |
| Auth | Register/profile update where email already exists | 409 | `EMAIL_TAKEN` | That email is already in use. |
| Auth | Change password payload missing required values | 400 | `INVALID_PASSWORD` | Please provide current and new password. |
| Auth | `/auth/me` when user record no longer exists | 404 | `NOT_FOUND` | User account could not be found. |
| Favorites | Create favorite without title or artist | 400 | `INVALID_PAYLOAD` | Song title and artist are required. |
| Favorites | Delete favorite not found | 404 | `NOT_FOUND` | Favorite item not found. |
| Favorites | Delete favorite owned by another user | 403 | `FORBIDDEN` | You cannot modify this favorite item. |
| Share | Create share without title or artist | 400 | `INVALID_PAYLOAD` | Song title and artist are required. |
| Share | Resolve unknown share code | 404 | `NOT_FOUND` | Shared song was not found. |
| History | Authenticated create history without `method` | 400 | `METHOD_REQUIRED` | Recognition method is required. |
| History | Guest create history without song/title fields | 400 | `INVALID_PAYLOAD` | Please include a song title. |
| History | Delete history item that does not exist | 404 | `NOT_FOUND` | History item not found. |
| History | Delete history item owned by another user | 403 | `FORBIDDEN` | You cannot delete this history item. |
| Recognition | `/recognition/audio` called without uploaded `audio` file | 400 | `AUDIO_FILE_REQUIRED` | Please upload an audio file. |
| Recognition | `/recognition/image` called without uploaded `image` file | 400 | `IMAGE_FILE_REQUIRED` | Please upload an image file. |
| Recognition | Provider returns no verified match | 404 | `NO_VERIFIED_RESULT` | No confident match found. Try a clearer clip/image. |
| Recognition | Provider configuration missing/invalid | 500 | `PROVIDER_CONFIG_ERROR` | Recognition service is temporarily unavailable. |
| Recognition | Unexpected audio recognition failure | 500 | `AUDIO_RECOGNITION_FAILED` | Audio recognition failed. Please try again. |
| Recognition | Unexpected image recognition failure | 500 | `IMAGE_RECOGNITION_FAILED` | Image recognition failed. Please try again. |
| Rate limiting | API request limit exceeded | 429 | `RATE_LIMIT_EXCEEDED` | Too many requests. Please wait and retry. |
| Library | Sync library fails during persistence | 500 | `SYNC_FAILED` | Could not sync your library right now. |
| Library | Get library fails during persistence | 500 | `GET_LIBRARY_FAILED` | Could not load your library right now. |
| Playlists | Create/update playlist with blank name | 400 | `INVALID_NAME` | Playlist name is required. |
| Playlists | Get/update/delete playlist missing from storage | 404 | `NOT_FOUND` | Playlist was not found. |
| Playlists | Get/update/delete playlist owned by another user | 403 | `FORBIDDEN` | You cannot access that playlist. |
| Playlists | Add/remove song without title/artist | 400 | `MISSING_SONG_INFO` | Song title and artist are required. |
| Playlists | Playlist create operation throws internal error | 500 | `CREATE_FAILED` | Could not create playlist right now. |
| Playlists | Playlist list/read operation throws internal error | 500 | `GET_FAILED` | Could not load playlist data right now. |
| Playlists | Playlist rename operation throws internal error | 500 | `UPDATE_FAILED` | Could not update playlist right now. |
| Playlists | Add song operation throws internal error | 500 | `ADD_SONG_FAILED` | Could not add song to playlist. |
| Playlists | Remove song operation throws internal error | 500 | `REMOVE_SONG_FAILED` | Could not remove song from playlist. |
| Playlists | Delete playlist operation throws internal error | 500 | `DELETE_FAILED` | Could not delete playlist right now. |
| Platform | Unhandled exception in Express pipeline | 500 | `INTERNAL_ERROR` | Something went wrong. Please try again later. |
