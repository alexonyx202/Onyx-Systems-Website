/* ============================================================
   GLITCH BUG — entities.js
   All gameplay entities + pixel-art sprite definitions.
   ============================================================ */
'use strict';

/* ---------------- SPRITES ---------------- */
const SPR = {
  player: makeSprite([
    '..X..X..',
    '.XXXXXX.',
    'XXXXXXXX',
    'XXhXXhXX',
    'XXXXXXXX',
    '.XXXXXX.',
    '..e..e..',
  ], { X: '#00e5ff', h: '#e8f6ff', e: '#ff2d95' }),

  seg: makeSprite([
    '.XXXXXX.',
    'XXXXXXXX',
    'XXhXXXXX',
    'XXXXXXXX',
    'XXXXXXhX',
    'XXXXXXXX',
    '.XXXXXX.',
  ], { X: '#ff5a3c', h: '#ffe9c9' }),

  head: makeSprite([
    'h..XX..h',
    '..XXXX..',
    '.XXXXXX.',
    'XXXXhXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    '.XXXXXX.',
  ], { X: '#ff5a3c', h: '#ffe94a' }),

  milliHead: makeSprite([
    'h..XX..h',
    '..XXXX..',
    '.XXXXXX.',
    'XXXXhXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    '.XXXXXX.',
  ], { X: '#9d4dff', h: '#e8f6ff' }),

  spider: makeSprite([
    'X..XX..X.',
    'X.XXXX.X.',
    '.XXXXXX..',
    'X.XXXX.X.',
    'X..XX..X.',
    'X..XX..X.',
    '.........',
    '.........',
  ], { X: '#ff2d95' }),

  flea: makeSprite([
    '..X.X..',
    '.XXXXX.',
    'XXXXXXX',
    'XhXhXhX',
    'XXXXXXX',
    '.X.X.X.',
    '.X.X.X.',
    '.X.X.X.',
    '..X.X..',
  ], { X: '#4aff6a', h: '#0a4a12' }),

  scorpion: makeSprite([
    '..XXXX..',
    '.XXXXXX.',
    'XXXXXXXX',
    'XhXXhXXh',
    'X..XX..X',
    '.X....X.',
  ], { X: '#ff3b30', h: '#ffb0a0' }),

  virus: makeSprite([
    '.X.XX.X.',
    'XXXXXXX.',
    'XXhXXXXX',
    'XXXXXXX.',
    'XXhXXXXX',
    'XXXXXXX.',
    '.X.XX.X.',
    '........',
  ], { X: '#ff2d95', h: '#ffd700' }),

  capsule: makeSprite([
    '..XXXX..',
    '.XXXXXX.',
    'XXXXXXXX',
    'XXXXXX..',
    'XXXXXX..',
    'XXXXXXXX',
    '.XXXXXX.',
    '..XXXX..',
  ], { X: '#ffffff' }),
};

/* Faithful to the original arcade: every body segment is the SAME color and
   only the HEAD is a different color — that contrast is how the 1980 cabinet
   picked out the leader at a glance. Like the original (which cycled its
   pastel palettes every level), the centipede's body hue rotates level by
   level — one uniform color per bug, never a rainbow — while its red head
   stays fixed so the leader always pops. The millipede keeps its data-purple
   and the bonus swarm stays blazing gold, so creature identity reads at a
   glance. */
const CENT_HEAD = '#ff3355', CENT_EYE = '#ffffff', CENT_ANT = '#ffe94a', CENT_LO = '#a01a28';

/* Level body-hue cycle: phosphor-tinted hues that never collide with the
   red head, the cyan ship, the magenta poison, the green mushroom field, or
   the gold bonus swarm (a gold centipede on a normal level would steal the
   swarm's jackpot identity). Level 1 keeps the classic CRT-lime; each level
   steps to the next hue, wrapping every 7 levels. */
const CENT_BODY_CYCLE = ['#9dff3a', '#4d9dff', '#ffb000', '#b06cff', '#ffa7c4', '#ff7a3c', '#e8f6ff'];

/* the current level's body hue — the single source of truth for both the
   sprite and the burst/glow colors, so they can never drift apart */
function centBodyColor(level) { return CENT_BODY_CYCLE[(Math.max(1, level) - 1) % CENT_BODY_CYCLE.length]; }

/* blend hex color `a` toward `b` by t (0..1) — derives the per-hue glint
   and belly shade so every level's body keeps the 3-tone beetle look */
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t;
  const g = ((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t;
  const bl = (pa & 255) + ((pb & 255) - (pa & 255)) * t;
  return '#' + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(bl)).toString(16).slice(1);
}

/* The glossy beetle body — bright top-left glint, soft belly shade, chunky
   rounded outline — rendered in the current level's hue */
function centBodySprFor(level) {
  const X = centBodyColor(level);
  return makeSprite([
    '.XXXXXX.',
    'XhXXXXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    'XXXXXXhX',
    'XXXkkXX.',
    '.XXXXXX.',
  ], { X, h: mixHex(X, '#ffffff', 0.55), k: mixHex(X, '#05070d', 0.6) });
}

const MILLI_BODY = '#aa55ff', MILLI_HI = '#d9b8ff', MILLI_LO = '#4a2378';
const MILLI_HEAD = '#ff55cc', MILLI_EYE = '#ffffff', MILLI_ANT = '#ffd1ec', MILLI_LO2 = '#8a2b5e';

const SWARM_BODY = '#ffd700', SWARM_HI = '#fff3b0', SWARM_LO = '#8a6a00';
const SWARM_HEAD = '#ffffff', SWARM_EYE = '#ffd700', SWARM_ANT = '#ffe94a', SWARM_LO2 = '#c9a500';

const milliSpr = makeSprite([
  '.XXXXXX.',
  'XhXXXXXX',
  'XXXXXXXX',
  'XXXXXXXX',
  'XXXXXXhX',
  'XXXkkXX.',
  '.XXXXXX.',
], { X: MILLI_BODY, h: MILLI_HI, k: MILLI_LO });

const swarmSpr = makeSprite([
  '.XXXXXX.',
  'XhXXXXXX',
  'XXXXXXXX',
  'XXXXXXXX',
  'XXXXXXhX',
  'XXXkkXX.',
  '.XXXXXX.',
], { X: SWARM_BODY, h: SWARM_HI, k: SWARM_LO });

/* Head — same outline as the body but a different color: antennae tips,
   two bright eyes, and a shaded mandible for sharp pixel detail */
const headSpr = makeSprite([
  'a..XX..a',
  '..XXXX..',
  '.XXXXXX.',
  'XXeXXeXX',
  'XXXXXXXX',
  'XXXkkXXX',
  '.XXXXXX.',
], { X: CENT_HEAD, a: CENT_ANT, e: CENT_EYE, k: CENT_LO });

const milliHeadSpr = makeSprite([
  'a..XX..a',
  '..XXXX..',
  '.XXXXXX.',
  'XXeXXeXX',
  'XXXXXXXX',
  'XXXkkXXX',
  '.XXXXXX.',
], { X: MILLI_HEAD, a: MILLI_ANT, e: MILLI_EYE, k: MILLI_LO2 });

const swarmHeadSpr = makeSprite([
  'a..XX..a',
  '..XXXX..',
  '.XXXXXX.',
  'XXeXXeXX',
  'XXXXXXXX',
  'XXXkkXXX',
  '.XXXXXX.',
], { X: SWARM_HEAD, a: SWARM_ANT, e: SWARM_EYE, k: SWARM_LO2 });

/* ---------------- BUG QUEEN (boss) sprites ----------------
   Every pixel = 2 game pixels (drawn at scale 2 → 16x16 cells).
   q purple armor · c gold crown · w/p eyes · r angry · o open core */
const queenHeadSpr = makeSprite([
  'c.c.c.c.',
  '.cccccc.',
  'qqqqqqqq',
  'qwwqqwwq',
  'qppqqppq',
  'qqqqqqqq',
  '.qqqqqq.',
  '.q..q..q',
], { c: '#ffe94a', q: '#9d4dff', w: '#ffffff', p: '#ff2d95' });

/* core open — her weakness exposed */
const queenHeadOpenSpr = makeSprite([
  'c.c.c.c.',
  '.cccccc.',
  'qrrqqrrq',
  'qooooooq',
  'qooooooq',
  '.oooooo.',
  '.qqqqqq.',
  '.q..q..q',
], { c: '#ffe94a', q: '#9d4dff', r: '#ff2d95', o: '#ffb000' });

/* berserk — armor sealed, eyes burning */
const queenHeadAngrySpr = makeSprite([
  'c.c.c.c.',
  '.cccccc.',
  'qrrqqrrq',
  'qrrqqrrq',
  'qqqqqqqq',
  'qqqqqqqq',
  '.qqqqqq.',
  '.q..q..q',
], { c: '#ffe94a', q: '#9d4dff', r: '#ff2d95' });

const queenSegSpr = makeSprite([
  '.XXXXXX.',
  'XXXXhXXX',
  'XhXXXXXX',
  'XXXXXXXh',
  '.XXooXX.',
  '.XXXXXX.',
  '.XXXXXX.',
  '..xxxx..',
], { X: '#9d4dff', h: '#e8f6ff', o: '#241038', x: '#5b2a86' });

/* eye open — this segment can be hurt by bullets */
const queenSegEyeSpr = makeSprite([
  '.XXXXXX.',
  'XXXXhXXX',
  'XhXXXXXX',
  'XXXXXXXh',
  '.XXOOXX.',
  '.XXXXXX.',
  '.XXXXXX.',
  '..xxxx..',
], { X: '#9d4dff', h: '#e8f6ff', O: '#ffe94a', x: '#5b2a86' });

/* ============================================================
   PLAYER
   ============================================================ */
class Player {
  constructor(g) {
    this.g = g;
    this.x = g.W / 2;
    this.y = g.playerSpawnY(); // mid-band spawn — full zone reachable both ways
    this.r = 6;
    this.alive = true;
    this.respawnT = 0;
    this.invulnT = 0;
    this.shieldT = 0;
    this.overclockT = 0;
    this.fireCd = 0;
    this.autoFire = true;
    this.diedAt = 0;
  }

  update(dt) {
    const g = this.g;
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.alive = true;
        this.x = g.W / 2;
        this.y = g.playerSpawnY();
        this.invulnT = 2.2;
        g.spawnProtect = 2.2;
      }
      return;
    }

    // movement
    const speed = g.diff.playerSpeed * g.playerSpeedFactor();
    let mx = 0, my = 0;
    if (Input.touchMode) {
      const dx = Input.touchX - this.x;
      const dy = Input.touchY - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) { mx = dx / d; my = dy / d; }
    } else if (Input.gamepadActive) {
      // analog stick / D-Pad — deadzoned + normalized in input.js
      mx = Input.gamepadX; my = Input.gamepadY;
    } else if (Input.mouseActive && g.controlMode !== 'keyboard') {
      const dx = Input.mouseX - this.x;
      const dy = Input.mouseY - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) { mx = dx / d; my = dy / d; }
    } else {
      mx = Input.padX; my = Input.padY;
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    this.x += mx * speed * dt;
    this.y += my * speed * dt;
    this.x = clamp(this.x, 4, g.W - 4);
    // hard stop at the player-zone boundary: the blob can never climb into
    // the mushroom field. Mushrooms themselves never block the player —
    // within the zone it passes straight through them. The clamp spans the
    // ENTIRE zone below the field (boundary line → screen bottom) so the
    // blob can traverse its full height, not a shrunken middle band. The
    // +1 top / -3 bottom insets fit the 7px sprite (drawn at y-3): its
    // antennae may kiss the boundary line while the feet stay on-screen.
    this.y = clamp(this.y, g.PLAY_ZONE * g.CELL + g.HUD_H + 1, g.H - 3);

    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.shieldT > 0) this.shieldT -= dt;
    if (this.overclockT > 0) this.overclockT -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;

    // engine trail
    if (chance(0.4)) {
      Particles.spawn(this.x + rand(-3, 3), this.y + 5, {
        vx: rand(-8, 8), vy: rand(14, 26), life: rand(0.15, 0.3),
        size: 1, color: '#00e5ff', drag: 0.9,
      });
    }

    // firing (gamepad A / RT is a held-fire like the mouse button; any fire
    // source works — a hybrid player can steer with the stick and click too)
    const fire = (Input.mouseDown && !Input.touchMode) || Input.actionDown('fire') || (Input.touchMode && this.autoFire) || Input.gamepadActionHeld('fire');
    if (fire && this.fireCd <= 0) {
      g.fireWeapon(this);
      this.fireCd = g.weapon.fireInterval / 1000 * (this.overclockT > 0 ? 1 / 2.5 : 1);
    }
  }

  draw(ctx) {
    const g = this.g;
    if (!this.alive) return;
    // flicker while invulnerable
    if (this.invulnT > 0 && Math.floor(this.invulnT * 12) % 2 === 0) return;

    const px = Math.round(this.x) - 4;
    const py = Math.round(this.y) - 3;
    if (this.overclockT > 0) {
      ctx.fillStyle = 'rgba(0,229,255,0.25)';
      ctx.fillRect(this.x - 9, this.y - 6, 18, 13);
    }
    drawSprite(ctx, SPR.player, px, py, 1);

    if (this.shieldT > 0) {
      ctx.strokeStyle = this.shieldT < 3 && Math.floor(this.shieldT * 6) % 2 === 0 ? '#ff2d95' : '#39ff14';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 10, 0, TAU);
      ctx.stroke();
    }
  }

  hit() {
    const g = this.g;
    if (this.invulnT > 0 || !this.alive) return false;
    if (this.shieldT > 0) {
      // shield absorbs: blast nearby mushrooms
      this.shieldT = 0;
      g.shieldBreak(this.x, this.y);
      this.invulnT = 1.2;
      AudioSys.sfx.shield();
      Particles.ring(this.x, this.y, '#39ff14', 140, 0.4);
      return true; // survived
    }
    this.alive = false;
    g.loseLife(this.x, this.y);
    return true;
  }
}

/* ============================================================
   BULLETS
   ============================================================ */
class Bullet {
  constructor(g, x, y, vx, vy, opts) {
    this.g = g;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.pierce = !!(opts && opts.pierce);
    this.damage = (opts && opts.damage) || 1;
    this.w = this.pierce ? 1 : 1;
    this.h = 6;
    this.dead = false;
    this.hitSet = new Set();
  }
  update(dt) {
    const g = this.g;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < g.HUD_H - 6 || this.y > g.H + 6 || this.x < -4 || this.x > g.W + 4) this.dead = true;
  }
  draw(ctx) {
    if (this.pierce) {
      ctx.fillStyle = '#ffe94a';
      ctx.fillRect(this.x - 1, this.y - 7, 2, 9);
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x, this.y - 6, 1, 5);
    } else {
      ctx.fillStyle = '#ffb000';
      ctx.fillRect(this.x - 1, this.y - 3, 2, 6);
      ctx.fillStyle = '#fff8e0';
      ctx.fillRect(this.x, this.y - 3, 1, 3);
    }
  }
}

/* ============================================================
   SMART MISSILE (homing)
   ============================================================ */
class Missile {
  constructor(g, x, y) {
    this.g = g;
    this.x = x; this.y = y;
    this.speed = 150;
    this.life = 4;
    this.dead = false;
    this.target = null;
  }
  update(dt) {
    this.life -= dt;
    // re-acquire the target every frame so homing tracks moving bugs — a
    // one-shot snapshot would fly to a stale spot and miss a drifting queen
    this.target = this.g.findEnemy(this.x, this.y);
    if (this.target) {
      const dx = this.target.px - this.x, dy = this.target.py - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) { this.x += dx / d * this.speed * dt; this.y += dy / d * this.speed * dt; }
    } else {
      this.y -= this.speed * dt;
    }
    if (this.life <= 0 || this.y < this.g.HUD_H - 4) this.dead = true;
    Particles.spawn(this.x, this.y, { vx: 0, vy: 20, life: 0.15, size: 1, color: '#ff2d95' });
  }
  draw(ctx) {
    ctx.fillStyle = '#ff2d95';
    ctx.fillRect(this.x - 1, this.y - 2, 2, 4);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(this.x - 1, this.y - 3, 2, 2);
  }
}

/* ============================================================
   MUSHROOM (grid-managed, rendered here)
   ============================================================ */

/* Subtle positional tint palettes so the field isn't monotonous green.
   The shade is derived from the cell position (deterministic), so a
   mushroom keeps its tint when damaged or rebuilt. Poisoned mushrooms
   always render in the distinct magenta palette. */
const MUSH_PALETTES = [
  { base: '#4aff6a', dark: '#0e5c22', stem: '#2ea04a', speck: '#baffd0' },  // classic green
  { base: '#b8e93c', dark: '#46580a', stem: '#7ba224', speck: '#e2f7a8' },  // yellow-green
  { base: '#3fe8b4', dark: '#0e5c46', stem: '#219a72', speck: '#aef5dd' },  // blue-green
  { base: '#2cc6d4', dark: '#0c4c55', stem: '#19828c', speck: '#a6ecf2' },  // teal
];
const POISON_PALETTE = { base: '#ff2d95', dark: '#7a0e44', stem: '#a1115c', speck: '#ff8ecb' };

/* Duration of the fresh-poison flash (set in poisonMush, consumed here) */
const POISON_FLASH = 0.55;

function drawMushroom(ctx, x, y, hp, maxHp, poison, shade, pulse) {
  const s = 8;
  const ox = x * s, oy = y * s + HUD_H; // +HUD_H: the field sits below the HUD,
  // exactly like every other entity. (Without it the whole field drew 3 rows
  // too high, so the visible mushrooms never matched the collision grid the
  // centipede navigates: it turned at mushrooms 3 rows above it and its body
  // plowed through the ones drawn in its own row.)
  const pct = Math.max(0, Math.min(1, hp / maxHp));
  // Full-HP mushrooms are the big field blockers, exactly like the original
  // arcade: a cap-and-stem that fills most of its cell, so the bug visibly
  // turns AT a mushroom. Each hit shrinks the cap toward a stub. (The old
  // formula was inverted — full-HP mushrooms drew tiny while damaged ones
  // grew past their cell, so the drawn field never matched the collision
  // grid: the bug turned at invisible specks and visually overlapped
  // mushrooms in cells it wasn't entering.)
  const b = 1 + Math.round(pct * 4); // 5 full -> 1 one-hit-left
  const r = Math.max(2, b - 1);      // cap half-width (4 full -> 2 stub)
  // stable per-position tint: ~40% stay classic green, the rest split
  // across the three softer shades so the field reads varied, not garish
  const h = (x * 97 + y * 61) % 100;
  const pal = poison ? POISON_PALETTE
    : MUSH_PALETTES[h < 40 ? 0 : h < 60 ? 1 : h < 80 ? 2 : 3];
  const baseCol = pal.base;

  // The solid body is clipped to its own 8x8 cell so the drawn field is
  // byte-for-byte the collision grid — no cap or stem ever bleeds into a
  // neighbor, which is what made the bug look like it was sliding through.
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, s, s);
  ctx.clip();

  // stem — a shaded stalk with dark edges so it reads as a stem, not a
  // block: the cap overhangs it, which is what separates a mushroom from a
  // centipede segment at a glance
  ctx.fillStyle = pal.dark;
  ctx.fillRect(ox + 2, oy + b - 2, 1, 3);
  ctx.fillRect(ox + 5, oy + b - 2, 1, 3);
  ctx.fillStyle = pal.stem;
  ctx.fillRect(ox + 3, oy + b - 2, 2, 3);
  ctx.fillRect(ox + 3, oy + b + 1, 2, 2);

  // cap — rim, with a dark under-cap line (the shadow that makes the cap
  // look like it overhangs), then the dome and crown
  ctx.fillStyle = baseCol;
  ctx.fillRect(ox + 4 - r, oy + b - 3, r * 2, 2);
  ctx.fillStyle = pal.dark;
  ctx.fillRect(ox + 4 - r, oy + b - 1, r * 2, 1);
  ctx.fillStyle = baseCol;
  ctx.fillRect(ox + 4 - r + 1, oy + b - 4, r * 2 - 2, 1);
  // dome
  ctx.fillRect(ox + 4 - (r - 1), oy + 1, (r - 1) * 2, b - 3);
  ctx.fillRect(ox + 3, oy, 2, 2);
  ctx.fillRect(ox + 5, oy + 1, 2, 1);
  // texture: a crown gleam + scattered spots break up the flat cap color so
  // a field of mushrooms never reads as solid-color blocks. NO glow here —
  // luminosity is reserved for poison mushrooms only.
  ctx.fillStyle = pal.speck;
  ctx.fillRect(ox + 3, oy, 1, 1);
  ctx.fillRect(ox + 4 - r + 1, oy + 2, 1, 1);
  ctx.fillRect(ox + 4 + r - 2, oy + 2, 1, 1);
  ctx.fillRect(ox + 4 - r + 2, oy + 3, 1, 1);
  ctx.fillRect(ox + 4 + r - 3, oy + 3, 1, 1);

  ctx.restore();

  // poison glow / shake
  if (poison) {
    ctx.fillStyle = 'rgba(255,45,149,0.16)';
    ctx.fillRect(ox + 4 - r - 1, oy - 1, r * 2 + 2, b + 2);
  }
  // fresh-poison flash: a brief heartbeat of magenta — hot halo + expanding
  // pulse ring — so a corruption near the player boundary reads at a glance
  if (poison && pulse > 0) {
    const flash = 1 - pulse / POISON_FLASH; // 0 → 1 over the flash
    const osc = (Math.sin(pulse * 24) + 1) / 2; // ~2 fast pulses
    const fade = 1 - flash;
    ctx.fillStyle = `rgba(255,45,149,${0.18 + osc * 0.4})`;
    ctx.fillRect(ox + 3, oy, 10, 8);
    ctx.strokeStyle = `rgba(255,90,190,${(0.25 + osc * 0.5) * fade})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ox + 4, oy + 4, 6 + flash * 5, 0, TAU);
    ctx.stroke();
  }
  if (shade) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(ox + 3, oy + 6, 2, 2);
  }
}

/* ============================================================
   CENTIPEDE / MILLIPEDE
   Faithful grid movement: head drops a row and reverses when
   blocked; segments follow the head's trail; a popped segment
   splits the swarm into two centipedes.
   ============================================================ */
class Centipede {
  constructor(g, opts) {
    opts = opts || {};
    this.g = g;
    this.id = nextId();
    this.isMilli = !!opts.isMilli;
    this.swarm = !!opts.swarm; // bonus-round express bug
    this.dir = opts.dir || (chance(0.5) ? 1 : -1);
    this.entering = true;
    this.escape = false;
    this.dead = false;
    this.tickAcc = 0;
    this.trail = [];
    this.headSq = 0;
    this.stuckT = 0; // seconds unable to move; guards against boxed-in soft-locks

    // level body palette captured at spawn: the centipede's hue rotates per
    // level (uniform per bug). Split-offs rebuilt at the same level by
    // hitSegment/hitHead run the constructor again, so they inherit the same
    // hue — a swarm never changes color mid-level.
    this.bodySpr = this.swarm ? swarmSpr : this.isMilli ? milliSpr : centBodySprFor(g.level);
    this.bodyColor = this.swarm ? SWARM_BODY : this.isMilli ? MILLI_BODY : centBodyColor(g.level);

    // entry telegraph: blink the entry column before the bug descends
    this.warnT = 0; this.warnTotal = 0; this.warnBeeped = false;

    const len = opts.length || (this.isMilli ? 22 : 12);
    this.initLen = len;
    const startC = opts.col == null ? randi(4, g.COLS - 5) : opts.col;
    // head enters from above the field; body trails along row -1
    for (let i = 0; i < len; i++) {
      this.trail.push({ r: -1, c: clamp(startC - this.dir * i, 0, g.COLS - 1) });
    }
    this.segs = [];
    for (let i = 1; i < len; i++) this.segs.push({ off: i, dead: false, sq: 0 });

    if (opts.warn !== false) {
      // entry-telegraph duration is per-difficulty: easy holds the blink
      // longest, insane barely blinks before the bug drops
      this.warnT = (g.diff.warn || 1.2) + (opts.warnDelay || 0);
      this.warnTotal = this.warnT;
      AudioSys.sfx.warn();
    }
  }

  px(off) { const t = this.trail[this.trail.length - 1 - off] || this.trail[this.trail.length - 1]; return t.c * this.g.CELL + this.g.CELL / 2; }
  py(off) { const t = this.trail[this.trail.length - 1 - off] || this.trail[this.trail.length - 1]; return t.r * this.g.CELL + this.g.CELL / 2 + this.g.HUD_H; }

  segCount() { return this.segs.length; }

  interval() {
    const g = this.g;
    if (this.swarm) return 2; // bonus-round express: 30 steps/sec, level-agnostic
    // frames-per-step from the difficulty's level-1 cells/sec, the level
    // speed ramp, and the segment speed-up (fewer segments = faster). The
    // clamp keeps any bug between ~1.5 and 30 steps/sec (2-40 frames): the
    // slow end only matters for easy's level-1 crawl (3 cps = 20 frames),
    // the fast end caps even an almost-popped bug at 30 — a 1-frame (60
    // cps) tail would move a cell every frame and be unhittable.
    const cps = this.isMilli ? g.diff.milliCps : g.diff.centCps;
    const speedUp = Math.sqrt(Math.max(1, this.segs.length) / this.initLen);
    let iv = Math.round(60 * speedUp / (cps * g.levelSpeedFactor()));
    return clamp(iv, 2, 40);
  }

  update(dt) {
    const g = this.g;
    if (this.dead) return;

    // warning phase: hold at the top while the entry column blinks
    if (this.warnT > 0) {
      this.warnT -= dt;
      if (this.warnT <= 0) {
        // entry moment — pop-in flash + sting
        const entryCol = this.trail[this.trail.length - 1].c;
        Particles.spawn(entryCol * g.CELL + 4, g.HUD_H + 4, { vx: 0, vy: 0, life: 0.35, size: 5, color: '#fff' });
        Particles.burst(entryCol * g.CELL + 4, g.HUD_H + 4, ['#ff3355', '#ffe94a', '#fff'], 10, 40);
        AudioSys.sfx.enter();
      } else if (!this.warnBeeped && this.warnT < this.warnTotal * 0.45) {
        this.warnBeeped = true;
        AudioSys.sfx.warn();
      } else {
        return;
      }
    }

    const slow = g.freezeT > 0 ? 4 : 1;
    this.tickAcc += dt * slow;
    const iv = this.interval() / 60;
    while (this.tickAcc >= iv) {
      this.tickAcc -= iv;
      this.step(iv); // iv = wall-seconds between steps, feeds the boxed-in timer
      if (this.dead) return;
    }

    // squash-and-stretch: segments that just dropped a row flatten on landing.
    // The squash ripples down the body as each segment follows the drop.
    const len = this.trail.length;
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (s.dead) continue;
      const cur = this.trail[len - 1 - s.off];
      const prev = this.trail[len - 2 - s.off];
      // refresh the squash on EVERY drop (fast-falling segments drop every
      // ~33ms, so the previous check-and-decay pattern skipped re-triggers)
      if (cur && prev && cur.r >= 0 && prev.r >= 0 && cur.r > prev.r) {
        s.sq = 0.18;
      } else if (s.sq > 0) {
        s.sq -= dt;
        if (s.sq <= 0) s.sq = 0;
      }
    }
    if (this.headSq > 0) {
      this.headSq -= dt;
      if (this.headSq <= 0) this.headSq = 0;
    }
  }

  step(iv) {
    const g = this.g;
    const head = this.trail[this.trail.length - 1];
    let { r, c } = head;
    let nr = r, nc = c;

    if (r < 0) {
      // entering: descend into the field, sliding to a clear column so the
      // head never lands on a mushroom
      const row0 = 0;
      if (!g.mushAt(row0, c)) {
        nr = row0;
      } else {
        let found = false;
        for (let d = 1; d <= 14 && !found; d++) {
          for (const dc of [d, -d]) {
            const cc = c + dc;
            if (cc >= 0 && cc < g.COLS && !g.mushAt(row0, cc)) { nc = cc; found = true; break; }
          }
        }
        nr = row0;
      }
    } else {
      // A bonus swarm in a corridor directly above a maze wall threads the
      // wall's gap: it drops straight through the moment it stands on the gap
      // and otherwise steers toward it, so a golden swarm genuinely snakes the
      // whole maze (a crossing per wall). A completed run makes the holes
      // shift — see g.swarmCrossed(). Like the original arcade centipede it
      // never forces its way through a mushroom: if the path to the gap is
      // blocked it faces about and waits, or gives up after ~5s and escapes
      // (which itself shifts the holes).
      const mazeWall = this.swarm && g.bonusMode && g.mazeWalls.length
        ? g.mazeWalls.find(w => w.rows.includes(r + 1)) : null;
      if (mazeWall) {
        const g0 = mazeWall.gap, g1 = mazeWall.gap + mazeWall.gapW - 1;
        // only drop when the gap cell below is actually clear — the head
        // must never step onto a mushroom, even if the grid changed under it
        if (c >= g0 && c <= g1 && !g.mushAt(r + 1, c)) {
          nr = r + 1; // standing on the gap — drop straight through the wall
          this.headSq = 0.18;
          this.dir = -this.dir;
        } else {
          const dirToGap = c < g0 ? 1 : -1;
          const ahead = c + dirToGap;
          if (ahead >= 0 && ahead < g.COLS && !g.mushAt(r, ahead)) {
            nc = ahead; // slide toward the gap
            this.dir = dirToGap;
          } else {
            this.dir = -this.dir;
            // give up after ~5s boxed in (swarms race at 30 steps/sec)
            if (this.swarm && (this.stuckT += iv) >= 5) { this.escape = true; this.die(false); return; }
            return;
          }
        }
      } else {
        const ahead = c + this.dir;
        const blocked = ahead < 0 || ahead >= g.COLS || g.mushAt(r, ahead);
        if (!blocked) {
          nc = ahead;
        } else {
          const below = r + 1;
          if (below < g.ROWS) {
            // only drop into a clear cell — the centipede must NEVER
            // occupy a mushroom cell (that caused 'running through')
            if (!g.mushAt(below, c)) {
              nr = below;
              this.headSq = 0.18; // squash on the drop
              this.dir = -this.dir;
            } else {
              // boxed in ahead AND below: pause in place and face the other way —
              // the centipede never forces its way through a mushroom (exactly
              // like the original arcade; the player can always shoot the block
              // free). But a genuinely sealed-in bug must not stall the level
              // forever, so after a generous wall-clock window it gives up and
              // leaves the field (which also counts as the bonus maze's
              // crossing). Time-based rather than step-based so the new slow
              // level-1 crawl can't stretch the window out: a normal bug
              // escapes after 20s boxed in, a swarm after 5s — plenty to
              // react, never a lock at any difficulty or speed.
              this.dir = -this.dir;
              this.stuckT += iv;
              if (this.stuckT >= (this.swarm ? 5 : 20)) { this.escape = true; this.die(false); return; }
              return;
            }
          } else {
            // bottom row: escape at the screen edge, but never enter a mushroom
            // (high levels grow mushrooms in the player zone too). If it's boxed
            // in on the very last row it can never resolve itself, so give up
            // after a few seconds rather than soft-locking the level.
            if (ahead < 0 || ahead >= g.COLS) { this.escape = true; this.die(false); return; }
            if (g.mushAt(r, ahead)) {
              this.dir = -this.dir;
              if ((this.stuckT += iv) >= 4) { this.escape = true; this.die(false); }
              return;
            }
            nc = ahead;
          }
        }
      }
    }

    this.stuckT = 0; // made progress — reset the boxed-in timer
    this.trail.push({ r: nr, c: nc });
    if (this.trail.length > 900) this.trail.shift();
  }

  die(scoreIt) {
    if (this.dead) return;
    this.dead = true;
    const g = this.g;
    const head = this.trail[this.trail.length - 1];
    if (head) {
      Particles.burst(this.px(0), this.py(0), ['#fff', '#ff5a3c', '#ffe94a'], 12, 60);
    }
    // remaining segments dissolve
    g.enemyKilled(this, scoreIt !== false);
    // a swarm finishing its run (escaped or destroyed) makes the maze's
    // holes shift — every crossing re-weaves the bonus maze
    if (this.swarm && g.bonusMode) g.swarmCrossed(head ? head.r : -1, this.escape);
    g.checkLevelEnd();
  }

  /** Damage a segment at index `idx` in this.segs. Splits the swarm. */
  hitSegment(idx) {
    const g = this.g;
    const s = this.segs[idx];
    if (!s || s.dead) return false;
    s.dead = true;
    const len = this.trail.length;
    const off = s.off;
    const hitCell = this.trail[len - 1 - off];
    const hx = hitCell.c * g.CELL + g.CELL / 2;
    const hy = hitCell.r * g.CELL + g.CELL / 2 + g.HUD_H;

    // score based on row (deeper = more points, like the original); the
    // golden swarm bugs are the bonus-round jackpot
    const rowVal = 10 + Math.floor(clamp(hitCell.r / g.ROWS, 0, 1) * 70);
    const val = (this.swarm ? 500 : this.isMilli ? rowVal * 2 : rowVal) * g.scoreMult();
    g.addScore(val, hx, hy, true);
    AudioSys.sfx.segPop();
    Particles.burst(hx, hy, [this.bodyColor, this.swarm ? SWARM_HEAD : this.isMilli ? MILLI_HEAD : CENT_HEAD, '#fff'], 14, 55);

    // segment becomes a mushroom (if cell clear & in field) — never in a
    // bonus round, where the maze must only shrink as the player pops it
    if (!g.bonusMode && hitCell.r >= 0 && !g.mushAt(hitCell.r, hitCell.c) && hitCell.r < g.PLAY_ZONE) {
      g.setMush(hitCell.r, hitCell.c);
    }

    // pickups drop from segments (suppressed during the bonus race)
    if (!g.bonusMode && (this.isMilli ? chance(0.06) : chance(0.04))) g.dropPickup(hitCell.c, hitCell.r);

    // split: head part keeps segs before idx; tail becomes new centipede
    const keep = this.segs.slice(0, idx).filter(s2 => !s2.dead);
    const tail = this.segs.slice(idx + 1).filter(s2 => !s2.dead);
    this.segs = keep;

    if (tail.length > 0) {
      const newTrail = this.trail.slice(0, len - off);
      let newDir = this.dir;
      const aheadCell = this.trail[len - off];
      if (aheadCell) {
        if (aheadCell.c > hitCell.c) newDir = 1;
        else if (aheadCell.c < hitCell.c) newDir = -1;
      }
      const nc = new Centipede(g, { isMilli: this.isMilli, swarm: this.swarm, dir: newDir, warn: false });
      nc.trail = newTrail;
      nc.segs = tail.map(s2 => ({ off: s2.off - off, dead: false, sq: 0 }));
      nc.initLen = nc.segs.length + 1;
      g.centipedes.push(nc);
      Particles.spawn(hx, hy, { vx: 0, vy: 0, life: 0.4, size: 6, color: '#fff' });
    }

    if (this.segs.length === 0) { this.die(true); return; }
    g.checkLevelEnd();
    return true;
  }

  /** Head destroyed: the body continues as a fresh centipede. */
  hitHead() {
    const g = this.g;
    const len = this.trail.length;
    const headCell = this.trail[len - 1];
    const hx = headCell.c * g.CELL + g.CELL / 2;
    const hy = headCell.r * g.CELL + g.CELL / 2 + g.HUD_H;

    const val = (this.swarm ? 2500 : this.isMilli ? 250 : 100) * g.scoreMult();
    g.addScore(val, hx, hy, true);
    AudioSys.sfx.headPop();
    Particles.burst(hx, hy, this.swarm ? ['#fff', '#ffd700', '#ff2d95'] : ['#fff', '#ffe94a', '#ff5a3c'], 22, 80);

    if (!g.bonusMode && headCell.r >= 0 && !g.mushAt(headCell.r, headCell.c) && headCell.r < g.PLAY_ZONE) {
      g.setMush(headCell.r, headCell.c);
    }
    if (!g.bonusMode && chance(this.isMilli ? 0.4 : 0.35)) g.dropPickup(headCell.c, headCell.r);

    if (this.segs.length > 0) {
      // body continues: new head is the first body segment — the old head
      // cell just became a mushroom, so the continuation starts one cell
      // BEHIND it (exactly like the original arcade). Starting on the fresh
      // mushroom made the new head visibly overlap it for a step.
      const nc = new Centipede(g, { isMilli: this.isMilli, swarm: this.swarm, dir: this.dir, warn: false });
      nc.trail = this.trail.slice(0, len - 1);
      nc.segs = this.segs.map(s2 => ({ off: s2.off, dead: false, sq: 0 }));
      nc.initLen = nc.segs.length + 1;
      g.centipedes.push(nc);
    }
    this.dead = true;
    g.checkLevelEnd();
  }

  draw(ctx) {
    const g = this.g;
    if (this.dead) return;

    // warning phase: only the blinking entry marker shows
    if (this.warnT > 0) { this.drawWarn(ctx); return; }

    const len = this.trail.length;
    if (len < 2) return;

    // draw body segments tail→head so the head sits on top
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const s = this.segs[i];
      if (s.dead) continue;
      const t = this.trail[len - 1 - s.off];
      if (!t || t.r < 0) continue;
      const px = t.c * g.CELL, py = t.r * g.CELL + g.HUD_H;
      const spr = this.bodySpr;
      if (s.sq > 0) {
        const k = clamp(s.sq / 0.18, 0, 1);
        const sx = 1 + 0.35 * k, sy = 1 - 0.28 * k;
        const w = 8 * sx, h = 8 * sy;
        drawSpriteStretch(ctx, spr, px + (8 - w) / 2, py + (8 - h), sx, sy);
      } else {
        drawSprite(ctx, spr, px, py, 1);
      }
    }

    // head (with pulsing glow so it reads as the leader)
    const head = this.trail[len - 1];
    if (head.r < 0) return;
    const hx = head.c * g.CELL, hy = head.r * g.CELL + g.HUD_H;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    ctx.globalAlpha = 0.16 + pulse * 0.14;
    ctx.fillStyle = this.swarm ? SWARM_HEAD : this.isMilli ? MILLI_HEAD : CENT_HEAD;
    ctx.fillRect(hx - 2, hy - 2, 12, 11);
    ctx.globalAlpha = 1;
    const hSpr = this.swarm ? swarmHeadSpr : this.isMilli ? milliHeadSpr : headSpr;
    if (this.headSq > 0) {
      const k = clamp(this.headSq / 0.18, 0, 1);
      const sx = 1 + 0.35 * k, sy = 1 - 0.28 * k;
      const w = 8 * sx, h = 8 * sy;
      drawSpriteStretch(ctx, hSpr, hx + (8 - w) / 2, hy + (8 - h), sx, sy);
    } else {
      drawSprite(ctx, hSpr, hx, hy, 1);
    }
  }

  /* Flickering entry-column telegraph shown during the warning phase */
  drawWarn(ctx) {
    const g = this.g;
    const col = this.trail[this.trail.length - 1].c;
    const x = col * g.CELL, y = g.HUD_H;
    const blink = Math.floor(this.warnT * 8) % 2 === 0;

    // descending beam down the column
    ctx.globalAlpha = blink ? 0.6 : 0.22;
    ctx.fillStyle = '#ff3355';
    ctx.fillRect(x + 2, y + 2, 4, 12);
    ctx.fillRect(x + 3, y + 14, 2, 4);

    // arrow head at the field edge
    ctx.fillStyle = blink ? '#ffe94a' : '#ff8833';
    ctx.fillRect(x + 1, y, 6, 2);
    ctx.fillRect(x + 2, y + 2, 4, 2);
    ctx.fillRect(x + 3, y + 4, 2, 2);

    // side brackets
    ctx.fillStyle = blink ? '#fff' : '#ff3355';
    ctx.fillRect(x - 1, y + 3, 2, 5);
    ctx.fillRect(x + 7, y + 3, 2, 5);
    ctx.globalAlpha = 1;
  }

  // collision helper
  cells() {
    const out = [];
    const len = this.trail.length;
    out.push(this.trail[len - 1]);
    for (const s of this.segs) {
      if (s.dead) continue;
      const t = this.trail[len - 1 - s.off];
      if (t) out.push(t);
    }
    return out;
  }
}

/* ============================================================
   SPIDER
   ============================================================ */
class Spider {
  constructor(g) {
    this.g = g;
    this.x = rand(16, g.W - 16);
    this.y = rand(168, g.H - 4); // roam the lower field (row ~18 down)
    this.vx = choice([-1, 1]) * rand(30, 55);
    this.vy = rand(-30, 30);
    this.dirT = rand(0.8, 1.6);
    this.dead = false;
    this.eatCd = 0;
    // spiders are transient (like the original): they leave the field after
    // a while, so ignored spiders never pile up over a long session
    this.ttl = rand(18, 26);
  }
  get value() {
    // more points the lower the spider dives
    const g = this.g;
    const frac = clamp((this.y - g.HUD_H) / (g.H - g.HUD_H), 0, 1);
    if (frac < 0.33) return 300;
    if (frac < 0.66) return 600;
    return 900;
  }
  update(dt) {
    const g = this.g;
    if (this.dead) return;
    const slow = g.freezeT > 0 ? 0.3 : 1;
    // lifespan follows time-dilation too, so a frozen spider doesn't leave mid-freeze
    this.ttl -= dt * slow;
    if (this.ttl <= 0) { this.dead = true; return; }
    this.dirT -= dt;
    if (this.dirT <= 0) {
      this.dirT = rand(0.7, 1.8);
      this.vx += rand(-60, 60);
      this.vy += rand(-50, 50);
      const max = 120;
      const m = Math.max(1, Math.hypot(this.vx, this.vy) / max);
      this.vx /= m; this.vy /= m;
    }
    this.x += this.vx * dt * slow;
    this.y += this.vy * dt * slow;
    if (this.x < 4) { this.x = 4; this.vx = Math.abs(this.vx); }
    if (this.x > g.W - 4) { this.x = g.W - 4; this.vx = -Math.abs(this.vx); }
    if (this.y < 168) { this.y = 168; this.vy = Math.abs(this.vy); }
    if (this.y > g.H - 4) { this.y = g.H - 4; this.vy = -Math.abs(this.vy); }

    // eats mushrooms
    this.eatCd -= dt;
    if (this.eatCd <= 0) {
      this.eatCd = 0.12;
      const c = Math.floor(this.x / g.CELL), r = Math.floor((this.y - g.HUD_H) / g.CELL);
      if (g.mushAt(r, c)) {
        g.removeMush(r, c);
        Particles.spawn(this.x, this.y, { vx: 0, vy: 0, life: 0.25, size: 2, color: '#ff2d95' });
      }
    }
  }
  draw(ctx) {
    if (this.dead) return;
    const x = Math.round(this.x), y = Math.round(this.y);
    drawSprite(ctx, SPR.spider, x - 5, y - 4, 1);
  }
}

/* ============================================================
   FLEA
   ============================================================ */
class Flea {
  constructor(g) {
    this.g = g;
    this.c = randi(0, g.COLS - 1);
    this.r = -1;
    this.tickAcc = 0;
    this.dead = false;
  }
  get value() { return 100; }
  get interval() { return (this.g.freezeT > 0 ? 6 : this.g.diff.fleaInterval) / 60; }
  update(dt) {
    if (this.dead) return;
    const g = this.g;
    this.tickAcc += dt;
    while (this.tickAcc >= this.interval) {
      this.tickAcc -= this.interval;
      // drop mushrooms in the cells just left
      if (this.r >= 0) {
        g.setMush(this.r, this.c);
        if (chance(0.4) && this.c > 0) g.setMush(this.r, this.c - 1);
        if (chance(0.4) && this.c < g.COLS - 1) g.setMush(this.r, this.c + 1);
      }
      this.r++;
      if (this.r >= g.ROWS) { this.dead = true; return; }
    }
  }
  draw(ctx) {
    if (this.dead || this.r < 0) return;
    drawSprite(ctx, SPR.flea, this.c * this.g.CELL, this.r * this.g.CELL + this.g.HUD_H, 1);
  }
}

/* ============================================================
   SCORPION — poisons mushrooms in its path
   ============================================================ */
class Scorpion {
  constructor(g, row) {
    this.g = g;
    // Original rule: the scorpion roams the whole field, poisoning every
    // mushroom in its path — including the low rows just above the player's
    // zone, so magenta poison can appear right at the boundary. From level 6
    // (when the player zone grows mushrooms of its own) it increasingly
    // slithers INTO the zone to poison those, which keeps poison lethal.
    let r;
    if (g.level >= 6 && chance(Math.min(0.5, 0.18 * (g.level - 5)))) {
      r = randi(PLAY_ZONE, g.ROWS - 1);
    } else {
      r = randi(0, g.PLAY_ZONE - 1);
    }
    this.r = row == null ? r : row;
    this.dir = chance(0.5) ? 1 : -1;
    this.c = this.dir > 0 ? -1 : g.COLS;
    this.tickAcc = 0;
    this.dead = false;
  }
  get value() {
    // row-based bonus like centipede segments: the deeper the scorpion dives,
    // the more it's worth — so letting one sink into the low field (or the
    // player zone) before shooting pays off. Top of the field keeps the
    // classic 200; the bottom rows pay up to ~875.
    const g = this.g;
    const frac = clamp(this.r / g.ROWS, 0, 1);
    return 200 + Math.floor(frac * 700);
  }
  get interval() { return (this.g.freezeT > 0 ? 8 : 4) / 60; }
  update(dt) {
    if (this.dead) return;
    const g = this.g;
    this.tickAcc += dt;
    while (this.tickAcc >= this.interval) {
      this.tickAcc -= this.interval;
      this.c += this.dir;
      if (this.c < 0 || this.c >= g.COLS) { this.dead = true; return; }
      if (g.mushAt(this.r, this.c) && !g.isPoison(this.r, this.c)) {
        g.poisonMush(this.r, this.c);
        Particles.spawn(this.c * g.CELL + 4, this.r * g.CELL + g.HUD_H + 4, { vx: 0, vy: 0, life: 0.3, size: 2, color: '#ff2d95' });
      }
    }
  }
  draw(ctx) {
    if (this.dead || this.c < 0 || this.c >= this.g.COLS) return;
    drawSprite(ctx, SPR.scorpion, this.c * this.g.CELL, this.r * this.g.CELL + this.g.HUD_H, 1);
  }
}

/* ============================================================
   VIRUS — hatches from poisoned data, hunts the player
   ============================================================ */
class Virus {
  constructor(g, c, r) {
    this.g = g;
    this.x = c * g.CELL + g.CELL / 2;
    this.y = r * g.CELL + g.HUD_H + g.CELL / 2;
    this.speed = rand(34, 52);
    this.hp = 2;
    this.dead = false;
    this.phase = rand(0, TAU);
  }
  update(dt) {
    const g = this.g;
    if (this.dead) return;
    const slow = g.freezeT > 0 ? 0.3 : 1;
    const p = g.player;
    if (p.alive) {
      const dx = p.x - this.x, dy = p.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        // slight wobble
        this.phase += dt * 6;
        const w = Math.sin(this.phase) * 10;
        const ndx = dx + w;
        const nd = Math.hypot(ndx, dy);
        this.x += ndx / nd * this.speed * dt * slow;
        this.y += dy / nd * this.speed * dt * slow;
      }
    }
    this.x = clamp(this.x, 4, g.W - 4);
    this.y = clamp(this.y, g.HUD_H + 4, g.H - 4);
  }
  draw(ctx) {
    if (this.dead) return;
    const x = Math.round(this.x), y = Math.round(this.y);
    drawSprite(ctx, SPR.virus, x - 4, y - 4, 1);
  }
}

/* ============================================================
   PICKUP
   ============================================================ */
const PICKUP_DEFS = {
  weapon:  { letter: 'W', color: '#00e5ff', w: 0.22 },
  shield:  { letter: 'S', color: '#39ff14', w: 0.15 },
  overclock: { letter: 'O', color: '#ffb000', w: 0.12 },
  bomb:    { letter: 'B', color: '#ff3b30', w: 0.12 },
  freeze:  { letter: 'F', color: '#9d4dff', w: 0.1 },
  multi:   { letter: 'M', color: '#ffe94a', w: 0.1 },
  oneup:   { letter: '1', color: '#ff2d95', w: 0.05 },
  missile: { letter: 'R', color: '#ff2d95', w: 0.08 },
  gem:     { letter: 'G', color: '#4aff6a', w: 0.06 },
};

function weightedPickup() {
  const total = Object.values(PICKUP_DEFS).reduce((a, d) => a + d.w, 0);
  let roll = rand(0, total);
  for (const k in PICKUP_DEFS) {
    roll -= PICKUP_DEFS[k].w;
    if (roll <= 0) return k;
  }
  return 'gem';
}

class Pickup {
  constructor(g, c, r, kind) {
    this.g = g;
    this.c = c; this.r = r;
    this.kind = kind || weightedPickup();
    this.tickAcc = 0;
    this.ttl = 8;
    this.dead = false;
    this.phase = rand(0, TAU);
  }
  get interval() { return 0.16; }
  update(dt) {
    if (this.dead) return;
    this.ttl -= dt;
    if (this.ttl <= 0) { this.dead = true; return; }
    this.phase += dt * 4;
    this.tickAcc += dt;
    while (this.tickAcc >= this.interval) {
      this.tickAcc -= this.interval;
      this.r++;
      if (this.r >= this.g.ROWS) { this.dead = true; return; }
    }
    // caught by player?
    const p = this.g.player;
    if (p.alive) {
      const px = this.c * this.g.CELL + 4, py = this.r * this.g.CELL + this.g.HUD_H + 4;
      if (Math.abs(p.x - px) < 11 && Math.abs(p.y - py) < 11) {
        this.dead = true;
        this.g.applyPickup(this.kind, px, py);
      }
    }
  }
  draw(ctx) {
    if (this.dead) return;
    if (this.ttl < 3 && Math.floor(this.ttl * 6) % 2 === 0) return;
    const def = PICKUP_DEFS[this.kind];
    const px = this.c * this.g.CELL;
    const py = this.r * this.g.CELL + this.g.HUD_H;
    // capsule
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 1, py, 6, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(px + 2, py + 1, 4, 2);
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(px + 2, py + 3, 4, 3);
    // letter
    FONT.draw(ctx, def.letter, px + 2, py + 2, 1, def.color);
    // soft glow
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = def.color;
    ctx.fillRect(px - 1, py - 1, 10, 10);
    ctx.globalAlpha = 1;
  }
}

/* ============================================================
   BUG QUEEN — boss of every 10th level
   A giant segmented queen bug that patrols the whole field on a
   coarse 16px grid. Her armor shrugs off plain bullets; each
   segment's eye opens in cycles (bullets can hurt it while open),
   and the head is only sealed during berserk. Smart missiles
   pierce the armor, bombs smash her core, and the FREEZE pickup
   forces the core open and locks the whole body into a target.
   Her brood — egg sacs that hatch into mini centipedes — makes
   bombs the cleanup tool, and venom spit poisons the field.
   ============================================================ */
class BugQueen {
  constructor(g, level) {
    this.g = g;
    this.id = nextId();
    this.qcols = Math.floor(g.COLS / 2);               // 20 coarse columns
    this.maxCoarseR = Math.floor(g.PLAY_ZONE / 2) - 1; // 10 — never enters the player zone
    this.mult = Math.min(3, 1 + (level / 10 - 1) * 0.45); // HP scales every 10 levels
    this.maxHp = Math.round((25 + 12 * 5) * this.mult);
    this.hp = this.maxHp;
    this.headObj = { isHead: true, hitDmg: 0 };
    this.segs = [];
    for (let i = 1; i <= 12; i++) {
      this.segs.push({ off: i, hp: 5, hitDmg: 0, eyeOpen: false, eyeT: rand(1.5, 4), dead: false });
    }
    // body stacked above the field; the head is the LAST trail cell (leads)
    this.dir = chance(0.5) ? 1 : -1;
    this.vdir = 1;
    const startC = randi(3, this.qcols - 4);
    this.trail = [];
    for (let i = 0; i < this.segs.length + 2; i++) this.trail.push({ r: -1 - i, c: startC });

    this.enterT = 2.0;
    this.entered = false;
    this.tickAcc = 0;
    this.lungeRows = 0;
    this.attackT = 3.0;
    this.attack = null;
    this.telegraph = 0;
    this.coreOpen = false;
    this.coreT = 0;
    this.berserk = false;
    this.swarmT = 8;
    this.secreteT = 1.4;
    this.dead = false;
  }

  get segCount() { return this.segs.length; }

  interval() {
    if (this.g.freezeT > 0) return 1e9; // frozen solid
    if (this.lungeRows > 0) return 0.12; // charge dive
    return this.berserk ? 0.3 : 0.42;    // patrol sweep
  }

  step() {
    const head = this.trail[this.trail.length - 1];
    let { r, c } = head;
    let nr = r, nc = c;

    if (r < 0) {
      // enter: descend to row 0, sliding to a clear coarse column
      const clearAt = (cc) => !this.g.mushAt(0, cc * 2) && !this.g.mushAt(0, cc * 2 + 1) && !this.g.mushAt(1, cc * 2) && !this.g.mushAt(1, cc * 2 + 1);
      if (clearAt(c)) { nr = 0; }
      else {
        let found = false;
        for (let d = 1; d <= 4 && !found; d++) {
          for (const dc of [d, -d]) {
            const cc = c + dc;
            if (cc >= 0 && cc < this.qcols && clearAt(cc)) { nc = cc; found = true; break; }
          }
        }
        nr = 0;
      }
    } else if (this.lungeRows > 0) {
      // charge: drive straight down, crushing mushrooms under the head
      if (r < this.maxCoarseR) { nr = r + 1; this.lungeRows--; }
      else { this.lungeRows = 0; }
      this.crush(r, c);
    } else {
      const ahead = c + this.dir;
      if (ahead >= 0 && ahead < this.qcols) {
        nc = ahead;
      } else {
        // serpentine sweep: descend at each edge; climb once at the bottom
        const next = r + this.vdir;
        if (next >= 0 && next <= this.maxCoarseR) nr = next;
        else { this.vdir = -this.vdir; nr = r + this.vdir; }
        this.dir = -this.dir;
      }
    }

    this.trail.push({ r: nr, c: nc });
    if (this.trail.length > 500) this.trail.shift();
  }

  /* lunge path smashes mushrooms flat */
  crush(r, c) {
    const g = this.g;
    for (let dr = 0; dr < 2; dr++) {
      for (let dc = 0; dc < 2; dc++) {
        const gr = r * 2 + dr, gc = c * 2 + dc;
        if (g.mushAt(gr, gc)) {
          g.removeMush(gr, gc);
          Particles.spawn(gc * 8 + 4, gr * 8 + g.HUD_H + 4, { vx: rand(-15, 15), vy: rand(-25, 5), life: 0.3, size: 1, color: '#4aff6a' });
        }
      }
    }
  }

  /* the queen's trail leaves a magenta goo that poisons mushrooms */
  secrete() {
    const g = this.g;
    if (g.poisonStats().count >= 15) return;
    const len = this.trail.length;
    const parts = [this.trail[len - 1]];
    const live = this.segs.filter(s => !s.dead);
    for (let i = 0; i < 3 && live.length; i++) {
      parts.push(this.trail[len - 1 - live[randi(0, live.length - 1)].off]);
    }
    for (const t of parts) {
      if (!t || t.r < 0 || t.r > this.maxCoarseR) continue;
      const gr = t.r * 2 + randi(0, 1), gc = t.c * 2 + randi(0, 1);
      if (g.mushAt(gr, gc) && !g.isPoison(gr, gc)) {
        g.poisonMush(gr, gc, true);
        Particles.spawn(gc * 8 + 4, gr * 8 + g.HUD_H + 4, { vx: 0, vy: 0, life: 0.3, size: 2, color: '#ff2d95' });
      }
    }
  }

  update(dt) {
    const g = this.g;
    if (this.dead) return;
    const frozen = g.freezeT > 0;

    // entrance: hold above the field with a warning telegraph
    if (this.enterT > 0) {
      this.enterT -= dt;
      if (this.enterT <= 0) {
        this.entered = true;
        g.shakeT = 0.35;
        AudioSys.sfx.roar();
        g.banner('BUG QUEEN', 1.6);
      }
      return;
    }

    // ENRAGED below half HP: armor seals (head included) until her core
    // opens — the freeze pickup forces it. She gets faster and meaner, and
    // hands over a fresh freeze + missile so the tools stay in play.
    if (!this.berserk && this.hp <= this.maxHp * 0.5) {
      this.berserk = true;
      this.vdir = 1;
      AudioSys.sfx.berserk();
      g.shakeT = Math.max(g.shakeT, 0.4);
      g.banner('ENRAGED!', 1.6);
      const hd = this.trail[this.trail.length - 1];
      if (hd && hd.r >= 0) {
        const gc = clamp(hd.c * 2, 0, g.COLS - 1);
        const gr = clamp(hd.r * 2, 0, g.PLAY_ZONE - 1);
        g.dropPickup(gc, Math.min(gr + 1, g.PLAY_ZONE - 1), 'freeze');
        g.dropPickup(gc, Math.min(gr + 2, g.PLAY_ZONE - 1), 'missile');
      }
    }

    // core-open bookkeeping: the core is exposed while FROZEN (the freeze
    // forces it open) or during a charge window. Recomputing every frame
    // means the window closes cleanly the moment the freeze ends — a freeze
    // can never permanently unseal her armor.
    if (this.coreT > 0) this.coreT -= dt;
    this.coreOpen = frozen || this.coreT > 0;

    // eyes blink open in cycles — the only armor seam for plain bullets
    for (const s of this.segs) {
      if (s.dead) continue;
      if (s.eyeOpen) {
        s.eyeT -= dt;
        if (s.eyeT <= 0) { s.eyeOpen = false; s.eyeT = rand(2.5, 4.5) * (this.berserk ? 0.6 : 1); }
      } else {
        s.eyeT -= dt;
        if (s.eyeT <= 0) { s.eyeOpen = true; s.eyeT = rand(1.3, 2.0); }
      }
    }

    if (frozen) return; // frozen solid — everything else pauses (core already open)

    // movement
    this.tickAcc += dt;
    const iv = this.interval();
    while (this.tickAcc >= iv) {
      this.tickAcc -= iv;
      this.step();
    }

    // poison goo
    this.secreteT -= dt;
    if (this.secreteT <= 0) { this.secreteT = 1.3; this.secrete(); }

    // attack cycle
    this.attackT -= dt;
    if (this.attackT <= 0) this.chooseAttack();
    if (this.telegraph > 0) {
      this.telegraph -= dt;
      if (this.telegraph <= 0) this.executeAttack();
    }

    // berserk swarm call
    if (this.berserk) {
      this.swarmT -= dt;
      if (this.swarmT <= 0) { this.swarmT = 7; this.callSwarm(); }
    }
  }

  chooseAttack() {
    const roll = rand(0, 1);
    if (this.berserk) {
      if (roll < 0.34) this.prep('venom');
      else if (roll < 0.62) this.prep('eggs');
      else this.prep('charge');
    } else {
      if (roll < 0.45) this.prep('venom');
      else if (roll < 0.82) this.prep('eggs');
      else this.prep('charge');
    }
  }

  prep(type) {
    this.attack = type;
    this.telegraph = type === 'charge' ? 1.1 : 0.85;
  }

  executeAttack() {
    this.telegraph = 0;
    switch (this.attack) {
      case 'venom': this.spitVenom(); break;
      case 'eggs': this.layEggs(); break;
      case 'charge': this.charge(); break;
    }
    this.attackT = rand(1.1, 2.0) * (this.berserk ? 0.65 : 1);
  }

  spitVenom() {
    const g = this.g;
    const head = this.trail[this.trail.length - 1];
    const sx = head.c * 16 + 8, sy = head.r * 16 + g.HUD_H + 8;
    const p = g.player;
    const n = 3 + Math.floor(g.level / 10) + (this.berserk ? 2 : 0);
    const baseA = Math.atan2(p.y - sy, p.x - sx);
    for (let i = 0; i < n; i++) {
      const a = baseA + (i - (n - 1) / 2) * 0.24;
      const sp = rand(62, 84);
      g.venom.push(new Venom(g, sx, sy, Math.cos(a) * sp, Math.sin(a) * sp));
    }
    AudioSys.sfx.spit();
    g.shakeT = Math.max(g.shakeT, 0.15);
  }

  layEggs() {
    const g = this.g;
    const n = 2 + (g.level >= 20 ? 1 : 0);
    let placed = 0, guard = 0;
    while (placed < n && guard++ < 60) {
      const c = randi(0, g.COLS - 1);
      const r = randi(2, g.PLAY_ZONE - 1);
      if (g.mushAt(r, c)) continue;
      if (g.eggs.some(e => !e.dead && e.c === c && e.r === r)) continue;
      if (g.eggs.filter(e => !e.dead).length >= 5) break;
      g.eggs.push(new Egg(g, c, r, this.berserk ? 2.6 : 3.6));
      placed++;
    }
    AudioSys.sfx.eggLay();
    g.shakeT = Math.max(g.shakeT, 0.1);
  }

  charge() {
    this.lungeRows = 3;
    this.vdir = 1;
    this.coreOpen = true; // the lunge exposes her core
    this.coreT = 2.6;
    AudioSys.sfx.roar();
    this.g.shakeT = Math.max(this.g.shakeT, 0.3);
  }

  callSwarm() {
    const g = this.g;
    if (g.centipedes.filter(c => !c.dead && !c.escape).length >= 4) return;
    const cp = new Centipede(g, { length: 8, warnDelay: 0.4 });
    cp.queenMinion = true;
    g.centipedes.push(cp);
    AudioSys.sfx.warn();
  }

  /* ---------------- DAMAGE ---------------- */
  partAt(bx, by) {
    const len = this.trail.length;
    const head = this.trail[len - 1];
    if (head && head.r >= 0 &&
        bx >= head.c * 16 && bx < head.c * 16 + 16 &&
        by >= head.r * 16 + this.g.HUD_H && by < head.r * 16 + this.g.HUD_H + 16) {
      return { part: this.headObj, id: 'h' };
    }
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (s.dead) continue;
      const t = this.trail[len - 1 - s.off];
      if (!t || t.r < 0) continue;
      if (bx >= t.c * 16 && bx < t.c * 16 + 16 &&
          by >= t.r * 16 + this.g.HUD_H && by < t.r * 16 + this.g.HUD_H + 16) {
        return { part: s, id: 's' + i };
      }
    }
    return null;
  }

  bulletHit(bx, by) { return this.partAt(bx, by); }

  /* apply a bullet hit: armored parts spark; open eyes / exposed core take 1 */
  damageBullet(part, bx, by) {
    if (this.dead) return;
    const eyeOn = part.eyeOpen || this.coreOpen;
    const vulnerable = part.isHead ? !(this.berserk && !this.coreOpen) : eyeOn;
    if (vulnerable) {
      this.damagePart(part, 1);
      Particles.spawn(bx, by, { vx: 0, vy: -20, life: 0.15, size: 1, color: '#ffe94a' });
    } else {
      AudioSys.sfx.armorBounce();
      Particles.burst(bx, by, ['#cfcfcf', '#ffffff'], 4, 26);
    }
  }

  missileHit(mx, my) {
    const hit = this.partAt(mx, my);
    if (!hit) return false;
    Particles.burst(mx, my, ['#ff2d95', '#fff', '#ffd700'], 12, 70);
    this.damagePart(hit.part, 5); // smart missiles pierce the armor
    return true;
  }

  bombHit() {
    const g = this.g;
    if (this.dead) return;
    this.damagePart(this.headObj, 25); // the blast smashes her core
    const live = this.segs.filter(s => !s.dead);
    for (let i = 0; i < 2 && live.length && !this.dead; i++) {
      const s = live[randi(0, live.length - 1)];
      this.popSegment(s);
      live.splice(live.indexOf(s), 1);
    }
    const head = this.trail[this.trail.length - 1];
    if (head && head.r >= 0) {
      Particles.burst(head.c * 16 + 8, head.r * 16 + g.HUD_H + 8, ['#ff3b30', '#ffb000', '#fff'], 26, 110);
    }
  }

  damagePart(part, dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    part.hitDmg = (part.hitDmg || 0) + dmg;
    if (this.hp <= 0) { this.die(); return; }
    if (part.isHead) {
      Particles.spawn(this.headX(), this.headY(), { vx: 0, vy: -15, life: 0.15, size: 1, color: '#ffd700' });
      return;
    }
    if (part.hitDmg >= part.hp) this.popSegment(part);
    else AudioSys.sfx.hit();
  }

  headX() {
    const head = this.trail[this.trail.length - 1];
    return head ? head.c * 16 + 8 : this.g.W / 2;
  }
  headY() {
    const head = this.trail[this.trail.length - 1];
    return head && head.r >= 0 ? head.r * 16 + this.g.HUD_H + 8 : this.g.HUD_H + 16;
  }

  /* a segment is torn off — burst, mushroom, maybe a pickup */
  popSegment(s) {
    if (s.dead) return;
    s.dead = true;
    const g = this.g;
    const len = this.trail.length;
    const t = this.trail[len - 1 - s.off];
    if (t && t.r >= 0) {
      const cx = t.c * 16 + 8, cy = t.r * 16 + g.HUD_H + 8;
      const gr = t.r * 2, gc = t.c * 2;
      const rowVal = 100 + Math.floor(clamp(t.r / this.maxCoarseR, 0, 1) * 300);
      g.addScore(rowVal * g.scoreMult(), cx, cy, true);
      AudioSys.sfx.segPop();
      Particles.burst(cx, cy, ['#9d4dff', '#ff2d95', '#fff'], 16, 70);
      if (gr < g.PLAY_ZONE && !g.mushAt(gr, gc)) g.setMush(gr, gc);
      if (chance(0.08)) g.dropPickup(gc, gr);
    }
  }

  touchHit(px, py) {
    const len = this.trail.length;
    const head = this.trail[len - 1];
    if (head && head.r >= 0 && Math.abs(px - (head.c * 16 + 8)) < 11 && Math.abs(py - (head.r * 16 + this.g.HUD_H + 8)) < 11) return true;
    for (const s of this.segs) {
      if (s.dead) continue;
      const t = this.trail[len - 1 - s.off];
      if (!t || t.r < 0) continue;
      if (Math.abs(px - (t.c * 16 + 8)) < 11 && Math.abs(py - (t.r * 16 + this.g.HUD_H + 8)) < 11) return true;
    }
    return false;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.g.bossKilled(this);
  }

  draw(ctx) {
    const g = this.g;
    if (this.dead) return;
    const len = this.trail.length;
    const head = this.trail[len - 1];
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);

    // entrance telegraph: blinking red beam down the entry column
    if (this.enterT > 0) {
      const blink = Math.floor(this.enterT * 6) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(255,45,149,0.10)' : 'rgba(255,45,149,0.04)';
      ctx.fillRect(0, g.HUD_H, g.W, 24);
      ctx.fillStyle = blink ? '#ff2d95' : '#9d4dff';
      const cx = head.c * 16 + 8;
      ctx.fillRect(cx - 2, g.HUD_H, 4, 14);
      ctx.fillRect(cx - 4, g.HUD_H + 14, 8, 2);
      ctx.fillRect(cx - 6, g.HUD_H + 16, 12, 2);
      return;
    }

    const frozen = g.freezeT > 0;

    // body tail → head so the head sits on top
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const s = this.segs[i];
      if (s.dead) continue;
      const t = this.trail[len - 1 - s.off];
      if (!t || t.r < 0) continue;
      const px = t.c * 16, py = t.r * 16 + g.HUD_H;
      const eyeOn = s.eyeOpen || this.coreOpen || frozen;
      drawSprite(ctx, eyeOn ? queenSegEyeSpr : queenSegSpr, px, py, 2);
      if (s.hitDmg > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px + 2, py + 2, 2, 1);
        ctx.fillRect(px + 11, py + 5, 3, 1);
        ctx.fillRect(px + 6, py + 9, 2, 2);
      }
      if (frozen) { ctx.fillStyle = 'rgba(157,77,255,0.28)'; ctx.fillRect(px, py, 16, 16); }
      else if (this.berserk) { ctx.fillStyle = 'rgba(255,45,149,' + (0.10 + pulse * 0.12).toFixed(3) + ')'; ctx.fillRect(px, py, 16, 16); }
    }

    if (head.r < 0) return;
    const hx = head.c * 16, hy = head.r * 16 + g.HUD_H;
    const coreOn = this.coreOpen || frozen;
    let hSpr = queenHeadSpr;
    if (frozen) hSpr = queenHeadOpenSpr;
    else if (this.berserk) hSpr = coreOn ? queenHeadOpenSpr : queenHeadAngrySpr;
    // aura
    ctx.globalAlpha = 0.16 + pulse * 0.16;
    ctx.fillStyle = this.berserk ? '#ff2d95' : '#9d4dff';
    ctx.fillRect(hx - 3, hy - 3, 22, 22);
    ctx.globalAlpha = 1;
    drawSprite(ctx, hSpr, hx, hy, 2);
    if (frozen) { ctx.fillStyle = 'rgba(157,77,255,0.28)'; ctx.fillRect(hx, hy, 16, 16); }

    // attack telegraph ring around the head
    if (this.telegraph > 0) {
      const a = 0.35 + 0.45 * Math.sin(performance.now() / 60);
      ctx.globalAlpha = a;
      ctx.strokeStyle = this.attack === 'charge' ? '#ffb000' : '#ff2d95';
      ctx.lineWidth = 1;
      ctx.strokeRect(hx - 4 + Math.sin(performance.now() / 50) * 2, hy - 4, 24, 24);
      ctx.globalAlpha = 1;
    }
  }
}

/* ============================================================
   VENOM — the queen's spit. Slow, aimed, poisons mushrooms.
   ============================================================ */
class Venom {
  constructor(g, x, y, vx, vy) {
    this.g = g;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = 3.5;
    this.dead = false;
    this.phase = rand(0, TAU);
  }
  update(dt) {
    if (this.dead) return;
    const slow = this.g.freezeT > 0 ? 0.25 : 1;
    this.life -= dt * slow;
    this.x += this.vx * dt * slow;
    this.y += this.vy * dt * slow;
    this.phase += dt * 10;
    // poison mushrooms on impact
    const c = Math.floor(this.x / CELL), r = Math.floor((this.y - this.g.HUD_H) / CELL);
    if (this.g.mushAt(r, c)) {
      this.g.poisonMush(r, c, true);
      Particles.burst(this.x, this.y, ['#ff2d95', '#fff'], 6, 40);
      this.dead = true;
      return;
    }
    if (this.life <= 0 || this.x < -4 || this.x > this.g.W + 4 || this.y < this.g.HUD_H - 4 || this.y > this.g.H + 4) this.dead = true;
    if (chance(0.5)) Particles.spawn(this.x, this.y, { vx: 0, vy: 0, life: 0.2, size: 1, color: '#ff2d95' });
  }
  draw(ctx) {
    if (this.dead) return;
    const wob = Math.sin(this.phase) * 1.5;
    const x = this.x + wob;
    ctx.fillStyle = '#ff2d95';
    ctx.fillRect(x - 1, this.y - 3, 2, 4);
    ctx.fillStyle = '#ffd7ee';
    ctx.fillRect(x, this.y - 4, 1, 2);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#ff2d95';
    ctx.fillRect(x - 2, this.y - 4, 4, 6);
    ctx.globalAlpha = 1;
  }
}

/* ============================================================
   EGG SAC — the queen's brood. Shoot it before it hatches,
   or let a bomb clear the whole nest.
   ============================================================ */
class Egg {
  constructor(g, c, r, hatchT) {
    this.g = g;
    this.c = c; this.r = r;
    this.hp = 2;
    this.hatchT = hatchT || 3.5;
    this.dead = false;
    this.phase = rand(0, TAU);
  }
  get value() { return 150; }
  update(dt) {
    if (this.dead) return;
    if (this.g.freezeT > 0) return; // frozen pods don't hatch
    this.hatchT -= dt;
    this.phase += dt * 5;
    if (this.hatchT <= 0) this.hatch();
  }
  hatch() {
    if (this.dead) return;
    this.dead = true;
    const g = this.g;
    const x = this.c * CELL + 4, y = this.r * CELL + g.HUD_H + 4;
    Particles.burst(x, y, ['#ff2d95', '#fff', '#9d4dff'], 14, 60);
    AudioSys.sfx.hatch();
    if (g.centipedes.filter(c => !c.dead && !c.escape).length >= 4) return;
    for (let i = 0; i < 2; i++) {
      const cp = new Centipede(g, { length: 6, warn: false });
      cp.queenMinion = true;
      g.centipedes.push(cp);
    }
  }
  draw(ctx) {
    if (this.dead) return;
    const g = this.g;
    const px = this.c * CELL, py = this.r * CELL + g.HUD_H;
    const near = this.hatchT < 1 && Math.floor(this.hatchT * 8) % 2 === 0;
    const pulse = 0.5 + 0.5 * Math.sin(this.phase);
    // sac membrane + pulsing embryo
    ctx.fillStyle = near ? '#ffd7ee' : '#ff2d95';
    ctx.fillRect(px + 1, py + 2 - pulse, 6, 5 + pulse);
    ctx.fillStyle = near ? '#ff2d95' : '#ff8ecb';
    ctx.fillRect(px + 2, py + 3 - pulse, 4, 3 + pulse);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(px + 3, py + 4 - pulse, 2, 2);
    ctx.globalAlpha = 0.12 + pulse * 0.1;
    ctx.fillStyle = '#ff2d95';
    ctx.fillRect(px - 1, py - 1, 10, 10);
    ctx.globalAlpha = 1;
  }
}

/* ============================================================
   ENTITY REGISTRY
   ============================================================ */
const EntityClasses = { Player, Bullet, Missile, Centipede, Spider, Flea, Scorpion, Virus, Pickup, BugQueen, Venom, Egg };
