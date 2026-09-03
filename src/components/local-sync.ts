/**
 * Syncs saved timesheets to a local folder on the user's disk (typically watched by
 * a desktop Nextcloud client) — purely via the browser's File System Access API
 * (Chrome/Edge). The app has no knowledge of Nextcloud itself, it just writes files
 * into the chosen folder.
 *
 * The chosen folder's handle is kept in IndexedDB (survives reload), but the browser
 * may want the write permission reconfirmed after some time/restart — so a background
 * write (after saving a timesheet) only checks `queryPermission` (no prompt, that
 * requires a user gesture), and the user re-grants access via a button in Settings if
 * needed.
 */

const DB_NAME = "reports-and-invoices-local-sync";
const STORE_NAME = "handles";
const HANDLE_KEY = "directory";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error(req.error?.message ?? "IndexedDB chyba"));
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(new Error(req.error?.message ?? "IndexedDB chyba"));
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error?.message ?? "IndexedDB chyba"));
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error?.message ?? "IndexedDB chyba"));
  });
}

export function isLocalSyncSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function getSyncDirectoryHandle(): Promise<
  FileSystemDirectoryHandle | undefined
> {
  return idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
}

/** Triggers the native OS folder-picker dialog and stores the handle for next time. */
export async function pickSyncDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await idbSet(HANDLE_KEY, handle);
  return handle;
}

export async function clearSyncDirectory(): Promise<void> {
  await idbDelete(HANDLE_KEY);
}

/** No prompt — just checks the current permission state for the stored folder. */
export async function hasSyncPermission(): Promise<boolean> {
  const handle = await getSyncDirectoryHandle();
  if (!handle) return false;
  return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
}

/** With prompt — call only directly from a user gesture (click), otherwise the browser suppresses the prompt. */
export async function requestSyncPermission(): Promise<boolean> {
  const handle = await getSyncDirectoryHandle();
  if (!handle) return false;
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

/** Writes a file into the sync folder. Returns false if no folder is configured, or
 * the app has lost permission to it (no prompt — see `hasSyncPermission`). */
export async function writeFileToSyncDirectory(
  filename: string,
  content: string,
): Promise<boolean> {
  const handle = await getSyncDirectoryHandle();
  if (!handle) return false;
  if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
    return false;
  }
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return true;
}
