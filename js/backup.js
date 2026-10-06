// Sicherung aller Daten in EINER Datei und Wiederherstellung.
// Format 2: Kopfzeile + JSON-Kopf + Bilder als Rohdaten hintereinander (kein Base64, kein riesiger Text im Speicher).
// Format 1 (reines JSON mit Base64-Bildern) wird weiterhin eingelesen.
import * as db from './db.js';

const FORMAT = 'baustellen-protokoll-sicherung';
const MAGIC = 'BPSICHERUNG2\n';
const BLOB_FIELDS = ['original', 'rendered', 'thumb'];

export async function exportAll() {
  const head = { format: FORMAT, version: 2, exportedAt: new Date().toISOString() };
  for (const s of ['projects', 'meetings', 'items']) head[s] = await db.getAll(s);
  head.attachments = [];
  const parts = [];
  let offset = 0;
  for (const a of await db.getAll('attachments')) {
    const meta = { ...a, blobs: {} };
    for (const f of BLOB_FIELDS) {
      delete meta[f];
      if (a[f] instanceof Blob) {
        meta.blobs[f] = { offset, size: a[f].size, type: a[f].type };
        parts.push(a[f]);
        offset += a[f].size;
      }
    }
    head.attachments.push(meta);
  }
  const json = JSON.stringify(head);
  const jsonBytes = new TextEncoder().encode(json).length;
  return new Blob([MAGIC, `${jsonBytes}\n`, json, ...parts], { type: 'application/octet-stream' });
}

async function readV2(file) {
  const start = await file.slice(0, 64).arrayBuffer();
  const text = new TextDecoder().decode(start);
  const nl = text.indexOf('\n', MAGIC.length);
  const len = Number(text.slice(MAGIC.length, nl));
  const headStart = new TextEncoder().encode(text.slice(0, nl + 1)).length;
  const head = JSON.parse(await file.slice(headStart, headStart + len).text());
  const base = headStart + len;
  head.attachments = head.attachments.map(({ blobs = {}, ...a }) => {
    for (const [f, b] of Object.entries(blobs)) a[f] = file.slice(base + b.offset, base + b.offset + b.size, b.type);
    return a;
  });
  return head;
}

async function readV1(file) {
  const data = JSON.parse(await file.text());
  for (const a of data.attachments ?? []) {
    for (const f of BLOB_FIELDS) if (typeof a[f] === 'string') a[f] = await (await fetch(a[f])).blob();
  }
  return data;
}

export async function importAll(file) {
  const first = new TextDecoder().decode(await file.slice(0, MAGIC.length).arrayBuffer());
  const data = first === MAGIC ? await readV2(file) : await readV1(file);
  if (data?.format !== FORMAT) throw new Error('Das ist keine Sicherungsdatei dieser App.');
  if (data.version > 2) throw new Error('Die Sicherung stammt aus einer neueren App-Version.');
  for (const key of ['projects', 'meetings', 'items', 'attachments']) data[key] ??= [];
  await db.clearAll();
  if (data.projects.length) await db.put('projects', ...data.projects);
  if (data.meetings.length) await db.put('meetings', ...data.meetings);
  if (data.items.length) await db.put('items', ...data.items);
  // Bilder einzeln: jeweils nur ein Foto im Arbeitsspeicher (Ausschnitte der Datei werden erst hier gelesen)
  for (const a of data.attachments) {
    for (const f of BLOB_FIELDS) if (a[f] instanceof Blob) a[f] = new Blob([await a[f].arrayBuffer()], { type: a[f].type });
    await db.put('attachments', a);
  }
  await db.setMeta('lastBackup', data.exportedAt);
  return { projects: data.projects.length, meetings: data.meetings.length };
}

// Erst aufrufen, wenn die Datei wirklich weitergegeben bzw. gespeichert wurde.
export const markBackupDone = () => db.setMeta('lastBackup', new Date().toISOString());

export async function backupAgeDays() {
  const last = await db.getMeta('lastBackup');
  if (!last) return Infinity;
  return (Date.now() - Date.parse(last)) / 86400000;
}
