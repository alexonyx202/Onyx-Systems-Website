"use strict";
/* ============================================================
   DATA BREAK — shared utilities (pure helpers, no state)
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const TAU = Math.PI * 2;
  const _rnd = (() => {
    let s = 1337;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  })();

  const U = {
    TAU,
    PI: Math.PI,

    // ---- random ----
    rnd: _rnd,
    seed: (n) => { _rnd.seed = n; },
    rand: (a, b) => a + _rnd() * (b - a),
    randInt: (a, b) => Math.floor(a + _rnd() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(_rnd() * arr.length)],
    chance: (p) => _rnd() < p,

    // ---- math ----
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    damp: (a, b, lambda, dt) => U.lerp(a, b, 1 - Math.exp(-lambda * dt)),
    sign: (v) => (v < 0 ? -1 : v > 0 ? 1 : 0),
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    dist2: (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
    len: (x, y) => Math.hypot(x, y),
    norm: (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; },
    dot: (ax, ay, bx, by) => ax * bx + ay * by,
    angDiff: (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; },
    wrap: (v, a, b) => { const r = b - a; return ((v - a) % r + r) % r + a; },
    smooth: (t) => t * t * (3 - 2 * t),

    // ---- color ----
    rgb: (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`,
    rgba: (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`,
    hsl: (h, s, l, a) => a === undefined
      ? `hsl(${h},${s}%,${l}%)`
      : `hsla(${h},${s}%,${l}%,${a})`,
    mixHex: (c1, c2, t) => {
      const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
      const a = p(c1), b = p(c2);
      return U.rgb(U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t));
    },
    hexA: (hex, a) => {
      const p = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      return U.rgba(p[0], p[1], p[2], a);
    },

    // ---- formatting ----
    fmt: (n) => Math.floor(n).toLocaleString("en-US"),
    pad2: (n) => (n < 10 ? "0" : "") + n,

    // ---- misc ----
    uid: (() => { let i = 1; return () => i++; })(),
    now: () => performance.now(),
    tStamp: () => {
      const d = new Date();
      return `${d.getFullYear()}-${U.pad2(d.getMonth() + 1)}-${U.pad2(d.getDate())}`;
    }
  };

  R.Util = U;
})(window.BREAK);
