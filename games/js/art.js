"use strict";
/* ============================================================
   DATA BREAK — procedural art
   All sprites are drawn programmatically (original, no assets).
   Ships, scrubbers, data blocks, power-ups, hazards, bosses.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const U = R.Util;

  // colorblind-aware palette keys
  const PAL = {
    cyan:   "#22d3ee",
    blue:   "#60a5fa",
    indigo: "#818cf8",
    purple: "#c084fc",
    magenta:"#e879f9",
    green:  "#34d399",
    amber:  "#fbbf24",
    orange: "#fb923c",
    red:    "#fb7185",
    teal:   "#2dd4bf",
    white:  "#eaf6ff"
  };

  // block type -> colors + icon glyph id
  const BLOCK_STYLE = {
    normal:   { c: PAL.cyan,    c2: "#0e7490", ic: "bin" },
    binary:   { c: PAL.blue,    c2: "#1d4ed8", ic: "bits" },
    strong:   { c: PAL.green,   c2: "#047857", ic: "shield" },
    super:    { c: PAL.purple,  c2: "#6d28d9", ic: "lock" },
    steel:    { c: "#7d93b8",   c2: "#334155", ic: "hdd" },
    explosive:{ c: PAL.orange,  c2: "#c2410c", ic: "bomb" },
    moving:   { c: PAL.teal,    c2: "#0f766e", ic: "wave" },
    regen:    { c: "#a3e635",   c2: "#3f6212", ic: "refresh" },
    hidden:   { c: "#94a3b8",   c2: "#475569", ic: "ghost" },
    gravity:  { c: PAL.magenta, c2: "#86198f", ic: "grav" },
    splitter: { c: PAL.indigo,  c2: "#4338ca", ic: "split" },
    virus:    { c: PAL.red,     c2: "#9f1239", ic: "virus" },
    bomb:     { c: "#f97316",   c2: "#7c2d12", ic: "bomb2" },
    lock:     { c: PAL.amber,   c2: "#a16207", ic: "padlock" },
    shield:   { c: "#38bdf8",   c2: "#075985", ic: "shield2" },
    cache:    { c: "#fde047",   c2: "#a16207", ic: "gem" },
    prism:    { c: "#fef9c3",   c2: "#facc15", ic: "prism" },    // bright refractor
    flicker:  { c: "#a5b4fc",   c2: "#4c1d95", ic: "flicker" }  // dashed = phasing
  };

  // ---------------- level color themes (Ricochet-style field palettes) ----
  // Each world paints its plain-field bricks (normal/binary/strong/super) in
  // a vibrant multi-hue scheme; special blocks (explosive, virus, cache,
  // prism, steel, …) keep their identity colors so they pop against the
  // pattern. Placement schemes rotate per level — row bands, column bands,
  // checker weave, quadrants, concentric rings, gradient — so every
  // formation reads like a classic colored Ricochet wall.
  const THEMES = [
    { name: "Main Memory",  colors: ["#22d3ee", "#38bdf8", "#60a5fa", "#818cf8"] },
    { name: "Cache Cloud",  colors: ["#34d399", "#2dd4bf", "#4ade80", "#a3e635"] },
    { name: "Disk Array",   colors: ["#fbbf24", "#fb923c", "#f97316", "#f87171"] },
    { name: "Network Core", colors: ["#c084fc", "#e879f9", "#a78bfa", "#f472b6"] },
    { name: "Cloud Fabric", colors: ["#7dd3fc", "#60a5fa", "#818cf8", "#a5b4fc"] },
    { name: "BIOS",         colors: ["#a3e635", "#4ade80", "#34d399", "#2dd4bf"] },
    { name: "Kernel Space", colors: ["#a78bfa", "#c084fc", "#f472b6", "#fb7185"] },
    { name: "System Abyss", colors: ["#fb7185", "#f87171", "#e879f9", "#fb923c"] }
  ];

  // placement patterns, in rotation order (levels.js picks the scheme)
  const SCHEMES = ["rows", "cols", "checker", "quad", "ring", "gradient"];

  // darken a hex color by mixing toward black (fraction 0..1) — derives the
  // bevel shade for tinted bricks without a per-brick palette lookup
  function shadeHex(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * (1 - f));
    const g = Math.round(((n >> 8) & 255) * (1 - f));
    const b = Math.round((n & 255) * (1 - f));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // lighten a hex color by mixing toward white (fraction 0..1) — the lit-glyph
  // counterpart of shadeHex for dark plates
  function lightenHex(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * f);
    const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * f);
    const b = Math.round((n & 255) + (255 - (n & 255)) * f);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Glyph tone for a brick icon — a luminance-aware accent derived from the
  // brick's own color (theme tint for plain bricks, identity color for specials)
  // so the multicolor field reads as two-tone zones instead of white-on-color
  // marks. Bright plates get a dark engraved glyph; dark plates get a lit glyph.
  function iconAccent(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.55 ? shadeHex(hex, 0.42) : lightenHex(hex, 0.62);
  }

  // index into a theme's palette for a grid cell — shared by tintBricks and
  // the ship-select preview so the strip always matches the real field
  function schemeColorIdx(scheme, r, c, cols, rows, n) {
    if (scheme === "cols") return Math.floor(c / 3) % n;
    if (scheme === "checker") return (r * 2 + c) % n;            // diagonal weave, 3+ hues
    if (scheme === "quad") return (r < rows / 2 ? 0 : 2) + (c < cols / 2 ? 0 : 1);
    if (scheme === "ring") {
      const dr = Math.abs(c - (cols - 1) / 2);
      const dc = Math.abs(r - (rows - 1) / 2);
      return Math.floor(Math.max(dr, dc) / 2) % n;
    }
    if (scheme === "gradient") return Math.min(n - 1, Math.floor(r / rows * n));
    return Math.floor(r / 2) % n;                                 // rows: bands of two
  }

  // Paint the level's plain bricks with the theme. Deterministic per
  // (row, col, cols, rows) so resize rebuilds reapply the same pattern and
  // destroyed cells keep their look on re-bucket. Special block styles are
  // left untouched — their identity colors are gameplay-relevant.
  function tintBricks(engine, themeIdx, scheme) {
    const theme = THEMES[Math.max(0, themeIdx) % THEMES.length];
    if (!theme) return;
    const cols = Math.max(1, engine.cols || 12);
    let rows = 0;
    for (const b of engine.bricks) if (b.row + 1 > rows) rows = b.row + 1;
    rows = Math.max(1, rows);
    const n = theme.colors.length;
    for (const b of engine.bricks) {
      if (b.style === "normal" || b.style === "binary" || b.style === "strong" || b.style === "super") {
        b.tint = theme.colors[schemeColorIdx(scheme, b.row, b.col, cols, rows, n)];
        b.tint2 = shadeHex(b.tint, 0.45);
      }
    }
  }

  // Ship-select "up next" strip: a mini grid painted with the level's scheme
  // in its world's 4 hues (identical color math to tintBricks), plus a palette
  // legend. The caller sizes the canvas; pure data in -> pixels out.
  function drawThemePreview(ctx, info) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const colors = (info.colors && info.colors.length)
      ? info.colors : ["#94a3b8", "#7d93b8", "#64748b", "#475569"];
    const n = colors.length;
    const scheme = info.scheme || "rows";
    const cols = 12, rows = 6;
    // Math.max(1, ...) guards against tiny canvases (arcTo throws on negative radii)
    const cell = Math.max(1, Math.min(17, Math.floor((W - 24) / cols), Math.floor((H - 24 - 30) / rows)));
    const gw = cell * cols, gh = cell * rows;
    const gx = Math.round((W - gw) / 2), gy = 12;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tint = colors[schemeColorIdx(scheme, r, c, cols, rows, n)];
        const x = gx + c * cell, y = gy + r * cell, s = cell - 2;
        const rad = Math.max(2, s * 0.2);
        // body + top chamfer + bottom shade + crisp dark ring (mini brick look)
        ctx.fillStyle = U.hexA(tint, 0.95);
        rr(ctx, x, y, s, s, rad); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        rr(ctx, x, y, s, s * 0.3, rad); ctx.fill();
        ctx.fillStyle = U.hexA(shadeHex(tint, 0.45), 0.24);
        rr(ctx, x, y + s - s * 0.26, s, s * 0.26, rad); ctx.fill();
        ctx.strokeStyle = "rgba(2,8,18,0.85)";
        ctx.lineWidth = 1.2;
        rr(ctx, x, y, s, s, rad); ctx.stroke();
      }
    }
    // palette legend chips
    const chipW = 26, chipH = 12, gap = 8;
    const total = n * chipW + (n - 1) * gap;
    let cx = Math.round((W - total) / 2);
    const cy = H - 20;
    for (const col of colors) {
      ctx.fillStyle = U.hexA(col, 0.95);
      rr(ctx, cx, cy, chipW, chipH, 4); ctx.fill();
      ctx.strokeStyle = "rgba(2,8,18,0.85)";
      ctx.lineWidth = 1;
      rr(ctx, cx, cy, chipW, chipH, 4); ctx.stroke();
      cx += chipW + gap;
    }
  }


  // ---------------- ship definitions (drawing) ----------------
  const SHIP_DRAW = {
    laptop:   { body: "#38bdf8", acc: "#0ea5e9", glow: "rgba(56,189,248,", wing: "#0284c7" },
    server:   { body: "#f472b6", acc: "#ec4899", glow: "rgba(244,114,182,", wing: "#be185d" },
    ai:       { body: "#a78bfa", acc: "#8b5cf6", glow: "rgba(167,139,250,", wing: "#7c3aed" },
    cyber:    { body: "#34d399", acc: "#10b981", glow: "rgba(52,211,153,", wing: "#059669" },
    quantum:  { body: "#22d3ee", acc: "#06b6d4", glow: "rgba(34,211,238,", wing: "#0891b2" },
    mother:   { body: "#60a5fa", acc: "#3b82f6", glow: "rgba(96,165,250,", wing: "#2563eb" },
    firewall: { body: "#f87171", acc: "#ef4444", glow: "rgba(248,113,113,", wing: "#b91c1c" },
    cloud:    { body: "#e2e8f0", acc: "#cbd5e1", glow: "rgba(226,232,240,", wing: "#94a3b8" },
    net:      { body: "#fbbf24", acc: "#f59e0b", glow: "rgba(251,191,36,", wing: "#d97706" },
    kernel:   { body: "#c084fc", acc: "#a855f7", glow: "rgba(192,132,252,", wing: "#9333ea" }
  };

  // ---------------- scrubber styles ----------------
  const BALL_STYLE = {
    standard:  { c: PAL.cyan,    c2: "#ffffff", glow: "rgba(34,211,238,", trail: "34,211,238" },
    antivirus: { c: PAL.green,   c2: "#d9ffe9", glow: "rgba(52,211,153,", trail: "52,211,153" },
    quantum:   { c: PAL.teal,    c2: "#d7fffb", glow: "rgba(45,212,191,", trail: "45,212,191" },
    nano:      { c: PAL.blue,    c2: "#ffffff", glow: "rgba(96,165,250,", trail: "96,165,250" },
    magnetic:  { c: PAL.indigo,  c2: "#e2e8ff", glow: "rgba(129,140,248,", trail: "129,140,248" },
    laser:     { c: PAL.red,     c2: "#ffe1e1", glow: "rgba(248,113,113,", trail: "248,113,113" },
    compression:{c: PAL.purple,  c2: "#f3e8ff", glow: "rgba(192,132,252,", trail: "192,132,252" },
    emp:       { c: PAL.magenta, c2: "#ffe4ff", glow: "rgba(232,121,249,", trail: "232,121,249" },
    breaker:   { c: PAL.orange,  c2: "#fff3e0", glow: "rgba(251,146,60,",  trail: "251,146,60" },
    duo:       { c: PAL.white,   c2: "#c7f9ff", glow: "rgba(234,246,255,", trail: "234,246,255" },
    multicore: { c: "#67e8f9",   c2: "#ffffff", glow: "rgba(103,232,249,", trail: "103,232,249" },
    vacuum:    { c: "#5eead4",   c2: "#ccfff5", glow: "rgba(94,234,212,",  trail: "94,234,212" }
  };

  function rrPath(ctx, x, y, w, h, r) {
    // append a rounded-rect subpath WITHOUT resetting the current path — used
    // by batched draws (many shapes fed into one beginPath/fill call). rr()
    // wraps it with beginPath for single shapes. (The batched render path in
    // engine.js must call rrPath, not rr: rr's beginPath would wipe the shared
    // path each iteration and only the LAST shape would paint.)
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    rrPath(ctx, x, y, w, h, r);
  }

  // ---------------- icon glyphs (tiny vector set) ----------------
  const ICONS = {
    bin(ctx, s) { // microchip
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = s * 0.09;
      ctx.strokeRect(-s * 0.34, -s * 0.34, s * 0.68, s * 0.68);
      ctx.fillRect(-s * 0.18, -s * 0.18, s * 0.36, s * 0.36);
      for (let i = -1; i <= 1; i += 2) {
        ctx.fillRect(i * s * 0.4, -s * 0.12, s * 0.1, s * 0.24);
        ctx.fillRect(-s * 0.12, i * s * 0.4, s * 0.24, s * 0.1);
      }
    },
    bits(ctx, s) { // binary 0/1
      ctx.font = `bold ${s * 0.5}px monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("0", -s * 0.22, -s * 0.22);
      ctx.fillText("1", s * 0.24, s * 0.26);
      ctx.fillText("1", -s * 0.24, s * 0.28);
    },
    shield(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.45);
      ctx.lineTo(s * 0.4, -s * 0.3);
      ctx.lineTo(s * 0.4, s * 0.05);
      ctx.quadraticCurveTo(s * 0.4, s * 0.35, 0, s * 0.5);
      ctx.quadraticCurveTo(-s * 0.4, s * 0.35, -s * 0.4, s * 0.05);
      ctx.lineTo(-s * 0.4, -s * 0.3);
      ctx.closePath(); ctx.fill();
    },
    lock(ctx, s) {
      ctx.fillRect(-s * 0.3, -s * 0.1, s * 0.6, s * 0.42);
      ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.22, Math.PI, 0); ctx.lineTo(s * 0.22, -s * 0.05); ctx.lineTo(-s * 0.22, -s * 0.05); ctx.closePath(); ctx.fill();
      ctx.clearRect(-s * 0.05, 0, s * 0.1, s * 0.18);
    },
    hdd(ctx, s) {
      ctx.fillRect(-s * 0.4, -s * 0.32, s * 0.8, s * 0.64);
      ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.arc(-s * 0.14, 0, s * 0.14, 0, Math.PI * 2); ctx.stroke();
      ctx.fillRect(s * 0.08, -s * 0.1, s * 0.2, s * 0.08);
      ctx.fillRect(s * 0.08, s * 0.05, s * 0.14, s * 0.08);
    },
    bomb(ctx, s) {
      ctx.beginPath(); ctx.arc(0, s * 0.06, s * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-s * 0.05, -s * 0.4, s * 0.1, s * 0.24);
      ctx.fillRect(s * 0.04, -s * 0.46, s * 0.16, s * 0.08);
    },
    wave(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, 0);
      ctx.quadraticCurveTo(-s * 0.2, -s * 0.32, 0, 0);
      ctx.quadraticCurveTo(s * 0.2, s * 0.32, s * 0.4, 0);
      ctx.lineWidth = s * 0.13; ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
    },
    refresh(ctx, s) {
      ctx.lineWidth = s * 0.12; ctx.strokeStyle = ctx.fillStyle; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, 0, s * 0.3, -0.6, Math.PI * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.05, -s * 0.42); ctx.lineTo(s * 0.26, -s * 0.18); ctx.lineTo(-s * 0.1, -s * 0.12); ctx.closePath(); ctx.fill();
    },
    ghost(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.26, -s * 0.4);
      ctx.lineTo(s * 0.26, -s * 0.4);
      ctx.lineTo(s * 0.26, s * 0.26);
      ctx.lineTo(s * 0.12, s * 0.16);
      ctx.lineTo(0, s * 0.28);
      ctx.lineTo(-s * 0.12, s * 0.16);
      ctx.lineTo(-s * 0.26, s * 0.26);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.14, s * 0.05, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.14, s * 0.05, 0, 7); ctx.fill();
    },
    grav(ctx, s) {
      ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, s * 0.16, s * 0.2, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fill();
    },
    split(ctx, s) {
      ctx.lineWidth = s * 0.12; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.32); ctx.lineTo(-s * 0.3, s * 0.32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.32); ctx.lineTo(s * 0.3, s * 0.32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.26, -s * 0.22); ctx.stroke();
    },
    virus(ctx, s) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const a = i * (Math.PI * 2 / 3);
        ctx.arc(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3, s * 0.11, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(Math.cos(a) * s * 0.15, Math.sin(a) * s * 0.15, s * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill(); ctx.fillStyle = ctx.strokeStyle;
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.12, 0, Math.PI * 2); ctx.fill();
    },
    bomb2(ctx, s) {
      ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = s * 0.07;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.13, 0, Math.PI * 2); ctx.stroke();
    },
    padlock(ctx, s) {
      ctx.beginPath(); ctx.arc(0, -s * 0.18, s * 0.16, Math.PI, 0); ctx.lineTo(s * 0.16, -s * 0.12); ctx.lineTo(-s * 0.16, -s * 0.12); ctx.closePath(); ctx.fill();
      ctx.fillRect(-s * 0.26, -s * 0.1, s * 0.52, s * 0.38);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath(); ctx.arc(0, s * 0.04, s * 0.06, 0, 7); ctx.fill();
    },
    shield2(ctx, s) {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.44); ctx.lineTo(s * 0.4, -s * 0.3); ctx.lineTo(s * 0.34, s * 0.12);
      ctx.quadraticCurveTo(s * 0.2, s * 0.4, 0, s * 0.48);
      ctx.quadraticCurveTo(-s * 0.2, s * 0.4, -s * 0.34, s * 0.12);
      ctx.lineTo(-s * 0.4, -s * 0.3); ctx.closePath(); ctx.fill();
    },
    gem(ctx, s) { // diamond cache cell
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.42);
      ctx.lineTo(s * 0.32, -s * 0.12);
      ctx.lineTo(0, s * 0.42);
      ctx.lineTo(-s * 0.32, -s * 0.12);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.42);
      ctx.lineTo(s * 0.32, -s * 0.12);
      ctx.lineTo(0, s * 0.42);
      ctx.closePath(); ctx.fill();
    },
    prism(ctx, s) { // triangular refractor
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.42);
      ctx.lineTo(s * 0.38, s * 0.24);
      ctx.lineTo(-s * 0.38, s * 0.24);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.42);
      ctx.lineTo(s * 0.38, s * 0.24);
      ctx.lineTo(0, s * 0.04);
      ctx.closePath(); ctx.fill();
    },
    flicker(ctx, s) { // dashed outline = phasing in/out
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = s * 0.09;
      ctx.setLineDash([s * 0.1, s * 0.07]);
      ctx.strokeRect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64);
      ctx.setLineDash([]);
      ctx.fillRect(-s * 0.06, -s * 0.06, s * 0.12, s * 0.12);
    },
    up(ctx, s) { ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(s * 0.3, s * 0.12); ctx.lineTo(-s * 0.3, s * 0.12); ctx.closePath(); ctx.fill(); },
    down(ctx, s) { ctx.beginPath(); ctx.moveTo(0, s * 0.4); ctx.lineTo(s * 0.3, -s * 0.12); ctx.lineTo(-s * 0.3, -s * 0.12); ctx.closePath(); ctx.fill(); },
    heart(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.4);
      ctx.bezierCurveTo(-s * 0.5, 0, -s * 0.3, -s * 0.4, 0, -s * 0.12);
      ctx.bezierCurveTo(s * 0.3, -s * 0.4, s * 0.5, 0, 0, s * 0.4);
      ctx.closePath(); ctx.fill();
    },
    plus(ctx, s) { ctx.fillRect(-s * 0.12, -s * 0.4, s * 0.24, s * 0.8); ctx.fillRect(-s * 0.4, -s * 0.12, s * 0.8, s * 0.24); },
    star(ctx, s) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s * 0.42 : s * 0.18;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    },
    bolt(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(s * 0.12, -s * 0.45); ctx.lineTo(-s * 0.28, s * 0.08); ctx.lineTo(-s * 0.02, s * 0.08);
      ctx.lineTo(-s * 0.12, s * 0.45); ctx.lineTo(s * 0.28, -s * 0.08); ctx.lineTo(s * 0.02, -s * 0.08);
      ctx.closePath(); ctx.fill();
    },
    snow(ctx, s) {
      ctx.lineWidth = s * 0.09; ctx.strokeStyle = ctx.fillStyle; ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4); ctx.lineTo(-Math.cos(a) * s * 0.4, -Math.sin(a) * s * 0.4); ctx.stroke();
      }
    },
    flame(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.45);
      ctx.bezierCurveTo(-s * 0.3, s * 0.12, -s * 0.14, -s * 0.1, 0, -s * 0.45);
      ctx.bezierCurveTo(s * 0.14, -s * 0.1, s * 0.3, s * 0.12, 0, s * 0.45);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath(); ctx.arc(0, s * 0.12, s * 0.1, 0, 7); ctx.fill();
    },
    magnet(ctx, s) {
      ctx.fillRect(-s * 0.3, -s * 0.42, s * 0.18, s * 0.56);
      ctx.fillRect(s * 0.12, -s * 0.42, s * 0.18, s * 0.56);
      ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.14); ctx.quadraticCurveTo(0, s * 0.42, s * 0.3, s * 0.14); ctx.lineTo(s * 0.3, s * 0.42); ctx.lineTo(-s * 0.3, s * 0.42); ctx.closePath(); ctx.fill();
    },
    x2(ctx, s) {
      ctx.font = `bold ${s * 0.5}px monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("2x", 0, 0);
    },
    clock(ctx, s) {
      ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = s * 0.05;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.14, s * 0.08); ctx.stroke();
    },
    ghost2(ctx, s) { ICONS.ghost(ctx, s); },
    ring(ctx, s) {
      ctx.lineWidth = s * 0.12; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2); ctx.fill();
    },
    drone(ctx, s) {
      ctx.fillRect(-s * 0.3, -s * 0.2, s * 0.6, s * 0.16);
      ctx.beginPath(); ctx.arc(0, -s * 0.28, s * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.14); ctx.lineTo(-s * 0.4, -s * 0.02); ctx.lineTo(-s * 0.2, -s * 0.02); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.14); ctx.lineTo(s * 0.4, -s * 0.02); ctx.lineTo(s * 0.2, -s * 0.02); ctx.closePath(); ctx.fill();
    },
    dmg2(ctx, s) { ctx.font = `bold ${s * 0.42}px monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("2", 0, 0); },
    dmg3(ctx, s) { ctx.font = `bold ${s * 0.42}px monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("3", 0, 0); },
    vac(ctx, s) {
      ctx.lineWidth = s * 0.1; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0.4, Math.PI * 2 - 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.34 * Math.cos(0.4), s * 0.34 * Math.sin(0.4)); ctx.lineTo(s * 0.5, s * 0.1); ctx.stroke();
    },
    cookie(ctx, s) {
      ctx.beginPath(); ctx.arc(0, 0, s * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      [[-0.12, -0.12], [0.14, -0.16], [0.16, 0.1], [-0.05, 0.18], [-0.18, 0.05]].forEach((p) => {
        ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, s * 0.05, 0, 7); ctx.fill();
      });
    },
    wifi(ctx, s) {
      ctx.lineWidth = s * 0.1; ctx.strokeStyle = ctx.fillStyle; ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const r = s * 0.16 + i * s * 0.11;
        ctx.beginPath(); ctx.arc(0, -s * 0.02, r, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, s * 0.2, s * 0.05, 0, 7); ctx.fill();
    },
    chaos(ctx, s) { // snarled wires — bad capsule
      ctx.lineWidth = s * 0.09; ctx.strokeStyle = ctx.fillStyle; ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const a0 = i * (Math.PI * 2 / 3) + 0.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a0) * s * 0.34, Math.sin(a0) * s * 0.34);
        ctx.quadraticCurveTo(
          Math.cos(a0 + 0.9) * s * 0.2, Math.sin(a0 + 0.9) * s * 0.2,
          -Math.cos(a0) * s * 0.3, -Math.sin(a0) * s * 0.3);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.12, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    },
    drain(ctx, s) { // leaking plug — bad capsule
      ctx.fillRect(-s * 0.14, -s * 0.4, s * 0.28, s * 0.26);
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.14); ctx.lineTo(s * 0.3, -s * 0.14); ctx.lineTo(s * 0.12, s * 0.3); ctx.lineTo(-s * 0.12, s * 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.arc(0, s * 0.42, s * 0.07, 0, 7); ctx.fill();
    }
  };

  // icon glyphs are cached to tiny sprites (rendered once at 2.4x and blitted
  // via drawImage). The vector paths are only rasterized on first use, so a
  // full brick grid costs one cheap blit per icon instead of a save/translate/
  // scale/restore + path + fill per glyph per frame.
  const iconCache = {};
  function icon(ctx, name, x, y, size, color) {
    if (!ICONS[name]) return;
    const key = name + "|" + (color || "");
    let spr = iconCache[key];
    if (!spr) {
      // bound the sprite cache: each (name,color) pair is a 96x96 canvas, and
      // per-brick accent colors multiply entries — clear wholesale once it
      // gets fat (re-rasterization is a handful of tiny draws on next use)
      if (Object.keys(iconCache).length > 120) {
        for (const k in iconCache) delete iconCache[k];
      }
      spr = document.createElement("canvas");
      spr.width = 96;
      spr.height = 96;
      const g = spr.getContext("2d");
      g.save();
      g.translate(48, 48);
      g.fillStyle = color;
      g.strokeStyle = color;
      g.scale(2.4, 2.4);
      ICONS[name](g, 40);
      g.restore();
      iconCache[key] = spr;
    }
    ctx.drawImage(spr, x - size / 2, y - size / 2, size, size);
  }

  // ---------------- blocks ----------------
  function drawBlock(ctx, b, t) {
    const st = BLOCK_STYLE[b.style] || BLOCK_STYLE.normal;
    const { x, y, w, h } = b;
    // prisms shimmer, regenerators breathe; flicker blocks go translucent and
    // faded while ghost (same ghost flag hidden bricks use, self-managed).
    const pulse = b.style === "regen" ? 0.5 + 0.5 * Math.sin(t * 3 + b.x)
      : b.style === "prism" ? 0.65 + 0.35 * Math.sin(t * 6 + b.x) : 1;
    const ghost = (b.style === "hidden" || b.style === "flicker") && b.hiddenState === "ghost";
    // level-theme tint overrides the style color (special blocks have no tint
    // and keep their identity color)
    const tintC = b.tint || st.c;
    const col = ghost ? "rgba(148,163,184,0.18)" : U.hexA(tintC, 0.95 * pulse);
    const glowOn = R.Save.setting("glow");
    const cx = x + w / 2, cy = y + h / 2;

    ctx.save();
    if (b.shake) { ctx.translate((Math.random() - 0.5) * b.shake, (Math.random() - 0.5) * b.shake); }

    // soft outer halo — two flat translucent fills instead of a radial
    // gradient: createRadialGradient per brick per frame is a heavy CPU cost
    // (and shadowBlur is worse). The stacked washes read as a soft glow.
    if (glowOn && !ghost) {
      ctx.fillStyle = U.hexA(tintC, 0.16 * pulse);
      rr(ctx, x - w * 0.18, y - h * 0.18, w * 1.36, h * 1.36, 12);
      ctx.fill();
      ctx.fillStyle = U.hexA(tintC, 0.10 * pulse);
      rr(ctx, x - w * 0.4, y - h * 0.4, w * 1.8, h * 1.8, 16);
      ctx.fill();
    }
    if (b.flash > 0) {
      // transient hit-flash on a handful of bricks — cheap enough to keep
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 18 * b.flash;
    }
    // body
    rr(ctx, x, y, w, h, 7);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (!ghost) {
      // gloss bevel: solid top highlight (a per-brick linear gradient is a
      // big CPU cost across a full grid; the flat band carries the depth)
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      rr(ctx, x, y, w, h * 0.28, 7);
      ctx.fill();
      // thin bright chamfer line on the top edge
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      rr(ctx, x, y, w, 4, 3);
      ctx.fill();
      // bottom shade band (bevel depth) — tinted to the brick's darkened hue
      // when themed, matching the batched render path
      ctx.fillStyle = U.hexA(b.tint2 || "#000000", 0.24);
      const sh = Math.max(6, h * 0.26);
      rr(ctx, x, y + h - sh, w, sh, 7);
      ctx.fill();
      // crisp dark outer ring (the batched path draws the same ring)
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = "rgba(2,8,18,0.85)";
      rr(ctx, x, y, w, h, 7);
      ctx.stroke();

      // inner accent border (brighter, pop — tinted to match the body)
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = U.hexA(tintC, 1);
      rr(ctx, x + 3, y + 3, w - 6, h - 6, 5);
      ctx.stroke();
      // inner dark frame adds contrast
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      rr(ctx, x + 7, y + 7, w - 14, h - 14, 4);
      ctx.stroke();

      // corner screws (light ring + dark center) — matches the batched path
      const sr = Math.max(1.6, w * 0.045);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(x + 6, y + 6, sr, 0, Math.PI * 2);
      ctx.arc(x + w - 6, y + 6, sr, 0, Math.PI * 2);
      ctx.arc(x + 6, y + h - 6, sr, 0, Math.PI * 2);
      ctx.arc(x + w - 6, y + h - 6, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(2,8,18,0.55)";
      ctx.beginPath();
      const sd = Math.max(0.8, w * 0.022);
      ctx.arc(x + 6, y + 6, sd, 0, Math.PI * 2);
      ctx.arc(x + w - 6, y + 6, sd, 0, Math.PI * 2);
      ctx.arc(x + 6, y + h - 6, sd, 0, Math.PI * 2);
      ctx.arc(x + w - 6, y + h - 6, sd, 0, Math.PI * 2);
      ctx.fill();
    }

    // icon (crisp glyph tinted to the brick's color — accent tone derived from
    // the theme tint or the style's identity color; the halo carries the glow)
    if (!ghost) {
      icon(ctx, st.ic, cx, cy, Math.min(24, h * 0.62), U.hexA(iconAccent(b.tint || st.c), glowOn ? 0.98 : 0.9));
    } else {
      ctx.font = `${Math.min(16, h * 0.5)}px monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(148,163,184,0.35)";
      ctx.fillText("?", cx, cy);
    }
    // hp pips (track slot + filled pips showing remaining HP)
    if (b.maxHp > 1 && !ghost && b.style !== "steel" && b.style !== "shield") {
      const n = b.maxHp - 1;
      const pw = Math.max(4, w * 0.11);
      const gap = 5;
      const total = n * pw + (n - 1) * gap;
      let px = x + w / 2 - total / 2;
      const py = y + h - 8;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(px - 1, py - 1, total + 2, 6);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      for (let i = 0; i < n; i++) {
        if (i < b.hp - 1) ctx.fillRect(px, py, pw, 4);
        px += pw + gap;
      }
    }
    ctx.restore();
  }

  // ---------------- ball / scrubber ----------------
  function drawBall(ctx, ball, t) {
    const st = BALL_STYLE[ball.kind] || BALL_STYLE.standard;
    const r = ball.r;
    const glowOn = R.Save.setting("glow");
    const pulse = 0.75 + 0.25 * Math.sin(t * 5 + ball.x);
    ctx.save();
    ctx.translate(ball.x, ball.y);
    // glow halo (pulsing) — flat translucent disc; the shell + core gradients
    // below already carry the depth, so a cheap fill reads nearly identically
    if (glowOn) {
      const gr = r * (2.1 + 0.35 * pulse);
      ctx.fillStyle = st.glow + (0.14 * pulse) + ")";
      ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.fill();
      // orbit ring
      ctx.strokeStyle = st.glow + (0.35 * pulse) + ")";
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.55, t * 1.6, t * 1.6 + 1.4); ctx.stroke();
    }
    // shell (higher contrast: brighter top-left, deeper shadow bottom-right)
    const g2 = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.08, 0, 0, r);
    g2.addColorStop(0, "#ffffff");
    g2.addColorStop(0.3, st.c2);
    g2.addColorStop(0.62, st.c);
    g2.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // inner core (hot center)
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
    core.addColorStop(0, "#ffffff");
    core.addColorStop(0.7, st.glow + "0.9)");
    core.addColorStop(1, st.glow + "0)");
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill();
    // spin ring (white, brighter)
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.85, t * 4 + ball.x, t * 4 + ball.x + 1.3); ctx.stroke();
    // specular sparkle
    if (glowOn) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.14, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------- power-up capsules ----------------
  function drawPowerup(ctx, p, t) {
    const def = R.Powerups.KINDS[p.kind];
    if (!def) return;
    const r = R.Config.POWERUP_R;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(t * 2 + p.y * 0.01) * 0.12);
    const glowOn = R.Save.setting("glow");
    if (glowOn) {
      // flat halo circle instead of shadowBlur (shadowBlur is very expensive)
      ctx.fillStyle = U.hexA(def.color, 0.16);
      ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "rgba(6,12,24,0.92)";
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, Math.PI * 2); ctx.stroke();
    // inner ring
    ctx.strokeStyle = U.hexA(def.color, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r - 7, 0, Math.PI * 2); ctx.stroke();
    icon(ctx, def.icon, 0, 0, 28, "#eaf6ff");
    ctx.restore();
  }

  // ---------------- ship (paddle) ----------------
  function drawShip(ctx, x, y, w, h, shipId, opts) {
    const o = opts || {};
    const def = SHIP_DRAW[shipId] || SHIP_DRAW.laptop;
    const bank = o.bank || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bank * R.Config.PADDLE_BANK_RENDER);

    const glowOn = R.Save.setting("glow");
    const tt = o.t || 0;

    // engine under-glow (flickering, layered)
    if (glowOn) {
      const flick = 0.7 + 0.3 * Math.sin(tt * 26);
      const g = ctx.createLinearGradient(0, h * 0.35, 0, h * 1.6);
      g.addColorStop(0, def.glow + (0.5 * flick) + ")");
      g.addColorStop(1, def.glow + "0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, h * 0.95, w * 0.34, h * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      // pool glow on the field
      const pool = ctx.createRadialGradient(0, h * 0.7, w * 0.1, 0, h * 0.7, w * 0.75);
      pool.addColorStop(0, def.glow + (0.22 * flick) + ")");
      pool.addColorStop(1, def.glow + "0)");
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.ellipse(0, h * 0.7, w * 0.75, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }

    // ---- wings (kept silhouette, now dual-tone with fins) ----
    ctx.fillStyle = def.wing;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.1);
    ctx.lineTo(-w * 0.68, h * 0.3);
    ctx.lineTo(-w * 0.42, h * 0.2);
    ctx.lineTo(-w * 0.3, -h * 0.05);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.5, -h * 0.1);
    ctx.lineTo(w * 0.68, h * 0.3);
    ctx.lineTo(w * 0.42, h * 0.2);
    ctx.lineTo(w * 0.3, -h * 0.05);
    ctx.closePath(); ctx.fill();
    // darker underwing panel
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.moveTo(-w * 0.48, -h * 0.06);
    ctx.lineTo(-w * 0.64, h * 0.24);
    ctx.lineTo(-w * 0.46, h * 0.18);
    ctx.lineTo(-w * 0.36, -h * 0.02);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.48, -h * 0.06);
    ctx.lineTo(w * 0.64, h * 0.24);
    ctx.lineTo(w * 0.46, h * 0.18);
    ctx.lineTo(w * 0.36, -h * 0.02);
    ctx.closePath(); ctx.fill();
    // leading-edge highlight
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.1); ctx.lineTo(-w * 0.68, h * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.5, -h * 0.1); ctx.lineTo(w * 0.68, h * 0.3);
    ctx.stroke();
    if (glowOn) {
      ctx.strokeStyle = def.glow + "0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, -h * 0.1); ctx.lineTo(-w * 0.68, h * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.5, -h * 0.1); ctx.lineTo(w * 0.68, h * 0.3);
      ctx.stroke();
    }
    // wingtip fins
    ctx.fillStyle = def.wing;
    ctx.beginPath();
    ctx.moveTo(-w * 0.66, h * 0.24);
    ctx.lineTo(-w * 0.7, h * 0.12);
    ctx.lineTo(-w * 0.74, h * 0.28);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.66, h * 0.24);
    ctx.lineTo(w * 0.7, h * 0.12);
    ctx.lineTo(w * 0.74, h * 0.28);
    ctx.closePath(); ctx.fill();
    // wing tip nav lights (port/starboard blink; radius scales with w so the
    // 40x14 HUD lives icons don't get lights half their own height)
    const wl = 0.5 + 0.5 * Math.sin(tt * 10);
    const nlr = Math.max(1, w * 0.015);
    ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.65 * wl})`;
    ctx.beginPath(); ctx.arc(-w * 0.68, h * 0.3, nlr + wl * nlr * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.68, h * 0.3, nlr + wl * nlr * 0.8, 0, Math.PI * 2); ctx.fill();

    // ---- hull ----
    const g2 = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g2.addColorStop(0, "#ffffff");
    g2.addColorStop(0.22, def.body);
    g2.addColorStop(1, def.wing);
    ctx.fillStyle = g2;
    rr(ctx, -w * 0.32, -h * 0.42, w * 0.64, h * 0.9, h * 0.42);
    ctx.fill();
    // hull outline: glow line + crisp dark rim
    if (glowOn) {
      ctx.strokeStyle = def.glow + "0.7)";
      ctx.lineWidth = 1.4;
      rr(ctx, -w * 0.32, -h * 0.42, w * 0.64, h * 0.9, h * 0.42);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(2,8,18,0.5)";
    ctx.lineWidth = 1;
    rr(ctx, -w * 0.32, -h * 0.42, w * 0.64, h * 0.9, h * 0.42);
    ctx.stroke();
    // top sheen
    const sheen = ctx.createLinearGradient(0, -h * 0.42, 0, -h * 0.05);
    sheen.addColorStop(0, "rgba(255,255,255,0.55)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    rr(ctx, -w * 0.3, -h * 0.42, w * 0.6, h * 0.5, h * 0.3);
    ctx.fill();
    // nose deck highlight (front cap)
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    rr(ctx, -w * 0.24, -h * 0.42, w * 0.48, h * 0.1, h * 0.05);
    ctx.fill();
    // bottom keel shade (depth)
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    rr(ctx, -w * 0.28, h * 0.16, w * 0.56, h * 0.26, h * 0.12);
    ctx.fill();
    // side cooling vents (rear slots)
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 0; k < 3; k++) {
        ctx.fillRect(s * w * 0.275, h * 0.14 + k * h * 0.055, w * 0.03, h * 0.032);
      }
    }
    // panel seams
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w * 0.24, h * 0.04); ctx.lineTo(w * 0.24, h * 0.04);
    ctx.moveTo(-w * 0.24, h * 0.08); ctx.lineTo(w * 0.24, h * 0.08);
    ctx.stroke();

    // ---- cockpit canopy (elongated glass, glint) ----
    const cg = ctx.createLinearGradient(0, -h * 0.36, 0, -h * 0.06);
    cg.addColorStop(0, "#eaf6ff");
    cg.addColorStop(0.5, def.body);
    cg.addColorStop(1, def.glow + "0.85)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(-w * 0.15, -h * 0.34);
    ctx.lineTo(w * 0.15, -h * 0.34);
    ctx.lineTo(w * 0.11, -h * 0.06);
    ctx.lineTo(-w * 0.11, -h * 0.06);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // canopy glint
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.moveTo(-w * 0.09, -h * 0.28);
    ctx.lineTo(-w * 0.04, -h * 0.12);
    ctx.stroke();

    // ---- center spine data lights (running) ----
    const rl = 0.5 + 0.5 * Math.sin(tt * 5);
    ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * rl})`;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(-w * 0.2 + k * w * 0.13, h * 0.02, Math.max(1, w * 0.008), 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- accent stripes (chevron, rear) + energy line ----
    ctx.fillStyle = def.acc;
    ctx.beginPath();
    ctx.moveTo(-w * 0.24, h * 0.2);
    ctx.lineTo(w * 0.24, h * 0.2);
    ctx.lineTo(w * 0.28, h * 0.26);
    ctx.lineTo(-w * 0.28, h * 0.26);
    ctx.closePath(); ctx.fill();
    if (glowOn) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      const ex = ((tt * 120) % (w * 0.56));
      ctx.fillRect(-w * 0.28 + ex - w * 0.08, h * 0.2, w * 0.08, h * 0.06);
    }

    // ---- rear engine nacelles (under-slung pods drawn AFTER the hull so
    // they read as real engine housing — drawn before it, the hull would
    // have painted over them) ----
    ctx.fillStyle = def.wing;
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, h * 0.28);
    ctx.lineTo(-w * 0.18, h * 0.28);
    ctx.lineTo(-w * 0.15, h * 0.5);
    ctx.lineTo(-w * 0.28, h * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.18, h * 0.28);
    ctx.lineTo(w * 0.3, h * 0.28);
    ctx.lineTo(w * 0.28, h * 0.5);
    ctx.lineTo(w * 0.15, h * 0.5);
    ctx.closePath(); ctx.fill();
    // pod top highlight
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w * 0.29, h * 0.3); ctx.lineTo(-w * 0.17, h * 0.3);
    ctx.moveTo(w * 0.17, h * 0.3); ctx.lineTo(w * 0.29, h * 0.3);
    ctx.stroke();
    // nozzle mouths (dark)
    ctx.fillStyle = "rgba(4,10,20,0.85)";
    ctx.fillRect(-w * 0.265, h * 0.42, w * 0.105, h * 0.05);
    ctx.fillRect(w * 0.16, h * 0.42, w * 0.105, h * 0.05);

    // ---- thruster flames (tongues out of the nozzle mouths) ----
    const fl = 0.6 + 0.4 * Math.sin(tt * 24);
    ctx.fillStyle = `rgba(255,220,140,${fl})`;
    ctx.beginPath(); ctx.ellipse(-w * 0.2125, h * 0.47, w * 0.05, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.2125, h * 0.47, w * 0.05, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    // hot cores
    ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * fl})`;
    ctx.beginPath(); ctx.ellipse(-w * 0.2125, h * 0.46, w * 0.022, h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.2125, h * 0.46, w * 0.022, h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------------- friendly entities ----------------
  function drawDrone(ctx, d, t) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.fillStyle = "#38bdf8";
    rr(ctx, -14, -8, 28, 16, 5); ctx.fill();
    ctx.fillStyle = "#0ea5e9";
    ctx.fillRect(-14, -8, 28, 5);
    // rotors
    ctx.strokeStyle = "rgba(56,189,248,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-10, -12, 8, 3, t * 20, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(10, -12, 8, 3, t * 20, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#eaf6ff";
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------------- boss ----------------
  const BOSS_ART = {
    0: { name: "Virus King", c: "#fb7185", c2: "#9f1239", shape: "virus" },
    1: { name: "Firewall Guardian", c: "#fbbf24", c2: "#b45309", shape: "wall" },
    2: { name: "Corrupted Server", c: "#a78bfa", c2: "#5b21b6", shape: "server" },
    3: { name: "Quantum CPU", c: "#22d3ee", c2: "#0e7490", shape: "cpu" },
    4: { name: "Cloud Overlord", c: "#e2e8f0", c2: "#64748b", shape: "cloud" },
    5: { name: "Mega Database", c: "#34d399", c2: "#065f46", shape: "db" },
    6: { name: "AI Core", c: "#c084fc", c2: "#7e22ce", shape: "ai" },
    7: { name: "Malware Hive", c: "#f97316", c2: "#7c2d12", shape: "hive" }
  };

  function drawBoss(ctx, boss, t) {
    const art = BOSS_ART[boss.id] || BOSS_ART[0];
    ctx.save();
    ctx.translate(boss.x, boss.y);
    const wob = Math.sin(t * 2) * 4;

    if (R.Save.setting("glow")) {
      ctx.shadowColor = art.c;
      ctx.shadowBlur = 26;
    }
    // body per shape
    const bw = boss.w, bh = boss.h;
    ctx.fillStyle = art.c;

    if (art.shape === "virus") {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + t * 0.3;
        ctx.beginPath(); ctx.arc(Math.cos(a) * bw * 0.42, Math.sin(a) * bh * 0.42 + wob, 16, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, wob, bw * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = art.c2;
      ctx.beginPath(); ctx.arc(0, wob, bw * 0.2, 0, Math.PI * 2); ctx.fill();
    } else if (art.shape === "wall") {
      rr(ctx, -bw / 2, -bh / 2, bw, bh, 12); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      for (let i = -3; i <= 3; i++) {
        rr(ctx, i * bw * 0.24 - 8, -bh / 2 + 14, 16, bh - 28, 4); ctx.fill();
      }
      ctx.fillStyle = "#fff3c4";
      ctx.beginPath(); ctx.arc(0, wob, 18, 0, Math.PI * 2); ctx.fill();
    } else if (art.shape === "server") {
      rr(ctx, -bw / 2, -bh / 2, bw, bh, 10); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let i = 0; i < 4; i++) {
        rr(ctx, -bw * 0.34, -bh * 0.3 + i * bh * 0.22, bw * 0.68, bh * 0.16, 3); ctx.fill();
      }
      ctx.fillStyle = "#34d399";
      ctx.beginPath(); ctx.arc(bw * 0.3, -bh * 0.3, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bw * 0.3, -bh * 0.08, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bw * 0.3, bh * 0.14, 6, 0, Math.PI * 2); ctx.fill();
    } else if (art.shape === "cpu") {
      rr(ctx, -bw / 2, -bh / 2, bw, bh, 8); ctx.fill();
      ctx.strokeStyle = art.c2; ctx.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + t * 0.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * bw * 0.5, Math.sin(a) * bh * 0.5);
        ctx.lineTo(Math.cos(a) * bw * 0.7, Math.sin(a) * bh * 0.7);
        ctx.stroke();
      }
      ctx.fillStyle = "#0a0f1c";
      rr(ctx, -bw * 0.28, -bh * 0.28, bw * 0.56, bh * 0.56, 6); ctx.fill();
      ctx.fillStyle = "#67e8f9";
      ctx.beginPath(); ctx.arc(0, wob * 0.3, 10, 0, Math.PI * 2); ctx.fill();
    } else if (art.shape === "cloud") {
      for (const off of [[-60, 20], [-20, 0], [30, 14], [10, -18], [60, 24]]) {
        ctx.beginPath(); ctx.arc(off[0], off[1] + wob, 30, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(-20, wob - 20, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(20, wob - 6, 8, 0, Math.PI * 2); ctx.fill();
    } else if (art.shape === "db") {
      ctx.fillStyle = art.c;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, -bh * 0.26 + i * bh * 0.26 + wob * 0.2, bw * 0.46, bh * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = art.c2;
      rr(ctx, -bw * 0.3, -bh * 0.32 + wob * 0.2, bw * 0.6, bh * 0.6, 8); ctx.fill();
      ctx.fillStyle = "#d1fae5";
      ctx.beginPath(); ctx.arc(0, wob * 0.2, 12, 0, Math.PI * 2); ctx.fill();
    } else if (art.shape === "ai") {
      rr(ctx, -bw / 2, -bh / 2, bw, bh, 20); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 3;
      rr(ctx, -bw * 0.38, -bh * 0.38, bw * 0.76, bh * 0.76, 12); ctx.stroke();
      ctx.fillStyle = "#0a0f1c";
      ctx.beginPath(); ctx.arc(0, wob * 0.3, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#c084fc";
      ctx.beginPath(); ctx.arc(0, wob * 0.3, 8, 0, Math.PI * 2); ctx.fill();
    } else { // hive
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + t * 0.5;
        ctx.beginPath(); ctx.arc(Math.cos(a) * bw * 0.38, Math.sin(a) * bh * 0.38 + wob, 14, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, wob, bw * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7c2d12";
      ctx.beginPath(); ctx.arc(0, wob, bw * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fde68a";
      ctx.beginPath(); ctx.arc(0, wob, 6, 0, Math.PI * 2); ctx.fill();
    }

    // hp ring
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, wob, bw * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(0, wob, bw * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * boss.hp / boss.maxHp);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------- mini-bosses (elite encounters) ----------------
  const MINI_ART = {
    0: { name: "Packet Siphon",    c: "#fbbf24", c2: "#92400e", shape: "core" },
    1: { name: "Sector Sentinel",  c: "#22d3ee", c2: "#0e7490", shape: "sentinel" },
    2: { name: "Cloud Wisp",      c: "#a78bfa", c2: "#5b21b6", shape: "wisp" },
    3: { name: "Kernel Gate",     c: "#34d399", c2: "#065f46", shape: "gate" }
  };

  // Small drifting cores that summon a single brick formation and drop a
  // capsule shower when purged — visually distinct from the eight main bosses
  // (smaller bodies, tighter palette, always drawn with a mini HP bar).
  function drawMiniBoss(ctx, boss, t) {
    const art = MINI_ART[boss.id] || MINI_ART[0];
    ctx.save();
    ctx.translate(boss.x, boss.y);
    const wob = Math.sin(t * 3) * 3;
    const bw = boss.w, bh = boss.h;

    if (R.Save.setting("glow")) {
      ctx.shadowColor = art.c;
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = art.c;

    if (art.shape === "core") {
      // rotating hex core with orbiting shards
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + t * 0.6;
        const px = Math.cos(a) * bw * 0.3, py = Math.sin(a) * bh * 0.3 + wob;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3 - t * 1.4;
        ctx.fillStyle = art.c2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * bw * 0.46, Math.sin(a) * bh * 0.46 + wob, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = art.c2;
      ctx.beginPath(); ctx.arc(0, wob, bw * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff7cc";
      ctx.beginPath(); ctx.arc(0, wob, bw * 0.05, 0, Math.PI * 2); ctx.fill();
    } else if (art.shape === "sentinel") {
      // rotating arc segments around a solid eye
      ctx.strokeStyle = art.c;
      ctx.lineWidth = Math.max(5, bh * 0.09);
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const a0 = i * Math.PI * 2 / 3 + t * 1.2;
        ctx.beginPath(); ctx.arc(0, wob, bw * 0.34, a0, a0 + 1.1); ctx.stroke();
      }
      ctx.fillStyle = art.c2;
      ctx.beginPath(); ctx.arc(0, wob, bw * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#cffafe";
      ctx.beginPath(); ctx.arc(0, wob, bw * 0.06, 0, Math.PI * 2); ctx.fill();
    } else if (art.shape === "wisp") {
      // pulsing cloud blob
      const pu = 1 + 0.12 * Math.sin(t * 4);
      for (const off of [[-42, 20], [-14, -4], [22, 12], [8, -24], [46, 22]]) {
        ctx.beginPath();
        ctx.arc(off[0] * pu * 0.82, off[1] * pu * 0.82 + wob, 20 * pu, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#f3e8ff";
      ctx.beginPath(); ctx.arc(-10, wob - 16, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12, wob - 2, 6, 0, Math.PI * 2); ctx.fill();
    } else { // gate
      rr(ctx, -bw / 2, -bh / 2, bw, bh, 8); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let i = 0; i < 4; i++) {
        rr(ctx, -bw * 0.32, -bh * 0.26 + i * bh * 0.17, bw * 0.64, bh * 0.1, 3); ctx.fill();
      }
      ctx.fillStyle = "#d1fae5";
      ctx.beginPath(); ctx.arc(0, wob, 8, 0, Math.PI * 2); ctx.fill();
    }

    ctx.shadowBlur = 0;
    // compact HP bar floating above the core
    const bw2 = bw * 1.1, bh2 = 5;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    rr(ctx, -bw2 / 2, -bh / 2 - 14, bw2, bh2, 2); ctx.fill();
    ctx.fillStyle = art.c;
    rr(ctx, -bw2 / 2, -bh / 2 - 14, Math.max(0, bw2 * U.clamp(boss.hp / boss.maxHp, 0, 1)), bh2, 2); ctx.fill();
    ctx.restore();
  }

  const Art = {
    PAL, BLOCK_STYLE, THEMES, SCHEMES, BALL_STYLE, SHIP_DRAW, BOSS_ART, MINI_ART,
    icon, rr, rrPath, drawBlock, drawBall, drawPowerup, drawShip,
    drawDrone, drawBoss, drawMiniBoss, shadeHex, lightenHex, iconAccent, tintBricks,
    schemeColorIdx, drawThemePreview
  };

  R.Art = Art;
})(window.BREAK);
