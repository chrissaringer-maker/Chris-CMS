// Dünne Hülle um IndexedDB. Alle Daten bleiben auf dem Gerät.
// Safari kann die Verbindung verlieren, wenn die App länger im Hintergrund war
// („Connection to Indexed Database server lost“) – dann wird neu geöffnet und einmal wiederholt.

const DB_NAME = 'baustellen-protokoll';
const DB_VERSION = 1;
export const STORES = ['projects', 'meetings', 'items', 'attachments', 'meta'];
const RETRYABLE = new Set(['InvalidStateError', 'UnknownError', 'TransactionInactiveError']);

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('projects', { keyPath: 'id' });
      for (const name of ['meetings', 'items', 'attachments']) {
        db.createObjectStore(name, { keyPath: 'id' }).createIndex('projectId', 'projectId');
      }
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function withDb(fn) {
  try {
    return await fn(await open());
  } catch (e) {
    if (!RETRYABLE.has(e?.name) && !/connection|closing/i.test(e?.message ?? '')) throw e;
    dbPromise = null;
    return fn(await open());
  }
}

// nur für Tests: Verbindungsverlust nachstellen
export async function _closeForTest() {
  (await open()).close();
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // die eigentliche Ursache weitergeben (Fehler der Anfrage), nicht nur „fehlgeschlagen“
    tx.onerror = (e) => reject(e.target?.error ?? tx.error ?? new Error('Speichern fehlgeschlagen'));
    tx.onabort = () => reject(tx.error ?? new Error('Speichern abgebrochen'));
  });
}

function result(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const getAll = (store) => withDb((db) => result(db.transaction(store).objectStore(store).getAll()));

export const getAllBy = (store, index, value) =>
  withDb((db) => result(db.transaction(store).objectStore(store).index(index).getAll(value)));

export const get = (store, id) => withDb((db) => result(db.transaction(store).objectStore(store).get(id)));

export const put = (store, ...values) =>
  withDb((db) => {
    const tx = db.transaction(store, 'readwrite');
    for (const v of values) tx.objectStore(store).put(v);
    return done(tx);
  });

export const del = (store, ...ids) =>
  withDb((db) => {
    const tx = db.transaction(store, 'readwrite');
    for (const id of ids) tx.objectStore(store).delete(id);
    return done(tx);
  });

export const clearAll = () =>
  withDb((db) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const s of STORES) tx.objectStore(s).clear();
    return done(tx);
  });

export async function getMeta(key) {
  return (await get('meta', key))?.value;
}

export async function setMeta(key, value) {
  return put('meta', { key, value });
}
