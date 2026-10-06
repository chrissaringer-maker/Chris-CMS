// Durchlauf-Test im Browser (Chromium über Playwright). Voraussetzung: Server auf http://localhost:8080
//   npx http-server -c-1 -p 8080 .   und dann   node test/e2e.mjs [Ausgabeordner]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import util from 'node:util';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const BASE = process.env.BASE_URL ?? 'http://localhost:8080/';
const OUT = process.argv[2] ?? 'test-output';
mkdirSync(OUT, { recursive: true });
const fixture = new URL('./fixture-photo.jpg', import.meta.url).pathname;

const browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, acceptDownloads: true, locale: 'de-AT' });
// Spracherkennung von Safari nachbilden: liefert erst ein vorläufiges, dann ein endgültiges Ergebnis
await context.addInitScript(() => {
  class FakeRecognition {
    start() {
      this.running = true;
      setTimeout(() => this.emit([['Kabeltrasse', false]]), 50);
      setTimeout(() => this.emit([['Kabeltrasse nachrüsten', true]]), 120);
      setTimeout(() => this.emit([['SPÄTER', true]]), 700);
    }
    emit(list) {
      if (!this.running) return;
      const results = list.map(([t, fin]) => Object.assign([{ transcript: t }], { isFinal: fin }));
      this.onresult?.({ resultIndex: 0, results });
    }
    stop() {
      this.running = false;
      setTimeout(() => this.onend?.(), 20);
    }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeRecognition;
});
const page = await context.newPage();
// optional langsamer Rechner wie im CI nachstellen: CPU_THROTTLE=6 node test/e2e.mjs
if (process.env.CPU_THROTTLE) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU_THROTTLE) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
const modal = page.locator('.modal');
async function fillModal(values, ok) {
  for (const [label, value] of Object.entries(values)) await modal.getByLabel(label, { exact: true }).fill(value);
  await modal.getByRole('button', { name: ok }).click();
}
// PDF/Sicherung: erst erzeugen, dann im Dialog „Teilen …“ (zweistufig, wegen Safari-Freigabefenster)
async function download(trigger) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    (async () => {
      await trigger();
      await modal.getByRole('button', { name: 'Teilen …' }).click({ timeout: 60000 });
    })(),
  ]);
  const path = join(OUT, dl.suggestedFilename());
  await dl.saveAs(path);
  return path;
}
const pdfText = (path) => execSync(`pdftotext -layout "${path}" -`).toString();
// Die Ansicht wird nach dem Speichern asynchron neu aufgebaut: wiederholt lesen, bis der Wert stimmt (höchstens 5 s)
async function eventually(read, expected, msg) {
  const end = Date.now() + 5000;
  let actual = await read();
  while (!util.isDeepStrictEqual(actual, expected) && Date.now() < end) {
    await page.waitForTimeout(50);
    actual = await read();
  }
  assert.deepEqual(actual, expected, msg);
}
// Beschriftungen im Knopffeld, die nicht vollständig sichtbar sind („Neue Baubes…“)
const clippedRailLabels = () => page.locator('#rail .rail-label').evaluateAll((els) =>
  els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent));
const isoOffset = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

process.on('uncaughtException', async (e) => {
  console.error(e);
  console.error('JS-Fehler:', errors);
  await shot('fehler').catch(() => {});
  process.exit(1);
});

await page.goto(BASE);
await page.getByRole('button', { name: 'Neues Projekt', exact: true }).click();
await fillModal({ Bauvorhaben: 'BV Musterstraße 12', 'Adresse (optional)': 'Musterstraße 12, 1010 Wien' }, 'Anlegen');
await page.getByRole('link', { name: /Firmen/ }).click();

for (const [firma, gewerk, lg, name, mail] of [
  ['Müller Bau GmbH', 'Baumeister', '7', 'Max Müller', 'max@mueller.example'],
  ['Trockenbau Huber', 'Trockenbau', '39', 'Eva Huber', 'eva@huber.example'],
]) {
  await page.getByRole('button', { name: 'Firma hinzufügen' }).click();
  await fillModal({ Firma: firma, 'Gewerk (optional)': gewerk, 'Leistungsgruppe(n) (optional)': lg, 'Ansprechpartner (optional)': name, 'E-Mail (optional)': mail }, 'Hinzufügen');
}
assert.equal(await page.getByLabel('Leistungsgruppe(n)').first().inputValue(), '07');
await shot('01-firmen');
await page.locator('#back').click();
await page.getByRole('button', { name: 'Neue Baubesprechung' }).waitFor();
assert.deepEqual(await clippedRailLabels(), [], 'Beschriftung im Knopffeld abgeschnitten (Projekt)');
await page.getByRole('button', { name: 'Neue Baubesprechung' }).click();
await page.getByRole('button', { name: 'Alle Firmen hinzufügen' }).click();
// Anwesenheit beginnt offen; Tipp schaltet weiter: anwesend → entschuldigt
const att = page.locator('button.attend');
await eventually(() => att.allTextContents(), ['offen', 'offen']);
await att.nth(0).click();
await att.nth(1).click();
await att.nth(1).click();
await eventually(() => att.allTextContents(), ['anwesend', 'entschuldigt']);
// Knopffeld unten rechts: Knöpfe ≥ 80 px hoch, ganz in den unteren 420 px und rechten 220 px
const boxes = await page.locator('#rail .rail-btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
assert.ok(boxes.length >= 7, 'Knopffeld vollständig');
for (const b of boxes) {
  assert.ok(b.height >= 80, `Knopfhöhe ${b.height}`);
  assert.ok(b.top >= 820 - 420 && b.left >= 1180 - 220, `Knopf außerhalb des Daumenbereichs: ${JSON.stringify(b)}`);
}
const dictateBox = boxes.at(-1);
assert.ok(dictateBox.height >= 96 && dictateBox.bottom > 820 - 40, 'Diktat breit ganz unten');
assert.equal(await page.locator('#rail').getByText('Zurück').count(), 0, 'Zurück nicht im Knopffeld');
assert.deepEqual(await clippedRailLabels(), [], 'Beschriftung im Knopffeld abgeschnitten (Besprechung)');

// Punkt 1: Aufgabe für den Trockenbauer, Frist in der Vergangenheit (wird überfällig)
await page.getByRole('button', { name: 'Neuer Punkt' }).click();
const card1 = page.locator('.item').nth(0);
assert.equal(await card1.locator('.item-no').textContent(), '00.001');
// Regression: ein laufendes Diktat endet beim Verlassen der Ansicht und schreibt nichts mehr nach
await page.getByRole('button', { name: 'Diktat' }).click();
await page.locator('#back').click();
await page.getByRole('button', { name: 'Neue Baubesprechung' }).waitFor();
await page.waitForTimeout(1000);
assert.equal(await page.getByRole('button', { name: 'Neue Baubesprechung' }).count(), 1, 'Leiste der Projektansicht bleibt');
await page.getByRole('link', { name: /Baubesprechung Nr\. 1/ }).click();
await card1.locator('textarea').waitFor();
assert.ok(!(await card1.locator('textarea').inputValue()).includes('SPÄTER'), 'kein Nachschreiben nach Zurück');
await card1.locator('textarea').fill('Brandschott Achse 3 herstellen, Material: Kompriband');
await card1.getByLabel('Zuständig').selectOption({ label: 'Trockenbau Huber' });
assert.equal(await card1.locator('.item-no').textContent(), '39.001', 'Nummer folgt der LG der Firma');
await card1.getByLabel('Frist').fill(isoOffset(-3));
// Diktat über die Daumenleiste hängt an den Text des aktuellen Punkts an
await page.getByRole('button', { name: 'Diktat' }).click();
await page.getByRole('button', { name: 'Stopp' }).waitFor();
await page.waitForTimeout(250);
await page.getByRole('button', { name: 'Stopp' }).click();
await page.getByRole('button', { name: 'Diktat' }).waitFor();
assert.equal(await card1.locator('textarea').inputValue(), 'Brandschott Achse 3 herstellen, Material: Kompriband Kabeltrasse nachrüsten');
// Regression: ein laufendes Diktat endet beim Verlassen der Ansicht und schreibt nichts mehr nach
await page.getByRole('button', { name: 'Diktat' }).click();
await page.locator('#back').click();
await page.getByRole('button', { name: 'Neue Baubesprechung' }).waitFor();
await page.waitForTimeout(1000);
assert.equal(await page.getByRole('button', { name: 'Neue Baubesprechung' }).count(), 1, 'Leiste der Projektansicht bleibt');
await page.getByRole('link', { name: /Baubesprechung Nr\. 1/ }).click();
await card1.locator('textarea').waitFor();
assert.ok(!(await card1.locator('textarea').inputValue()).includes('SPÄTER'), 'kein Nachschreiben nach Zurück');
await card1.locator('textarea').fill('Brandschott Achse 3 herstellen, Material: Kompriband');
// Punkt 2: Info, unklar (allgemein, LG 00)
await page.getByRole('button', { name: 'Neuer Punkt' }).click();
const card2 = page.locator('.item').nth(1);
await card2.getByLabel('Art').selectOption('info');
await card2.locator('textarea').fill('Baustrom wird ab nächster Woche umgestellt');
await card2.getByLabel('unklar').check();
assert.equal(await card2.getByLabel('Status').inputValue(), 'info', 'Info-Punkt hat Status „zur Kenntnis“');
assert.equal(await card2.locator('.item-no').textContent(), '00.001', 'LG 00 ist wieder frei');

// Skizze zu Punkt 1
await card1.getByRole('button', { name: 'Skizze', exact: true }).click();
const canvas = page.locator('.sketch canvas');
await canvas.waitFor();
const box = await canvas.boundingBox();
await page.mouse.move(box.x + 100, box.y + 100);
await page.mouse.down();
for (let i = 0; i < 20; i++) await page.mouse.move(box.x + 100 + i * 15, box.y + 100 + Math.sin(i / 3) * 40);
await page.mouse.up();
await shot('02-skizze');
await page.getByRole('button', { name: 'Fertig' }).click();
await card1.locator('.thumb').first().waitFor();

// Foto aus der Mediathek zu Punkt 1, danach einzeichnen
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), card1.getByRole('button', { name: 'Mediathek', exact: true }).click()]);
await chooser.setFiles(fixture);
await page.locator('.item').nth(0).locator('.thumb').nth(1).waitFor();
await page.locator('.item').nth(0).locator('.thumb').nth(1).click();
await modal.getByRole('button', { name: 'Einzeichnen' }).click();
const box2 = await page.locator('.sketch canvas').boundingBox();
await page.getByRole('button', { name: 'Rot' }).click();
await page.mouse.move(box2.x + 50, box2.y + 50);
await page.mouse.down();
await page.mouse.move(box2.x + 300, box2.y + 200, { steps: 10 });
await page.mouse.up();
await page.getByRole('button', { name: 'Fertig' }).click();
await page.locator('.sketch').waitFor({ state: 'detached' });
await page.waitForTimeout(800);
await shot('03-besprechung');

// Vorabzug
const draftPdf = await download(() => page.getByRole('button', { name: 'Vorabzug-PDF' }).click());
const draftText = pdfText(draftPdf);
writeFileSync(join(OUT, 'vorabzug.txt'), draftText);
for (const s of ['Baubesprechung Nr. 1', 'VORABZUG', '39.001', 'LG 39 · Trockenbau', 'LG 00 · Allgemein', 'Brandschott Achse 3', 'Trockenbau Huber', 'überfällig', '[unklar - bitte ergänzen]', 'Abb. 39.001-1', 'Abb. 39.001-2', 'Beilagen', 'Anwesenheit', 'entschuldigt']) {
  assert.ok(draftText.includes(s), `Vorabzug enthält „${s}“`);
}

// Endfassung
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Endfassung abschließen' }).click();
// Ohne Verfasser kein Abschluss: wird abgefragt
await fillModal({ 'Verfasser (Name, Firma/Funktion)': 'Ch. Saringer, ÖBA' }, 'Übernehmen');
await modal.getByText('Kein nächster Termin eingetragen.', { exact: false }).waitFor();
await modal.getByRole('button', { name: 'Abschließen' }).click();
const finalShare = page.locator('.card').getByRole('button', { name: /PDF teilen \(Fassung 1\)/ });
await finalShare.waitFor();
const finalPdf = await download(() => finalShare.click());
const finalText = pdfText(finalPdf);
writeFileSync(join(OUT, 'endfassung.txt'), finalText);
assert.ok(finalText.includes('Fassung 1'));
assert.ok(finalText.includes('Ch. Saringer, ÖBA'), 'Verfasser im Kopf');
assert.ok(finalText.includes('Einwendungen gegen dieses Protokoll sind binnen 14 Tagen ab Übermittlung'));
assert.ok(!finalText.includes('VORABZUG'));
assert.equal(await page.locator('.item textarea:not([disabled])').count(), 0, 'Endfassung ist gesperrt');

// Mail je Firma
const mailHref = await page.getByRole('link', { name: /Trockenbau Huber \(1, 1 überfällig\)/ }).getAttribute('href');
const mailBody = decodeURIComponent(mailHref.split('body=')[1]);
assert.ok(mailHref.startsWith('mailto:eva@huber.example?subject='));
assert.ok(mailBody.includes('ÜBERFÄLLIG') && mailBody.includes('39.001  Brandschott'));
assert.equal(await page.getByRole('link', { name: /Müller Bau/ }).count(), 0, 'Firmen ohne offene Punkte bekommen keine Mail');
await shot('04-endfassung');

// Zweite Besprechung: 39.001 (offen) und 00.001 (Information, noch „unklar“) werden fortgeschrieben
await page.locator('#back').click();
await page.getByRole('button', { name: 'Neue Baubesprechung' }).click();
// Vorsitzung ist abgeschlossen → keine Warnung; Teilnehmer übernommen, Anwesenheit offen
await page.locator('.item').first().waitFor();
await eventually(() => page.locator('.item .item-no').allTextContents(), ['00.001', '39.001']);
await eventually(() => page.locator('button.attend').allTextContents(), ['offen', 'offen']);
const p39 = page.locator('.item', { has: page.locator('.item-no', { hasText: '39.001' }) });
assert.equal(await p39.getByLabel('Leistungsgruppe').count(), 0, 'fortgeschriebene Nummer ist fest');
await p39.locator('textarea').fill('Material geliefert, Einbau KW 43');
await page.getByRole('button', { name: 'Neuer Punkt' }).click();
const neu = page.locator('.item').nth(2);
await neu.locator('textarea').fill('Neuer Punkt in Sitzung 2');
assert.equal(await neu.locator('.item-no').textContent(), '00.002');
await neu.getByLabel('Leistungsgruppe').selectOption('07');
assert.equal(await neu.locator('.item-no').textContent(), '07.001', 'LG von Hand gewählt');
await neu.getByLabel('Zuständig').selectOption({ label: 'Trockenbau Huber' });
assert.equal(await neu.locator('.item-no').textContent(), '07.001', 'manuelle LG bleibt bei Firmenwahl');
await page.waitForTimeout(900); // automatisches Speichern

// Neu laden: Daten bleiben erhalten
await page.reload();
await page.locator('.item').first().waitFor();
assert.equal(await p39.locator('textarea').inputValue(), 'Material geliefert, Einbau KW 43');
assert.equal(await page.locator('.item').nth(2).locator('textarea').inputValue(), 'Neuer Punkt in Sitzung 2');
await eventually(() => page.locator('.item .item-no').allTextContents(), ['00.001', '39.001', '07.001'], 'fortgeschrieben zuerst, dann neue in Erfassungsreihenfolge');
const pdf2 = await download(() => page.getByRole('button', { name: 'Vorabzug-PDF' }).click());
const text2 = pdfText(pdf2);
writeFileSync(join(OUT, 'vorabzug-2.txt'), text2);
assert.ok(text2.includes('Fortgeschriebene Punkte') && text2.includes('Material geliefert'));
await shot('05-sitzung2');

// Projektübersicht und Sicherung
await page.locator('#back').click();
await page.getByText('Offene Punkte (2)').waitFor();
await shot('06-projekt');
await page.goto(`${BASE}#/sicherung`);
const backup = await download(() => page.getByRole('button', { name: 'Sicherung erstellen' }).click());
// Format 2: Kopfzeile, Länge, JSON-Kopf, danach Bilder als Rohdaten
const raw = readFileSync(backup);
assert.equal(raw.subarray(0, 13).toString(), 'BPSICHERUNG2\n');
const nl = raw.indexOf(10, 13);
const len = Number(raw.subarray(13, nl).toString());
const data = JSON.parse(raw.subarray(nl + 1, nl + 1 + len).toString('utf8'));
assert.equal(data.projects.length, 1);
assert.equal(data.meetings.length, 2);
assert.equal(data.items.length, 3);
assert.equal(data.attachments.length, 2);
assert.ok(data.attachments.every((a) => a.blobs.thumb?.type === 'image/jpeg' && a.blobs.thumb.size > 0));
const bytes = raw.length - (nl + 1 + len);
assert.equal(bytes, data.attachments.reduce((n, a) => n + Object.values(a.blobs).reduce((m, b) => m + b.size, 0), 0), 'Bildbytes vollständig');

// Wiederherstellen: alles löschen, Sicherung einspielen, Daten sind wieder da
await page.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase('baustellen-protokoll'); r.onsuccess = r.onerror = r.onblocked = res; }));
await page.goto(`${BASE}#/sicherung`);
await page.reload();
const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Sicherung einspielen' }).click()]);
await chooser2.setFiles(backup);
await modal.getByRole('button', { name: 'Ersetzen' }).click();
await page.getByRole('link', { name: /BV Musterstraße 12/ }).waitFor();
await page.getByRole('link', { name: /BV Musterstraße 12/ }).click();
await page.getByText('Offene Punkte (2)').waitFor();
await page.getByRole('link', { name: /Baubesprechung Nr. 1/ }).click();
await page.locator('.item .thumb img').first().waitFor();
await eventually(() => page.locator('.item .thumb').count(), 2, 'Bilder nach Wiederherstellung vorhanden');

// Datenbank-Verbindung verloren (wie nach langem Hintergrund in Safari): nächste Eingabe wird trotzdem gespeichert
await page.locator('#back').click();
await page.getByRole('link', { name: /Baubesprechung Nr\. 2/ }).click();
await page.locator('.item textarea').first().waitFor();
await page.evaluate(async () => (await import('/js/db.js'))._closeForTest());
await page.locator('.item textarea').first().fill('Nach Verbindungsverlust gespeichert');
await page.waitForTimeout(1200);
await page.reload();
await page.locator('.item textarea').first().waitFor();
assert.equal(await page.locator('.item textarea').first().inputValue(), 'Nach Verbindungsverlust gespeichert');

// Ohne Netz: App startet vollständig aus dem Offline-Speicher dieser Version
await context.setOffline(true);
await page.goto(BASE);
await page.getByRole('link', { name: /BV Musterstraße 12/ }).waitFor();
await context.setOffline(false);

assert.deepEqual(errors, [], `Keine JS-Fehler: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK –', OUT);
