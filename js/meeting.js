// Ansicht einer Besprechung/Begehung: Kopf, Teilnehmer, Punkte (Diktat), Fotos/Skizzen, Abschluss und Versand.
import { h, mount, add, labeled, setTitle, toast, ask, confirmAsk, choose, shareFile, copyText, blobUrl, markSaved, pickFile, viewImage } from './ui.js';
import * as store from './store.js';
import {
  uid, meetingTitle, formatDate, isLocked, versionLabel, finalizeMeeting, reopenMeeting, addItem, itemsForMeeting,
  canEditBase, canDelete, defaultStatus, isOverdue, buildProtocol, companyDigests, mailtoUrl, distribution, fileSafe,
  ITEM_TYPES, STATUS, isoDate,
} from './model.js';
import { importPhoto, blobToDataUrl } from './images.js';
import { openSketch, BLANK_SIZE } from './sketch.js';
import { buildPdf } from './pdf.js';

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
  const fns = [...pending.values()];
  pending.clear();
  try {
    for (const fn of fns) await fn();
    if (fns.length) markSaved();
  } catch (e) {
    console.error(e);
    toast(`Speichern fehlgeschlagen: ${e.message}`, 6000);
  }
}

const select = (options, value, onchange, disabled = false) => {
  const s = h('select', { disabled, onchange: (e) => onchange(e.target.value) }, options.map(([v, l]) => h('option', { value: v }, l)));
  s.value = value ?? '';
  return s;
};

export async function renderMeeting(app, id) {
  const found = await store.getMeeting(id);
  if (!found) throw new Error('Sitzung nicht gefunden.');
  const bundle = await store.loadBundle(found.projectId);
  const { project } = bundle;
  const meeting = bundle.meetings.find((m) => m.id === id);
  const itemsById = new Map(bundle.items.map((i) => [i.id, i]));
  const attById = new Map(bundle.attachments.map((a) => [a.id, a]));
  const locked = isLocked(meeting);
  const today = isoDate();

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
    meeting.participants.push({ companyId: cid, name, present: true });
    await store.saveMeeting(meeting);
    rerender();
  };
  const addAllCompanies = async () => {
    for (const c of project.companies) {
      if (meeting.participants.some((p) => p.companyId === c.id)) continue;
      meeting.participants.push({ companyId: c.id, name: c.contacts[0]?.name ?? '', present: true });
    }
    await store.saveMeeting(meeting);
    rerender();
  };
  const participants = h('div', { class: 'card' },
    h('h3', {}, `Teilnehmer (${meeting.participants.filter((p) => p.present !== false).length} anwesend)`),
    meeting.participants.length ? null : h('p', { class: 'muted small' }, 'Noch keine Teilnehmer.'),
    meeting.participants.map((p, idx) => h('div', { class: 'row', style: 'margin:6px 0' },
      h('input', { type: 'checkbox', checked: p.present !== false, disabled: locked, 'aria-label': 'anwesend',
        onchange: (e) => { p.present = e.target.checked; saveMeetingSoon(); } }),
      h('div', { class: 'grow' },
        h('strong', {}, bundle.project.companies.find((c) => c.id === p.companyId)?.name ?? '–'),
        h('div', { class: 'sub' }, p.name || 'ohne Namen')),
      locked ? null : h('button', { class: 'ghost', 'aria-label': 'Entfernen', onclick: async () => {
        meeting.participants.splice(idx, 1);
        await store.saveMeeting(meeting);
        rerender();
      } }, '✕'))),
    locked ? null : h('div', { class: 'actions' },
      h('button', { onclick: addParticipant }, '+ Teilnehmer'),
      h('button', { onclick: addAllCompanies }, 'Alle Firmen hinzufügen')));

  const general = h('div', { class: 'card' },
    h('h3', {}, 'Allgemeines'),
    h('textarea', { class: 'dictate', value: meeting.generalNotes, disabled: locked, placeholder: 'Allgemeine Hinweise (optional)',
      oninput: (e) => { meeting.generalNotes = e.target.value; saveMeetingSoon(); } }));

  // ---------- Anhänge ----------
  const listFor = (target) => (target.entry ? target.entry.attachmentIds : meeting.attachmentIds);
  const saveTarget = (target) => (target.entry ? store.saveItem(itemsById.get(target.item.id)) : store.saveMeeting(meeting));

  async function addPhotos(target, capture) {
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
      h('span', { class: 'tag' }, att.kind === 'sketch' ? 'Skizze' : att.strokes?.length ? 'Foto ✎' : 'Foto'));
  }));

  const mediaButtons = (target) => locked ? null : h('div', { class: 'actions' },
    h('button', { onclick: () => addPhotos(target, true) }, '📷 Foto'),
    h('button', { onclick: () => addPhotos(target, false) }, '🖼 Mediathek'),
    h('button', { onclick: () => addSketch(target) }, '✎ Skizze'));

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
      card.className = `card item ${entry.status}`;
    };

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
    if (typeEl.tagName === 'SELECT') typeEl.style.width = 'auto';
    statusSel.style.width = 'auto';

    const textBlock = [];
    if (isOwn) {
      textBlock.push(locked
        ? h('div', { class: 'basetext' }, item.text || '(ohne Text)')
        : h('textarea', { class: 'dictate', value: item.text, placeholder: 'Festgehalten: … (Mikrofon-Taste der Tastatur zum Diktieren)',
          oninput: (e) => { item.text = e.target.value; saveItemSoon(item); } }));
    } else {
      const meetingDate = new Map(bundle.meetings.map((m) => [m.id, m.date]));
      const idx = item.log.indexOf(entry);
      const history = item.log.slice(0, idx).filter((e) => e.note.trim());
      textBlock.push(h('div', { class: 'basetext' }, item.text || '(ohne Text)'));
      if (history.length) textBlock.push(h('ul', { class: 'history' }, history.map((e) => h('li', {}, `${formatDate(meetingDate.get(e.meetingId))}: ${e.note}`))));
      textBlock.push(labeled(`Stand ${formatDate(meeting.date)}`, h('textarea', { class: 'dictate', value: entry.note, disabled: locked, placeholder: 'Fortschreibung: neuer Stand, Termin, Ergebnis …',
        oninput: (e) => { entry.note = e.target.value; saveItemSoon(item); } })));
    }

    add(card, 
      h('div', { class: 'item-head' },
        h('span', { class: 'item-no' }, item.no), typeEl, statusSel, chips,
        h('label', { class: 'inline', style: 'margin:0 0 0 auto' },
          h('input', { type: 'checkbox', checked: entry.unclear, disabled: locked, onchange: (e) => { entry.unclear = e.target.checked; refreshChips(); saveItemSoon(item); } }),
          'unklar')),
      textBlock,
      h('div', { class: 'grid' },
        h('div', {}, labeled('Zuständig', select(companyOptions, entry.companyId, (v) => { entry.companyId = v; saveItemSoon(item); }, locked))),
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
        } }, 'Punkt löschen') : null));
    refreshChips();
    return card;
  }

  const rows = itemsForMeeting(bundle.items, meeting.id);
  const emptyHint = h('p', { class: 'muted' }, 'Noch keine Punkte. Unten rechts „+ Punkt“ tippen, dann in das Feld diktieren.');
  const itemList = h('div', {}, rows.length ? rows.map(({ item, entry }) => itemCard(item, entry)) : emptyHint);
  const carried = rows.filter((r) => r.item.createdMeetingId !== meeting.id).length;

  const fab = locked ? null : h('button', { class: 'primary fab', onclick: () => {
    // synchron, damit iOS die Tastatur öffnet
    const item = addItem({ meeting, items: bundle.items, type: 'aufgabe' });
    bundle.items.push(item);
    itemsById.set(item.id, item);
    emptyHint.remove();
    const card = itemCard(item, item.log[0]);
    itemList.append(card);
    card.querySelector('textarea')?.focus();
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    store.saveItem(item).then(markSaved, (e) => toast(`Speichern fehlgeschlagen: ${e.message}`, 6000));
  } }, '+ Punkt');

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
      if (blob) images.set(f.id, { dataUrl: await blobToDataUrl(blob), width: a.width, height: a.height });
    }
    const blob = await buildPdf(protocol, { draft, images });
    const name = `${fileSafe(`${project.name}_${protocol.title}_${meeting.date}_${draft ? 'Vorabzug' : protocol.version}`)}.pdf`;
    const how = await shareFile(blob, name, `${protocol.title} vom ${protocol.date}`);
    if (how === 'downloaded') toast('PDF wurde heruntergeladen.');
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
    await flushPending();
    const all = [...itemsById.values()];
    const open = itemsForMeeting(all, meeting.id);
    const unclear = open.filter((r) => r.entry.unclear).length;
    const empty = open.filter((r) => r.item.createdMeetingId === meeting.id && !r.item.text.trim()).length;
    const warn = [
      unclear ? `${unclear} Punkt(e) sind als „unklar“ markiert.` : '',
      empty ? `${empty} neue(r) Punkt(e) ohne Text.` : '',
    ].filter(Boolean).join(' ');
    if (!(await confirmAsk('Endfassung abschließen?', `${warn} Danach ist die Sitzung gesperrt; Änderungen nur als neue Fassung.`.trim(), 'Abschließen'))) return;
    const protocol = buildProtocol({ project, meeting, meetings: bundle.meetings, items: all, attachments: bundle.attachments });
    Object.assign(meeting, finalizeMeeting(meeting, { ...protocol, version: `Fassung ${meeting.finals.length + 1}` }));
    await store.saveMeeting(meeting);
    toast('Endfassung erstellt. Jetzt PDF teilen und versenden.');
    rerender();
  };

  const reopen = async () => {
    if (!(await confirmAsk('Neue Fassung anlegen?', `Die Sitzung wird wieder bearbeitbar. Beim nächsten Abschluss entsteht „Fassung ${meeting.finals.length + 1}“. Die bisherige Fassung bleibt als PDF erhalten, wenn du sie versendet hast.`, 'Neue Fassung'))) return;
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
      locked ? null : h('button', { onclick: busy(() => makePdf(true)) }, 'Vorabzug-PDF'),
      locked ? null : h('button', { class: 'primary', onclick: busy(finalize) }, 'Endfassung abschließen'),
      locked ? h('button', { class: 'primary', onclick: busy(() => makePdf(false)) }, `PDF teilen (${versionLabel(meeting)})`) : null,
      locked ? h('button', { onclick: busy(reopen) }, 'Neue Fassung anlegen') : null,
      h('button', { disabled: !dist.length, onclick: async () => {
        const ok = await copyText(dist.map((d) => d.email).join('; '));
        toast(ok ? `${dist.length} Adresse(n) kopiert.` : 'Kopieren nicht möglich.');
      } }, `Verteiler kopieren (${dist.length})`)),
    digests.length
      ? [h('h3', {}, 'Ihre offenen Punkte – je Firma'),
        h('div', { class: 'actions' }, digests.map((d) => h('a', {
          class: 'btn',
          href: d.recipients.length ? mailtoUrl(d.recipients, d.subject, d.body) : null,
          onclick: d.recipients.length ? null : (e) => { e.preventDefault(); toast(`Für ${d.company} ist keine E-Mail hinterlegt.`); },
        }, `✉ ${d.company} (${d.count}${d.overdue ? `, ${d.overdue} überfällig` : ''})`)))]
      : null,
    store.canDeleteMeeting(bundle, meeting)
      ? h('div', { class: 'actions', style: 'margin-top:20px' }, h('button', { class: 'danger', onclick: async () => {
        if (!(await confirmAsk('Sitzung löschen?', 'Alle hier angelegten Punkte und Bilder werden gelöscht; übernommene Punkte bleiben in der Vorsitzung erhalten.', 'Löschen', true))) return;
        pending.clear();
        await store.deleteMeeting(bundle, meeting);
        location.hash = `#/p/${project.id}`;
      } }, 'Sitzung löschen'))
      : null);

  mount(app, 
    head,
    participants,
    general,
    h('h2', {}, `Punkte (${rows.length}${carried ? `, davon ${carried} fortgeschrieben` : ''})`),
    itemList,
    h('h2', {}, 'Allgemeine Fotos und Skizzen'),
    h('div', { class: 'card' }, thumbs({ entry: null }), mediaButtons({ entry: null })),
    finish,
    fab,
  );
}
