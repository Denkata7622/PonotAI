# Error matrix

Standard backend error shape used by all failed API responses:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "details": {},
  "requestId": "optional-request-id"
}
```

| Failure case | HTTP status | Error code | UI message |
| --- | ---: | --- | --- |
| Missing/invalid auth token | 401 | `UNAUTHORIZED` | Please sign in to continue. |
| Forbidden resource access | 403 | `FORBIDDEN` | You do not have permission to do that. |
| Resource does not exist | 404 | `NOT_FOUND` | We couldn't find what you requested. |
| Invalid request payload | 400 | `INVALID_PAYLOAD` | Some required fields are missing or invalid. |
| Invalid username format | 400 | `INVALID_USERNAME` | Username must be 3–30 letters, numbers, or underscore. |
| Invalid email format | 400 | `INVALID_EMAIL` | Enter a valid email address. |
| Weak password at register | 400 | `WEAK_PASSWORD` | Password must be at least 8 characters. |
| Username already exists | 409 | `USERNAME_TAKEN` | That username is already in use. |
| Email already exists | 409 | `EMAIL_TAKEN` | That email is already in use. |
| Invalid login/password | 401 | `INVALID_CREDENTIALS` | Invalid email or password. |
| Invalid password change payload | 400 | `INVALID_PASSWORD` | Check your current/new password and try again. |
| Missing playlist name | 400 | `INVALID_NAME` | Playlist name is required. |
| Missing song title or artist | 400 | `MISSING_SONG_INFO` | Song title and artist are required. |
| Missing history method for user entry | 400 | `METHOD_REQUIRED` | Recognition method is required. |
| Missing audio upload | 400 | `AUDIO_FILE_REQUIRED` | Upload an audio file in the `audio` field. |
| Missing image upload | 400 | `IMAGE_FILE_REQUIRED` | Upload an image file in the `image` field. |
| Recognition yielded no verified match | 404 | `NO_VERIFIED_RESULT` | No confident match found—try clearer input. |
| Recognition provider misconfigured | 500 | `PROVIDER_CONFIG_ERROR` | Recognition service is temporarily unavailable. |
| Audio recognition unexpected failure | 500 | `AUDIO_RECOGNITION_FAILED` | Audio recognition failed, please retry. |
| Image recognition unexpected failure | 500 | `IMAGE_RECOGNITION_FAILED` | Image recognition failed, please retry. |
| Recognition rate limit exceeded | 429 | `TOO_MANY_RECOGNITION_REQUESTS` | Too many attempts. Please wait and retry. |
| Login rate limit exceeded | 429 | `TOO_MANY_LOGIN_ATTEMPTS` | Too many login attempts. Try again later. |
| Playlist create failed | 500 | `CREATE_FAILED` | Could not create the playlist. |
| Generic fetch/read failure | 500 | `GET_FAILED` | Could not load data right now. |
| Playlist/library update failed | 500 | `UPDATE_FAILED` | Could not update data right now. |
| Adding song failed | 500 | `ADD_SONG_FAILED` | Could not add song to playlist. |
| Removing song failed | 500 | `REMOVE_SONG_FAILED` | Could not remove song from playlist. |
| Deleting playlist/resource failed | 500 | `DELETE_FAILED` | Could not delete data right now. |
| Library synchronization failed | 500 | `SYNC_FAILED` | Could not sync library right now. |
| Library retrieval failed | 500 | `GET_LIBRARY_FAILED` | Could not load your library. |
| Unhandled server error fallback | 500 | `INTERNAL_SERVER_ERROR` | Something went wrong on our side. |
