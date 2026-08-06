"use strict";
/* ============================================================
   DATA BREAK — core engine
   Game loop, adaptive viewport, physics, collisions,
   scoring/combo, power-up state, level flow, HUD rendering.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const U = R.Util;
  const C = R.Config;
  const CFG = C;

  const STATE = {
    TITLE: "title",
    PLAY: "play",
    PAUSE: "pause",
    INTRO: "intro",
    CLEAR: "clear",
    GAMEOVER: "gameover",
    VICTORY: "victory"
  };

  const E = {
    canvas: null,
    ctx: null,
    viewW: 0,
    viewH: 0,
    dpr: 1,
    scale: 1,
    offX: 0,
    offY: 0,
    worldW: 960,
    worldH: C.WORLD_H,
    cols: 12,

    state: STATE.TITLE,
    time: 0,
    frame: 0,
    last: 0,
    running: false,
    paused: false,
    shakeAmt: 0,
    demoMode: false,        // true when AI demo is running

    // run state
    level: 1,
    wave: 0,
    endless: false,
    score: 0,
    lives: 3,
    combo: 0,
    comboT: 0,
    mult: 1,
    nextLifeAt: C.EXTRA_LIFE_SCORE,
    difficulty: C.DIFFICULTIES.standard,
    shipId: "laptop",
    scrubberId: "standard",
    bonusMode: false,
    bonusT: 0,
    bonusCaught: 0,
    ballsLost: 0,
    laserKills: 0,
    levelDef: null,
    destroyedCells: null,
    introT: 0,

    // entities
    bricks: [],
    balls: [],
    powerups: [],
    turrets: [],
    beams: [],
    projectiles: [],
    minions: [],
    shots: [],
    paddle: null,
    drone: null,
    boss: null,
    bossId: null,
    bossName: null,
    mini: null,       // mini-boss encounter (elite, non-gating)
    miniId: null,
    miniName: null,
    shieldCells: [],

    // power timers
    timers: {},
    laserCool: 0,
    brickGrid: null,
    dropCooldown: 0,        // rate-limits capsule drops (prevents chain floods)
    touchGrab: null,        // touch drag offset (paddle <-> finger), null = not grabbing
    flickHist: [],          // rolling touch positions for the flick-release slingshot

    // ---------------- lifecycle ----------------
    init() {
      this.canvas = document.getElementById("game");
      this.ctx = this.canvas.getContext("2d");
      this.dpr = Math.min(R.Save.quality().dprCap || 2, window.devicePixelRatio || 1);
      R.Background.init();
      this.bindEvents();
      this.resize();
      this.resetRun(true);
      this.last = performance.now();
      this.running = true;
      const loop = (t) => {
        if (!this.running) return;
        const dt = Math.min(0.05, Math.max(0.0001, (t - this.last) / 1000));
        this.last = t;
        this.frame++;
        this.frameDt = dt;
        this.time += dt;
        R.Input.resetFrame();
        R.Input.pollGamepad();
        if (this.state === STATE.PLAY) {
          const ts = this.hasPower("slow") ? 0.55 : 1;
          this.update(dt * ts);
          R.Particles.update(dt);
        } else if (this.state === STATE.INTRO || this.state === STATE.CLEAR) {
          this.updateIntro(dt);
          R.Particles.update(dt);
        } else {
          R.Particles.update(dt);
        }
        // AI demo idle detection — only while the title screen is actually
        // visible. engine.state stays TITLE until a run starts, so the idle
        // timer must not count while the player is browsing sub-menus (story,
        // difficulty, ship select) — otherwise a menu visit longer than the
        // idle threshold would yank the player into the demo.
        if (this.state === STATE.TITLE && !this.demoMode && R.UI.current === "title") {
          R.DemoAI.tickIdle(dt);
        }

        // AI demo update
        if (this.demoMode) {
          R.DemoAI.update(dt);
        }

        // gamepad / button resume from pause
        if (this.state === STATE.PAUSE && R.Input.pausePressed()) this.resume();
        R.Background.update(dt, this.state === STATE.TITLE ? 1 : 0.35);
        this.render();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },

    bindEvents() {
      window.addEventListener("resize", () => this.resize());
      R.Input.setup(this);
      this.canvas.addEventListener("pointerdown", () => {
        R.Audio.unlock();
        R.DemoAI.resetIdle();
        if (this.state === STATE.PLAY) this.tryLaunch();
      });
      document.addEventListener("keydown", (e) => {
        const k = e.key.toLowerCase();
        R.DemoAI.resetIdle();
        if (this.state === STATE.PLAY && (k === " ")) this.tryLaunch();
        if (k === "p" || k === "escape") {
          if (this.state === STATE.PLAY) this.pause();
          else if (this.state === STATE.PAUSE) this.resume();
        }
        if (k === "m") { const s = !R.Save.setting("music"); R.Save.setting("music", s); R.Audio.setMusic(s); if (s) R.Audio.playSong(this.musicIdFor(this.state === STATE.PLAY ? this.levelDef : null)); }
        if (k === "n") { const s = !R.Save.setting("sfx"); R.Save.setting("sfx", s); R.Audio.setSfx(s); }
      });
      document.getElementById("btn-pause").addEventListener("click", () => {
        R.DemoAI.resetIdle();
        if (this.state === STATE.PLAY) this.pause();
        else if (this.state === STATE.PAUSE) this.resume();
      });
      // also reset idle on any screen button click. CAPTURE phase so this runs
      // BEFORE the UI action handler (bubble phase, registered earlier): when
      // the AI demo is running, the player's click must stop the demo and
      // return to the title first — otherwise the demo's stopDemo() (called
      // from resetIdle) would run AFTER the UI action and quitToTitle() would
      // undo the very navigation the player just requested.
      document.addEventListener("click", (e) => {
        if (e.target.closest("[data-action]")) R.DemoAI.resetIdle();
      }, { capture: true });
    },

    resize() {
      // guard against degenerate viewport reports during early boot / iframes
      this.viewW = Math.max(1, window.innerWidth);
      this.viewH = Math.max(1, window.innerHeight);
      // cap backing-store resolution by the quality preset: on a 3x phone
      // display, high-quality still renders at 2x but low caps at 1.25x —
      // fills ~2.5x fewer pixels for a huge fill-rate win on weak GPUs
      this.dpr = Math.min(R.Save.quality().dprCap || 2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(this.viewW * this.dpr);
      this.canvas.height = Math.round(this.viewH * this.dpr);
      const aspect = this.viewW / this.viewH;
      this.worldW = U.clamp(aspect * C.WORLD_H, C.WORLD_MIN_W, C.WORLD_MAX_W);
      this.worldH = C.WORLD_H;
      this.scale = Math.min(this.viewW / this.worldW, this.viewH / this.worldH);
      this.offX = (this.viewW - this.worldW * this.scale) / 2;
      this.offY = (this.viewH - this.worldH * this.scale) / 2;
      this.cols = Math.round(this.worldW / C.CELL);
      if (this.canvas) {
        this.ctx = this.canvas.getContext("2d");
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
      R.Background.resize();
      // refresh the idle title-scene paddle/ball so positions stay valid
      if (this.state === STATE.TITLE && this.paddle) {
        this.setupPaddle();
        this.setupBall();
      }
      // Deferred rebuild: device rotation / browser chrome resizing fire a
      // burst of resize events, and each rebuildLevel() re-summons the boss
      // and mini. Coalescing to ~120ms keeps the fight intact.
      clearTimeout(this._resizeRebuildTimer);
      this._resizeRebuildTimer = setTimeout(() => {
        this._resizeRebuildTimer = null;
        if (this.levelDef && this.state === STATE.PLAY) {
          this.rebuildLevel(true);
        }
      }, 120);
    },

    toWorld(lx, ly) {
      return {
        x: (lx - this.offX) / this.scale,
        y: (ly - this.offY) / this.scale
      };
    },

    uiPointer(down) {
      // engine hook: currently unused, reserved for future UI gestures
      void down;
    },

    resetRun(silent) {
      // idle state used behind the title screen
      void silent;
      this.level = 1;
      this.wave = 0;
      this.score = 0;
      this.lives = 3;
      this.combo = 0;
      this.setMult(1);
      this.ballsLost = 0;
      this.bricks = [];
      this.balls = [];
      this.turrets = [];
      this.beams = [];
      this.projectiles = [];
      this.minions = [];
      this.shots = [];
      this.boss = null;
      this.bossId = null;
      this.mini = null;
      this.miniId = null;
      this.drone = null;
      this.timers = {};
      this.dropCooldown = 0;
      this.bonusMode = false;
      this.levelDef = null;
      this.destroyedCells = new Set();
      this.shakeAmt = 0;
      this.paddle = null;
      this.setupPaddle();
      this.setupBall();
      this.state = STATE.TITLE;
    },

    // ---------------- run flow ----------------
    startRun(difficultyKey, shipId, scrubberId, startLevel, endless) {
      this.difficulty = C.DIFFICULTIES[difficultyKey] || C.DIFFICULTIES.standard;
      this.shipId = shipId || "laptop";
      // sanitize: never start with a scrubber the player doesn't own yet
      this.scrubberId = (scrubberId && R.Scrubbers && R.Scrubbers.isUnlocked(scrubberId))
        ? scrubberId
        : (R.Scrubbers ? R.Scrubbers.unlocked()[0] : (scrubberId || "standard"));
      this.endless = !!endless;
      this.level = startLevel || 1;
      this.wave = 0;
      this.score = 0;
      this.combo = 0;
      this.setMult(1);
      this.lives = this.difficulty.lives;
      this.nextLifeAt = C.EXTRA_LIFE_SCORE;
      this.ballsLost = 0;
      this.laserKills = 0;
      this.bonusCaught = 0;
      R.Save.set("progress.difficulty", difficultyKey);
      R.Save.set("progress.ship", shipId);
      R.Save.set("progress.scrubber", scrubberId);
      R.Save.bumpStat("gamesPlayed");
      this.loadLevel(this.endless ? 1 : this.level);
    },

    // Theme count for the endless wave rotation
    themeCount() {
      return R.Art && R.Art.THEMES ? R.Art.THEMES.length : 8;
    },

    // Effective theme index — when endlessLockTheme is enabled, always
    // returns 0 so every wave paints with the first world's theme.
    themeIdx() {
      if (!this.endless) return R.Levels.worldIndex(this.level);
      if (R.Save.setting("endlessLockTheme")) return 0;
      return this.wave % this.themeCount();
    },

    // Pick the music track for a level: boss / bonus stages get their own
    // tracks, everything else plays the current world's theme (world0-7).
    musicIdFor(def) {
      if (!def) return "menu";
      if (def.boss !== null && def.boss !== undefined) return "boss";
      if (def.bonus) return "bonus";
      if (this.endless) return "world" + this.themeIdx();
      return "world" + R.Levels.worldIndex(this.level);
    },

    loadLevel(n) {
      const def = this.endless ? R.Levels.getEndlessLevel(this.wave) : R.Levels.getCampaignLevel(n);
      this.level = n;
      this.levelDef = def;
      this.destroyedCells = new Set();
      this.combo = 0;
      this.setMult(1);
      this.bonusMode = false;
      this.boss = null;
      this.bossId = null;
      this.mini = null;
      this.miniId = null;
      this.miniName = null;
      this.drone = null;
      this.timers = {};
      this.dropCooldown = 0;
      R.Powerups.clear();
      R.Particles.clear();
      this.buildLevel(def);
      if (this.bonusMode) {
        this.bonusT = 20;
        this.bonusCaught = 0;
      }
      this.setupPaddle();
      this.setupBall();
      this.introT = 2.6;
      this.state = STATE.INTRO;
      this.bricksDirty = true;
      R.Audio.playSong(this.musicIdFor(def));
      if (R.Ships && R.Ships.unlockCheck) R.Ships.unlockCheck();
      if (R.Scrubbers && R.Scrubbers.unlockCheck) R.Scrubbers.unlockCheck();
      if (R.Background && R.Background.setWorld) {
        R.Background.setWorld(this.endless ? this.themeIdx() : R.Levels.worldIndex(this.level));
      }
      this.checkAchievements();
    },

    buildLevel(def) {
      R.Levels.build(this, def);
      this.bricksDirty = true;
    },

    rebuildLevel(keepProgress) {
      // rebuild bricks after viewport resize, preserving destroyed cells
      const def = this.levelDef;
      if (!def) return;
      const destroyed = new Set(this.destroyedCells);
      const bossWas = this.bossId;
      const miniWas = this.miniId;
      const padW = this.paddle ? this.paddle.w : null;
      R.Powerups.clear();
      this.bonusMode = false;
      this.boss = null;
      this.mini = null;
      this.shieldCells = [];
      this.turrets.length = 0;
      this.beams.length = 0;
      this.projectiles.length = 0;
      this.minions.length = 0;
      this.shots.length = 0;
      R.Levels.build(this, def);
      if (this.bonusMode) this.bonusT = Math.max(this.bonusT, 5);
      if (keepProgress && destroyed.size) {
        this.bricks = this.bricks.filter((b) => !destroyed.has(b.col + "," + b.row));
      }
      if (bossWas !== null && def.boss !== null && def.boss !== undefined) {
        this.boss = R.Boss.spawn(this, def.boss);
        this.bossId = def.boss;
        this.bossName = this.boss.name;
      }
      // mirror the boss treatment so a mid-fight resize keeps the encounter
      if (miniWas !== null && def.mini !== null && def.mini !== undefined) {
        this.mini = R.Boss.miniSpawn(this, def.mini);
        this.miniId = def.mini;
        this.miniName = this.mini.name;
      }
      for (const b of this.bricks) R.Bricks.resetBrickBase(b);
      this.bricksDirty = true;
      this.setupPaddle();
      if (padW) this.paddle.w = U.clamp(padW, this.difficulty.paddleW * 0.5, this.difficulty.paddleW * 1.75);
    },

    setupPaddle() {
      const w = this.difficulty.paddleW * (this.shipId === "server" ? 1.12 : this.shipId === "cyber" ? 0.96 : 1);
      this.basePaddleW = w;
      this.touchGrab = null;
      this.flickHist = [];
      // per-ship banking profile (Config globals fill in any missing keys)
      const bankCfg = R.Ships.bank(this.shipId);
      this.paddle = {
        x: this.worldW / 2,
        y: C.PADDLE_Y,
        w,
        h: C.PADDLE_H,
        vx: 0,
        bank: 0,     // eased lean (spring), fed to the renderer
        bankV: 0,    // spring velocity
        bankVxSm: 0, // EMA-smoothed derived velocity (feeds the bank target)
        kbVx: 0,     // eased keyboard velocity (frame-rate-independent taps)
        bankCfg,     // resolved per-ship spring knobs (scale/max/stiff/damp)
        shield: this.shipId === "firewall" ? 1 : 0,
        shieldFlash: 0
      };
    },

    setupBall() {
      const kind = this.scrubberId;
      const r = kind === "nano" ? 9 : kind === "compression" ? 15 : C.BALL_R;
      const mk = (off) => ({
        x: this.paddle.x + off,
        y: this.paddle.y - C.PADDLE_H / 2 - r - 8,
        vx: 0, vy: 0,
        r,
        kind,
        stuck: true,
        stuckOff: off,
        trail: []
      });
      // duo scrubber: every life starts with twin scrubbers
      if (kind === "duo") {
        this.balls = [mk(-this.paddle.w * 0.16), mk(this.paddle.w * 0.16)];
      } else {
        this.balls = [mk(0)];
      }
    },

    // ---------------- gameplay ----------------
    tryLaunch() {
      if (this.state !== STATE.PLAY) return;
      let launched = false;
      for (const b of this.balls) {
        if (b.stuck) {
          this.launchBall(b);
          launched = true;
        }
      }
      if (launched) R.Audio.play("launch");
    },

    launchBall(b) {
      const sp = this.ballSpeed();
      let ang = -Math.PI / 2 + U.rand(-0.14, 0.14);
      // aim toward pointer if the player has moved it (and it points upward)
      const px = R.Input.state.pointer.wx;
      const py = R.Input.state.pointer.wy;
      if (R.Input.state.pointerSet && px !== undefined && py !== undefined && py < b.y) {
        const dx = px - b.x;
        const dy = py - b.y;
        const d = U.len(dx, dy) || 1;
        const a = Math.atan2(dy, dx);
        if (a > -Math.PI * 0.85 && a < -Math.PI * 0.15) ang = a;
      }
      b.vx = Math.cos(ang) * sp;
      b.vy = Math.sin(ang) * sp;
      b.stuck = false;
      R.Save.bumpStat("ballsLaunched");
    },

    ballSpeed() {
      let s = C.BASE_SPEED * this.difficulty.speed;
      // ramp with progress; endless ramps by wave (level stays 1 there)
      const ramp = this.endless ? this.wave : this.level;
      s += Math.min(ramp, C.SPEED_RAMP_LEVELS) * C.SPEED_RAMP;
      if (this.scrubberId === "nano") s *= 1.1;   // nano: small & fast
      if (this.levelDef && this.levelDef.speed) s *= this.levelDef.speed;
      if (this.hasPower("slow")) s *= 0.7;
      return Math.min(C.MAX_SPEED, s);
    },

    addBall(x, y) {
      if (this.balls.length >= 14) { this.addScore(400 * this.scoreMult(), x, y); return; }
      const src = this.balls[0] || { r: C.BALL_R, kind: this.scrubberId };
      const b = {
        x, y,
        vx: U.rand(-1, 1), vy: -1,
        r: src.r, kind: src.kind,
        stuck: false,
        trail: []
      };
      const l = U.len(b.vx, b.vy) || 1;
      b.vx = b.vx / l * this.ballSpeed();
      b.vy = b.vy / l * this.ballSpeed();
      this.balls.push(b);
      R.Particles.burst(x, y, { count: 12, color: "#22d3ee", speed: 200 });
    },

    splitBall(b, n) {
      const sp = U.len(b.vx, b.vy);
      for (let i = 1; i < n; i++) {
        if (this.balls.length >= 14) break;
        const a = Math.atan2(b.vy, b.vx) + (i - n / 2) * 0.5;
        this.balls.push({
          x: b.x, y: b.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          r: b.r, kind: b.kind, stuck: false, trail: []
        });
      }
      R.Audio.play("power");
    },

    // ---------------- scoring ----------------
    scoreMult() {
      let m = this.mult * (this.hasPower("scorex2") ? 2 : 1);
      return m * this.difficulty.scoreMult;
    },

    addScore(n, x, y, color) {
      const v = Math.round(n * this.scoreMult());
      if (v <= 0) return;
      this.score += v;
      if (this.score < 0) this.score = 0;  // safety floor (score is never decremented)
      if (x !== undefined && y !== undefined) {
        R.Particles.text(x, y, "+" + U.fmt(v), color || "#fbbf24");
      }
      // bonus life milestones
      if (this.score >= this.nextLifeAt) {
        this.lives = Math.min(9, this.lives + 1);
        this.nextLifeAt += C.EXTRA_LIFE_SCORE;
        R.Audio.play("life");
        this.toast("EXTRA SHIP DEPLOYED", "#34d399");
      }
      if (this.score >= 50000 && R.Save.unlock("score_50k")) this.toastAchievement("score_50k");
      if (this.score > R.Save.get("stats.bestScore", 0)) R.Save.set("stats.bestScore", this.score);
    },

    // set the score multiplier and sync the music intensity layer (drums +
    // lead build as the combo climbs: 1 -> base, 2+ -> hats, 4+ -> lead,
    // 6+ -> extra kick).
    setMult(m) {
      this.mult = m;
      R.Audio.setIntensity(m >= 6 ? 3 : m >= 4 ? 2 : m >= 2 ? 1 : 0);
    },

    bumpCombo() {
      this.combo += this.hasPower("combomult") ? 2 : 1;
      this.comboT = C.COMBO_WINDOW;
      const newMult = Math.min(8, 1 + Math.floor(this.combo / C.MULT_PER_HITS));
      if (newMult > this.mult) {
        this.setMult(newMult);
        R.Audio.play("combo", this.combo);
        R.Particles.text(this.paddle.x, this.paddle.y - 60, "MULTIPLIER x" + this.mult, "#22d3ee");
      } else if (this.combo > 0 && this.combo % 5 === 0) {
        R.Audio.play("combo", this.combo);
      }
      if (this.combo > R.Save.get("stats.maxCombo", 0)) R.Save.set("stats.maxCombo", this.combo);
      if (this.combo >= 10 && R.Save.unlock("combo_10")) this.toastAchievement("combo_10");
      if (this.combo >= 25 && R.Save.unlock("combo_25")) this.toastAchievement("combo_25");
    },

    // ---------------- power helpers ----------------
    hasPower(kind) { return (this.timers[kind] || 0) > 0; },
    setPower(kind, dur) {
      this.timers[kind] = dur;
      const def = R.Powerups.KINDS[kind];
      if (def) R.Particles.text(this.paddle.x, this.paddle.y - 70, def.name.toUpperCase(), def.color);
    },
    tickTimers(dt) {
      for (const k of Object.keys(this.timers)) {
        this.timers[k] -= dt;
        if (this.timers[k] <= 0) {
          delete this.timers[k];
          if (k === "drone") this.drone = null;
        }
      }
      if (this.paddle.shieldFlash > 0) this.paddle.shieldFlash -= dt;
      if (this.dropCooldown > 0) this.dropCooldown -= dt;
    },

    // ---------------- brick damage ----------------
    damageBrick(b, dmg, source) {
      if (b.dead) return;
      // ghost-phase flicker blocks are untargetable (ball + lasers skip them)
      // — AOE (EMP, chain, explosions) must not destroy them while invisible
      if (b.type === "flicker" && b.hiddenState === "ghost") return;
      b.flash = 1;
      if (b.type === "steel") { R.Audio.play("wall"); R.Particles.sparkle(b.x + b.w / 2, b.y + b.h / 2, "#7d93b8"); return; }
      b.hp -= dmg;
      b.shake = 6;
      if (b.type === "hidden") b.hiddenState = "solid";
      if (b.type === "lock" && b.hp <= 0) {
        // unlock: destroy all locks
        for (const other of [...this.bricks]) if (other.type === "lock") this.destroyBrick(other, source);
        return;
      }
      if (b.hp <= 0) this.destroyBrick(b, source);
    },

    destroyBrick(b, source) {
      if (b.dead) return;
      b.dead = true;
      const idx = this.bricks.indexOf(b);
      if (idx >= 0) this.bricks.splice(idx, 1);
      if (b.type === "shield" && this.shieldCells) {
        const si = this.shieldCells.indexOf(b);
        if (si >= 0) this.shieldCells.splice(si, 1);
      }
      this.destroyedCells.add(b.col + "," + b.row);
      R.Save.bumpStat("blocksDestroyed");
      R.Bricks.revealNeighbors(this, b.col, b.row);

      let pts = b.score;
      // virus fragments: no falling minions — antivirus scrubbers purge them
      // for double points (the game is about breaking blocks, not dodging)
      if (b.type === "virus") pts = 35 * (this.scrubberId === "antivirus" ? 2 : 1);
      if (b.type === "explosive" || b.type === "bomb") { this.explodeBlock(b, false); pts = b.type === "explosive" ? 30 : 40; }
      else if (b.type === "splitter" && this.balls.length < 14) {
        const ball = this.balls.length ? this.balls[this.balls.length - 1] : null;
        if (ball) this.splitBall(ball, 3);
      }
      this.addScore(pts, b.x + b.w / 2, b.y + b.h / 2);
      R.Particles.debris(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h, R.Art.BLOCK_STYLE[b.style] ? R.Art.BLOCK_STYLE[b.style].c : "#94a3b8");
      R.Particles.ring(b.x + b.w / 2, b.y + b.h / 2, "#eaf6ff", 8, 0.25);
      R.Audio.play("brick", b.type);
      this.bumpCombo();
      this.bricksDirty = true;
      this.tryDropPowerup(b);

      // scrubber traits
      if (this.scrubberId === "emp" && U.chance(0.12)) {
        for (const nb of [...this.bricks]) {
          if (U.dist(nb.x + nb.w / 2, nb.y + nb.h / 2, b.x + b.w / 2, b.y + b.h / 2) < 95) this.damageBrick(nb, 1, "emp");
        }
        R.Particles.ring(b.x + b.w / 2, b.y + b.h / 2, "#e879f9", 20, 0.35);
      }
      if (this.hasPower("chain")) {
        R.Audio.play("chain");
        R.Particles.ring(b.x + b.w / 2, b.y + b.h / 2, "#fb923c", 24, 0.4);
        for (const nb of [...this.bricks]) {
          if (U.dist(nb.x + nb.w / 2, nb.y + nb.h / 2, b.x + b.w / 2, b.y + b.h / 2) < 150) this.damageBrick(nb, 1, "chain");
        }
      }

      // achievement hooks
      const bd = R.Save.get("stats.blocksDestroyed", 0);
      if (bd >= 100 && R.Save.unlock("blocks_100")) this.toastAchievement("blocks_100");
      if (bd >= 1000 && R.Save.unlock("blocks_1000")) this.toastAchievement("blocks_1000");
      if (bd >= 5000 && R.Save.unlock("blocks_5000")) this.toastAchievement("blocks_5000");
      if (source === "shot") {
        this.laserKills++;
        if (this.laserKills >= 10 && R.Save.unlock("laser_10")) this.toastAchievement("laser_10");
      }
    },

    tryDropPowerup(b) {
      // destroyed bricks can shed capsules. The alive cap keeps chain
      // reactions (bombs, EMP, virusclean) from flooding the field.
      if (R.Powerups.count() >= C.DROP_MAX_ALIVE) return;
      // cache cells (Ricochet-style gold blocks) ALWAYS shed a capsule —
      // no chance roll and no cooldown gate, so chained cache breaks all
      // pay out; the alive cap above is their only limiter.
      if (b.type === "cache") {
        R.Powerups.spawn(this, b.x + b.w / 2, b.y + b.h / 2);
        this.dropCooldown = 0.3;
        return;
      }
      // ordinary bricks: cooldown + combo-scaled chance
      if (this.dropCooldown > 0) return;
      let chance = C.DROP_CHANCE * (1 + Math.min(this.combo, 20) * C.DROP_COMBO_SCALE);
      if (b.score >= 25) chance *= 1.4;   // tougher blocks shed more often
      if (U.chance(Math.min(0.5, chance))) {
        R.Powerups.spawn(this, b.x + b.w / 2, b.y + b.h / 2);
        this.dropCooldown = 0.3;
      }
    },

    explodeBlock(b, timedOut) {
      R.Audio.play("explode");
      R.Particles.burst(b.x + b.w / 2, b.y + b.h / 2, { count: 30, color: "#fb923c", speed: 380 });
      R.Particles.ring(b.x + b.w / 2, b.y + b.h / 2, "#fb923c", 26, 0.45);
      this.shake(5);
      for (const nb of [...this.bricks]) {
        if (nb === b) continue;
        if (U.dist(nb.x + nb.w / 2, nb.y + nb.h / 2, b.x + b.w / 2, b.y + b.h / 2) < 130) {
          this.damageBrick(nb, 1, "explosion");
        }
      }
      if (timedOut) this.toast("LOGIC BOMB DETONATED", "#f97316");
    },

    // ---------------- ship / lives ----------------
    hitShip(dmg, x, y) {
      if (this.paddle.shield > 0) {
        this.paddle.shield = 0;
        this.paddle.shieldFlash = 0.4;
        R.Audio.play("shield");
        R.Particles.ring(this.paddle.x, this.paddle.y - 20, "#38bdf8", 30, 0.4);
        if (x !== undefined) R.Particles.burst(x, y, { count: 12, color: "#38bdf8", speed: 220 });
        return;
      }
      this.lives = Math.max(0, this.lives - dmg);
      R.Audio.play("hurt");
      R.Particles.burst(this.paddle.x, this.paddle.y, { count: 26, color: "#fb7185", speed: 300 });
      this.shake(8);
      this.combo = 0;
      this.setMult(1);
      this.timers = {};
      this.drone = null;
      if (this.lives <= 0) {
        this.gameOver();
        return;
      }
      // reset balls to paddle
      this.balls = [];
      this.setupBall();
      R.Save.bumpStat("playTime", 0);
      this.toast("SHIP DAMAGED", "#fb7185");
    },

    loseBall(b) {
      const idx = this.balls.indexOf(b);
      if (idx >= 0) this.balls.splice(idx, 1);
      this.ballsLost++;
      this.combo = 0;
      this.setMult(1);
      R.Particles.burst(b.x, b.y, { count: 14, color: "#22d3ee", speed: 200 });
      if (this.balls.length === 0) {
        this.hitShip(1);
      }
    },

    // ---------------- lasers ----------------
    fireLasers(dt) {
      const has = this.hasPower("laser") || this.hasPower("plasma") || this.hasPower("firewall");
      if (!has) return;
      this.laserCool -= dt;
      if (this.laserCool > 0) return;
      this.laserCool = C.LASER_COOLDOWN * (this.shipId === "net" ? 0.8 : 1);
      const plasma = this.hasPower("plasma");
      const spread = this.hasPower("firewall");
      const dmgBoost = plasma ? 2 : (this.scrubberId === "laser" ? 2 : 1);
      const sx = this.paddle.x, sy = this.paddle.y - C.PADDLE_H / 2;
      const half = this.paddle.w * 0.32;
      const lanes = plasma || spread;
      if (lanes) {
        for (let i = -2; i <= 2; i++) {
          R.Hazards.fireShot(this, sx + i * half * 0.6, sy, { dmg: dmgBoost, vx: i * 60 });
        }
      } else {
        R.Hazards.fireShot(this, sx - half, sy, { dmg: dmgBoost });
        R.Hazards.fireShot(this, sx + half, sy, { dmg: dmgBoost });
      }
      R.Audio.play("laser");
    },

    // ---------------- main update ----------------
    update(dt) {
      // gamepad / input fallbacks (also covers pause resume from gamepad)
      if (R.Input.launchPressed()) this.tryLaunch();
      if (R.Input.pausePressed()) this.togglePause();
      this.time += dt;
      this.tickTimers(dt);
      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) { this.combo = 0; this.setMult(1); }
      }
      if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 22);

      // ---- paddle movement ----
      // In demo mode, the AI sets the pointer position directly, so the
      // pointer branch below handles it naturally. The keyboard/no-input
      // branches are skipped by zeroing kbDir above so the pointer branch
      // takes over (the AI set lastInput=pointer and pointerSet=true).
      // Precise control. Keyboard uses eased velocity: each frame the ship's
      // kbVx ramps toward the target speed (KEYBOARD_ACCEL), so a short tap is
      // a small precise nudge and a long hold reaches max speed — distance is
      // frame-rate independent, unlike a constant-speed stepper (speed*dt per
      // frame made a tap 13px at 60Hz vs 6.5px at 120Hz, coarse and display-
      // dependent). Releasing glides to a clean stop (KEYBOARD_BRAKE) instead
      // of dead-snapping. Gamepad keeps light smoothing (analog axis); the
      // pointer never fights the keys — a parked cursor only takes over once
      // it is the LAST input used. Mouse locks 1:1 under the cursor; touch
      // drags with a grab offset. pad.vx is derived from real motion for the
      // banking visual.
      const pad = this.paddle;
      const ax = R.Input.axisX();
      // key-only direction: a held key always steers, even if an opposing
      // gamepad stick would cancel the combined axis to zero
      const kbDir = (this.demoMode ? 0 : (R.Input.anyKey("arrowright", "d") ? 1 : 0) - (R.Input.anyKey("arrowleft", "a") ? 1 : 0));
      const kb = kbDir !== 0;
      const speed = C.PADDLE_SPEED * (this.shipId === "cyber" ? 1.12 : this.shipId === "server" ? 0.94 : 1);
      const prevX = pad.x;
      // wall bounds shared by the keyboard edge-nudge and the hard clamp
      // below, so the soft zone and the boundary can never drift apart.
      const padMin = pad.w / 2 + 8;
      const padMax = this.worldW - pad.w / 2 - 8;
      const ptr = R.Input.state.pointer;
      const inState = R.Input.state;
      const pointerActive = inState.lastInput === "pointer" && inState.pointerSet && ptr.wx !== undefined && !Number.isNaN(ptr.wx);

      if (kb) {
        // keyboard: eased velocity toward the held direction — a tap is a
        // small precise move, a hold reaches full speed. Immune to gamepad
        // stick cancellation (key-only direction).
        // Held-edge nudge: when pushing INTO a wall, the target velocity
        // eases to 0 across KEYBOARD_EDGE_ZONE so a hard hold settles into
        // the boundary instead of clanging against the clamp at full speed.
        // Only the toward-wall direction is damped — pushing away is untouched.
        let kbTarget = kbDir * speed;
        // distance to the wall this keypress is pushing toward (never the
        // far one), then ease the target to 0 across the zone.
        const eDist = kbTarget > 0 ? padMax - pad.x : pad.x - padMin;
        if (eDist < C.KEYBOARD_EDGE_ZONE) kbTarget *= U.clamp(eDist / C.KEYBOARD_EDGE_ZONE, 0, 1);
        pad.kbVx = U.damp(pad.kbVx, kbTarget, C.KEYBOARD_ACCEL, dt);
        pad.x += pad.kbVx * dt;
      } else if (ax !== 0) {
        // gamepad: eased analog (drop any keyboard glide first)
        pad.kbVx = 0;
        pad.vx = U.damp(pad.vx, ax * speed, C.PADDLE_ACCEL, dt);
        pad.x += pad.vx * dt;
      } else if (pointerActive) {
        pad.kbVx = 0;
        if (inState.touchMode) {
          // touch: 1:1 grab drag — capture finger offset once, then track.
          // Uses ptr.tx (sub-frame averaged world x in input.js) so finger
          // micro-tremor doesn't jitter the paddle; mouse uses raw ptr.wx.
          if (inState.down) {
            if (this.touchGrab === null) {
              this.touchGrab = pad.x - ptr.tx;
              this.flickHist = [];   // fresh grab: drop any stale samples
            }
            pad.x = ptr.tx + this.touchGrab;
            // record recent positions so a flick can carry lean momentum on release.
            // Timestamps use performance.now(), NOT this.time — the frame loop AND
            // update() both increment this.time, so it runs ~2x fast during PLAY and
            // would halve the measured flick velocity (and skew it under slow-mo).
            this.flickHist.push({ x: pad.x, t: performance.now() / 1000 });
            if (this.flickHist.length > 8) this.flickHist.shift();
          } else {
            this.touchGrab = null;
            // flick release: kick extra lean momentum past the grab point so the
            // ship slingshots and recovers, instead of dead-stopping the lean.
            // (Detected via the `down` falling edge, not `released` — resetFrame()
            // clears `released` before update() runs each frame, so it can never
            // be seen here. flickHist is only populated while down, so a non-empty
            // history on a not-down frame IS the release frame.)
            if (!inState.down && this.flickHist.length > 1) {
              const first = this.flickHist[0];
              const last = this.flickHist[this.flickHist.length - 1];
              const span = last.t - first.t;
              if (span > 0) {
                const flickVx = (last.x - first.x) / span;
                const kick = U.clamp(flickVx * C.TOUCH_SLINGSHOT_GAIN, -C.TOUCH_SLINGSHOT_MAX, C.TOUCH_SLINGSHOT_MAX);
                pad.bankV += kick;
              }
            }
            this.flickHist = [];
          }
          pad.vx = 0;
        } else {
          // desktop mouse: ship sits exactly under the cursor
          pad.x = ptr.wx;
          pad.vx = 0;
        }
      } else {
        // no active input: brake to a clean stop so release timing is
        // forgiving (no dead-snap, no long drift). The brake is speed-damped:
        // its rate grows with current speed (logistic decay, exact-stepped so
        // it stays frame-rate independent), so a fast release is pulled up
        // hard (~8px) while a slow one settles gently (~3px) — consistent
        // stopping feel across the whole speed range instead of a constant-
        // rate glide where a fast release coasted ~4x further than a slow one.
        pad.vx = 0;
        const bA = C.KEYBOARD_BRAKE;
        const bK = C.KEYBOARD_BRAKE_SPEED;
        if (bK > 0 && pad.kbVx !== 0) {
          // exact step of dv/dt = -bA*v*(1 + bK*|v|/speed). In reciprocal
          // space w = 1/|v| this is linear: dw/dt = bA*(w + c), c = bK/speed,
          // so one frame is exact: w1 = (w0 + c)*exp(bA*dt) - c.
          const sgn = pad.kbVx < 0 ? -1 : 1;
          const c = bK / speed; // speed = per-ship max, so the curve scales per class
          const w0 = 1 / Math.abs(pad.kbVx);
          const w1 = (w0 + c) * Math.exp(bA * dt) - c;
          pad.kbVx = sgn / w1;
          // displacement over the frame is the exact integral of v dt:
          // x += sgn * (ln(w1/w0) - bA*dt) / (bA*c)
          pad.x += sgn * (Math.log(w1 / w0) - bA * dt) / (bA * c);
        } else {
          pad.kbVx = U.damp(pad.kbVx, 0, bA, dt);
          pad.x += pad.kbVx * dt;
        }
      }
      // derive real velocity for the banking visual from actual motion,
      // clamped to a modest ceiling and EMA-smoothed so a single fast frame
      // (a flick or a jumpy pointer step) can't spike the lean target before
      // the spring filters it — the ship leans into sustained motion, not
      // into one-off jitter. pad.bankVxSm is the filtered value; pad.vx is
      // only used by the spring below, so no other consumer sees the smoothing.
      const rawVx = (pad.x - prevX) / Math.max(dt, 0.0001);
      const tau = C.PADDLE_BANK_EMA_TAU || 0;
      if (tau > 0) {
        // frame-rate-independent EMA: alpha = 1 - exp(-dt/tau)
        const alpha = 1 - Math.exp(-dt / tau);
        pad.bankVxSm = (pad.bankVxSm || 0) + (rawVx - (pad.bankVxSm || 0)) * alpha;
        pad.vx = U.clamp(pad.bankVxSm, -C.PADDLE_BANK_VX_MAX, C.PADDLE_BANK_VX_MAX);
      } else {
        pad.bankVxSm = rawVx;
        pad.vx = U.clamp(rawVx, -C.PADDLE_BANK_VX_MAX, C.PADDLE_BANK_VX_MAX);
      }
      // banking spring: ease the visual lean toward real velocity so the ship
      // leans into motion and recovers naturally instead of snapping.
      // uses the ship's own profile (setupPaddle always resolves pad.bankCfg)
      // so heavy craft lean slow/far, agile fast/shallow
      const bc = pad.bankCfg;
      const bankTarget = U.clamp(pad.vx * bc.scale, -bc.max, bc.max);
      const acc = (bankTarget - pad.bank) * bc.stiff - pad.bankV * bc.damp;
      pad.bankV += acc * dt;
      pad.bank += pad.bankV * dt;
      pad.x = U.clamp(pad.x, padMin, padMax);

      // drone
      if (this.drone) {
        this.drone.x = U.damp(this.drone.x, pad.x - 110, 10, dt);
        this.drone.t = (this.drone.t || 0) + dt;
      }

      // bonus stage
      if (this.bonusMode) {
        this.updateBonus(dt);
      }

      // lasers
      this.fireLasers(dt);

      // balls
      const balls = this.balls;
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if (b.stuck) {
          // ride the banked hull: local offset rotated by the lean
          const lean = (pad.bank || 0) * C.PADDLE_BANK_RENDER;
          const c2 = Math.cos(lean), s2 = Math.sin(lean);
          const off = b.stuckOff || 0;
          const ly2 = -C.PADDLE_H / 2 - b.r - 8;
          b.x = pad.x + off * c2 - ly2 * s2;
          b.y = pad.y + off * s2 + ly2 * c2;
          continue;
        }
        this.moveBall(b, dt);
        if (b.dead) {
          // loseBall() already spliced this ball out of this.balls, so the
          // array has shifted — never re-splice by the stale loop index i,
          // which would delete a different, surviving ball and could empty
          // the array without ever losing a life (reported bug: missed balls
          // at level 2 just continued without ending life). Remove by identity.
          const idx = balls.indexOf(b);
          if (idx >= 0) balls.splice(idx, 1);
        }
      }

      // powerups & hazards
      R.Powerups.update(this, dt);
      R.Hazards.update(this, dt);
      R.Bricks.updateBricks(this, dt);

      // laser shots vs targets
      this.resolveShots();

      // boss
      if (this.boss) {
        R.Boss.update(this, dt);
        // ball vs boss handled in moveBall
      }

      // mini-boss encounter (elite, non-gating)
      if (this.mini) {
        R.Boss.miniUpdate(this, dt);
      }

      // win condition
      this.checkWin();
    },

    moveBall(b, dt) {
      const dist = U.len(b.vx, b.vy) * dt;
      const steps = Math.max(1, Math.ceil(dist / C.SUBSTEP));
      const sdt = dt / steps;
      for (let s = 0; s < steps; s++) {
        b.px = b.x; b.py = b.y;
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        if (this.hasPower("gravity")) b.vy += 60 * sdt;
        this.collideWorld(b);
        this.collidePaddle(b);
        if (b.stuck) { b.trail = []; break; }  // glued to ship: stop moving this frame
        if (this.drone) this.collideDrone(b);
        this.collideBricks(b);
        if (this.boss) this.collideBoss(b);
        if (this.mini) this.collideMini(b);
        if (b.dead) break;
      }
      // trail
      b.trail = b.trail || [];
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 10) b.trail.shift();
    },

    collideWorld(b) {
      const W = this.worldW, margin = C.WALL;
      if (b.x - b.r < margin) { b.x = margin + b.r; b.vx = Math.abs(b.vx); R.Audio.play("wall"); }
      if (b.x + b.r > W - margin) { b.x = W - margin - b.r; b.vx = -Math.abs(b.vx); R.Audio.play("wall"); }
      if (b.y - b.r < 60) { b.y = 60 + b.r; b.vy = Math.abs(b.vy); R.Audio.play("wall"); }
      // bottom: wall power catches
      if (b.y + b.r > this.worldH - 34 && this.hasPower("wall")) {
        b.y = this.worldH - 34 - b.r;
        b.vy = -Math.abs(b.vy);
        R.Audio.play("paddle");
        R.Particles.sparkle(b.x, this.worldH - 40, "#34d399");
      }
      if (b.y - b.r > this.worldH + 40) {
        b.dead = true;
        this.loseBall(b);
      }
    },

    collidePaddle(b) {
      const p = this.paddle;
      // Banked hitbox: rotate the ball into the paddle's local frame so the
      // collision box matches the drawn hull's lean (lean = bank * render scale).
      const lean = (p.bank || 0) * C.PADDLE_BANK_RENDER;
      const c = Math.cos(lean), s = Math.sin(lean);
      // world -> local (rotate by -lean)
      const dx = b.x - p.x, dy = b.y - p.y;
      const lx = dx * c + dy * s;
      const ly = -dx * s + dy * c;
      const pdx = b.px - p.x, pdy = b.py - p.y;
      const ply = -pdx * s + pdy * c;
      const hw = p.w / 2, hh = p.h / 2;
      // circle vs paddle rect (in the banked frame)
      const cx = U.clamp(lx, -hw, hw);
      const cy = U.clamp(ly, -hh, hh);
      const ex = lx - cx, ey = ly - cy;
      const d2 = ex * ex + ey * ey;
      if (d2 > b.r * b.r) return;
      // any ball inside the rect whose previous position was above the bottom
      // edge is a top-face contact (moving down normally; also catches balls
      // caught inside during a bank swing so nothing tunnels through).
      if (ply <= hh) {
        // top face: angled reflect in the banked frame
        const hit = U.clamp(lx / hw, -1, 1);
        const prec = this.hasPower("precision") ? C.PRECISION_ANGLE : 1;
        const maxAng = Math.min(82, C.PADDLE_ANGLE * prec);
        const ang = -Math.PI / 2 + hit * (maxAng * Math.PI / 180);
        const sp = U.len(b.vx, b.vy);
        // keep energy: edge hits add speed (classic breakout ramp)
        const newSp = Math.min(C.MAX_SPEED, sp * (1 + C.PADDLE_GAIN * Math.abs(hit)));
        const lvx = Math.cos(ang) * newSp;
        const lvy2 = Math.sin(ang) * newSp;
        // local -> world (rotate by +lean)
        b.vx = lvx * c - lvy2 * s;
        b.vy = lvx * s + lvy2 * c;
        // guarantee a playable vertical component (no flat side-to-side skims).
        // The Precision power-up is exempt — its whole point is sharper angles.
        if (!this.hasPower("precision") && Math.abs(b.vy) < 90) {
          // build the guaranteed direction in the banked frame so the lean
          // survives the skim correction (the ball keeps bouncing off the hull)
          const mag = Math.sqrt(Math.max(newSp * newSp - 8100, 0));
          const gvx = b.vx < 0 ? -mag : mag;
          const gvy = b.vy < 0 ? -90 : 90;
          b.vx = gvx * c - gvy * s;
          b.vy = gvx * s + gvy * c;
          // degenerate cases (lean would push the ball flat or downward):
          // fall back to a clean world-vertical guarantee
          if (b.vy >= 0 || Math.abs(b.vy) < 90) {
            b.vy = -90;
            b.vx = b.vx < 0 ? -mag : mag;
          }
        }
        // rest the ball on the rotated top surface (local y = -hh - r)
        const bx = U.clamp(lx, -hw, hw);
        b.x = p.x + bx * c - (-hh - b.r) * s;
        b.y = p.y + bx * s + (-hh - b.r) * c;
        R.Audio.play("paddle");
        R.Particles.sparkle(p.x - hh * s, p.y - hh * c, "#22d3ee");

        // sticky
        if (this.hasPower("sticky")) {
          b.stuck = true;
          b.stuckOff = bx;  // local-frame offset (rotated back when riding the hull)
          return;
        }
        // ship/scrubber split traits
        if (this.shipId === "quantum" && U.chance(0.08)) this.splitBall(b, 3);
        if (b.kind === "quantum" && U.chance(0.05)) this.splitBall(b, 3);
        if (b.kind === "multicore" && U.chance(0.08)) this.splitBall(b, 2);
        if (this.hasPower("quantum")) this.splitBall(b, 3);
        if (this.shipId === "mother" && U.chance(0.15)) b.pierceStacks = 3;
      } else if (ply > hh) {
        // bottom face: flip local vertical velocity, rotate back to world
        const lvx = b.vx * c + b.vy * s;
        const lvy2 = Math.abs(-b.vx * s + b.vy * c);
        b.vx = lvx * c - lvy2 * s;
        b.vy = lvx * s + lvy2 * c;
        b.x = p.x - (hh + b.r) * s;
        b.y = p.y + (hh + b.r) * c;
      }
    },

    collideDrone(b) {
      const d = this.drone;
      const halfW = 30, halfH = 12;
      if (b.x > d.x - halfW && b.x < d.x + halfW && b.y > d.y - halfH && b.y < d.y + halfH) {
        if (b.vy > 0) {
          const hit = U.clamp((b.x - d.x) / halfW, -1, 1);
          const ang = -Math.PI / 2 + hit * 1.0;
          const sp = U.len(b.vx, b.vy);
          b.vx = Math.cos(ang) * sp;
          b.vy = Math.sin(ang) * sp;
          b.y = d.y - halfH - b.r;
          R.Audio.play("paddle");
        }
      }
    },

    collideBricks(b) {
      if (this.bricks.length === 0) return;
      this.buildGridIfNeeded();
      const ghost = this.hasPower("ghost");
      const cx = Math.floor(b.x / C.CELL), cy = Math.floor(b.y / C.CELL);
      let hitCount = 0;
      let prismHit = false;   // prism cells refract the ball faster off their face
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const cell = this.brickGrid.get(gx + "," + gy);
          if (!cell) continue;
          for (let i = cell.length - 1; i >= 0; i--) {
            const bk = cell[i];
            if (bk.dead || bk.hiddenState === "ghost") continue;
            if (b.x + b.r > bk.x && b.x - b.r < bk.x + bk.w && b.y + b.r > bk.y && b.y - b.r < bk.y + bk.h) {
              let dmg = this.ballDamage(bk);
              // pierce stacks from mother ship
              const pierce = this.hasPower("pierce") || (b.pierceStacks > 0) || ghost;
              if (pierce) {
                if (b.pierceStacks !== undefined && b.pierceStacks > 0) b.pierceStacks--;
                this.damageBrick(bk, dmg, "ball");
                hitCount++;
                continue; // pass through without reflecting
              }
              // reflect based on entry side
              const fromTop = b.py + b.r <= bk.y;
              const fromBottom = b.py - b.r >= bk.y + bk.h;
              if (fromTop || fromBottom) {
                b.vy = -b.vy;
                b.y = fromTop ? bk.y - b.r : bk.y + bk.h + b.r;
              } else {
                b.vx = -b.vx;
                b.x = b.px <= bk.x ? bk.x - b.r : bk.x + bk.w + b.r;
              }
              this.damageBrick(bk, dmg, "ball");
              if (bk.type === "prism") prismHit = true;
              hitCount++;
            }
          }
        }
      }
      if (hitCount > 0) {
        const l = U.len(b.vx, b.vy);
        // prism refracts: a bigger speed kick than the default bump (capped)
        const sp = Math.min(C.MAX_SPEED, prismHit ? l * 1.22 : l + 6);
        b.vx = b.vx / l * sp; b.vy = b.vy / l * sp;
      }
    },

    ballDamage(bk) {
      let d = this.hasPower("dmg3") ? 3 : this.hasPower("dmg2") ? 2 : 1;
      if (this.scrubberId === "compression" || this.scrubberId === "vacuum") d += 1;
      // antivirus: purges virus fragments in one hit (they are 2hp)
      if (bk && this.scrubberId === "antivirus" && bk.type === "virus") d += 1;
      // breaker: chews through reinforced files faster
      if (bk && this.scrubberId === "breaker" && (bk.type === "strong" || bk.type === "super")) d += 1;
      return d;
    },

    collideBoss(b) {
      if (!this.boss) return;
      const boss = this.boss;
      const dx = b.x - boss.x, dy = b.y - boss.y;
      const rr = boss.w * 0.6;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1;
        const nx = dx / d, ny = dy / d;
        b.x = boss.x + nx * (rr + b.r);
        b.y = boss.y + ny * (rr + b.r);
        const dot = b.vx * nx + b.vy * ny;
        if (dot < 0) {
          b.vx -= 2 * dot * nx;
          b.vy -= 2 * dot * ny;
        }
        const dmg = this.ballDamage();
        R.Boss.hit(this, dmg);
        // boss may have been defeated during hit (this.boss set to null).
        // The outer substep loop continues to the next substep, but
        // collideBoss is only called when this.boss is truthy, so the
        // early return above handles a null boss on the next call.
        if (!this.boss) return;
      }
    },

    collideMini(b) {
      if (!this.mini) return;
      const mini = this.mini;
      const dx = b.x - mini.x, dy = b.y - mini.y;
      const rr = mini.w * 0.5;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1;
        const nx = dx / d, ny = dy / d;
        b.x = mini.x + nx * (rr + b.r);
        b.y = mini.y + ny * (rr + b.r);
        const dot = b.vx * nx + b.vy * ny;
        if (dot < 0) {
          b.vx -= 2 * dot * nx;
          b.vy -= 2 * dot * ny;
        }
        const dmg = this.ballDamage();
        R.Boss.miniHit(this, dmg);
        // mini may have been purged during hit; early return guards the next
        // substep the same way collideBoss does.
        if (!this.mini) return;
      }
    },

    resolveShots() {
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const s = this.shots[i];
        let hit = false;
        // vs bricks
        for (const bk of this.bricks) {
          if (bk.dead || bk.hiddenState === "ghost") continue;
          if (s.x > bk.x && s.x < bk.x + bk.w && s.y > bk.y && s.y < bk.y + bk.h) {
            this.damageBrick(bk, s.dmg, "shot");
            hit = !s.plasma;
            break;
          }
        }
        if (hit) { this.shots.splice(i, 1); continue; }
        if (this.boss) {
          if (Math.abs(s.x - this.boss.x) < this.boss.w / 2 && Math.abs(s.y - this.boss.y) < this.boss.h / 2) {
            R.Boss.hit(this, s.dmg);
            if (!s.plasma) this.shots.splice(i, 1);
          }
        } else if (this.mini) {
          if (Math.abs(s.x - this.mini.x) < this.mini.w / 2 && Math.abs(s.y - this.mini.y) < this.mini.h / 2) {
            R.Boss.miniHit(this, s.dmg);
            if (!s.plasma) this.shots.splice(i, 1);
          }
        }
      }
    },

    buildGridIfNeeded() {
      if (!this.bricksDirty && this.brickGrid) return;
      this.brickGrid = new Map();
      for (const bk of this.bricks) {
        if (bk.dead) continue;
        const key = Math.floor((bk.x + bk.w / 2) / C.CELL) + "," + Math.floor((bk.y + bk.h / 2) / C.CELL);
        if (!this.brickGrid.has(key)) this.brickGrid.set(key, []);
        this.brickGrid.get(key).push(bk);
      }
      this.bricksDirty = false;
    },

    // ---------------- bonus stage ----------------
    updateBonus(dt) {
      this.bonusT -= dt;
      // spawn capsules from top
      if (U.chance(0.03)) {
        const kinds = ["expand", "life", "multiball", "scorex2", "cookie", "laser", "shield", "slow", "magnet"];
        R.Powerups.spawn(this, U.rand(60, this.worldW - 60), 40, U.pick(kinds));
      }
      if (this.bonusT <= 0) {
        this.bonusMode = false;
        this.addScore(500 + this.bonusCaught * 100, this.worldW / 2, this.worldH / 2);
        R.Save.bumpStat("bonusCleared");
        if (R.Save.get("stats.bonusCleared") >= 3 && R.Save.unlock("bonus_3")) this.toastAchievement("bonus_3");
        this.triggerLevelClear();
      }
    },

    onPowerup(kind) {
      R.Save.bumpStat("powerupsCollected");
      R.Particles.sparkle(this.paddle.x, this.paddle.y - 30, "#fbbf24");
      const n = R.Save.get("stats.powerupsCollected", 0);
      if (n >= 50 && R.Save.unlock("powerups_50")) this.toastAchievement("powerups_50");
    },

    // ---------------- win / lose ----------------
    checkWin() {
      if (this.bonusMode) return;
      if (this.boss) return;
      // steel (indestructible) blocks never break — Ricochet-style, they stay
      // as obstacles and don't block completion (endless also spawns X, so
      // requiring zero bricks would soft-lock every wave that rolls one)
      if (!this.bricks.some((b) => !b.dead && b.type !== "steel")) {
        this.triggerLevelClear();
      }
    },

    triggerLevelClear(jingle) {
      if (this.state !== STATE.PLAY) return;
      this.state = STATE.CLEAR;
      this.clearT = 2.2;
      R.Audio.play(jingle || "win");
      const bonus = this.lives * 250;   // addScore applies scoreMult internally
      this.addScore(bonus, this.worldW / 2, this.worldH / 2);
      if (this.ballsLost === 0) {
        if (R.Save.unlock("no_miss")) this.toastAchievement("no_miss");
      }
      R.Particles.confetti(this.worldW / 2, this.worldH / 3, 60);
      R.Save.unlockLevel(this.level + 1);
      if (this.level > R.Save.get("stats.bestLevel", 0)) R.Save.set("stats.bestLevel", this.level);
      if (this.level >= 10 && R.Save.unlock("level_10")) this.toastAchievement("level_10");
      if (this.level >= 25 && R.Save.unlock("level_25")) this.toastAchievement("level_25");
    },

    updateIntro(dt) {
      // let the ship settle to level while the banner is up (no frozen lean)
      if (this.paddle && Math.abs(this.paddle.bank) > 0.001) {
        this.paddle.bank = U.damp(this.paddle.bank, 0, 8, dt);
        this.paddle.bankV = U.damp(this.paddle.bankV, 0, 8, dt);
      }
      if (this.state === STATE.INTRO) {
        this.introT -= dt;
        if (this.introT <= 0) {
          this.state = STATE.PLAY;
        }
      } else if (this.state === STATE.CLEAR) {
        this.clearT -= dt;
        if (this.clearT <= 0) {
          if (this.endless) {
            this.wave++;
            this.loadLevel(1);
          } else if (this.level >= C.CAMPAIGN_LENGTH) {
            this.victory();
          } else {
            this.loadLevel(this.level + 1);
          }
        }
      }
    },

    gameOver() {
      this.state = STATE.GAMEOVER;
      R.Audio.play("lose");
      R.Audio.stopSong();
      this.shake(12);
      this.balls = [];
      R.Particles.burst(this.paddle.x, this.paddle.y, { count: 60, color: "#fb7185", speed: 420 });
      R.Save.bumpStat("playTime", 0);
      const isHigh = R.Save.isHighScore(this.score);
      R.UI.showGameOver(this.score, this.level, this.combo, isHigh);
      R.UI.hidePause();
    },

    victory() {
      this.state = STATE.VICTORY;
      R.Audio.play("win");
      R.Audio.stopSong();
      if (R.Save.unlock("campaign_done")) this.toastAchievement("campaign_done");
      R.Save.bumpStat("playTime", 0);
      R.UI.showVictory(this.score, this.level, this.statsSummary());
    },

    statsSummary() {
      return {
        score: this.score,
        level: this.level,
        blocks: R.Save.get("stats.blocksDestroyed", 0),
        maxCombo: R.Save.get("stats.maxCombo", 0)
      };
    },

    shake(n) { this.shakeAmt = Math.max(this.shakeAmt, n); },

    pause() {
      if (this.state !== STATE.PLAY) return;
      this.state = STATE.PAUSE;
      R.Audio.play("ui");
      R.UI.showPause();
    },
    resume() {
      if (this.state !== STATE.PAUSE) return;
      this.state = STATE.PLAY;
      R.Audio.play("ui");
      R.UI.hidePause();
    },
    togglePause() {
      if (this.state === STATE.PLAY) this.pause();
      else if (this.state === STATE.PAUSE) this.resume();
    },
    quitToTitle() {
      this.demoMode = false;
      this.state = STATE.TITLE;
      this.balls = [];
      R.Audio.playSong("menu");
      R.UI.hidePause();
      R.UI.show("title");
      R.UI.setPauseVisible(false);
    },
    restartLevel() {
      this.lives = Math.max(1, this.lives);
      this.combo = 0;
      this.setMult(1);
      this.timers = {};
      this.drone = null;
      this.state = STATE.PLAY;
      this.loadLevel(this.level);
      R.UI.hidePause();
    },

    toast(msg, color) {
      R.UI.toast(msg, color);
    },
    toastAchievement(id) {
      R.UI.toastAchievement(id);
    },
    checkAchievements() {
      if (this.level >= 10 && R.Save.unlock("level_10")) this.toastAchievement("level_10");
      if (this.level >= 25 && R.Save.unlock("level_25")) this.toastAchievement("level_25");
      if (R.Ships && R.Ships.unlockCheck) R.Ships.unlockCheck();
    },

    // ---------------- render ----------------
    render() {
      const ctx = this.ctx;
      const t = this.time;
      const W = this.viewW, H = this.viewH;

      R.Background.render(ctx, t, this.state === STATE.TITLE ? 1 : 0.4);

      ctx.save();
      // world transform + shake
      const shX = this.shakeAmt > 0 ? U.rand(-this.shakeAmt, this.shakeAmt) * 0.4 : 0;
      const shY = this.shakeAmt > 0 ? U.rand(-this.shakeAmt, this.shakeAmt) * 0.4 : 0;
      ctx.translate(this.offX + shX, this.offY + shY);
      ctx.scale(this.scale, this.scale);

      // playfield border
      ctx.strokeStyle = "rgba(34,211,238,0.25)";
      ctx.lineWidth = 2;
      ctx.strokeRect(C.WALL / 2, 56, this.worldW - C.WALL, this.worldH - 56 - 30);

      // brick zone tint
      ctx.fillStyle = "rgba(8,18,36,0.35)";
      ctx.fillRect(C.WALL / 2, 60, this.worldW - C.WALL, C.PADDLE_Y - 120);

      // bricks — batched by style so a full grid renders as a handful of
      // paths per layer instead of ~7 draw calls per brick (a big win on
      // software rasterizers and weak mobile GPUs). Bricks whose colors
      // change per frame (prism shimmer, regen breathe, ghost flickers,
      // hit-flash) keep the per-brick path.
      {
        const glowOn = R.Save.setting("glow");
        const hexA = U.hexA;
        const buckets = {};
        const specials = [];
        for (const bk of this.bricks) {
          if (bk.dead) continue;
          if (bk.type === "hidden" && bk.hiddenState === "ghost") {
            // faint outline only
            ctx.strokeStyle = "rgba(148,163,184,0.15)";
            ctx.lineWidth = 1;
            R.Art.rr(ctx, bk.x, bk.y, bk.w, bk.h, 7);
            ctx.stroke();
            continue;
          }
          if (bk.style === "prism" || bk.style === "regen" || bk.flash > 0
              || (bk.style === "flicker" && bk.hiddenState === "ghost")) {
            specials.push(bk);
            continue;
          }
          const key = R.Art.BLOCK_STYLE[bk.style] ? bk.style : "normal";
          (buckets[key] || (buckets[key] = [])).push(bk);
        }
        for (const style in buckets) {
          const st = R.Art.BLOCK_STYLE[style] || R.Art.BLOCK_STYLE.normal;
          const list = buckets[style];
          // soft outer halo washes
          if (glowOn) {
            ctx.fillStyle = hexA(st.c, 0.16);
            ctx.beginPath();
            for (let i = 0; i < list.length; i++) {
              const bk = list[i];
              R.Art.rr(ctx, bk.x - bk.w * 0.18, bk.y - bk.h * 0.18, bk.w * 1.36, bk.h * 1.36, 12);
            }
            ctx.fill();
            ctx.fillStyle = hexA(st.c, 0.10);
            ctx.beginPath();
            for (let i = 0; i < list.length; i++) {
              const bk = list[i];
              R.Art.rr(ctx, bk.x - bk.w * 0.4, bk.y - bk.h * 0.4, bk.w * 1.8, bk.h * 1.8, 16);
            }
            ctx.fill();
          }
          // bodies
          ctx.fillStyle = hexA(st.c, 0.9);
          ctx.beginPath();
          for (let i = 0; i < list.length; i++) {
            const bk = list[i];
            R.Art.rr(ctx, bk.x, bk.y, bk.w, bk.h, 7);
          }
          ctx.fill();
          // gloss highlight
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.beginPath();
          for (let i = 0; i < list.length; i++) {
            const bk = list[i];
            R.Art.rr(ctx, bk.x, bk.y, bk.w, bk.h * 0.28, 7);
          }
          ctx.fill();
          // accent border (per style)
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = hexA(st.c, 0.95);
          ctx.beginPath();
          for (let i = 0; i < list.length; i++) {
            const bk = list[i];
            R.Art.rr(ctx, bk.x + 3, bk.y + 3, bk.w - 6, bk.h - 6, 5);
          }
          ctx.stroke();
          // corner nodes
          ctx.fillStyle = hexA(st.c, 0.9);
          ctx.beginPath();
          for (let i = 0; i < list.length; i++) {
            const bk = list[i];
            const cn = Math.max(2, bk.w * 0.035);
            ctx.rect(bk.x + 3, bk.y + 3, cn, cn);
            ctx.rect(bk.x + bk.w - 3 - cn, bk.y + 3, cn, cn);
            ctx.rect(bk.x + 3, bk.y + bk.h - 3 - cn, cn, cn);
            ctx.rect(bk.x + bk.w - 3 - cn, bk.y + bk.h - 3 - cn, cn, cn);
          }
          ctx.fill();
          // icons + hp pips (per brick — they need transforms / per-brick state)
          const iconCol = glowOn ? hexA("#ffffff", 0.98) : hexA("#eaf6ff", 0.85);
          for (let i = 0; i < list.length; i++) {
            const bk = list[i];
            const cx = bk.x + bk.w / 2, cy = bk.y + bk.h / 2;
            R.Art.icon(ctx, st.ic, cx, cy, Math.min(24, bk.h * 0.62), iconCol);
            if (bk.maxHp > 1 && bk.style !== "steel" && bk.style !== "shield") {
              const n = bk.maxHp - 1;
              const pw = bk.w * 0.12;
              const gap = 5;
              const total = n * pw + (n - 1) * gap;
              let px = bk.x + bk.w / 2 - total / 2;
              ctx.fillStyle = "rgba(255,255,255,0.55)";
              for (let k = 0; k < n; k++) {
                if (k < bk.maxHp - bk.hp) ctx.fillRect(px, bk.y + bk.h - 8, pw, 4);
                px += pw + gap;
              }
            }
          }
        }
        // dark inner frame (style-independent, one path across all buckets)
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        for (const style in buckets) {
          const list = buckets[style];
          for (let i = 0; i < list.length; i++) {
            const bk = list[i];
            R.Art.rr(ctx, bk.x + 7, bk.y + 7, bk.w - 14, bk.h - 14, 4);
          }
        }
        ctx.stroke();
        // per-brick path for shimmering / flicker-ghost / hit-flash bricks
        for (let i = 0; i < specials.length; i++) {
          R.Art.drawBlock(ctx, specials[i], t);
        }
      }

      // boss
      if (this.boss) {
        R.Art.drawBoss(ctx, this.boss, t);
        // boss hp bar
        const bw = this.worldW * 0.6;
        const bx = (this.worldW - bw) / 2;
        ctx.fillStyle = "rgba(6,12,24,0.8)";
        R.Art.rr(ctx, bx - 2, 68, bw + 4, 16, 8); ctx.fill();
        ctx.fillStyle = "#f87171";
        R.Art.rr(ctx, bx, 70, bw * U.clamp(this.boss.hp / this.boss.maxHp, 0, 1), 12, 6); ctx.fill();
        ctx.strokeStyle = "rgba(251,113,133,0.6)";
        ctx.lineWidth = 1;
        R.Art.rr(ctx, bx - 2, 68, bw + 4, 16, 8); ctx.stroke();
      }

      // mini-boss encounter (draws its own compact hp bar)
      if (this.mini) {
        R.Art.drawMiniBoss(ctx, this.mini, t);
      }

      // hazards
      R.Hazards.render(this, ctx, t);

      // safety net
      if (this.hasPower("wall")) {
        ctx.fillStyle = "rgba(52,211,153,0.25)";
        ctx.fillRect(10, this.worldH - 40, this.worldW - 20, 6);
        ctx.strokeStyle = "#34d399";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(10, this.worldH - 40, this.worldW - 20, 6);
      }

      // powerups
      R.Powerups.render(this, ctx, t);

      // drone
      if (this.drone) R.Art.drawDrone(ctx, this.drone, t);

      // balls
      for (const b of this.balls) {
        // trail
        if (b.trail && b.trail.length > 1) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          // BALL_STYLE.glow is a "rgba(r,g,b," prefix — build each point's color
          // from it directly. (The old regex form matched nothing — the prefix
          // ends in a comma, not "digit)" — so trails were silently drawn with
          // a stale fillStyle at full alpha.)
          const style = R.Art.BALL_STYLE[b.kind];
          const prefix = style ? style.glow : "rgba(34,211,238,";
          for (let i = 0; i < b.trail.length - 1; i++) {
            const tr = b.trail[i];
            const a = (i / b.trail.length) * 0.35;
            ctx.fillStyle = prefix + a + ")";
            ctx.beginPath(); ctx.arc(tr.x, tr.y, b.r * (0.4 + 0.5 * i / b.trail.length), 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }
        R.Art.drawBall(ctx, b, t);
      }

      // paddle + shield
      const pad = this.paddle;
      if (pad) {
        if (pad.shield > 0) {
          ctx.strokeStyle = `rgba(56,189,248,${0.5 + 0.3 * Math.sin(t * 8)})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(pad.x, pad.y - 20, pad.w * 0.62, Math.PI * 1.05, Math.PI * 1.95);
          ctx.stroke();
        }
        const bank = pad.bank || 0;
        R.Art.drawShip(ctx, pad.x, pad.y, pad.w, pad.h * 1.7, this.shipId, { bank, t });
        // thruster tilt: rotate spawn offsets around the ship center by the same
        // lean drawShip applies, and tilt emission to follow — exhaust trails the hull
        const lean = bank * R.Config.PADDLE_BANK_RENDER;
        const cl = Math.cos(lean), sl = Math.sin(lean);
        const tx = pad.w * 0.18, ty = pad.h * 0.7;
        for (const side of [-1, 1]) {
          R.Particles.thruster(
            pad.x + side * tx * cl - ty * sl,
            pad.y + side * tx * sl + ty * cl,
            R.Art.SHIP_DRAW[this.shipId].glow,
            lean
          );
        }
      }

      // particles (world space)
      R.Particles.render(ctx, W, H);

      // HUD
      this.renderHUD(ctx);

      // intro banner
      if (this.state === STATE.INTRO) {
        this.renderIntro(ctx, t);
      }
      if (this.state === STATE.CLEAR) {
        ctx.fillStyle = "rgba(6,12,24,0.45)";
        ctx.fillRect(0, 0, this.worldW, this.worldH);
        ctx.font = '800 46px "Cascadia Code", ui-monospace, monospace';
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#34d399";
        ctx.shadowColor = "#34d399"; ctx.shadowBlur = 24;
        ctx.fillText("SECTOR CLEARED", this.worldW / 2, this.worldH / 2 - 20);
        ctx.shadowBlur = 0;
        ctx.font = '18px "Cascadia Code", monospace';
        ctx.fillStyle = "#c3d5ee";
        ctx.fillText("+" + U.fmt(250 * this.lives * this.difficulty.scoreMult) + " survival bonus", this.worldW / 2, this.worldH / 2 + 24);
        // steel barriers are indestructible — say so at the moment the sector
        // clears with them still standing, so the player knows it's by design
        const steelLeft = this.bricks.some((b) => !b.dead && b.type === "steel");
        if (steelLeft) {
          ctx.font = '15px "Cascadia Code", monospace';
          ctx.fillStyle = "#9fb3cc";
          ctx.fillText("steel barriers remain — indestructible by design", this.worldW / 2, this.worldH / 2 + 52);
        }
      }

      ctx.restore();

      // AI demo overlay (screen-space, not world)
      if (this.demoMode) {
        R.DemoAI.renderOverlay(ctx, W, H);
      }
    },

    renderHUD(ctx) {
      const pad = 26;
      const t = this.time;

      // score
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = '700 30px "Cascadia Code", ui-monospace, monospace';
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillText(U.fmt(this.score), pad + 2, 22 + 2);
      // (the offset dark drop-shadow above already separates the score from
      // the backdrop — a per-frame shadowBlur here is one of the priciest
      // canvas ops in the HUD and reads nearly identically without it)
      ctx.fillStyle = "#eaf6ff";
      ctx.fillText(U.fmt(this.score), pad, 22);

      // multiplier
      ctx.font = '700 16px "Cascadia Code", monospace';
      ctx.fillStyle = this.mult > 1 ? "#fbbf24" : "rgba(125,147,184,0.8)";
      ctx.fillText("x" + this.mult, pad, 60);

      // combo
      if (this.combo > 1) {
        ctx.font = '700 14px "Cascadia Code", monospace';
        ctx.fillStyle = `rgba(34,211,238,${0.5 + 0.5 * Math.sin(t * 6)})`;
        ctx.fillText("COMBO " + this.combo, pad, 84);
      }

      // level title — endless waves are numbered per phase (this.level stays
      // 1 in endless, so the wave counter is the real phase indicator)
      ctx.textAlign = "center";
      ctx.font = '600 16px "Cascadia Code", monospace';
      ctx.fillStyle = "rgba(214,231,255,0.9)";
      ctx.fillText(`${this.endless ? "WAVE" : "SECTOR"} ${this.endless ? this.wave + 1 : this.level}`, this.worldW / 2, 24);
      ctx.font = '12px "Cascadia Code", monospace';
      ctx.fillStyle = "rgba(125,147,184,0.85)";
      const wname = this.levelDef ? this.levelDef.world : "";
      ctx.fillText(`${wname}${this.bossName ? " — " + this.bossName.toUpperCase() : this.miniName ? " — " + this.miniName.toUpperCase() : ""}`, this.worldW / 2, 46);

      // endless wave-preview chip: the palette the current wave paints with,
      // so the color phase reads at a glance. Sits below the BLOCKS counter
      // (y 64) so the chips never overlap the count text.
      // During the wave-clear transition the outgoing palette fades out and
      // the incoming palette fades in, giving a crisp crossfade before the
      // new grid spawns.
      if (this.endless && R.Art && R.Art.THEMES) {
        const theme = R.Art.THEMES[this.themeIdx()];
        let nextCols = null;
        let crossfade = 0;
        if (this.state === STATE.CLEAR && this._clearNextTheme && this._clearNextTheme.colors) {
          nextCols = this._clearNextTheme.colors;
          crossfade = U.clamp(1 - this.clearT / 2.2, 0, 1);
        }
        if (theme && theme.colors && theme.colors.length) {
          const cw = 11, gap = 4;
          const total = theme.colors.length * cw + (theme.colors.length - 1) * gap;
          const cy = 84;
          // outgoing palette (fades out during CLEAR)
          let cx = Math.round(this.worldW / 2 - total / 2);
          const outAlpha = nextCols ? (1 - crossfade) : 1;
          ctx.globalAlpha = outAlpha;
          for (const col of theme.colors) {
            ctx.fillStyle = col;
            R.Art.rr(ctx, cx, cy, cw, cw, 3); ctx.fill();
            ctx.strokeStyle = "rgba(2,8,18,0.8)";
            ctx.lineWidth = 1;
            R.Art.rr(ctx, cx, cy, cw, cw, 3); ctx.stroke();
            cx += cw + gap;
          }
          // incoming palette (fades in during CLEAR)
          if (nextCols) {
            cx = Math.round(this.worldW / 2 - total / 2);
            ctx.globalAlpha = crossfade;
            for (const col of nextCols) {
              ctx.fillStyle = col;
              R.Art.rr(ctx, cx, cy, cw, cw, 3); ctx.fill();
              ctx.strokeStyle = "rgba(2,8,18,0.8)";
              ctx.lineWidth = 1;
              R.Art.rr(ctx, cx, cy, cw, cw, 3); ctx.stroke();
              cx += cw + gap;
            }
          }
          ctx.globalAlpha = 1;

          // color legend — each palette chip maps to one of the four brick
          // types that receive the wave's theme tint (normal, binary, strong,
          // super). Abbreviated labels make the chip double as a tutorial.
          const labels = ["NORM", "BIN", "STR", "SUP"];
          const ly = cy + cw + 6;
          ctx.font = '7px "Cascadia Code", monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          cx = Math.round(this.worldW / 2 - total / 2);
          for (let i = 0; i < Math.min(labels.length, theme.colors.length); i++) {
            ctx.fillStyle = theme.colors[i];
            ctx.fillText(labels[i], cx + cw / 2, ly);
            cx += cw + gap;
          }
        }
      }

      // blocks remaining + steel barriers. Ricochet-style clear feedback: the
      // player sees exactly what's left to break, and that indestructible steel
      // blocks are barriers that DON'T block the clear — so a sector ending with
      // steel still standing reads as intended, not as a bug.
      if (!this.bonusMode && this.state !== STATE.PAUSE) {
        let destr = 0, steel = 0;
        for (const b of this.bricks) {
          if (b.dead) continue;
          if (b.type === "steel") steel++;
          else destr++;
        }
        ctx.font = '700 13px "Cascadia Code", monospace';
        ctx.textAlign = "left";
        // steel icons (small hdd tiles) + counts, tucked under the world label
        let bx = this.worldW / 2 - 78;
        ctx.fillStyle = "rgba(34,211,238,0.95)";
        ctx.fillText("BLOCKS " + destr, bx, 64);
        bx += ctx.measureText("BLOCKS " + destr).width + 14;
        ctx.fillStyle = "rgba(125,147,184,0.9)";
        for (let i = 0; i < Math.min(steel, 8); i++) {
          R.Art.icon(ctx, "hdd", bx + i * 16, 74, 13, "#7d93b8");
        }
        if (steel > 0) {
          bx += Math.min(steel, 8) * 16 + 6;
          ctx.fillStyle = "#9fb3cc";
          ctx.fillText("×" + steel + " STEEL", bx, 64);
        }
      }

      // lives (ship icons) — the demo runs 99 lives, so cap the icon row or
      // it would smear ships across the whole top of the attract screen
      const livesShown = this.demoMode ? Math.min(this.lives, 3) : this.lives;
      ctx.textAlign = "right";
      for (let i = 0; i < livesShown; i++) {
        const lx = this.worldW - pad - i * 34;
        ctx.save();
        ctx.translate(lx, 34);
        ctx.scale(0.8, 0.8);
        R.Art.drawShip(ctx, 0, 0, 40, 14, this.shipId, { t });
        ctx.restore();
      }

      // powerup pills
      const pills = Object.keys(this.timers).filter((k) => R.Powerups.KINDS[k] && this.timers[k] > 0);
      let px = pad;
      ctx.textAlign = "left";
      for (const k of pills) {
        const def = R.Powerups.KINDS[k];
        const remain = this.timers[k];
        ctx.fillStyle = "rgba(6,12,24,0.7)";
        R.Art.rr(ctx, px, 108, 118, 26, 13); ctx.fill();
        ctx.strokeStyle = def.color; ctx.lineWidth = 1.2;
        R.Art.rr(ctx, px, 108, 118, 26, 13); ctx.stroke();
        R.Art.icon(ctx, def.icon, px + 16, 121, 18, def.color);
        ctx.font = '700 12px "Cascadia Code", monospace';
        ctx.fillStyle = "#eaf6ff";
        ctx.fillText(remain.toFixed(1) + "s", px + 30, 115);
        ctx.font = '10px "Cascadia Code", monospace';
        ctx.fillStyle = "rgba(125,147,184,0.9)";
        ctx.fillText(def.name, px + 30, 128);
        px += 126;
      }

      // fps
      if (R.Save.setting("fps")) {
        ctx.font = '11px "Cascadia Code", monospace';
        ctx.fillStyle = "rgba(125,147,184,0.7)";
        ctx.fillText(Math.round(1 / Math.max(0.001, this.frameDt || 0.016)) + " FPS", this.worldW - pad, 76);
      }
    },

    renderIntro(ctx, t) {
      const def = this.levelDef;
      ctx.fillStyle = "rgba(4,8,16,0.55)";
      ctx.fillRect(0, 0, this.worldW, this.worldH);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = '800 52px "Cascadia Code", ui-monospace, monospace';
      ctx.fillStyle = "#eaf6ff";
      ctx.shadowColor = "rgba(34,211,238,0.8)"; ctx.shadowBlur = 28;
      ctx.fillText(def.name.toUpperCase(), this.worldW / 2, this.worldH * 0.38);
      ctx.shadowBlur = 0;
      ctx.font = '700 18px "Cascadia Code", monospace';
      ctx.fillStyle = "#22d3ee";
      ctx.fillText(`${this.endless ? "WAVE " + (this.wave + 1) + " — " : ""}${def.world}${this.boss ? " — CORRUPTED BOSS DETECTED" : this.mini ? " — SIGNAL INTERCEPTED" : ""}`, this.worldW / 2, this.worldH * 0.38 + 48);
      ctx.font = '14px "Cascadia Code", monospace';
      ctx.fillStyle = "rgba(195,213,238,0.8)";
      const hasSteel = this.bricks.some((b) => !b.dead && b.type === "steel");
      const hint = this.boss
        ? "Purge the boss to restore this sector."
        : (hasSteel ? "Clean all data blocks — steel barriers stay." : "Clean all data blocks.");
      ctx.fillText(hint, this.worldW / 2, this.worldH * 0.38 + 80);

      if (this.introT < 1.2) {
        const cd = Math.max(0, Math.ceil(this.introT));
        ctx.font = '900 90px "Cascadia Code", monospace';
        ctx.fillStyle = cd === 0 ? "#34d399" : "#fbbf24";
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 30;
        ctx.fillText(cd === 0 ? "GO!" : cd, this.worldW / 2, this.worldH * 0.62);
        ctx.shadowBlur = 0;
      }
    },

    frameDt: 0.016
  };

  R.Engine = E;
  R.Engine.STATE = STATE;
})(window.BREAK);
