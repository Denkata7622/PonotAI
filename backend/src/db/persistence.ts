import { promises as fs } from "node:fs";
import path from "node:path";
import { assertDatabaseConnection } from "./prisma";

export type PersistenceMode = "postgres" | "file-legacy";

type PersistenceHealth = {
  mode: PersistenceMode;
  connected: boolean;
  lastError?: string;
};

const DEFAULT_FILE_DIR = path.join(process.cwd(), "backend", "data");
let health: PersistenceHealth = {
  mode: "postgres",
  connected: false,
};

function resolveDataDir(): string {
  return process.env.PONOTAI_DATA_DIR?.trim() || DEFAULT_FILE_DIR;
}

function resolvePersistenceMode(): PersistenceMode {
  const configured = process.env.PERSISTENCE_MODE?.trim().toLowerCase();
  if (!configured || configured === "postgres") {
    return "postgres";
  }
  if (configured === "file-legacy") {
    return "file-legacy";
  }
  throw new Error(`Unsupported persistence mode: ${configured}`);
}

async function probeFilePersistence(): Promise<PersistenceHealth> {
  const dir = resolveDataDir();
  try {
    await fs.mkdir(dir, { recursive: true });
    return { mode: "file-legacy", connected: true };
  } catch (error) {
    return { mode: "file-legacy", connected: false, lastError: (error as Error).message };
  }
}

async function probePostgresPersistence(): Promise<PersistenceHealth> {
  try {
    await assertDatabaseConnection();
    return { mode: "postgres", connected: true };
  } catch (error) {
    return { mode: "postgres", connected: false, lastError: (error as Error).message };
  }
}

export function getPersistenceHealth(): PersistenceHealth {
  return health;
}

export function getPersistenceMode(): PersistenceMode {
  return resolvePersistenceMode();
}

export async function refreshPersistenceHealth(): Promise<PersistenceHealth> {
  const mode = resolvePersistenceMode();
  health = mode === "file-legacy" ? await probeFilePersistence() : await probePostgresPersistence();
  return health;
}

const documentWriteQueues = new Map<string, Promise<void>>();

export async function queueDocumentMutation(key: string, operation: () => Promise<void>): Promise<void> {
  const previous = documentWriteQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  documentWriteQueues.set(key, next);
  try {
    await next;
  } finally {
    if (documentWriteQueues.get(key) === next) {
      documentWriteQueues.delete(key);
    }
  }
}
