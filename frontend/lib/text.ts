const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
};

const ENTITY_PATTERN = /&(#x?[0-9a-f]+|[a-z]+);/gi;

export function decodeHtmlEntities(value: string): string {
  if (!value || !value.includes("&")) return value;
  return value.replace(ENTITY_PATTERN, (match, raw) => {
    const token = String(raw);
    if (token.startsWith("#x") || token.startsWith("#X")) {
      const codePoint = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (token.startsWith("#")) {
      const codePoint = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_HTML_ENTITIES[token.toLowerCase()] ?? match;
  });
}

export function normalizeVisibleText(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}
