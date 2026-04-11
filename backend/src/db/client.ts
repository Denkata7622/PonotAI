import { promises as fs } from "node:fs";
import path from "node:path";
import type { HistoryEntry } from "./models";

function resolveDataDir(): string {
  return process.env.PONOTAI_DATA_DIR?.trim() || path.join(process.cwd(), "backend", "data");
}

function historyFilePath(): string {
  return path.join(resolveDataDir(), "history.json");
}

async function ensureHistoryFile() {
  const historyPath = historyFilePath();
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  try {
    await fs.access(historyPath);
  } catch {
    await fs.writeFile(historyPath, "[]", "utf8");
  }
}

export async function readHistory(): Promise<HistoryEntry[]> {
  await ensureHistoryFile();
  const raw = await fs.readFile(historyFilePath(), "utf8");
  return JSON.parse(raw) as HistoryEntry[];
}

export async function writeHistory(entries: HistoryEntry[]): Promise<void> {
  await ensureHistoryFile();
  await fs.writeFile(historyFilePath(), JSON.stringify(entries, null, 2), "utf8");
}
