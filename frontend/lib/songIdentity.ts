import { normalizeTrackKey } from "./dedupe";

export type SongIdentityInput = {
  title?: string | null;
  songName?: string | null;
  artist?: string | null;
  album?: string | null;
  coverUrl?: string | null;
  artworkUrl?: string | null;
  albumArtUrl?: string | null;
  youtubeVideoId?: string | null;
  videoId?: string | null;
};

export type CanonicalSong = {
  key: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  videoId?: string;
};

function normalizeText(value?: string | null): string {
  return (value ?? "").trim();
}

export function toCanonicalSong(input: SongIdentityInput): CanonicalSong {
  const title = normalizeText(input.title ?? input.songName) || "Unknown Song";
  const artist = normalizeText(input.artist) || "Unknown Artist";

  return {
    key: normalizeTrackKey(title, artist),
    title,
    artist,
    album: normalizeText(input.album) || undefined,
    coverUrl: normalizeText(input.coverUrl ?? input.artworkUrl ?? input.albumArtUrl) || undefined,
    videoId: normalizeText(input.videoId ?? input.youtubeVideoId) || undefined,
  };
}

export function toSongKey(input: Pick<SongIdentityInput, "title" | "songName" | "artist">): string {
  const canonical = toCanonicalSong(input);
  return canonical.key;
}

export function isSameSongIdentity(a: SongIdentityInput, b: SongIdentityInput): boolean {
  return toSongKey(a) === toSongKey(b);
}
