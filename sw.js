/* ===== Onyx Systems Service Worker =====
   Freshness + offline for onyxpc.us. GitHub Pages exposes no server headers, so
   this SW is the content-level cache control.

   Strategy per request type (same-origin GET only):
   - HTML navigations  -> network-first   (always fresh online; cached copy offline)
   - games.json + any other JSON/data -> network-first (daily content never goes stale)
   - static assets (images/css/js/fonts/media) -> stale-while-revalidate (instant
     paint from cache, refreshed in the background on every visit)

   Deploy note: the cache name below carries the build date. Leaving it in place
   is fine (SWR self-heals assets), but bump it when you want a clean slate of
   cached images. Keep it in sync with <meta name="onyx-build"> in the pages. */

var CACHE = 'onyx-v20260826';

self.addEventListener('install', function (e) {
  // Pre-cache the entry page so the site works offline after the first visit.
  // addAll is best-effort — a failure must never block installation.
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(['/', '/index.html']); })
      .catch(function () {})
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  // Drop every old cache version so a bumped CACHE name = forced refresh.
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

var STATIC_RE = /\.(css|js|mjs|webp|png|jpg|jpeg|gif|svg|ico|avif|woff2?|ttf|eot|mp4|webm|mp3|ogg)(\?.*)?$/i;

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                 // never touch POSTs/forms
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;  // same-origin only

  if (STATIC_RE.test(url.pathname)) {
    // Stale-while-revalidate: serve the cached copy immediately, refresh it in
    // the background so the next visit has the newest version.
    e.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) {
          fetch(req).then(function (res) {
            if (res && res.ok) {
              var c = res.clone();
              caches.open(CACHE).then(function (ca) { return ca.put(req, c); });
            }
          }).catch(function () {});
          return hit;
        }
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var c = res.clone();
            caches.open(CACHE).then(function (ca) { return ca.put(req, c); });
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first for HTML + JSON + everything else: fresh when online, cache
  // (or the entry page) as the offline fallback.
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var c = res.clone();
        caches.open(CACHE).then(function (ca) { return ca.put(req, c); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match('/index.html'); });
    })
  );
});
