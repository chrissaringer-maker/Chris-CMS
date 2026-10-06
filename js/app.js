// Einstieg: Router und die Ansichten Start, Projekt, Firmen, Projektdaten, Sicherung.
import { h, icon, mount, add, labeled, setRail, getPrefs, setPrefs, applyPrefs, setTitle, toast, ask, confirmAsk, offerShare, pickFile, releaseBlobUrls, markSaved } from './ui.js';
import * as store from './store.js';
import { exportAll, importAll, backupAgeDays, markBackupDone } from './backup.js';
import {
  newProject, newCompany, newContact, parseLgList, seriesOf, meetingTitle, formatDate, openItems, companyName,
  isOverdue, isoDate, MEETING_TYPES, DEFAULT_OBJECTION_TEXT, DEFAULT_OBJECTION_DAYS, versionLabel,
} from './model.js';
import { renderMeeting, flushPending, stopDictation, leaveMeeting } from './meeting.js';

const app = document.getElementById('app');

const routes = [
  [/^#\/?$/, renderHome],
  [/^#\/p\/([\w-]+)$/, renderProject],
  [/^#\/p\/([\w-]+)\/firmen$/, renderCompanies],
  [/^#\/p\/([\w-]+)\/daten$/, renderProjectSettings],
  [/^#\/m\/([\w-]+)$/, (id) => renderMeeting(app, id)],
  [/^#\/sicherung$/, renderBackup],
];

async function route() {
  leaveMeeting();
  await flushPending();
  releaseBlobUrls();
  setRail([]);
  window.scrollTo(0, 0);
  const hash = location.hash || '#/';
  for (const [re, view] of routes) {
    const m = re.exec(hash);
    if (m) {
      try {
        await view(...m.slice(1));
      } catch (e) {
        console.error(e);
        mount(app, h('div', { class: 'card banner danger' }, h('strong', {}, 'Fehler: '), e.message, h('p', {}, h('a', { href: '#/' }, 'Zur Startseite'))));
      }
      return;
    }
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', route);
for (const ev of ['pagehide', 'visibilitychange']) {
  window.addEventListener(ev, () => {
    if (ev === 'pagehide' || document.visibilityState === 'hidden') stopDictation();
    flushPending();
  });
}

// ---------- Start ----------

async function renderHome() {
  setTitle('Baustellen-Protokoll');
  const projects = await store.listProjects();
  const banners = [];

  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
  if (ios && !standalone) {
    banners.push(h('div', { class: 'card banner' },
      h('strong', {}, 'Als App installieren: '),
      'In Safari auf „Teilen“ → „Zum Home-Bildschirm“ tippen. ',
      h('strong', {}, 'Wichtig: '),
      'Danach nur noch die App vom Home-Bildschirm benutzen. Safari und die installierte App speichern getrennt – Daten aus dem einen sind im anderen nicht sichtbar.'));
  }
  if (projects.length && (await backupAgeDays()) > 7) {
    banners.push(h('div', { class: 'card banner danger' },
      h('strong', {}, 'Sicherung fällig. '),
      'Die Daten liegen nur auf diesem iPad. ',
      h('a', { href: '#/sicherung' }, 'Jetzt sichern')));
  }

  setRail([
    { icon: 'settings', label: 'Sicherung & Einstellungen', aria: 'Sicherung und Einstellungen', href: '#/sicherung', wide: true },
    { icon: 'plus', label: 'Neues Projekt', primary: true, wide: true, onclick: createProject },
  ]);
  mount(app,
    ...banners,
    projects.length
      ? h('ul', { class: 'list' }, projects.map((p) => h('li', {},
        h('a', { class: 'row', href: `#/p/${p.id}` },
          h('div', { class: 'grow' }, h('strong', {}, p.name), h('div', { class: 'sub' }, p.address || 'ohne Adresse')),
          h('span', { class: 'sub mono' }, '›')))))
      : h('p', { class: 'muted pad' }, 'Noch keine Projekte. Rechts in der Daumenleiste „Projekt“ tippen, dann Firmen und die erste Besprechung anlegen.'),
  );
}

async function createProject() {
  const r = await ask({
    title: 'Neues Projekt',
    fields: [
      { name: 'name', label: 'Bauvorhaben', placeholder: 'z. B. BV Musterstraße 12' },
      { name: 'address', label: 'Adresse (optional)' },
    ],
    ok: 'Anlegen',
  });
  if (!r?.name) return;
  const p = newProject(r.name);
  p.address = r.address;
  await store.saveProject(p);
  location.hash = `#/p/${p.id}`;
}

// ---------- Projekt ----------

async function renderProject(id) {
  const bundle = await store.loadBundle(id);
  const { project, meetings, items } = bundle;
  if (!project) throw new Error('Projekt nicht gefunden.');
  setTitle(project.name, '#/');

  const start = async (type) => {
    if (!project.companies.length && !(await confirmAsk('Noch keine Firmen', 'Ohne Firmen kannst du keine Zuständigkeiten vergeben. Trotzdem anlegen?', 'Trotzdem'))) return;
    const prev = seriesOf(meetings, project.id, type).at(-1);
    if (prev && prev.status !== 'endfassung' && !(await confirmAsk(
      `${meetingTitle(prev)} ist noch nicht abgeschlossen`,
      'Punkte, die du dort noch ergänzt, werden beim Öffnen der neuen Sitzung automatisch übernommen. Statusänderungen an schon übernommenen Punkten musst du in der neuen Sitzung nachtragen. Trotzdem neue Sitzung anlegen?',
      'Neue Sitzung'))) return;
    const m = await store.startMeeting(bundle, type);
    location.hash = `#/m/${m.id}`;
  };

  const today = isoDate();
  const open = openItems(items, project.id);
  const byCompany = new Map();
  for (const x of open) {
    const key = x.entry.companyId || '';
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(x);
  }

  const meetingList = (type) => {
    const list = seriesOf(meetings, project.id, type).reverse();
    if (!list.length) return h('p', { class: 'muted' }, 'Noch keine.');
    return h('ul', { class: 'list' }, list.map((m) => {
      const count = items.filter((i) => i.log.some((e) => e.meetingId === m.id)).length;
      return h('li', {}, h('a', { class: 'row', href: `#/m/${m.id}` },
        h('div', { class: 'grow' },
          h('strong', {}, meetingTitle(m)),
          h('div', { class: 'sub' }, `${formatDate(m.date)} · ${count} Punkte`)),
        h('span', { class: `chip ${m.status === 'endfassung' ? 'final' : ''}` }, versionLabel(m))));
    }));
  };

  setRail([
    { icon: 'back', label: 'Zurück', href: '#/' },
    { icon: 'settings', label: 'Projekt', aria: 'Projektdaten', href: `#/p/${id}/daten` },
    { icon: 'building', label: `Firmen (${project.companies.length})`, aria: 'Firmen und Kontakte', href: `#/p/${id}/firmen` },
    { icon: 'plus', label: 'Begehung', aria: 'Neue Baubegehung', onclick: () => start('begehung') },
    { icon: 'plus', label: 'Neue Besprechung', aria: 'Neue Baubesprechung', primary: true, wide: true, onclick: () => start('besprechung') },
  ]);
  mount(app,
    h('h2', {}, MEETING_TYPES.besprechung.label + 'en'),
    meetingList('besprechung'),
    h('h2', {}, MEETING_TYPES.begehung.label + 'en'),
    meetingList('begehung'),
    h('h2', {}, `Offene Punkte (${open.length})`),
    open.length
      ? [...byCompany.entries()].map(([cid, list]) => h('div', { class: 'card' },
        h('h3', {}, cid ? companyName(project, cid) : 'ohne Zuständigkeit'),
        h('ul', { class: 'history', style: 'color:inherit;font-size:.95rem' }, list.map(({ item, entry }) => h('li', {},
          h('strong', {}, item.no), ' ', item.text || '(ohne Text)',
          entry.due ? h('span', { class: `chip ${isOverdue(entry, today) ? 'overdue' : ''}`, style: 'margin-left:6px' }, `Frist ${formatDate(entry.due)}`) : null)))))
      : h('p', { class: 'muted' }, 'Keine offenen Punkte.'),
  );
}

// ---------- Firmen & Kontakte ----------

async function renderCompanies(id) {
  const project = await store.getProject(id);
  if (!project) throw new Error('Projekt nicht gefunden.');
  setTitle(`Firmen – ${project.name}`, `#/p/${id}`);
  const save = async () => {
    await store.saveProject(project);
    markSaved();
  };
  const rerender = () => renderCompanies(id);

  const addCompany = async () => {
    const r = await ask({
      title: 'Firma hinzufügen',
      fields: [
        { name: 'name', label: 'Firma', placeholder: 'z. B. Müller Bau GmbH' },
        { name: 'trade', label: 'Gewerk (optional)', placeholder: 'z. B. Trockenbau' },
        { name: 'lgs', label: 'Leistungsgruppe(n) (optional)', placeholder: 'z. B. 39 oder 07, 08', inputmode: 'numeric' },
        { name: 'contact', label: 'Ansprechpartner (optional)' },
        { name: 'email', label: 'E-Mail (optional)', type: 'email' },
      ],
      ok: 'Hinzufügen',
    });
    if (!r?.name) return;
    const c = newCompany(r.name, r.trade, parseLgList(r.lgs));
    if (r.contact || r.email) c.contacts.push(newContact(r.contact, r.email));
    project.companies.push(c);
    await save();
    rerender();
  };

  const contactRow = (c, k) => h('div', { class: 'grid', style: 'align-items:end;border-top:1px solid var(--line);padding-top:6px;margin-top:6px' },
    h('div', {}, labeled('Name', h('input', { value: k.name, onchange: (e) => { k.name = e.target.value.trim(); save(); } }))),
    h('div', {}, labeled('E-Mail', h('input', { type: 'email', value: k.email, onchange: (e) => { k.email = e.target.value.trim(); save(); } }))),
    h('div', {}, labeled('Telefon', h('input', { type: 'tel', value: k.phone ?? '', onchange: (e) => { k.phone = e.target.value.trim(); save(); } }))),
    h('div', { class: 'inline', style: 'min-height:var(--tap)' },
      h('label', { class: 'inline', style: 'margin:0' },
        h('input', { type: 'checkbox', checked: k.inDistribution !== false, onchange: (e) => { k.inDistribution = e.target.checked; save(); } }),
        'im Verteiler'),
      h('button', { class: 'danger', onclick: async () => {
        if (!(await confirmAsk('Kontakt löschen?', k.name || k.email, 'Löschen', true))) return;
        c.contacts = c.contacts.filter((x) => x !== k);
        await save();
        rerender();
      } }, icon('trash'), 'Löschen')));

  setRail([
    { icon: 'back', label: 'Zurück', href: `#/p/${id}`, wide: true },
    { icon: 'plus', label: 'Firma hinzufügen', primary: true, wide: true, onclick: addCompany },
  ]);
  mount(app,
    h('p', { class: 'muted small' }, 'Die Kontakte mit E-Mail bilden den Verteiler. Die Leistungsgruppe (LB-HB) bestimmt die Nummer der Punkte: Wählst du bei einem Punkt die Firma, bekommt er die Nummer ihrer LG (z. B. 39.001). Allgemeine Punkte laufen unter LG 00.'),
    project.companies.map((c) => h('div', { class: 'card' },
      h('div', { class: 'grid' },
        h('div', {}, labeled('Firma', h('input', { value: c.name, onchange: (e) => { c.name = e.target.value.trim(); save(); } }))),
        h('div', {}, labeled('Gewerk', h('input', { value: c.trade, onchange: (e) => { c.trade = e.target.value.trim(); save(); } }))),
        h('div', {}, labeled('Leistungsgruppe(n)', h('input', { value: (c.lgs ?? []).join(', '), inputmode: 'numeric', placeholder: 'z. B. 39',
          onchange: (e) => { c.lgs = parseLgList(e.target.value); e.target.value = c.lgs.join(', '); save(); } })))),
      c.contacts.map((k) => contactRow(c, k)),
      h('div', { class: 'actions' },
        h('button', { onclick: async () => {
          c.contacts.push(newContact());
          await save();
          rerender();
        } }, icon('plus'), 'Kontakt'),
        h('button', { class: 'danger', onclick: async () => {
          if (!(await confirmAsk('Firma löschen?', `${c.name} – bestehende Punkte behalten die Zuordnung nicht mehr.`, 'Löschen', true))) return;
          project.companies = project.companies.filter((x) => x !== c);
          await save();
          rerender();
        } }, icon('trash'), 'Firma löschen')))),
  );
}

// ---------- Projektdaten ----------

async function renderProjectSettings(id) {
  const project = await store.getProject(id);
  if (!project) throw new Error('Projekt nicht gefunden.');
  setTitle(`Projektdaten – ${project.name}`, `#/p/${id}`);
  const field = (key, label, attrs = {}) => h('div', {},
    labeled(label, h(attrs.textarea ? 'textarea' : 'input', {
      value: project[key] ?? '',
      type: attrs.type,
      min: attrs.min,
      onchange: async (e) => {
        project[key] = attrs.type === 'number' ? Math.max(1, Number(e.target.value) || DEFAULT_OBJECTION_DAYS) : e.target.value.trim();
        await store.saveProject(project);
        markSaved();
      },
    })));

  setRail([{ icon: 'back', label: 'Zurück', href: `#/p/${id}`, wide: true }]);
  mount(app,
    h('div', { class: 'card' },
      field('name', 'Bauvorhaben'),
      field('address', 'Adresse'),
      field('client', 'Bauherr'),
      field('author', 'Verfasser (erscheint im Protokoll und unter den Mails)')),
    h('div', { class: 'card' },
      field('objectionDays', 'Einwendungsfrist in Tagen', { type: 'number', min: 1 }),
      field('objectionText', 'Text der Einwendungsklausel ({tage} wird ersetzt)', { textarea: true }),
      h('p', { class: 'muted small' }, 'Österreich: Nach ÖNORM B 2110 gelten einseitige Aufzeichnungen als bestätigt, wenn der Vertragspartner nicht binnen 14 Tagen ab Übergabe schriftlich widerspricht – aber nur, wenn die ÖNORM im Bauvertrag vereinbart ist. Ohne diese Vereinbarung ist die Wirkung des Schweigens nach OGH-Rechtsprechung unsicher.'),
      h('div', { class: 'actions' }, h('button', { onclick: async () => {
        project.objectionText = DEFAULT_OBJECTION_TEXT;
        await store.saveProject(project);
        renderProjectSettings(id);
      } }, 'Standardtext wiederherstellen'))),
    h('div', { class: 'card banner danger' },
      h('p', {}, 'Projekt mit allen Besprechungen, Punkten und Bildern löschen. Vorher sichern!'),
      h('button', { class: 'danger', onclick: async () => {
        const r = await ask({
          title: 'Projekt endgültig löschen?',
          text: `Zur Bestätigung den Namen eingeben: ${project.name}`,
          fields: [{ name: 'name', label: 'Name' }],
          ok: 'Endgültig löschen',
          danger: true,
        });
        if (r?.name !== project.name) return r && toast('Name stimmt nicht überein.');
        await store.deleteProject(id);
        location.hash = '#/';
      } }, icon('trash'), 'Projekt löschen')),
  );
}

// ---------- Sicherung ----------

async function renderBackup() {
  setTitle('Sicherung', '#/');
  const age = await backupAgeDays();
  const est = await navigator.storage?.estimate?.();
  const persisted = await navigator.storage?.persisted?.();
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  setRail([{ icon: 'back', label: 'Zurück', href: '#/', wide: true }]);
  const prefs = getPrefs();
  const prefSelect = (key, label, options) => labeled(label, (() => {
    const s = h('select', { onchange: (e) => setPrefs({ [key]: e.target.value }) }, options.map(([v, l]) => h('option', { value: v }, l)));
    s.value = prefs[key];
    return s;
  })());
  mount(app,
    h('div', { class: 'card' },
      h('h3', {}, 'Bedienung'),
      h('p', { class: 'muted small' }, 'Die Daumenleiste mit allen Aktionen steht am Rand der Hand, mit der du das iPad hältst. Gilt nur für dieses Gerät.'),
      h('div', { class: 'grid' },
        h('div', {}, prefSelect('hand', 'Daumenleiste', [['rechts', 'rechts (rechte Hand)'], ['links', 'links (linke Hand)']])),
        h('div', {}, prefSelect('rail', 'Position der Knöpfe', [['mitte', 'Mitte des Randes'], ['unten', 'unten am Rand']])))),
    h('div', { class: 'card' },
      h('h3', {}, 'Daten sichern'),
      h('p', {}, 'Alle Projekte, Protokolle und Bilder liegen nur auf diesem Gerät. Die Sicherung ist eine einzelne Datei – speichere sie z. B. in OneDrive oder „Dateien“.'),
      h('p', { class: 'muted small' }, age === Infinity ? 'Noch nie gesichert.' : `Letzte Sicherung vor ${Math.floor(age)} Tag(en).`),
      h('button', { class: 'primary', onclick: async (e) => {
        e.target.disabled = true;
        try {
          const blob = await exportAll();
          const how = await offerShare(blob, `baustellen-protokoll-sicherung-${isoDate()}.bpsicherung`, 'Sicherung Baustellen-Protokoll');
          if (how === 'shared' || how === 'downloaded') {
            await markBackupDone();
            toast(how === 'shared' ? 'Sicherung weitergegeben. Bitte prüfen, dass sie in „Dateien“ oder OneDrive angekommen ist.' : 'Sicherung heruntergeladen – bitte in „Dateien“ prüfen.', 6000);
          } else if (how === 'aborted') {
            toast('Abgebrochen – es wurde NICHTS gesichert.', 6000);
          } else {
            toast('Teilen nicht möglich – es wurde nichts gesichert.', 6000);
          }
          renderBackup();
        } finally {
          e.target.disabled = false;
        }
      } }, icon('download'), 'Sicherung erstellen')),
    h('div', { class: 'card' },
      h('h3', {}, 'Wiederherstellen'),
      h('p', {}, 'Ersetzt ALLE Daten auf diesem Gerät durch den Stand der Sicherungsdatei.'),
      h('button', { class: 'danger', onclick: async () => {
        const [file] = await pickFile({ accept: '.bpsicherung,.json,application/json,application/octet-stream' });
        if (!file) return;
        if (!(await confirmAsk('Alle Daten ersetzen?', `Datei: ${file.name}`, 'Ersetzen', true))) return;
        try {
          const r = await importAll(file);
          toast(`Wiederhergestellt: ${r.projects} Projekt(e), ${r.meetings} Sitzung(en).`);
          location.hash = '#/';
        } catch (err) {
          toast(err.message, 5000);
        }
      } }, icon('upload'), 'Sicherung einspielen')),
    h('div', { class: 'card' },
      h('h3', {}, 'Version'),
      h('p', { class: 'small' }, `App-Version: ${await appVersion()}`)),
    h('div', { class: 'card' },
      h('h3', {}, 'Speicher'),
      h('p', { class: 'small' }, est ? `Belegt: ${mb(est.usage)} von ca. ${mb(est.quota)}` : 'Keine Angabe möglich.'),
      h('p', { class: 'small' }, persisted ? 'Dauerhafter Speicher ist aktiv.' : 'Dauerhafter Speicher nicht bestätigt – regelmäßig sichern.')),
  );
}

// ---------- Start ----------

// ---------- Updates: neue Version erst nach Tipp auf „Neu starten“ ----------
let reloading = false;
function showUpdate(reg) {
  if (document.getElementById('update-bar')) return;
  const bar = h('div', { id: 'update-bar', class: 'update-bar', role: 'status' },
    h('span', {}, 'Neue Version verfügbar.'),
    h('button', { type: 'button', class: 'primary', onclick: async () => {
      await flushPending();
      reloading = true;
      reg.waiting?.postMessage('skipWaiting');
    } }, 'Neu starten'),
    h('button', { type: 'button', class: 'ghost', 'aria-label': 'Später', onclick: () => bar.remove() }, 'Später'));
  document.body.append(bar);
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg);
      });
    });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
  }).catch((e) => console.warn('Service Worker:', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => reloading && location.reload());
}

export async function appVersion() {
  const keys = (await caches?.keys?.()) ?? [];
  return keys.find((k) => k.startsWith('bp-'))?.slice(3) ?? 'unbekannt';
}
navigator.storage?.persist?.().catch(() => {});
applyPrefs();
route();
