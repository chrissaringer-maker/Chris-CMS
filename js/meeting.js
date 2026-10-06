// Ansicht einer Besprechung/Begehung: Kopf, Teilnehmer, Punkte (Diktat), Fotos/Skizzen, Abschluss und Versand.
import { h, icon, mount, add, labeled, setRail, setTitle, toast, ask, confirmAsk, choose, offerShare, copyText, blobUrl, markSaved, pickFile, viewImage } from './ui.js';
import * as store from './store.js';
import {
  uid, meetingTitle, formatDate, isLocked, versionLabel, finalizeMeeting, reopenMeeting, addItem, itemsForMeeting,
  canEditBase, canDelete, canRenumber, changeLg, lgFromCompany, normalizeLg, projectLgs, lgLabel, LG_GENERAL,
  carryOver, laterMeeting, seriesOf, ATTENDANCE, ATTENDANCE_CYCLE, attendanceOf,
  defaultStatus, isOverdue, buildProtocol, companyDigests, mailtoUrl, distribution, fileSafe,
  ITEM_TYPES, STATUS, isoDate,
} from './model.js';
import { importPhoto, toPdfImage } from './images.js';
import { openSketch, BLANK_SIZE } from './sketch.js';
import { buildPdf } from './pdf.js';
import { dictationAvailable, startDictation } from './dictation.js';

// Aktueller Punkt bleibt über ein Neuzeichnen der Ansicht hinweg erhalten.
let remembered = { meetingId: null, itemId: null };
let dictation = null; // laufendes Diktat { stop, itemId }
let keyboardFallback = false; // true, wenn Safari die Spracherkennung dauerhaft verweigert
let renderGen = 0; // jede Ansicht bekommt eine Nummer; ältere Rückrufe (Diktat-Ende) werden verworfen

// Beim Verlassen der Besprechung: alle noch laufenden Rückrufe dieser Ansicht ungültig machen.
export function leaveMeeting() {
  renderGen++;
  stopDictation();
}

// Beendet ein laufendes Diktat sofort (App im Hintergrund, Kamera, Skizze, anderer Punkt).
export function stopDictation() {
  const d = dictation;
  dictation = null;
  d?.stop();
}

// ---------- verzögertes Speichern (Tippen/Diktieren soll nicht bei jedem Zeichen schreiben) ----------
const pending = new Map();
let timer;
function schedule(key, fn) {
  pending.set(key, fn);
  clearTimeout(timer);
  timer = setTimeout(flushPending, 600);
}
export async function flushPending() {
  clearTimeout(timer);
  const jobs = [...pending.entries()];
  pending.clear();
  let failed = 0;
  for (const [key, fn] of jobs) {
    try {
      await fn();
    } catch (e) {
      console.error(e);
      failed++;
      // nicht verwerfen: beim nächsten Versuch erneut speichern (neuere Änderungen haben Vorrang)
      if (!pending.has(key)) pending.set(key, fn);
    }
  }
  if (failed) {
    toast(`Speichern fehlgeschlagen (${failed}) – wird erneut versucht. Nicht schließen!`, 6000);
    clearTimeout(timer);
    timer = setTimeout(flushPending, 3000);
  } else if (jobs.length) markSaved();
}

const select = (options, value, onchange, disabled = false) => {
  const s = h('select', { disabled, onchange: (e) => onchange(e.target.value) }, options.map(([v, l]) => h('option', { value: v }, l)));
  s.value = value ?? '';
  return s;
};

export async function renderMeeting(app, id) {
  const found = await store.getMeeting(id);
  if (!found) throw new Error('Sitzung nicht gefunden.');
  stopDictation();
  const gen = ++renderGen;
  const bundle = await store.loadBundle(found.projectId);
  const { project } = bundle;
  const meeting = bundle.meetings.find((m) => m.id === id);
  // Fortschreibung abgleichen: Punkte, die in früheren Sitzungen nachträglich ergänzt wurden und offen sind
  if (!isLocked(meeting) && seriesOf(bundle.meetings, project.id, meeting.type).at(-1)?.id === meeting.id) {
    const synced = carryOver({ meetings: bundle.meetings, items: bundle.items, meeting });
    if (synced.length) {
      await store.saveItems(...synced);
      const byId = new Map(synced.map((i) => [i.id, i]));
      bundle.items = bundle.items.map((i) => byId.get(i.id) ?? i);
      setTimeout(() => toast(`${synced.length} offene(r) Punkt(e) aus früheren Sitzungen übernommen.`, 5000), 300);
    }
  }
  const itemsById = new Map(bundle.items.map((i) => [i.id, i]));
  const attById = new Map(bundle.attachments.map((a) => [a.id, a]));
  const locked = isLocked(meeting);
  const today = isoDate();
  const cards = new Map(); // itemId → Karte und Zugriffe für die Daumenleiste
  let currentId = null;
  const stale = () => gen !== renderGen;

  setTitle(`${meetingTitle(meeting)} · ${formatDate(meeting.date)}`, `#/p/${project.id}`);

  const rerender = async () => {
    await flushPending();
    const y = window.scrollY;
    await renderMeeting(app, id);
    window.scrollTo(0, y);
  };
  const saveMeetingSoon = () => schedule('meeting', () => store.saveMeeting(meeting));
  const saveItemSoon = (item) => schedule(item.id, () => store.saveItem(itemsById.get(item.id)));
  const companyOptions = [['', '– zuständig –'], ...project.companies.map((c) => [c.id, c.name])];

  // ---------- Kopf ----------
  const field = (key, label, type = 'text') => h('div', {},
    labeled(label, h('input', { type, value: meeting[key] ?? '', disabled: locked, oninput: (e) => { meeting[key] = e.target.value; saveMeetingSoon(); } })));

  const head = h('div', { class: 'card' },
    h('div', { class: 'inline' },
      h('span', { class: `chip ${locked ? 'final' : ''}` }, versionLabel(meeting)),
      locked ? h('span', { class: 'muted small' }, 'Abgeschlossen. Änderungen nur über „Neue Fassung“.') : null),
    h('div', { class: 'grid' },
      field('date', 'Datum', 'date'), field('time', 'Uhrzeit', 'time'), field('location', 'Ort'), field('nextDate', 'Nächster Termin', 'date')));

  // ---------- Teilnehmer ----------
  const addParticipant = async () => {
    if (!project.companies.length) return toast('Zuerst unter „Firmen“ Firmen anlegen.');
    const cid = await choose('Firma wählen', project.companies.map((c) => [c.id, c.name]));
    if (!cid) return;
    const company = project.companies.find((c) => c.id === cid);
    let name = '';
    if (company.contacts.length) {
      const kid = await choose(`Person (${company.name})`, [...company.contacts.map((k) => [k.id, k.name || k.email]), ['__other', 'Andere Person …']]);
      if (!kid) return;
      if (kid !== '__other') name = company.contacts.find((k) => k.id === kid).name;
    }
    if (!name) {
      const r = await ask({ title: `Teilnehmer (${company.name})`, fields: [{ name: 'name', label: 'Name' }], ok: 'Hinzufügen' });
      if (!r) return;
      name = r.name;
    }
    meeting.participants.push({ companyId: cid, name, attendance: '' });
    await store.saveMeeting(meeting);
    rerender();
  };
  const addAllCompanies = async () => {
    for (const c of project.companies) {
      if (meeting.participants.some((p) => p.companyId === c.id)) continue;
      meeting.participants.push({ companyId: c.id, name: c.contacts[0]?.name ?? '', attendance: '' });
    }
    await store.saveMeeting(meeting);
    rerender();
  };
  // Anwesenheit: Tipp auf die Zeile schaltet weiter (offen → anwesend → entschuldigt → nicht erschienen)
  const countPresent = () => meeting.participants.filter((p) => attendanceOf(p) === 'anwesend').length;
  const partHead = h('h3', {});
  const refreshPartHead = () => {
    const open = meeting.participants.filter((p) => !attendanceOf(p)).length;
    partHead.textContent = `Teilnehmer (${countPresent()} anwesend${open ? `, ${open} offen` : ''})`;
  };
  refreshPartHead();
  const attendanceButton = (p) => {
    const b = h('button', { type: 'button', class: 'attend', disabled: locked });
    const show = () => {
      const a = attendanceOf(p);
      b.textContent = ATTENDANCE[a];
      b.dataset.state = a || 'offen';
      b.setAttribute('aria-label', `Anwesenheit: ${ATTENDANCE[a]} – tippen zum Ändern`);
    };
    b.addEventListener('click', () => {
      const next = ATTENDANCE_CYCLE[(ATTENDANCE_CYCLE.indexOf(attendanceOf(p)) + 1) % ATTENDANCE_CYCLE.length];
      p.attendance = next;
      delete p.present;
      show();
      refreshPartHead();
      saveMeetingSoon();
    });
    show();
    return b;
  };
  const participants = h('div', { class: 'card' },
    partHead,
    meeting.participants.length ? null : h('p', { class: 'muted small' }, 'Noch keine Teilnehmer.'),
    meeting.participants.map((p, idx) => h('div', { class: 'row', style: 'margin:6px 0' },
      h('div', { class: 'grow' },
        h('strong', {}, bundle.project.companies.find((c) => c.id === p.companyId)?.name ?? '–'),
        h('div', { class: 'sub' }, p.name || 'ohne Namen')),
      attendanceButton(p),
      locked ? null : h('button', { class: 'ghost', 'aria-label': 'Teilnehmer entfernen', onclick: async () => {
        if (!(await confirmAsk('Teilnehmer entfernen?', p.name || '', 'Entfernen', true))) return;
        meeting.participants.splice(idx, 1);
        await store.saveMeeting(meeting);
        rerender();
      } }, icon('close')))),
    locked ? null : h('div', { class: 'actions' },
      h('button', { onclick: addParticipant }, icon('plus'), 'Teilnehmer'),
      h('button', { onclick: addAllCompanies }, icon('users'), 'Alle Firmen hinzufügen')));

  const general = h('div', { class: 'card' },
    h('h3', {}, 'Allgemeines'),
    h('textarea', { class: 'dictate', value: meeting.generalNotes, disabled: locked, placeholder: 'Allgemeine Hinweise (optional)',
      oninput: (e) => { meeting.generalNotes = e.target.value; saveMeetingSoon(); } }));

  // ---------- Anhänge ----------
  const listFor = (target) => (target.entry ? target.entry.attachmentIds : meeting.attachmentIds);
  const saveTarget = (target) => (target.entry ? store.saveItem(itemsById.get(target.item.id)) : store.saveMeeting(meeting));

  async function addPhotos(target, capture) {
    stopDictation();
    const files = await pickFile({ capture, multiple: !capture });
    if (!files.length) return;
    toast('Foto wird verarbeitet …');
    for (const f of files) {
      const img = await importPhoto(f);
      const att = {
        id: uid(), projectId: project.id, kind: 'photo', caption: '', original: img.blob, rendered: null, thumb: img.thumb,
        strokes: [], grid: false, width: img.width, height: img.height, createdAt: new Date().toISOString(),
      };
      await store.saveAttachment(att);
      listFor(target).push(att.id);
    }
    await saveTarget(target);
    rerender();
  }

  async function addSketch(target) {
    stopDictation();
    const res = await openSketch({ ...BLANK_SIZE, title: 'Skizze' });
    if (!res) return;
    const att = {
      id: uid(), projectId: project.id, kind: 'sketch', caption: '', original: null, rendered: res.rendered, thumb: res.thumb,
      strokes: res.strokes, grid: res.grid, ...BLANK_SIZE, createdAt: new Date().toISOString(),
    };
    await store.saveAttachment(att);
    listFor(target).push(att.id);
    await saveTarget(target);
    rerender();
  }

  async function attachmentMenu(att, target) {
    const image = att.rendered ?? att.original;
    if (locked) return viewImage(image, att.caption);
    const action = await choose(att.caption || (att.kind === 'sketch' ? 'Skizze' : 'Foto'), [
      ['view', 'Ansehen'],
      ['draw', att.kind === 'sketch' ? 'Skizze bearbeiten' : 'Einzeichnen'],
      ['caption', 'Beschriftung'],
      ['delete', 'Löschen', { danger: true }],
    ]);
    if (action === 'view') viewImage(image, att.caption);
    if (action === 'draw') {
      const res = await openSketch({ background: att.original, width: att.width, height: att.height, strokes: att.strokes, grid: att.grid });
      if (!res) return;
      Object.assign(att, { rendered: res.strokes.length || att.kind === 'sketch' ? res.rendered : null, thumb: res.thumb, strokes: res.strokes, grid: res.grid });
      await store.saveAttachment(att);
      rerender();
    }
    if (action === 'caption') {
      const r = await ask({ title: 'Beschriftung', fields: [{ name: 'caption', label: 'Text unter dem Bild im PDF', value: att.caption }], ok: 'Speichern' });
      if (!r) return;
      att.caption = r.caption;
      await store.saveAttachment(att);
      rerender();
    }
    if (action === 'delete') {
      if (!(await confirmAsk('Bild löschen?', '', 'Löschen', true))) return;
      const list = listFor(target);
      list.splice(list.indexOf(att.id), 1);
      await saveTarget(target);
      await store.deleteAttachment(att.id);
      rerender();
    }
  }

  const thumbs = (target) => h('div', { class: 'thumbs' }, listFor(target).map((aid) => {
    const att = attById.get(aid);
    if (!att) return null;
    return h('button', { type: 'button', class: 'thumb', onclick: () => attachmentMenu(att, target) },
      h('img', { src: blobUrl(att.thumb ?? att.rendered ?? att.original), alt: att.caption || att.kind }),
      h('span', { class: 'tag' }, att.kind === 'sketch' ? 'Skizze' : att.strokes?.length ? 'Foto · markiert' : 'Foto'));
  }));

  const mediaButtons = (target) => locked ? null : h('div', { class: 'actions' },
    h('button', { onclick: () => addPhotos(target, true) }, icon('camera'), 'Foto'),
    h('button', { onclick: () => addPhotos(target, false) }, icon('image'), 'Mediathek'),
    h('button', { onclick: () => addSketch(target) }, icon('pen'), 'Skizze'));

  // ---------- Punkte ----------
  function itemCard(item, entry) {
    const isOwn = item.createdMeetingId === meeting.id;
    const target = { item, entry };
    const card = h('div', { class: `card item ${entry.status}`, id: `i-${item.id}` });
    const chips = h('span', { class: 'inline' });
    const refreshChips = () => {
      mount(chips,
        isOverdue(entry, meeting.date) ? h('span', { class: 'chip overdue' }, 'überfällig') : null,
        entry.unclear ? h('span', { class: 'chip unclear' }, 'unklar') : null);
      card.className = `card item ${entry.status}${currentId === item.id ? ' current' : ''}`;
    };
    // Antippen irgendwo in der Karte macht sie zum aktuellen Punkt (Ziel der Daumenleiste)
    card.addEventListener('click', () => setCurrent(item.id));
    card.addEventListener('focusin', () => setCurrent(item.id));

    const statusSel = select(Object.entries(STATUS), entry.status, (v) => {
      entry.status = v;
      refreshChips();
      saveItemSoon(item);
    }, locked);
    const typeEl = canEditBase(item, meeting)
      ? select(Object.entries(ITEM_TYPES), item.type, (v) => {
        const wasDefault = entry.status === defaultStatus(item.type);
        item.type = v;
        if (wasDefault) {
          entry.status = defaultStatus(v);
          statusSel.value = entry.status;
          refreshChips();
        }
        saveItemSoon(item);
      })
      : h('span', { class: 'chip' }, ITEM_TYPES[item.type]);
    if (typeEl.tagName === 'SELECT') {
      typeEl.style.width = 'auto';
      typeEl.setAttribute('aria-label', 'Art');
    }
    statusSel.style.width = 'auto';
    statusSel.setAttribute('aria-label', 'Status');

    // Leistungsgruppe bestimmt die Nummer (39.001 …); änderbar, solange der Punkt nicht fortgeschrieben ist
    const noEl = h('span', { class: 'item-no' }, item.no);
    const allItems = () => [...itemsById.values()];
    let lgSel = null;
    const applyLg = (fn) => {
      try {
        Object.assign(item, fn());
      } catch (e) {
        toast(e.message, 5000);
      }
      noEl.textContent = item.no;
      if (lgSel) lgSel.value = item.lg;
      saveItemSoon(item);
    };
    let lgEl;
    if (canRenumber(item, meeting)) {
      const opts = projectLgs(project).map(({ lg, label }) => [lg, `LG ${lg} · ${label}`]);
      if (!opts.some(([lg]) => lg === item.lg)) opts.push([item.lg, `LG ${item.lg}`]);
      lgSel = select([...opts, ['__other', 'Andere LG …']], item.lg ?? LG_GENERAL, async (v) => {
        let lg = v;
        if (v === '__other') {
          const r = await ask({ title: 'Leistungsgruppe', fields: [{ name: 'lg', label: 'Nummer der Leistungsgruppe (z. B. 39)', inputmode: 'numeric' }], ok: 'Übernehmen' });
          lg = normalizeLg(r?.lg);
          if (!lg) {
            lgSel.value = item.lg;
            if (r) toast('Bitte eine ein- oder zweistellige Zahl eingeben.');
            return;
          }
          if (![...lgSel.options].some((o) => o.value === lg)) lgSel.insertBefore(h('option', { value: lg }, `LG ${lg}`), lgSel.lastChild);
        }
        applyLg(() => changeLg(item, allItems(), meeting, lg, true));
      });
      lgSel.style.width = 'auto';
      lgSel.setAttribute('aria-label', 'Leistungsgruppe');
      lgEl = lgSel;
    } else {
      lgEl = h('span', { class: 'muted small' }, lgLabel(project, item.lg ?? LG_GENERAL));
    }

    const textBlock = [];
    let dictateField = null;
    if (isOwn) {
      if (locked) textBlock.push(h('div', { class: 'basetext' }, item.text || '(ohne Text)'));
      else {
        dictateField = h('textarea', { class: 'dictate', value: item.text, placeholder: 'Festgehalten: … – Diktat über die Daumenleiste oder die Mikrofon-Taste der Tastatur',
          oninput: (e) => { item.text = e.target.value; saveItemSoon(item); } });
        textBlock.push(dictateField);
      }
    } else {
      const meetingDate = new Map(bundle.meetings.map((m) => [m.id, m.date]));
      const idx = item.log.indexOf(entry);
      const history = item.log.slice(0, idx).filter((e) => e.note.trim());
      textBlock.push(h('div', { class: 'basetext' }, item.text || '(ohne Text)'));
      if (history.length) textBlock.push(h('ul', { class: 'history' }, history.map((e) => h('li', {}, `${formatDate(meetingDate.get(e.meetingId))}: ${e.note}`))));
      const noteField = h('textarea', { class: 'dictate', value: entry.note, disabled: locked, placeholder: 'Fortschreibung: neuer Stand, Termin, Ergebnis …',
        oninput: (e) => { entry.note = e.target.value; saveItemSoon(item); } });
      if (!locked) dictateField = noteField;
      textBlock.push(labeled(`Stand ${formatDate(meeting.date)}`, noteField));
    }

    add(card, 
      h('div', { class: 'item-head' },
        noEl, lgEl, typeEl, statusSel, chips,
        h('label', { class: 'inline', style: 'margin:0 0 0 auto' },
          h('input', { type: 'checkbox', checked: entry.unclear, disabled: locked, onchange: (e) => { entry.unclear = e.target.checked; refreshChips(); saveItemSoon(item); } }),
          'unklar')),
      textBlock,
      h('div', { class: 'grid' },
        h('div', {}, labeled('Zuständig', select(companyOptions, entry.companyId, (v) => {
          entry.companyId = v;
          if (lgSel) applyLg(() => lgFromCompany(item, allItems(), meeting, project.companies.find((c) => c.id === v)));
          else saveItemSoon(item);
        }, locked))),
        h('div', {}, labeled('Frist', h('input', { type: 'date', value: entry.due, disabled: locked,
          onchange: (e) => { entry.due = e.target.value; refreshChips(); saveItemSoon(item); } })))),
      thumbs(target),
      h('div', { class: 'actions' },
        mediaButtons(target),
        canDelete(item, meeting) ? h('button', { class: 'danger', onclick: async () => {
          if (!(await confirmAsk(`Punkt ${item.no} löschen?`, '', 'Löschen', true))) return;
          pending.delete(item.id);
          await store.deleteItem(item);
          rerender();
        } }, icon('trash'), 'Punkt löschen') : null));
    refreshChips();
    cards.set(item.id, {
      card, item, entry, field: dictateField, refresh: refreshChips,
      setStatus(v) {
        entry.status = v;
        statusSel.value = v;
        refreshChips();
        saveItemSoon(item);
      },
    });
    return card;
  }

  // Ansicht: fortgeschriebene Punkte nach Nummer, neue Punkte in Erfassungsreihenfolge (springen beim Umnummerieren nicht).
  // Das PDF ordnet nach Leistungsgruppe und Nummer.
  const sorted = itemsForMeeting(bundle.items, meeting.id);
  const rows = [
    ...sorted.filter((r) => r.item.createdMeetingId !== meeting.id),
    ...sorted.filter((r) => r.item.createdMeetingId === meeting.id).sort((a, b) => a.item.createdAt.localeCompare(b.item.createdAt)),
  ];
  const emptyHint = h('p', { class: 'muted' }, 'Noch keine Punkte. In der Daumenleiste auf „Punkt“ tippen, dann „Diktat“.');
  const itemList = h('div', {}, rows.length ? rows.map(({ item, entry }) => itemCard(item, entry)) : emptyHint);
  const carried = rows.filter((r) => r.item.createdMeetingId !== meeting.id).length;
  const pointsHeading = h('h2', {});
  const updateCount = () => {
    pointsHeading.textContent = `Punkte (${cards.size}${carried ? `, davon ${carried} fortgeschrieben` : ''})`;
  };
  updateCount();

  function setCurrent(id, { scroll = false } = {}) {
    if (dictation && dictation.itemId !== id) stopDictation();
    const prev = cards.get(currentId);
    currentId = cards.has(id) ? id : null;
    remembered = { meetingId: meeting.id, itemId: currentId };
    prev?.refresh();
    const now = cards.get(currentId);
    now?.refresh();
    if (scroll && now) now.card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    updateRail();
  }

  // Neuer Punkt; bei Tastatur-Diktat wird das Feld sofort fokussiert (öffnet die Tastatur)
  function newItem({ focus = false } = {}) {
    const item = addItem({ meeting, items: bundle.items, type: 'aufgabe' });
    bundle.items.push(item);
    itemsById.set(item.id, item);
    emptyHint.remove();
    itemList.append(itemCard(item, item.log[0]));
    updateCount();
    setCurrent(item.id, { scroll: true });
    if (focus) cards.get(item.id).field?.focus();
    store.saveItem(item).then(markSaved, (e) => toast(`Speichern fehlgeschlagen: ${e.message}`, 6000));
    return item;
  }

  function toggleDictation() {
    if (dictation) return stopDictation();
    let target = cards.get(currentId);
    if (!target?.field) target = cards.get(newItem({ focus: !dictationAvailable() || keyboardFallback }).id);
    const field = target.field;
    if (!dictationAvailable() || keyboardFallback) {
      field.focus();
      toast('Bitte die Mikrofon-Taste der Tastatur verwenden. Tipp: Tastatur mit zwei Fingern zusammenschieben und nach rechts ziehen.', 6000);
      return;
    }
    const base = field.value;
    const sep = base && !/\s$/.test(base) ? ' ' : '';
    const write = (t) => {
      if (stale() || !field.isConnected) return; // Ansicht inzwischen gewechselt: nichts mehr schreiben
      field.value = t ? `${base}${sep}${t}` : base;
      field.dispatchEvent(new Event('input'));
    };
    dictation = {
      itemId: target.item.id,
      ...startDictation({
        lang: navigator.language?.startsWith('de') ? navigator.language : 'de-AT',
        onText: write,
        onEnd: (t) => {
          write(t);
          if (stale()) return;
          dictation = null;
          flushPending();
          updateRail();
        },
        onError: (msg, code) => {
          if (stale()) return;
          toast(msg, 7000);
          if (code === 'service-not-allowed') keyboardFallback = true;
        },
      }),
    };
    target.card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    updateRail();
  }

  function step(dir) {
    const ids = [...itemList.querySelectorAll('.item')].map((el) => el.id.slice(2));
    if (!ids.length) return toast('Noch keine Punkte.');
    const i = ids.indexOf(currentId);
    const next = i < 0 ? (dir > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, i + dir));
    setCurrent(ids[next], { scroll: true });
  }

  function toggleDone() {
    const c = cards.get(currentId);
    if (!c) return toast('Zuerst einen Punkt antippen.');
    c.setStatus(c.entry.status === 'erledigt' ? defaultStatus(c.item.type) : 'erledigt');
    updateRail();
  }

  const targetOfCurrent = () => {
    const c = cards.get(currentId);
    return c ? { item: c.item, entry: c.entry } : { entry: null };
  };

  // Daumenleiste (zeilenweise, Wichtigstes unten):  Mehr | ▲  ·  Erledigt | ▼  ·  Foto | + Punkt  ·  [ Diktat → Nr. ]
  function updateRail() {
    if (stale()) return;
    const c = cards.get(currentId);
    const ids = [...itemList.querySelectorAll('.item')].map((el) => el.id.slice(2));
    const pos = c ? `${ids.indexOf(currentId) + 1}/${ids.length}` : `${ids.length}`;
    const more = { icon: 'more', label: 'Mehr', onclick: moreMenu };
    const up = { icon: 'up', label: 'Vorher', aria: 'Vorheriger Punkt', onclick: () => step(-1) };
    const down = { icon: 'down', label: `Weiter ${pos}`, aria: 'Nächster Punkt', onclick: () => step(1) };
    if (locked) {
      setRail([more, up, { icon: 'check', label: c ? c.item.no : '–', disabled: true }, down,
        { icon: 'share', label: `PDF teilen (${versionLabel(meeting)})`, primary: true, wide: true, onclick: () => makePdf(false).catch((e) => toast(e.message, 6000)) }]);
      return;
    }
    const keyboard = !dictationAvailable() || keyboardFallback;
    const target = c?.field ? c.item.no : 'neu';
    setRail([
      more, up,
      { icon: 'check', label: c?.entry.status === 'erledigt' ? 'Wieder offen' : 'Erledigt', disabled: !c, onclick: toggleDone }, down,
      { icon: 'camera', label: 'Foto', onclick: () => addPhotos(targetOfCurrent(), true) },
      { icon: 'plus', label: 'Punkt', aria: 'Neuer Punkt', onclick: () => newItem({ focus: keyboard }) },
      {
        icon: dictation ? 'stop' : 'mic', wide: true, id: 'rail-dictate', onclick: toggleDictation,
        label: dictation ? `Stopp → ${target}` : `${keyboard ? 'Tastatur-Diktat' : 'Diktat'} → ${target}`,
        aria: dictation ? 'Stopp' : 'Diktat', primary: !dictation, danger: !!dictation, active: !!dictation,
      },
    ]);
  }

  async function moreMenu() {
    // Häufiges unten (am Daumen), Seltenes oben
    const options = locked
      ? [['back', 'Zurück zum Projekt'], ['reopen', 'Neue Fassung anlegen'], ['top', 'Nach oben (Kopf, Teilnehmer)'], ['mails', 'Mails „Ihre offenen Punkte“'], ['copy', 'Verteiler kopieren'], ['share', `PDF teilen (${versionLabel(meeting)})`]]
      : [['back', 'Zurück zum Projekt'], ['top', 'Nach oben (Kopf, Teilnehmer)'], ['final', 'Endfassung abschließen'], ['draft', 'Vorabzug-PDF'],
        ['copy', 'Verteiler kopieren'], ['mails', 'Mails „Ihre offenen Punkte“'], ['library', 'Foto aus Mediathek'], ['sketch', 'Skizze']];
    const a = await choose('Weitere Aktionen', options);
    try {
      if (a === 'back') location.hash = `#/p/${project.id}`;
      if (a === 'sketch') await addSketch(targetOfCurrent());
      if (a === 'share') await makePdf(false);
      if (a === 'draft') await makePdf(true);
      if (a === 'final') await finalize();
      if (a === 'reopen') await reopen();
      if (a === 'library') await addPhotos(targetOfCurrent(), false);
      if (a === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
      if (a === 'copy') {
        const ok = await copyText(dist.map((d) => d.email).join('; '));
        toast(ok ? `${dist.length} Adresse(n) kopiert.` : 'Kopieren nicht möglich.');
      }
      if (a === 'mails') {
        if (!digests.length) return toast('Keine offenen Punkte mit zuständiger Firma.');
        const id = await choose('Mail an Firma', digests.map((d) => [d.companyId, `${d.company} (${d.count}${d.overdue ? `, ${d.overdue} überfällig` : ''})`]));
        const d = digests.find((x) => x.companyId === id);
        if (d && !d.recipients.length) toast(`Für ${d.company} ist keine E-Mail hinterlegt.`);
        else if (d) window.location.href = mailtoUrl(d.recipients, d.subject, d.body);
      }
    } catch (e) {
      toast(e.message, 6000);
    }
  }

  // ---------- Abschluss & Versand ----------
  async function makePdf(draft) {
    await flushPending();
    const protocol = draft
      ? buildProtocol({ project, meeting, meetings: bundle.meetings, items: [...itemsById.values()], attachments: bundle.attachments })
      : meeting.finals.at(-1).protocol;
    const images = new Map();
    for (const f of protocol.figures) {
      const a = attById.get(f.id);
      const blob = a && (a.rendered ?? a.original);
      if (blob) images.set(f.id, await toPdfImage(blob));
    }
    const blob = await buildPdf(protocol, { draft, images });
    if (blob.size > 20 * 1048576) toast(`Achtung: Das PDF ist ${(blob.size / 1048576).toFixed(0)} MB groß – für E-Mail eventuell zu groß. Weniger Fotos anhängen oder als Link versenden.`, 8000);
    const name = `${fileSafe(`${project.name}_${protocol.title}_${meeting.date}_${draft ? 'Vorabzug' : protocol.version}`)}.pdf`;
    const how = await offerShare(blob, name, `${protocol.title} vom ${protocol.date}`);
    if (how === 'downloaded') toast('PDF wurde heruntergeladen.');
    if (how === 'failed') toast('Teilen war nicht möglich. Bitte erneut versuchen.', 6000);
  }

  const busy = (fn) => async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      await fn();
    } catch (err) {
      console.error(err);
      toast(err.message, 6000);
    } finally {
      b.disabled = false;
    }
  };

  const finalize = async () => {
    stopDictation();
    await flushPending();
    // Ohne Verfasser hätte die Einwendungsklausel keinen Adressaten
    if (!project.author?.trim()) {
      const r = await ask({
        title: 'Verfasser fehlt',
        text: 'An den Verfasser richten die Firmen ihre Einwendungen. Er steht im Protokollkopf.',
        fields: [{ name: 'author', label: 'Verfasser (Name, Firma/Funktion)', placeholder: 'z. B. Ch. Saringer, ÖBA' }],
        ok: 'Übernehmen',
      });
      if (!r?.author) return toast('Ohne Verfasser kein Abschluss.');
      project.author = r.author;
      await store.saveProject(project);
    }
    const all = [...itemsById.values()];
    const open = itemsForMeeting(all, meeting.id);
    const unclear = open.filter((r) => r.entry.unclear).length;
    const empty = open.filter((r) => r.item.createdMeetingId === meeting.id && !r.item.text.trim()).length;
    const noAttendance = meeting.participants.filter((p) => !attendanceOf(p)).length;
    const warn = [
      noAttendance ? `Bei ${noAttendance} Teilnehmer(n) ist die Anwesenheit noch offen.` : '',
      unclear ? `${unclear} Punkt(e) sind als „unklar“ markiert.` : '',
      empty ? `${empty} neue(r) Punkt(e) ohne Text.` : '',
      meeting.nextDate ? '' : 'Kein nächster Termin eingetragen.',
    ].filter(Boolean).join(' ');
    if (!(await confirmAsk('Endfassung abschließen?', `${warn} Danach ist die Sitzung gesperrt; Änderungen nur als neue Fassung.`.trim(), 'Abschließen'))) return;
    const protocol = buildProtocol({ project, meeting, meetings: bundle.meetings, items: all, attachments: bundle.attachments });
    const prevFinal = meeting.finals.at(-1);
    protocol.supersedes = prevFinal ? `Fassung ${prevFinal.version} vom ${formatDate(prevFinal.at.slice(0, 10))}` : '';
    Object.assign(meeting, finalizeMeeting(meeting, { ...protocol, version: `Fassung ${meeting.finals.length + 1}` }));
    await store.saveMeeting(meeting);
    toast('Endfassung erstellt. Jetzt PDF teilen und versenden.');
    rerender();
  };

  const reopen = async () => {
    const later = laterMeeting(bundle.meetings, meeting);
    const hint = later
      ? ` Achtung: ${meetingTitle(later)} ist bereits angelegt. Neue offene Punkte werden dort beim Öffnen übernommen; Statusänderungen an bereits übernommenen Punkten musst du in Nr. ${later.number} selbst nachtragen.`
      : '';
    if (!(await confirmAsk('Neue Fassung anlegen?', `Die Sitzung wird wieder bearbeitbar. Beim nächsten Abschluss entsteht „Fassung ${meeting.finals.length + 1}“. Die bisherige Fassung bleibt als PDF erhalten, wenn du sie versendet hast.${hint}`, 'Neue Fassung'))) return;
    Object.assign(meeting, reopenMeeting(meeting));
    await store.saveMeeting(meeting);
    rerender();
  };

  const dist = distribution(project);
  const digests = companyDigests({ project, meeting, items: [...itemsById.values()], refDate: today });

  const finish = h('div', { class: 'card' },
    h('h3', {}, 'Abschluss und Versand'),
    h('ol', { class: 'small muted', style: 'padding-left:18px' },
      h('li', {}, 'Optional: Vorabzug als PDF an die Firmen zur Ergänzung.'),
      h('li', {}, 'Endfassung abschließen.'),
      h('li', {}, '„Verteiler kopieren“, dann „PDF teilen“ → Outlook → Adressen ins Feld „An“ einfügen.'),
      h('li', {}, 'Danach optional die kurzen Mails „Ihre offenen Punkte“ je Firma.')),
    h('div', { class: 'actions' },
      locked ? null : h('button', { onclick: busy(() => makePdf(true)) }, icon('file'), 'Vorabzug-PDF'),
      locked ? null : h('button', { class: 'primary', onclick: busy(finalize) }, icon('lock'), 'Endfassung abschließen'),
      locked ? h('button', { class: 'primary', onclick: busy(() => makePdf(false)) }, icon('share'), `PDF teilen (${versionLabel(meeting)})`) : null,
      locked ? h('button', { onclick: busy(reopen) }, icon('unlock'), 'Neue Fassung anlegen') : null,
      h('button', { disabled: !dist.length, onclick: async () => {
        const ok = await copyText(dist.map((d) => d.email).join('; '));
        toast(ok ? `${dist.length} Adresse(n) kopiert.` : 'Kopieren nicht möglich.');
      } }, icon('copy'), `Verteiler kopieren (${dist.length})`)),
    digests.length
      ? [h('h3', {}, 'Ihre offenen Punkte – je Firma'),
        h('div', { class: 'actions' }, digests.map((d) => h('a', {
          class: 'btn',
          href: d.recipients.length ? mailtoUrl(d.recipients, d.subject, d.body) : null,
          onclick: d.recipients.length ? null : (e) => { e.preventDefault(); toast(`Für ${d.company} ist keine E-Mail hinterlegt.`); },
        }, icon('mail'), `${d.company} (${d.count}${d.overdue ? `, ${d.overdue} überfällig` : ''})`)))]
      : null,
    store.canDeleteMeeting(bundle, meeting)
      ? h('div', { class: 'actions', style: 'margin-top:20px' }, h('button', { class: 'danger', onclick: async () => {
        if (!(await confirmAsk('Sitzung löschen?', 'Alle hier angelegten Punkte und Bilder werden gelöscht; übernommene Punkte bleiben in der Vorsitzung erhalten.', 'Löschen', true))) return;
        pending.clear();
        await store.deleteMeeting(bundle, meeting);
        location.hash = `#/p/${project.id}`;
      } }, icon('trash'), 'Sitzung löschen'))
      : null);

  mount(app, 
    head,
    participants,
    general,
    pointsHeading,
    itemList,
    h('h2', {}, 'Allgemeine Fotos und Skizzen'),
    h('div', { class: 'card' }, thumbs({ entry: null }), mediaButtons({ entry: null })),
    finish,
  );
  // aktueller Punkt: der zuletzt bearbeitete, sonst der erste der Liste
  const keep = remembered.meetingId === meeting.id && cards.has(remembered.itemId) ? remembered.itemId : null;
  setCurrent(keep ?? itemList.querySelector('.item')?.id.slice(2) ?? null);
}
