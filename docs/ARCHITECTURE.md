# 🎵 Playlist Enhancement - Architecture Diagram

## Component Hierarchy

```
LibraryPage (frontend/app/library/page.tsx)
├── State Management
│   ├── playlists[] - All user playlists
│   ├── selectedPlaylist - Currently selected for detail view
│   ├── showPlaylistDetail - Modal visibility flag
│   ├── selectedTab - Active tab (history/favorites/playlists)
│   ├── searchQuery - Search filter
│   └── ... (other state vars)
│
├── Handlers
│   ├── handlePlaylistCardClick() → Opens modal
│   ├── handlePlaylistDetailClose() → Closes modal
│   ├── handlePlayPlaylistSong() → Adds song to queue
│   ├── handleRemoveSongFromPlaylist() → API + state sync
│   ├── handlePlaylistDetailDelete() → API + closes modal
│   ├── handlePlaylistRename() → API + state sync
│   └── ... (other handlers)
│
├── JSX Structure
│   ├── Header & Statistics
│   ├── Tab Navigation
│   ├── Search Bar
│   ├── Content Area
│   │   ├── History Tab
│   │   ├── Favorites Tab
│   │   └── Playlists Tab
│   │       └── Playlist Cards (Grid)
│   │           └── onClick → handlePlaylistCardClick()
│   │
│   └── PlaylistDetail Modal
│       └── Rendered when showPlaylistDetail && selectedPlaylist

PlaylistDetail (frontend/components/PlaylistDetail.tsx)
├── Props
│   ├── playlist - The playlist to display
│   ├── onClose - Callback to close modal
│   ├── onPlaySong - Callback when play button clicked
│   ├── onRemoveSong - Callback when remove clicked
│   ├── onDeletePlaylist - Callback when delete clicked
│   └── onRenamePlaylist - Callback when rename submitted
│
├── Internal State
│   ├── isRenaming - Whether inline rename is active
│   ├── newName - Current rename input value
│   └── songMenuOpen - Which song's options menu is open
│
├── JSX Structure
│   ├── Modal Overlay (fixed, z-50)
│   ├── Header
│   │   ├── Playlist Name + Edit Button
│   │   ├── Song Count + Date
│   │   └── Rename Input (conditional)
│   ├── Song List
│   │   └── For Each Song
│   │       ├── Album Artwork
│   │       ├── Title + Artist + Album
│   │       ├── Play Button (▶)
│   │       │   └── onClick → onPlaySong(song)
│   │       └── Options Menu (⋯)
│   │           ├── Open in Spotify
│   │           ├── Open in YouTube
│   │           ├── Copy Song Name
│   │           └── Remove from Playlist
│   └── Footer
│       └── Delete Playlist Button
```

## Data Flow Diagrams

### Flow 1: Playing a Song from Playlist

```
User Clicks Play Button (▶)
    │
    ├─→ PlaylistDetail Component
    │       │
    │       └─→ onPlaySong(song) Callback
    │               │
    │               ├─→ handlePlayPlaylistSong(song)
    │               │       │
    │               │       ├─→ Convert song to queue format
    │               │       └─→ addToQueue(queueItem)
    │               │
    │               └─→ PlayerProvider
    │                   └─→ Add to queue
    │                   └─→ Start playing
    │
    └─→ ✅ Song Now Playing!
```

### Flow 2: Removing a Song from Playlist

```
User Clicks Options (⋯) → "Remove from Playlist"
    │
    ├─→ PlaylistDetail Component
    │       │
    │       └─→ Show Confirmation Dialog
    │               │
    │               └─→ User Confirms
    │                   │
    │                   └─→ onRemoveSong(title, artist) Callback
    │                       │
    │                       ├─→ handleRemoveSongFromPlaylist()
    │                       │   │
    │                       │   ├─→ API Call: removeSongFromPlaylist()
    │                       │   │   └─→ Backend processes
    │                       │   │
    │                       │   ├─→ Update playlists[] state
    │                       │   │   └─→ Filter out removed song
    │                       │   │
    │                       │   └─→ Update selectedPlaylist state
    │                       │       └─→ Filter out removed song
    │                       │
    │                       └─→ PlaylistDetail re-renders
    │                           └─→ Song list updated
    │
    └─→ ✅ Song Removed!
```

### Flow 3: Renaming a Playlist

```
User Clicks Rename Button
    │
    ├─→ PlaylistDetail Component
    │       │
    │       └─→ Set isRenaming = true
    │               │
    │               └─→ Show inline input
    │                   │
    │                   └─→ User types new name
    │                       │
    │                       ├─→ User presses Enter OR clicks Save
    │                       │   │
    │                       │   └─→ onRenamePlaylist(newName) Callback
    │                       │       │
    │                       │       ├─→ handlePlaylistRename()
    │                       │       │   │
    │                       │       │   ├─→ API Call: updatePlaylistName()
    │                       │       │   │   └─→ Backend updates
    │                       │       │   │
    │                       │       │   └─→ Update playlists[] state
    │                       │       │       └─→ Find and update by ID
    │                       │       │
    │                       │       ├─→ Update selectedPlaylist state
    │                       │       │   └─→ New name shown in modal
    │                       │       │
    │                       │       └─→ Set isRenaming = false
    │                       │
    │                       └─→ PlaylistDetail re-renders
    │                           └─→ Header shows new name
    │
    └─→ ✅ Playlist Renamed!
```

### Flow 4: Deleting a Playlist

```
User Clicks Delete Button
    │
    ├─→ PlaylistDetail Component
    │       │
    │       └─→ Show Confirmation Dialog
    │               │
    │               └─→ User Confirms
    │                   │
    │                   └─→ onDeletePlaylist() Callback
    │                       │
    │                       ├─→ handlePlaylistDetailDelete()
    │                       │   │
    │                       │   ├─→ API Call: deletePlaylist()
    │                       │   │   └─→ Backend deletes
    │                       │   │
    │                       │   ├─→ Update playlists[] state
    │                       │   │   └─→ Filter out deleted playlist
    │                       │   │
    │                       │   └─→ handlePlaylistDetailClose()
    │                       │       ├─→ Set showPlaylistDetail = false
    │                       │       └─→ Set selectedPlaylist = null
    │                       │
    │                       └─→ Modal closes
    │                           └─→ LibraryPage re-renders
    │                           └─→ Playlist removed from grid
    │
    └─→ ✅ Playlist Deleted!
```

## State Update Diagram

```
LibraryPage State
│
├─ playlists[]
│   │   {
│   │     id: "p1",
│   │     name: "My Mix",
│   │     songs: [
│   │       { title: "Song 1", artist: "Artist 1", album: "Album", coverUrl: "url" },
│   │       { title: "Song 2", artist: "Artist 2", album: "Album", coverUrl: "url" }
│   │     ]
│   │   }
│   └─ Updated by: createPlaylist, deletePlaylist, updatePlaylistName, removeSongFromPlaylist
│
├─ selectedPlaylist (mirrors one item from playlists[])
│   │   {
│   │     id: "p1",
│   │     name: "My Mix",
│   │     songs: [...]
│   │   }
│   │
│   └─ Updated by: handlePlaylistCardClick, handleRemoveSongFromPlaylist, handlePlaylistRename
│
├─ showPlaylistDetail (boolean)
│   │   true when modal should display
│   │   false when modal should close
│   │
│   └─ Updated by: handlePlaylistCardClick, handlePlaylistDetailClose
│
└─ Other state...
    expandedPlaylistId, songMenuOpen, etc.
```

## API Call Sequence

```
Client (React)                    Backend (Express)
│                                 │
├─ Play Song ─────────────────────┤ (No API call, local only)
│   │ Adds to queue via PlayerProvider
│   │
├─ Remove Song ───────────────────┤
│   │ POST /api/playlists/:id/songs
│   │─────────────────────────────→ Delete song from playlist
│   │←───────────────────────────── 200 OK
│   │ Update local state
│   │
├─ Rename Playlist ────────────────┤
│   │ PATCH /api/playlists/:id
│   │─────────────────────────────→ Update playlist name
│   │←───────────────────────────── 200 OK
│   │ Update local state
│   │
├─ Delete Playlist ────────────────┤
│   │ DELETE /api/playlists/:id
│   │─────────────────────────────→ Delete entire playlist
│   │←───────────────────────────── 200 OK
│   │ Update local state
│   │
└─ On Modal Open ──────────────────┤
    │ (Uses existing playlists[] from initial fetch)
    │ No extra API call needed
    │
```

## Component Interaction Map

```
┌─────────────────────────────────────┐
│         LibraryPage                 │
│  (State Management Hub)             │
└────────────┬────────────────────────┘
             │
    ┌────────┴─────────┬──────────────┐
    │                  │              │
    │                  │              │
    v                  v              v
┌─────────┐      ┌────────────┐   ┌──────────────────┐
│Player   │      │Playlist    │   │PlaylistDetail    │
│Provider │      │Grid        │   │Modal (Bonus UI)  │
└─────────┘      └────────────┘   └──────────────────┘
    ^                  ^                   ^
    │                  │                   │
    └──────────────────┴───────────────────┘
         API Layer (features/library/api.ts)
              │
              └──────────────────────┐
                                     v
                           ┌──────────────────┐
                           │Backend API       │
                           │/api/playlists/*  │
                           └──────────────────┘
```

## File Organization

```
frontend/
├── app/
│   └── library/
│       └── page.tsx ← LibraryPage (Main + Modal Integration)
│
├── components/
│   ├── PlaylistDetail.tsx ← NEW (Modal Component)  ✨
│   ├── HomeContent.tsx
│   ├── AppShell.tsx
│   └── ... other components
│
├── features/
│   └── library/
│       ├── api.ts (getPlaylists, removeFromPlaylist, etc.)
│       ├── types.ts (Playlist, PlaylistSong types)
│       ├── useLibrary.ts (Custom hook)
│       └── storage.ts (localStorage fallback)
│
└── tests/
    ├── playlist-integration.test.ts ← NEW (Tests) ✨
    └── ... other tests
```

## Summary

This architecture provides:

1. **Clean Separation of Concerns**
   - Modal component is presentational only
   - Page handles state and API calls
   - API layer isolated from UI

2. **Unidirectional Data Flow**
   - State flows down from LibraryPage → PlaylistDetail
   - Events flow up via callbacks
   - No prop drilling

3. **Efficient Updates**
   - Optimistic UI updates
   - Minimal re-renders
   - Proper dependency management

4. **Error Handling**
   - Try-catch on all API calls
   - Graceful fallbacks
   - User feedback

5. **Testability**
   - Isolated components
   - Pure functions where possible
   - Mock-friendly architecture
