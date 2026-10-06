// Stresstest: viele Sitzungen, Punkte und große Fotos. Misst Ladezeit, PDF, Sicherung, Wiederherstellung.
// Voraussetzung: Server auf http://localhost:8080   Aufruf: node test/stress.mjs [Ausgabeordner]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }

const BASE = process.env.BASE_URL ?? 'http://localhost:8080/';
const OUT = process.argv[2] ?? 'test-output';
const MEETINGS = Number(process.env.MEETINGS ?? 30);
const NEW_PER_MEETING = Number(process.env.NEW_PER_MEETING ?? 20);
const PHOTOS = Number(process.env.PHOTOS ?? 40);
mkdirSync(OUT, { recursive: true });

const browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, acceptDownloads: true, locale: 'de-AT' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE);

const t0 = Date.now();
const setup = await page.evaluate(async ({ MEETINGS, NEW_PER_MEETING, PHOTOS }) => {
  const m = await import('/js/model.js');
  const s = await import('/js/store.js');
  const db = await import('/js/db.js');
  const p = m.newProject('Stresstest Krankenhaus Bauteil C');
  p.author = 'Stresstest';
  for (let i = 1; i <= 25; i++) {
    const c = m.newCompany(`Firma ${i} GmbH`, `Gewerk ${i}`, [String(i).padStart(2, '0')]);
    c.contacts.push(m.newContact(`Kontakt ${i}`, `kontakt${i}@example.at`));
    p.companies.push(c);
  }
  await s.saveProject(p);
  const long = 'Langer Text mit Fachbegriffen: Brandschott, Kabeltrasse, Kompriband, Revisionsöffnung, WDVS-Anschluss. '.repeat(4);
  let photoCount = 0;
  const photo = async () => {
    // 2400 × 1800 mit Rauschen ≈ realistische JPEG-Größe
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1800;
    const g = c.getContext('2d');
    const img = g.createImageData(2400, 1800);
    for (let i = 0; i < img.data.length; i += 4) { const v = (Math.random() * 255) | 0; img.data[i] = v; img.data[i + 1] = (v * 0.8) | 0; img.data[i + 2] = (v * 0.6) | 0; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
    const t = document.createElement('canvas'); t.width = 360; t.height = 270; t.getContext('2d').drawImage(c, 0, 0, 360, 270);
    const thumb = await new Promise((r) => t.toBlob(r, 'image/jpeg', 0.8));
    const att = { id: m.uid(), projectId: p.id, kind: 'photo', caption: `Foto ${++photoCount}`, original: blob, rendered: null, thumb, strokes: [], width: 2400, height: 1800 };
    await db.put('attachments', att);
    return { id: att.id, size: blob.size };
  };
  let photoBytes = 0;
  let lastMeeting;
  for (let k = 0; k < MEETINGS; k++) {
    const bundle = await s.loadBundle(p.id);
    const meeting = await s.startMeeting(bundle, 'besprechung');
    lastMeeting = meeting;
    const after = await s.loadBundle(p.id);
    const items = after.items;
    const changed = [];
    // fortgeschriebene Punkte: ~40 % erledigen, alle mit Notiz
    for (const it of items) {
      const e = m.entryFor(it, meeting.id);
      if (!e) continue;
      changed.push(m.updateEntry(it, meeting.id, { note: `Stand Sitzung ${k + 1}: in Arbeit.`, status: Math.random() < 0.4 ? 'erledigt' : 'offen' }));
    }
    for (let n = 0; n < NEW_PER_MEETING; n++) {
      const company = p.companies[(k * 7 + n) % p.companies.length];
      let it = m.addItem({ meeting, items: [...items, ...changed], lg: company.lgs[0], type: n % 5 === 0 ? 'info' : 'aufgabe', companyId: company.id });
      it = { ...it, text: `${n % 3 === 0 ? long : 'Kurzer Punkt'} (Sitzung ${k + 1}, Nr. ${n + 1})` };
      it = m.updateEntry(it, meeting.id, { due: `2026-${String(1 + (k % 12)).padStart(2, '0')}-15`, unclear: n % 9 === 0 });
      changed.push(it);
    }
    // Fotos in den letzten beiden Sitzungen
    if (k >= MEETINGS - 2) {
      const own = changed.filter((it) => it.createdMeetingId === meeting.id);
      for (let f = 0; f < PHOTOS / 2; f++) {
        const ph = await photo();
        photoBytes += ph.size;
        const target = own[f % own.length];
        const e = m.entryFor(target, meeting.id);
        e.attachmentIds = [...(e.attachmentIds ?? []), ph.id];
      }
    }
    if (changed.length) await db.put('items', ...changed);
  }
  const final = await s.loadBundle(p.id);
  return {
    projectId: p.id, meetingId: lastMeeting.id,
    items: final.items.length,
    logEntries: final.items.reduce((n, i) => n + i.log.length, 0),
    inLastMeeting: final.items.filter((i) => m.entryFor(i, lastMeeting.id)).length,
    photos: final.attachments.length, photoMB: +(photoBytes / 1048576).toFixed(1),
  };
}, { MEETINGS, NEW_PER_MEETING, PHOTOS });
const setupSec = (Date.now() - t0) / 1000;

// Ladezeit der letzten Besprechung (viele Karten)
const tLoad = Date.now();
await page.goto(`${BASE}#/m/${setup.meetingId}`);
await page.locator('.item').nth(setup.inLastMeeting - 1).waitFor();
await page.getByRole('button', { name: 'Diktat' }).waitFor();
const loadMs = Date.now() - tLoad;

// Reaktion: Navigation ▼ zwanzigmal
const tNav = Date.now();
for (let i = 0; i < 20; i++) await page.getByRole('button', { name: 'Nächster Punkt' }).click();
const navMs = (Date.now() - tNav) / 20;

// Tippen in einen Punkt und Speichern
const tType = Date.now();
await page.locator('.item.current textarea').first().fill('Stresstest Eingabe '.repeat(30));
await page.waitForTimeout(800);
const typeMs = Date.now() - tType - 800;

// Vorabzug-PDF
const tPdf = Date.now();
const shareInDialog = () => page.locator('.modal').getByRole('button', { name: 'Teilen …' }).click({ timeout: 180000 });
const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByRole('button', { name: 'Vorabzug-PDF' }).click().then(shareInDialog)]);
const pdfPath = join(OUT, 'stress-vorabzug.pdf');
await pdf.saveAs(pdfPath);
const pdfMs = Date.now() - tPdf;
const pdfPages = Number((execSync(`pdfinfo "${pdfPath}" | grep Pages || true`).toString().match(/\d+/) ?? [0])[0]);

// Sicherung
await page.goto(`${BASE}#/sicherung`);
const tBak = Date.now();
const [bak] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByRole('button', { name: 'Sicherung erstellen' }).click().then(shareInDialog)]);
const bakPath = join(OUT, 'stress.bpsicherung');
await bak.saveAs(bakPath);
const backupMs = Date.now() - tBak;

// Wiederherstellung
const tRes = Date.now();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Sicherung einspielen' }).click()]);
await chooser.setFiles(bakPath);
await page.locator('.modal').getByRole('button', { name: 'Ersetzen' }).click();
await page.getByRole('link', { name: /Stresstest Krankenhaus/ }).waitFor({ timeout: 180000 });
const restoreMs = Date.now() - tRes;

const storage = await page.evaluate(async () => (await navigator.storage.estimate()).usage);
const result = {
  ...setup, setupSec,
  ladezeitBesprechungMs: loadMs, navigationJeSchrittMs: Math.round(navMs), eingabeMs: typeMs,
  pdfMs, pdfSeiten: pdfPages, pdfMB: +(statSync(pdfPath).size / 1048576).toFixed(1),
  sicherungMs: backupMs, sicherungMB: +(statSync(bakPath).size / 1048576).toFixed(1),
  wiederherstellungMs: restoreMs, speicherBelegtMB: +(storage / 1048576).toFixed(1),
  jsFehler: errors,
};
writeFileSync(join(OUT, 'stress-ergebnis.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
