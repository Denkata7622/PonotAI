/**
 * Playlist database operations test suite
 * Tests playlist CRUD operations and song management
 *
 * To run these tests:
 * npm install --save-dev jest @types/jest
 * npm test
 */

// Test utilities (when jest is available)
const describe = (name: string, fn: () => void) => { console.log(`\n${name}`); fn(); };
const it = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${e}`);
  }
};
const expect = (val: any) => ({
  toBe: (expected: any) => { if (val !== expected) throw new Error(`Expected ${expected}, got ${val}`); },
  toHaveLength: (len: number) => { if (val?.length !== len) throw new Error(`Expected length ${len}, got ${val?.length}`); },
  toEqual: (expected: any) => { if (JSON.stringify(val) !== JSON.stringify(expected)) throw new Error(`Not equal`); },
  toBeDefined: () => { if (val === undefined) throw new Error(`Expected defined, got undefined`); },
  toBeTruthy: () => { if (!val) throw new Error(`Expected truthy, got ${val}`); },
  toContainEqual: (expected: any) => { if (!val?.some((item: any) => JSON.stringify(item) === JSON.stringify(expected))) throw new Error(`Expected to contain ${JSON.stringify(expected)}`); },
});
const expectObject = { objectContaining: (obj: any) => obj };
const beforeAll = (fn: () => void) => fn();
const afterAll = (fn: () => void) => fn();

import * as db from "../src/db/authStore.ts";

describe("Playlist Database Operations", () => {
  const testUserId = "test-user-123";
  const testPlaylistId = "test-playlist-456";

  beforeAll(async () => {
    // Clean up before tests
    await db.deleteUserCascade(testUserId);
  });

  afterAll(async () => {
    // Clean up after tests
    await db.deleteUserCascade(testUserId);
  });

  it("should create a playlist with songs", async () => {
    const songs = [
      { title: "Song 1", artist: "Artist A", album: "Album 1", coverUrl: "http://example.com/1.jpg" },
      { title: "Song 2", artist: "Artist B", album: "Album 2", coverUrl: "http://example.com/2.jpg" },
    ];

    const playlist = await db.createPlaylist(testUserId, "My Playlist", testPlaylistId, songs);

    expect(playlist).toBeDefined();
    expect(playlist.id).toBe(testPlaylistId);
    expect(playlist.userId).toBe(testUserId);
    expect(playlist.name).toBe("My Playlist");
    expect(playlist.songs).toHaveLength(2);
    expect(playlist.songs[0]).toEqual(songs[0]);
  });

  it("should add a song to an existing playlist", async () => {
    await db.createPlaylist(testUserId, "Test Playlist");
    const playlists = await db.getUserPlaylists(testUserId);
    const playlistId = playlists[0].id;

    const newSong = { title: "New Song", artist: "New Artist", album: "New Album" };
    const updated = await db.addSongToPlaylist(playlistId, newSong);

    expect(updated).toBeDefined();
    const hasSong = updated!.songs.some((s: any) => s.title === newSong.title && s.artist === newSong.artist);
    if (!hasSong) throw new Error("Song not found in playlist");
  });

  it("should not add duplicate songs to a playlist", async () => {
    const song = { title: "Duplicate", artist: "Artist", album: "Album" };
    await db.createPlaylist(testUserId, "Dup Test", "dup-test-1", [song]);
    const playlists = await db.getUserPlaylists(testUserId);
    const playlistId = playlists[0].id;

    // Try to add the same song again
    const updated = await db.addSongToPlaylist(playlistId, song);

    expect(updated!.songs.filter((s) => s.title === "Duplicate")).toHaveLength(1);
  });

  it("should remove a song from a playlist", async () => {
    const songs = [
      { title: "Keep Me", artist: "Artist A" },
      { title: "Remove Me", artist: "Artist B" },
    ];
    await db.createPlaylist(testUserId, "Remove Test", "remove-test-1", songs);
    const playlists = await db.getUserPlaylists(testUserId);
    const playlistId = playlists[0].id;

    const updated = await db.removeSongFromPlaylist(playlistId, "Remove Me", "Artist B");

    expect(updated!.songs).toHaveLength(1);
    expect(updated!.songs[0].title).toBe("Keep Me");
  });

  it("should delete a playlist", async () => {
    await db.createPlaylist(testUserId, "Delete Test", "delete-test-1");
    const playlists = await db.getUserPlaylists(testUserId);
    const playlistId = playlists[0].id;

    const result = await db.deletePlaylist(playlistId);

    expect(result).toBe("ok");
    const afterDelete = await db.getUserPlaylists(testUserId);
    expect(afterDelete).toHaveLength(0);
  });

  it("should get all user playlists", async () => {
    await db.createPlaylist(testUserId, "Playlist 1");
    await db.createPlaylist(testUserId, "Playlist 2");

    const playlists = await db.getUserPlaylists(testUserId);

    expect(playlists).toHaveLength(2);
    expect(playlists[0].userId).toBe(testUserId);
    expect(playlists[1].userId).toBe(testUserId);
  });

  it("should update playlist name", async () => {
    await db.createPlaylist(testUserId, "Old Name", "rename-test-1");
    const playlists = await db.getUserPlaylists(testUserId);
    const playlistId = playlists[0].id;

    const updated = await db.updatePlaylistName(playlistId, "New Name");

    expect(updated!.name).toBe("New Name");
  });

  it("should find a playlist by ID", async () => {
    await db.createPlaylist(testUserId, "Find Me", "find-test-1");

    const found = await db.findPlaylistById("find-test-1");

    expect(found).toBeDefined();
    expect(found!.name).toBe("Find Me");
    expect(found!.userId).toBe(testUserId);
  });

  it("should cascade delete playlists when user is deleted", async () => {
    const userId = "cascade-test-user";
    await db.createUser({
      username: "cascadetest",
      email: "cascade@test.com",
      passwordHash: "hash",
    });

    await db.createPlaylist(userId, "Cascade Playlist 1");
    await db.createPlaylist(userId, "Cascade Playlist 2");

    let playlists = await db.getUserPlaylists(userId);
    expect(playlists).toHaveLength(2);

    await db.deleteUserCascade(userId);

    playlists = await db.getUserPlaylists(userId);
    expect(playlists).toHaveLength(0);
  });
});
