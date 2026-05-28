/* Cuban Tank service worker - stale-while-revalidate */
const VERSION = 'ct-2026-05-28-v1';
const STATIC = [
  './',
  './index.html',
  './styles.css',
  './privacy.html',
  './terms.html',
  './cubanktanklogo.jpg',
  './favicon-32.png',
  './favicon-192.png',
  './apple-touch-icon.png',
  './CrisHeroPage.jpg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(STATIC)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept the n8n webhook - leads must always go to the network
  if (url.hostname.includes('n8n.cloud')) return;

  // Only handle same-origin + Google Fonts (gstatic) traffic
  const sameOrigin = url.origin === self.location.origin;
  const isFontCDN = url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com';
  if (!sameOrigin && !isFontCDN) return;

  // Stale-while-revalidate: serve cache if present, then refresh in background
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then(resp => {
        if (resp && resp.ok && resp.type !== 'opaque') {
          cache.put(req, resp.clone()).catch(() => {});
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
