/* ============================================================
   DATA BREAK — service worker
   Cache-first for offline play. Only active over http(s).

   Cache invalidation: the cache name embeds a version read from
   the ?v= query baked into the registration URL (see js/main.js).
   Bump DR_VERSION there on every release — the browser sees a new
   script URL, reinstalls this worker, and the activate handler
   below deletes the previous build's cache automatically.
   ============================================================ */
"use strict";

// Version from the registration query (js/main.js DR_VERSION). The fallback
// only fires on query-less direct loads; the real build always passes ?v=.
const VERSION = new URL(self.location.href).searchParams.get("v") || "2";
const CACHE = "data-break-v" + VERSION;
// Versioned asset URLs: index.html loads scripts with ?v=<VERSION> (see the
// script tags there), so the precache must key on the same URLs or the
// cache-first fetch handler would miss and always hit the network.
const Q = "?v=" + VERSION;
const ASSETS = [
  "./",
  "./data-break.html",
  "./css/style.css" + Q,
  "./manifest.webmanifest",
  "./icon.svg",
  "./js/config.js" + Q,
  "./js/util.js" + Q,
  "./js/save.js" + Q,
  "./js/audio.js" + Q,
  "./js/input.js" + Q,
  "./js/art.js" + Q,
  "./js/particles.js" + Q,
  "./js/background.js" + Q,
  "./js/ships.js" + Q,
  "./js/scrubbers.js" + Q,
  "./js/bricks.js" + Q,
  "./js/powerups.js" + Q,
  "./js/hazards.js" + Q,
  "./js/boss.js" + Q,
  "./js/levels.js" + Q,
  "./js/engine.js" + Q,
  "./js/ui.js" + Q,
  "./js/main.js" + Q
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Navigation requests are network-first: a returning user must get the
  // freshly deployed index.html (with the new ?v= script tags) so main.js
  // registers sw.js?v=<new> and the activate handler drops the old cache.
  // Cache-first on navigations would keep serving the stale cached HTML with
  // old version tags forever, defeating the version-bump invalidation chain.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});
