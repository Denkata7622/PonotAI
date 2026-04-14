import { promises as fs } from "node:fs";
import path from "node:path";

type PersistenceMode = "file";

type PersistenceHealth = {
  mode: PersistenceMode;
  connected: boolean;
  lastError?: string;
};

const DEFAULT_FILE_DIR = path.join(process.cwd(), "backend", "data");
let health: PersistenceHealth = {
  mode: "file",
  connected: false,
};
const documentWriteQueues = new Map<string, Promise<void>>();

function resolveDataDir(): string {
  return process.env.PONOTAI_DATA_DIR?.trim() || DEFAULT_FILE_DIR;
}

export function getPersistenceHealth(): PersistenceHealth {
  return health;
}

function getPersistenceModeInternal(): PersistenceMode {
  return "file";
}

async function probeFilePersistence(): Promise<PersistenceHealth> {
  const dir = resolveDataDir();
  try {
    await fs.mkdir(dir, { recursive: true });
    return { mode: "file", connected: true };
  } catch (error) {
    return { mode: "file", connected: false, lastError: (error as Error).message };
  }
}

export async function refreshPersistenceHealth(): Promise<PersistenceHealth> {
  health = await probeFilePersistence();
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
  await queueDocumentMutation(key, async () => {
    const filePath = path.join(resolveDataDir(), fileName);
    await ensureFile(filePath, JSON.stringify(createDefaultObject(payload), null, 2));
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  });
}

function createDefaultObject<T>(payload: T): T {
  return payload;
}

export function getPersistenceMode(): PersistenceMode {
  return getPersistenceModeInternal();
}

export async function queueDocumentMutation(key: string, operation: () => Promise<void>): Promise<void> {
  const previous = documentWriteQueues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(operation);
  documentWriteQueues.set(key, next);
  try {
    await next;
  } finally {
    if (documentWriteQueues.get(key) === next) {
      documentWriteQueues.delete(key);
    }
  }
}
