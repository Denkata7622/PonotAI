const COMBINING_MARKS = /[\u0300-\u036f]/g;
const APOSTROPHES = /['’`´]/g;
const NON_ALPHANUMERIC = /[^a-z0-9\s]/g;
const WHITESPACE = /\s+/g;
const FEAT_SUFFIX = /(?:\s*[-–—]\s*|\s+)(?:\(|\[)?(?:feat\.?|ft\.?|featuring)\s+[^\])]+(?:\)|\])?\s*$/i;

export type SongIdentityInput = {
  title?: string | null;
  songName?: string | null;
  artist?: string | null;
  artistName?: string | null;
  album?: string | null;
  coverUrl?: string | null;
  artworkUrl?: string | null;
  albumArtUrl?: string | null;
  thumbnailUrl?: string | null;
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

function normalizeForIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(APOSTROPHES, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, " ")
    .replace(WHITESPACE, " ")
    .trim();
}

function normalizeTitlePart(value: string): string {
  const withoutFeatTail = value.replace(FEAT_SUFFIX, " ");
  return normalizeForIdentity(withoutFeatTail || value);
}

function normalizeArtistPart(value: string): string {
  const collapsed = value
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+/gi, " ")
    .replace(/\s*(?:&|and|x|,|;|\/)\s*/gi, " ");
  return normalizeForIdentity(collapsed || value);
}

export function normalizeTrackKey(title: string, artist: string): string {
  const normalizedTitle = normalizeTitlePart(title || "unknown song") || "unknown song";
  const normalizedArtist = normalizeArtistPart(artist || "unknown artist") || "unknown artist";
  return `${normalizedTitle}|||${normalizedArtist}`;
}

export function toCanonicalSong(input: SongIdentityInput): CanonicalSong {
  const title = normalizeText(input.title ?? input.songName) || "Unknown Song";
  const artist = normalizeText(input.artist ?? input.artistName) || "Unknown Artist";

  return {
    key: normalizeTrackKey(title, artist),
    title,
    artist,
    album: normalizeText(input.album) || undefined,
    coverUrl: normalizeText(input.coverUrl ?? input.artworkUrl ?? input.albumArtUrl ?? input.thumbnailUrl) || undefined,
    videoId: normalizeText(input.videoId ?? input.youtubeVideoId) || undefined,
  };
}

export function toSongKey(input: Pick<SongIdentityInput, "title" | "songName" | "artist" | "artistName">): string {
  const canonical = toCanonicalSong(input);
  return canonical.key;
}

export function isSameSongIdentity(a: SongIdentityInput, b: SongIdentityInput): boolean {
  return toSongKey(a) === toSongKey(b);
}
