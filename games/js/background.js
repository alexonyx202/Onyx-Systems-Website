"use strict";
/* ============================================================
   DATA BREAK — animated background
   Grid floor, circuit traces, nebula glow, data packets,
   floating binary, digital rain, CRT scanlines.
   Rendering is split into a cached static backdrop (base
   gradient, grid, circuits, stars) redrawn only on resize or
   world change, plus lightweight animated layers. Rain columns
   and packet streaks are pre-rendered to tiny sprite canvases
   so a frame is mostly drawImage blits instead of hundreds of
   per-character fillText / per-streak gradient calls.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const U = R.Util;
  let w = 0, h = 0;
  let baseCanvas = null;     // static vertical gradient backdrop
  let decorCanvas = null;    // static grid + circuit traces + stars
  let vignetteCanvas = null; // static vignette, rebuilt on resize
  let scanPattern = null;
  let binary = [];       // {x, y, text, speed, hue}
  let rain = [];         // {x, y, len, speed, chars, sprite}
  let nebula = [];       // {x, y, r, hue, dx, dy, seed}
  let packets = [];      // {y, speed, len, hue, phase}
  let packetSprites = []; // 2 cached streak sprites (world hue + offset hue)
  let nebulaSprites = {}; // hue -> baked radial blob sprite (created lazily)
  const stars = [];

  // per-world accent: each sector tints the backdrop (grid, circuit,
  // nebula, data streams) so a run reads as a journey through the system
  const WORLD_HUES = [190, 205, 160, 250, 275, 315, 268, 350];
  let worldHue = 190;
  let worldIdx = 0;

  function density() {
    return R.Save.quality().bgDensity || 1;
  }
  function glowOn() {
    return R.Save.quality().glow !== false;
  }

  function init() {
    resize();
    buildStars(50);
    // resize() baked the decor canvas before stars existed — re-bake so the
    // starfield is present on the very first frame (not just after a resize)
    drawStatic();
    rebuild();
  }

  // (re)build the animated layers — called at boot and on world changes
  function rebuild() {
    const d = density();
    buildBinary(Math.round(40 * d));
    buildRain(Math.round(24 * d));
    buildNebula(Math.round(5 * d));
    buildPackets(Math.round(7 * d));
  }

  // recolor the backdrop for a world index (0-7)
  function setWorld(idx) {
    worldIdx = Math.max(0, Math.min(WORLD_HUES.length - 1, idx || 0));
    worldHue = WORLD_HUES[worldIdx];
    drawStatic();
    buildPacketSprites();
    nebula = []; binary = []; packets = []; rain = [];
    rebuild();
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    if (!baseCanvas) {
      // not initialized yet (engine boots before background in some paths)
      baseCanvas = document.createElement("canvas");
      decorCanvas = document.createElement("canvas");
      vignetteCanvas = document.createElement("canvas");
      buildPacketSprites();
      nebulaSprites = {};
    }
    baseCanvas.width = w;
    baseCanvas.height = h;
    decorCanvas.width = w;
    decorCanvas.height = h;
    vignetteCanvas.width = w;
    vignetteCanvas.height = h;
    drawStatic();
    drawVignette();
    // scanline pattern: 1px transparent, 1px dark, 1px transparent (CRT feel)
    const s = document.createElement("canvas");
    s.width = 1;
    s.height = 3;
    const sc = s.getContext("2d");
    sc.fillStyle = "rgba(0,0,0,0.22)";
    sc.fillRect(0, 1, 1, 1);
    scanPattern = sc.createPattern(s, "repeat");
  }

  // ---- static backdrop: base gradient + grid + circuits + stars ----
  // Rebuilt only on resize / world change; drawn as plain drawImage blits.
  function drawStatic() {
    // base vertical gradient
    const bctx = baseCanvas.getContext("2d");
    bctx.clearRect(0, 0, w, h);
    const g = bctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#030712");
    g.addColorStop(0.5, "#071120");
    g.addColorStop(1, "#0a0f1e");
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, w, h);

    // grid + circuits + stars share the decor layer
    const ctx = decorCanvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    // vertical perspective grid, tinted by the current world
    const horizon = h * 0.5;
    const step = 90;
    ctx.strokeStyle = `hsla(${worldHue},85%,60%,0.06)`;
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(w / 2 + (x - w / 2) * 0.25, horizon);
      ctx.stroke();
    }
    for (let y = h; y > horizon; y -= 46) {
      const t = (h - y) / (h - horizon);
      ctx.strokeStyle = `hsla(${worldHue},85%,60%,${0.03 + t * 0.05})`;
      ctx.beginPath();
      ctx.moveTo(w / 2 - (w / 2) * t, y);
      ctx.lineTo(w / 2 + (w / 2) * t, y);
      ctx.stroke();
    }
    // horizon glow line
    const hg = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 40);
    hg.addColorStop(0, `hsla(${worldHue},85%,60%,0)`);
    hg.addColorStop(0.5, `hsla(${worldHue},85%,60%,0.22)`);
    hg.addColorStop(1, `hsla(${worldHue},85%,60%,0)`);
    ctx.fillStyle = hg;
    ctx.fillRect(0, horizon - 40, w, 80);

    // circuit traces with nodes + vertical taps
    ctx.strokeStyle = `hsla(${(worldHue + 40) % 360},85%,65%,0.05)`;
    ctx.lineWidth = 1.5;
    const rowStep = 140;
    for (let y = 40 + Math.random() * 40; y < h; y += rowStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillStyle = `hsla(${(worldHue + 40) % 360},85%,65%,0.07)`;
      for (let x = 60 + Math.random() * 80; x < w; x += 130 + Math.random() * 90) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = `hsla(${worldHue},85%,60%,0.04)`;
    for (let x = 70 + Math.random() * 60; x < w; x += 200 + Math.random() * 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // stars (static twinkle-free layer — cheap blit beats 50 per-frame arcs)
    ctx.fillStyle = "rgba(200,225,255,0.5)";
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      ctx.globalAlpha = 0.3 + 0.4 * Math.sin(i);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // static vignette, rebuilt on resize
  function drawVignette() {
    const vctx = vignetteCanvas.getContext("2d");
    vctx.clearRect(0, 0, w, h);
    const v = vctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.5)");
    vctx.fillStyle = v;
    vctx.fillRect(0, 0, w, h);
  }

  // pre-rendered packet streak (fade tail -> bright head), per hue family
  function makeStreakSprite(hue) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 2;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, `hsla(${hue},90%,70%,0)`);
    grad.addColorStop(0.55, `hsla(${hue},90%,70%,0.36)`);
    grad.addColorStop(1, `hsla(${hue},95%,80%,1)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 2);
    return c;
  }

  function buildPacketSprites() {
    packetSprites = [makeStreakSprite(worldHue), makeStreakSprite((worldHue + 70) % 360)];
    // drop cached nebula blobs — they're keyed by hue, which just changed
    nebulaSprites = {};
  }

  // one baked radial glow sprite per hue (small, drawn scaled). Replacing
  // five full-screen radial gradient fills per frame with five small blits is
  // a big win on software/weak-GPU renderers, and looks identical at this size.
  function nebulaSprite(hue) {
    let spr = nebulaSprites[hue];
    if (spr) return spr;
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, `hsla(${hue},85%,50%,0.05)`);
    grad.addColorStop(0.6, `hsla(${hue},85%,45%,0.028)`);
    grad.addColorStop(1, "hsla(0,0%,0%,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    nebulaSprites[hue] = spr = c;
    return spr;
  }

  function buildStars(n) {
    for (let i = 0; i < n; i++) {
      stars.push({ x: U.rand(0, w), y: U.rand(0, h), r: U.rand(0.4, 1.6), tw: U.rand(1, 4) });
    }
  }

  function buildBinary(n) {
    for (let i = 0; i < n; i++) {
      binary.push({
        x: U.rand(0, w),
        y: U.rand(0, h),
        text: U.pick(["0", "1"]),
        speed: U.rand(8, 30),
        hue: U.chance(0.5) ? worldHue : (worldHue + 70) % 360
      });
    }
  }

  // bake one rain column's characters into its sprite canvas (bottom = head).
  // Called at build time and again on respawn so new chars show immediately.
  function bakeRainSprite(r) {
    const spr = document.createElement("canvas");
    spr.width = 12;
    spr.height = r.len * 14 + 4;
    const sc = spr.getContext("2d");
    sc.font = "12px monospace";
    sc.textAlign = "left";
    sc.textBaseline = "top";
    for (let c = 0; c < r.len; c++) {
      sc.fillStyle = c === 0 ? "rgba(34,211,238,0.75)" : `rgba(34,211,238,${0.22 * (1 - c / r.len)})`;
      sc.fillText(r.chars[c], 1, r.len * 14 - c * 14);
    }
    r.sprite = spr;
  }

  function buildRain(n) {
    for (let i = 0; i < n; i++) {
      const len = U.randInt(8, 22);
      const chars = [];
      // populate immediately so the first frame never draws "undefined"
      for (let c = 0; c < len; c++) chars.push(U.pick(["0", "1", "7", "A", "F", "C", "8"]));
      const r = {
        x: U.rand(0, w),
        y: U.rand(-h, h),
        len,
        speed: U.rand(120, 340),
        chars
      };
      // bake the whole column into a sprite: one drawImage per column instead
      // of one fillText per character per frame
      bakeRainSprite(r);
      rain.push(r);
    }
  }

  function buildNebula(n) {
    for (let i = 0; i < n; i++) {
      nebula.push({
        x: U.rand(0, w),
        y: U.rand(0, h),
        r: U.rand(Math.min(w, h) * 0.25, Math.min(w, h) * 0.5),
        hue: U.pick([worldHue, (worldHue + 35) % 360, (worldHue + 75) % 360, (worldHue + 340) % 360]),
        dx: U.rand(-6, 6),
        dy: U.rand(-4, 4),
        seed: U.rand(0, Math.PI * 2)
      });
    }
  }

  function buildPackets(n) {
    // packets stream along a few shared lanes (upper two-thirds, away from the HUD)
    for (let i = 0; i < n; i++) {
      packets.push({
        y: U.rand(h * 0.06, h * 0.66),
        speed: U.rand(140, 420),
        len: U.rand(14, 40),
        hue: U.chance(0.55) ? worldHue : (worldHue + 70) % 360,
        phase: U.rand(0, Math.PI * 2)
      });
    }
  }

  function update(dt, intensity) {
    const k = intensity === undefined ? 1 : intensity;
    const d = density();
    for (let i = 0; i < binary.length; i++) {
      const b = binary[i];
      b.y += b.speed * dt * k;
      b.x += Math.sin(b.y * 0.01 + b.x) * 8 * dt * k;
      if (b.y > h + 20) { b.y = -20; b.x = U.rand(0, w); b.text = U.pick(["0", "1"]); }
    }
    for (let i = 0; i < rain.length; i++) {
      const r = rain[i];
      r.y += r.speed * dt * k;
      if (r.y - r.len * 14 > h + 20) {
        r.y = -r.len * 14;
        r.x = U.rand(0, w);
        r.speed = U.rand(120, 340);
        r.chars = [];
        for (let c = 0; c < r.len; c++) r.chars.push(U.pick(["0", "1", "7", "A", "F", "C", "8"]));
        // respawn = new chars, so rebake the sprite to match
        bakeRainSprite(r);
      }
    }
    for (let i = 0; i < nebula.length; i++) {
      const nb = nebula[i];
      nb.x += nb.dx * dt * k;
      nb.y += nb.dy * dt * k;
      nb.seed += dt * 0.3 * k;
      // wrap softly so blobs drift forever
      if (nb.x < -nb.r) nb.x = w + nb.r;
      if (nb.x > w + nb.r) nb.x = -nb.r;
      if (nb.y < -nb.r) nb.y = h + nb.r;
      if (nb.y > h + nb.r) nb.y = -nb.r;
    }
    for (let i = 0; i < packets.length; i++) {
      const p = packets[i];
      // phase drives the packet's lane position in render(); wrap modulo to keep
      // the float small (no unbounded growth over long sessions)
      const span = w + 400;
      p.phase = (p.phase + p.speed * dt * k) % span;
    }
  }

  function render(ctx, t, intensity) {
    const k = intensity === undefined ? 1 : intensity;
    const d = density();
    const glow = glowOn();

    // static backdrop — 2 blits, no per-frame gradients or star arcs
    ctx.drawImage(baseCanvas, 0, 0);
    ctx.globalAlpha = Math.min(1, 0.4 + k * 0.6);
    ctx.drawImage(decorCanvas, 0, 0);
    ctx.globalAlpha = 1;

    // nebula glow blobs (additive) — baked sprites, pulsing via globalAlpha
    if (glow && nebula.length) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < nebula.length; i++) {
        const nb = nebula[i];
        const pulse = 0.55 + 0.45 * Math.sin(t * 0.4 + nb.seed);
        ctx.globalAlpha = pulse * k;
        ctx.drawImage(nebulaSprite(nb.hue), nb.x - nb.r, nb.y - nb.r, nb.r * 2, nb.r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // data packets — glowing streaks streaming along lanes (sprite blits)
    if (packets.length) {
      ctx.globalCompositeOperation = glow ? "lighter" : "source-over";
      const dim = glow ? 1 : 0.4;   // low quality: subtler, non-additive streaks
      for (let i = 0; i < packets.length; i++) {
        const p = packets[i];
        const sprite = packetSprites[p.hue === worldHue ? 0 : 1];
        if (!sprite) continue;
        const x = p.phase - 200;
        const headA = 0.5 + 0.3 * Math.sin(t * 2 + p.phase * 0.01);
        ctx.globalAlpha = Math.min(1, 0.6 * headA * d * dim);
        ctx.drawImage(sprite, x, p.y - 1, p.len, 2);
        // bright head dot
        ctx.globalAlpha = Math.min(1, 0.85 * headA * d * dim);
        ctx.fillStyle = `hsla(${p.hue},95%,82%,1)`;
        ctx.beginPath(); ctx.arc(x + p.len, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // binary floats (brighter)
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    for (let i = 0; i < binary.length; i++) {
      const b = binary[i];
      ctx.fillStyle = `hsla(${b.hue},90%,70%,${0.22 + 0.3 * Math.sin(t + i)})`;
      ctx.fillText(b.text, b.x, b.y);
    }

    // digital rain columns — pre-rendered sprite blits (head baked bright)
    ctx.textAlign = "left";
    for (let i = 0; i < rain.length; i++) {
      const r = rain[i];
      const hgt = r.len * 14;
      const top = r.y - hgt;
      if (top > h + 20 || r.y < -20) continue;
      ctx.drawImage(r.sprite, r.x - 1, top);
    }

    // CRT scanlines (subtle; scaled by density)
    if (scanPattern) {
      ctx.globalAlpha = 0.35 * d * k;
      ctx.fillStyle = scanPattern;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // vignette (cached blit)
    ctx.drawImage(vignetteCanvas, 0, 0);
  }

  R.Background = { init, resize, update, render, setWorld };
})(window.BREAK);
