import { promises as fs } from "node:fs";
import path from "node:path";

type PersistenceMode = "database_url" | "file";

type PersistenceHealth = {
  mode: PersistenceMode;
  connected: boolean;
  lastError?: string;
};

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const mode: PersistenceMode = DATABASE_URL ? "database_url" : "file";

const DEFAULT_FILE_DIR = path.join(process.cwd(), "backend", "data");
let health: PersistenceHealth = {
  mode,
  connected: true,
};

function resolveDataDir(): string {
  return process.env.PONOTAI_DATA_DIR?.trim() || DEFAULT_FILE_DIR;
}

export function getPersistenceHealth(): PersistenceHealth {
  return health;
}

async function ensureFile(filePath: string, fallback: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, fallback, "utf8");
  }
}

export async function readJsonDocument<T>(
  key: string,
  fileName: string,
  createDefault: () => T,
): Promise<T> {
  const filePath = path.join(resolveDataDir(), fileName);
  const fallback = createDefault();
  await ensureFile(filePath, JSON.stringify(fallback, null, 2));
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonDocument<T>(key: string, fileName: string, payload: T): Promise<void> {
  const filePath = path.join(resolveDataDir(), fileName);
  await ensureFile(filePath, JSON.stringify(createDefaultObject(payload), null, 2));
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function createDefaultObject<T>(payload: T): T {
  return payload;
}

export function getPersistenceMode(): PersistenceMode {
  return mode;
}
