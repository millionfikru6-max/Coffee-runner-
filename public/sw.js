/**
 * Coffee Runner service worker.
 *
 * The game ships as a single inlined HTML bundle, so the caching strategy is
 * deliberately simple but has to get two things right that the previous
 * version got wrong:
 *
 *  1. **Navigations must be network-first.** The old worker was cache-first
 *     for everything, which meant a returning player could be pinned to a
 *     stale build forever — no update would ever reach them.
 *  2. **Never cache a partial response.** Only complete, OK, basic responses
 *     are stored, so a flaky connection can't poison the offline copy.
 *
 * Static assets stay cache-first (they're content-hashed or immutable), with
 * a background refresh so the next load is current.
 */

const VERSION = 'v3';
const CACHE = `coffee-runner-${VERSION}`;
const CORE = [
  './',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll is atomic — one 404 would reject the whole install and leave
      // the player with no offline copy at all, so add individually.
      .then((cache) => Promise.all(CORE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Only store responses we know are complete and reusable. */
function isCacheable(res) {
  return res && res.status === 200 && res.type === 'basic';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navigations: network-first so updates actually ship, cache as fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isCacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./').then((hit) => hit || caches.match(req))),
    );
    return;
  }

  // Hashed build assets are immutable: serve straight from cache, and only
  // hit the network the first time we see one. This is what makes the
  // three.js chunk a one-time download across every future update.
  const immutable = /\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?)$/.test(url.pathname);
  if (immutable) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (isCacheable(res)) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else: cache-first with a quiet background refresh.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (isCacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});

// Let the page trigger an immediate update after a new worker installs.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
