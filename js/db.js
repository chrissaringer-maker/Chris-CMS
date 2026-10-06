// Dünne Hülle um IndexedDB. Alle Daten bleiben auf dem Gerät.

const DB_NAME = 'baustellen-protokoll';
const DB_VERSION = 1;
export const STORES = ['projects', 'meetings', 'items', 'attachments', 'meta'];

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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Speichern fehlgeschlagen'));
  });
}

function result(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).getAll());
}

export async function getAllBy(store, index, value) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).index(index).getAll(value));
}

export async function get(store, id) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).get(id));
}

export async function put(store, ...values) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  for (const v of values) tx.objectStore(store).put(v);
  return done(tx);
}

export async function del(store, ...ids) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  for (const id of ids) tx.objectStore(store).delete(id);
  return done(tx);
}

export async function clearAll() {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) tx.objectStore(s).clear();
  return done(tx);
}

export async function getMeta(key) {
  return (await get('meta', key))?.value;
}

export async function setMeta(key, value) {
  return put('meta', { key, value });
}
