import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db.js';
import { ensureAdmin, login, logout, requireAuth } from './auth.js';
import { pageHtml, indexHtml, notFoundHtml } from './render.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

function validatePage(body) {
  const { slug, title, content = '', published = false } = body ?? {};
  if (typeof slug !== 'string' || !SLUG.test(slug) || slug.length > 80) return { error: 'Ungültiger Slug (nur a-z, 0-9 und Bindestrich)' };
  if (typeof title !== 'string' || !title.trim() || title.length > 200) return { error: 'Titel fehlt oder ist zu lang' };
  if (typeof content !== 'string' || content.length > 200_000) return { error: 'Inhalt ungültig oder zu lang' };
  return { value: { slug, title: title.trim(), content, published: published ? 1 : 0 } };
}

export function createApp(db = openDb()) {
  ensureAdmin(db);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // CSRF-Schutz: POST/PUT/PATCH müssen JSON sein (Formular-Posts von Fremdseiten scheitern daran).
  // DELETE löst bei Fremdseiten einen CORS-Preflight aus und wird dort ohne CORS-Freigabe geblockt.
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type muss application/json sein' });
    }
    next();
  });

  const auth = requireAuth(db);

  // --- Auth ---
  const attempts = new Map(); // einfache Bremse gegen Passwort-Raten, pro IP
  app.post('/api/login', (req, res) => {
    const key = req.ip;
    const a = attempts.get(key) ?? { n: 0, until: 0 };
    if (a.n >= 5 && Date.now() < a.until) return res.status(429).json({ error: 'Zu viele Versuche, bitte später erneut' });
    const user = login(db, res, String(req.body?.username ?? ''), String(req.body?.password ?? ''));
    if (!user) {
      attempts.set(key, { n: a.n + 1, until: Date.now() + 60_000 });
      return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
    }
    attempts.delete(key);
    res.json(user);
  });
  app.post('/api/logout', (req, res) => { logout(db, req, res); res.json({ ok: true }); });
  app.get('/api/me', auth, (req, res) => res.json(req.user));

  // --- Seiten (Admin-API) ---
  app.get('/api/pages', auth, (req, res) => {
    res.json(db.prepare('SELECT id, slug, title, published, updated_at FROM pages ORDER BY updated_at DESC').all());
  });
  app.get('/api/pages/:id', auth, (req, res) => {
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    page ? res.json(page) : res.status(404).json({ error: 'Nicht gefunden' });
  });
  app.post('/api/pages', auth, (req, res) => {
    const { value, error } = validatePage(req.body);
    if (error) return res.status(400).json({ error });
    try {
      const r = db.prepare('INSERT INTO pages (slug, title, content, published) VALUES (?, ?, ?, ?)')
        .run(value.slug, value.title, value.content, value.published);
      res.status(201).json(db.prepare('SELECT * FROM pages WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) {
      if (/UNIQUE/.test(e.message)) return res.status(409).json({ error: 'Slug existiert bereits' });
      throw e;
    }
  });
  app.put('/api/pages/:id', auth, (req, res) => {
    const { value, error } = validatePage(req.body);
    if (error) return res.status(400).json({ error });
    try {
      const r = db.prepare("UPDATE pages SET slug = ?, title = ?, content = ?, published = ?, updated_at = datetime('now') WHERE id = ?")
        .run(value.slug, value.title, value.content, value.published, req.params.id);
      if (!r.changes) return res.status(404).json({ error: 'Nicht gefunden' });
      res.json(db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id));
    } catch (e) {
      if (/UNIQUE/.test(e.message)) return res.status(409).json({ error: 'Slug existiert bereits' });
      throw e;
    }
  });
  app.delete('/api/pages/:id', auth, (req, res) => {
    const r = db.prepare('DELETE FROM pages WHERE id = ?').run(req.params.id);
    r.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Nicht gefunden' });
  });

  // --- Öffentliche Seiten ---
  app.get('/', (req, res) => {
    res.type('html').send(indexHtml(db.prepare('SELECT slug, title FROM pages WHERE published = 1 ORDER BY title').all()));
  });
  app.get('/p/:slug', (req, res) => {
    const page = db.prepare('SELECT * FROM pages WHERE slug = ? AND published = 1').get(req.params.slug);
    page ? res.type('html').send(pageHtml(page)) : res.status(404).type('html').send(notFoundHtml());
  });

  // --- Admin-Oberfläche (statisch) ---
  app.use('/admin', express.static(publicDir, { index: 'admin.html' }));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ungültiges JSON' });
    console.error(err);
    res.status(500).json({ error: 'Interner Fehler' });
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, process.env.HOST || '0.0.0.0', () => console.log(`CMS läuft auf http://localhost:${port}  (Admin: /admin)`));
}
