// Offline-Fähigkeit mit festen Versionen: Jede Version wird vollständig vorab geladen und dann
// ausschließlich aus ihrem eigenen Cache ausgeliefert (kein Mischbetrieb alter und neuer Dateien).
// Eine neue Version wartet, bis in der App „Neu starten“ getippt wird – nie mitten in der Besprechung.
const VERSION = '2026-10-06-feldtest-1b';
const CACHE = `bp-${VERSION}`;
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/ui.js', './js/db.js', './js/store.js', './js/model.js', './js/backup.js',
  './js/images.js', './js/sketch.js', './js/pdf.js', './js/meeting.js', './js/dictation.js',
  './vendor/jspdf.umd.min.js', './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Seitenaufruf (auch mit #…): immer die App-Hülle dieser Version
    if (req.mode === 'navigate') return (await cache.match('./index.html')) ?? fetch(req);
    return (await cache.match(req, { ignoreSearch: true })) ?? fetch(req);
  })());
});
