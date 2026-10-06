// Durchlauf-Test im Browser (Chromium über Playwright). Voraussetzung: Server auf http://localhost:8080
//   npx http-server -c-1 -p 8080 .   und dann   node test/e2e.mjs [Ausgabeordner]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

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
const context = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true, acceptDownloads: true, locale: 'de-DE' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
const modal = page.locator('.modal');
async function fillModal(values, ok) {
  for (const [label, value] of Object.entries(values)) await modal.getByLabel(label, { exact: true }).fill(value);
  await modal.getByRole('button', { name: ok }).click();
}
async function download(trigger) {
  const [dl] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const path = join(OUT, dl.suggestedFilename());
  await dl.saveAs(path);
  return path;
}
const pdfText = (path) => execSync(`pdftotext -layout "${path}" -`).toString();
const isoOffset = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

process.on('uncaughtException', async (e) => {
  console.error(e);
  console.error('JS-Fehler:', errors);
  await shot('fehler').catch(() => {});
  process.exit(1);
});

await page.goto(BASE);
await page.getByRole('button', { name: '+ Neues Projekt' }).click();
await fillModal({ Bauvorhaben: 'BV Musterstraße 12', 'Adresse (optional)': 'Musterstraße 12, 1010 Wien' }, 'Anlegen');
await page.getByRole('link', { name: /Firmen/ }).click();

for (const [firma, gewerk, name, mail] of [
  ['Müller Bau GmbH', 'Rohbau', 'Max Müller', 'max@mueller.example'],
  ['Elektro Huber', 'Elektro', 'Eva Huber', 'eva@huber.example'],
]) {
  await page.getByRole('button', { name: '+ Firma' }).click();
  await fillModal({ Firma: firma, 'Gewerk (optional)': gewerk, 'Ansprechpartner (optional)': name, 'E-Mail (optional)': mail }, 'Hinzufügen');
}
await shot('01-firmen');
await page.locator('#back').click();
await page.getByRole('button', { name: '+ Baubesprechung' }).click();
await page.getByRole('button', { name: 'Alle Firmen hinzufügen' }).click();

// Punkt 1: Aufgabe für Müller, Frist in der Vergangenheit (wird überfällig)
await page.getByRole('button', { name: '+ Punkt' }).click();
const card1 = page.locator('.item').nth(0);
await card1.locator('textarea').fill('Brandschott Achse 3 herstellen, Material: Kompriband');
await card1.locator('select').nth(2).selectOption({ label: 'Müller Bau GmbH' });
await card1.locator('input[type=date]').fill(isoOffset(-3));
// Punkt 2: Info, unklar
await page.getByRole('button', { name: '+ Punkt' }).click();
const card2 = page.locator('.item').nth(1);
await card2.locator('select').nth(0).selectOption('info');
await card2.locator('textarea').fill('Baustrom wird ab nächster Woche umgestellt');
await card2.getByLabel('unklar').check();
assert.equal(await card2.locator('select').nth(1).inputValue(), 'info', 'Info-Punkt hat Status „zur Kenntnis“');

// Skizze zu Punkt 1
await card1.getByRole('button', { name: '✎ Skizze' }).click();
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
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), card1.getByRole('button', { name: '🖼 Mediathek' }).click()]);
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
for (const s of ['Baubesprechung Nr. 1', 'VORABZUG', '1.01', 'Brandschott Achse 3', 'Müller Bau GmbH', 'überfällig', '[unklar - bitte ergänzen]', 'Abb. 1.01-1', 'Abb. 1.01-2', 'Anlagen']) {
  assert.ok(draftText.includes(s), `Vorabzug enthält „${s}“`);
}

// Endfassung
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Endfassung abschließen' }).click();
await modal.getByRole('button', { name: 'Abschließen' }).click();
await page.getByRole('button', { name: /PDF teilen \(Fassung 1\)/ }).waitFor();
const finalPdf = await download(() => page.getByRole('button', { name: /PDF teilen/ }).click());
const finalText = pdfText(finalPdf);
writeFileSync(join(OUT, 'endfassung.txt'), finalText);
assert.ok(finalText.includes('Fassung 1'));
assert.ok(finalText.includes('Einwendungen gegen dieses Protokoll'));
assert.ok(!finalText.includes('VORABZUG'));
assert.equal(await page.locator('.item textarea:not([disabled])').count(), 0, 'Endfassung ist gesperrt');

// Mail je Firma
const mailHref = await page.getByRole('link', { name: /Müller Bau GmbH \(1, 1 überfällig\)/ }).getAttribute('href');
const mailBody = decodeURIComponent(mailHref.split('body=')[1]);
assert.ok(mailHref.startsWith('mailto:max%40mueller.example?subject='));
assert.ok(mailBody.includes('ÜBERFÄLLIG') && mailBody.includes('1.01  Brandschott'));
assert.equal(await page.getByRole('link', { name: /Elektro Huber/ }).count(), 0, 'Info-Punkte erzeugen keine Mail');
await shot('04-endfassung');

// Zweite Besprechung: Punkt 1.01 wird fortgeschrieben, 1.02 (Info) nicht
await page.locator('#back').click();
await page.getByRole('button', { name: '+ Baubesprechung' }).click();
await page.locator('.item').first().waitFor();
assert.equal(await page.locator('.item').count(), 1);
assert.equal(await page.locator('.item .item-no').first().textContent(), '1.01');
await page.locator('.item textarea').fill('Material geliefert, Einbau KW 43');
await page.getByRole('button', { name: '+ Punkt' }).click();
await page.locator('.item').nth(1).locator('textarea').fill('Neuer Punkt in Sitzung 2');
assert.equal(await page.locator('.item .item-no').nth(1).textContent(), '2.01');
await page.waitForTimeout(900); // automatisches Speichern

// Neu laden: Daten bleiben erhalten
await page.reload();
await page.locator('.item').first().waitFor();
assert.equal(await page.locator('.item textarea').first().inputValue(), 'Material geliefert, Einbau KW 43');
assert.equal(await page.locator('.item textarea').nth(1).inputValue(), 'Neuer Punkt in Sitzung 2');
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
const data = JSON.parse(readFileSync(backup, 'utf8'));
assert.equal(data.projects.length, 1);
assert.equal(data.meetings.length, 2);
assert.equal(data.items.length, 3);
assert.equal(data.attachments.length, 2);
assert.ok(data.attachments.every((a) => typeof a.thumb === 'string' && a.thumb.startsWith('data:image/jpeg')));

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
assert.equal(await page.locator('.item .thumb').count(), 2, 'Bilder nach Wiederherstellung vorhanden');

assert.deepEqual(errors, [], `Keine JS-Fehler: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK –', OUT);
