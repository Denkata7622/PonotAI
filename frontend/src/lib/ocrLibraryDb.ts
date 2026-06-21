export interface OcrLibraryEntry {
  id: string;
  artist: string;
  title: string;
  album?: string;
  coverUrl?: string | null;
  confidence: number;
  extractedAt: string;
  status: "unassigned" | "searching" | "assigned" | "error";
  tidalUrl?: string;
  tidalMatchInfo?: { artist: string; title: string; album?: string };
  errorMsg?: string;
}

const DB_NAME = "turrex-ocr-library";
const STORE_NAME = "songs";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open OCR library."));
    request.onblocked = () => reject(new Error("OCR library is blocked by another tab."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export async function addOcrSongs(entries: OcrLibraryEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const entry of entries) store.put(entry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getOcrSongs(): Promise<OcrLibraryEntry[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => { db.close(); resolve((request.result as OcrLibraryEntry[]).sort((a, b) => Date.parse(b.extractedAt) - Date.parse(a.extractedAt))); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function updateOcrSong(id: string, patch: Partial<OcrLibraryEntry>): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const get = store.get(id);
    get.onsuccess = () => {
      const existing = get.result as OcrLibraryEntry | undefined;
      if (existing) store.put({ ...existing, ...patch });
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function deleteOcrSong(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function clearOcrLibrary(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}