export type MetadataSource = "import" | "recognition" | "youtube" | "filename" | "query" | "fallback";
export type MetadataConfidence = "high" | "medium" | "low";
export type CoverSource = "import" | "youtube" | "musicbrainz" | "cover-art-archive" | "fallback";

export type CoverCandidate = {
  url?: string;
  data?: Uint8Array | ArrayBuffer | Blob;
  mimeType?: string;
  width?: number;
  height?: number;
  source: CoverSource;
  confidence: MetadataConfidence;
};

export type ResolvedTrackMetadata = {
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  date?: string;
  year?: string;
  genre?: string;
  trackNumber?: number;
  discNumber?: number;
  comment?: string;
  rawTitle?: string;
  rawArtist?: string;
  rawAlbum?: string;
  sourceTitle?: string;
  sourceArtist?: string;
  source?: MetadataSource;
  confidence: MetadataConfidence;
  cleanupApplied: string[];
  warnings: string[];
  coverCandidates: CoverCandidate[];
};

export type TrackMetadataInput = {
  title?: unknown;
  songName?: unknown;
  name?: unknown;
  artist?: unknown;
  artists?: unknown;
  album?: unknown;
  albumArtist?: unknown;
  album_artist?: unknown;
  date?: unknown;
  year?: unknown;
  releaseYear?: unknown;
  genre?: unknown;
  trackNumber?: unknown;
  track_number?: unknown;
  discNumber?: unknown;
  disc_number?: unknown;
  query?: unknown;
  filename?: unknown;
  sourceTitle?: unknown;
  sourceArtist?: unknown;
  youtubeTitle?: unknown;
  youtubeUploader?: unknown;
  youtubeChannel?: unknown;
  platformLinks?: unknown;
  metadata?: unknown;
  youtubeInfo?: unknown;
  raw?: unknown;
};

const UNKNOWN_TITLE = "Unknown Title";
const UNKNOWN_ARTIST = "Unknown Artist";
const MAX_FILENAME_BASE_LENGTH = 120;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const SPLIT_DASH_REGEX = /\s+[-\u2013\u2014]\s+/;
const MEANINGFUL_VERSION_REGEX = /\b(live|acoustic|remaster(?:ed)?|remix|mix|edit|version|feat\.?|featuring|ft\.?|demo|session|mono|stereo|explicit|clean|radio)\b/i;
const BRACKET_JUNK_REGEX = /^(official\s*)?(music\s*)?(video|audio|lyric(?:s)?\s*video|lyric(?:s)?|visuali[sz]er|mv|hd|hq|4k|8k|full\s*(album|song)|new\s*song|youtube)$/i;
const INLINE_JUNK_REGEXES: RegExp[] = [
  /\b(?:official\s+)?music\s+video\b/gi,
  /\bofficial\s+video\b/gi,
  /\bofficial\s+audio\b/gi,
  /\bofficial\s+lyric(?:s)?\s+video\b/gi,
  /\blyric(?:s)?\s+video\b/gi,
  /\bvisuali[sz]er\b/gi,
  /\bprovided\s+to\s+youtube\s+by\b.*$/gi,
  /\bauto-generated\s+by\s+youtube\.?\b/gi,
];
const SIMPLE_TRAILING_JUNK_REGEX = /\s+(?:official|audio|video|lyrics?|hd|hq|4k|8k|mv)$/i;
const COVER_KEYS = new Set([
  "cover",
  "coverurl",
  "cover_url",
  "artwork",
  "artworkurl",
  "artwork_url",
  "image",
  "imageurl",
  "image_url",
  "thumbnail",
  "thumbnailurl",
  "thumbnail_url",
  "albumart",
  "albumarturl",
  "album_art",
  "spotifyalbumart",
  "applemusicartwork",
  "releaseimage",
]);

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.replace(/\u0000/g, "").trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function firstString(values: unknown[]): string | undefined {
  for (const value of values) {
    const text = stringFromUnknown(value);
    if (text) return text;
  }
  return undefined;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeFeaturing(value: string): string {
  return value
    .replace(/\bfeaturing\b/gi, "feat.")
    .replace(/\bft\.\s*/gi, "feat. ")
    .replace(/\bfeat\.\s*/gi, "feat. ");
}

function stripYoutubeArtistSuffix(value: string, cleanupApplied: string[]): string {
  let result = value.trim();
  const before = result;
  result = result.replace(/\s*-\s*Topic$/i, "").trim();
  if (result !== before) cleanupApplied.push("stripped-topic-channel-suffix");
  const vevoBefore = result;
  result = result.replace(/VEVO$/i, "").trim();
  if (result !== vevoBefore && result) cleanupApplied.push("stripped-uploader-vevo-suffix");
  return result || before;
}

function cleanBracketedText(value: string, cleanupApplied: string[]): string {
  return value.replace(/[\[(\u3010]([^\])\u3011]*)[\])\u3011]/g, (match, inner: string) => {
    const normalizedInner = normalizeWhitespace(inner);
    if (!normalizedInner) return "";
    if (MEANINGFUL_VERSION_REGEX.test(normalizedInner)) return match;
    if (BRACKET_JUNK_REGEX.test(normalizedInner)) {
      cleanupApplied.push(`removed-${normalizedInner.toLowerCase().replace(/\s+/g, "-")}`);
      return "";
    }
    return match;
  });
}

function cleanTitle(value: string, cleanupApplied: string[]): string {
  let result = value.replace(/\u2018|\u2019/g, "'").replace(/\u201c|\u201d/g, "\"");
  result = cleanBracketedText(result, cleanupApplied);
  for (const regex of INLINE_JUNK_REGEXES) {
    const before = result;
    result = result.replace(regex, "");
    if (result !== before) cleanupApplied.push("removed-youtube-title-junk");
  }
  const simpleBefore = result;
  result = result.replace(SIMPLE_TRAILING_JUNK_REGEX, "");
  if (result !== simpleBefore) cleanupApplied.push("removed-trailing-title-junk");
  return normalizeWhitespace(normalizeFeaturing(result).replace(/\s+[-|:]\s*$/g, "")) || normalizeWhitespace(value);
}

function cleanArtist(value: string, cleanupApplied: string[]): string {
  const asText = normalizeArtists(value);
  return normalizeWhitespace(normalizeFeaturing(stripYoutubeArtistSuffix(asText, cleanupApplied))) || normalizeWhitespace(value);
}

function normalizeArtists(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        const record = recordFromUnknown(entry);
        return stringFromUnknown(record?.name) || stringFromUnknown(record?.artist) || "";
      })
      .filter(Boolean)
      .join(", ");
  }
  return stringFromUnknown(value) || "";
}

function parseTitleArtist(raw: string): { title: string; artist?: string; pattern: string } | undefined {
  const value = normalizeWhitespace(raw);
  if (!value) return undefined;

  const byMatch = value.match(/^(.+?)\s+by\s+(.+?)$/i);
  if (byMatch?.[1] && byMatch[2]) {
    return { title: byMatch[1], artist: byMatch[2], pattern: "title-by-artist" };
  }

  const dashParts = value.split(SPLIT_DASH_REGEX);
  if (dashParts.length >= 2) {
    const artist = dashParts.shift()?.trim();
    const title = dashParts.join(" - ").trim();
    if (artist && title) return { artist, title, pattern: "artist-dash-title" };
  }

  const colonMatch = value.match(/^([^:]{2,80}):\s*(.{2,})$/);
  if (colonMatch?.[1] && colonMatch[2]) {
    return { artist: colonMatch[1], title: colonMatch[2], pattern: "artist-colon-title" };
  }

  return { title: value, pattern: "title-only" };
}

function validHttpUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    if (parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function pushCoverCandidate(candidates: CoverCandidate[], seen: Set<string>, url: string | undefined, source: CoverSource, confidence: MetadataConfidence, width?: number, height?: number, mimeType?: string): void {
  const safe = validHttpUrl(url);
  if (!safe || seen.has(safe)) return;
  seen.add(safe);
  candidates.push({ url: safe, source, confidence, width, height, mimeType });
}

function collectCoverCandidatesFromValue(value: unknown, source: CoverSource, confidence: MetadataConfidence, candidates: CoverCandidate[], seen: Set<string>, depth = 0): void {
  if (depth > 4 || value == null) return;
  if (typeof value === "string") {
    pushCoverCandidate(candidates, seen, value, source, confidence);
    return;
  }
  if (Array.isArray(value)) {
    const thumbnailObjects = value
      .map((entry) => recordFromUnknown(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .sort((a, b) => {
        const areaA = (numberFromUnknown(a.width) || 0) * (numberFromUnknown(a.height) || 0);
        const areaB = (numberFromUnknown(b.width) || 0) * (numberFromUnknown(b.height) || 0);
        const preferenceA = numberFromUnknown(a.preference) || 0;
        const preferenceB = numberFromUnknown(b.preference) || 0;
        return (areaB + preferenceB) - (areaA + preferenceA);
      });
    for (const entry of thumbnailObjects) {
      pushCoverCandidate(candidates, seen, stringFromUnknown(entry.url), source, confidence, numberFromUnknown(entry.width), numberFromUnknown(entry.height), stringFromUnknown(entry.mimeType));
    }
    for (const entry of value) collectCoverCandidatesFromValue(entry, source, confidence, candidates, seen, depth + 1);
    return;
  }
  const record = recordFromUnknown(value);
  if (!record) return;
  const direct = firstString([record.url, record.coverUrl, record.imageUrl, record.src]);
  if (direct) {
    pushCoverCandidate(candidates, seen, direct, source, confidence, numberFromUnknown(record.width), numberFromUnknown(record.height), stringFromUnknown(record.mimeType) || stringFromUnknown(record.type));
  }
  for (const [key, nested] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (COVER_KEYS.has(normalizedKey) || normalizedKey === "images" || normalizedKey === "thumbnails" || normalizedKey === "covercandidates" || normalizedKey === "album") {
      collectCoverCandidatesFromValue(nested, source, confidence, candidates, seen, depth + 1);
    }
  }
}

export function collectCoverCandidates(input: TrackMetadataInput): CoverCandidate[] {
  const candidates: CoverCandidate[] = [];
  const seen = new Set<string>();
  collectCoverCandidatesFromValue(input.raw, "import", "high", candidates, seen);
  collectCoverCandidatesFromValue(input.metadata, "import", "high", candidates, seen);
  collectCoverCandidatesFromValue(input.platformLinks, "import", "medium", candidates, seen);
  collectCoverCandidatesFromValue(input.youtubeInfo, "youtube", "medium", candidates, seen);
  const youtube = recordFromUnknown(input.youtubeInfo);
  pushCoverCandidate(candidates, seen, stringFromUnknown(youtube?.thumbnail), "youtube", "medium");
  collectCoverCandidatesFromValue(youtube?.thumbnails, "youtube", "medium", candidates, seen);
  return candidates;
}

function metadataRecord(input: TrackMetadataInput): Record<string, unknown> {
  const metadata = recordFromUnknown(input.metadata) || {};
  const originalImport = recordFromUnknown(metadata.originalImport) || {};
  return { ...originalImport, ...metadata };
}

export function resolveTrackMetadata(input: TrackMetadataInput): ResolvedTrackMetadata {
  const cleanupApplied: string[] = [];
  const warnings: string[] = [];
  const meta = metadataRecord(input);
  const youtube = recordFromUnknown(input.youtubeInfo) || {};

  const rawTitle = firstString([input.title, input.songName, input.name, meta.title, meta.songName, meta.name]);
  const rawArtist = normalizeArtists(input.artist) || normalizeArtists(input.artists) || normalizeArtists(meta.artist) || normalizeArtists(meta.artists);
  const sourceTitle = firstString([input.sourceTitle, input.youtubeTitle, youtube.title, input.query, input.filename, meta.rawText]);
  const sourceArtist = firstString([input.sourceArtist, input.youtubeUploader, input.youtubeChannel, youtube.uploader, youtube.channel, youtube.artist]);
  const rawAlbum = firstString([input.album, meta.album, youtube.album]);

  let title = rawTitle;
  let artist = rawArtist;
  let source: MetadataSource = rawTitle || rawArtist ? "import" : "fallback";
  let confidence: MetadataConfidence = rawTitle && rawArtist ? "high" : "low";

  if (title && artist) {
    title = cleanTitle(title, cleanupApplied);
    artist = cleanArtist(artist, cleanupApplied);
  } else {
    const parsed = parseTitleArtist(sourceTitle || "");
    if (parsed) {
      title ||= parsed.title;
      const artistCandidate = parsed.artist || sourceArtist;
      if (!artist && artistCandidate) artist = artistCandidate;
      source = sourceTitle === youtube.title ? "youtube" : sourceTitle === input.filename ? "filename" : sourceTitle === input.query ? "query" : "youtube";
      confidence = parsed.artist ? "medium" : "low";
      if (parsed.pattern !== "title-only") cleanupApplied.push(`parsed-${parsed.pattern}`);
    }
    title = cleanTitle(title || UNKNOWN_TITLE, cleanupApplied);
    artist = artist ? cleanArtist(artist, cleanupApplied) : cleanArtist(sourceArtist || UNKNOWN_ARTIST, cleanupApplied);
  }

  if (!rawTitle && !rawArtist && !sourceTitle) warnings.push("Metadata source was missing; fallback title/artist used.");
  if (!artist || artist === UNKNOWN_ARTIST) warnings.push("Artist metadata has low confidence.");
  if (!title || title === UNKNOWN_TITLE) warnings.push("Title metadata has low confidence.");
  if (rawTitle && rawArtist) source = "recognition";

  const yearText = firstString([input.year, meta.year, input.releaseYear, meta.releaseYear, youtube.release_year, youtube.releaseYear]);
  const dateText = firstString([input.date, meta.date, youtube.release_date, youtube.upload_date, yearText]);
  const genre = firstString([input.genre, meta.genre, youtube.genre]);
  const albumArtist = firstString([input.albumArtist, input.album_artist, meta.albumArtist, meta.album_artist, youtube.album_artist]) || artist;

  return {
    title: title || UNKNOWN_TITLE,
    artist: artist || UNKNOWN_ARTIST,
    album: rawAlbum ? normalizeWhitespace(rawAlbum) : undefined,
    albumArtist: albumArtist ? normalizeWhitespace(albumArtist) : undefined,
    date: dateText,
    year: yearText,
    genre,
    trackNumber: numberFromUnknown(input.trackNumber) || numberFromUnknown(input.track_number) || numberFromUnknown(meta.trackNumber) || numberFromUnknown(meta.track_number),
    discNumber: numberFromUnknown(input.discNumber) || numberFromUnknown(input.disc_number) || numberFromUnknown(meta.discNumber) || numberFromUnknown(meta.disc_number),
    rawTitle,
    rawArtist,
    rawAlbum,
    sourceTitle,
    sourceArtist,
    source,
    confidence,
    cleanupApplied: Array.from(new Set(cleanupApplied)),
    warnings: Array.from(new Set(warnings)),
    coverCandidates: collectCoverCandidates(input),
  };
}

export function sanitizeFileName(input: string, fallback = "untitled", maxLength = MAX_FILENAME_BASE_LENGTH): string {
  const withoutPaths = (input || "")
    .replace(/^[a-zA-Z]:/, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  let cleaned = withoutPaths.slice(0, maxLength).replace(/[. ]+$/g, "") || fallback;
  const extIndex = cleaned.lastIndexOf(".");
  const base = extIndex > 0 ? cleaned.slice(0, extIndex) : cleaned;
  const ext = extIndex > 0 ? cleaned.slice(extIndex) : "";
  if (WINDOWS_RESERVED_NAMES.test(base)) cleaned = `_${base}${ext}`;
  return cleaned || fallback;
}

export function formatTrackFileBase(metadata: Pick<ResolvedTrackMetadata, "title" | "artist">): string {
  const title = metadata.title || UNKNOWN_TITLE;
  const artist = metadata.artist && metadata.artist !== UNKNOWN_ARTIST ? metadata.artist : "";
  return artist ? `${artist} - ${title}` : title;
}

export function createSafeTrackFileName(metadata: Pick<ResolvedTrackMetadata, "title" | "artist">, extension = ".mp3"): string {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  const base = sanitizeFileName(formatTrackFileBase(metadata), "track", MAX_FILENAME_BASE_LENGTH);
  return sanitizeFileName(`${base}${ext}`, "track.mp3", MAX_FILENAME_BASE_LENGTH + ext.length);
}

export function getUniqueFileName(fileName: string, used: Set<string>): string {
  const safeName = sanitizeFileName(fileName);
  const key = safeName.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return safeName;
  }

  const extIndex = safeName.lastIndexOf(".");
  const base = extIndex > 0 ? safeName.slice(0, extIndex) : safeName;
  const ext = extIndex > 0 ? safeName.slice(extIndex) : "";
  let counter = 2;

  while (true) {
    const candidate = sanitizeFileName(`${base} (${counter})${ext}`);
    const candidateKey = candidate.toLowerCase();
    if (!used.has(candidateKey)) {
      used.add(candidateKey);
      return candidate;
    }
    counter += 1;
  }
}
