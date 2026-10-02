/* Ntiyiso service worker.
 *
 * Why this exists: the people most likely to be targeted by a remittance scam
 * are the people with the least reliable data. The checker has to work in a
 * taxi rank with no signal, because that is exactly where somebody is about to
 * hand over money. The engine already runs in the browser; this makes the shell
 * around it survive a dead connection.
 *
 * What this must never do: cache a verdict. A stale "this looks fine" is worse
 * than no answer at all, so every request to the API goes straight to the
 * network and never touches the cache. If the network is gone the client's own
 * apiRequest() sees the failure and runs the local engine instead, which is a
 * fresh calculation with the same rules rather than a remembered answer.
 */

const VERSION = 'ntiyiso-shell-v1';

/* The whole app, so a first visit while connected makes it work offline after.
 * Every screen is listed because each is its own document with its own script;
 * a cache miss on any of them turns an offline launch into a browser error
 * page rather than the app. */
const SHELL = [
  '/',
  '/app/check',
  '/app/send',
  '/app/library',
  '/app/alerts',
  '/app/checking',
  '/app/verdict',
  '/app/history',
  '/app/settings',
  '/auth/login',
  '/auth/signup',

  '/shared/css/base.css',
  '/shared/css/customer.css',
  '/shared/js/customer.js',

  '/app/check/script.js',
  '/app/send/script.js',
  '/app/library/script.js',
  '/app/alerts/script.js',
  '/app/checking/script.js',
  '/app/verdict/script.js',
  '/app/history/script.js',
  '/app/settings/script.js',

  '/auth/login/styles.css',
  '/auth/login/script.js',
  '/auth/signup/styles.css',
  '/auth/signup/script.js',

  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon-maskable.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      /* One missing file must not fail the whole install. addAll() is atomic,
       * so a single 404 here would leave the app with no offline support at
       * all — which is the opposite of the point of this file. */
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== VERSION)
             .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

/* Verdicts, session state and the fraud-desk data are never cached. */
function isVolatile(url) {
  return url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/desk/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  /* Anything the browser handles itself — a range request for media, a
   * non-GET, a cross-origin URL — is left completely alone. */
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  /* Verdicts go to the network, always. */
  if (isVolatile(url)) return;

  const accept = request.headers.get('accept') || '';
  const wantsHtml = accept.indexOf('text/html') !== -1;

  /* Documents: cache first, then the network, so an offline launch works and a
   * connected visit refreshes what it can. */
  if (wantsHtml) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          /* Only a real answer is worth storing, and the response has to be
           * cloned before the body is handed on. */
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }).catch(() => cached || caches.match('/app/check'));
        return cached || network;
      })
    );
    return;
  }

  /* Styles, scripts, icons: cache first. They are versioned by the cache name,
   * so a rebuild ships with a new cache and the old one is dropped on
   * activate. */
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});

/* Lets the settings screen tell the truth about what is stored offline. */
self.addEventListener('message', (event) => {
  if (event.data === 'cache-status' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ cache: VERSION, shell: SHELL.length });
  }
});
