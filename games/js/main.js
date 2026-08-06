"use strict";
/* ============================================================
   DATA BREAK — bootstrap
   Initializes subsystems, shows loading, registers PWA.
   ============================================================ */
(function () {
  "use strict";

  const R = window.BREAK;

  // Release version. IMPORTANT: bump this on EVERY release — it is baked
  // into the service worker registration URL (?v=) so the browser reinstalls
  // the worker and the previous build's offline cache is dropped
  // automatically. Forgetting the bump leaves the cache-first worker serving
  // stale assets indefinitely, so treat it as a required release step.
  const DR_VERSION = "24";

  function boot() {
    // settings-driven audio state
    R.Audio.setMusic(R.Save.setting("music"));
    R.Audio.setSfx(R.Save.setting("sfx"));
    // reveal the overlay container (screens toggle individually)
    document.getElementById("screens").classList.remove("hidden");

    // UI + engine
    R.UI.init(R.Engine);
    R.Engine.init();

    // loading screen -> title
    const bar = document.getElementById("boot-progress");
    let p = 0;
    const iv = setInterval(() => {
      p += 18;
      bar.style.width = Math.min(100, p) + "%";
      if (p >= 100) {
        clearInterval(iv);
        const loading = document.getElementById("screen-loading");
        loading.classList.add("hidden");
        R.UI.show("title");
        R.Audio.playSong("menu");
      }
    }, 60);

    // title screen background intensity (engine handles via state)
    R.UI.setPauseVisible(false);

    // PWA: register service worker when served over http(s). The ?v= query
    // version-stamps the script URL so each release invalidates the offline
    // cache (sw.js reads it and names its cache accordingly).
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js?v=" + DR_VERSION).catch((err) => {
          // Log SW failures loudly: a failed install (e.g. a 404 in the
          // precache list) otherwise silently pins users to the old cache.
          console.warn("[DATA BREAK] service worker failed to register:", err);
        });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
