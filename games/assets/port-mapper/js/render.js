/* =========================================================================
   PORT MAPPER — render.js
   Isometric pyramid, entities, particles and neon-terminal background.
   All drawing happens in a fixed 1280x720 logical space, scaled to fit.
   ========================================================================= */
window.PM = window.PM || {};

PM.Render = (function () {
  'use strict';

  const C = PM.Config;
  const P = C.PALETTE;
  const STR = PM.STR.T;   // strings table — text is centralized in strings.js

  let canvas = null, ctx = null;
  let bgCanvas = null, bgCtx = null;
  // parallax star-field data — fixed positions and drift speeds (no runtime
  // randomness), generated once per resize and animated with wall time
  let stars = [];
  // nebula tint layer — two large soft colour washes behind the star field,
  // pre-rendered once per resize, drifting on slow fixed paths (wall time)
  const NEB_DRIFT = 110;             // max centre travel in px (x axis)
  const NEB_DRIFT_Y = 90;            // vertical travel — the screen is shorter
  const NEB_W = C.VW + NEB_DRIFT * 2;   // canvas = screen + drift margin each side
  const NEB_H = C.VH + NEB_DRIFT * 2;
  let nebulaA = null, nebulaB = null;
  let vigCanvas = null, vigCtx = null;       // pre-rendered vignette gradient
  let redVigCanvas = null, redVigCtx = null; // red edge-vignette for death flashes
  let scanCanvas = null, scanCtx = null;     // pre-rendered CRT scanlines
  // scratch painter-sort list reused across frames (no per-frame allocation)
  let drawables = [];
  let dpr = 1;
  let W = C.VW, H = C.VH;

  const PIX_FONT = '"Press Start 2P", "Courier New", monospace';

  /* ---- setup ---------------------------------------------------------------- */
  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = C.VW * dpr;
    canvas.height = C.VH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderBackground();
    makeStars();
    makeNebula();
    renderVignette();
    renderScanlines();
  }

  // Pre-rendered darkening for the corners — the alpha pulses per frame so the
  // CRT "breathing" is cheap (one drawImage instead of a gradient rebuild).
  function renderVignette() {
    vigCanvas = document.createElement('canvas');
    vigCanvas.width = C.VW * dpr;
    vigCanvas.height = C.VH * dpr;
    vigCtx = vigCanvas.getContext('2d');
    vigCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = vigCtx.createRadialGradient(C.VW / 2, C.VH / 2, C.VH * 0.30, C.VW / 2, C.VH / 2, C.VH * 0.78);
    g.addColorStop(0, 'rgba(4,6,16,0)');
    g.addColorStop(1, 'rgba(4,6,16,0.60)');
    vigCtx.fillStyle = g;
    vigCtx.fillRect(0, 0, C.VW, C.VH);

    // red edge-vignette: the flash frame for deaths (center stays clear so the
    // action reads through the middle, with the danger clamped to the corners)
    redVigCanvas = document.createElement('canvas');
    redVigCanvas.width = C.VW * dpr;
    redVigCanvas.height = C.VH * dpr;
    redVigCtx = redVigCanvas.getContext('2d');
    redVigCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rg = redVigCtx.createRadialGradient(C.VW / 2, C.VH / 2, C.VH * 0.34, C.VW / 2, C.VH / 2, C.VH * 0.82);
    rg.addColorStop(0, 'rgba(255,30,50,0.10)');
    rg.addColorStop(0.55, 'rgba(255,30,50,0.30)');
    rg.addColorStop(1, 'rgba(255,30,50,0.85)');
    redVigCtx.fillStyle = rg;
    redVigCtx.fillRect(0, 0, C.VW, C.VH);
  }

  // Pre-rendered CRT scanlines (1px dark bands every 3px) — drawn once at full
  // alpha, then composited at 7% alpha with a single drawImage per frame
  // instead of ~240 fillRect calls in drawCRTOverlay.
  function renderScanlines() {
    scanCanvas = document.createElement('canvas');
    scanCanvas.width = C.VW * dpr;
    scanCanvas.height = C.VH * dpr;
    scanCtx = scanCanvas.getContext('2d');
    scanCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scanCtx.fillStyle = '#000';
    for (let y = 0; y < C.VH; y += 3) {
      scanCtx.fillRect(0, y, C.VW, 1);
    }
  }

  /* ---- background (pre-rendered) -------------------------------------------- */
  function renderBackground() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = C.VW * dpr;
    bgCanvas.height = C.VH * dpr;
    bgCtx = bgCanvas.getContext('2d');
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // base gradient — a clean deep-navy space, cool at the top (the warm CLOSED
    // tiles of the pyramid pop against it) falling to near-black at the bottom.
    // The sky is intentionally empty here: the nebula washes and the star field
    // animate on top per frame, and the pyramid's own shading does the depth.
    const g = bgCtx.createLinearGradient(0, 0, 0, C.VH);
    g.addColorStop(0, '#121b38');
    g.addColorStop(0.45, P.bgTop);
    g.addColorStop(1, P.bgBottom);
    bgCtx.fillStyle = g;
    bgCtx.fillRect(0, 0, C.VW, C.VH);
  }

  /* ---- parallax star-field --------------------------------------------------- */
  // The backdrop's subtle motion: a slow star-field where every star travels a
  // FIXED wrap-around drift path (three depth layers at different speeds give
  // real parallax). No runtime randomness, no spawning — the old packet noise
  // is replaced by calm, deterministic depth. Stars are drawn UNDER the
  // pyramid, so they pass behind its opaque tiles and never compete with play.
  function makeStars() {
    stars = [];
    const layers = [
      { n: 60, size: 1, a0: 0.08, a1: 0.16, spd: 3.0 },   // far — dim, slow
      { n: 36, size: 1, a0: 0.13, a1: 0.24, spd: 7.0 },   // mid
      { n: 16, size: 2, a0: 0.20, a1: 0.34, spd: 12.0 },  // near — bright, brisk
    ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const jit = 0.8 + Math.random() * 0.4;   // ±20% per-star speed spread
        stars.push({
          x: Math.random() * C.VW,
          y: Math.random() * C.VH,
          size: L.size,
          alpha: L.a0 + Math.random() * (L.a1 - L.a0),
          sx: L.spd * jit,
          sy: -L.spd * jit * 0.35,               // diagonal drift, mostly lateral
          phase: Math.random() * 6.28,           // own twinkle phase
        });
      }
    }
  }

  // Animated each frame from wall time: positions are pure functions of t, so
  // the drift is seamless and reproducible — no state to corrupt, nothing to
  // reset. The twinkle keeps each star breathing on its own phase.
  function drawStars(t) {
    for (let i = 0; i < stars.length; i++) {
      const st = stars[i];
      // wrap-around drift: sx > 0 keeps px non-negative; sy < 0 needs the
      // double-modulo to normalise into [0, VH)
      const px = (st.x + st.sx * t * 0.001) % C.VW;
      const py = ((st.y + st.sy * t * 0.001) % C.VH + C.VH) % C.VH;
      ctx.globalAlpha = st.alpha * (0.72 + 0.28 * Math.sin(t * 0.0011 + st.phase));
      ctx.fillStyle = st.size > 1 ? '#eafcff' : '#9be8ff';
      // snap to the pixel grid: a fractional 1px fill lands sub-pixel and
      // shimmers while drifting — rounded stars stay crisp and uniform
      ctx.fillRect(Math.round(px), Math.round(py), st.size, st.size);
    }
    ctx.globalAlpha = 1;
  }

  /* ---- nebula tint layer ----------------------------------------------------- */
  // Two big soft radial washes — a violet glow that hovers in the upper half
  // and a cyan one in the lower half — giving the backdrop colour depth above
  // and below the star field. Each canvas is screen-size plus a drift margin
  // and the gradient spans the whole canvas, so at every drift position the
  // screen is fully covered with a soft falloff and no edge ever shows.
  function makeNebula() {
    const R = Math.sqrt(NEB_W * NEB_W + NEB_H * NEB_H) / 2;   // reaches the canvas corners
    function build(rgb) {
      const cv = document.createElement('canvas');
      cv.width = NEB_W * dpr;
      cv.height = NEB_H * dpr;
      const cx = cv.getContext('2d');
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = cx.createRadialGradient(NEB_W / 2, NEB_H / 2, 0, NEB_W / 2, NEB_H / 2, R);
      g.addColorStop(0, 'rgba(' + rgb + ',0.10)');
      g.addColorStop(0.45, 'rgba(' + rgb + ',0.05)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      cx.fillStyle = g;
      cx.fillRect(0, 0, NEB_W, NEB_H);
      return cv;
    }
    nebulaA = build('176,107,255');   // violet — the palette's worm purple
    nebulaB = build('63,212,255');    // cyan — the neon terminal accent
  }

  // Slow Lissajous drift: each wash circles independently on a ~2-minute
  // period (pure functions of wall time, so the paths are fixed and the sim
  // is untouched). Two drawImage blits per frame — same class as the vignette.
  function drawNebula(t) {
    // parity with drawCRTOverlay's guard — a null canvas would throw inside
    // the frame loop, so no-op instead
    if (!nebulaA || !nebulaB) return;
    const aCx = C.VW / 2 + Math.sin(t * 0.000045) * NEB_DRIFT;
    const aCy = C.VH * 0.28 + Math.cos(t * 0.000038) * NEB_DRIFT_Y;
    ctx.drawImage(nebulaA, aCx - NEB_W / 2, aCy - NEB_H / 2);
    const bCx = C.VW / 2 + Math.cos(t * 0.000040 + 1.7) * NEB_DRIFT;
    const bCy = C.VH * 0.66 + Math.sin(t * 0.000046 + 0.9) * NEB_DRIFT_Y;
    ctx.drawImage(nebulaB, bCx - NEB_W / 2, bCy - NEB_H / 2);
  }

  /* ---- geometry helpers ----------------------------------------------------- */
  function cubeCenter(geo, u, v) {
    return { x: geo.cx + (u - v) * geo.hw, y: geo.by + (u + v) * geo.hh };
  }

  function tileKey(u, v) { return u + ',' + v; }

  /* Entity art scales with the cube size so the pyramid stays in proportion. */
  function entScale(geo) { return geo.hw / 46; }

  /* Lighten/darken a #rrggbb colour by a signed amount (-1..1). */
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * (1 + amt))));
    const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * (1 + amt))));
    const b = Math.max(0, Math.min(255, Math.round((n & 255) * (1 + amt))));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ---- cube ----------------------------------------------------------------- */
  function drawCube(g, cube, t, geo, flashAll) {
    const ctr = cubeCenter(geo, cube.u, cube.v);
    const cx = ctr.x, cy = ctr.y;
    const hw = geo.hw, hh = geo.hh, z = geo.z;
    const st = C.CUBE[cube.state] || C.CUBE[0];
    const s = entScale(geo);

    // grounded contact shadow under the cube (stronger now that the soft light
    // pool is gone — the shadow anchors each cube on the dark background)
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + hh + z - 4, hw * 0.94, hh * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // top diamond — a bright crown falling to a dark base lifts the cube off
    // the dark sky, so the pyramid reads as lit from above
    const tg = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
    tg.addColorStop(0, shade(st.top, 0.42));
    tg.addColorStop(0.55, st.top);
    tg.addColorStop(1, shade(st.top, -0.24));
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, 1.8 * s);
    ctx.strokeStyle = '#0a0d1a';
    ctx.stroke();

    // left face — deeper shadow widens the contrast against the bright crown
    const lg = ctx.createLinearGradient(cx - hw, cy, cx, cy + hh);
    lg.addColorStop(0, shade(st.left, 0.12));
    lg.addColorStop(1, shade(st.left, -0.34));
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx, cy + hh + z);
    ctx.lineTo(cx - hw, cy + z);
    ctx.closePath();
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.stroke();

    // right face
    const rg = ctx.createLinearGradient(cx + hw, cy, cx, cy + hh);
    rg.addColorStop(0, shade(st.right, 0.16));
    rg.addColorStop(1, shade(st.right, -0.30));
    ctx.beginPath();
    ctx.moveTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx, cy + hh + z);
    ctx.lineTo(cx + hw, cy + z);
    ctx.closePath();
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.stroke();

    // bevel: bright rim along the top edges of the diamond — the key edge that
    // separates each cube from the dark sky, so it gets a stronger kick
    ctx.lineWidth = Math.max(1.2, 1.35 * s);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.lineTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.stroke();

    // neon glow for OPEN cubes — stronger, breathing pulse
    if (st.glow) {
      ctx.save();
      ctx.shadowColor = st.glow;
      ctx.shadowBlur = 18 * s;
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx - hw, cy);
      ctx.closePath();
      ctx.fillStyle = st.glow;
      ctx.globalAlpha = 0.17 + 0.08 * Math.sin(t * 0.004 + cube.twinkle);
      ctx.fill();
      ctx.restore();
    }

    // flash overlay when a cube was just changed
    let flash = cube.flash;
    if (flashAll > 0) flash = Math.max(flash, flashAll);
    if (flash > 0) {
      ctx.globalAlpha = Math.min(1, flash) * 0.75;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx - hw, cy);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // hacker-target warning — a glitching ripple contracting on the top face
    // while a hacker is airborne toward this port, telegraphing the incoming
    // revert. The opposite of the shimmer below (static noise = signal lost):
    // converging chromatic-split diamond rings read as a lock-on in progress,
    // fading as the cube.warn timer runs down (~450ms, the hop window).
    const wr = cube.warn || 0;
    if (wr > 0) {
      const wa = Math.min(1, wr);
      const ph = (t * 0.006 + cube.twinkle) % 1;   // ring travel 0..1
      const jx = (Math.random() - 0.5) * 2.5;      // per-frame glitch jitter
      const split = Math.max(1.2, hw * 0.02);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx - hw, cy);
      ctx.closePath();
      ctx.clip();
      for (let ring = 0; ring < 2; ring++) {
        const r = (ph + ring * 0.5) % 1;           // each ring lags half a cycle
        const k = 1 - r * 0.85;                    // diamond shrinks toward the core
        ctx.globalAlpha = wa * (1 - r);            // fades as it closes in
        ctx.lineWidth = Math.max(1.5, 2.2 * s);
        // chromatic-split diamond: red trail behind, cyan ahead (CRT aberration)
        ctx.strokeStyle = 'rgba(255,43,61,0.9)';
        ctx.beginPath();
        ctx.moveTo(cx + jx - split, cy - hh * k);
        ctx.lineTo(cx + hw * k - split, cy);
        ctx.lineTo(cx - split, cy + hh * k);
        ctx.lineTo(cx - hw * k - split, cy);
        ctx.closePath();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(43,216,255,0.85)';
        ctx.beginPath();
        ctx.moveTo(cx + jx + split, cy - hh * k);
        ctx.lineTo(cx + hw * k + split, cy);
        ctx.lineTo(cx + split, cy + hh * k);
        ctx.lineTo(cx - hw * k + split, cy);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    // hacker-revert shimmer — a brief static-noise burst on the top face as
    // the port drops back to CLOSED, matching the broken-signal hackerRev
    // audio. A scatter of tiny random pixels re-rolled every frame (live TV
    // noise) clipped to the diamond, plus a faint chromatic split on the top
    // edges. The cube.revert timer fades ~420ms, so the burst dies with the
    // signal.
    const rv = cube.revert || 0;
    if (rv > 0) {
      const ra = Math.min(1, rv);
      const flick = Math.random() < 0.22 ? 0.55 : 1;   // per-frame crackle
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx - hw, cy);
      ctx.closePath();
      ctx.clip();
      // static pixels — density scales with the face area so the burst reads
      // identically on any pyramid size, and fades as the timer runs down
      const rCols = ['#eafcff', P.cyan, P.magenta, P.danger, P.danger];
      const n = Math.max(8, Math.round(hw * hh * 0.024 * ra));
      ctx.globalAlpha = ra * flick;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = rCols[(Math.random() * rCols.length) | 0];
        const px = Math.round(cx + (Math.random() - 0.5) * hw * 2);
        const py = Math.round(cy + (Math.random() - 0.5) * hh * 2);
        const ps = Math.max(1, Math.round(Math.random() < 0.7 ? 1 : (Math.random() < 0.5 ? 2 : 3)));
        ctx.fillRect(px, py, ps, ps);
      }
      // chromatic edge split — red nudge left, cyan nudge right, matching the
      // CRT aberration used for signal loss everywhere else in the game
      const split = Math.max(1.5, hw * 0.03);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = Math.max(1.5, 2.2 * s);
      ctx.globalAlpha = ra * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - hw - split, cy);
      ctx.lineTo(cx - split, cy - hh);
      ctx.lineTo(cx + hw - split, cy);
      ctx.strokeStyle = 'rgba(255,43,61,0.85)';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - hw + split, cy);
      ctx.lineTo(cx + split, cy - hh);
      ctx.lineTo(cx + hw + split, cy);
      ctx.strokeStyle = 'rgba(43,216,255,0.8)';
      ctx.stroke();
      ctx.restore();
    }

    drawCubeIcon(cube, cx, cy, hw, hh, t, geo);
  }

  function drawCubeIcon(cube, cx, cy, hw, hh, t, geo) {
    const s = 0.36; // icon scale relative to diamond
    const w = hw * s, h = hh * s;
    const lw = Math.max(1.4, 2.6 * entScale(geo));
    ctx.save();
    ctx.translate(cx, cy);

    if (cube.state === 0) {
      // CLOSED: padlock
      ctx.strokeStyle = 'rgba(10,13,26,0.85)';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(0, -2, w * 0.32, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = 'rgba(10,13,26,0.85)';
      ctx.fillRect(-w * 0.32, -2, w * 0.64, h * 0.72);
      ctx.fillStyle = 'rgba(10,13,26,0.9)';
      ctx.beginPath();
      ctx.arc(0, h * 0.1, w * 0.09, 0, Math.PI * 2);
      ctx.fill();
    } else if (cube.state === 1) {
      // SCANNING: rotating radar sweep
      const a = t * 0.003;
      ctx.strokeStyle = 'rgba(20,12,2,0.75)';
      ctx.lineWidth = Math.max(1.2, lw * 0.7);
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(20,12,2,0.8)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, w * 0.42, a, a + 1.1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // OPEN: check mark
      ctx.strokeStyle = '#062b17';
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-w * 0.36, h * 0.05);
      ctx.lineTo(-w * 0.08, h * 0.28);
      ctx.lineTo(w * 0.38, -h * 0.24);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---- lattice links between cubes ------------------------------------------ */
  function drawLinks(world, geo) {
    ctx.lineWidth = Math.min(3, 1.6 * entScale(geo));
    for (const key in world.cubes) {
      const cb = world.cubes[key];
      const c = cubeCenter(geo, cb.u, cb.v);
      const neigh = [
        [cb.u + 1, cb.v], [cb.u, cb.v + 1],
      ];
      for (let i = 0; i < neigh.length; i++) {
        const nk = tileKey(neigh[i][0], neigh[i][1]);
        const n = world.cubes[nk];
        if (!n) continue;
        const open = cb.state === 2 && n.state === 2;
        ctx.strokeStyle = open ? 'rgba(63,224,138,0.16)' : 'rgba(63,212,255,0.10)';
        const nc = cubeCenter(geo, n.u, n.v);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y + 2);
        ctx.lineTo(nc.x, nc.y + 2);
        ctx.stroke();
      }
    }
  }

  /* ---- base plinth ----------------------------------------------------------- */
  function drawBase(geo, rows) {
    const lx = geo.cx - (rows - 1) * geo.hw;
    const rx = geo.cx + (rows - 1) * geo.hw;
    const topY = geo.by + (rows - 1) * geo.hh + geo.hh + geo.z;
    const g = ctx.createLinearGradient(0, topY, 0, topY + 30);
    g.addColorStop(0, 'rgba(20,26,58,0.9)');
    g.addColorStop(1, 'rgba(6,8,20,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 10, topY - 6, (rx - lx) + 20, 30);
    ctx.strokeStyle = 'rgba(63,212,255,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const yy = topY + 4 + i * 6;
      ctx.beginPath(); ctx.moveTo(lx - 8, yy); ctx.lineTo(rx + 8, yy); ctx.stroke();
    }
  }

  /* ---- player ---------------------------------------------------------------- */
  function drawPlayer(p, geo, t) {
    const s = entScale(geo);
    const ctr = cubeCenter(geo, p.u, p.v);
    let x = ctr.x, y = ctr.y;
    let z = 0, squash = 1;
    if (p.state === 'hop' || p.state === 'ride') {
      const prog = Math.min(1, (t - p.hop.w0) / p.hop.dur);
      x = p.hop.from.x + (p.hop.to.x - p.hop.from.x) * prog;
      y = p.hop.from.y + (p.hop.to.y - p.hop.from.y) * prog;
      z = Math.sin(prog * Math.PI) * geo.hh * 2.1;
      squash = 1 + 0.28 * Math.sin(prog * Math.PI);
    } else if (p.state === 'fall') {
      const prog = Math.min(1, (t - p.fall.w0) / p.fall.dur);
      x = p.fall.from.x + (p.fall.to.x - p.fall.from.x) * prog;
      y = p.fall.from.y + (p.fall.to.y - p.fall.from.y) * prog;
      z = p.fall.z;
      squash = 1;
    }

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 10 * s, 16 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    const py = y - z - 34 * s;
    const blink = p.invuln > 0 && Math.floor(t / 90) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(x, py);
    ctx.scale(s / squash * (p.facing === 'L' ? -1 : 1), s * squash);

    // legs
    ctx.fillStyle = P.playerOutline;
    const legPhase = (p.state === 'hop' || p.state === 'ride') ? Math.sin(Math.min(1, (t - (p.hop ? p.hop.w0 : 0)) / 300) * Math.PI) : 0;
    ctx.fillRect(-9, 20, 6, 9 + legPhase * 3);
    ctx.fillRect(3, 20, 6, 9 - legPhase * 3);

    // body
    roundRect(-13, -8, 26, 28, 7);
    ctx.fillStyle = P.playerBody;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = P.playerOutline;
    ctx.stroke();

    // visor
    ctx.fillStyle = P.playerVisor;
    roundRect(-10, -4, 20, 10, 4);
    ctx.fill();
    // eyes
    ctx.fillStyle = '#0a1020';
    ctx.beginPath();
    ctx.arc(-5, 1, 2.1, 0, Math.PI * 2);
    ctx.arc(5, 1, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-4.4, 0.4, 0.8, 0, Math.PI * 2);
    ctx.arc(5.6, 0.4, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // antenna
    ctx.strokeStyle = P.playerOutline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, -16);
    ctx.stroke();
    const dot = Math.sin(t * 0.01) > -0.2 ? P.green : P.danger;
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(0, -17, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // shield bubble
    if (p.shield > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(63,212,255,' + (0.55 + 0.2 * Math.sin(t * 0.01)) + ')';
      ctx.lineWidth = 2 * s;
      ctx.shadowColor = P.cyan;
      ctx.shadowBlur = 12 * s;
      ctx.beginPath();
      ctx.arc(x, py - 4 * s, 26 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // overclock speed lines
    if (p.overclock > 0) {
      ctx.strokeStyle = 'rgba(255,177,61,0.5)';
      ctx.lineWidth = 2 * s;
      for (let i = 0; i < 3; i++) {
        const ox = (-22 - i * 8) * s;
        ctx.beginPath();
        ctx.moveTo(x + ox, py - 4 * s + i * 6 * s);
        ctx.lineTo(x + ox + 10 * s, py - 4 * s + i * 6 * s);
        ctx.stroke();
      }
    }
  }

  /* ---- enemies --------------------------------------------------------------- */
  function drawEnemy(e, t, frozen, geo) {
    const s = entScale(geo);
    const ctr = cubeCenter(geo, e.u, e.v);
    let x = ctr.x, y = ctr.y, z = 0;
    if (e.state === 'hop') {
      const prog = Math.min(1, (t - e.hop.w0) / e.hop.dur);
      x = e.hop.from.x + (e.hop.to.x - e.hop.from.x) * prog;
      y = e.hop.from.y + (e.hop.to.y - e.hop.from.y) * prog;
      z = Math.sin(prog * Math.PI) * geo.hh * 1.9;
    } else if (e.state === 'fall') {
      const prog = Math.min(1, (t - e.fall.w0) / e.fall.dur);
      x = e.fall.from.x + (e.fall.to.x - e.fall.from.x) * prog;
      y = e.fall.from.y + (e.fall.to.y - e.fall.from.y) * prog;
      z = e.fall.z;
    } else if (e.type === 'hacker') {
      z = Math.abs(Math.sin(t * 0.004 + e.phase)) * 5 * s; // hover
    }

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 10 * s, 15 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y - z);
    ctx.scale(s, s);

    if (e.type === 'worm') {
      if (e.mode === 'egg') {
        drawEgg(t, e);
      } else {
        drawWorm(t, e);
      }
    } else if (e.type === 'ping' || e.type === 'pong' || e.type === 'packet') {
      drawRedBall(t, e);
    } else if (e.type === 'freezeball') {
      drawGreenBall(t, e);
    } else if (e.type === 'hacker') {
      drawHacker(t, e);
    }

    // frozen tint
    if (frozen) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#9be8ff';
      ctx.beginPath();
      ctx.arc(0, -12, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#eafcff';
      ctx.font = '11px ' + PIX_FONT;
      ctx.fillText('❄', -6, -8);
    }
    ctx.restore();
  }

  function drawEgg(t, e) {
    // Coily's egg: the large purple ball that bounces down the pyramid
    const wob = Math.sin(t * 0.006) * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(176,107,255,0.9)';
    ctx.shadowBlur = 18;
    const g = ctx.createRadialGradient(-4, -20, 2, 0, -16, 16);
    g.addColorStop(0, '#d3a9ff');
    g.addColorStop(1, '#7a2fd6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -16 + wob, 13, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // darker spots
    ctx.fillStyle = 'rgba(60,10,110,0.55)';
    ctx.beginPath(); ctx.arc(-5, -19 + wob, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -12 + wob, 1.8, 0, Math.PI * 2); ctx.fill();
    // hatch cracks pulse as it nears the base
    ctx.strokeStyle = 'rgba(240,230,255,0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-6, -16 + wob); ctx.lineTo(-2, -14 + wob);
    ctx.moveTo(-2, -14 + wob); ctx.lineTo(0, -17 + wob);
    ctx.moveTo(0, -17 + wob); ctx.lineTo(4, -14 + wob);
    ctx.stroke();
  }

  function drawWorm(t, e) {
    // body: 4 coils trailing behind the head along the hop direction
    const dirx = e.facing === 'L' ? -1 : 1;
    const coil = (e.state === 'hop') ? 1 : 0.6;
    for (let i = 3; i >= 0; i--) {
      const off = i * 7 * coil;
      const sway = Math.sin(t * 0.01 + i) * 3;
      ctx.fillStyle = i % 2 === 0 ? P.worm : P.wormDark;
      ctx.beginPath();
      ctx.arc(-dirx * off, -14 + sway, 10 - i * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // head
    ctx.fillStyle = P.worm;
    ctx.beginPath();
    ctx.arc(0, -14, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f3d1d';
    // angry eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-4, -17, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -17, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f3d1d';
    ctx.beginPath(); ctx.arc(-3.4, -16.6, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4.6, -16.6, 1.7, 0, Math.PI * 2); ctx.fill();
    // brows
    ctx.strokeStyle = '#0f3d1d';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6, -20); ctx.lineTo(-2, -19); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -20); ctx.lineTo(2, -19); ctx.stroke();
  }

  function drawRedBall(t, e) {
    // Ugg/Wrongway (ping/pong) are purple; the red packet is red
    const purple = e.type === 'ping' || e.type === 'pong';
    const c1 = purple ? '#cfa4ff' : '#ff8a8a';
    const c2 = purple ? '#7a2fd6' : '#d92b2b';
    const dark = purple ? '#4a1589' : '#b32020';
    ctx.save();
    ctx.shadowColor = purple ? 'rgba(176,107,255,0.85)' : 'rgba(255,80,80,0.8)';
    ctx.shadowBlur = 12;
    const g = ctx.createRadialGradient(-4, -18, 2, 0, -14, 15);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -14, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // spikes
    ctx.fillStyle = dark;
    const rot = Math.sin(t * 0.008 + e.phase) * 0.4;
    for (let i = 0; i < 3; i++) {
      const a = rot + i * (Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 12, -14 + Math.sin(a) * 12);
      ctx.lineTo(Math.cos(a + 0.25) * 17, -14 + Math.sin(a + 0.25) * 17);
      ctx.lineTo(Math.cos(a - 0.25) * 17, -14 + Math.sin(a - 0.25) * 17);
      ctx.closePath();
      ctx.fill();
    }
    // angry face
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-5, -16, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -16, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a0a0a';
    ctx.beginPath(); ctx.arc(-4.6, -15.4, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5.4, -15.4, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a0a0a';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, -8, 4, 0.2, Math.PI - 0.2); ctx.stroke();
  }

  function drawGreenBall(t, e) {
    // the freeze ball: catch it to chill all hostile traffic
    ctx.save();
    ctx.shadowColor = 'rgba(93,242,142,0.9)';
    ctx.shadowBlur = 16;
    const g = ctx.createRadialGradient(-4, -18, 2, 0, -14, 15);
    g.addColorStop(0, '#c8ffdd');
    g.addColorStop(1, '#2fbf68');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -14, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // ice crystals
    ctx.strokeStyle = '#eafff1';
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) {
      const a = t * 0.004 + i * (Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 17, -14 + Math.sin(a) * 17);
      ctx.lineTo(Math.cos(a) * 11, -14 + Math.sin(a) * 11);
      ctx.stroke();
    }
    // friendly face
    ctx.fillStyle = '#0c2e18';
    ctx.beginPath(); ctx.arc(-4, -16, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -16, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0c2e18';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, -11, 3, 0.2, Math.PI - 0.2); ctx.stroke();
  }

  function drawHacker(t, e) {
    const bob = Math.abs(Math.sin(t * 0.004 + e.phase)) * 5;
    // body
    ctx.fillStyle = P.hacker;
    ctx.beginPath();
    ctx.moveTo(-13, 2);
    ctx.lineTo(-13, -12 - bob);
    ctx.quadraticCurveTo(-13, -22 - bob, 0, -24 - bob);
    ctx.quadraticCurveTo(13, -22 - bob, 13, -12 - bob);
    ctx.lineTo(13, 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0c0f1c';
    ctx.lineWidth = 2;
    ctx.stroke();
    // wavy bottom
    ctx.strokeStyle = '#0c0f1c';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const sx = -12 + i * 8;
      ctx.moveTo(sx, 2);
      ctx.quadraticCurveTo(sx + 4, 9, sx + 8, 2);
    }
    ctx.stroke();
    // glowing eyes
    ctx.save();
    ctx.shadowColor = P.hackerEyes;
    ctx.shadowBlur = 10;
    ctx.fillStyle = P.hackerEyes;
    ctx.fillRect(-8, -16 - bob, 5, 4);
    ctx.fillRect(3, -16 - bob, 5, 4);
    ctx.restore();
  }

  /* ---- disc ------------------------------------------------------------------ */
  function drawDisc(d, t, geo) {
    const s = entScale(geo);
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(s, s);
    // glow
    ctx.shadowColor = 'rgba(155,232,255,0.9)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#bdeeff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#5d9dbd';
    ctx.beginPath();
    ctx.ellipse(0, 3, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8ecbee';
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // dome
    ctx.fillStyle = '#e8faff';
    ctx.beginPath();
    ctx.ellipse(0, -2, 12, 7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // spinning rim lights
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) {
      const a = t * 0.005 + i * (Math.PI / 2);
      const lx = Math.cos(a) * 26, ly = Math.sin(a) * 7;
      ctx.beginPath();
      ctx.arc(lx, ly, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---- power-ups -------------------------------------------------------------- */
  function drawPowerup(pu, t, geo) {
    const ctr = cubeCenter(geo, pu.u, pu.v);
    const bobY = Math.sin(t * 0.006 + pu.phase) * 5;
    const blink = pu.life < 2400 && Math.floor(t / 120) % 2 === 0;
    if (blink) return;
    const def = C.POWERUPS[pu.type];

    const s = entScale(geo);
    ctx.save();
    ctx.translate(ctr.x, ctr.y - geo.hh - 14 + bobY);
    ctx.scale(s, s);
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 14;
    roundRect(-13, -13, 26, 26, 5);
    ctx.fillStyle = '#0c1124';
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = def.color;
    ctx.fillStyle = def.color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pu.type === 'packet') {
      // envelope
      ctx.fillStyle = def.color;
      ctx.fillRect(-8, -7, 16, 12);
      ctx.strokeStyle = '#0c1124';
      ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(0, 0); ctx.lineTo(8, -7); ctx.stroke();
    } else if (pu.type === 'firewall') {
      // shield
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(8, -4); ctx.lineTo(8, 2); ctx.lineTo(0, 9); ctx.lineTo(-8, 2); ctx.lineTo(-8, -4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(63,212,255,0.25)';
      ctx.fill();
      ctx.stroke();
    } else if (pu.type === 'freeze') {
      // snowflake
      for (let i = 0; i < 3; i++) {
        const a = i * (Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(-Math.cos(a) * 8, -Math.sin(a) * 8);
        ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
        ctx.stroke();
      }
    } else {
      // bolt
      ctx.beginPath();
      ctx.moveTo(2, -9); ctx.lineTo(-4, 2); ctx.lineTo(0, 2); ctx.lineTo(-2, 9); ctx.lineTo(5, -2); ctx.lineTo(1, -2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---- particles & floating text --------------------------------------------- */
  function drawParticle(pt, scale) {
    const a = Math.max(0, pt.life / pt.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    const s = pt.size * (0.5 + a * 0.5) * (scale || 1);
    if (pt.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, s, 0, Math.PI * 2);
      ctx.fill();
    } else if (pt.shape === 'ring') {
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, s, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pt.shape === 'line') {
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = s;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x - pt.vx * 0.04, pt.y - pt.vy * 0.04);
      ctx.stroke();
    } else {
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot || 0);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloat(f, scale) {
    const a = Math.max(0, f.life / f.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = Math.round((f.big ? 15 : 12) * (scale || 1)) + 'px ' + PIX_FONT;
    ctx.textAlign = 'center';
    ctx.lineWidth = Math.max(2, 3 * (scale || 1));

    if (f.glitch) {
      // broken-signal text: hard flicker, chromatic break-up, jitter and
      // occasional tear slices — reads as a dying terminal, not a clean popup
      const jx = (Math.random() - 0.5) * 7;
      const flick = Math.random() < 0.16 ? 0.25 : 1;   // whole tag stutters together

      // signal-loss static: a burst of tiny random coloured pixels crackling
      // around the tag for the first ~300ms of life. Each frame re-rolls the
      // whole scatter, so it reads as live TV noise, then dissolves as the
      // signal fully drops (the tag itself keeps glitching for the rest of its
      // life, so the static fades out from under it).
      // only the first ~300ms of life, and only when the formula is meaningful
      // (maxLife > 300) so the static can never outlive the tag itself
      const noiseA = f.maxLife > 300 ? Math.max(0, Math.min(1, (f.life - (f.maxLife - 300)) / 300)) : 0;
      if (noiseA > 0) {
        // the speckles scale with the entity size so the static stays in
        // proportion with the (scaled) glyphs on any pyramid size
        const k = scale || 1;
        const nw = Math.max(100, ctx.measureText(f.text).width + 26 * k);
        const staticCols = ['#eafcff', P.cyan, P.green, P.magenta, P.danger];
        const count = Math.round(nw * 0.85);
        ctx.save();
        ctx.globalAlpha = a * flick * noiseA;
        for (let i = 0; i < count; i++) {
          ctx.fillStyle = staticCols[(Math.random() * staticCols.length) | 0];
          const px = Math.round(f.x + jx + (Math.random() - 0.5) * nw);
          const py = Math.round(f.y - 20 * k + Math.random() * 40 * k);
          const ps = Math.max(1, Math.round((Math.random() < 0.7 ? 1 : (Math.random() < 0.5 ? 2 : 3)) * k));
          ctx.fillRect(px, py, ps, ps);
        }
        ctx.restore();
      }

      ctx.globalAlpha = a * flick;
      ctx.strokeStyle = 'rgba(5,8,20,0.9)';
      ctx.strokeText(f.text, f.x + jx, f.y);
      ctx.fillStyle = 'rgba(255,43,61,0.9)';
      ctx.fillText(f.text, f.x + jx - 2, f.y);
      ctx.fillStyle = 'rgba(43,216,255,0.85)';
      ctx.fillText(f.text, f.x + jx + 2, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x + jx, f.y);
      // displaced tear copies snapping around the tag (share the flicker)
      ctx.globalAlpha = a * 0.7 * flick;
      for (let i = 0; i < 2; i++) {
        if (Math.random() < 0.4) {
          ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,43,61,0.8)' : f.color;
          ctx.fillText(f.text, f.x + jx + (Math.random() - 0.5) * 14, f.y - 8 + Math.random() * 16);
        }
      }
      ctx.restore();
      return;
    }

    ctx.strokeStyle = 'rgba(5,8,20,0.9)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }

  /* ---- world draw ------------------------------------------------------------- */
  function drawWorld(world, t) {
    if (!ctx) return;
    const geo = world.geo;
    const s = entScale(geo);

    // background, then the nebula tint, then the star field drifting in front
    // of it — the washes give the sky colour depth above and below the stars
    ctx.drawImage(bgCanvas, 0, 0, C.VW, C.VH);
    drawNebula(t);
    drawStars(t);

    // screen shake
    ctx.save();
    if (world.shake > 0) {
      const s = world.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    // particles only spawn from gameplay events now (bursts, trails, confetti)
    // — no ambient background drift
    ctx.globalAlpha = 1;

    drawBase(geo, world.rows);
    drawLinks(world, geo);

    // collect drawables (cubes + entities), painter-sorted by row — the scratch
    // array CONTAINER is reused across frames (length=0); the item objects are
    // still allocated, but the container realloc is gone
    drawables.length = 0;
    for (const key in world.cubes) {
      const cb = world.cubes[key];
      drawables.push({ row: cb.r + 0.4, kind: 'cube', cb });
    }
    for (const e of world.enemies) {
      if (e.dead) continue;
      drawables.push({ row: entityRow(e), kind: 'enemy', e });
    }
    if (world.player && world.player.state !== 'gone') {
      drawables.push({ row: playerRow(world.player) + 0.55, kind: 'player' });
    }
    drawables.sort((a, b) => a.row - b.row);

    const flashAll = world.levelFlash > 0 ? Math.min(1, world.levelFlash) : 0;
    for (const d of drawables) {
      if (d.kind === 'cube') drawCube(ctx, d.cb, t, geo, flashAll);
      else if (d.kind === 'enemy') drawEnemy(d.e, t, world.freeze > 0, geo);
      else drawPlayer(world.player, world.geo, t);
    }

    // power-ups
    for (const pu of world.powerups) drawPowerup(pu, t, geo);

    // discs
    for (const d of world.discs) {
      if (!d.used && d.visible) drawDisc(d, t, geo);
    }

    // particles
    for (const pt of world.particles) drawParticle(pt, s);

    // floating score text
    for (const f of world.floats) drawFloat(f, s);

    ctx.restore();

    // death flash — a flat colour wash, or the red edge-vignette shared by real
    // deaths and the attract demo's scripted deaths (world.flashVignette)
    if (world.flash > 0) {
      ctx.globalAlpha = Math.min(1, world.flash);
      if (world.flashVignette && redVigCanvas) {
        ctx.drawImage(redVigCanvas, 0, 0, C.VW, C.VH);
      } else {
        ctx.fillStyle = world.flashColor || '#ffffff';
        ctx.fillRect(0, 0, C.VW, C.VH);
      }
      ctx.globalAlpha = 1;
    }

    // in-canvas title cards: the attract demo's ROUND COMPLETE, real gameplay's
    // LEVEL n CLEAR with its bonus breakdown, and the next-level READY card
    if (world.demo && world.demoState === 'clear') drawDemoCard(world, t);
    else if (world.clearCard) drawLevelClearCard(world, t);
    if (world.readyCard) drawReadyCard(world, t);

    // in-canvas CRT effect, matched to the DOM overlay (togglable via SOUND menu)
    drawCRTOverlay(t, geo);
  }

  /* ---- in-canvas title cards -------------------------------------------------- */
  // Shared chrome for every title card: a soft halo, a near-opaque panel body and
  // the RGB-cycling border (ghost stroke + glowing core + white inner rim). The
  // caller draws the card's text on top and must call ctx.restore() when done.
  function cardShell(cx, cy, cw, ch, alpha, hue, scale) {
    const x = cx - cw / 2, y = cy - ch / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    // soft halo so the panel lifts off the dark background
    const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, cw * 0.72);
    halo.addColorStop(0, 'hsla(' + hue + ',100%,60%,0.16)');
    halo.addColorStop(1, 'hsla(' + hue + ',100%,60%,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - cw, cy - ch, cw * 2, ch * 2);

    // panel body — near-opaque so the text stays legible over the pyramid
    const bg = ctx.createLinearGradient(0, y, 0, y + ch);
    bg.addColorStop(0, 'rgba(12,16,36,0.94)');
    bg.addColorStop(1, 'rgba(6,9,22,0.96)');
    roundRect(x, y, cw, ch, 10);
    ctx.fillStyle = bg;
    ctx.fill();

    // RGB-cycling border: outer ghost stroke + bright core + thin inner rim
    ctx.save();
    ctx.shadowColor = 'hsl(' + hue + ',100%,58%)';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = 'hsla(' + hue + ',100%,58%,0.9)';
    ctx.lineWidth = 4;
    roundRect(x, y, cw, ch, 10);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'hsla(' + hue + ',100%,70%,0.35)';
    ctx.lineWidth = 8;
    roundRect(x, y, cw, ch, 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    roundRect(x + 5, y + 5, cw - 10, ch - 10, 8);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    return y;                        // panel top, for positioning text rows
  }

  // Pixel text with a dark outline and an optional neon glow.
  function cardText(text, x, y, size, color, glow) {
    ctx.font = size + 'px ' + PIX_FONT;
    ctx.lineWidth = Math.max(3, size * 0.24);
    ctx.strokeStyle = 'rgba(5,8,20,0.95)';
    ctx.strokeText(text, x, y);
    ctx.save();
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.9; }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // A bonus-breakdown row: dotted leader with the label left, the value right.
  function cardRow(cx, label, value, y, color, size) {
    const fs = size || 12;
    const lx = cx - 220, rx = cx + 220;
    ctx.font = fs + 'px ' + PIX_FONT;
    ctx.textBaseline = 'middle';
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx + label.length * fs + 8, y);
    ctx.lineTo(rx - String(value).length * fs - 8, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = Math.max(3, fs * 0.24);
    ctx.strokeStyle = 'rgba(5,8,20,0.95)';
    ctx.textAlign = 'left';
    ctx.strokeText(label, lx, y);
    ctx.textAlign = 'right';
    ctx.strokeText(value, rx, y);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(label, lx, y);
    ctx.textAlign = 'right';
    ctx.fillText(value, rx, y);
    ctx.restore();
    ctx.textAlign = 'center';
  }

  // The attract demo holds a title card over the cleared pyramid: big green pixel
  // text, an RGB-cycling border and the bot's fake hi-score — drawn fully in-canvas
  // so it matches the CRT look exactly (the DOM HI-SCORE taunt still runs above).
  function drawDemoCard(w, t) {
    const cx = C.VW / 2;
    const cy = 290;
    const cw = 500, ch = 140;

    // pop in over the opening frames, then fade out as the card is about to leave
    const pop = Math.min(1, (w.elapsed - (w.demoCardStart || 0)) / 320);
    const ease = 1 - Math.pow(1 - pop, 3);          // ease-out cubic
    const scale = 0.88 + 0.12 * ease;
    const out = Math.min(1, (w.demoClearT || 0) / 420);
    const alpha = Math.max(0, Math.min(1, ease) * out);

    const hue = (t * 0.08) % 360;                    // slow RGB cycle
    const y = cardShell(cx, cy, cw, ch, alpha, hue, scale);

    // big green pixel title
    cardText(STR.cards.roundComplete, cx, y + 46, 26, P.green, P.green);

    // divider
    const dg = ctx.createLinearGradient(cx - 140, 0, cx + 140, 0);
    dg.addColorStop(0, 'rgba(63,224,138,0)');
    dg.addColorStop(0.5, 'rgba(63,224,138,0.6)');
    dg.addColorStop(1, 'rgba(63,224,138,0)');
    ctx.strokeStyle = dg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 140, y + 74);
    ctx.lineTo(cx + 140, y + 74);
    ctx.stroke();

    // the bot's fake hi-score, padded like the real marquee — the game engine
    // animates demoScoreShown from 000000 up to demoScore during the first
    // second of the card, so the number visibly rolls in like a cabinet tally
    const shown = Math.max(0, Math.floor(w.demoScoreShown || 0));
    cardText(PM.STR.fmt(STR.cards.hiScore, { score: String(shown).padStart(6, '0') }), cx, y + 100, 14, P.amber, P.amber);

    // blinking INSERT COIN prompt (phased from the card start so it always
    // appears in the ON state as the card pops in)
    if (Math.floor((t - (w.demoCardStart || 0)) / 400) % 2 === 0) {
      cardText(STR.cards.insertCoin, cx, y + 124, 12, P.magenta, P.magenta);
    }
    ctx.restore();
  }

  // Real gameplay's level-complete card: LEVEL n CLEAR, the full bonus breakdown
  // and a blinking GET READY footer — the same chrome as the attract card, so
  // every level transition feels like the same machine.
  function drawLevelClearCard(w, t) {
    const cc = w.clearCard;
    const cx = C.VW / 2;
    const cy = 300;
    const cw = 560, ch = 250;

    const pop = Math.min(1, (w.elapsed - cc.start) / 320);
    const ease = 1 - Math.pow(1 - pop, 3);
    const scale = 0.88 + 0.12 * ease;
    const out = Math.min(1, (cc.start + cc.duration - w.elapsed) / 460);
    const alpha = Math.max(0, Math.min(1, ease) * out);

    const hue = (t * 0.08) % 360;
    const y = cardShell(cx, cy, cw, ch, alpha, hue, scale);

    cardText(PM.STR.fmt(STR.cards.levelClear, { n: cc.level }), cx, y + 40, 26, P.green, P.green);

    // divider
    const dg = ctx.createLinearGradient(cx - 160, 0, cx + 160, 0);
    dg.addColorStop(0, 'rgba(63,224,138,0)');
    dg.addColorStop(0.5, 'rgba(63,224,138,0.6)');
    dg.addColorStop(1, 'rgba(63,224,138,0)');
    ctx.strokeStyle = dg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 160, y + 70);
    ctx.lineTo(cx + 160, y + 70);
    ctx.stroke();

    // bonus breakdown rows (each row only appears when it applies)
    let row = y + 96;
    cardRow(cx, STR.cards.levelBonus, '+' + cc.base, row, P.cyan, 12);
    if (cc.unused > 0) {
      row += 24;
      cardRow(cx, PM.STR.fmt(STR.cards.servicePacks, { n: cc.unused }), '+' + cc.unusedBonus, row, P.cyan, 12);
    }
    if (cc.perfect > 0) {
      row += 24;
      cardRow(cx, STR.cards.perfectRound, '+' + cc.perfect, row, P.magenta, 12);
    }
    if (cc.reSecures > 0) {
      row += 24;
      cardRow(cx, PM.STR.fmt(STR.cards.reSecured, { n: cc.reSecures }), '+' + cc.reSecureBonus, row, P.green, 12);
    }

    // total divider + the combined payout
    const dg2 = ctx.createLinearGradient(cx - 200, 0, cx + 200, 0);
    dg2.addColorStop(0, 'rgba(255,177,61,0)');
    dg2.addColorStop(0.5, 'rgba(255,177,61,0.5)');
    dg2.addColorStop(1, 'rgba(255,177,61,0)');
    ctx.strokeStyle = dg2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 200, y + 192);
    ctx.lineTo(cx + 200, y + 192);
    ctx.stroke();
    cardRow(cx, STR.cards.totalBonus, '+' + cc.total, y + 214, P.amber, 14);

    // blinking next-level prompt
    if (Math.floor((t - cc.start) / 400) % 2 === 0) {
      cardText(PM.STR.fmt(STR.cards.getReady, { n: cc.level + 1 }), cx, y + 236, 12, P.magenta, P.magenta);
    }
    ctx.restore();
  }

  // The next-level card shown during the READY pause: LEVEL n (no CLEAR — that
  // belongs to the previous level's completion card), the port target, a hint
  // line of per-round intel and a blinking READY? — replaces the old DOM banner
  // so the whole transition stays inside the canvas. The intel flags come from
  // the world (readyCard.hackers / .multiPass, computed at level build time):
  // a red warning when hackers are live this round, otherwise the two-hop /
  // one-hop note so a player never gets surprised by the pass rule.
  function drawReadyCard(w, t) {
    const rc = w.readyCard;
    const cx = C.VW / 2, cy = 300, cw = 500, ch = 152;

    const pop = Math.min(1, (w.elapsed - rc.start) / 250);
    const ease = 1 - Math.pow(1 - pop, 3);
    const scale = 0.88 + 0.12 * ease;
    const out = Math.min(1, (rc.start + rc.duration - w.elapsed) / 400);
    const alpha = Math.max(0, Math.min(1, ease) * out);

    const hue = (t * 0.08) % 360;
    const y = cardShell(cx, cy, cw, ch, alpha, hue, scale);

    cardText(PM.STR.fmt(STR.cards.levelIntro, { n: rc.level }), cx, y + 38, 26, P.green, P.green);
    cardText(PM.STR.fmt(STR.cards.openAll, { n: rc.total }), cx, y + 76, 12, P.amber, null);

    // per-round intel: hackers outrank the pass note, one-hop is the quiet case
    let hint, hg;
    if (rc.hackers) { hint = STR.cards.hackersActive; hg = P.danger; }
    else if (rc.multiPass) { hint = STR.cards.portsNeedHops; hg = P.cyan; }
    else { hint = STR.cards.oneHopPorts; hg = P.green; }
    cardText(hint, cx, y + 102, 11, hg, hg);

    if (Math.floor((t - rc.start) / 400) % 2 === 0) {
      cardText(STR.cards.ready, cx, y + 132, 15, P.magenta, P.magenta);
    }
    ctx.restore();
  }

  /* ---- CRT effects ------------------------------------------------------------ */
  // Faint scanlines, chromatic aberration fringing the pyramid silhouette, and a
  // slow breathing vignette — drawn inside the canvas every frame so the CRT feel
  // survives any DOM overlay. Disabled together with the DOM filter (no-crt).
  function drawCRTOverlay(t, geo) {
    if (!ctx || !vigCtx || !scanCanvas) return;
    if (document.body.classList.contains('no-crt')) return;

    // 1) scanlines: thin darker bands every 3px (pre-rendered, one drawImage)
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.drawImage(scanCanvas, 0, 0, W, H);
    ctx.restore();

    // 2) chromatic aberration: the pyramid silhouette stroked twice, a red pass
    //    nudged left and a cyan pass nudged right, added with 'lighter' so the
    //    colour fringe only tints the lit edges instead of washing the screen
    const off = Math.max(1.4, geo.hw * 0.045);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(2, geo.hw * 0.09);
    ctx.lineJoin = 'round';
    pyramidOutline(ctx, geo, -off);
    ctx.strokeStyle = 'rgba(255,40,60,0.22)';
    ctx.stroke();
    pyramidOutline(ctx, geo, off);
    ctx.strokeStyle = 'rgba(40,220,255,0.19)';
    ctx.stroke();
    ctx.restore();

    // 3) breathing vignette: alpha swells slowly like a tube warming up
    const pulse = 0.55 + 0.12 * Math.sin(t * 0.0006);
    ctx.globalAlpha = Math.max(0.30, pulse);
    ctx.drawImage(vigCanvas, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // Traces the outer diamond silhouette of the pyramid in the current path,
  // offset horizontally by dx for the chromatic split.
  function pyramidOutline(ctx, geo, dx) {
    const baseW = (geo.rows - 1) * geo.hw;
    const by = geo.by + (geo.rows - 1) * geo.hh;
    ctx.beginPath();
    ctx.moveTo(geo.cx + dx, geo.by - geo.hh);
    ctx.lineTo(geo.cx + baseW + dx, by);
    ctx.lineTo(geo.cx + dx, by + geo.hh);
    ctx.lineTo(geo.cx - baseW + dx, by);
    ctx.closePath();
  }

  function entityRow(e) {
    if (e.state === 'hop') return (e.fromR + e.toR) / 2;
    if (e.state === 'fall') return e.fall.r + 1;
    return e.u + e.v;
  }
  function playerRow(p) {
    if (p.state === 'hop' || p.state === 'ride') return (p.hop.fromR + p.hop.toR) / 2;
    if (p.state === 'fall') return p.fall.r + 1;
    return p.u + p.v;
  }

  /* ---- misc helpers ----------------------------------------------------------- */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawMiniHead(g, x, y, s) {
    // used for the HUD lives icons
    g.fillStyle = P.playerOutline;
    g.fillRect(x - 5 * s, y + 9 * s, 6 * s, 4 * s);
    g.fillRect(x + 3 * s, y + 9 * s, 6 * s, 4 * s);
    g.fillStyle = P.playerBody;
    g.beginPath();
    g.roundRect ? g.roundRect(x - 7 * s, y - 5 * s, 14 * s, 15 * s, 3 * s) : g.rect(x - 7 * s, y - 5 * s, 14 * s, 15 * s);
    g.fill();
    g.fillStyle = P.playerVisor;
    g.fillRect(x - 6 * s, y - 2 * s, 12 * s, 5 * s);
    g.fillStyle = '#0a1020';
    g.beginPath();
    g.arc(x - 3 * s, y, 1.1 * s, 0, Math.PI * 2);
    g.arc(x + 3 * s, y, 1.1 * s, 0, Math.PI * 2);
    g.fill();
  }

  return {
    init, resize, cubeCenter, tileKey, drawWorld, drawMiniHead, roundRect,
    getW: () => C.VW, getH: () => C.VH,
  };
})();
