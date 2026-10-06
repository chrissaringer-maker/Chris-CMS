// Sicherung aller Daten als eine JSON-Datei (Bilder als Base64) und Wiederherstellung.
import * as db from './db.js';

const FORMAT = 'baustellen-protokoll-sicherung';
const FORMAT_VERSION = 1;
const BLOB_FIELDS = ['original', 'rendered', 'thumb'];

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url) {
  return (await fetch(url)).blob();
}

export async function exportAll() {
  const data = { format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString() };
  for (const s of ['projects', 'meetings', 'items']) data[s] = await db.getAll(s);
  data.attachments = [];
  for (const a of await db.getAll('attachments')) {
    const copy = { ...a };
    for (const f of BLOB_FIELDS) if (a[f] instanceof Blob) copy[f] = await blobToDataUrl(a[f]);
    data.attachments.push(copy);
  }
  await db.setMeta('lastBackup', data.exportedAt);
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function importAll(file) {
  const data = JSON.parse(await file.text());
  if (data?.format !== FORMAT) throw new Error('Das ist keine Sicherungsdatei dieser App.');
  if (data.version > FORMAT_VERSION) throw new Error('Die Sicherung stammt aus einer neueren App-Version.');
  for (const key of ['projects', 'meetings', 'items', 'attachments']) data[key] ??= [];
  const attachments = [];
  for (const a of data.attachments) {
    const copy = { ...a };
    for (const f of BLOB_FIELDS) if (typeof a[f] === 'string') copy[f] = await dataUrlToBlob(a[f]);
    attachments.push(copy);
  }
  await db.clearAll();
  if (data.projects.length) await db.put('projects', ...data.projects);
  if (data.meetings.length) await db.put('meetings', ...data.meetings);
  if (data.items.length) await db.put('items', ...data.items);
  if (attachments.length) await db.put('attachments', ...attachments);
  await db.setMeta('lastBackup', data.exportedAt);
  return { projects: data.projects.length, meetings: data.meetings.length };
}

export async function backupAgeDays() {
  const last = await db.getMeta('lastBackup');
  if (!last) return Infinity;
  return (Date.now() - Date.parse(last)) / 86400000;
}
