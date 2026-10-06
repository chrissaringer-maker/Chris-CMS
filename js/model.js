// Fachlogik ohne Browser-Abhängigkeiten (in Node testbar).
// Alle Funktionen sind rein: Sie verändern ihre Eingaben nicht, sondern liefern Kopien.

export const MEETING_TYPES = {
  besprechung: { label: 'Baubesprechung' },
  begehung: { label: 'Baubegehung' },
};

// Punkte werden je Projekt nach Leistungsgruppe (LB-HB) nummeriert: 39.001 … 39.999.
// LG 00 = allgemeine Punkte ohne bestimmtes Gewerk.
export const LG_GENERAL = '00';
export const MAX_SEQ = 999;

export const ITEM_TYPES = {
  aufgabe: 'Aufgabe',
  mangel: 'Mangel',
  festlegung: 'Festlegung',
  info: 'Info',
};

export const STATUS = {
  offen: 'offen',
  erledigt: 'erledigt',
  entfallen: 'entfällt',
  info: 'zur Kenntnis',
};

// Österreich: ÖNORM B 2110 – einseitige Aufzeichnungen gelten als bestätigt, wenn nicht binnen 14 Tagen ab Übergabe
// schriftlich widersprochen wird (nur wirksam, wenn die Norm im Bauvertrag vereinbart ist).
export const DEFAULT_OBJECTION_DAYS = 14;
export const DEFAULT_OBJECTION_TEXT =
  'Einwendungen gegen dieses Protokoll sind binnen {tage} Tagen ab Übermittlung schriftlich beim Verfasser zu erheben. ' +
  'Andernfalls gilt das Protokoll als bestätigt.';

export function uid() {
  return crypto.randomUUID();
}

export function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// ---------- Projekt ----------

export function newProject(name, now = new Date()) {
  return {
    id: uid(),
    name: name.trim(),
    address: '',
    client: '',
    author: '',
    objectionDays: DEFAULT_OBJECTION_DAYS,
    objectionText: DEFAULT_OBJECTION_TEXT,
    companies: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function newCompany(name, trade = '', lgs = []) {
  return { id: uid(), name: name.trim(), trade: trade.trim(), lgs, contacts: [] };
}

// „7“ → „07“; ungültige Eingaben → null
export function normalizeLg(input) {
  const t = String(input ?? '').trim();
  return /^\d{1,2}$/.test(t) ? t.padStart(2, '0') : null;
}

// „39“, „07, 08“ oder „7 8“ → ['39'] bzw. ['07', '08']
export function parseLgList(input) {
  return [...new Set(String(input ?? '').split(/[\s,;]+/).map(normalizeLg).filter(Boolean))];
}

// Alle im Projekt bekannten Leistungsgruppen mit Bezeichnung (aus Gewerk bzw. Firmenname).
export function projectLgs(project) {
  const map = new Map([[LG_GENERAL, 'Allgemein']]);
  for (const c of project.companies) {
    for (const lg of c.lgs ?? []) {
      const label = c.trade || c.name;
      map.set(lg, map.has(lg) && lg !== LG_GENERAL ? `${map.get(lg)} / ${label}` : label);
    }
  }
  return [...map.entries()].sort(([a], [b]) => Number(a) - Number(b)).map(([lg, label]) => ({ lg, label }));
}

export function lgLabel(project, lg) {
  return projectLgs(project).find((x) => x.lg === lg)?.label ?? '';
}

export function newContact(name = '', email = '') {
  return { id: uid(), name: name.trim(), email: email.trim(), phone: '', inDistribution: true };
}

export function companyName(project, companyId) {
  return project.companies.find((c) => c.id === companyId)?.name ?? '';
}

// Verteiler: alle Kontakte mit E-Mail, die nicht ausdrücklich ausgenommen sind.
export function distribution(project) {
  const list = [];
  for (const c of project.companies) {
    for (const k of c.contacts) {
      if (k.email && k.inDistribution !== false) list.push({ name: k.name, email: k.email, company: c.name });
    }
  }
  return list;
}

export function objectionClause(project) {
  return (project.objectionText || DEFAULT_OBJECTION_TEXT).replace('{tage}', String(project.objectionDays ?? 5));
}

// ---------- Besprechung / Begehung ----------

export function seriesOf(meetings, projectId, type) {
  return meetings.filter((m) => m.projectId === projectId && m.type === type).sort((a, b) => a.number - b.number);
}

export function meetingTitle(meeting) {
  return `${MEETING_TYPES[meeting.type].label} Nr. ${meeting.number}`;
}

// Legt die nächste Besprechung einer Reihe an. Offene Punkte der Vorbesprechung werden übernommen
// (Fortschreibung), Teilnehmer ebenfalls. Rückgabe: neue Besprechung + geänderte Punkte.
export function createMeeting({ project, meetings, items, type, date = isoDate(), now = new Date() }) {
  const series = seriesOf(meetings, project.id, type);
  const prev = series.at(-1);
  const meeting = {
    id: uid(),
    projectId: project.id,
    type,
    number: prev ? prev.number + 1 : 1,
    date,
    time: '',
    location: prev?.location ?? project.address ?? '',
    nextDate: '',
    generalNotes: '',
    participants: (prev?.participants ?? []).map((p) => ({ ...p, present: true })),
    attachmentIds: [],
    status: 'entwurf',
    finals: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  return { meeting, items: carryOver({ meetings: [...meetings, meeting], items, meeting }) };
}

// Fortschreibung: Punkte der Reihe, die in `meeting` noch fehlen und deren letzter Stand in einer
// FRÜHEREN Sitzung offen ist – egal in welcher (auch wenn die Vorsitzung nachträglich ergänzt wurde).
// Punkte, die schon in einer späteren Sitzung weiterlaufen, bleiben unberührt.
export function carryOver({ meetings, items, meeting }) {
  const number = new Map(meetings.filter((m) => m.type === meeting.type).map((m) => [m.id, m.number]));
  const out = [];
  for (const item of items) {
    if (item.projectId !== meeting.projectId || item.series !== meeting.type || entryFor(item, meeting.id)) continue;
    const nums = item.log.map((e) => number.get(e.meetingId));
    if (nums.some((n) => n > meeting.number)) continue;
    const before = item.log
      .map((e, i) => ({ e, n: nums[i] }))
      .filter(({ n }) => n !== undefined && n < meeting.number)
      .sort((x, y) => x.n - y.n);
    const last = before.at(-1)?.e;
    if (!last || last.status !== 'offen') continue;
    out.push({
      ...item,
      log: [...item.log, { meetingId: meeting.id, note: '', companyId: last.companyId, due: last.due, status: 'offen', unclear: last.unclear, attachmentIds: [] }],
    });
  }
  return out;
}

// Gibt es in derselben Reihe schon eine spätere Sitzung?
export function laterMeeting(meetings, meeting) {
  return meetings.filter((m) => m.projectId === meeting.projectId && m.type === meeting.type && m.number > meeting.number)
    .sort((a, b) => a.number - b.number)[0] ?? null;
}

export function isLocked(meeting) {
  return meeting.status === 'endfassung';
}

export function versionLabel(meeting) {
  const n = meeting.finals?.length ?? 0;
  if (meeting.status === 'endfassung') return `Fassung ${n}`;
  return n === 0 ? 'Entwurf' : `Fassung ${n + 1} (in Bearbeitung)`;
}

export function finalizeMeeting(meeting, protocol, now = new Date()) {
  const finals = [...(meeting.finals ?? []), { version: (meeting.finals?.length ?? 0) + 1, at: now.toISOString(), protocol }];
  return { ...meeting, status: 'endfassung', finals, updatedAt: now.toISOString() };
}

export function reopenMeeting(meeting, now = new Date()) {
  return { ...meeting, status: 'entwurf', updatedAt: now.toISOString() };
}

// ---------- Punkte ----------

export function parseNo(no) {
  const m = /^(\d+)\.(\d+)$/.exec(no ?? '');
  return m ? { group: Number(m[1]), seq: Number(m[2]) } : { group: 0, seq: 0 };
}

export function compareNo(a, b) {
  const x = parseNo(a);
  const y = parseNo(b);
  return x.group - y.group || x.seq - y.seq;
}

export function formatNo(lg, seq) {
  return `${lg}.${String(seq).padStart(3, '0')}`;
}

// Nächste freie Nummer einer Leistungsgruppe im Projekt (ohne den Punkt selbst).
export function nextNo(items, projectId, lg, exceptId = null) {
  const seq = items
    .filter((i) => i.projectId === projectId && i.lg === lg && i.id !== exceptId)
    .reduce((max, i) => Math.max(max, parseNo(i.no).seq), 0) + 1;
  if (seq > MAX_SEQ) throw new Error(`Leistungsgruppe ${lg} ist voll (${MAX_SEQ} Punkte).`);
  return formatNo(lg, seq);
}

export function defaultStatus(type) {
  return type === 'aufgabe' || type === 'mangel' ? 'offen' : 'info';
}

// items: alle Punkte des Projekts (Nummern sind projektweit eindeutig)
export function addItem({ meeting, items, lg = LG_GENERAL, type = 'aufgabe', companyId = '', now = new Date() }) {
  return {
    id: uid(),
    projectId: meeting.projectId,
    series: meeting.type,
    lg,
    lgManual: false,
    no: nextNo(items, meeting.projectId, lg),
    type,
    text: '',
    createdMeetingId: meeting.id,
    createdAt: now.toISOString(),
    log: [{ meetingId: meeting.id, note: '', companyId, due: '', status: defaultStatus(type), unclear: false, attachmentIds: [] }],
  };
}

export function entryFor(item, meetingId) {
  return item.log.find((e) => e.meetingId === meetingId);
}

export function updateEntry(item, meetingId, patch) {
  return { ...item, log: item.log.map((e) => (e.meetingId === meetingId ? { ...e, ...patch } : e)) };
}

// Grundtext und Art sind nur in der Besprechung änderbar, in der der Punkt entstand, und nur vor der Endfassung.
export function canEditBase(item, meeting) {
  return item.createdMeetingId === meeting.id && !isLocked(meeting);
}

// Löschen und Umnummerieren nur, solange der Punkt nirgends fortgeschrieben wurde. Sonst „entfällt“ setzen.
export function canDelete(item, meeting) {
  return canEditBase(item, meeting) && item.log.every((e) => e.meetingId === meeting.id);
}
export const canRenumber = canDelete;

// Neue Leistungsgruppe → neue Nummer. manual = vom Benutzer gewählt (dann keine automatische Übernahme mehr).
export function changeLg(item, items, meeting, lg, manual = true) {
  if (!canRenumber(item, meeting)) throw new Error('Nummer ist bereits fortgeschrieben und bleibt unverändert.');
  if (lg === item.lg) return { ...item, lgManual: item.lgManual || manual };
  return { ...item, lg, lgManual: item.lgManual || manual, no: nextNo(items, item.projectId, lg, item.id) };
}

// Bei Wahl der zuständigen Firma: LG der Firma übernehmen, solange der Benutzer keine LG festgelegt hat.
export function lgFromCompany(item, items, meeting, company) {
  const lg = company?.lgs?.[0];
  if (!lg || item.lgManual || lg === item.lg || !canRenumber(item, meeting)) return item;
  return changeLg(item, items, meeting, lg, false);
}

export function itemsForMeeting(items, meetingId) {
  return items
    .map((item) => ({ item, entry: entryFor(item, meetingId) }))
    .filter((x) => x.entry)
    .sort((a, b) => compareNo(a.item.no, b.item.no));
}

export function isOverdue(entry, refDate) {
  return entry.status === 'offen' && !!entry.due && entry.due < refDate;
}

// Offene Punkte eines Projekts über alle Reihen, jeweils mit ihrem letzten Stand.
export function openItems(items, projectId) {
  return items
    .filter((i) => i.projectId === projectId)
    .map((item) => ({ item, entry: item.log.at(-1) }))
    .filter((x) => x.entry.status === 'offen')
    .sort((a, b) => compareNo(a.item.no, b.item.no));
}

// ---------- Protokoll (Grundlage für PDF und Endfassung) ----------

export function buildProtocol({ project, meeting, meetings, items, attachments = [] }) {
  const meetingDate = new Map(meetings.map((m) => [m.id, m.date]));
  const attById = new Map(attachments.map((a) => [a.id, a]));
  const rows = itemsForMeeting(items, meeting.id).map(({ item, entry }) => {
    const idx = item.log.indexOf(entry);
    const history = item.log
      .slice(0, idx)
      .filter((e) => e.note.trim())
      .map((e) => ({ date: formatDate(meetingDate.get(e.meetingId)), note: e.note.trim() }));
    return {
      id: item.id,
      no: item.no,
      lg: item.lg ?? LG_GENERAL,
      lgLabel: lgLabel(project, item.lg ?? LG_GENERAL),
      type: ITEM_TYPES[item.type],
      text: item.text.trim(),
      history,
      note: item.createdMeetingId === meeting.id ? '' : entry.note.trim(),
      company: companyName(project, entry.companyId),
      due: formatDate(entry.due),
      status: STATUS[entry.status],
      statusKey: entry.status,
      unclear: !!entry.unclear,
      overdue: isOverdue(entry, meeting.date),
      isNew: item.createdMeetingId === meeting.id,
      attachments: (entry.attachmentIds ?? [])
        .map((id) => attById.get(id))
        .filter(Boolean)
        .map((a) => ({ id: a.id, kind: a.kind, caption: a.caption ?? '' })),
    };
  });

  const closed = (r) => r.statusKey === 'erledigt' || r.statusKey === 'entfallen';
  const sections = [
    { title: 'Neue Punkte', rows: rows.filter((r) => r.isNew) },
    { title: 'Fortgeschriebene Punkte', rows: rows.filter((r) => !r.isNew && !closed(r)) },
    { title: 'Erledigt / entfallen seit letzter Sitzung', rows: rows.filter((r) => !r.isNew && closed(r)) },
  ].filter((s) => s.rows.length);

  // Anlagen fortlaufend nummerieren: Abb. <Punkt>-<n>, allgemeine Anlagen Abb. A-<n>
  const figures = [];
  for (const r of rows) {
    r.attachments.forEach((a, i) => {
      a.label = `Abb. ${r.no}-${i + 1}`;
      figures.push({ ...a, rowNo: r.no });
    });
  }
  (meeting.attachmentIds ?? []).forEach((id, i) => {
    const a = attById.get(id);
    if (a) figures.push({ id: a.id, kind: a.kind, caption: a.caption ?? '', label: `Abb. A-${i + 1}`, rowNo: '' });
  });

  return {
    projectName: project.name,
    address: project.address,
    client: project.client,
    author: project.author,
    title: meetingTitle(meeting),
    date: formatDate(meeting.date),
    time: meeting.time,
    location: meeting.location,
    nextDate: formatDate(meeting.nextDate),
    generalNotes: meeting.generalNotes.trim(),
    participants: meeting.participants.map((p) => ({
      company: companyName(project, p.companyId),
      name: p.name,
      present: p.present !== false,
    })),
    distribution: distribution(project),
    sections,
    figures,
    objection: objectionClause(project),
    version: versionLabel(meeting),
  };
}

// ---------- Mails ----------

function oneLine(s, max = 220) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// Je Firma: Übersicht der für sie offenen Punkte (überfällig zuerst). Das Gesamtprotokoll bleibt maßgeblich.
export function companyDigests({ project, meeting, items, refDate = isoDate() }) {
  const rows = itemsForMeeting(items, meeting.id).filter(({ entry }) => entry.status === 'offen' && entry.companyId);
  const out = [];
  for (const company of project.companies) {
    const own = rows.filter(({ entry }) => entry.companyId === company.id);
    if (!own.length) continue;
    const overdue = own.filter(({ entry }) => isOverdue(entry, refDate));
    const fresh = own.filter(({ item, entry }) => item.createdMeetingId === meeting.id && !isOverdue(entry, refDate));
    const rest = own.filter((x) => !overdue.includes(x) && !fresh.includes(x));
    const line = ({ item, entry }) => {
      const parts = [`${item.no}  ${oneLine(item.text || '(ohne Text)')}`];
      if (entry.note.trim() && item.createdMeetingId !== meeting.id) parts.push(`Stand: ${oneLine(entry.note, 160)}`);
      parts.push(entry.due ? `Frist ${formatDate(entry.due)}` : 'ohne Frist');
      return parts.join(' – ');
    };
    const block = (title, list) => (list.length ? [title, ...list.map(line), ''] : []);
    const recipients = company.contacts.filter((k) => k.email).map((k) => k.email);
    const date = formatDate(meeting.date);
    const subject = `${project.name} – ${meetingTitle(meeting)} vom ${date} – Ihre offenen Punkte (${company.name})`;
    const body = [
      'Sehr geehrte Damen und Herren,',
      '',
      `nachfolgend die für Sie offenen Punkte aus der ${meetingTitle(meeting)} vom ${date}.`,
      '',
      ...block('ÜBERFÄLLIG', overdue),
      ...block('NEU', fresh),
      ...block('OFFEN', rest),
      `Maßgeblich ist das Gesamtprotokoll vom ${date}. Diese Übersicht dient nur der Information.`,
      '',
      'Mit freundlichen Grüßen',
      project.author || '',
    ].join('\n');
    out.push({ companyId: company.id, company: company.name, recipients, subject, body, count: own.length, overdue: overdue.length });
  }
  return out;
}

export function mailtoUrl(recipients, subject, body) {
  const to = recipients.map(encodeURIComponent).join(',');
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function fileSafe(s) {
  return s
    .replace(/[äÄ]/g, (c) => (c === 'ä' ? 'ae' : 'Ae'))
    .replace(/[öÖ]/g, (c) => (c === 'ö' ? 'oe' : 'Oe'))
    .replace(/[üÜ]/g, (c) => (c === 'ü' ? 'ue' : 'Ue'))
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
