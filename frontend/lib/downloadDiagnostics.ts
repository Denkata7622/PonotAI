import path from "node:path";

const DEFAULT_TIMEOUT_MS = 180000;

export function safeBinaryName(binary: string): string {
  const parts = binary.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || binary || "unknown";
}

export function binaryFromLocation(location: string | undefined, binary: "ffmpeg" | "ffprobe", platform = process.platform): string {
  if (!location) return binary;
  const fileName = platform === "win32" ? `${binary}.exe` : binary;
  return path.join(location, fileName);
}

export function redactPathForClient(dir: string): string {
  const normalized = dir.replace(/\\/g, "/");
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) {
    const safeHome = home.replace(/\\/g, "/");
    if (normalized.toLowerCase().startsWith(safeHome.toLowerCase())) {
      return `~/${normalized.slice(safeHome.length).replace(/^\/+/, "")}`;
    }
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return normalized;
  return `.../${parts.slice(-2).join("/")}`;
}

export function parseYtDlpBuildDate(version?: string): Date | null {
  if (!version) return null;
  const match = version.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function looksOldYtDlp(version?: string): boolean {
  const buildDate = parseYtDlpBuildDate(version);
  if (!buildDate) return false;
  const now = new Date();
  const olderThan90Days = now.getTime() - buildDate.getTime() > 90 * 24 * 60 * 60 * 1000;
  const olderThanCurrentYear = buildDate.getUTCFullYear() < now.getUTCFullYear();
  return olderThan90Days || olderThanCurrentYear;
}

export function clampTimeout(value: string | undefined): number {
  const n = Number(value || DEFAULT_TIMEOUT_MS);
  return Math.min(600000, Math.max(30000, Number.isFinite(n) ? n : DEFAULT_TIMEOUT_MS));
}
