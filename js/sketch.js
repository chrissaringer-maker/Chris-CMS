// Vollbild-Zeichenfläche für Apple Pencil: leere Skizze oder Einzeichnen in ein Foto.
// Striche werden als Vektoren in Bildkoordinaten gespeichert, damit sie später weiter bearbeitbar sind.
import { h, icon, mount } from './ui.js';
import { decode, drawToCanvas, canvasToBlob, thumbFromCanvas } from './images.js';

export const BLANK_SIZE = { width: 2100, height: 1485 }; // A4 quer

const COLORS = [
  ['#111111', 'Schwarz'],
  ['#d32f2f', 'Rot'],
  ['#1565c0', 'Blau'],
  ['#2e7d32', 'Grün'],
];
const WIDTHS = [
  [2.5, 'dünn'],
  [5, 'mittel'],
  [10, 'dick'],
];
const MARKER = { color: '#ffd400', alpha: 0.35, width: 26 };

function drawGrid(ctx, w, h) {
  const step = w / 42; // ca. 5 mm bei A4
  ctx.save();
  ctx.strokeStyle = '#dfe6ee';
  ctx.lineWidth = Math.max(1, w / 2100);
  ctx.beginPath();
  for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  ctx.restore();
}

// Zeichnet Striche; scale = Pixel pro Bildeinheit.
export function drawStrokes(ctx, strokes, scale, unit) {
  for (const s of strokes) {
    const pts = s.points;
    if (!pts.length) continue;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color;
    if (s.marker) {
      ctx.globalAlpha = MARKER.alpha;
      ctx.lineWidth = s.width * unit * scale;
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * scale, pts[0][1] * scale);
      for (const p of pts.slice(1)) ctx.lineTo(p[0] * scale, p[1] * scale);
      if (pts.length === 1) ctx.lineTo(pts[0][0] * scale + 0.1, pts[0][1] * scale);
      ctx.stroke();
    } else {
      // Strichbreite folgt dem Andruck des Stifts
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[i];
        ctx.lineWidth = s.width * unit * scale * (0.35 + 1.3 * ((a[2] + b[2]) / 2));
        ctx.beginPath();
        ctx.moveTo(a[0] * scale, a[1] * scale);
        ctx.lineTo(b[0] * scale + (i === 0 ? 0.1 : 0), b[1] * scale);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// Rendert das fertige Bild in voller Auflösung.
export async function renderFinal({ background, width, height, strokes, grid }) {
  let canvas;
  if (background) {
    const img = await decode(background);
    canvas = drawToCanvas(img, width, height);
    img.close?.();
  } else {
    canvas = drawToCanvas(document.createElement('canvas'), width, height);
    if (grid) drawGrid(canvas.getContext('2d'), width, height);
  }
  drawStrokes(canvas.getContext('2d'), strokes, 1, width / 1000);
  return { rendered: await canvasToBlob(canvas, 'image/jpeg', 0.88), thumb: await thumbFromCanvas(canvas) };
}

/**
 * Öffnet den Editor. Rückgabe: { strokes, rendered, thumb, grid } oder null bei Abbruch.
 * @param {{background?: Blob, width: number, height: number, strokes?: any[], grid?: boolean, title?: string}} opts
 */
export async function openSketch({ background = null, width, height, strokes = [], grid = !background, title = '' }) {
  const bgImage = background ? await decode(background) : null;
  const unit = width / 1000; // Strichbreiten relativ zur Bildbreite
  let state = strokes.map((s) => ({ ...s, points: s.points.map((p) => [...p]) }));
  const undo = [];
  const redo = [];
  let tool = 'pen';
  let color = COLORS[0][0];
  let lineWidth = WIDTHS[1][0];
  let fingerDraws = true; // wird abgeschaltet, sobald ein Stift erkannt ist (Handballen)
  let showGrid = grid;

  const canvas = h('canvas');
  const stage = h('div', { class: 'stage' }, canvas);
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  const bctx = base.getContext('2d');
  let scale = 1;
  let dpr = 1;

  const btn = (label, onclick, attrs = {}) => h('button', { type: 'button', onclick, ...attrs }, label);
  const toolButtons = {};
  const colorButtons = [];
  const widthButtons = [];
  let fingerBtn;
  let gridBtn;

  function refreshToolbar() {
    for (const [k, b] of Object.entries(toolButtons)) b.classList.toggle('on', tool === k);
    colorButtons.forEach((b) => b.classList.toggle('on', tool === 'pen' && b.dataset.color === color));
    widthButtons.forEach((b) => b.classList.toggle('on', Number(b.dataset.w) === lineWidth));
    mount(fingerBtn, icon('hand'), fingerDraws ? 'Finger zeichnet' : 'Finger aus');
    if (gridBtn) gridBtn.classList.toggle('on', showGrid);
    undoBtn.disabled = !undo.length;
    redoBtn.disabled = !redo.length;
  }

  toolButtons.pen = btn([icon('pen'), 'Stift'], () => { tool = 'pen'; refreshToolbar(); });
  toolButtons.marker = btn([icon('marker'), 'Marker'], () => { tool = 'marker'; refreshToolbar(); });
  toolButtons.erase = btn([icon('eraser'), 'Radierer'], () => { tool = 'erase'; refreshToolbar(); });
  for (const [c, name] of COLORS) {
    const b = btn('', () => { tool = 'pen'; color = c; refreshToolbar(); }, { class: 'swatch', 'aria-label': name, style: `background:${c}` });
    b.dataset.color = c;
    colorButtons.push(b);
  }
  for (const [w, name] of WIDTHS) {
    const b = btn(name, () => { lineWidth = w; refreshToolbar(); });
    b.dataset.w = w;
    widthButtons.push(b);
  }
  const undoBtn = btn(icon('undo'), () => step(undo, redo), { 'aria-label': 'Rückgängig' });
  const redoBtn = btn(icon('redo'), () => step(redo, undo), { 'aria-label': 'Wiederholen' });
  fingerBtn = btn('', () => { fingerDraws = !fingerDraws; refreshToolbar(); });
  if (!background) gridBtn = btn([icon('grid'), 'Raster'], () => { showGrid = !showGrid; renderBase(); paint(); refreshToolbar(); });
  const clearBtn = btn([icon('trash'), 'Alles löschen'], () => {
    if (!state.length) return;
    commit(() => (state = []));
  });

  let finish;
  const result = new Promise((r) => (finish = r));
  const doneBtn = h('button', { type: 'button', class: 'accent', onclick: () => close(true) }, 'Fertig');
  const cancelBtn = btn('Abbrechen', () => close(false));

  const root = h('div', { class: 'sketch', role: 'dialog', 'aria-label': title || 'Skizze' },
    h('div', { class: 'tools' },
      cancelBtn, h('span', { class: 'sep' }),
      toolButtons.pen, toolButtons.marker, toolButtons.erase, h('span', { class: 'sep' }),
      colorButtons, h('span', { class: 'sep' }), widthButtons, h('span', { class: 'sep' }),
      undoBtn, redoBtn, gridBtn, fingerBtn, clearBtn, h('span', { class: 'spacer' }), doneBtn),
    stage,
    h('div', { class: 'hint' }, 'Mit dem Apple Pencil zeichnen. Sobald der Stift erkannt ist, zeichnen Finger nicht mehr (Handballen-Schutz) – umschaltbar oben.'));
  document.body.append(root);
  document.body.style.overflow = 'hidden';

  function commit(mutate) {
    undo.push(state.map((s) => s));
    redo.length = 0;
    mutate();
    renderBase();
    paint();
    refreshToolbar();
  }

  function step(from, to) {
    if (!from.length) return;
    to.push(state);
    state = from.pop();
    renderBase();
    paint();
    refreshToolbar();
  }

  function layout() {
    const r = stage.getBoundingClientRect();
    const pad = 12;
    scale = Math.min((r.width - 2 * pad) / width, (r.height - 2 * pad) / height);
    const cssW = Math.floor(width * scale);
    const cssH = Math.floor(height * scale);
    dpr = window.devicePixelRatio || 1;
    for (const c of [canvas, base]) {
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.style.left = `${Math.floor((r.width - cssW) / 2)}px`;
    canvas.style.top = `${Math.floor((r.height - cssH) / 2)}px`;
    renderBase();
    paint();
  }

  function renderBase() {
    const s = scale * dpr;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.fillStyle = '#fff';
    bctx.fillRect(0, 0, base.width, base.height);
    if (bgImage) bctx.drawImage(bgImage, 0, 0, base.width, base.height);
    else if (showGrid) drawGrid(bctx, base.width, base.height);
    drawStrokes(bctx, state, s, unit);
  }

  let current = null;
  let raf = 0;
  function paint() {
    raf = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    if (current && current.points.length) drawStrokes(ctx, [current], scale * dpr, unit);
  }
  const schedule = () => (raf ||= requestAnimationFrame(paint));

  function toImage(e) {
    const r = canvas.getBoundingClientRect();
    const p = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale, Math.min(1, Math.max(0, p))];
  }

  function eraseAt(pt) {
    const radius = 14 * unit;
    const hit = (s) => s.points.some((p) => Math.hypot(p[0] - pt[0], p[1] - pt[1]) <= radius + (s.width * unit) / 2);
    const keep = state.filter((s) => !hit(s));
    if (keep.length !== state.length) {
      if (!current.erased) {
        undo.push(state);
        redo.length = 0;
        current.erased = true;
      }
      state = keep;
      renderBase();
      schedule();
      refreshToolbar();
    }
  }

  let activePointer = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen' && fingerDraws) {
      fingerDraws = false;
      refreshToolbar();
    }
    if (e.pointerType === 'touch' && !fingerDraws) return;
    if (activePointer !== null) return;
    e.preventDefault();
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const pt = toImage(e);
    if (tool === 'erase') {
      current = { erase: true };
      eraseAt(pt);
      return;
    }
    current = tool === 'marker'
      ? { color: MARKER.color, width: MARKER.width, marker: true, points: [pt] }
      : { color, width: lineWidth, points: [pt] };
    schedule();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointer || !current) return;
    e.preventDefault();
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events.length ? events : [e]) {
      const pt = toImage(ev);
      if (current.erase) eraseAt(pt);
      else current.points.push(pt);
    }
    if (!current.erase) schedule();
  });

  const end = (e) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (current && !current.erase && current.points.length) {
      const stroke = current;
      current = null;
      commit(() => (state = [...state, stroke]));
    }
    current = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  // iOS: Scrollen, Lupe und Doppeltipp-Zoom unterdrücken
  for (const type of ['touchstart', 'touchmove']) stage.addEventListener(type, (e) => e.preventDefault(), { passive: false });

  const onResize = () => layout();
  window.addEventListener('resize', onResize);

  async function close(save) {
    if (!save && (undo.length || redo.length)) {
      if (!window.confirm('Änderungen verwerfen?')) return;
    }
    window.removeEventListener('resize', onResize);
    document.body.style.overflow = '';
    if (!save) {
      root.remove();
      bgImage?.close?.();
      return finish(null);
    }
    doneBtn.disabled = true;
    doneBtn.textContent = 'Speichert …';
    try {
      const out = await renderFinal({ background, width, height, strokes: state, grid: showGrid });
      finish({ strokes: state, grid: showGrid, ...out });
    } finally {
      root.remove();
      bgImage?.close?.();
    }
  }

  refreshToolbar();
  layout();
  return result;
}
