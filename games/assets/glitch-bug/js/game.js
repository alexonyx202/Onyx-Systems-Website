/* ============================================================
   GLITCH BUG — game.js
   Core engine: loop, state machine, spawning, collisions,
   scoring, levels, difficulty, weapons, HUD, attract mode.
   ============================================================ */
'use strict';

const W = 320, H = 256, HUD_H = 24, CELL = 8, COLS = 40, ROWS = 29, PLAY_ZONE = 23;
// PLAY_ZONE = first row of the player's turf (rows PLAY_ZONE..ROWS-1). It is
// 6 rows tall — double the old 3-row strip — so the blob owns the whole area
// below the mushroom field / bonus maze instead of a thin band at the very
// bottom. Everything else keys off this constant: mushrooms and maze walls
// stop above it, the boundary line marks it, and the player's clamp spans it.
// per-row ceiling (24 of 40 cells): no row may ever grow into a wall. Even on
// a maxed-out late field, fleas/segments re-seed any row the player isn't
// clearing, so the global density cap alone can't stop one row stacking up.
// Both fillField and setMush enforce this, keeping crowding dense but never
// 30+/40. (Bonus maze walls are exempt — makeMaze writes rows directly.)
const ROW_CAP = Math.round(COLS * 0.6);

const DIFFS = {
  // density = base * pow(ramp, level-1): airy through the mid levels, with
  // the cap only reached in the late game (normal caps ~L27, hard ~L23,
  // insane ~L19, easy never) so levels 10-20 breathe and the final stretch
  // crowds in
  // maze = bonus-round tuning: gapW range (cells), double = chance a wall
  // doubles from level 15 on, shiftCd = seconds between hole-shifts. Easy
  // gets wide gaps and rare double walls; insane threads single-cell gaps
  // with a fast-shifting maze.
  // centCps/milliCps = cells-per-second at level 1 with a full body, so
  // early levels crawl like the arcade (normal = the original's ~4 cells/s);
  // the levelSpeedFactor() ramp builds speed from there. warn = seconds the
  // entry column telegraphs before the bug descends (snappier on harder
  // difficulties).
  easy:   { name: 'EASY',   desc: 'Slow bugs · 4 lives', centCps: 3.0, milliCps: 2.4, warn: 1.5, fleaInterval: 4, playerSpeed: 96,  density: 0.07, ramp: 1.04,  lives: 4, spider: 0.8, fleaLimit: 0.45, maze: { gapW: [2, 3], double: 0.15, shiftCd: 0.7 } },
  normal: { name: 'NORMAL', desc: 'Just like the arcade',          centCps: 4.0, milliCps: 3.2, warn: 1.2, fleaInterval: 3, playerSpeed: 112, density: 0.10, ramp: 1.06,  lives: 3, spider: 1,   fleaLimit: 0.6, maze: { gapW: [1, 3], double: 0.3, shiftCd: 0.5 } },
  hard:   { name: 'HARD',   desc: 'Fast bugs · poison everywhere',        centCps: 5.0, milliCps: 4.0, warn: 1.0, fleaInterval: 2, playerSpeed: 122, density: 0.11, ramp: 1.065, lives: 3, spider: 1.25, fleaLimit: 0.7, maze: { gapW: [1, 2], double: 0.45, shiftCd: 0.35 } },
  insane: { name: 'INSANE', desc: 'System meltdown · 2 lives',            centCps: 6.5, milliCps: 5.2, warn: 0.8, fleaInterval: 1, playerSpeed: 132, density: 0.12, ramp: 1.075, lives: 2, spider: 1.5,  fleaLimit: 0.8, maze: { gapW: [1, 1], double: 0.5, shiftCd: 0.2 } },
};

const WEAPONS = [
  { name: 'BLASTER', short: 'BLS', fireInterval: 140, shots: 1, spread: 0,    pierce: false },
  { name: 'SPREAD',  short: 'SPR', fireInterval: 190, shots: 3, spread: 0.32, pierce: false },
  { name: 'LASER',   short: 'LSR', fireInterval: 110, shots: 1, spread: 0,    pierce: true },
  { name: 'TWIN',    short: 'TWN', fireInterval: 120, shots: 2, spread: 0.22, pierce: false },
];

const EXTRA_LIFE_AT = [10000, 30000, 60000, 100000, 150000];

class GameCore {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    // expose grid constants to entities
    this.W = W; this.H = H; this.HUD_H = HUD_H; this.CELL = CELL;
    this.COLS = COLS; this.ROWS = ROWS; this.PLAY_ZONE = PLAY_ZONE;

    // settings
    this.diffKey = Store.get('diff', 'normal');
    this.diff = DIFFS[this.diffKey] || DIFFS.normal;
    this.controlMode = Store.get('control', 'both'); // both | keyboard | mouse
    AudioSys.setVolume(Store.get('volume', 0.7));
    AudioSys.setMusic(Store.get('music', true));
    AudioSys.setSfx(Store.get('sfx', true));

    // run state
    this.state = 'boot';
    this.attract = true;
    this.score = 0;
    this.displayScore = 0;
    this.lives = 0;
    this.level = 1;
    this.bombs = 0;
    this.missiles = 0;
    this.weaponIdx = 0;
    this.nextExtraIdx = 0;
    this.freezeT = 0;
    this.multT = 0;
    this.bannerT = 0;
    this.bannerText = '';
    this.shakeT = 0;
    this.spawnProtect = 0;
    this.levelClearing = false;
    this.dyingT = 0;
    // active run's RNG seed: rolled fresh each startRun() unless one is
    // pinned explicitly (daily field / replays). Set + setRngSeed before
    // startLevel() makes the whole run reproducible from this one number.
    this.runSeed = 0;

    // world
    this.grid = [];
    for (let r = 0; r < ROWS; r++) this.grid.push(new Array(COLS).fill(null));
    this.player = new Player(this);
    this.bullets = [];
    this.missilesArr = [];
    this.centipedes = [];
    this.spiders = [];
    this.fleas = [];
    this.scorpions = [];
    this.viruses = [];
    this.pickups = [];
    this.eggs = [];
    this.venom = [];
    this.boss = null;
    this.bonusMode = false;
    this.bonusT = 0;
    this.bonusGain = 0;
    this.bonusSwarmTarget = 2;
    this.bonusSwarmT = 1.2;
    this._lastBonusSec = 0;
    this.mazeWalls = []; // per-wall gap state for the moving-hole maze
    this._mazeShiftCd = 0; // gates how often the holes may jump
    this.mazeShifts = 0;
    this.spawnSpiderT = 5;
    this.spawnScorpT = 12;
    this.spawnFleaT = 3;
    this.spawnVirusT = 6;

    this.hiScore = HighScores.best() ? HighScores.best().score : 0;
    this.lastMouseMove = 0;

    // bind loop
    this._last = performance.now();
    this._acc = 0;
    this._raf = requestAnimationFrame((t) => this.loop(t));
  }

  /* ---------------- UI-facing API ---------------- */
  get diffList() { return DIFFS; }
  setDifficulty(key) {
    this.diffKey = key;
    this.diff = DIFFS[key];
    Store.set('diff', key);
    AudioSys.sfx.uiSelect();
  }
  setControl(mode) { this.controlMode = mode; Store.set('control', mode); }
  get weaponName() { return WEAPONS[this.weaponIdx].name; }
  get weapon() { return WEAPONS[this.weaponIdx]; }

  hiScoreNow() { return Math.max(this.hiScore, this.score); }

  startRun(seed) {
    // restore user's sound prefs (leaving attract mode)
    AudioSys.setMusic(Store.get('music', true));
    AudioSys.setSfx(Store.get('sfx', true));
    AudioSys.setVolume(Store.get('volume', 0.7));
    this.attract = false;
    this.state = 'playing';
    this.clearGrid();
    this.score = 0;
    this.displayScore = 0;
    this.level = 1;
    this.lives = this.diff.lives;
    this.bombs = 0;
    this.missiles = 1;
    this.weaponIdx = 0;
    this.nextExtraIdx = 0;
    this.dyingT = 0;
    this.player.alive = true;
    this.player.invulnT = 2;
    this.player.shieldT = 0;
    this.player.overclockT = 0;
    // fresh run = fresh state: cooldowns, powerups, and counters must not
    // leak from a previous run on the same page. Seeded replays and plain
    // "play again" both depend on startRun() always producing byte-identical
    // initial conditions (a stale fireCd alone delays first shots and forks
    // the whole run). startLevel() already resets bonusGain/mazeWalls/etc.
    // these mirror the GameCore/Player constructor defaults — if you add a
    // field to either constructor, add its reset here too
    this.player.fireCd = 0;
    this.player.respawnT = 0;
    this.player.diedAt = 0;
    this.player.autoFire = true; // constructor default
    this.multT = 0;
    this.spawnProtect = 0;
    this.bannerT = 0;
    this.shakeT = 0;
    this.mazeShifts = 0;
    this._attractRestartT = 0;
    this._levelTimer = 0;
    // fresh run always starts from the spawn point (never where the last run ended)
    this.player.x = W / 2;
    this.player.y = this.playerSpawnY();
    // pin the whole run to a seed: an explicit seed (daily field, replay,
    // testing) wins; otherwise roll a fresh random one so every game is a
    // new field. runSeed always reflects the active run. The pin must land
    // before startLevel(), which draws field/maze/spawns from the RNG.
    this.runSeed = seed === undefined ? (Math.random() * 0x100000000) >>> 0 : seed >>> 0;
    setRngSeed(this.runSeed);
    this.startLevel();
    AudioSys.sfx.coin();
    AudioSys.startMusic();
  }

  /* The Daily Field: the same deterministic field for everyone, all day */
  startDailyRun() { this.startRun(dailySeed()); }

  backToMenu() {
    this.attract = true;
    this.state = 'menu';
    this.stopMusicForMenu();
    this.startAttractWorld();
  }

  stopMusicForMenu() {
    AudioSys.setMusic(Store.get('music', true));
    // mute sfx while in menus so attract mode stays quiet
    AudioSys.setSfx(false);
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      AudioSys.sfx.uiSelect();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this._last = performance.now();
      AudioSys.sfx.uiSelect();
    }
  }

  /* ---------------- LEVELS ---------------- */
  clearGrid() {
    for (let r = 0; r < ROWS; r++) this.grid[r].fill(null);
  }

  startLevel() {
    this.levelClearing = false;
    this.freezeT = 0;
    this.bullets.length = 0;
    this.missilesArr.length = 0;
    this.centipedes.length = 0;
    this.spiders.length = 0;
    this.fleas.length = 0;
    this.scorpions.length = 0;
    this.viruses.length = 0;
    this.pickups.length = 0;
    this.eggs.length = 0;
    this.venom.length = 0;
    this.boss = null;
    this.bonusMode = false;
    this.bonusT = 0;
    this.bonusGain = 0;
    this._lastBonusSec = 0;
    this.mazeWalls = [];
    this._mazeShiftCd = 0;

    // special rounds: a bonus swarm-maze race on every 5th level (never a
    // boss level — those own the 10s). The maze replaces the field.
    const isBonus = !this.attract && this.level % 10 === 5;
    const isBoss = !this.attract && this.level % 10 === 0;
    if (isBonus) {
      this.bonusMode = true;
      this.bonusT = this.level >= 25 ? 14 : this.level >= 15 ? 15 : 16;
      this.bonusSwarmTarget = Math.min(4, 2 + Math.floor((this.level - 5) / 10));
      this.bonusSwarmT = 1.2;
      this.clearGrid();
      this.makeMaze();
    }

    // density grows exponentially with level: early levels are sparse and open,
    // mid levels stay airy, and only the late game crowds in toward the cap.
    // Existing mushrooms are kept, so each level only tops the field up toward
    // the (rising) target. (Bonus rounds skip this — the maze IS the field.)
    if (!this.bonusMode) this.fillField();

    // boss levels (every 10): the BUG QUEEN claims the field instead of the
    // usual swarm — she brings her own brood
    if (this.bonusMode) {
      this.spawnSwarm();
    } else if (isBoss) {
      this.boss = new BugQueen(this, this.level);
    } else {
      const cent = Math.min(3, 1 + Math.floor((this.level - 1) / 4));
      for (let i = 0; i < cent; i++) {
        const cp = new Centipede(this, { warnDelay: i * 0.9 });
        cp.initLen = 12;
        this.centipedes.push(cp);
      }
      const milli = this.level >= 3 ? Math.min(2, 1 + Math.floor((this.level - 3) / 6)) : 0;
      for (let i = 0; i < milli; i++) {
        const mp = new Centipede(this, { isMilli: true, length: 22, warnDelay: (cent + i) * 0.9 });
        this.centipedes.push(mp);
      }
    }

    this.spawnSpiderT = Math.max(3, 8 - this.level * 0.5);
    this.spawnScorpT = this.level >= 2 ? Math.max(6, 13 - this.level) : 999;
    this.spawnFleaT = 3;
    this.spawnVirusT = 7;
    if (this.bonusMode) this.spawnSpiderT = this.spawnScorpT = this.spawnFleaT = this.spawnVirusT = 9999;

    this.banner(this.bonusMode ? 'BONUS ROUND!' : 'LEVEL ' + this.level, this.bonusMode ? 1.6 : this.boss ? 1.2 : 2.0);
    if (!this.attract) {
      if (this.bonusMode) AudioSys.sfx.bonus();
      else AudioSys.sfx.levelClear();
    }
    // cabinet-tint hook (game -> UI): AUTO theme mode rolls a fresh tint per
    // level here. Guarded — the very first attract start can run before ui.js
    // has loaded, and the tint is cosmetic, never a gameplay dependency.
    if (typeof UI !== 'undefined' && UI.onLevelStart) UI.onLevelStart(this.level);
  }

  /* Top up the field toward the level's target density (normal levels only).
     Existing mushrooms are kept, so each level only fills toward the rising
     target; early levels stay evenly scattered instead of clumpy. The cap
     (0.44 — just under setMush's 0.46 hard ceiling) is only reached in the
     late game, so mid levels stay airy and the final stretch crowds in. */
  fillField() {
    const fieldCells = COLS * PLAY_ZONE;
    const maxDensity = 0.44;
    const target = Math.round(fieldCells * Math.min(maxDensity, this.diff.density * Math.pow(this.diff.ramp, this.level - 1)));
    let placed = 0;
    const rowCounts = new Array(PLAY_ZONE).fill(0);
    for (let r = 0; r < PLAY_ZONE; r++) {
      const row = this.grid[r];
      for (let c = 0; c < COLS; c++) if (row[c]) { placed++; rowCounts[r]++; }
    }
    // while the field is open, reject mushrooms that would sit right next to
    // another one — keeps early levels evenly scattered instead of clumpy
    const spacingOn = placed / fieldCells < 0.22;
    let guard = 0;
    while (placed < target && guard++ < 8000) {
      const c = randi(0, COLS - 1);
      const r = randi(0, PLAY_ZONE - 1);
      if (this.grid[r][c]) continue;
      // per-row ceiling (same rule as setMush): the late game crowds in total
      // density, never by stacking any single row into a wall
      if (rowCounts[r] >= ROW_CAP) continue;
      if (spacingOn && (this.grid[r][c - 1] || this.grid[r][c + 1]) && chance(0.75)) continue;
      this.grid[r][c] = { hp: 3, max: 3, poison: false };
      placed++;
      rowCounts[r]++;
    }

    // from level 6 on, a few mushrooms grow in the player zone so the bottom
    // of the screen stops being a safe haven. The cap scales with the zone's
    // doubled size (6 rows), keeping the same per-row density the old 3-row
    // zone had (capped — counts existing ones)
    if (this.level >= 6) {
      const pzTarget = Math.min(24, Math.round((this.level - 5) * 4.4));
      let pzPlaced = 0;
      for (let r = PLAY_ZONE; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) if (this.grid[r][c]) pzPlaced++;
      }
      let pzGuard = 0;
      while (pzPlaced < pzTarget && pzGuard++ < 400) {
        const c = randi(0, COLS - 1);
        const r = randi(PLAY_ZONE, ROWS - 1);
        if (!this.grid[r][c]) { this.grid[r][c] = { hp: 3, max: 3, poison: false }; pzPlaced++; }
      }
    }
  }

  /* Randomized serpentine maze for the bonus round: walls land on random
     rows (3-4 apart) with per-wall random gap widths and sides, so no two
     bonus mazes are alike. Difficulty shapes the maze: EASY threads wide
     gaps with only rare double walls, NORMAL keeps the classic mix, HARD
     tightens up, and INSANE races through single-cell gaps in a maze that
     re-weaves almost constantly. The swarm threads every wall through its
     gap (a crossing per wall) and the holes keep shifting as swarms run
     the course. Pellet scatter is kept light and stays clear of every cell
     the swarm must move through: never on a wall, never in a gap, never on
     a gap's landing cell, and never in the corridor the swarm slides along
     to reach a gap — the original arcade centipede never barges through
     mushrooms, it goes around them. */
  makeMaze() {
    this.mazeWalls = [];
    const maze = this.diff.maze || { gapW: [1, 3], double: 0.3, shiftCd: 0.5 };
    const doubleChance = this.level >= 15 ? maze.double : 0; // late levels thicken some walls
    // the late game squeezes gaps down a notch, but never below the
    // difficulty's floor (easy always keeps multi-cell lanes; insane is
    // already pinned to single-cell)
    const gapHi = Math.max(maze.gapW[0], maze.gapW[1] - (this.level >= 25 ? 1 : 0));
    let r = randi(4, 5);                              // random first wall row (>= 4 for crossing credit)
    let side = chance(0.5) ? 0 : 1;
    while (r < PLAY_ZONE) {
      const rows = [r];
      if (r + 1 < PLAY_ZONE && chance(doubleChance)) rows.push(r + 1); // backing row (never into the player zone)
      const gapW = randi(maze.gapW[0], gapHi);
      side = chance(0.65) ? side : 1 - side; // mostly alternate, with jitter
      const gap = side === 0 ? randi(3, 14) : randi(COLS - 15, COLS - 4);
      for (const rr of rows) {
        for (let c = 0; c < COLS; c++) {
          let inGap = false;
          for (let d = 0; d < gapW; d++) if (c === gap + d) { inGap = true; break; }
          if (inGap) continue;
          this.grid[rr][c] = { hp: 3, max: 3, poison: false };
        }
      }
      this.mazeWalls.push({ rows, gap, gapW, side, flashT: 0 });
      r += randi(3, 4);
      // a double wall needs one extra free row below it, or the next wall's
      // slide corridor would land inside the backing row and trap swarms
      if (rows.length > 1 && r < rows[0] + 3) r = rows[0] + 3;
    }
    // light pellet scatter — only in cells the swarm never has to cross:
    // wall rows, gap cells, gap landing cells, and the whole slide corridor
    // above every wall are off-limits so a golden swarm can always thread
    // the maze (it turns around instead of barging through mushrooms)
    const pellets = Math.min(14, 6 + Math.floor(this.level / 10) * 2);
    const noPellet = new Set();
    for (const w of this.mazeWalls) {
      const top = w.rows[0], bot = w.rows[w.rows.length - 1];
      for (let c = 0; c < COLS; c++) noPellet.add((top - 1) * COLS + c);          // slide corridor
      for (const rr of w.rows) for (let d = 0; d < w.gapW; d++) noPellet.add(rr * COLS + w.gap + d); // gap cells
      for (let d = 0; d < w.gapW; d++) noPellet.add((bot + 1) * COLS + w.gap + d); // gap landing
    }
    let placed = 0, guard = 0;
    while (placed < pellets && guard++ < 2000) {
      const r = randi(2, PLAY_ZONE - 1), c = randi(0, COLS - 1);
      if (this.grid[r][c] || noPellet.has(r * COLS + c)) continue;
      this.grid[r][c] = { hp: 3, max: 3, poison: false };
      placed++;
    }
  }

  /* A swarm finished its run through the maze (escaped or destroyed) — the
     holes move. Cooldown-gated so a double crossing in one frame can't jump
     the maze twice; a stuck swarm escaping also counts, which frees its
     boxed-in siblings. Only swarms that actually entered the maze (row 4+)
     count — a swarm sniped right at spawn never crossed a wall. */
  swarmCrossed(headR, escaped) {
    if (!this.bonusMode || this._mazeShiftCd > 0) return;
    // only count swarms that actually entered the maze — the first wall can
    // now sit at row 4 OR 5 (makeMaze randomizes it), so compare against it
    const firstWall = this.mazeWalls.length ? this.mazeWalls[0].rows[0] : 4;
    if (!escaped && (headR == null || headR < firstWall)) return;
    // per-difficulty hole-shift cooldown: easy re-weaves slowly, insane
    // almost constantly
    const maze = this.diff.maze || { gapW: [1, 3], double: 0.3, shiftCd: 0.5 };
    this._mazeShiftCd = maze.shiftCd;
    this.shiftMazeHoles();
  }

  /* Move every wall's gap to a fresh spot on the same side. Only the gap
     cells change — mushrooms the player already popped stay popped, so the
     maze-clear race is never reset. Fresh holes flash gold so the shift
     reads at a glance. */
  shiftMazeHoles() {
    if (!this.bonusMode || !this.mazeWalls.length) return;
    this.mazeShifts++;
    for (const w of this.mazeWalls) {
      // a wall the player has fully popped has no hole left to move
      let intact = false;
      for (const rr of w.rows) {
        for (let c = 0; c < COLS; c++) { if (this.grid[rr][c]) { intact = true; break; } }
        if (intact) break;
      }
      if (!intact) continue;
      // pick a new gap — never the same spot, and never one that overlaps
      // the old gap (a cell that is both old- and new-gap must not be
      // closed after it was just opened)
      let ng = w.gap;
      let tries = 0;
      const overlaps = (a) => a < w.gap + w.gapW && a + w.gapW > w.gap;
      do { ng = w.side === 0 ? randi(3, 14) : randi(COLS - 15, COLS - 4); }
      while (overlaps(ng) && tries++ < 5);
      // any live swarm segment (head OR body — the body follows the head's
      // exact trail, so it can be anywhere along the old gap at shift time)
      const occupied = (rr, cc) => this.centipedes.some(cp => {
        if (cp.dead) return false;
        for (const t of cp.trail) if (t.r === rr && t.c === cc) return true;
        return false;
      });
      // 1) close the old hole — but never a cell that's part of the new
      //    gap (about to be opened) and never a cell a bug is standing in
      for (const rr of w.rows) {
        for (let d = 0; d < w.gapW; d++) {
          const cc = w.gap + d;
          if (cc >= ng && cc < ng + w.gapW) continue;
          if (occupied(rr, cc)) continue;
          if (!this.grid[rr][cc]) this.grid[rr][cc] = { hp: 3, max: 3, poison: false };
        }
      }
      // 2) open the new hole (preserving popped cells)
      for (const rr of w.rows) {
        for (let d = 0; d < w.gapW; d++) {
          this.removeMush(rr, ng + d);
          Particles.spawn((ng + d) * CELL + 4, rr * CELL + HUD_H + 4, { vx: rand(-8, 8), vy: rand(-12, 4), life: 0.35, size: 1, color: '#ffd700' });
        }
      }
      w.gap = ng;
      w.flashT = 0.9;
    }
    AudioSys.sfx.shift();
    Particles.addText(W / 2, 70, 'MAZE SHIFT', '#ffd700', 1, 1.1);
  }

  spawnSwarm() {
    const cp = new Centipede(this, { length: 8, warn: false, swarm: true });
    this.centipedes.push(cp);
    const head = cp.trail[cp.trail.length - 1];
    Particles.burst(head.c * CELL + 4, this.HUD_H + 4, ['#ffd700', '#fff'], 8, 50);
    AudioSys.sfx.enter();
  }

  banner(text, dur) {
    this.bannerText = text;
    this.bannerT = dur;
  }

  checkLevelEnd() {
    if (this.attract) return;
    if (this.bonusMode) return; // the bonus race has its own ending
    if (this.levelClearing || this.state !== 'playing') return;
    const alive = this.centipedes.filter(c => !c.dead && !c.escape);
    if (this.boss && !this.boss.dead) return; // the QUEEN must fall first
    if (alive.length > 0) return;
    this.levelClearing = true;
    const bonus = 1000 + this.level * 100;
    this.addScore(bonus, this.player.x, this.player.y - 8, true);
    this.banner('LEVEL CLEAR  +' + bonus, 1.8);
    AudioSys.sfx.levelClear();
    // despawn stragglers
    for (const s of this.spiders.concat(this.fleas, this.scorpions, this.viruses)) {
      if (!s.dead) Particles.burst(s.x || s.c * CELL, s.y || s.r * CELL + HUD_H, ['#ff2d95', '#00e5ff', '#fff'], 8, 40);
    }
    this.spiders = []; this.fleas = []; this.scorpions = []; this.viruses = [];
    this._levelTimer = 1.8;
  }

  levelSpeedFactor() {
    // speed builds with level: 1.0 at L1, ~4.1× by L30 (cap 4.2). Early
    // levels crawl like the arcade; the late game reaches the old intensity
    // instead of the old curve, which saturated at 0.7 by L10 and held the
    // whole game at one speed.
    return Math.min(4.2, Math.pow(1.05, this.level - 1));
  }
  playerSpeedFactor() { return 1; }
  scoreMult() { return this.multT > 0 ? 2 : 1; }

  /* mid-band spawn inside the player zone — derived from the zone bounds so
     it stays centered however tall PLAY_ZONE grows */
  playerSpawnY() { return Math.round((PLAY_ZONE * CELL + HUD_H + 1 + H - 3) / 2); }

  /* ---------------- GRID ---------------- */
  inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
  mushAt(r, c) { return this.inBounds(r, c) && !!this.grid[r][c]; }
  isPoison(r, c) { return this.inBounds(r, c) && this.grid[r][c] && this.grid[r][c].poison; }
  fieldMushCount() {
    let n = 0;
    for (let r = 0; r < PLAY_ZONE; r++) {
      for (let c = 0; c < COLS; c++) if (this.grid[r][c]) n++;
    }
    return n;
  }
  // mushrooms in a single row — the per-row ceiling check shared by setMush
  // and fillField, so both cap sites use identical counting and thresholds
  rowMushCount(r) {
    let n = 0;
    const row = this.grid[r];
    for (let c = 0; c < COLS; c++) if (row[c]) n++;
    return n;
  }
  // HUD helper: how many poisoned mushrooms are on the field, and whether
  // any of them has reached the player zone (rows PLAY_ZONE+)
  poisonStats() {
    let count = 0, zone = false;
    for (let r = 0; r < ROWS; r++) {
      const row = this.grid[r];
      for (let c = 0; c < COLS; c++) {
        const m = row[c];
        if (m && m.poison) {
          count++;
          if (r >= PLAY_ZONE) zone = true;
        }
      }
    }
    return { count, zone };
  }
  setMush(r, c) {
    if (!this.inBounds(r, c)) return;
    if (r >= PLAY_ZONE) return; // no mushrooms in the player zone
    if (this.grid[r][c]) return;
    // hard ceiling so flea/segment seeding can't over-saturate the field
    // beyond the intended max density
    if (this.fieldMushCount() >= Math.round(COLS * PLAY_ZONE * 0.46)) return;
    // per-row ceiling (same rule as fillField): a row already at ROW_CAP can't
    // take more — fleas seed 1-3 cells into one row per drop, and any row the
    // player isn't clearing would otherwise stack up to a wall over a long
    // level. Crowding stays dense, but a row can never become 30+/40. (A
    // popped segment's mushroom silently skips in an already-capped row —
    // score and pickups are unaffected, and it only happens in dense rows.)
    if (this.rowMushCount(r) >= ROW_CAP) return;
    this.grid[r][c] = { hp: 3, max: 3, poison: false };
  }
  removeMush(r, c) {
    if (this.inBounds(r, c)) this.grid[r][c] = null;
  }
  poisonMush(r, c, quiet) {
    const m = this.inBounds(r, c) ? this.grid[r][c] : null;
    if (!m) return;
    if (!m.poison) {
      // fresh corruption: flash the magenta glow + faint warning tone so
      // players learn to spot (and shoot) poison near the boundary quickly
      m.poison = true;
      m.pulseT = POISON_FLASH;
      if (!quiet) AudioSys.sfx.poison(); // silent in menu attract (sfx muted there)
    }
  }
  damageMush(r, c) {
    const m = this.inBounds(r, c) ? this.grid[r][c] : null;
    if (!m) return 0;
    if (m.poison) { this.removeMush(r, c); return 100; }
    m.hp--;
    if (m.hp <= 0) {
      this.removeMush(r, c);
      Particles.burst(c * CELL + 4, r * CELL + HUD_H + 4, ['#4aff6a', '#2ea04a', '#baffd0'], 6, 40);
      return 20;
    }
    return 10;
  }

  /* ---------------- SCORING ---------------- */
  addScore(v, x, y, showText) {
    const val = Math.round(v);
    this.score += val;
    // extra life milestones
    while (this.nextExtraIdx < EXTRA_LIFE_AT.length && this.score >= EXTRA_LIFE_AT[this.nextExtraIdx]) {
      this.lives++;
      this.nextExtraIdx++;
      AudioSys.sfx.extraLife();
      Particles.addText(this.player.x, this.player.y - 14, '1UP!', '#ff2d95', 1, 1.4);
    }
    if (showText && x != null) Particles.addText(x, y - 4, String(val), '#ffe94a', 1, 0.8);
  }

  /* ---------------- SPAWNING ---------------- */
  dropPickup(c, r, kind) {
    if (this.pickups.length > 6) return;
    this.pickups.push(new Pickup(this, c, r, kind));
  }

  spawnFleaIfNeeded() {
    if (this.attract) return;
    if (this.fleas.length >= (this.diff.fleaInterval <= 1 ? 3 : 2)) return;
    let segs = 0, init = 0;
    for (const cp of this.centipedes) { segs += cp.segCount(); init += cp.initLen; }
    if (init > 0 && segs / init > this.diff.fleaLimit) return;
    if (chance(0.5)) this.fleas.push(new Flea(this));
  }

  spawnVirusIfNeeded() {
    if (this.attract || this.level < 3) return;
    if (this.viruses.length >= 6) return;
    // find a poisoned mushroom. (Deliberately field rows only: a virus
    // hatching inside the player zone would spawn right on the blob.)
    for (let i = 0; i < 40; i++) {
      const r = randi(0, PLAY_ZONE - 1), c = randi(0, COLS - 1);
      if (this.isPoison(r, c)) {
        this.viruses.push(new Virus(this, c, r));
        Particles.burst(c * CELL + 4, r * CELL + HUD_H + 4, ['#ff2d95', '#9d4dff'], 8, 40);
        return;
      }
    }
  }

  /* ---------------- COMBAT ---------------- */
  fireWeapon(p) {
    const wp = WEAPONS[this.weaponIdx];
    const fx = p.x, fy = p.y - 5;
    if (wp.pierce) AudioSys.sfx.laser(); else AudioSys.sfx.shoot();
    if (wp.shots === 1) {
      this.bullets.push(new Bullet(this, fx, fy, 0, -340, { pierce: wp.pierce }));
    } else {
      for (let i = 0; i < wp.shots; i++) {
        const off = (i - (wp.shots - 1) / 2) * wp.spread;
        const dx = Math.sin(off), dy = -Math.cos(off);
        this.bullets.push(new Bullet(this, fx, fy, dx * 320, dy * 320, { pierce: wp.pierce }));
      }
    }
    while (this.bullets.length > 16) this.bullets.shift();
    // muzzle flash
    Particles.spawn(fx, fy, { vx: 0, vy: -30, life: 0.08, size: 2, color: '#fff' });
  }

  fireMissile() {
    if (this.bonusMode) { AudioSys.sfx.uiMove(); return; } // the race is bullets only
    if (this.missiles <= 0) { AudioSys.sfx.uiMove(); return; }
    this.missiles--;
    this.missilesArr.push(new Missile(this, this.player.x, this.player.y - 4));
    AudioSys.sfx.missile();
  }

  detonateBomb() {
    if (this.bonusMode) { AudioSys.sfx.uiMove(); return; } // the race is bullets only
    if (this.bombs <= 0) { AudioSys.sfx.uiMove(); return; }
    this.bombs--;
    const px = this.player.x, py = this.player.y;
    AudioSys.sfx.bomb();
    this.shakeT = 0.5;
    Particles.ring(px, py, '#ff3b30', 200, 0.6);
    Particles.ring(px, py, '#ffb000', 120, 0.8);
    Particles.burst(px, py, ['#ff3b30', '#ffb000', '#fff'], 40, 160);

    // kill minor enemies
    for (const list of [this.viruses, this.fleas, this.scorpions]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (e.dead) continue;
        e.dead = true;
        const ex = e.x != null ? e.x : e.c * CELL + 4;
        const ey = e.y != null ? e.y : e.r * CELL + HUD_H + 4;
        const val = (e.value || 150) * this.scoreMult();
        this.addScore(val, ex, ey, true);
        Particles.burst(ex, ey, ['#ff2d95', '#fff'], 12, 70);
        list.splice(i, 1);
      }
    }
    // shred centipede segments (skip still-warning centipedes — their
    // segments are off-field and bombing them could cheaply clear a level)
    const cps = this.centipedes.slice();
    for (const cp of cps) {
      if (cp.dead || cp.warnT > 0) continue;
      let pops = randi(3, 6);
      while (pops-- > 0 && cp.segs.length > 0) {
        cp.hitSegment(randi(0, cp.segs.length - 1));
        if (cp.dead) break;
      }
    }
    // BUG QUEEN: the blast smashes her core
    if (this.boss && !this.boss.dead) this.boss.bombHit();
    // egg sacs detonate
    for (const e of this.eggs) {
      if (e.dead) continue;
      e.dead = true;
      const ex = e.c * CELL + 4, ey = e.r * CELL + HUD_H + 4;
      this.addScore(150 * this.scoreMult(), ex, ey, true);
      Particles.burst(ex, ey, ['#ff2d95', '#fff'], 12, 70);
    }
    // clear poison + nearby mushrooms
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const m = this.grid[r][c];
        if (!m) continue;
        const mx = c * CELL + 4, my = r * CELL + HUD_H + 4;
        if (m.poison || Math.hypot(mx - px, my - py) < 90) {
          this.removeMush(r, c);
          Particles.spawn(mx, my, { vx: rand(-20, 20), vy: rand(-30, 10), life: 0.4, size: 2, color: m.poison ? '#ff2d95' : '#4aff6a' });
        }
      }
    }
    this.addScore(50, px, py - 10, true);
  }

  shieldBreak(x, y) {
    // destroy mushrooms in a ring around the player
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!this.grid[r][c]) continue;
        const mx = c * CELL + 4, my = r * CELL + HUD_H + 4;
        if (Math.hypot(mx - x, my - y) < 34) {
          this.removeMush(r, c);
          Particles.burst(mx, my, ['#39ff14', '#baffd0'], 5, 45);
        }
      }
    }
  }

  applyPickup(kind, x, y) {
    const p = this.player;
    switch (kind) {
      case 'weapon':
        if (this.weaponIdx < WEAPONS.length - 1) { this.weaponIdx++; AudioSys.sfx.powerUp(); Particles.addText(x, y - 6, 'WEAPON UP', '#00e5ff', 1, 1.1); }
        else { this.addScore(500, x, y, true); AudioSys.sfx.gem(); }
        break;
      case 'shield': p.shieldT = 20; AudioSys.sfx.shield(); Particles.addText(x, y - 6, 'SHIELD', '#39ff14', 1, 1.1); break;
      case 'overclock': p.overclockT = 8; AudioSys.sfx.powerUp(); Particles.addText(x, y - 6, 'OVERCLOCK', '#ffb000', 1, 1.1); break;
      case 'bomb': this.bombs = Math.min(5, this.bombs + 1); AudioSys.sfx.powerUp(); Particles.addText(x, y - 6, 'BOMB +1', '#ff3b30', 1, 1.1); break;
      case 'freeze': this.freezeT = 5; AudioSys.sfx.freeze(); Particles.addText(x, y - 6, 'FREEZE', '#9d4dff', 1, 1.1); break;
      case 'multi': this.multT = 15; AudioSys.sfx.powerUp(); Particles.addText(x, y - 6, '2X SCORE', '#ffe94a', 1, 1.1); break;
      case 'oneup': this.lives++; AudioSys.sfx.extraLife(); Particles.addText(x, y - 6, '1UP!', '#ff2d95', 1, 1.1); break;
      case 'missile': this.missiles = Math.min(6, this.missiles + 1); AudioSys.sfx.powerUp(); Particles.addText(x, y - 6, 'MISSILE +1', '#ff2d95', 1, 1.1); break;
      case 'gem': this.addScore(500, x, y, true); AudioSys.sfx.gem(); break;
    }
    Particles.ring(x, y, PICKUP_DEFS[kind].color, 70, 0.3);
  }

  loseLife(x, y) {
    const p = this.player;
    p.alive = false;
    p.invulnT = 0;
    AudioSys.sfx.explode();
    AudioSys.sfx.hurt();
    this.shakeT = 0.4;
    Particles.burst(x, y, ['#00e5ff', '#fff', '#ff2d95', '#ffb000'], 40, 120);
    Particles.ring(x, y, '#00e5ff', 150, 0.5);

    if (this.attract) {
      p.respawnT = 2;
      return;
    }
    this.lives--;
    // clear player zone mushrooms (like the original)
    for (let r = PLAY_ZONE; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) this.grid[r][c] = null;
    }
    // strip active powerups, downgrade weapon, lose a bomb
    p.shieldT = 0; p.overclockT = 0;
    this.freezeT = 0; this.multT = 0;
    if (this.weaponIdx > 0) this.weaponIdx--;
    this.bombs = Math.max(0, this.bombs - 1);

    if (this.lives < 0) {
      this.dyingT = 1.4;
    } else {
      p.respawnT = 1.2;
    }
  }

  gameOver() {
    if (this.attract) return;
    this.state = 'gameover';
    AudioSys.stopMusic();
    AudioSys.sfx.gameOver();
    if (this.score > this.hiScore) { this.hiScore = this.score; AudioSys.sfx.highScore(); }
    UI.onGameOver(this.score, this.level);
  }

  /* BUG QUEEN slain: spectacle, loot, and the level-clear flow */
  bossKilled(b) {
    if (this.attract || this.levelClearing) return;
    AudioSys.sfx.bossDie();
    this.shakeT = 0.9;
    // chain detonation along the body
    for (const t of b.trail) {
      if (t.r < 0 || chance(0.5)) continue;
      Particles.burst(t.c * 16 + 8, t.r * 16 + HUD_H + 8, ['#9d4dff', '#ff2d95', '#ffb000', '#fff'], 10, 70);
    }
    const head = b.trail[b.trail.length - 1];
    const hx = head && head.r >= 0 ? head.c * 16 + 8 : W / 2;
    const hy = head && head.r >= 0 ? head.r * 16 + HUD_H + 8 : 60;
    Particles.burst(hx, hy, ['#fff', '#ffb000', '#ff2d95'], 40, 130);
    Particles.ring(hx, hy, '#ff2d95', 220, 0.8);
    Particles.ring(hx, hy, '#ffb000', 140, 1.0);
    const val = (5000 + this.level * 200) * this.scoreMult();
    this.addScore(val, hx, hy, true);
    // guaranteed loot — instant inventory so the kill always pays off (a
    // falling pickup would be wiped by the level transition)
    this.bombs = Math.min(5, this.bombs + 1);
    this.missiles = Math.min(6, this.missiles + 1);
    Particles.addText(hx, hy - 8, 'BOMB +1', '#ff3b30', 1, 1.2);
    Particles.addText(hx, hy - 18, 'MISSILE +1', '#ff2d95', 1, 1.2);
    AudioSys.sfx.powerUp();
    // plus one bonus capsule still falls for the taking
    const gc = head ? clamp(head.c * 2, 0, COLS - 1) : 20;
    const gr = head ? clamp(head.r * 2, 0, PLAY_ZONE - 1) : 8;
    this.dropPickup(gc, Math.min(gr + 2, PLAY_ZONE - 1));
    // the brood dies with the queen
    for (const e of this.eggs) {
      if (!e.dead) Particles.burst(e.c * CELL + 4, e.r * CELL + HUD_H + 4, ['#ff2d95', '#fff'], 8, 50);
      e.dead = true;
    }
    for (const v of this.venom) v.dead = true;
    for (const cp of this.centipedes) {
      if (cp.dead) continue;
      const hd = cp.trail[cp.trail.length - 1];
      if (hd && hd.r >= 0) Particles.burst(hd.c * CELL + 4, hd.r * CELL + HUD_H + 4, ['#aa55ff', '#ff2d95', '#fff'], 10, 60);
      cp.dead = true;
    }
    this.banner('BUG QUEEN DESTROYED', 2.2);
    this.levelClearing = true;
    this._levelTimer = 2.2;
  }

  /* Bonus round over: tally the loot, dissolve the swarm, roll on */
  endBonusRound() {
    if (!this.bonusMode || this.levelClearing) return;
    this.bonusMode = false;
    const cleared = this.fieldMushCount() === 0;
    const extra = (cleared ? 5000 : 2000) * this.scoreMult();
    this.addScore(extra, this.player.x, this.player.y - 10, true);
    this.bonusGain += extra;
    // the maze was a temporary structure — clear its walls so they never
    // leak into the following normal levels (fillField keeps existing
    // mushrooms, which would otherwise freeze the maze's near-solid rows
    // on the field and funnel centipedes through leftover 1-cell gaps)
    this.clearGrid();
    // dissolve leftover swarms
    for (const cp of this.centipedes) {
      if (cp.dead) continue;
      const hd = cp.trail[cp.trail.length - 1];
      if (hd && hd.r >= 0) Particles.burst(hd.c * CELL + 4, hd.r * CELL + HUD_H + 4, ['#ffd700', '#ff2d95', '#fff'], 12, 60);
      cp.dead = true;
    }
    this.banner((cleared ? 'MAZE CLEARED!  +' : 'BONUS ROUND  +') + this.bonusGain, 2.2);
    AudioSys.sfx.bonusEnd();
    this.levelClearing = true;
    this._levelTimer = 2.2;
  }

  /* ---------------- TARGETING ---------------- */
  findEnemy(x, y) {
    let best = null, bd = 1e9;
    const check = (ex, ey) => {
      const d = (ex - x) ** 2 + (ey - y) ** 2;
      if (d < bd) { bd = d; best = { px: ex, py: ey }; }
    };
    // the queen's head and open eyes are the smart-missile priority targets:
    // while she's alive, missiles ALWAYS lock her — no stealing by nearby
    // spiders. Her weak points (open eyes / exposed core) are preferred.
    if (this.boss && !this.boss.dead) {
      const b = this.boss;
      const len = b.trail.length;
      const head = b.trail[len - 1];
      if (head && head.r >= 0) check(head.c * 16 + 8, head.r * 16 + HUD_H + 8);
      for (const s of b.segs) {
        if (s.dead) continue;
        const t = b.trail[len - 1 - s.off];
        if (!t || t.r < 0) continue;
        if (s.eyeOpen || b.coreOpen) check(t.c * 16 + 8, t.r * 16 + HUD_H + 8);
      }
      if (best) return best;
    }
    for (const cp of this.centipedes) {
      if (cp.dead) continue;
      const head = cp.trail[cp.trail.length - 1];
      if (head) check(head.c * CELL + 4, head.r * CELL + HUD_H + 4);
    }
    for (const e of this.spiders) if (!e.dead) check(e.x, e.y);
    for (const e of this.fleas) if (!e.dead) check(e.c * CELL + 4, e.r * CELL + HUD_H + 4);
    for (const e of this.scorpions) if (!e.dead) check(e.c * CELL + 4, e.r * CELL + HUD_H + 4);
    for (const e of this.viruses) if (!e.dead) check(e.x, e.y);
    return best;
  }

  enemyKilled(cp, scoreIt) {
    if (scoreIt && !this.attract) {
      const head = cp.trail[cp.trail.length - 1];
      if (head) this.addScore(25, head.c * CELL + 4, head.r * CELL + HUD_H + 4, true);
    }
  }

  /* ---------------- ATTRACT MODE ---------------- */
  startAttractWorld() {
    resetRng(); // the attract demo is never pinned — always a varied show
    this.clearGrid();
    this.score = 0; this.displayScore = 0;
    this.lives = 3;
    this.level = 1;
    this.weaponIdx = 1;
    this.bombs = 3; this.missiles = 3;
    this.player.alive = true;
    this.player.x = W / 2; this.player.y = this.playerSpawnY();
    this.startLevel();
    this.bannerT = 0;
  }

  /* ---------------- MAIN LOOP ---------------- */
  loop(now) {
    this._raf = requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this._last) / 1000;
    this._last = now;
    dt = Math.min(dt, 0.05);
    this._acc += dt;
    const STEP = 1 / 60;
    let steps = 0;
    while (this._acc >= STEP && steps < 4) {
      this.update(STEP);
      this._acc -= STEP;
      steps++;
    }
    if (steps === 4) this._acc = 0;
    this.render();
  }

  update(dt) {
    Input.update();

    // gamepad Start toggles pause (plays/pauses regardless of focus)
    if (Input.gamepadActionPressed('pause')) {
      if (this.state === 'playing' || this.state === 'paused') this.togglePause();
    }

    // rolling score display
    this.displayScore += (this.score - this.displayScore) * Math.min(1, dt * 10);
    if (Math.abs(this.score - this.displayScore) < 1) this.displayScore = this.score;

    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.freezeT > 0) this.freezeT -= dt;
    if (this.multT > 0) this.multT -= dt;
    if (this.spawnProtect > 0) this.spawnProtect -= dt;

    if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'menu') this.updatePlaying(dt); // attract simulation
    else if (this.state === 'gameover' || this.state === 'paused') {
      // keep particles alive
      Particles.update(dt);
    }
    Input.endFrame();
  }

  updatePlaying(dt) {
    // decay mushroom poison-flash timers (pulses freeze while paused); the
    // clamp lands the timer on exactly 0 so the flash always settles cleanly
    for (let r = 0; r < ROWS; r++) {
      const row = this.grid[r];
      for (let c = 0; c < COLS; c++) {
        const m = row[c];
        if (m && m.pulseT > 0) m.pulseT = Math.max(0, m.pulseT - dt);
      }
    }

    // ----- player -----
    // mouse/keyboard/gamepad control switching: using a pad hands off the mouse
    if (Input.padX || Input.padY || Input.gamepadActive) Input.setMouseActive(false);

    if (this.player.alive && !this.bonusMode && !this.levelClearing && (Input.actionPressed('bomb') || Input.gamepadActionPressed('bomb'))) this.detonateBomb();
    if (this.player.alive && !this.bonusMode && !this.levelClearing && (Input.actionPressed('missile') || Input.gamepadActionPressed('missile'))) this.fireMissile();
    if (this.player.alive && Input.wasPressed('KeyM')) this.toggleMute();

    if (this.dyingT > 0) {
      this.dyingT -= dt;
      if (this.dyingT <= 0) this.gameOver();
    }

    this.player.update(dt);

    // ----- attract AI -----
    if (this.attract && this.player.alive) this.attractAI(dt);

    // ----- attract loop: when the demo field clears, restart the show -----
    // (levelClearing is never set in attract mode — checkLevelEnd early-returns)
    if (this.attract && !this.centipedes.some(c => !c.dead && !c.escape)) {
      this._attractRestartT = (this._attractRestartT || 0) - dt;
      if (this._attractRestartT <= 0) {
        this._attractRestartT = 2.5;
        this.startAttractWorld();
      }
    } else {
      this._attractRestartT = 2.5;
    }

    // ----- timers -----
    this.spawnSpiderT -= dt;
    if (this.spawnSpiderT <= 0) {
      this.spawnSpiderT = Math.max(3, 9 - this.level * 0.5) / (this.attract ? 2 : 1);
      // cap on-screen spiders — combined with their lifespan they can never pile up
      if (this.spiders.length < 3) this.spiders.push(new Spider(this));
    }    this.spawnScorpT -= dt;
    if (this.spawnScorpT <= 0) {
      this.spawnScorpT = Math.max(6, 13 - this.level);
      this.scorpions.push(new Scorpion(this));
    }
    this.spawnFleaT -= dt;
    if (this.spawnFleaT <= 0) {
      this.spawnFleaT = this.diff.fleaInterval <= 1 ? 3 : rand(3.5, 5.5);
      this.spawnFleaIfNeeded();
    }
    this.spawnVirusT -= dt;
    if (this.spawnVirusT <= 0) {
      this.spawnVirusT = 7;
      this.spawnVirusIfNeeded();
    }

    // ----- bonus round race -----
    if (this.bonusMode && !this.levelClearing) {
      this.bonusT -= dt;
      if (this._mazeShiftCd > 0) this._mazeShiftCd = Math.max(0, this._mazeShiftCd - dt);
      for (const w of this.mazeWalls) if (w.flashT > 0) w.flashT = Math.max(0, w.flashT - dt);
      const secs = Math.max(0, Math.ceil(this.bonusT));
      if (secs <= 3 && secs !== this._lastBonusSec) { this._lastBonusSec = secs; AudioSys.sfx.warn(); }
      if (this.bonusT <= 0) {
        this.endBonusRound();
      } else {
        this.bonusSwarmT = (this.bonusSwarmT || 1.2) - dt;
        const alive = this.centipedes.filter(c => !c.dead && !c.escape);
        if (this.bonusSwarmT <= 0 && alive.length < this.bonusSwarmTarget) {
          this.bonusSwarmT = 1.0;
          this.spawnSwarm();
        }
      }
    }

    // ----- entities -----
    for (const cp of this.centipedes) cp.update(dt);
    if (this.boss) this.boss.update(dt);
    for (const e of this.eggs) e.update(dt);
    for (const v of this.venom) v.update(dt);
    for (const s of this.spiders) s.update(dt);
    for (const f of this.fleas) f.update(dt);
    for (const s of this.scorpions) s.update(dt);
    for (const v of this.viruses) v.update(dt);
    for (const b of this.bullets) b.update(dt);
    for (const m of this.missilesArr) m.update(dt);
    for (const p of this.pickups) p.update(dt);

    // remove dead / escaped
    this.centipedes = this.centipedes.filter(c => !c.dead && !c.escape);
    this.spiders = this.spiders.filter(s => !s.dead);
    this.fleas = this.fleas.filter(f => !f.dead);
    this.scorpions = this.scorpions.filter(s => !s.dead);
    this.viruses = this.viruses.filter(v => !v.dead);
    this.eggs = this.eggs.filter(e => !e.dead);
    this.venom = this.venom.filter(v => !v.dead);
    this.bullets = this.bullets.filter(b => !b.dead);
    this.missilesArr = this.missilesArr.filter(m => !m.dead);
    this.pickups = this.pickups.filter(p => !p.dead);
    this.checkLevelEnd();

    // level-clear timer
    if (this.levelClearing && !this.attract) {
      this._levelTimer = (this._levelTimer || 0) - dt;
      if (this._levelTimer <= 0) {
        this.level++;
        this.startLevel();
      }
    }

    // ----- collisions -----
    if (this.player.alive) this.collidePlayer();
    this.collideBullets();

    Particles.update(dt);
  }
  attractAI(dt) {
    // steer toward the lowest centipede head or nearest pickup
    const p = this.player;
    let tx = null, ty = null;
    let lowest = -1;
    for (const cp of this.centipedes) {
      if (cp.dead) continue;
      const head = cp.trail[cp.trail.length - 1];
      if (head && head.r > lowest) { lowest = head.r; tx = head.c * CELL + 4; ty = head.r * CELL + HUD_H + 4; }
    }
    for (const pk of this.pickups) {
      if (!pk.dead && pk.r > lowest) {
        lowest = pk.r;
        tx = pk.c * CELL + 4; ty = pk.r * CELL + HUD_H + 4;
      }
    }
    if (tx != null) {
      // the demo player obeys the same field boundary as a real player
      ty = clamp(ty, PLAY_ZONE * CELL + HUD_H + 1, H - 3);
      const dx = tx - p.x, dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        p.x += dx / d * 90 * dt;
        p.y += dy / d * 90 * dt;
        // re-clamp after moving (attractAI runs after player.update, so the
        // movement itself would otherwise overshoot the wall by a frame)
        p.y = clamp(p.y, PLAY_ZONE * CELL + HUD_H + 1, H - 3);
      }
    }
    p.autoFire = true;
    if (p.fireCd <= 0) {
      this.fireWeapon(p);
      p.fireCd = WEAPONS[this.weaponIdx].fireInterval / 1000;
    }
    // occasional bomb for the show
    if (chance(0.0004) && this.bombs > 0) this.detonateBomb();
  }

  toggleMute() {
    AudioSys.setSfx(!AudioSys.sfxOn);
    AudioSys.setMusic(!AudioSys.musicOn);
    Store.set('sfx', AudioSys.sfxOn);
    Store.set('music', AudioSys.musicOn);
    UI.refreshSoundPanel();
  }

  /* ---------------- COLLISIONS ---------------- */
  collideBullets() {
    const cps = this.centipedes.slice();
    for (const b of this.bullets) {
      if (b.dead) continue;
      const bx = b.x, by = b.y;

      // vs centipedes (head first)
      for (const cp of cps) {
        if (cp.dead) continue;
        const len = cp.trail.length;
        const head = cp.trail[len - 1];
        if (head && head.r >= 0) {
          const hx = head.c * CELL, hy = head.r * CELL + HUD_H;
          if (bx >= hx && bx <= hx + CELL && by >= hy && by <= hy + CELL) {
            if (!b.hitSet.has('h' + cp.id)) {
              b.hitSet.add('h' + cp.id);
              cp.hitHead();
              if (!b.pierce) b.dead = true;
            }
            if (!b.pierce) b.dead = true;
            break;
          }
        }
        let hitIdx = -1;
        for (let i = 0; i < cp.segs.length; i++) {
          const s = cp.segs[i];
          if (s.dead) continue;
          const t = cp.trail[len - 1 - s.off];
          if (!t || t.r < 0) continue;
          const sx = t.c * CELL, sy = t.r * CELL + HUD_H;
          if (bx >= sx && bx <= sx + CELL && by >= sy && by <= sy + CELL) { hitIdx = i; break; }
        }
        if (hitIdx >= 0) {
          const key = cp.id + ':' + hitIdx;
          if (!b.hitSet.has(key)) {
            b.hitSet.add(key);
            cp.hitSegment(hitIdx);
            if (!b.pierce) b.dead = true;
          }
          break;
        }
      }
      if (b.dead) continue;

      // vs the BUG QUEEN (armored — bullets bounce unless the eye/core is open)
      if (this.boss && !this.boss.dead) {
        const qh = this.boss.bulletHit(bx, by);
        if (qh) {
          const key = 'q' + qh.id;
          if (!b.hitSet.has(key)) {
            b.hitSet.add(key);
            this.boss.damageBullet(qh.part, bx, by);
          }
          if (!b.pierce) b.dead = true;
        }
      }
      if (b.dead) continue;

      // vs other enemies
      const enemyLists = [this.viruses, this.spiders, this.fleas, this.scorpions, this.eggs];
      let hitEnemy = false;
      for (const list of enemyLists) {
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e.dead) continue;
          const ex = e.x != null ? e.x : e.c * CELL + 4;
          const ey = e.y != null ? e.y : e.r * CELL + HUD_H + 4;
          if (Math.abs(bx - ex) < 7 && Math.abs(by - ey) < 7) {
            if (!b.hitSet.has(e)) {
              b.hitSet.add(e);
              e.hp = (e.hp || 1) - 1;
              if (e.hp <= 0) {
                e.dead = true;
                this.addScore((e.value || 150) * this.scoreMult(), ex, ey, true);
                Particles.burst(ex, ey, ['#fff', '#ff2d95'], 10, 60);
                AudioSys.sfx.segPop();
              } else {
                AudioSys.sfx.hit();
              }
              if (!b.pierce) b.dead = true;
            }
            hitEnemy = true;
            break;
          }
        }
        if (hitEnemy) break;
      }
      if (b.dead) continue;

      // vs mushrooms
      const mc = Math.floor(bx / CELL), mr = Math.floor((by - HUD_H) / CELL);
      if (this.mushAt(mr, mc)) {
        if (this.bonusMode) {
          // bonus race: maze mushrooms pop in one shot for 50 pts — clear
          // the whole maze for the big completion bonus
          const bpts = 50 * this.scoreMult();
          this.addScore(bpts, mc * CELL + 4, mr * CELL + HUD_H + 2, true);
          this.bonusGain += bpts;
          this.removeMush(mr, mc);
          Particles.burst(mc * CELL + 4, mr * CELL + HUD_H + 4, ['#4aff6a', '#2ea04a', '#baffd0'], 5, 40);
          AudioSys.sfx.hit();
          if (this.fieldMushCount() === 0) this.endBonusRound();
        } else {
          const pts = this.damageMush(mr, mc);
          if (pts > 0) {
            this.addScore(pts * this.scoreMult(), mc * CELL + 4, mr * CELL + HUD_H + 2, pts >= 20);
            AudioSys.sfx.hit();
          }
        }
        if (!b.pierce) b.dead = true;
      }
    }

    // missiles vs enemies. While the QUEEN lives, missiles hunt only her
    // (her brood and the other bugs can't swallow the boss-killer rounds).
    if (this.boss && !this.boss.dead) {
      for (const m of this.missilesArr) {
        if (m.dead) continue;
        if (this.boss.missileHit(m.x, m.y)) m.dead = true;
      }
    } else {
      for (const m of this.missilesArr) {
      if (m.dead) continue;
      for (const cp of cps) {
        if (cp.dead) continue;
        const len = cp.trail.length;
        const head = cp.trail[len - 1];
        if (head && head.r >= 0 && Math.abs(m.x - (head.c * CELL + 4)) < 8 && Math.abs(m.y - (head.r * CELL + HUD_H + 4)) < 8) {
          m.dead = true;
          cp.hitHead();
          break;
        }
        for (let i = 0; i < cp.segs.length; i++) {
          const s = cp.segs[i];
          if (s.dead) continue;
          const t = cp.trail[len - 1 - s.off];
          if (!t || t.r < 0) continue;
          if (Math.abs(m.x - (t.c * CELL + 4)) < 8 && Math.abs(m.y - (t.r * CELL + HUD_H + 4)) < 8) {
            m.dead = true;
            cp.hitSegment(i);
            break;
          }
        }
      }
      if (!m.dead) {
        for (const list of [this.viruses, this.spiders, this.fleas, this.scorpions, this.eggs]) {
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (e.dead) continue;
            const ex = e.x != null ? e.x : e.c * CELL + 4;
            const ey = e.y != null ? e.y : e.r * CELL + HUD_H + 4;
            if (Math.abs(m.x - ex) < 8 && Math.abs(m.y - ey) < 8) {
              m.dead = true;
              e.dead = true;
              this.addScore((e.value || 150) * this.scoreMult(), ex, ey, true);
              Particles.burst(ex, ey, ['#ff2d95', '#fff'], 14, 80);
              break;
            }
          }
        }
      }
      }
    }
  }

  collidePlayer() {
    const p = this.player;
    if (!p.alive) return;
    if (this.bonusMode) return; // pure score race — the blob can't die
    const px = p.x, py = p.y;

    // poisoned mushrooms are lethal (original rule). Live again: from level 6
    // scorpions can poison player-zone mushrooms, so the blob can touch them.
    // Checks the three cells the blob's body can span.
    const mc = Math.floor(px / CELL), mr = Math.floor((py - HUD_H) / CELL);
    if (this.isPoison(mr, mc - 1) || this.isPoison(mr, mc) || this.isPoison(mr, mc + 1)) {
      p.hit();
      return;
    }

    // centipedes
    for (const cp of this.centipedes) {
      if (cp.dead) continue;
      const len = cp.trail.length;
      const head = cp.trail[len - 1];
      if (head && head.r >= 0) {
        if (Math.abs(px - (head.c * CELL + 4)) < 7 && Math.abs(py - (head.r * CELL + HUD_H + 4)) < 7) { p.hit(); return; }
      }
      for (const s of cp.segs) {
        if (s.dead) continue;
        const t = cp.trail[len - 1 - s.off];
        if (!t || t.r < 0) continue;
        if (Math.abs(px - (t.c * CELL + 4)) < 7 && Math.abs(py - (t.r * CELL + HUD_H + 4)) < 7) { p.hit(); return; }
      }
    }
    // BUG QUEEN body + venom spit
    if (this.boss && !this.boss.dead && this.boss.touchHit(px, py)) { p.hit(); return; }
    for (const v of this.venom) {
      if (v.dead) continue;
      if (Math.abs(px - v.x) < 6 && Math.abs(py - v.y) < 6) { p.hit(); return; }
    }
    // spiders
    for (const s of this.spiders) {
      if (s.dead) continue;
      if (Math.abs(px - s.x) < 8 && Math.abs(py - s.y) < 8) { p.hit(); return; }
    }
    // fleas
    for (const f of this.fleas) {
      if (f.dead || f.r < 0) continue;
      if (Math.abs(px - (f.c * CELL + 4)) < 8 && Math.abs(py - (f.r * CELL + HUD_H + 4)) < 8) { p.hit(); return; }
    }
    // scorpions
    for (const s of this.scorpions) {
      if (s.dead) continue;
      if (Math.abs(px - (s.c * CELL + 4)) < 8 && Math.abs(py - (s.r * CELL + HUD_H + 4)) < 8) { p.hit(); return; }
    }
    // viruses
    for (const v of this.viruses) {
      if (v.dead) continue;
      if (Math.abs(px - v.x) < 7 && Math.abs(py - v.y) < 7) { p.hit(); return; }
    }
  }

  /* ---------------- RENDER ---------------- */
  render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (this.shakeT > 0) {
      ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
    }

    // subtle checkerboard field
    ctx.fillStyle = 'rgba(120,160,255,0.03)';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if ((r + c) % 2 === 0) ctx.fillRect(c * CELL, r * CELL + HUD_H, CELL, CELL);
      }
    }
    // field separator under HUD
    ctx.fillStyle = 'rgba(0,229,255,0.25)';
    ctx.fillRect(0, HUD_H - 1, W, 1);
    // boss HP bar sits right below the HUD
    if (this.boss && !this.boss.dead) this.drawBossBar(ctx);
    // player-zone boundary — marks where the blob is stopped from climbing
    // into the mushroom field (the zone below this line is fully traversable)
    ctx.fillStyle = 'rgba(0,229,255,0.18)';
    ctx.fillRect(0, PLAY_ZONE * CELL + HUD_H, W, 1);

    // mushrooms
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const m = this.grid[r][c];
        if (!m) continue;
        drawMushroom(ctx, c, r, m.hp, m.max, m.poison, false, m.pulseT || 0);
      }
    }

    // pickups
    for (const p of this.pickups) p.draw(ctx);

    // fresh maze holes flash gold after a shift so the player spots the new path
    if (this.bonusMode && this.mazeWalls.length) {
      const now = performance.now();
      for (const w of this.mazeWalls) {
        if (w.flashT <= 0) continue;
        const a = clamp(w.flashT / 0.9, 0, 1) * (0.35 + 0.35 * Math.sin(now / 70));
        ctx.fillStyle = `rgba(255,215,0,${a})`;
        for (const rr of w.rows) {
          for (let d = 0; d < w.gapW; d++) ctx.fillRect((w.gap + d) * CELL, rr * CELL + HUD_H, CELL, CELL);
        }
      }
    }

    // enemies
    for (const cp of this.centipedes) cp.draw(ctx);
    if (this.boss) this.boss.draw(ctx);
    for (const e of this.eggs) e.draw(ctx);
    for (const v of this.venom) v.draw(ctx);
    for (const s of this.spiders) s.draw(ctx);
    for (const f of this.fleas) f.draw(ctx);
    for (const s of this.scorpions) s.draw(ctx);
    for (const v of this.viruses) v.draw(ctx);

    // missiles, bullets, player
    for (const m of this.missilesArr) m.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    this.player.draw(ctx);

    Particles.draw(ctx);

    // banners
    if (this.bannerT > 0) this.drawBanner(ctx);

    // HUD
    this.drawHUD(ctx);

    // freeze tint
    if (this.freezeT > 0) {
      ctx.fillStyle = 'rgba(157,77,255,0.10)';
      ctx.fillRect(0, HUD_H, W, H - HUD_H);
    }

    ctx.restore();

    // attract watermark
    if (this.attract && this.state === 'menu') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, H - 14, W, 14);
      FONT.drawCentered(ctx, 'INSERT COIN — PRESS ENTER', W / 2, H - 11, 1, '#ffb000', 0.85);
    }
  }

  drawBanner(ctx) {
    const a = clamp(this.bannerT, 0, 1);
    if (a <= 0) return;
    const alpha = a > 0.9 ? (1 - a) * 10 : 1;
    const y = Math.round(H / 2 - 14);
    const x = W / 2;
    ctx.globalAlpha = alpha;
    FONT.drawCentered(ctx, this.bannerText, x + 2, y, 2, '#ff2d95', alpha * 0.7);
    FONT.drawCentered(ctx, this.bannerText, x - 2, y, 2, '#00e5ff', alpha * 0.7);
    FONT.drawCentered(ctx, this.bannerText, x, y, 2, '#fff', alpha);
    ctx.globalAlpha = 1;
  }

  /* BUG QUEEN health bar under the HUD (segment ticks show the body) */
  drawBossBar(ctx) {
    const b = this.boss;
    if (!b || b.dead) return;
    const pct = clamp(b.hp / b.maxHp, 0, 1);
    const berserk = b.berserk;
    const flash = berserk && Math.floor(performance.now() / 140) % 2 === 0;
    // backing strip
    ctx.fillStyle = 'rgba(3,6,14,0.95)';
    ctx.fillRect(0, HUD_H, W, 8);
    ctx.fillStyle = 'rgba(255,45,149,0.30)';
    ctx.fillRect(0, HUD_H, W, 1);
    FONT.draw(ctx, 'QUEEN', 3, HUD_H + 1, 1, berserk ? (flash ? '#ffb000' : '#ff2d95') : '#ff2d95');
    // health fill
    const bx = 38, bw = W - bx - 4, by = HUD_H + 2;
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(bx, by, bw, 4);
    let fill = pct > 0.5 ? '#9d4dff' : pct > 0.25 ? '#ff2d95' : '#ff3b30';
    if (berserk && flash) fill = '#ffb000';
    ctx.fillStyle = fill;
    ctx.fillRect(bx, by, Math.max(1, Math.round(bw * pct)), 4);
    // one tick per body segment
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (let i = 1; i < 12; i++) ctx.fillRect(bx + Math.round(bw * i / 12), by, 1, 4);
  }

  drawHUD(ctx) {
    const score = String(Math.round(this.displayScore)).padStart(6, '0');
    const hi = String(this.hiScoreNow()).padStart(6, '0');

    ctx.fillStyle = 'rgba(3,6,14,0.92)';
    ctx.fillRect(0, 0, W, HUD_H);

    FONT.draw(ctx, 'SCORE', 4, 2, 1, '#00e5ff');
    FONT.draw(ctx, score, 4, 13, 1, '#fff');
    FONT.draw(ctx, 'HI', 100, 2, 1, '#ffb000');
    FONT.draw(ctx, hi, 116, 13, 1, '#ffb000');

    if (this.bonusMode) {
      FONT.draw(ctx, 'BONUS', 188, 3, 1, '#ffd700');
      FONT.draw(ctx, 'TIME', 184, 13, 1, '#ffd700');
      const t = Math.max(0, Math.ceil(this.bonusT));
      const tc = this.bonusT <= 3 && Math.floor(this.bonusT * 5) % 2 === 0 ? '#ff3b30' : '#ffffff';
      FONT.draw(ctx, String(t).padStart(2, '0'), 218, 13, 1, tc);
    } else {
      FONT.draw(ctx, 'LV' + this.level, 188, 3, 1, '#4aff6a');
      FONT.draw(ctx, 'B' + this.bombs, 188, 13, 1, '#ff3b30');
      FONT.draw(ctx, 'R' + this.missiles, 212, 13, 1, '#ff2d95');
    }
    FONT.draw(ctx, WEAPONS[this.weaponIdx].short, 236, 3, 1, '#00e5ff');

    // lives (up to 6 icons, then a counter)
    const n = Math.min(this.lives, 6);
    for (let i = 0; i < n; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      drawSprite(ctx, SPR.player, 296 - (2 - col) * 9, 2 + row * 10, 1);
    }
    if (this.lives > 6) FONT.draw(ctx, 'x' + this.lives, 286, 13, 1, '#00e5ff');

    // poison readout: magenta pips (mini poison mushrooms, like the lives
    // icons) show how many poisoned mushrooms are on the field; the readout
    // blinks when any poison has crept down into the player zone
    const ps = this.poisonStats();
    if (ps.count > 0) {
      // blink only while live — paused HUD stays steady behind the veil
      const flash = ps.zone && this.state === 'playing' && Math.floor(performance.now() / 260) % 2 === 0;
      const pcol = flash ? '#ff8ecb' : '#ff2d95';
      // pips for small counts; compact 'P{n}' text when there are many OR the
      // SLOW readout is occupying the lane (x=244) during a freeze
      if (ps.count <= 6 && this.freezeT <= 0) {
        for (let i = 0; i < ps.count; i++) {
          const px = 224 + i * 6;
          ctx.fillStyle = pcol;
          ctx.fillRect(px + 1, 13, 3, 2); // cap top
          ctx.fillRect(px, 15, 5, 2);     // cap brim
          ctx.fillRect(px + 2, 17, 1, 2); // stem
        }
      } else {
        FONT.draw(ctx, 'P' + Math.min(ps.count, 99), 224, 13, 1, pcol);
      }
    }

    if (this.freezeT > 0) FONT.draw(ctx, 'SLOW', 244, 13, 1, '#9d4dff');
  }

  /* ---------------- EXTERNAL (UI) ---------------- */
  get currentScore() { return this.score; }
  get currentLevel() { return this.level; }
}

// instantiate after DOM is ready (script at end of body)
const Game = new GameCore(document.getElementById('game'));
