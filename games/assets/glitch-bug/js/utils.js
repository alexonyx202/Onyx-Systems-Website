/* ============================================================
   GLITCH BUG — utils.js
   Math helpers, bitmap font, sprite renderer, storage.
   ============================================================ */
'use strict';

const TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

/* ---------------- SEEDED RNG ----------------
   A per-run seed makes every rand/randi/choice/chance call reproducible:
   the foundation for daily fields and replays. mulberry32 is tiny, fast,
   and good enough for game randomness. With no seed set, behavior is
   unchanged (Math.random). setRngSeed(seed) pins the whole game to a seed
   (start the run with it for full-run determinism); withSeed(seed, fn)
   scopes a seed to one call for deterministic blocks like fillField.
   NOTE: all gameplay/visual randomness is now routed through these helpers.
   The only remaining Math.random uses are the audio noise-buffer fills in
   audio.js — sound is output-only and never read back into game state — and
   draw-time performance.now() oscillators (e.g. the centipede head glow),
   which are purely cosmetic. A seeded run therefore replays deterministically
   end-to-end. Lifecycle: startRun() pins each run to its runSeed (random per
   run unless passed explicitly); startAttractWorld() resets so the demo stays
   varied. dailySeed() provides the deterministic per-day seed for the Daily
   Field. Prefer withSeed() for scoped determinism. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rng = Math.random; // the active source; swapped when a seed is set
function setRngSeed(seed) { _rng = mulberry32(seed >>> 0); }
function resetRng() { _rng = Math.random; }
function withSeed(seed, fn) {
  const prev = _rng;
  _rng = mulberry32(seed >>> 0);
  try { return fn(); }
  finally { _rng = prev; }
}

function rand(a, b) { return a + _rng() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function choice(arr) { return arr[Math.floor(_rng() * arr.length)]; }
function chance(p) { return _rng() < p; }
function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }

/* ---------------- DAILY SEED ----------------
   The Daily Field pins every player to the same field for a whole calendar
   day. FNV-1a is stable across sessions and browsers (no locale/string
   formatting variance), so the same date always hashes to the same seed. */
function hashString(str) {
  let h = 0x811C9DC5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/* Deterministic per-calendar-day seed (UTC — the Daily Field is a SHARED
   challenge, so the same date must yield the same field for every player
   regardless of timezone; it changes at UTC midnight). Pass a Date for
   deterministic testing. */
function dailySeed(date) {
  const d = date || new Date();
  const key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  return hashString(key);
}

/* ---------------- 5x7 BITMAP FONT ---------------- */
const FONT = {};
(function buildFont() {
  const G = {
    'A':['01110','10001','10001','11111','10001','10001','10001'],
    'B':['11110','10001','10001','11110','10001','10001','11110'],
    'C':['01110','10001','10000','10000','10000','10001','01110'],
    'D':['11110','10001','10001','10001','10001','10001','11110'],
    'E':['11111','10000','10000','11110','10000','10000','11111'],
    'F':['11111','10000','10000','11110','10000','10000','10000'],
    'G':['01110','10001','10000','10111','10001','10001','01111'],
    'H':['10001','10001','10001','11111','10001','10001','10001'],
    'I':['11111','00100','00100','00100','00100','00100','11111'],
    'J':['00111','00010','00010','00010','10010','10010','01100'],
    'K':['10001','10010','10100','11000','10100','10010','10001'],
    'L':['10000','10000','10000','10000','10000','10000','11111'],
    'M':['10001','11011','10101','10101','10001','10001','10001'],
    'N':['10001','11001','10101','10011','10001','10001','10001'],
    'O':['01110','10001','10001','10001','10001','10001','01110'],
    'P':['11110','10001','10001','11110','10000','10000','10000'],
    'Q':['01110','10001','10001','10001','10101','10010','01101'],
    'R':['11110','10001','10001','11110','10100','10010','10001'],
    'S':['01111','10000','10000','01110','00001','00001','11110'],
    'T':['11111','00100','00100','00100','00100','00100','00100'],
    'U':['10001','10001','10001','10001','10001','10001','01110'],
    'V':['10001','10001','10001','10001','10001','01010','00100'],
    'W':['10001','10001','10001','10101','10101','11011','10001'],
    'X':['10001','10001','01010','00100','01010','10001','10001'],
    'Y':['10001','10001','01010','00100','00100','00100','00100'],
    'Z':['11111','00001','00010','00100','01000','10000','11111'],
    '0':['01110','10001','10011','10101','11001','10001','01110'],
    '1':['00100','01100','00100','00100','00100','00100','01110'],
    '2':['01110','10001','00001','00110','01000','10000','11111'],
    '3':['11110','00001','00001','01110','00001','00001','11110'],
    '4':['00010','00110','01010','10010','11111','00010','00010'],
    '5':['11111','10000','11110','00001','00001','10001','01110'],
    '6':['00110','01000','10000','11110','10001','10001','01110'],
    '7':['11111','00001','00010','00100','01000','01000','01000'],
    '8':['01110','10001','10001','01110','10001','10001','01110'],
    '9':['01110','10001','10001','01111','00001','00010','01100'],
    ' ':['00000','00000','00000','00000','00000','00000','00000'],
    '!':['00100','00100','00100','00100','00100','00000','00100'],
    '?':['01110','10001','00001','00110','00100','00000','00100'],
    '.':['00000','00000','00000','00000','00000','00110','00110'],
    ':':['00000','00110','00110','00000','00110','00110','00000'],
    ',':['00000','00000','00000','00000','00110','00110','00100'],
    '-':['00000','00000','00000','11111','00000','00000','00000'],
    '+':['00000','00100','00100','11111','00100','00100','00000'],
    '*':['00000','10101','01110','11111','01110','10101','00000'],
    '/':['00001','00010','00100','01000','10000','00000','00000'],
    '=':['00000','00000','11111','00000','11111','00000','00000'],
    'x':['00000','00000','10001','01010','00100','01010','10001'],
    '\'':['00100','00100','00000','00000','00000','00000','00000'],
    '(':['00010','00100','01000','01000','01000','00100','00010'],
    ')':['01000','00100','00010','00010','00010','00100','01000'],
    '<':['00010','00100','01000','10000','01000','00100','00010'],
    '>':['01000','00100','00010','00001','00010','00100','01000'],
    '&':['01100','10010','10100','01000','10101','10010','01101'],
    '%':['11001','11010','00100','01000','10110','00110','00000'],
    '[':['01110','01000','01000','01000','01000','01000','01110'],
    ']':['01110','00010','00010','00010','00010','00010','01110'],
  };
  // sanitize: replace unknown chars with space
  FONT.draw = function (ctx, text, x, y, scale, color, alpha) {
    const s = scale || 1;
    const c = color || '#fff';
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = c;
    let cx = x;
    const textUp = String(text).toUpperCase();
    for (let i = 0; i < textUp.length; i++) {
      const g = G[textUp[i]] || G[' '];
      for (let r = 0; r < 7; r++) {
        const row = g[r];
        for (let c2 = 0; c2 < 5; c2++) {
          if (row[c2] === '1') ctx.fillRect(cx + c2 * s, y + r * s, s, s);
        }
      }
      cx += 6 * s;
    }
    ctx.globalAlpha = 1;
    return cx - x;
  };
  FONT.width = function (text, s) {
    return String(text).length * 6 * (s || 1);
  };
  FONT.drawCentered = function (ctx, text, cx, y, scale, color, alpha) {
    const w = FONT.width(text, scale);
    return FONT.draw(ctx, text, Math.round(cx - w / 2), y, scale, color, alpha);
  };
})();

/* ---------------- SPRITE RENDERER (pixel maps) ---------------- */
function makeSprite(rows, palette) {
  // rows: array of strings; palette: map char -> color
  const cells = [];
  let w = 0;
  for (let r = 0; r < rows.length; r++) {
    w = Math.max(w, rows[r].length);
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch !== '.' && ch !== ' ') {
        const col = palette[ch];
        if (col) cells.push([c, r, col]);
      }
    }
  }
  return { w, h: rows.length, cells };
}

function drawSprite(ctx, sprite, px, py, scale) {
  const s = scale || 1;
  for (let i = 0; i < sprite.cells.length; i++) {
    const cell = sprite.cells[i];
    ctx.fillStyle = cell[2];
    ctx.fillRect(px + cell[0] * s, py + cell[1] * s, s, s);
  }
}

/* Non-uniform scale (for squash-and-stretch). px/py = top-left of the 8x8 cell. */
function drawSpriteStretch(ctx, sprite, px, py, sx, sy) {
  for (let i = 0; i < sprite.cells.length; i++) {
    const cell = sprite.cells[i];
    ctx.fillStyle = cell[2];
    ctx.fillRect(px + cell[0] * sx, py + cell[1] * sy, Math.max(1, sx), Math.max(1, sy));
  }
}

/* ---------------- STORAGE ---------------- */
const Store = {
  _ok: (function () {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (e) { return false; }
  })(),
  get(key, fallback) {
    if (!this._ok) return fallback;
    try {
      const v = localStorage.getItem('glitchbug.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, val) {
    if (!this._ok) return;
    try { localStorage.setItem('glitchbug.' + key, JSON.stringify(val)); } catch (e) {}
  }
};

/* ---------------- HIGH SCORES ---------------- */
const HighScores = {
  MAX: 10,
  load() {
    const list = Store.get('scores', []);
    return Array.isArray(list) ? list : [];
  },
  save(list) { Store.set('scores', list.slice(0, this.MAX)); },
  qualifies(score) {
    if (score <= 0) return false;
    const list = this.load();
    if (list.length < this.MAX) return true;
    return score > list[list.length - 1].score;
  },
  add(entry) {
    const list = this.load();
    list.push({ name: entry.name || 'AAA', score: entry.score || 0, level: entry.level || 1, date: Date.now() });
    list.sort((a, b) => b.score - a.score);
    list.length = Math.min(list.length, this.MAX);
    this.save(list);
    return list;
  },
  best() { return this.load()[0] || null; }
};

/* ---------------- ID HELPERS ---------------- */
let _idCounter = 0;
function nextId() { return ++_idCounter; }
