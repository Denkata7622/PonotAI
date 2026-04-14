import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";

type PersistenceMode = "database_url" | "file";

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

function resolveDataDir(): string {
  return process.env.PONOTAI_DATA_DIR?.trim() || DEFAULT_FILE_DIR;
}

export function getPersistenceHealth(): PersistenceHealth {
  return health;
}

function getPersistenceModeInternal(): PersistenceMode {
  return process.env.DATABASE_URL?.trim() ? "database_url" : "file";
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

function tryConnectSocket(host: string, port: number, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connection timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function probeDatabaseUrl(urlValue: string): Promise<PersistenceHealth> {
  try {
    const parsed = new URL(urlValue);
    const host = parsed.hostname;
    const defaultPort = parsed.protocol === "postgresql:" || parsed.protocol === "postgres:" ? 5432 : 0;
    const port = parsed.port ? Number(parsed.port) : defaultPort;
    if (!host || !port) {
      return { mode: "database_url", connected: false, lastError: "DATABASE_URL missing reachable host/port" };
    }

    await tryConnectSocket(host, port);
    return { mode: "database_url", connected: true };
  } catch (error) {
    return { mode: "database_url", connected: false, lastError: (error as Error).message };
  }
}

export async function refreshPersistenceHealth(): Promise<PersistenceHealth> {
  const mode = getPersistenceModeInternal();
  health = mode === "database_url"
    ? await probeDatabaseUrl(process.env.DATABASE_URL!.trim())
    : await probeFilePersistence();
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
  return getPersistenceModeInternal();
}
