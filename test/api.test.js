import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';

process.env.ADMIN_PASSWORD = 'test-pw-123';
let server, base, cookie = '';

before(async () => {
  const app = createApp(openDb(':memory:'));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = (path, method = 'GET', body) => fetch(base + path, {
  method,
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

test('API ohne Login ist gesperrt', async () => {
  assert.equal((await call('/api/pages')).status, 401);
});

test('Login mit falschem Passwort scheitert', async () => {
  assert.equal((await call('/api/login', 'POST', { username: 'admin', password: 'falsch' })).status, 401);
});

test('Login, CRUD und öffentliche Anzeige', async () => {
  const l = await call('/api/login', 'POST', { username: 'admin', password: 'test-pw-123' });
  assert.equal(l.status, 200);
  cookie = l.headers.get('set-cookie').split(';')[0];

  const c = await call('/api/pages', 'POST', { slug: 'hallo', title: 'Hallo', content: '# Titel\n\n<script>alert(1)</script>', published: false });
  assert.equal(c.status, 201);
  const page = await c.json();

  // Entwurf ist öffentlich nicht sichtbar
  assert.equal((await fetch(`${base}/p/hallo`)).status, 404);

  const u = await call(`/api/pages/${page.id}`, 'PUT', { slug: 'hallo', title: 'Hallo', content: page.content, published: true });
  assert.equal(u.status, 200);

  const html = await (await fetch(`${base}/p/hallo`)).text();
  assert.match(html, /<h1>Titel<\/h1>/);
  assert.ok(!html.includes('<script>alert'), 'Inhalt muss escaped werden');
  assert.match(await (await fetch(base + '/')).text(), /href="\/p\/hallo"/);

  assert.equal((await call(`/api/pages/${page.id}`, 'DELETE')).status, 200);
  assert.equal((await fetch(`${base}/p/hallo`)).status, 404);
});

test('Validierung und doppelter Slug', async () => {
  assert.equal((await call('/api/pages', 'POST', { slug: 'Ungültig!', title: 'x' })).status, 400);
  assert.equal((await call('/api/pages', 'POST', { slug: 'a', title: 'A' })).status, 201);
  assert.equal((await call('/api/pages', 'POST', { slug: 'a', title: 'B' })).status, 409);
});

test('Schreibzugriffe ohne JSON werden abgelehnt (CSRF)', async () => {
  const r = await fetch(`${base}/api/pages`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(r.status, 415);
});

test('Admin-Oberfläche wird ausgeliefert', async () => {
  const r = await fetch(`${base}/admin/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /CMS Admin/);
});
