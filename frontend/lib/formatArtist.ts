export function formatArtist(name: string): string {
  if (!name) return name;
  const cleaned = name.replace(/\s*-\s*Topic$/i, "").trim();
  return cleaned
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
