// sw.js: lets the app open without internet. Network first (so updates arrive as soon as
// they are uploaded), the saved copy is used only when the network is not available.
// Google and Drive requests are never touched here.

const CACHE = 'shiftlog-v2';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'config.js',
  'version.js',
  'calc.js',
  'settings.js',
  'store.js',
  'drive.js',
  'backup.js',
  'autobackup.js',
  'ctx.js',
  'dom.js',
  'strings.js',
  'ui-common.js',
  'ui-shifts.js',
  'ui-entry.js',
  'ui-datetime.js',
  'ui-work.js',
  'ui-backup.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    // no-cache: always ask the server whether the file changed (GitHub Pages keeps files for ~10 min)
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))),
  );
});
