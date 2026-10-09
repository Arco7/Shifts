// store.js: local storage in IndexedDB (database + small key/value records).

const NAME = 'shiftlog-db';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('kv');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        dbp = null;
        reject(r.error);
      };
    });
  }
  return dbp;
}

export async function kvGet(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const q = db.transaction('kv').objectStore('kv').get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}

export async function kvSet(key, value) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function emptyDb(jobNames = ['עבודה 1', 'עבודה 2', 'עבודה 3']) {
  return {
    schema: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rev: 0,
    jobs: jobNames.map((name, i) => ({ id: 'job' + (i + 1), name, settings: {} })),
    entries: [],
  };
}

// true when nothing has been entered yet (no shifts, no settings, default job names)
export function isEmptyDb(db) {
  if (!db) return true;
  if (db.entries.length > 0) return false;
  return db.jobs.every((j) => Object.keys(j.settings || {}).length === 0);
}

export async function loadDb() {
  const db = await kvGet('db');
  return db || null;
}

// mark the data as changed (call before saving; backups compare `rev`)
export function touch(db) {
  db.rev = (db.rev || 0) + 1;
  db.updatedAt = new Date().toISOString();
}

export async function writeDb(db) {
  await kvSet('db', db);
}

export async function saveDb(db) {
  touch(db);
  await writeDb(db);
}

export async function requestPersist() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}
