/* =========================================================================
   PORT MAPPER — debug-reload.js (translator tooling, NOT shipped logic)
   -------------------------------------------------------------------------
   Hot-reload for the strings table. Open the game with ?debug=1 and this
   script watches js/strings.js: the moment you save an edit it reloads the
   page, so a translator sees their change without touching the browser.

   Why reload instead of patching the table live? Every module snapshots
   PM.STR.T into its own constants at boot (config builds DIFF/POWERUPS from
   it, ui/render/game keep a local STR). A live patch would miss those —
   a page reload re-applies the whole table through the one real code path.

   There is no polling while the tab is hidden, and the fetch is a cheap
   no-store HEAD-style GET with a timestamp query, so the overhead is nil.
   ========================================================================= */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  if (params.get('debug') !== '1') return;          // normal play: no watcher
  if (location.protocol !== 'http:' && location.protocol !== 'https:') {
    console.log('[hot-reload] needs an http server (file:// cannot fetch)');
    return;
  }
  if (!window.PM || !PM.STR) return;

  PM.STR.setDebug(true);

  // The strings file URL — reuse the same cache-bust version as the script
  // tags in index.html so the watcher and the game always fetch the same file.
  var SCRIPT = (document.querySelector('script[src*="strings.js"]') || {}).src;
  if (!SCRIPT) return;

  var lastHash = sessionStorage.getItem('pm_str_hash') || null;
  var armedAt = Date.now();
  var flashing = lastHash !== null;   // a reload just happened — show the flash

  var HASH = function (s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  };

  function buildIndicator() {
    var el = document.createElement('div');
    el.id = 'str-reload';
    el.innerHTML = '<span class="sr-dot"></span><span class="sr-text"></span>';
    document.body.appendChild(el);
    return {
      root: el,
      text: el.querySelector('.sr-text'),
    };
  }
  var ind = buildIndicator();
  ind.root.classList.add('armed');
  ind.text.textContent = 'HOT-RELOAD ARMED · EDIT js/strings.js';
  if (flashing) ind.root.classList.add('flash');

  function check() {
    if (document.hidden) { setTimeout(check, 1200); return; }   // skip while away
    // timestamp query defeats every cache without touching ?v=
    fetch(SCRIPT + (SCRIPT.indexOf('?') >= 0 ? '&' : '?') + '_hr=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (src) {
        var h = HASH(src);
        if (lastHash === null) {
          lastHash = h;                       // first check: just arm
          sessionStorage.setItem('pm_str_hash', h);
          ind.text.textContent = 'HOT-RELOAD ARMED · EDIT js/strings.js (' + h.slice(0, 6) + ')';
        } else if (h !== lastHash) {
          // the translator saved an edit — reload so the new table applies
          console.log('[hot-reload] strings.js changed ' + lastHash.slice(0, 6) + ' -> ' + h.slice(0, 6));
          location.reload();
          return;
        } else {
          ind.text.textContent = 'HOT-RELOAD ARMED · EDIT js/strings.js (' + h.slice(0, 6) + ')';
        }
      })
      .catch(function (err) {
        console.log('[hot-reload] poll failed: ' + err.message);
      })
      .then(function () { setTimeout(check, 1000); });
  }

  // Wait for the game to boot, then arm the first poll.
  setTimeout(check, 400);

  // Clear the session marker after a while so the next manual load doesn't
  // flash "reloaded" — the flash only makes sense right after a reload.
  setTimeout(function () {
    sessionStorage.removeItem('pm_str_hash');
    if (ind.root.classList.contains('flash')) ind.root.classList.remove('flash');
  }, 1500);
})();
