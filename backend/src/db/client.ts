import type { HistoryEntry } from "./models";
import { readJsonDocument, writeJsonDocument } from "./persistence";

export async function readHistory(): Promise<HistoryEntry[]> {
  return readJsonDocument<HistoryEntry[]>("legacyHistory", "history.json", () => []);
}

export async function writeHistory(entries: HistoryEntry[]): Promise<void> {
  await writeJsonDocument("legacyHistory", "history.json", entries);
}
