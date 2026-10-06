// Kleine UI-Helfer ohne Framework.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  el.append(...nodes(children));
  return el;
}

// Kinder normalisieren: verschachtelte Listen auflösen, null/false weglassen, Text in Textknoten.
function nodes(children) {
  return children
    .flat(Infinity)
    .filter((c) => c != null && c !== false)
    .map((c) => (c instanceof Node ? c : document.createTextNode(String(c))));
}

// Inhalt eines Elements ersetzen bzw. ergänzen (wie replaceChildren/append, aber mit Listen und null).
export const mount = (el, ...children) => el.replaceChildren(...nodes(children));
export const add = (el, ...children) => el.append(...nodes(children));

// Beschriftung fest mit dem Eingabefeld verknüpfen (Bedienungshilfen, Antippen der Beschriftung).
let fieldSeq = 0;
export function labeled(label, input) {
  if (!input.id) input.id = `f${++fieldSeq}`;
  return [h('label', { for: input.id }, label), input];
}

export function setTitle(text, backHref) {
  document.getElementById('title').textContent = text;
  document.title = text === 'Baustellen-Protokoll' ? text : `${text} – Protokoll`;
  const back = document.getElementById('back');
  back.hidden = !backHref;
  if (backHref) back.href = backHref;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

let savedTimer;
export function markSaved() {
  const s = document.getElementById('saved');
  s.textContent = 'gespeichert';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (s.textContent = ''), 1500);
}

// Modaler Dialog. fields: [{name, label, type, value, options, placeholder}]
// Liefert die Feldwerte (oder true ohne Felder) bzw. null bei Abbruch.
export function ask({ title, text = '', fields = [], ok = 'OK', cancel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    const inputs = {};
    const close = (val) => {
      backdrop.remove();
      resolve(val);
    };
    const form = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (!fields.length) return close(true);
        const out = {};
        for (const f of fields) out[f.name] = f.type === 'checkbox' ? inputs[f.name].checked : inputs[f.name].value.trim();
        close(out);
      },
    },
    h('h3', {}, title),
    text && h('p', { class: 'muted' }, text),
    fields.map((f) => {
      let input;
      if (f.type === 'select') {
        input = h('select', { name: f.name }, f.options.map(([v, l]) => h('option', { value: v }, l)));
        input.value = f.value ?? '';
      } else if (f.type === 'textarea') {
        input = h('textarea', { name: f.name, placeholder: f.placeholder ?? '', value: f.value ?? '' });
      } else if (f.type === 'checkbox') {
        input = h('input', { type: 'checkbox', name: f.name, checked: !!f.value });
      } else {
        input = h('input', { type: f.type ?? 'text', name: f.name, value: f.value ?? '', placeholder: f.placeholder ?? '', autocomplete: 'off', inputmode: f.inputmode });
      }
      inputs[f.name] = input;
      return f.type === 'checkbox' ? h('label', { class: 'inline' }, input, f.label) : labeled(f.label, input);
    }),
    h('div', { class: 'actions' },
      h('button', { type: 'submit', class: danger ? 'danger' : 'primary' }, ok),
      cancel && h('button', { type: 'button', onclick: () => close(null) }, cancel)));
    const backdrop = h('div', { class: `modal-backdrop ${fields.length ? 'at-top' : 'at-thumb'}`, onclick: (e) => e.target === backdrop && close(null) }, h('div', { class: 'modal' }, form));
    document.body.append(backdrop);
    (Object.values(inputs)[0] ?? form.querySelector('button'))?.focus();
  });
}

export const confirmAsk = (title, text, ok = 'Ja', danger = false) => ask({ title, text, ok, danger }).then((r) => !!r);

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    wrapped.pending = () => {
      clearTimeout(t);
      wrapped.pending = null;
      return fn(...args);
    };
    t = setTimeout(wrapped.pending, ms);
  };
  wrapped.flush = () => wrapped.pending?.();
  return wrapped;
}

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Datei über das iOS-Teilen-Menü weitergeben, sonst herunterladen.
// Ergebnis: 'shared' | 'aborted' | 'downloaded' | 'failed' (installierte App: Downloads funktionieren dort nicht)
export async function shareFile(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'aborted';
      if (isStandalone()) return 'failed';
    }
  } else if (isStandalone()) {
    return 'failed';
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// Bild-URLs für Blobs, werden beim Seitenwechsel freigegeben.
const urls = new Set();
export function blobUrl(blob) {
  const u = URL.createObjectURL(blob);
  urls.add(u);
  return u;
}
export function releaseBlobUrls() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
}

// Auswahl als Liste großer Knöpfe. options: [[key, label, {danger}]] → key oder null
export function choose(title, options) {
  return new Promise((resolve) => {
    const close = (v) => {
      backdrop.remove();
      resolve(v);
    };
    const backdrop = h('div', { class: 'modal-backdrop at-thumb', onclick: (e) => e.target === backdrop && close(null) },
      h('div', { class: 'modal' },
        h('h3', {}, title),
        h('div', { class: 'actions', style: 'flex-direction:column;align-items:stretch' },
          options.map(([key, label, o = {}]) => h('button', { type: 'button', class: o.danger ? 'danger' : '', onclick: () => close(key) }, label)),
          h('button', { type: 'button', class: 'ghost', onclick: () => close(null) }, 'Abbrechen'))));
    document.body.append(backdrop);
  });
}

// Bild im Vollbild ansehen.
export function viewImage(blob, caption = '') {
  const url = URL.createObjectURL(blob);
  const close = () => {
    root.remove();
    URL.revokeObjectURL(url);
  };
  const root = h('div', { class: 'modal-backdrop', style: 'flex-direction:column;background:rgba(0,0,0,.9)', onclick: close },
    h('img', { src: url, alt: caption, style: 'max-width:100%;max-height:85vh;object-fit:contain' }),
    caption && h('p', { style: 'color:#fff' }, caption),
    h('button', { type: 'button', style: 'margin-top:10px' }, 'Schließen'));
  document.body.append(root);
}

// Datei-Auswahl (Kamera oder Mediathek). iOS verlangt, dass das Feld im Dokument hängt.
export function pickFile({ accept = 'image/*', capture = false, multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, capture: capture ? 'environment' : null, multiple, style: 'position:fixed;left:-1000px' });
    input.addEventListener('change', () => {
      resolve([...input.files]);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve([]);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

// Liniensymbole (24er-Raster, eckige Enden) für einen sachlich-technischen Auftritt.
const ICONS = {
  plus: ['M12 4v16', 'M4 12h16'],
  camera: ['M3 8h4l2-3h6l2 3h4v12H3z', 'M12 10a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z'],
  image: ['M3 5h18v14H3z', 'M3 16l5-5 4 4 3-3 6 6', 'M8.5 8a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z'],
  pen: ['M4 20l1-4L16 5l3 3L8 19z', 'M14 7l3 3'],
  marker: ['M8 15l7-7 4 4-7 7H8z', 'M4 21h9'],
  eraser: ['M9 20h11', 'M4 15l9-9 6 6-8 8H8z', 'M9 10l6 6'],
  undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
  redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
  mail: ['M3 5h18v14H3z', 'M3 7l9 6 9-6'],
  copy: ['M8 8h12v12H8z', 'M4 16V4h12'],
  file: ['M6 3h9l4 4v14H6z', 'M15 3v4h4', 'M9 12h6', 'M9 16h6'],
  share: ['M12 3v12', 'M7 8l5-5 5 5', 'M5 12v9h14v-9'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  unlock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 7.5-2'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 14h10l1-14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  upload: ['M12 15V3', 'M7 8l5-5 5 5', 'M5 21h14'],
  grid: ['M3 3h18v18H3z', 'M9 3v18', 'M15 3v18', 'M3 9h18', 'M3 15h18'],
  hand: ['M8 12V5a1.5 1.5 0 0 1 3 0v6', 'M11 11V4a1.5 1.5 0 0 1 3 0v7', 'M14 11V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L8 15'],
  users: ['M9 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8z', 'M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2', 'M16 3.5a4 4 0 0 1 0 7', 'M22 21v-2a5 5 0 0 0-3.5-4.8'],
  settings: ['M4 6h10', 'M18 6h2', 'M14 4v4', 'M4 12h4', 'M12 12h8', 'M8 10v4', 'M4 18h12', 'M20 18h0', 'M16 16v4'],
  mic: ['M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
  stop: ['M7 7h10v10H7z'],
  up: ['M6 15l6-6 6 6'],
  down: ['M6 9l6 6 6-6'],
  back: ['M15 5l-7 7 7 7'],
  check: ['M5 12l5 5 9-10'],
  more: ['M4 11h2v2H4z', 'M11 11h2v2h-2z', 'M18 11h2v2h-2z'],
  building: ['M4 21V5l8-3v19', 'M12 21V9l8 3v9', 'M2 21h20', 'M7 8h2', 'M7 12h2', 'M7 16h2', 'M15 14h2', 'M15 18h2'],
};

export function icon(name, size = 20) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'square', 'stroke-linejoin': 'miter', 'aria-hidden': 'true', class: 'icon' })) {
    svg.setAttribute(k, v);
  }
  for (const d of ICONS[name] ?? []) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// ---------- Einstellungen der Bedienung (nur auf diesem Gerät) ----------
const PREFS_KEY = 'bp-prefs';
const PREF_DEFAULTS = { hand: 'rechts', rail: 'unten' };
export function getPrefs() {
  try {
    return { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { ...PREF_DEFAULTS };
  }
}
export function setPrefs(patch) {
  const p = { ...getPrefs(), ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* privater Modus: gilt nur bis zum Neuladen */
  }
  applyPrefs(p);
  return p;
}
export function applyPrefs(p = getPrefs()) {
  document.documentElement.dataset.hand = p.hand;
  document.documentElement.dataset.rail = p.rail;
}

// ---------- Daumenleiste: Knopffeld unten am Rand der Haltehand (2 Spalten) ----------
// items: [{ icon, label, onclick | href, primary, danger, active, disabled, id, wide }]
// Reihenfolge = Lesereihenfolge (zeilenweise); das Wichtigste gehört ans Ende (unten, am Daumen).
// `wide` belegt eine ganze Zeile.
export function setRail(items = []) {
  const rail = document.getElementById('rail');
  const make = (it) => {
    const attrs = {
      class: ['rail-btn', it.primary && 'primary', it.danger && 'danger', it.active && 'active', it.wide && 'wide'].filter(Boolean).join(' '),
      id: it.id, 'aria-label': it.aria ?? it.label, disabled: it.disabled,
    };
    const body = [icon(it.icon, it.wide ? 30 : 26), h('span', { class: 'rail-label' }, it.label)];
    return it.href ? h('a', { ...attrs, href: it.href }, body) : h('button', { ...attrs, type: 'button', onclick: it.onclick }, body);
  };
  const out = items.filter(Boolean).map(make);
  mount(rail, out);
  document.body.classList.toggle('has-rail', out.length > 0);
  return rail;
}

// Zweistufig teilen: Die Datei ist schon fertig, der Tipp auf „Teilen …“ startet das Teilen sofort
// (Safari erlaubt navigator.share nur kurz nach einem Tipp – lange Erzeugung davor würde es verhindern).
export async function offerShare(blob, filename, title) {
  const mb = blob.size / 1048576;
  const ok = await ask({ title: 'Datei ist fertig', text: `${filename} · ${mb < 0.1 ? '< 0,1' : mb.toFixed(1).replace('.', ',')} MB`, ok: 'Teilen …', cancel: 'Abbrechen' });
  if (!ok) return 'aborted';
  return shareFile(blob, filename, title);
}
