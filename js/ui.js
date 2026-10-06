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
        input = h('input', { type: f.type ?? 'text', name: f.name, value: f.value ?? '', placeholder: f.placeholder ?? '', autocomplete: 'off' });
      }
      inputs[f.name] = input;
      return f.type === 'checkbox' ? h('label', { class: 'inline' }, input, f.label) : labeled(f.label, input);
    }),
    h('div', { class: 'actions' },
      h('button', { type: 'submit', class: danger ? 'danger' : 'primary' }, ok),
      cancel && h('button', { type: 'button', onclick: () => close(null) }, cancel)));
    const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => e.target === backdrop && close(null) }, h('div', { class: 'modal' }, form));
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

// Datei über das iOS-Teilen-Menü weitergeben, sonst herunterladen.
export async function shareFile(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'aborted';
    }
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
    const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => e.target === backdrop && close(null) },
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
