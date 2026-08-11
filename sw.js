// Siege service worker — cache-first app shell for offline PWA play.
const CACHE = 'siege-v6';
// Precache the app shell. The three.js module (vendored lib/ copy or CDN,
// whichever index.html picked) is cached at runtime on first fetch.
const ASSETS = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'js/main.js',
  'js/config.js',
  'js/maps.js',
  'js/enemies.js',
  'js/weapons.js',
  'js/projectiles.js',
  'js/effects.js',
  'js/slingshot.js',
  'js/audio.js',
  'js/ui.js',
  'assets/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        // cache same-origin assets and the three.js CDN modules for offline play
        const url = new URL(e.request.url);
        if (res.ok && (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net')) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
