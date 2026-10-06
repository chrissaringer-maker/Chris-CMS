const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Minimal-Markup, bewusst ohne rohes HTML: "# " = Überschrift, Leerzeile = Absatz. Alles wird escaped.
export function renderContent(text) {
  return text.split(/\n{2,}/).map((block) => {
    const b = block.trim();
    if (!b) return '';
    if (b.startsWith('## ')) return `<h2>${esc(b.slice(3))}</h2>`;
    if (b.startsWith('# ')) return `<h1>${esc(b.slice(2))}</h1>`;
    return `<p>${esc(b).replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}

const layout = (title, body) => `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>body{font:18px/1.6 system-ui,sans-serif;max-width:42rem;margin:0 auto;padding:1.5rem 1rem}nav a{margin-right:1rem}</style>
</head><body><nav><a href="/">Start</a><a href="/admin">Admin</a></nav>${body}</body></html>`;

export const pageHtml = (page) => layout(page.title, `<h1>${esc(page.title)}</h1>\n${renderContent(page.content)}`);
export const indexHtml = (pages) => layout('Seiten', `<h1>Seiten</h1><ul>${pages.map((p) => `<li><a href="/p/${esc(p.slug)}">${esc(p.title)}</a></li>`).join('')}</ul>${pages.length ? '' : '<p>Noch keine veröffentlichten Seiten.</p>'}`);
export const notFoundHtml = () => layout('Nicht gefunden', '<h1>404</h1><p>Seite nicht gefunden.</p>');
