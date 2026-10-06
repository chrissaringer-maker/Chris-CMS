import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newProject, newCompany, newContact, createMeeting, addItem, updateEntry, entryFor, itemsForMeeting,
  buildProtocol, companyDigests, mailtoUrl, canDelete, canEditBase, finalizeMeeting, reopenMeeting,
  versionLabel, compareNo, openItems, isOverdue, distribution, fileSafe,
} from '../js/model.js';

function setup() {
  const project = newProject('BV Musterstraße');
  project.author = 'C. Saringer';
  const mueller = newCompany('Müller Bau', 'Rohbau');
  mueller.contacts.push(newContact('Max Müller', 'max@mueller.example'));
  const elektro = newCompany('Elektro Huber', 'Elektro');
  elektro.contacts.push(newContact('Eva Huber', 'eva@huber.example'));
  elektro.contacts.push({ ...newContact('Ohne Verteiler', 'x@huber.example'), inDistribution: false });
  project.companies.push(mueller, elektro);
  return { project, mueller, elektro };
}

test('erste Besprechung bekommt Nr. 1, Punkte werden fortlaufend nummeriert', () => {
  const { project } = setup();
  const { meeting } = createMeeting({ project, meetings: [], items: [], type: 'besprechung', date: '2026-10-06' });
  assert.equal(meeting.number, 1);
  const a = addItem({ meeting, items: [] });
  const b = addItem({ meeting, items: [a] });
  assert.equal(a.no, '1.01');
  assert.equal(b.no, '1.02');
  // gelöschte Nummer wird nicht wiederverwendet, solange ein höherer Punkt existiert
  const c = addItem({ meeting, items: [b] });
  assert.equal(c.no, '1.03');
});

test('Begehungen haben eigene Reihe mit Präfix B', () => {
  const { project } = setup();
  const { meeting: b1 } = createMeeting({ project, meetings: [], items: [], type: 'begehung' });
  assert.equal(addItem({ meeting: b1, items: [] }).no, 'B1.01');
  const { meeting: m1 } = createMeeting({ project, meetings: [b1], items: [], type: 'besprechung' });
  assert.equal(m1.number, 1);
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
  // Teilnehmer übernommen, Anwesenheit zurückgesetzt
  assert.equal(m2.participants.length, 1);
  assert.equal(m2.participants[0].present, true);
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
  assert.equal(row.no, '1.01');
  assert.equal(row.note, 'Material fehlt');
  assert.equal(row.overdue, true); // Frist 10.10. < Sitzung 13.10.
  assert.equal(row.company, 'Müller Bau');
  assert.equal(prot2.figures[0].label, 'Abb. 1.01-1');

  const prot3 = buildProtocol({ project, meeting: m3, meetings: [m1, m2, m3], items: [p5, q] });
  const done = prot3.sections.find((s) => s.title.startsWith('Erledigt')).rows[0];
  assert.deepEqual(done.history, [{ date: '13.10.2026', note: 'Material fehlt' }]);
  assert.equal(done.overdue, false);
  assert.match(prot3.objection, /binnen 5 Werktagen/);
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
  assert.match(d.body, /1\.01 {2}Brandschott – Frist 01\.10\.2026/);
  assert.match(d.body, /Maßgeblich ist das Gesamtprotokoll vom 06\.10\.2026/);
  assert.match(d.subject, /Baubesprechung Nr\. 1 vom 06\.10\.2026 – Ihre offenen Punkte \(Müller Bau\)/);

  const url = mailtoUrl(d.recipients, d.subject, d.body);
  assert.ok(url.startsWith('mailto:max%40mueller.example?subject='));
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
  assert.ok(compareNo('1.10', '1.02') > 0);
  assert.ok(compareNo('2.01', '10.01') < 0);
  assert.ok(compareNo('B1.01', '1.01') > 0);
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
  assert.deepEqual(openItems([a, b], project.id).map((x) => x.item.no), ['1.01']);
  assert.equal(itemsForMeeting([b, a], m1.id)[0].item.no, '1.01');
});
