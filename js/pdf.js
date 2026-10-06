// Erzeugt das Protokoll-PDF (A4) aus dem Protokoll-Modell (model.buildProtocol).
// jsPDF wird erst bei Bedarf geladen.

let loading;
function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/jspdf.umd.min.js';
    s.onload = () => resolve(window.jspdf.jsPDF);
    s.onerror = () => {
      loading = null;
      reject(new Error('PDF-Modul konnte nicht geladen werden.'));
    };
    document.head.append(s);
  });
  return loading;
}

// Die Standardschrift im PDF kennt nur westeuropäische Zeichen (Umlaute und ß gehen).
const REPLACE = { '–': '-', '—': '-', '„': '"', '“': '"', '”': '"', '‚': "'", '‘': "'", '’': "'", '…': '...', '•': '-', '€': 'EUR', ' ': ' ' };
export function clean(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[–—„“”‚‘’…•€ ]/g, (c) => REPLACE[c])
    .replace(/[^\n\x20-\x7e\xa0-\xff]/g, '');
}

const PAGE = { w: 210, h: 297, l: 15, r: 15, t: 22, b: 18 };
const CW = PAGE.w - PAGE.l - PAGE.r; // 180 mm
const COLS = [
  { key: 'no', title: 'Nr.', w: 16 },
  { key: 'content', title: 'Inhalt', w: 88 },
  { key: 'company', title: 'Zuständig', w: 34 },
  { key: 'due', title: 'Frist', w: 20 },
  { key: 'status', title: 'Status', w: 22 },
];
const PT = 0.3528; // mm pro pt
const lh = (size) => size * PT * 1.28;
const INK = [29, 35, 43];
const MUTED = [93, 102, 115];
const WARN = [181, 71, 11];
const PURPLE = [122, 42, 118];

/**
 * @param {object} p   Protokoll aus buildProtocol
 * @param {{draft: boolean, images: Map<string, {dataUrl: string, width: number, height: number}>}} opts
 * @returns {Promise<Blob>}
 */
export async function buildPdf(p, { draft, images = new Map() }) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: clean(`${p.title} - ${p.projectName}`), creator: 'Baustellen-Protokoll' });
  let y = PAGE.t;

  const font = (size, style = 'normal', color = INK) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lines = (text, width) => doc.splitTextToSize(clean(text), width);
  const newPage = () => {
    doc.addPage();
    y = PAGE.t;
  };
  const ensure = (needed) => {
    if (y + needed > PAGE.h - PAGE.b) newPage();
  };
  const para = (text, size = 10, style = 'normal', color = INK, indent = 0) => {
    font(size, style, color);
    for (const ln of lines(text, CW - indent)) {
      ensure(lh(size));
      doc.text(ln, PAGE.l + indent, y, { baseline: 'top' });
      y += lh(size);
    }
  };
  const heading = (text) => {
    ensure(14);
    y += 3;
    font(12, 'bold');
    doc.text(clean(text), PAGE.l, y, { baseline: 'top' });
    y += lh(12) + 1;
    doc.setDrawColor(200);
    doc.line(PAGE.l, y, PAGE.l + CW, y);
    y += 2;
  };

  // ---------- Kopf ----------
  font(18, 'bold');
  doc.text(clean(p.title), PAGE.l, y, { baseline: 'top' });
  y += lh(18) + 1;
  if (draft) {
    font(11, 'bold', WARN);
    doc.text('VORABZUG - nicht freigegeben', PAGE.l, y, { baseline: 'top' });
    y += lh(11) + 1;
  }
  y += 2;
  const facts = [
    ['Bauvorhaben', p.projectName],
    ['Adresse', p.address],
    ['Bauherr', p.client],
    ['Datum', [p.date, p.time && `${p.time} Uhr`].filter(Boolean).join(', ')],
    ['Ort', p.location],
    ['Verfasser', p.author],
    ['Fassung', draft ? 'Vorabzug' : p.version],
    ['Nächster Termin', p.nextDate],
  ].filter(([, v]) => v);
  for (const [k, v] of facts) {
    font(10, 'bold', MUTED);
    doc.text(clean(k), PAGE.l, y, { baseline: 'top' });
    font(10);
    const ls = lines(v, CW - 38);
    doc.text(ls, PAGE.l + 38, y, { baseline: 'top' });
    y += lh(10) * ls.length + 0.8;
  }

  // ---------- Teilnehmer ----------
  if (p.participants.length) {
    heading('Teilnehmer');
    const cols = [{ w: 80, t: 'Firma' }, { w: 75, t: 'Name' }, { w: 25, t: 'anwesend' }];
    const row = (vals, bold) => {
      font(9.5, bold ? 'bold' : 'normal', bold ? MUTED : INK);
      const cells = vals.map((v, i) => lines(v, cols[i].w - 2));
      const hgt = Math.max(...cells.map((c) => c.length)) * lh(9.5) + 1.2;
      ensure(hgt);
      let x = PAGE.l;
      cells.forEach((c, i) => {
        doc.text(c, x, y, { baseline: 'top' });
        x += cols[i].w;
      });
      y += hgt;
    };
    row(cols.map((c) => c.t), true);
    for (const t of p.participants) row([t.company, t.name, t.present ? 'ja' : 'nein'], false);
  }

  if (p.distribution.length) {
    heading('Verteiler');
    para(p.distribution.map((d) => `${d.name || d.email} (${d.company})`).join(', '), 9, 'normal', MUTED);
  }

  if (p.generalNotes) {
    heading('Allgemeines');
    para(p.generalNotes, 10);
  }

  // ---------- Punkte ----------
  const tableHeader = () => {
    font(9, 'bold', MUTED);
    let x = PAGE.l;
    for (const c of COLS) {
      doc.text(c.title, x, y, { baseline: 'top' });
      x += c.w;
    }
    y += lh(9) + 0.5;
    doc.setDrawColor(170);
    doc.line(PAGE.l, y, PAGE.l + CW, y);
    y += 1.5;
  };

  for (const section of p.sections) {
    heading(section.title);
    tableHeader();
    for (const r of section.rows) drawRow(r);
  }

  function drawRow(r) {
    // Inhalt als Folge von Textstücken mit eigener Formatierung
    const parts = [];
    parts.push({ text: `${r.type}: ${r.text || '(ohne Text)'}`, size: 10, style: 'normal', color: INK });
    for (const hEntry of r.history) parts.push({ text: `${hEntry.date}: ${hEntry.note}`, size: 9, style: 'italic', color: MUTED });
    if (r.note) parts.push({ text: `${p.date}: ${r.note}`, size: 10, style: 'bold', color: INK });
    if (r.unclear) parts.push({ text: '[unklar - bitte ergänzen]', size: 9.5, style: 'bold', color: PURPLE });
    if (r.attachments.length) parts.push({ text: `siehe ${r.attachments.map((a) => a.label).join(', ')}`, size: 9, style: 'normal', color: MUTED });

    const contentW = COLS[1].w - 2;
    const contentLines = [];
    for (const part of parts) {
      font(part.size, part.style);
      for (const ln of doc.splitTextToSize(clean(part.text), contentW)) contentLines.push({ ...part, text: ln });
    }
    font(9.5);
    const side = {
      no: [{ text: r.no, style: 'bold', color: INK }],
      company: lines(r.company || '-', COLS[2].w - 2).map((t) => ({ text: t, style: 'normal', color: INK })),
      due: [{ text: r.due || '-', style: r.overdue ? 'bold' : 'normal', color: r.overdue ? WARN : INK }]
        .concat(r.overdue ? [{ text: 'überfällig', style: 'bold', color: WARN }] : []),
      status: lines(r.status, COLS[4].w - 2).map((t) => ({ text: t, style: 'normal', color: INK })),
    };
    const sideH = Math.max(...Object.values(side).map((v) => v.length)) * lh(9.5);

    let i = 0;
    let first = true;
    while (i < contentLines.length || first) {
      const room = PAGE.h - PAGE.b - y;
      const need = first ? Math.max(sideH, lh(10) * 2) : lh(10) * 2;
      if (room < need) {
        newPage();
        tableHeader();
        continue;
      }
      // so viele Inhaltszeilen wie auf die Seite passen
      const startY = y;
      let cy = y;
      while (i < contentLines.length && cy + lh(contentLines[i].size) <= PAGE.h - PAGE.b) {
        const ln = contentLines[i];
        font(ln.size, ln.style, ln.color);
        doc.text(ln.text, PAGE.l + COLS[0].w, cy, { baseline: 'top' });
        cy += lh(ln.size);
        i++;
      }
      if (first) {
        let x = PAGE.l;
        for (const c of COLS) {
          if (c.key !== 'content') {
            let sy = startY;
            for (const s of side[c.key]) {
              font(9.5, s.style, s.color);
              doc.text(clean(s.text), x, sy, { baseline: 'top' });
              sy += lh(9.5);
            }
          }
          x += c.w;
        }
        cy = Math.max(cy, startY + sideH);
      }
      y = cy + 1.5;
      first = false;
      if (i < contentLines.length) {
        newPage();
        tableHeader();
      }
    }
    doc.setDrawColor(225);
    doc.line(PAGE.l, y, PAGE.l + CW, y);
    y += 2;
  }

  if (!p.sections.length) para('Keine Punkte erfasst.', 10, 'italic', MUTED);

  // ---------- Schluss ----------
  y += 4;
  if (draft) {
    para('VORABZUG - nicht freigegeben. Bitte Ergänzungen, insbesondere zu den als [unklar] markierten Punkten, an den Verfasser.', 9.5, 'bold', WARN);
  } else {
    para(p.objection, 9.5, 'normal', INK);
  }

  // ---------- Anlagen ----------
  const figs = p.figures.filter((f) => images.has(f.id));
  if (figs.length) {
    newPage();
    heading('Anlagen');
    for (const f of figs) {
      const img = images.get(f.id);
      const maxW = CW;
      const maxH = 105; // zwei Abbildungen pro Seite
      const s = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * s;
      const hgt = img.height * s;
      ensure(hgt + 12);
      font(9.5, 'bold');
      doc.text(clean(`${f.label}${f.caption ? `: ${f.caption}` : ''}`), PAGE.l, y, { baseline: 'top' });
      y += lh(9.5) + 1;
      doc.addImage(img.dataUrl, 'JPEG', PAGE.l, y, w, hgt, f.id, 'FAST');
      y += hgt + 6;
    }
  }

  // ---------- Kopf-/Fußzeilen, Wasserzeichen ----------
  const total = doc.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    doc.setPage(n);
    font(8.5, 'normal', MUTED);
    doc.text(clean(p.projectName), PAGE.l, 10, { baseline: 'top' });
    doc.text(clean(`${p.title} vom ${p.date}`), PAGE.w - PAGE.r, 10, { baseline: 'top', align: 'right' });
    doc.setDrawColor(200);
    doc.line(PAGE.l, 15, PAGE.w - PAGE.r, 15);
    doc.text(draft ? 'Vorabzug' : clean(p.version), PAGE.l, PAGE.h - 10, { baseline: 'bottom' });
    doc.text(`Seite ${n} von ${total}`, PAGE.w - PAGE.r, PAGE.h - 10, { baseline: 'bottom', align: 'right' });
    if (draft) {
      doc.saveGraphicsState();
      try {
        doc.setGState(new doc.GState({ opacity: 0.1 }));
        font(90, 'bold', [180, 60, 20]);
      } catch {
        font(90, 'bold', [245, 228, 220]);
      }
      // um die Seitenmitte gedreht: Startpunkt so wählen, dass die Textmitte in der Seitenmitte liegt
      const half = doc.getTextWidth('VORABZUG') / 2;
      const r = Math.PI / 4;
      doc.text('VORABZUG', PAGE.w / 2 - half * Math.cos(r), PAGE.h / 2 + half * Math.sin(r), { angle: 45 });
      doc.restoreGraphicsState();
    }
  }

  return doc.output('blob');
}
