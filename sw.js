// Siege service worker — cache-first app shell for offline PWA play.
const CACHE = 'siege-v1';
const ASSETS = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'lib/three.module.min.js',
  'lib/three.core.min.js',
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
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
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
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
