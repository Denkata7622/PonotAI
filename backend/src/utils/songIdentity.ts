const COMBINING_MARKS = /[\u0300-\u036f]/g;
const APOSTROPHES = /['’`´]/g;
const NON_ALPHANUMERIC = /[^a-z0-9\s]/g;
const WHITESPACE = /\s+/g;
const FEAT_SUFFIX = /(?:\s*[-–—]\s*|\s+)(?:\(|\[)?(?:feat\.?|ft\.?|featuring)\s+[^\])]+(?:\)|\])?\s*$/i;

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

export function normalizeTrackKey(title?: string, artist?: string): string {
  const normalizedTitle = normalizeTitlePart((title ?? "").trim() || "unknown song") || "unknown song";
  const normalizedArtist = normalizeArtistPart((artist ?? "").trim() || "unknown artist") || "unknown artist";
  return `${normalizedTitle}|||${normalizedArtist}`;
}

export function trackIdFrom(title?: string, artist?: string): string {
  return normalizeTrackKey(title, artist);
}
