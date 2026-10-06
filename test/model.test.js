import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newProject, newCompany, newContact, createMeeting, addItem, updateEntry, entryFor, itemsForMeeting,
  buildProtocol, companyDigests, mailtoUrl, canDelete, canEditBase, finalizeMeeting, reopenMeeting,
  versionLabel, compareNo, openItems, isOverdue, distribution, fileSafe, changeLg, lgFromCompany, nextNo,
  normalizeLg, parseLgList, projectLgs, objectionClause, carryOver, laterMeeting,
} from '../js/model.js';

function setup() {
  const project = newProject('BV Musterstraße');
  project.author = 'C. Saringer';
  const mueller = newCompany('Müller Bau', 'Baumeister', ['07']);
  mueller.contacts.push(newContact('Max Müller', 'max@mueller.example'));
  const elektro = newCompany('Trockenbau Huber', 'Trockenbau', ['39']);
  elektro.contacts.push(newContact('Eva Huber', 'eva@huber.example'));
  elektro.contacts.push({ ...newContact('Ohne Verteiler', 'x@huber.example'), inDistribution: false });
  project.companies.push(mueller, elektro);
  return { project, mueller, elektro };
}

test('Nummern je Leistungsgruppe: LG.001 fortlaufend, projektweit über alle Sitzungen', () => {
  const { project } = setup();
  const { meeting } = createMeeting({ project, meetings: [], items: [], type: 'besprechung', date: '2026-10-06' });
  assert.equal(meeting.number, 1);
  const a = addItem({ meeting, items: [] });
  const b = addItem({ meeting, items: [a] });
  const t1 = addItem({ meeting, items: [a, b], lg: '39' });
  assert.deepEqual([a.no, b.no, t1.no], ['00.001', '00.002', '39.001']);
  // nächste Sitzung zählt in derselben LG weiter
  const { meeting: m2 } = createMeeting({ project, meetings: [meeting], items: [a, b, t1], type: 'besprechung' });
  assert.equal(addItem({ meeting: m2, items: [a, b, t1], lg: '39' }).no, '39.002');
});

test('Besprechungen und Begehungen teilen sich die Nummern eines Projekts', () => {
  const { project } = setup();
  const { meeting: b1 } = createMeeting({ project, meetings: [], items: [], type: 'begehung' });
  const x = addItem({ meeting: b1, items: [], lg: '39' });
  assert.equal(x.no, '39.001');
  const { meeting: m1 } = createMeeting({ project, meetings: [b1], items: [x], type: 'besprechung' });
  assert.equal(m1.number, 1);
  assert.equal(addItem({ meeting: m1, items: [x], lg: '39' }).no, '39.002');
});

test('LG wechseln: neue Nummer; Übernahme aus Firma nur ohne manuelle Wahl; gesperrt nach Fortschreibung', () => {
  const { project, mueller, elektro } = setup();
  const { meeting } = createMeeting({ project, meetings: [], items: [], type: 'besprechung' });
  const existing = addItem({ meeting, items: [], lg: '39' }); // 39.001
  let p = addItem({ meeting, items: [existing] }); // 00.001
  p = lgFromCompany(p, [existing, p], meeting, elektro);
  assert.equal(p.no, '39.002');
  assert.equal(p.lgManual, false);
  p = changeLg(p, [existing, p], meeting, '07');
  assert.equal(p.no, '07.001');
  assert.equal(p.lgManual, true);
  // manuell gewählt → Firma ändert die LG nicht mehr
  assert.equal(lgFromCompany(p, [existing, p], meeting, elektro).no, '07.001');
  // zurück auf dieselbe LG behält die Nummer
  assert.equal(changeLg(p, [existing, p], meeting, '07').no, '07.001');
  // nach Fortschreibung keine Umnummerierung
  const { meeting: m2, items: carriedAll } = createMeeting({ project, meetings: [meeting], items: [existing, p], type: 'besprechung' });
  const carried = carriedAll.find((i) => i.id === p.id);
  assert.equal(carried.no, '07.001');
  assert.throws(() => changeLg(carried, [existing, carried], meeting, '39'), /fortgeschrieben/);
  assert.equal(lgFromCompany(carried, [existing, carried], m2, mueller).no, '07.001');
});

test('LG voll bei 999 Punkten', () => {
  const items = [{ id: 'x', projectId: 'p', lg: '39', no: '39.999' }];
  assert.throws(() => nextNo(items, 'p', '39'), /voll/);
  assert.equal(nextNo(items, 'p', '40'), '40.001');
});

test('LG-Eingaben und Bezeichnungen', () => {
  assert.equal(normalizeLg('7'), '07');
  assert.equal(normalizeLg('39'), '39');
  assert.equal(normalizeLg('390'), null);
  assert.deepEqual(parseLgList('07, 8 39;39'), ['07', '08', '39']);
  const { project } = setup();
  assert.deepEqual(projectLgs(project), [
    { lg: '00', label: 'Allgemein' }, { lg: '07', label: 'Baumeister' }, { lg: '39', label: 'Trockenbau' },
  ]);
});

test('Einwendungsklausel: Standard 14 Tage ab Übermittlung (ÖNORM B 2110)', () => {
  const { project } = setup();
  assert.equal(project.objectionDays, 14);
  assert.match(objectionClause(project), /binnen 14 Tagen ab Übermittlung schriftlich/);
});

test('offene Punkte werden in die nächste Besprechung übernommen, erledigte und Infos nicht', () => {
  const { project, mueller } = setup();
  const { meeting: m1 } = createMeeting({ project, meetings: [], items: [], type: 'besprechung', date: '2026-10-06' });
  m1.participants = [{ companyId: mueller.id, name: 'Max Müller', present: false }];
  let open = addItem({ meeting: m1, items: [], companyId: mueller.id });
  open = { ...open, text: 'Brandschott Achse 3 herstellen' };
  open = updateEntry(open, m1.id, { due: '2026-10-15' });
  let done = addItem({ meeting: m1, items: [open] });
  done = updateEntry(done, m1.id, { status: 'erledigt' });
  const info = addItem({ meeting: m1, items: [open, done], type: 'info' });

  const { meeting: m2, items: carried } = createMeeting({
    project, meetings: [m1], items: [open, done, info], type: 'besprechung', date: '2026-10-13',
  });
  assert.equal(m2.number, 2);
  assert.equal(carried.length, 1);
  assert.equal(carried[0].id, open.id);
  const e = entryFor(carried[0], m2.id);
  assert.equal(e.due, '2026-10-15');
  assert.equal(e.status, 'offen');
  assert.equal(e.note, '');
  // Teilnehmer übernommen, Anwesenheit offen (nicht automatisch „anwesend“)
  assert.equal(m2.participants.length, 1);
  assert.equal(m2.participants[0].attendance, '');
  // Eingaben unverändert
  assert.equal(open.log.length, 1);
});

test('Protokoll: Abschnitte, Verlauf, überfällig, Anlagen-Nummern', () => {
  const { project, mueller } = setup();
  const { meeting: m1 } = createMeeting({ project, meetings: [], items: [], type: 'besprechung', date: '2026-10-06' });
  let p = { ...addItem({ meeting: m1, items: [], companyId: mueller.id }), text: 'Brandschott herstellen' };
  p = updateEntry(p, m1.id, { due: '2026-10-10', note: '' });
  const { meeting: m2, items: [p2] } = createMeeting({ project, meetings: [m1], items: [p], type: 'besprechung', date: '2026-10-13' });
  let p3 = updateEntry(p2, m2.id, { note: 'Material fehlt', attachmentIds: ['att1'] });
  let q = addItem({ meeting: m2, items: [p3] });
  q = { ...q, text: 'Neuer Punkt' };
  // dritte Sitzung: Verlauf zeigt Notiz aus Sitzung 2
  const { meeting: m3, items: [p4] } = createMeeting({ project, meetings: [m1, m2], items: [p3, q], type: 'besprechung', date: '2026-10-20' });
  const p5 = updateEntry(p4, m3.id, { status: 'erledigt' });

  const prot2 = buildProtocol({ project, meeting: m2, meetings: [m1, m2], items: [p3, q], attachments: [{ id: 'att1', kind: 'photo', caption: 'Achse 3' }] });
  assert.deepEqual(prot2.sections.map((s) => s.title), ['Neue Punkte', 'Fortgeschriebene Punkte']);
  const row = prot2.sections[1].rows[0];
  assert.equal(row.no, '00.001');
  assert.equal(row.lgLabel, 'Allgemein');
  assert.equal(row.note, 'Material fehlt');
  assert.equal(row.overdue, true); // Frist 10.10. < Sitzung 13.10.
  assert.equal(row.company, 'Müller Bau');
  assert.equal(prot2.figures[0].label, 'Abb. 00.001-1');

  const prot3 = buildProtocol({ project, meeting: m3, meetings: [m1, m2, m3], items: [p5, q] });
  const done = prot3.sections.find((s) => s.title.startsWith('Erledigt')).rows[0];
  assert.deepEqual(done.history, [{ date: '13.10.2026', note: 'Material fehlt' }]);
  assert.equal(done.overdue, false);
  assert.match(prot3.objection, /binnen 14 Tagen/);
});

test('Mail je Firma: nur eigene offene Punkte, überfällig zuerst, Hinweis auf Gesamtprotokoll', () => {
  const { project, mueller, elektro } = setup();
  const { meeting: m1 } = createMeeting({ project, meetings: [], items: [], type: 'besprechung', date: '2026-10-06' });
  let a = { ...addItem({ meeting: m1, items: [], companyId: mueller.id }), text: 'Brandschott' };
  a = updateEntry(a, m1.id, { due: '2026-10-01' });
  let b = { ...addItem({ meeting: m1, items: [a], companyId: mueller.id }), text: 'Schalung prüfen' };
  b = updateEntry(b, m1.id, { due: '2026-10-30' });
  const c = { ...addItem({ meeting: m1, items: [a, b], companyId: elektro.id, type: 'info' }), text: 'Info an Elektro' };

  const digests = companyDigests({ project, meeting: m1, items: [a, b, c], refDate: '2026-10-06' });
  assert.equal(digests.length, 1); // Info-Punkt an Elektro ist nicht offen
  const d = digests[0];
  assert.equal(d.company, 'Müller Bau');
  assert.deepEqual(d.recipients, ['max@mueller.example']);
  assert.equal(d.overdue, 1);
  assert.ok(d.body.indexOf('ÜBERFÄLLIG') < d.body.indexOf('NEU'));
  assert.match(d.body, /00\.001 {2}Brandschott – Frist 01\.10\.2026/);
  assert.match(d.body, /Maßgeblich ist das Gesamtprotokoll vom 06\.10\.2026/);
  assert.match(d.subject, /Baubesprechung Nr\. 1 vom 06\.10\.2026 – Ihre offenen Punkte \(Müller Bau\)/);

  const url = mailtoUrl(d.recipients, d.subject, d.body);
  assert.ok(url.startsWith('mailto:max@mueller.example?subject='));
  assert.ok(!url.includes(' '));
});

test('Endfassung sperrt, neue Fassung zählt hoch; Löschen nur ohne Fortschreibung', () => {
  const { project } = setup();
  const { meeting: m1 } = createMeeting({ project, meetings: [], items: [], type: 'besprechung' });
  const item = addItem({ meeting: m1, items: [] });
  assert.equal(canDelete(item, m1), true);
  assert.equal(versionLabel(m1), 'Entwurf');
  const f1 = finalizeMeeting(m1, { title: 'x' });
  assert.equal(versionLabel(f1), 'Fassung 1');
  assert.equal(canEditBase(item, f1), false);
  assert.equal(canDelete(item, f1), false);
  const r = reopenMeeting(f1);
  assert.equal(versionLabel(r), 'Fassung 2 (in Bearbeitung)');
  const f2 = finalizeMeeting(r, { title: 'y' });
  assert.equal(f2.finals.length, 2);
  assert.equal(f2.finals[0].protocol.title, 'x');

  const { meeting: m2, items: carried } = createMeeting({ project, meetings: [f2], items: [item], type: 'besprechung' });
  assert.equal(carried.length, 1);
  assert.equal(canDelete(carried[0], r), false); // in m2 fortgeschrieben
  assert.equal(canEditBase(carried[0], m2), false);
});

test('Hilfsfunktionen', () => {
  assert.ok(compareNo('39.010', '39.002') > 0);
  assert.ok(compareNo('07.001', '39.001') < 0);
  assert.ok(compareNo('00.002', '07.001') < 0);
  assert.equal(isOverdue({ status: 'offen', due: '2026-10-01' }, '2026-10-02'), true);
  assert.equal(isOverdue({ status: 'erledigt', due: '2026-10-01' }, '2026-10-02'), false);
  assert.equal(isOverdue({ status: 'offen', due: '' }, '2026-10-02'), false);
  const { project } = setup();
  assert.deepEqual(distribution(project).map((d) => d.email), ['max@mueller.example', 'eva@huber.example']);
  assert.equal(fileSafe('BV Müllerstraße – Nr. 4'), 'BV_Muellerstrasse_Nr._4');
});

test('offene Punkte über alle Sitzungen', () => {
  const { project } = setup();
  const { meeting: m1 } = createMeeting({ project, meetings: [], items: [], type: 'besprechung' });
  const a = addItem({ meeting: m1, items: [] });
  const b = updateEntry(addItem({ meeting: m1, items: [a] }), m1.id, { status: 'erledigt' });
  assert.deepEqual(openItems([a, b], project.id).map((x) => x.item.no), ['00.001']);
  assert.equal(itemsForMeeting([b, a], m1.id)[0].item.no, '00.001');
});

test('Fortschreibung auch, wenn die Vorsitzung nach Anlage der Folgesitzung ergänzt wird', () => {
  const { project, mueller } = setup();
  const { meeting: m1 } = createMeeting({ project, meetings: [], items: [], type: 'besprechung', date: '2026-10-06' });
  const a = addItem({ meeting: m1, items: [], companyId: mueller.id });
  const { meeting: m2, items: carried } = createMeeting({ project, meetings: [m1], items: [a], type: 'besprechung', date: '2026-10-13' });
  assert.equal(carried.length, 1);
  // nachträglich in Sitzung 1 ergänzt: offen und erledigt
  const late = addItem({ meeting: m1, items: [carried[0]] });
  const lateDone = updateEntry(addItem({ meeting: m1, items: [carried[0], late] }), m1.id, { status: 'erledigt' });
  const sync = carryOver({ meetings: [m1, m2], items: [carried[0], late, lateDone], meeting: m2 });
  assert.deepEqual(sync.map((i) => i.id), [late.id], 'nur der offene, noch fehlende Punkt');
  assert.equal(entryFor(sync[0], m2.id).status, 'offen');
  // Punkte aus Sitzung 1, die in Sitzung 3 weiterlaufen, werden für Sitzung 2 nicht angefasst
  const { meeting: m3, items: c3 } = createMeeting({ project, meetings: [m1, m2], items: [...sync, lateDone, carried[0]], type: 'besprechung' });
  assert.equal(c3.length, 2);
  assert.equal(carryOver({ meetings: [m1, m2, m3], items: c3, meeting: m2 }).length, 0);
  assert.equal(laterMeeting([m1, m2, m3], m1).id, m2.id);
  assert.equal(laterMeeting([m1, m2, m3], m3), null);
});

test('Anwesenheit: neue Sitzung beginnt offen, Altdaten werden abgebildet, Protokoll zeigt Text', async () => {
  const { attendanceOf, ATTENDANCE } = await import('../js/model.js');
  const { project, mueller } = setup();
  const { meeting: m1 } = createMeeting({ project, meetings: [], items: [], type: 'besprechung' });
  m1.participants = [{ companyId: mueller.id, name: 'Max', present: true }, { companyId: mueller.id, name: 'Eva', attendance: 'entschuldigt' }];
  assert.equal(attendanceOf(m1.participants[0]), 'anwesend');
  const { meeting: m2 } = createMeeting({ project, meetings: [m1], items: [], type: 'besprechung' });
  assert.deepEqual(m2.participants.map(attendanceOf), ['', '']);
  assert.ok(m2.participants.every((p) => !('present' in p)));
  const prot = buildProtocol({ project, meeting: m1, meetings: [m1], items: [] });
  assert.deepEqual(prot.participants.map((p) => p.attendance), [ATTENDANCE.anwesend, ATTENDANCE.entschuldigt]);
});

test('Unklare Informationen werden fortgeschrieben, erledigte nicht', () => {
  const { project } = setup();
  const { meeting: m1 } = createMeeting({ project, meetings: [], items: [], type: 'besprechung' });
  const info = updateEntry(addItem({ meeting: m1, items: [], type: 'info' }), m1.id, { unclear: true });
  const doneUnclear = updateEntry(addItem({ meeting: m1, items: [info] }), m1.id, { unclear: true, status: 'erledigt' });
  const { meeting: m2, items: carried } = createMeeting({ project, meetings: [m1], items: [info, doneUnclear], type: 'besprechung' });
  assert.deepEqual(carried.map((i) => i.id), [info.id]);
  assert.equal(entryFor(carried[0], m2.id).status, 'info');
  assert.equal(entryFor(carried[0], m2.id).unclear, true);
});

test('Firmenmail nur an Kontakte im Verteiler; @ bleibt lesbar', () => {
  const { project, elektro } = setup();
  const { meeting: m1 } = createMeeting({ project, meetings: [], items: [], type: 'besprechung', date: '2026-10-06' });
  const it = { ...addItem({ meeting: m1, items: [], companyId: elektro.id }), text: 'Trockenbauwand schließen' };
  const [d] = companyDigests({ project, meeting: m1, items: [it], refDate: '2026-10-06' });
  assert.deepEqual(d.recipients, ['eva@huber.example'], 'Kontakt „nicht im Verteiler“ fehlt');
  assert.ok(mailtoUrl(['a@b.at', 'c@d.at'], 'S', 'B').startsWith('mailto:a@b.at,c@d.at?subject='));
});

test('Altprojekte (5 Werktage, alter Wortlaut) drucken die österreichische 14-Tage-Klausel', () => {
  const { project } = setup();
  project.objectionDays = 5;
  project.objectionText = 'Einwendungen gegen dieses Protokoll sind binnen {tage} Werktagen nach Erhalt schriftlich an den Verfasser zu richten. Andernfalls gilt das Protokoll als genehmigt.';
  assert.match(objectionClause(project), /binnen 14 Tagen ab Übermittlung/);
  project.objectionText = 'Eigener Text, {tage} Tage.';
  project.objectionDays = 10;
  assert.equal(objectionClause(project), 'Eigener Text, 10 Tage.');
});

test('PDF-Text: Sonderzeichen werden zur Grundform statt zu verschwinden', async () => {
  const { clean } = await import('../js/pdf.js');
  assert.equal(clean('Šimić Đorđević Łukasz'), 'Simic Djordjevic Lukasz');
  assert.equal(clean('Müller – Größe ß „ok“ €'), 'Müller - Größe ß "ok" EUR');
});
