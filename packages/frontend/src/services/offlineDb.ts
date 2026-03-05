/**
 * IndexedDB wrapper for offline data caching.
 * Stores prices, advisories, and weather data locally.
 * Validates: Requirements 34.3, 35.4
 */

const DB_NAME = 'krishimitra-cache';
const DB_VERSION = 1;

export interface CacheEntry<T = unknown> {
  key: string;
  store: string;
  data: T;
  timestamp: number;
}

export type StoreName = 'prices' | 'advisories' | 'weather' | 'general';

const STORE_NAMES: StoreName[] = ['prices', 'advisories', 'weather', 'general'];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'key' });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheGet<T>(store: StoreName, key: string): Promise<CacheEntry<T> | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as CacheEntry<T> | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function cachePut<T>(store: StoreName, key: string, data: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const entry: CacheEntry<T> = { key, store, data, timestamp: Date.now() };
    const req = tx.objectStore(store).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function cacheDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function cacheClear(store: StoreName): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function cacheGetAll<T>(store: StoreName): Promise<CacheEntry<T>[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as CacheEntry<T>[]);
    req.onerror = () => reject(req.error);
  });
}
