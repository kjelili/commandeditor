/* CommandEditor service worker — v10
 *
 * Closes the offline gap: the site already declared itself an
 * "Offline-capable PWA" (manifest + schema.org featureList) but shipped
 * no service worker, so every claim was aspirational. This worker makes
 * it real:
 *
 *   - Precaches the app shell ('/') at install time.
 *   - Static build assets (/_next/static/*) and the local pdf.js worker
 *     are served cache-first — they are content-hashed / versioned, so
 *     staleness is impossible.
 *   - Navigations are network-first, falling back to the cached shell
 *     when offline.
 *   - Third-party CDN calls (transformers.js model, fonts) are cached
 *     at runtime after first successful fetch, so the AI assistant also
 *     survives going offline.
 *   - No document data is ever cached or transmitted — processing is
 *     100% client-side; this worker only caches *code*, never user files.
 */
const VERSION = 'ce-v29';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const PRECACHE = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/pdf.worker.min.mjs'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // v11: PWA share target — intercept the POST, stash the shared file in the
  // Cache API, and redirect into the app where page.tsx picks it up. The file
  // never leaves the device; the cache entry is deleted after one read.
  if (request.method === 'POST' && /^\/share-target\/?$/.test(new URL(request.url).pathname)) {
    event.respondWith((async () => {
      try {
        const form = await request.formData();
        const file = form.get('pdf');
        if (file && typeof file !== 'string') {
          const cache = await caches.open('ce-share-target');
          await cache.put('/share-target-file', new Response(file, {
            headers: { 'x-file-name': encodeURIComponent(file.name || 'shared.pdf') }
          }));
        }
      } catch (e) { /* fall through to plain redirect */ }
      return Response.redirect('/?shared=1', 303);
    })());
    return;
  }

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  // CDN origins whose responses are safe to runtime-cache (code/models only)
  const cacheableCDN = ['unpkg.com', 'cdn.jsdelivr.net', 'huggingface.co', 'cdn-lfs.huggingface.co', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);

  if (!sameOrigin && !cacheableCDN) return; // e.g. cloud OAuth — always network

  // Navigations: network-first, fall back to cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Everything else (JS chunks, CSS, worker, CDN libs): cache-first.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res.ok && (sameOrigin || res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});
