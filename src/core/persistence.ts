/* ----------------------------------------------------------------------------
   Persistence.
   - Imported song files are stored as bytes in IndexedDB so they reload on
     return (and so a small song library can be built up).
   - Lightweight settings live in localStorage.

   Note on packaging (CLAUDE.md §5): if/when we move to a Tauri desktop build,
   the song library can move to real on-disk files. Keeping all storage access
   behind this module makes that swap a one-file change.
---------------------------------------------------------------------------- */

import { DEFAULT_SETTINGS, type PlaybackSettings } from './store';

// ----------------------------------------------------------------- settings
const SETTINGS_KEY = 'drumscore.settings';
const LAST_SONG_KEY = 'drumscore.lastSongId';

export function loadSettings(): PlaybackSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: PlaybackSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable (private mode); ignore */
  }
}

export function getLastSongId(): number | null {
  try {
    const raw = localStorage.getItem(LAST_SONG_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null; // reject NaN / junk
  } catch {
    return null;
  }
}
export function setLastSongId(id: number | null): void {
  try {
    if (id == null) localStorage.removeItem(LAST_SONG_KEY);
    else localStorage.setItem(LAST_SONG_KEY, String(id));
  } catch {
    /* storage unavailable (private mode); ignore */
  }
}

// ----------------------------------------------------------------- songs (IndexedDB)
const DB_NAME = 'drumscore';
const DB_VERSION = 1;
const STORE = 'songs';

export type SongRecord = {
  id?: number;
  name: string;
  format: string;
  bytes: ArrayBuffer;
  addedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
        t.onabort = () => {
          // An aborted/errored transaction must still release the connection,
          // or repeated failures leak handles and can block future DB upgrades.
          reject(t.error ?? req.error ?? new Error('IndexedDB transaction aborted'));
          db.close();
        };
      }),
  );
}

export async function saveSong(rec: SongRecord): Promise<number> {
  const id = await tx<IDBValidKey>('readwrite', (s) => s.add(rec));
  return Number(id);
}

export async function getSong(id: number): Promise<SongRecord | undefined> {
  return tx<SongRecord | undefined>('readonly', (s) => s.get(id) as IDBRequest<SongRecord | undefined>);
}

export async function getAllSongs(): Promise<SongRecord[]> {
  const all = await tx<SongRecord[]>('readonly', (s) => s.getAll() as IDBRequest<SongRecord[]>);
  // newest first
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

export async function deleteSong(id: number): Promise<void> {
  await tx<undefined>('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
}
