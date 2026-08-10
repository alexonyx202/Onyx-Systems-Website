/* =========================================================================
   PORT MAPPER — game.js
   Core engine: state machine, hop physics, enemies, power-ups, scoring.
   ========================================================================= */
window.PM = window.PM || {};

PM.Game = (function () {
  'use strict';

  const C = PM.Config, R = PM.Render, I = PM.Input, A = PM.Audio, S = PM.Storage;
  const STR = PM.STR.T;   // strings table — text is centralized in strings.js
  const RNG = PM.RNG, rnd = RNG.f;
  const key = R.tileKey;

  let state = 'menu';           // menu | ready | playing | paused | levelclear | gameover | initials
  let diff = C.DIFF.normal;
  let world = null;
  let score = 0, hi = 0, lives = 3, level = 1, nextExtra = C.SCORE.extraLifeFirst;
  let tGlobal = 0, last = 0;
  let rafId = 0;
  let readyT = 0, clearT = 0;
  // Run-level stats for the game-over report. world.stats is PER-LEVEL
  // (buildWorld zeroes it at every advanceLevel), so completed levels merge
  // here at levelClear; gameOver() folds in the current level's partial stats.
  let runStats = null;
  function resetRunStats() {
    runStats = {
      ports: 0, total: 0, deaths: 0, reSecures: 0, reSecureBonus: 0,
      reSecureBest: 0, chainBest: 0, hackersCaught: 0, worms: 0, timeMs: 0,
    };
  }
  let menuWorld = null;         // attract-mode world behind menus
  let menuIdle = 0;             // idle ms on the title (attract auto-start)
  let goIdle = 0;               // idle ms on the game-over screen (attract return)

  // ---- deterministic-replay boot params (URL) -------------------------------
  //   ?seed=N       force the RNG seed (reproducible runs / daily challenges)
  //   ?autostart=ms override the attract auto-start clock (harness / operators)
  //   ?fp=ms        stamp a world fingerprint into the DOM once the SIMULATION
  //                 crosses ms (frame-rate independent), so headless runs can
  //                 be compared byte-for-byte. Also switches the loop to a
  //                 deterministic timer-driven driver (headless virtual time
  //                 advances setTimeout but not rAF).
  //   ?hz=N         timer harness cadence in Hz (default 60) — running two
  //                 identical loads at different hz proves frame-rate
  //                 independence of the fixed-timestep simulation.
  //   ?diff=easy|normal|hard|gamer — boot straight into a real game at that
  //                 tier (operators / headless UI checks; skips the title).
  //   ?level=N      start the booted run at level N (default 1). Lets a
  //                 compare harness land on a deep level where every tier's
  //                 hackers are active — ?level=5 clears all four hackerFrom
  //                 gates (easy 5 / normal 3 / hard 1 / gamer 1) at once, so
  //                 the same seeded pyramid can be eyeballed across tiers.
  const bootParams = new URLSearchParams(location.search);
  const seedRaw = bootParams.get('seed');
  const seedNum = (seedRaw !== null && seedRaw !== '') ? parseInt(seedRaw, 10) : NaN;
  const bootSeed = isNaN(seedNum) ? null : (seedNum >>> 0);   // NaN guard must come BEFORE >>> (NaN>>>0===0)
  const autoStartMs = bootParams.get('autostart') !== null ? Math.max(0, parseInt(bootParams.get('autostart'), 10) || 0) : null;
  const fpAt = bootParams.get('fp') !== null ? Math.max(0, parseInt(bootParams.get('fp'), 10) || 0) : null;
  const hzRaw = bootParams.get('hz');
  const hzMs = (hzRaw !== null && hzRaw !== '') ? Math.max(10, Math.min(240, parseInt(hzRaw, 10) || 60)) : 60;
  const diffRaw = bootParams.get('diff');
  const bootDiff = (diffRaw !== null && C.DIFF[diffRaw]) ? diffRaw : null;
  const levelRaw = bootParams.get('level');
  const bootLevel = (levelRaw !== null && levelRaw !== '') ? Math.max(1, Math.min(99, parseInt(levelRaw, 10) || 1)) : null;
  let fpShown = false;
  let timerMode = false;        // deterministic fixed-timestep driver (harness)
  // debug profiler: per-phase frame timing accumulated by the loop (the 4
  // performance.now() reads per frame are sub-microsecond — read the report
  // via _debug.profile() / reset via _debug.profileReset())
  let prof = { frames: 0, update: 0, render: 0, hud: 0, total: 0, maxFrame: 0, longFrames: 0 };
  // freelist pools for particles & floats — bursts reuse dead objects instead
  // of allocating fresh ones, and removal is a swap-pop, not a splice. Pools
  // hold at most the session's peak concurrency (drain at every world
  // replacement returns everything) and intentionally never shrink.
  let partPool = [], floatPool = [];
  // fixed-timestep simulation: the game advances in whole STEP-ms ticks drained
  // from an accumulator, so sim state is independent of the display frame rate.
  // Hop/fall objects carry TWO timestamps: t0 = SIM time (world.elapsed) used
  // for deterministic step-boundary completion, and w0 = wall time (tGlobal)
  // used ONLY by the renderer's smooth hop interpolation at display rate.
  const STEP = 20;        // 50Hz simulation step
  let acc = 0;            // leftover frame time carried into the next frame

  /* ================= world construction ================= */

  function buildWorld(lvl, demo) {
    const rows = C.rowsForLevel(lvl);
    const geo = C.GEO.compute(rows);
    // attract mode always runs at NORMAL hacker tuning; real games use their tier
    const d = demo ? C.DIFF.normal : diff;
    const cubes = {};
    for (let u = 0; u < rows; u++) {
      for (let v = 0; u + v < rows; v++) {
        cubes[key(u, v)] = { u, v, r: u + v, state: 0, flash: 0, revert: 0, hacked: 0, warn: 0, twinkle: rnd() * 6.28 };
      }
    }
    const w = {
      level: lvl, rows, geo, cubes, demo: !!demo,
      player: null, enemies: [], discs: [], powerups: [], particles: [], floats: [],
      freeze: 0, shake: 0, flash: 0, flashColor: '#ffffff', levelFlash: 0,
      elapsed: 0, chain: 0,
      timers: { nextPower: 6000 + rnd() * 6000, nextDisc: 10000, nextHacker: 8000 / d.hackerFreq, nextGreen: 12000 },
      stats: { deaths: 0, total: (rows * (rows + 1)) / 2, changed: 0, reSecures: 0, reSecureBonus: 0, reSecureStreak: 0, reSecureBest: 0, chainBest: 0, hackersCaught: 0, worms: 0 },
    };

    if (demo) {
      // attract mode: ports start CLOSED and the demo Mapper opens them
      // live behind the menus, like a real arcade cabinet's demo game.
      w.player = makePlayer(w, 0, 0);
      w.demoState = 'play';       // play | clear
      w.demoClearT = 0;
      // a scripted speedrun route + an occasional scripted demo death
      w.demoRoute = buildSnakeRoute(w.rows, w, [0, 0]);
      w.demoRouteIdx = 0;
      w.demoDeath = scriptDemoDeath(w);
      // occasionally the demo hacker knocks a port offline right before the
      // round clears (the Mapper then re-secures it and the run still completes)
      w.demoHack = scriptDemoHack(w);
      // the bot banks a fake score so its ROUND COMPLETE card can taunt you
      w.demoScore = 0;
      w.demoChain = 0;
      PM.UI.demoHiScore(null);      // drop any stale demo-score taunt
      // service packs on the flanks + an occasional scripted disc ride
      w.demoRide = { at: w.elapsed + 3000 + rnd() * 4000, done: false };
      spawnDemoDiscs(w);
      spawnDemoEnemies(w);
      // power-ups appear on a fast attract cadence so the loop shows them off
      w.timers.nextPower = 2500 + rnd() * 2500;
    } else {
      w.player = makePlayer(w, 0, 0);
      // The apex cube is NOT altered by the spawn placement itself — like the
      // original, the Mapper must hop back onto it to open that final port.
      w.player.invuln = 1200;           // brief grace as the level opens
      // The in-canvas READY card (LEVEL n / OPEN ALL n PORTS / READY?) replaces
      // the old DOM banner — it lives on the world so the renderer can draw it.
      w.readyCard = {
        level: lvl,
        total: w.stats.total,
        start: 0,                        // world.elapsed at build time
        duration: C.TIMING.readyPause + C.TIMING.levelBanner,
        // per-round intel for the READY card: whether hackers are live this
        // round (level >= the tier's hackerFrom) and whether ports need two
        // hops (level 2+). The renderer just picks text from these flags.
        hackers: lvl >= d.hackerFrom,
        multiPass: C.multiPass(lvl),
      };
      spawnLevelEnemies(w);
      spawnDiscs(w);
    }
    return w;
  }

  function makePlayer(w, u, v) {
    const ctr = R.cubeCenter(w.geo, u, v);
    return {
      u, v, x: ctr.x, y: ctr.y,
      state: 'idle',                  // idle | hop | fall | ride | dead | gone
      hop: null, fall: null,
      invuln: 0, shield: 0, overclock: 0,
      facing: 'R', chain: 0, idleT: 0,
      deadT: 0,
    };
  }

  function placePlayer(w, p, u, v) {
    const ctr = R.cubeCenter(w.geo, u, v);
    p.u = u; p.v = v; p.x = ctr.x; p.y = ctr.y;
  }

  function spawnLevelEnemies(w) {
    const L = w.level, d = diff;
    // Coily's egg appears shortly after the level opens
    w.timers.wormAt = w.elapsed + 1200;
    // Ugg & Wrongway: purple packets climbing the flanks from the base corners
    spawnBall(w, 'ping', 0, w.rows - 1);
    spawnBall(w, 'pong', w.rows - 1, 0);
    // red packet bouncing down through the pyramid
    if (L >= d.redFrom) spawnBall(w, 'packet', 1, 0);
    // the green freeze ball drifts in periodically
    w.timers.nextGreen = w.elapsed + 8000 + rnd() * 8000;
  }

  function spawnDemoEnemies(w) {
    spawnBall(w, 'ping', 0, w.rows - 1);
    spawnBall(w, 'pong', w.rows - 1, 0);
    spawnBall(w, 'packet', 1, 0);
    spawnWormEgg(w);
    spawnHacker(w);
  }

  // Service packs hover off the pyramid flanks, just like a real round. They
  // sit at rows >= 1 so the demo Mapper can always hop off onto them.
  function spawnDemoDiscs(w) {
    const rows = w.rows;
    const rL = 1 + Math.floor(rnd() * (rows - 2));
    let rR = 1 + Math.floor(rnd() * (rows - 2));
    if (rR === rL) rR = 1 + ((rR + 1) % (rows - 2));
    w.discs.push(makeDisc(w, -1, rL), makeDisc(w, rR, -1));
  }

  function spawnBall(w, type, u, v) {
    const ctr = R.cubeCenter(w.geo, u, v);
    w.enemies.push({
      type, u, v, x: ctr.x, y: ctr.y, phase: rnd() * 6.28,
      state: 'idle', hop: null, fall: null, dead: false,
      facing: 'R', nextT: 0, mode: null, trailT: 0,
    });
  }

  function spawnWormEgg(w) {
    // The egg enters one bounce down the pyramid (not on the Mapper's apex
    // cube) and immediately begins tumbling toward the base.
    const s = rnd() < 0.5;
    const u = s ? 1 : 0, v = s ? 0 : 1;
    const ctr = R.cubeCenter(w.geo, u, v);
    w.enemies.push({
      type: 'worm', mode: 'egg', u, v, x: ctr.x, y: ctr.y, phase: rnd() * 6.28,
      state: 'idle', hop: null, fall: null, dead: false, facing: 'R',
      nextT: 0,
    });
  }

  function spawnHacker(w) {
    // enter mid-pyramid so a demo hacker never sits on the Mapper's apex cube
    const u = Math.max(1, Math.floor(rnd() * (w.rows - 2)) + 1);
    const v = Math.max(1, Math.floor(rnd() * (w.rows - u - 1)) + 1);
    const ctr = R.cubeCenter(w.geo, u, v);
    w.enemies.push({
      type: 'hacker', u, v, x: ctr.x, y: ctr.y, phase: rnd() * 6.28,
      state: 'idle', hop: null, fall: null, dead: false, facing: 'R',
      nextT: 0,   // without this a fresh hacker never clears the hop gate and
                  // would hover forever instead of reverting ports (spawnBall
                  // and spawnWormEgg both set it; this omission was a bug)
      // life scales with the tier — a gamer-tier hacker lingers to keep up the
      // pressure, an easy-tier one disconnects before it can do real damage
      life: C.TIMING.hackerLife * (w.demo ? C.DIFF.normal : diff).hackerLife + rnd() * 8000,
    });
  }

  function spawnDiscs(w) {
    const rows = w.rows;
    const rL = Math.floor(rnd() * (rows - 1));
    let rR = Math.floor(rnd() * (rows - 1));
    if (rR === rL) rR = (rR + 1) % (rows - 1);
    const dL = makeDisc(w, -1, rL);
    const dR = makeDisc(w, rR, -1);
    w.discs.push(dL, dR);
  }

  function makeDisc(w, u, v) {
    const ctr = R.cubeCenter(w.geo, u, v);
    return { u, v, row: u + v, x: ctr.x, y: ctr.y - 6, used: false, visible: true };
  }

  /* ================= timing helpers ================= */

  function hopDur(base) {
    // attract-mode enemies hop at level-1 / NORMAL tuning regardless of the
    // last real game's difficulty, so the demo never looks out of balance
    const lv = (world && world.demo) ? 1 : level;
    const d = (world && world.demo) ? C.DIFF.normal : diff;
    return Math.max(C.ENEMY.minHop, base * d.enemySpeed * Math.pow(C.ENEMY.speedPerLevel, lv - 1));
  }
  function playerHopDur() {
    return world.player.overclock > 0 ? C.TIMING.playerHopOverclock : C.TIMING.playerHop;
  }

  // Hackers run their own hop cadence per difficulty tier — scaled from the
  // baseline ENEMY.hackerHop and NOT the generic enemySpeed scalar, which the
  // packets share and which would wash the tier differences out. The level
  // creep still applies so later rounds feel tighter.
  function hackerHopDur() {
    const lv = (world && world.demo) ? 1 : level;
    const d = (world && world.demo) ? C.DIFF.normal : diff;
    return Math.max(C.ENEMY.minHop, C.ENEMY.hackerHop / d.hackerSpeed * Math.pow(C.ENEMY.speedPerLevel, lv - 1));
  }

  // Vertical offset (above a cube's centre) for floating text, scaled to the
  // cube height so score popups always clear the top face.
  function floatUp(w, extra) {
    return w.geo.hh * 2.1 + (extra || 0);
  }

  /* ================= game flow ================= */

  function startGame(diffId, startLevel) {
    diff = C.DIFF[diffId] || C.DIFF.normal;
    score = 0; lives = diff.lives; level = startLevel || 1;
    nextExtra = C.SCORE.extraLifeFirst;
    resetRunStats();
    hi = Math.max(hi, S.highScore());
    goIdle = 0;
    PM.UI.attractWarn(false);    // clear any stale STARTING IN n countdown
    PM.UI.goPressWarn(false);
    PM.UI.demoHiScore(null);     // clear any demo-score taunt on the title
    if (world) drainWorldFx(world);   // recycle the old game's effects
    world = buildWorld(level, false);
    A.unlock();
    state = 'ready';
    readyT = C.TIMING.readyPause + C.TIMING.levelBanner;
    A.startMusic();
    A.sfx('ready');
    PM.UI.updateHUD();
  }

  function toMenu() {
    state = 'menu';
    menuWorld = menuWorld || buildWorld(1, true);
    // attract-mode soundtrack keeps playing behind the title screen
    A.startMusic();
    menuIdle = 0;               // the 30s attract clock restarts fresh
    goIdle = 0;
    PM.UI.updateHUD();
  }

  // Operator hotkey: jump straight back to the title from anywhere.
  function skipToTitle() {
    if (state !== 'menu') toMenu();
    PM.UI.show('menu');
    menuIdle = 0;
    goIdle = 0;
    PM.UI.goPressWarn(false);   // clear any game-over countdown state
    PM.UI.updateHUD();
  }

  function restart() { startGame(diff.id); }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    I.clearQueue();
    A.sfx('uiBack');
    PM.UI.showPause();
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    I.clearQueue();
    A.sfx('uiSelect');
    PM.UI.hidePause();
  }

  function gameOver() {
    state = 'gameover';
    goIdle = 0;
    A.sfx('gameOver');
    A.stopMusic();
    // round report for the game-over screen — an arcade-style stat rundown
    // covering the WHOLE run: completed levels merged into runStats at each
    // levelClear, plus the current level's partial stats folded in here
    if (!runStats) resetRunStats();
    const s = world ? world.stats : null;
    PM.UI.showGameOver(score, level, diff.label, {
      ports: runStats.ports + (s ? s.changed : 0),
      total: runStats.total + (s ? s.total : 0),
      deaths: runStats.deaths + (s ? s.deaths : 0),
      reSecures: runStats.reSecures + (s ? s.reSecures : 0),
      reSecureBonus: runStats.reSecureBonus + (s ? s.reSecureBonus : 0),
      reSecureBest: Math.max(runStats.reSecureBest, s ? s.reSecureBest : 0),
      chainBest: Math.max(runStats.chainBest, s ? s.chainBest : 0),
      hackersCaught: runStats.hackersCaught + (s ? s.hackersCaught : 0),
      worms: runStats.worms + (s ? s.worms : 0),
      timeMs: runStats.timeMs + (world ? world.elapsed : 0),
    });
  }

  function advanceLevel() {
    level++;
    drainWorldFx(world);          // the cleared world is done — recycle its effects
    world = buildWorld(level, false);
    state = 'ready';
    readyT = C.TIMING.readyPause + C.TIMING.levelBanner;
    A.sfx('ready');
  }

  /* ================= scoring ================= */

  // The quick-combo cap climbs 50 per level (400 → 450 → 500 …) so the
  // escalation arc keeps stretching instead of flattening on deep runs.
  // Exposed as G.reSecureCap() so the HUD readout can never drift from the
  // payout that game.js actually banks.
  function reSecureCap() {
    return C.SCORE.reSecureMax + C.SCORE.reSecureMaxPerLevel * (level - 1);
  }

  function addScore(n, x, y, color, big) {
    if (world.demo) return;
    score += n;
    if (x !== undefined) {
      makeFloat(world, x, y, '+' + n, color || '#ffffff', 1100, { big: !!big });
    }
    if (score >= nextExtra) {
      nextExtra += C.SCORE.extraLifeStep;
      lives = Math.min(9, lives + 1);
      A.sfx('extraLife');
      // y=120 keeps the banner above the centered pyramid's apex
      makeFloat(world, C.VW / 2, 120, STR.floats.extraLife, C.PALETTE.green, 1600, { big: true });
    }
    if (score > hi) hi = score;
  }

  /* ================= player ================= */

  function startHop(p, dir) {
    const [tu, tv] = targetTile(p.u, p.v, dir);
    // off the bottom of the pyramid -> fall
    if (tu + tv >= world.rows) { startFall(p, dir); return; }
    // off the sides -> disc or fall
    if (tu < 0 || tv < 0) {
      const d = world.discs.find(dd => !dd.used && dd.u === tu && dd.v === tv);
      if (d) { startRide(p, d); return; }
      // at the apex there is nowhere further up — block, don't fall
      if (p.u === 0 && p.v === 0) { A.sfx('deny'); return; }
      startFall(p, dir);
      return;
    }
    const from = R.cubeCenter(world.geo, p.u, p.v);
    const to = R.cubeCenter(world.geo, tu, tv);
    p.hop = { from, to, t0: world.elapsed, w0: tGlobal, dur: playerHopDur(), fromR: p.u + p.v, toR: tu + tv, dir };
    p.state = 'hop';
    p.facing = (dir === 'DR' || dir === 'UR') ? 'R' : 'L';
    p.u = tu; p.v = tv;              // logical tile is the target while airborne
    p.idleT = 0;
    A.sfx('hop');
  }

  function startRide(p, d) {
    d.used = true;
    // Coily leaps off the pyramid when the Mapper escapes by disc
    const worm = world.enemies.find(function (e) { return e.type === 'worm' && !e.dead && e.mode === 'worm'; });
    if (worm) {
      const dist = Math.abs(worm.u - p.u) + Math.abs(worm.v - p.v);
      if (dist <= 3) {
        wormFall(worm);
        // hostile traffic is cleared — it re-enters after a few seconds
        for (const e of world.enemies) {
          if (e.dead || e === worm) continue;
          if (e.type === 'ping' || e.type === 'pong' || e.type === 'packet' || e.type === 'freezeball') {
            e.dead = true;
            e.respawnT = 2500 + rnd() * 1500;
          } else if (e.type === 'hacker') {
            e.dead = true;
          }
        }
        world.timers.nextHacker = world.elapsed + 7000 / diff.hackerFreq;
      }
    }
    const from = { x: p.x, y: p.y };
    const to = R.cubeCenter(world.geo, 0, 0);
    p.hop = { from, to, t0: world.elapsed, w0: tGlobal, dur: C.TIMING.discRide, fromR: p.u + p.v, toR: 0, dir: 'ride' };
    p.state = 'ride';
    p.u = 0; p.v = 0;
    p.facing = 'R';
    A.sfx('disc');
  }

  function startFall(p, dir) {
    const from = R.cubeCenter(world.geo, p.u, p.v);
    // falls always exit the visible field — the centered pyramid no longer
    // reaches the screen bottom, so deaths land off-screen as intended
    const to = { x: from.x + (dir === 'DL' ? world.geo.hw * 0.6 : -world.geo.hw * 0.6), y: C.VH + 40 };
    p.fall = { from, to, z: 6, t0: world.elapsed, w0: tGlobal, dur: 900, r: p.u + p.v };
    p.state = 'fall';
    A.sfx('fall');
  }

  function onPlayerLand(p, fromRide) {
    placePlayer(world, p, p.u, p.v);
    const cb = world.cubes[key(p.u, p.v)];
    let pts = 0, changed = false, final = false;

    if (C.multiPass(level)) {
      if (cb.state === 0) { cb.state = 1; pts = C.SCORE.firstChange; changed = true; }
      else if (cb.state === 1) { cb.state = 2; pts = C.SCORE.finalChange; changed = true; final = true; }
    } else {
      // single pass: a reverted (SCANNING) cube re-opens on landing, so a
      // hacker can never permanently lock a level
      if (cb.state === 0 || cb.state === 1) { cb.state = 2; pts = C.SCORE.finalChange; changed = true; final = true; }
    }

    if (changed) {
      cb.flash = 1;
      world.chain++;
      const mult = Math.min(world.chain, C.SCORE.chainCap);
      if (mult > world.stats.chainBest) world.stats.chainBest = mult;   // best-chain for the round report
      const ctr = R.cubeCenter(world.geo, p.u, p.v);
      const totalPts = pts * mult;
      addScore(totalPts, ctr.x, ctr.y - floatUp(world), final ? C.PALETTE.green : C.PALETTE.amber);
      if (mult > 1) {
        makeFloat(world, ctr.x, ctr.y - floatUp(world, 24), PM.STR.fmt(STR.floats.chain, { n: mult }), C.PALETTE.magenta, 800);
      }
      // On multi-pass levels a 1->0 revert needs two landings to fully restore
      // (0->1 then 1->2). Re-anchor the quick window on this FIRST response
      // landing, so an immediate reaction can't lose the +150 just because the
      // finishing trip took a moment. (Single-pass landings and 2->1 reverts
      // re-open in one hop, so the anchor stays on the revert there.)
      if (!final && cb.hacked) cb.hackT = world.elapsed;
      // reclaiming a port the hacker knocked offline gets its own bright
      // chime plus a RE-SECURED bonus — re-securing within the quick window
      // (first response -> final open) pays the higher quick-combo payout,
      // turning the sabotage into a scoring opportunity
      if (final && cb.hacked) {
        cb.hacked = 0;
        A.sfx('reSecure');
        // the amount rides inside the tag (no separate +N float — a chained
        // change already puts its CHAIN ×N line at the same height)
        const quick = cb.hackT !== undefined && world.elapsed - cb.hackT <= C.TIMING.reSecureWindow;
        // The quick payout is a TRUE streak, like the CHAIN multiplier: only
        // consecutive quick reclaims escalate (150 → 200 → 250 … up to the
        // cap), and any slow re-secure resets the ladder back to 150.
        if (quick) world.stats.reSecureStreak++;
        else world.stats.reSecureStreak = 0;
        if (world.stats.reSecureStreak > world.stats.reSecureBest) world.stats.reSecureBest = world.stats.reSecureStreak;   // best-streak for the round report
        const bonus = quick
          ? Math.min(reSecureCap(), C.SCORE.reSecureQuick + (world.stats.reSecureStreak - 1) * C.SCORE.reSecureStep)
          : C.SCORE.reSecure;
        addScore(bonus);
        // tally the round's hacker-reclaim combos for the level-clear card
        world.stats.reSecures++;
        world.stats.reSecureBonus += bonus;
        // a streak indicator mirrors the CHAIN ×N line (magenta, one row up)
        if (quick && world.stats.reSecureStreak > 1) {
          makeFloat(world, ctr.x, ctr.y - floatUp(world, 66), PM.STR.fmt(STR.floats.streak, { n: world.stats.reSecureStreak }), C.PALETTE.magenta, 800);
        }
        makeFloat(world, ctr.x, ctr.y - floatUp(world, 44), PM.STR.fmt(quick ? STR.floats.quickReSecured : STR.floats.reSecured, { n: bonus }), quick ? C.PALETTE.green : C.PALETTE.amber, 1000);
        // after a slow re-secure the ladder has reset — a small cyan teaser
        // shows the next quick reclaim's payout, so the player can see the
        // streak is primed and ready to climb again. (+66 is free here: the
        // STREAK ×N line only fires on quick re-secures.)
        if (!quick) {
          const next = Math.min(reSecureCap(), C.SCORE.reSecureQuick + world.stats.reSecureStreak * C.SCORE.reSecureStep);
          makeFloat(world, ctr.x, ctr.y - floatUp(world, 66), PM.STR.fmt(STR.floats.nextQuick, { n: next }), C.PALETTE.cyan, 1200);
        }
      }
      else A.sfx(final ? 'change2' : 'change1');
      burst(cb.u, cb.v, final ? C.PALETTE.green : C.PALETTE.amber, 10, 2);
      // a level is complete only when every cube is OPEN — on multi-pass
      // levels, only the final transition (to state 2) counts toward that
      if (final) {
        world.stats.changed++;
        if (world.stats.changed >= world.stats.total) { levelClear(); return; }
      }
    } else {
      world.chain = 0;
      // small dust puff on ordinary landings
      burst(p.u, p.v, 'rgba(255,255,255,0.35)', 3, 1);
    }

    // power-up pickup
    for (let i = world.powerups.length - 1; i >= 0; i--) {
      const pu = world.powerups[i];
      if (pu.u === p.u && pu.v === p.v) { pickupPowerup(world, pu); world.powerups.splice(i, 1); }
    }
    // disc unused bonus handled at level clear
    if (fromRide) { addScore(C.SCORE.discRide, p.x, p.y - floatUp(world), C.PALETTE.cyan); }
    checkCollisions();
  }

  /* ================= enemies ================= */

  function updateEnemy(e, dt) {
    if (e.dead) return;

    if (e.type === 'worm') {
      // ---- Coily's egg: a purple ball bouncing DOWN the pyramid ----
      if (e.mode === 'egg') {
        if (e.state === 'hop') {
          if (world.elapsed >= e.hop.t0 + e.hop.dur) {
            placePlayer(world, e, e.u, e.v);
            e.state = 'idle';
            if (e.u + e.v >= world.rows - 1) {
              // the egg reaches the base and hatches into the snake
              e.mode = 'worm';
              if (!world.demo) A.sfx('hatch');
              burst(e.u, e.v, C.PALETTE.worm, 14, 3);
              wormPickHop(e);              // start chasing immediately
            } else {
              e.nextT = 0;                 // keep bouncing down
            }
          }
          return;
        }
        if (e.state === 'idle' && e.nextT === 0) {
          e.nextT = -1;
          eggBounce(e);
        }
        return;
      }
      // ---- Coily the snake: slithers down, tracking the Mapper ----
      if (e.state === 'hop') {
        if (world.elapsed >= e.hop.t0 + e.hop.dur) {
          placePlayer(world, e, e.u, e.v);
          e.state = 'idle';
          e.nextT = 0;
        }
        return;
      }
      if (e.state === 'fall') {
        if (world.elapsed >= e.fall.t0 + e.fall.dur) {
          e.dead = true;
          if (!world.demo) world.timers.wormAt = world.elapsed + C.ENEMY.wormRespawn * diff.wormDelay;
        }
        return;
      }
      if (e.nextT === 0) {
        e.nextT = -1;
        wormPickHop(e);
        return;
      }
      return;
    }

    // ---- flank climbers (Ugg & Wrongway) ----
    if (e.type === 'ping' || e.type === 'pong') {
      if (e.dead) {
        // re-enter from a base corner after a pause
        e.respawnT = (e.respawnT || 4000) - dt;
        if (e.respawnT <= 0) {
          e.dead = false;
          placePlayer(world, e, e.type === 'ping' ? 0 : world.rows - 1, e.type === 'ping' ? world.rows - 1 : 0);
          e.state = 'idle';
          e.nextT = 0;
        }
        return;
      }
      if (e.state === 'hop') {
        if (world.elapsed >= e.hop.t0 + e.hop.dur) {
          placePlayer(world, e, e.u, e.v);
          e.state = 'idle';
          slideStep(e);
        }
        return;
      }
      if (e.state === 'idle') slideStep(e);
      return;
    }

    // ---- bouncing packets (red: deadly / green: freeze ball) ----
    if (e.type === 'packet' || e.type === 'freezeball') {
      if (e.dead) {
        // re-enter from the second row after a pause
        e.respawnT = (e.respawnT || 4000) - dt;
        if (e.respawnT <= 0) {
          e.dead = false;
          const s = rnd() < 0.5;
          placePlayer(world, e, s ? 1 : 0, s ? 0 : 1);
          e.state = 'idle';
          e.nextT = 0;
        }
        return;
      }
      if (e.state === 'hop') {
        if (world.elapsed >= e.hop.t0 + e.hop.dur) {
          placePlayer(world, e, e.u, e.v);
          e.state = 'idle';
          if (e.u + e.v >= world.rows - 1) {
            // reached the base — hops off and re-enters later
            if (!world.demo) A.sfx('uiMove');
            burst(e.u, e.v, e.type === 'packet' ? C.PALETTE.packet : C.PALETTE.greenball, 8, 2);
            e.dead = true;
            e.respawnT = 3800 + rnd() * 3200;
          } else {
            e.nextT = 0;
          }
        }
        return;
      }
      if (e.state === 'idle' && e.nextT === 0) {
        e.nextT = -1;
        packetBounce(e);
      }
      // glow trail
      e.trailT -= dt;
      if (e.trailT <= 0) {
        e.trailT = 80;
        const ctr = R.cubeCenter(world.geo, e.u, e.v);
        const col = e.type === 'packet' ? C.PALETTE.packet : C.PALETTE.greenball;
        world.particles.push(mkP(ctr.x, ctr.y - world.geo.hh * 0.6, 0, 0, 400, col, 'circle', 3));
      }
      return;
    }

    // ---- hacker ----
    if (e.type === 'hacker') {
      e.life -= dt;
      if (e.life <= 0 || e.state === 'fall') {
        if (e.state !== 'fall') hackerLeave(e);
        else if (world.elapsed >= e.fall.t0 + e.fall.dur) e.dead = true;
        return;
      }
      if (e.state === 'hop') {
        if (world.elapsed >= e.hop.t0 + e.hop.dur) {
          placePlayer(world, e, e.u, e.v);
          e.state = 'idle';
          if (!world.demo) revertCube(e.u, e.v);
          if (e.u + e.v >= world.rows - 1) hackerLeave(e);
          else e.nextT = 0;
        }
        return;
      }
      if (e.nextT === 0) {
        e.nextT = -1;
        // telegraph the incoming revert on the landing cube — the glitch ripple
        // only fires when the target is in a state the hacker will actually
        // knock down (SCANNING or OPEN), so the warning never yells false alarms
        const hDir = rnd() < 0.5 ? 'DL' : 'DR';
        const [hu, hv] = targetTile(e.u, e.v, hDir);
        const hcb = world.cubes[key(hu, hv)];
        if (hcb && hcb.state >= 1) hcb.warn = 1;
        enemyHop(e, hDir, hackerHopDur());
      }
    }
  }

  function liveWormCount() {
    let n = 0;
    for (const e of world.enemies) if (e.type === 'worm' && !e.dead && e.mode === 'worm') n++;
    return n;
  }

  function wormPickHop(e) {
    const p = world.player;
    const pr = p && p.state !== 'gone' ? p.u + p.v : e.u + e.v;
    const er = e.u + e.v;
    if (pr <= er - 2) {
      // the Mapper is clearly above — Coily climbs toward the chase
      const dir = pickCloser(e, ['UL', 'UR']);
      if (dir) { enemyHop(e, dir, hopDur(C.ENEMY.wormHop)); return; }
    }
    // otherwise slither down, tracking the Mapper's column
    const dir = pickCloser(e, ['DL', 'DR']);
    if (!dir) { wormFall(e); return; }    // at the base — tumbles off the edge
    enemyHop(e, dir, hopDur(C.ENEMY.wormHop));
  }

  function pickCloser(e, dirs) {
    const p = world.player;
    const px = p && p.state !== 'gone' ? p.x : e.x;
    let best = null, bestD = Infinity;
    for (const dir of dirs) {
      const [tu, tv] = targetTile(e.u, e.v, dir);
      if (tu < 0 || tv < 0 || tu + tv >= world.rows) continue;
      const c = R.cubeCenter(world.geo, tu, tv);
      const d = Math.abs(c.x - px);
      if (d < bestD) { bestD = d; best = dir; }
    }
    return best;
  }

  function eggBounce(e) {
    const dir = rnd() < 0.5 ? 'DL' : 'DR';
    const [tu, tv] = targetTile(e.u, e.v, dir);
    const from = R.cubeCenter(world.geo, e.u, e.v);
    const to = R.cubeCenter(world.geo, tu, tv);
    e.hop = { from, to, t0: world.elapsed, w0: tGlobal, dur: hopDur(C.ENEMY.eggHop), fromR: e.u + e.v, toR: tu + tv };
    e.state = 'hop';
    e.u = tu; e.v = tv;
  }

  function packetBounce(e) {
    const dir = rnd() < 0.5 ? 'DL' : 'DR';
    const [tu, tv] = targetTile(e.u, e.v, dir);
    const from = R.cubeCenter(world.geo, e.u, e.v);
    const to = R.cubeCenter(world.geo, tu, tv);
    e.hop = { from, to, t0: world.elapsed, w0: tGlobal, dur: hopDur(e.type === 'packet' ? C.ENEMY.packetHop : C.ENEMY.greenHop), fromR: e.u + e.v, toR: tu + tv };
    e.state = 'hop';
    e.u = tu; e.v = tv;
  }

  function enemyHop(e, dir, dur) {
    const [tu, tv] = targetTile(e.u, e.v, dir);
    const from = R.cubeCenter(world.geo, e.u, e.v);
    const to = R.cubeCenter(world.geo, tu, tv);
    e.hop = { from, to, t0: world.elapsed, w0: tGlobal, dur, fromR: e.u + e.v, toR: tu + tv };
    e.state = 'hop';
    e.facing = (dir === 'DR') ? 'R' : 'L';
    e.u = tu; e.v = tv;
  }

  function slideStep(e) {
    let tu = e.u, tv = e.v;
    let exit = false;
    if (e.type === 'ping') {
      // left flank, sliding upward toward the apex
      tu = e.u; tv = e.v - 1;
      if (tv < 0) exit = true;
    } else {
      // right flank, sliding upward toward the apex
      tu = e.u - 1; tv = e.v;
      if (tu < 0) exit = true;
    }
    if (exit) {
      // the packet hops off at the apex and re-enters from a base corner later
      if (!world.demo) A.sfx('uiMove');
      burst(e.u, e.v, C.PALETTE.ping, 8, 2);
      e.dead = true;
      e.respawnT = 3800 + rnd() * 3200;
      return;
    }
    const from = R.cubeCenter(world.geo, e.u, e.v);
    const to = R.cubeCenter(world.geo, tu, tv);
    e.hop = { from, to, t0: world.elapsed, w0: tGlobal, dur: hopDur(C.ENEMY.pingHop), fromR: e.u + e.v, toR: tu + tv };
    e.state = 'hop';
    e.facing = tu >= e.u ? 'R' : 'L';
    e.u = tu; e.v = tv;
  }

  function wormFall(e) {
    const from = R.cubeCenter(world.geo, e.u, e.v);
    e.fall = { from, to: { x: from.x, y: C.VH + 40 }, z: 4, t0: world.elapsed, w0: tGlobal, dur: 700, r: e.u + e.v };
    e.state = 'fall';
    if (!world.demo) world.stats.worms++;
    if (!world.demo) A.sfx('wormDie');
    if (!world.demo) addScore(C.SCORE.wormFall, from.x, from.y - floatUp(world), C.PALETTE.worm);
    burst(e.u, e.v, C.PALETTE.worm, 16, 3);
    world.shake = Math.max(world.shake, 6);
  }

  function revertCube(u, v) {
    const cb = world.cubes[key(u, v)];
    // cb.revert drives the on-cube static shimmer as the port drops back to
    // CLOSED — a short fade (~420ms) the renderer reads off the cube itself.
    // cb.hacked tags ground the hacker touched so a later landing that
    // re-opens it can play the distinct re-secured chime instead of the
    // plain change blip.
    // cb.hackT stamps when the sabotage landed, so a fast re-secure can claim
    // the higher quick-combo payout in onPlayerLand
    if (cb.state === 2) { cb.state = 1; cb.flash = 1; cb.revert = 1; cb.hacked = 1; cb.hackT = world.elapsed; world.stats.changed--; A.sfx('hackerRev'); }
    else if (cb.state === 1) { cb.state = 0; cb.flash = 1; cb.revert = 1; cb.hacked = 1; cb.hackT = world.elapsed; A.sfx('hackerRev'); } // 1->0 doesn't un-open anything
  }

  function hackerLeave(e) {
    const from = R.cubeCenter(world.geo, e.u, e.v);
    e.fall = { from, to: { x: from.x, y: C.VH + 40 }, z: 4, t0: world.elapsed, w0: tGlobal, dur: 650, r: e.u + e.v };
    e.state = 'fall';
  }

  function catchHacker(e) {
    if (world.demo) return;
    world.stats.hackersCaught++;
    e.dead = true;
    A.sfx('hackerGet');
    addScore(C.SCORE.hackerCatch, e.x, e.y - floatUp(world), C.PALETTE.hackerEyes);
    burst(e.u, e.v, C.PALETTE.hackerEyes, 12, 3);
    world.timers.nextHacker = world.elapsed + 11000 / diff.hackerFreq;
  }

  function catchFreezeBall(e) {
    if (world.demo) return;
    e.dead = true;
    e.respawnT = 6000 + rnd() * 4000;
    world.freeze = C.TIMING.freezeDur;
    A.sfx('freeze');
    addScore(C.SCORE.greenBall, e.x, e.y - floatUp(world), C.PALETTE.greenball);
    makeFloat(world, e.x, e.y - floatUp(world, 20), STR.floats.frozen, C.PALETTE.greenball, 1100);
    burst(e.u, e.v, C.PALETTE.greenball, 14, 3);
  }

  /* ================= collisions ================= */

  function checkCollisions() {
    const p = world.player;
    if (!p || p.state === 'dead' || p.state === 'gone' || p.state === 'fall' || p.state === 'ride') return;
    for (const e of world.enemies) {
      if (e.dead || e.state === 'fall') continue;
      // Coily's bouncing egg is deadly on contact, like the original ball —
      // dodge it as it tumbles down the pyramid.
      if (e.u !== p.u || e.v !== p.v) continue;
      if (e.type === 'hacker') { catchHacker(e); continue; }
      if (e.type === 'freezeball') {
        if (p.invuln <= 0) catchFreezeBall(e);
        continue;
      }
      if (p.invuln > 0) continue;
      if (p.shield > 0) {
        p.shield = 0;
        p.invuln = C.TIMING.shieldInvuln;
        A.sfx('shield');
        burst(e.u, e.v, C.PALETTE.cyan, 14, 3);
        makeFloat(world, p.x, p.y - 60, STR.floats.blocked, C.PALETTE.cyan, 900);
        return;
      }
      playerDie('enemy');
      return;
    }
  }

  // The broken-signal death tag shared by real deaths and the attract demo —
  // the glitching CAUGHT!/OFFLINE! tag. w is the world (live world for
  // playerDie, menu world for demoPlayerDie). Base-row falls land below the
  // viewport (to.y = from.y + 170), so the tag is clamped back into view.
  function pushDeathTag(w, p, cause) {
    const fx = (p.state === 'fall' && p.fall) ? p.fall.to.x : p.x;
    const fy = Math.min(C.VH - 50,
      (p.state === 'fall' && p.fall) ? p.fall.to.y - floatUp(w) * 0.4 : p.y - floatUp(w));
    makeFloat(w, fx, fy, cause === 'fall' ? STR.floats.offline : STR.floats.caught, C.PALETTE.danger, 1300, { big: true, glitch: true });
  }

  function playerDie(cause) {
    const p = world.player;
    if (world.demo || !p || p.state === 'dead' || p.state === 'gone') return;
    if (cause === 'enemy') A.sfx('death');
    A.sfx('glitchDeath');          // broken-signal sting — same signal-loss character as attract deaths
    world.shake = 16;
    world.flash = 0.85;
    world.flashColor = '#ff4757';
    world.flashVignette = true;  // red edge-vignette, identical to attract deaths
    burst(p.u, p.v, C.PALETTE.playerBody, 22, 4);
    burst(p.u, p.v, C.PALETTE.playerVisor, 14, 3);
    pushDeathTag(world, p, cause);
    p.state = 'dead';
    p.deadT = C.TIMING.respawnDelay;
    world.chain = 0;
    lives--;
    world.stats.deaths++;
    PM.UI.updateHUD();
  }

  /* ================= power-ups ================= */

  function spawnPowerup(w) {
    const keys = Object.keys(w.cubes);
    const pool = keys.filter(k => w.cubes[k].state < 2);
    const src = pool.length ? pool : keys;
    const k = src[(rnd() * src.length) | 0];
    const cb = w.cubes[k];
    const roll = rnd();
    const type = roll < 0.40 ? 'packet' : roll < 0.70 ? 'firewall' : 'overclock';
    w.powerups.push({ type, u: cb.u, v: cb.v, phase: rnd() * 6.28, life: C.TIMING.powerLife });
    const freq = w.demo ? C.DIFF.normal.powerFreq : diff.powerFreq;
    w.timers.nextPower = w.elapsed + C.TIMING.powerSpawnBase / freq * (0.7 + rnd() * 0.6);
  }

  function pickupPowerup(w, pu) {
    const def = C.POWERUPS[pu.type];
    const ctr = R.cubeCenter(w.geo, pu.u, pu.v);
    if (pu.type === 'packet') {
      addScore(def.pts, ctr.x, ctr.y - floatUp(world), def.color);
    } else {
      if (pu.type === 'firewall') { w.player.shield = 1; A.sfx('shield'); }
      else if (pu.type === 'overclock') { w.player.overclock = C.TIMING.overclockDur; A.sfx('overclock'); }
      addScore(def.pts, ctr.x, ctr.y - floatUp(world), def.color);
    }
    A.sfx('powerup');
    makeFloat(world, ctr.x, ctr.y - floatUp(world, 22), def.label, def.color, 1100);
    burst(pu.u, pu.v, def.color, 12, 2);
  }

  /* ================= particles ================= */

  function mkP(x, y, vx, vy, life, color, shape, size) {
    const p = partPool.pop() || {};
    p.alive = true;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
    p.color = color;
    p.shape = shape || 'rect';
    p.size = size || 4;
    p.rot = rnd() * 6.28;
    return p;
  }

  // Pooled float factory — clears every field the renderer reads (x, y, text,
  // color, life, maxLife, big, glitch) so a reused object can never carry
  // stale state from a previous tag.
  function makeFloat(w, x, y, text, color, life, opts) {
    const f = floatPool.pop() || {};
    f.alive = true;
    f.x = x; f.y = y; f.text = text; f.color = color;
    f.life = life; f.maxLife = life;
    f.big = !!(opts && opts.big);
    f.glitch = !!(opts && opts.glitch);
    w.floats.push(f);
    return f;
  }

  // Dead particles/floats return to their pool; removal from the world's list
  // is a swap-pop (order-independent — the renderer draws each independently).
  function killParticle(w, i) {
    const p = w.particles[i];
    if (!p.alive) return;   // already released — never pool an object twice
    p.alive = false;
    partPool.push(p);
    w.particles[i] = w.particles[w.particles.length - 1];
    w.particles.pop();
  }
  function killFloat(w, i) {
    const f = w.floats[i];
    if (!f.alive) return;   // already released — never pool an object twice
    f.alive = false;
    floatPool.push(f);
    w.floats[i] = w.floats[w.floats.length - 1];
    w.floats.pop();
  }

  // Return every live effect to the pools before a world is discarded (level
  // transitions rebuild worlds — without this a fresh pyramid's first bursts
  // would reallocate instead of reusing).
  function drainWorldFx(w) {
    for (const p of w.particles) { p.alive = false; partPool.push(p); }
    for (const f of w.floats) { f.alive = false; floatPool.push(f); }
    w.particles.length = 0;
    w.floats.length = 0;
  }

  function burst(u, v, color, n, power) {
    const ctr = R.cubeCenter(world.geo, u, v);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const sp = (0.03 + rnd() * 0.09) * power * 100;
      world.particles.push(mkP(ctr.x, ctr.y - world.geo.hh * 0.5, Math.cos(a) * sp, Math.sin(a) * sp - 40, 400 + rnd() * 300, color, 'rect', 3 + rnd() * 3));
    }
  }

  /* ================= level clear ================= */

  function levelClear() {
    if (state === 'levelclear') return;   // re-entry guard (also protects the runStats merge)
    state = 'levelclear';
    clearT = C.TIMING.levelClearPause;
    A.sfx('levelClear');
    world.levelFlash = 1;
    // merge the completed level into the run accumulator (counts sum, bests max)
    runStats.ports += world.stats.changed;
    runStats.total += world.stats.total;
    runStats.deaths += world.stats.deaths;
    runStats.reSecures += world.stats.reSecures;
    runStats.reSecureBonus += world.stats.reSecureBonus;
    runStats.reSecureBest = Math.max(runStats.reSecureBest, world.stats.reSecureBest);
    runStats.chainBest = Math.max(runStats.chainBest, world.stats.chainBest);
    runStats.hackersCaught += world.stats.hackersCaught;
    runStats.worms += world.stats.worms;
    runStats.timeMs += world.elapsed;
    // The in-canvas LEVEL n CLEAR card owns the bonus presentation now: the
    // renderer reads this breakdown and draws it with the RGB border, and the
    // old floating LEVEL BONUS / PERFECT ROUND! popups are gone (the card
    // would cover them anyway).
    const base = Math.min(C.SCORE.levelBase + C.SCORE.levelPer * (level - 1), C.SCORE.levelCap);
    const unused = world.discs.filter(d => !d.used).length;
    const unusedBonus = unused * C.SCORE.discUnused;
    const perfect = world.stats.deaths === 0 ? C.SCORE.perfectBonus : 0;
    const bonus = base + unusedBonus + perfect;
    world.clearCard = {
      start: world.elapsed,
      duration: C.TIMING.levelClearPause,
      level, base, unused, unusedBonus, perfect, total: bonus,
      // the round's hacker-reclaim tally (combos already banked during play)
      reSecures: world.stats.reSecures, reSecureBonus: world.stats.reSecureBonus,
    };
    addScore(bonus);   // bank the payout — the card shows the breakdown
    // confetti erupts from the lower pyramid so it frames the in-canvas card
    // from below (the panel covers the apex area during the celebration)
    const baseW = (world.rows - 1) * world.geo.hw;
    const gy = world.geo.by + (world.rows - 1) * world.geo.hh;
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const sp = (0.02 + rnd() * 0.1) * 120;
      const col = [C.PALETTE.green, C.PALETTE.cyan, C.PALETTE.magenta, C.PALETTE.amber][i % 4];
      world.particles.push(mkP(
        world.geo.cx + (rnd() - 0.5) * baseW * 1.4,
        gy + 10 + rnd() * 60,
        Math.cos(a) * sp, Math.sin(a) * sp - 60,
        1400, col, 'rect', 4 + rnd() * 4
      ));
    }
  }

  /* ================= update ================= */

  function updateWorld(dt) {
    world.elapsed += dt;
    const p = world.player;

    // timers
    if (state === 'playing') {
      world.freeze = Math.max(0, world.freeze - dt);
      spawnTimers();
    }

    // player
    if (p && p.state !== 'gone') {
      if (p.state === 'dead') {
        p.deadT -= dt;
        if (p.deadT <= 0) {
          if (lives > 0) {
            placePlayer(world, p, 0, 0);
            p.state = 'idle';
            p.invuln = C.TIMING.invuln;
            p.shield = 0;
            p.overclock = 0;
          } else {
            p.state = 'gone';
            gameOver();
          }
        }
      } else if (state === 'playing') {
        if (p.state === 'hop' || p.state === 'ride') {
          if (world.elapsed >= p.hop.t0 + p.hop.dur) {
            p.state = 'idle';
            onPlayerLand(p, p.hop.dir === 'ride');
            // chain-hopping: held keys start the next hop immediately
            const nd = I.consumeDir() || I.heldDir();
            if (nd && p.state === 'idle' && world && state === 'playing' && lives > 0) startHop(p, nd);
          }
        } else if (p.state === 'fall') {
          if (world.elapsed >= p.fall.t0 + p.fall.dur) playerDie('fall');
        } else if (p.state === 'idle') {
          p.invuln = Math.max(0, p.invuln - dt);
          p.overclock = Math.max(0, p.overclock - dt);
          p.idleT += dt;
          if (p.idleT > 6500 && rnd() < dt * 0.004) {
            makeFloat(world, p.x, p.y - floatUp(world), STR.floats.glitch, C.PALETTE.magenta, 900);
            p.idleT = 0;
          }
          const dir = I.consumeDir() || I.heldDir();
          if (dir) startHop(p, dir);
        }
      }
    }

    // enemies (frozen or not on ready/levelclear)
    if (state === 'playing' && world.freeze <= 0) {
      for (const e of world.enemies) updateEnemy(e, dt);
      checkCollisions(); // catches enemies landing on the player
    }
    // worm egg spawn timer (also on ready so level 2+ starts with an egg ready)
    if (state === 'ready' || state === 'playing') {
      if (world.timers.wormAt !== undefined && world.elapsed >= world.timers.wormAt && !world.demo) {
        const eggs = world.enemies.filter(e => e.type === 'worm' && e.mode === 'egg' && !e.dead).length;
        const maxW = (level >= 4 || diff.enemyCount >= 1.35) ? 2 : 1;
        if (eggs + liveWormCount() < maxW) {
          spawnWormEgg(world);
          world.timers.wormAt = world.elapsed + C.ENEMY.wormRespawn * diff.wormDelay;
        } else {
          world.timers.wormAt = world.elapsed + 2000;
        }
      }
      // hackers
      if (level >= diff.hackerFrom && world.timers.nextHacker !== undefined && world.elapsed >= world.timers.nextHacker) {
        const hd = world.demo ? C.DIFF.normal : diff;
        const active = world.enemies.filter(e => e.type === 'hacker' && !e.dead).length;
        if (active < hd.maxHackers) {
          spawnHacker(world);
          world.timers.nextHacker = world.elapsed + (11000 + rnd() * 6000) / hd.hackerFreq;
        } else {
          world.timers.nextHacker = world.elapsed + 3000 / hd.hackerFreq;
        }
      }
      // green freeze ball
      if (level >= diff.greenFrom && world.timers.nextGreen !== undefined && world.elapsed >= world.timers.nextGreen) {
        const has = world.enemies.some(e => e.type === 'freezeball' && !e.dead);
        if (!has) {
          const s = rnd() < 0.5;
          spawnBall(world, 'freezeball', s ? 1 : 0, s ? 0 : 1);
        }
        world.timers.nextGreen = world.elapsed + 9000 + rnd() * 8000;
      }
    }

    // power-ups
    for (let i = world.powerups.length - 1; i >= 0; i--) {
      const pu = world.powerups[i];
      pu.life -= dt;
      if (pu.life <= 0) {
        const ctr = R.cubeCenter(world.geo, pu.u, pu.v);
        world.particles.push(mkP(ctr.x, ctr.y - world.geo.hh - 14, 0, -30, 350, C.POWERUPS[pu.type].color, 'circle', 3));
        world.powerups.splice(i, 1);
      }
    }

    // particles & floats
    for (let i = world.particles.length - 1; i >= 0; i--) {
      const pt = world.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt * 0.06;
      pt.y += pt.vy * dt * 0.06;
      pt.vy += 0.35 * dt * 0.06;
      if (pt.life <= 0) killParticle(world, i);
    }
    for (let i = world.floats.length - 1; i >= 0; i--) {
      const f = world.floats[i];
      f.life -= dt;
      f.y -= dt * 0.03;
      if (f.life <= 0) killFloat(world, i);
    }

    // cube flashes + hacker-revert shimmer
    for (const k in world.cubes) {
      const cb = world.cubes[k];
      if (cb.flash > 0) cb.flash = Math.max(0, cb.flash - dt / 450);
      if (cb.revert > 0) cb.revert = Math.max(0, cb.revert - dt / 420);
      if (cb.warn > 0) cb.warn = Math.max(0, cb.warn - dt / 450);
    }

    // juice decay
    world.shake = Math.max(0, world.shake - dt * 0.045);
    world.flash = Math.max(0, world.flash - dt * 0.002);
    world.levelFlash = Math.max(0, world.levelFlash - dt / 1200);
  }

  function spawnTimers() {
    // power-up spawner
    if (world.elapsed >= world.timers.nextPower) {
      if (world.powerups.length < 1) spawnPowerup(world);
      else world.timers.nextPower = world.elapsed + 3000;
    }
  }

  /* ================= demo (attract) mode ================= */

  // ---- scripted speedrun route ----------------------------------------------
  // A deterministic serpentine path: the demo Mapper sweeps the pyramid in
  // long zigzag bands (like a Q*Bert speedrun), hopping onto ports that are
  // still CLOSED. Dead ends step toward the nearest remaining closed port so
  // the round always completes.
  function buildSnakeRoute(rows, w, start) {
    const k = function (u, v) { return u + ',' + v; };
    const seen = new Set();
    // seed with already-OPEN ports so the snake only sweeps what remains
    for (const kk in w.cubes) { if (w.cubes[kk].state === 2) seen.add(kk); }
    let u = start[0], v = start[1];
    const route = [[u, v]];
    let pass = 0, guard = 0;
    while (guard++ < rows * rows * 4) {
      seen.add(k(u, v));
      if (seen.size >= w.stats.total) break;
      // alternate the sweep direction every few hops for the snake zigzag
      const dirs = pass % 2 === 0 ? ['DL', 'DR', 'UR', 'UL'] : ['DR', 'DL', 'UL', 'UR'];
      let next = null;
      for (const d of dirs) {
        const tu = u + (d === 'DR' ? 1 : d === 'UL' ? -1 : 0);
        const tv = v + (d === 'DL' ? 1 : d === 'UR' ? -1 : 0);
        if (tu < 0 || tv < 0 || tu + tv >= rows) continue;
        if (!seen.has(k(tu, tv))) { next = [tu, tv]; break; }
      }
      if (!next) {
        // dead end — step one axis toward the nearest unvisited port
        let best = null, bd = Infinity;
        for (let r = 0; r < rows; r++) {
          for (let a = 0; a <= r; a++) {
            const cu = a, cv = r - a;
            if (seen.has(k(cu, cv))) continue;
            const d = Math.abs(cu - u) + Math.abs(cv - v);
            if (d < bd) { bd = d; best = [cu, cv]; }
          }
        }
        if (!best) break;
        if (best[0] !== u) u += Math.sign(best[0] - u);
        else if (best[1] !== v) v += Math.sign(best[1] - v);
        else break;
        pass++;
        route.push([u, v]);
        continue;
      }
      u = next[0]; v = next[1];
      route.push([u, v]);
      if (route.length % 7 === 0) pass++;
    }
    return route;
  }

  // Which hop direction moves from (u,v) onto the adjacent tile (tu,tv)?
  function hopDirTo(u, v, tu, tv) {
    if (tu === u + 1 && tv === v) return 'DR';
    if (tu === u && tv === v + 1) return 'DL';
    if (tu === u - 1 && tv === v) return 'UL';
    if (tu === u && tv === v - 1) return 'UR';
    return null;
  }

  // Occasional scripted demo death: ~2/3 of rounds end with the Mapper either
  // caught by hostile traffic or hopping off the pyramid, then respawning.
  function scriptDemoDeath(w) {
    if (rnd() < 0.35) return null;
    const frac = 0.5 + rnd() * 0.35;
    return {
      at: w.elapsed + w.stats.total * 250 * frac,
      type: rnd() < 0.5 ? 'fall' : 'catch',
    };
  }

  // Occasional scripted hacker showcase (~45% of rounds): right before the
  // round clears, a demo hacker knocks one port offline with the static
  // shimmer, then the Mapper re-secures it so the speedrun still completes.
  function scriptDemoHack(w) {
    if (rnd() < 0.55) return null;
    return { triggered: false, target: null, done: false };
  }

  // A scripted attract-mode death — a brief red-vignette flash, a glitching
  // OFFLINE!/CAUGHT! tag, then a dramatic burst + respawn, no score.
  function demoPlayerDie(cause) {
    const w = menuWorld;
    const p = w.player;
    if (!p || p.state === 'dead' || p.state === 'gone') return;
    A.sfx('glitchDeath');          // quiet broken-signal sting for the attract death
    w.shake = 14;
    w.flash = 0.8;
    w.flashColor = '#ff4757';
    w.flashVignette = true;      // render the flash as a red edge-vignette
    const prevWorld = world; world = w;
    burst(p.u, p.v, C.PALETTE.playerBody, 20, 4);
    burst(p.u, p.v, C.PALETTE.playerVisor, 12, 3);
    world = prevWorld;
    pushDeathTag(w, p, cause);
    p.state = 'dead';
    p.deadT = 1400;
    w.demoDeath = null;          // one scripted death per round
  }

  // A scripted disc ride: the Mapper hops off the flank onto a service pack
  // and rides it to the apex, showcasing the escape mechanic.
  function demoRide(p, d) {
    const w = menuWorld;
    d.used = true;
    d.respawnT = 14000;            // a fresh pack returns later in the round
    const from = { x: p.x, y: p.y };
    const to = R.cubeCenter(w.geo, 0, 0);
    p.hop = { from, to, t0: w.elapsed, w0: tGlobal, dur: C.TIMING.discRide, fromR: p.u + p.v, toR: 0, dir: 'ride' };
    p.state = 'ride';
    p.u = 0; p.v = 0;
    p.facing = 'R';
    makeFloat(w, from.x, from.y - floatUp(w), STR.floats.servicePack, C.PALETTE.cyan, 1100);
  }

  // Is the demo Mapper on a cube adjacent to a live service pack?
  function approachDisc(w, p) {
    for (const d of w.discs) {
      if (d.used || !d.visible) continue;
      // left pack (-1, r): hop UL from (0, r) · right pack (r, -1): hop UR from (r, 0)
      if (d.u === -1 && p.u === 0 && p.v === d.v) return d;
      if (d.v === -1 && p.v === 0 && p.u === d.u) return d;
    }
    return null;
  }

  // Attract-mode power-up pickup (silent — the demo stays quiet).
  function demoPickupPowerup(w, pu) {
    const def = C.POWERUPS[pu.type];
    const ctr = R.cubeCenter(w.geo, pu.u, pu.v);
    if (pu.type === 'firewall') { w.player.shield = 1; }
    else if (pu.type === 'overclock') { w.player.overclock = C.TIMING.overclockDur; }
    w.demoScore += def.pts;       // pickups count toward the bot's fake score
    makeFloat(w, ctr.x, ctr.y - floatUp(w, 22), def.label, def.color, 1100);
    const prev = world; world = w;
    burst(pu.u, pu.v, def.color, 12, 2);
    world = prev;
  }

  // A firewall shield pops instead of the scripted death — the attract loop
  // shows off the FIREWALL mechanic.
  function demoShieldBlock(w, p) {
    p.shield = 0;
    p.invuln = C.TIMING.shieldInvuln;
    w.demoDeath = null;            // the "death" was absorbed
    const prev = world; world = w;
    burst(p.u, p.v, C.PALETTE.cyan, 14, 3);
    world = prev;
    makeFloat(w, p.x, p.y - floatUp(w), STR.floats.blocked, C.PALETTE.cyan, 900);
  }

  // The attract-mode Mapper follows its scripted speedrun route, dies on cue
  // occasionally, and mirrors real gameplay behind the title screen.
  function updateDemoPlayer(dt) {
    const w = menuWorld;
    const p = w.player;
    if (!p) return;
    // invulnerability / overclock tick down in attract mode too, or the
    // Mapper would blink forever and catches could never fire again
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.overclock > 0) p.overclock = Math.max(0, p.overclock - dt);
    if (p.state === 'dead') {
      p.deadT -= dt;
      if (p.deadT <= 0) {
        // respawn at the apex and resume the snake on the remaining ports
        placePlayer(w, p, 0, 0);
        p.state = 'idle';
        p.invuln = 1000;
        p.shield = 0;
        p.overclock = 0;
        w.demoRoute = buildSnakeRoute(w.rows, w, [0, 0]);
        w.demoRouteIdx = 0;
        w.demoDeath = null;      // one scripted death per round is plenty
      }
      return;
    }
    if (p.state === 'fall') {
      if (w.elapsed >= p.fall.t0 + p.fall.dur) demoPlayerDie('fall');
      return;
    }
    if (p.state === 'hop' || p.state === 'ride') {
      if (w.elapsed >= p.hop.t0 + p.hop.dur) {
        placePlayer(w, p, p.u, p.v);
        p.state = 'idle';
        demoLand(p);
        // scripted catch: hostile traffic shares this cube while a death is due
        if (w.demoState === 'play' && p.invuln <= 0 && w.demoDeath && w.elapsed >= w.demoDeath.at) {
          const got = w.enemies.some(function (e) {
            return !e.dead && e.state !== 'fall' && e.type !== 'hacker' && e.type !== 'freezeball' &&
                   e.u === p.u && e.v === p.v;
          });
          if (got) {
            if (p.shield > 0) demoShieldBlock(w, p);
            else demoPlayerDie('enemy');
          }
        }
      }
      return;
    }
    const dir = demoPickDir(p);
    if (dir) demoHop(p, dir);
  }

  function demoPickDir(p) {
    const w = menuWorld;
    // scripted fall: when a fall death is due and the Mapper reaches the
    // bottom row, hop off the edge for drama
    if (w.demoDeath && w.demoDeath.type === 'fall' && w.elapsed >= w.demoDeath.at && p.u + p.v === w.rows - 1) {
      return rnd() < 0.5 ? 'DL' : 'DR';
    }
    // scripted disc ride: hop off the flank onto a service pack
    if (w.demoRide && !w.demoRide.done && w.elapsed >= w.demoRide.at) {
      const d = approachDisc(w, p);
      if (d) {
        w.demoRide.done = true;
        return d.u === -1 ? 'UL' : 'UR';
      }
    }
    // power-up diversion: when a pickup is a hop or two away, grab it
    if (w.powerups.length > 0) {
      const pu = w.powerups[0];
      const dist = Math.abs(pu.u - p.u) + Math.abs(pu.v - p.v);
      if (dist <= 2) {
        let best = null, bd = Infinity;
        for (const dd of ['DL', 'DR', 'UL', 'UR']) {
          const [tu, tv] = targetTile(p.u, p.v, dd);
          if (tu < 0 || tv < 0 || tu + tv >= w.rows) continue;
          // avoid hopping onto hostile traffic (looks better in attract mode)
          const busy = w.enemies.some(function (e) { return !e.dead && e.u === tu && e.v === tv; });
          if (busy) continue;
          const nd = Math.abs(tu - pu.u) + Math.abs(tv - pu.v);
          if (nd < bd) { bd = nd; best = dd; }
        }
        if (best) return best;
      }
    }
    // snake route: follow the scripted speedrun path step by step
    const route = w.demoRoute;
    if (route && w.demoRouteIdx < route.length) {
      const step = route[w.demoRouteIdx];
      const dir = hopDirTo(p.u, p.v, step[0], step[1]);
      if (dir) { w.demoRouteIdx++; return dir; }
      // the bot drifted off the route (e.g. after a respawn) — rebuild from here
      w.demoRoute = buildSnakeRoute(w.rows, w, [p.u, p.v]);
      w.demoRouteIdx = 0;
      if (w.demoRoute.length > 1) {
        const s2 = w.demoRoute[1];
        w.demoRouteIdx = 1;
        return hopDirTo(p.u, p.v, s2[0], s2[1]);
      }
      return null;
    }
    // fallback: greedy sweep of the remaining CLOSED ports (never leaves the
    // pyramid, avoids enemy-occupied cubes)
    const dirs = ['DL', 'DR', 'UL', 'UR'];
    const valid = dirs.filter(function (d) {
      const [tu, tv] = targetTile(p.u, p.v, d);
      return tu >= 0 && tv >= 0 && tu + tv < w.rows;
    });
    // first pass: prefer ports still CLOSED so the pyramid fills with colour
    const closed = valid.filter(function (d) {
      const [tu, tv] = targetTile(p.u, p.v, d);
      const cb = w.cubes[key(tu, tv)];
      return cb && cb.state === 0;
    });
    const pool = closed.length ? closed : valid;
    // avoid stepping onto a cube an enemy is occupying (looks better)
    const clear = pool.filter(function (d) {
      const [tu, tv] = targetTile(p.u, p.v, d);
      return !w.enemies.some(function (e) { return !e.dead && e.u === tu && e.v === tv; });
    });
    const src = clear.length ? clear : pool;
    return src[Math.floor(rnd() * src.length)] || null;
  }

  function demoHop(p, dir) {
    const w = menuWorld;
    const [tu, tv] = targetTile(p.u, p.v, dir);
    const from = R.cubeCenter(w.geo, p.u, p.v);
    // off the side: ride a service-pack disc if one is waiting
    if (tu < 0 || tv < 0) {
      const d = w.discs.find(function (dd) { return !dd.used && dd.visible && dd.u === tu && dd.v === tv; });
      if (d) { demoRide(p, d); return; }
      return; // no disc — stay put (defensive; scripted dirs never do this)
    }
    // off the bottom: only a scripted fall may leave the pyramid — anything
    // else stays put so the demo Mapper can never fall unintentionally
    if (tu + tv >= w.rows) {
      if (!(w.demoDeath && w.demoDeath.type === 'fall' && w.elapsed >= w.demoDeath.at)) return;
      const to = { x: from.x + (dir === 'DL' ? w.geo.hw * 0.6 : -w.geo.hw * 0.6), y: C.VH + 40 };
      p.fall = { from, to, z: 6, t0: w.elapsed, w0: tGlobal, dur: 850, r: p.u + p.v };
      p.state = 'fall';
      return;
    }
    const to = R.cubeCenter(w.geo, tu, tv);
    p.hop = {
      from, to, t0: w.elapsed, w0: tGlobal,
      dur: p.overclock > 0 ? C.TIMING.playerHopOverclock : C.TIMING.playerHop,
      fromR: p.u + p.v, toR: tu + tv, dir,
    };
    p.state = 'hop';
    p.facing = (dir === 'DR' || dir === 'UR') ? 'R' : 'L';
    p.u = tu; p.v = tv;
  }

  function demoLand(p) {
    const w = menuWorld;
    const cb = w.cubes[key(p.u, p.v)];
    if (cb && cb.state === 0) {
      cb.state = 2;
      cb.flash = 1;
      // reclaiming the demo hacker's revert — the re-secured chime echoes a
      // real player's reclaim (the showcase's broken-signal burst is audible)
      if (cb.hacked) { cb.hacked = 0; A.sfx('reSecure'); }
      w.stats.changed++;
      // the bot banks a fake score (chain bonuses and all), so the clear card
      // can hang a believable hi-score over your head
      w.demoChain++;
      const mult = Math.min(w.demoChain, C.SCORE.chainCap);
      w.demoScore += C.SCORE.finalChange * mult;
      const prev = world; world = w;
      burst(p.u, p.v, C.PALETTE.green, 10, 2);
      world = prev;
      if (w.stats.changed >= w.stats.total) demoRoundClear();
    } else {
      w.demoChain = 0;
    }
    // power-up pickup
    for (let i = w.powerups.length - 1; i >= 0; i--) {
      const pu = w.powerups[i];
      if (pu.u === p.u && pu.v === p.v) {
        demoPickupPowerup(w, pu);
        w.powerups.splice(i, 1);
      }
    }
  }

  // All ports open: hold a title-card moment, then spin up a fresh round.
  function demoRoundClear() {
    const w = menuWorld;
    if (w.demoState === 'clear') return;   // already celebrating — don't re-burst
    w.demoState = 'clear';
    w.demoClearT = 3200;
    w.levelFlash = 1;
    w.demoCardStart = w.elapsed;   // the renderer pops the card in from here
    w.demoScoreShown = 0;          // the HI-SCORE rolls up from 000000 as the card lands
    w.demoScoreTickT = 0;
    // finish the bot's fake run with the same level bonus a real clear pays
    w.demoScore += Math.min(C.SCORE.levelBase + C.SCORE.levelPer * (w.level - 1), C.SCORE.levelCap);
    const unused = w.discs.filter(d => !d.used).length;
    w.demoScore += unused * C.SCORE.discUnused;
    // taunt: hang the bot's score on the title HI-SCORE marquee for the card
    PM.UI.demoHiScore(w.demoScore);
    // rain green/cyan/magenta confetti down the cleared pyramid, timed to the
    // card's pop-in — particles draw behind the near-opaque panel, so the bits
    // that start above it slip out from under the card as they fall
    const baseW = (w.rows - 1) * w.geo.hw;
    const top = w.geo.by - w.geo.hh;               // apex row
    const bot = w.geo.by + (w.rows - 1) * w.geo.hh; // base row
    const cols = [C.PALETTE.green, C.PALETTE.cyan, C.PALETTE.magenta];
    for (let i = 0; i < 70; i++) {
      w.particles.push(mkP(
        w.geo.cx + (rnd() - 0.5) * baseW * 1.24,
        top + rnd() * (bot - top + 30),
        (rnd() - 0.5) * 1.8,               // light sideways sway
        1.0 + rnd() * 2.2,                 // constant fall (demo has no gravity)
        2000 + rnd() * 1100,               // rain spans most of the 3.2s card
        cols[(rnd() * 3) | 0],
        'rect', 3 + rnd() * 3
      ));
    }
    // the ROUND COMPLETE card itself is drawn in-canvas by the renderer
    // (big green pixel text, RGB-cycling border, the bot's score underneath)
  }

  // ---- scripted hacker-revert showcase --------------------------------------
  // Drives the showcase: fires when only a handful of ports remain, spawns a
  // demo hacker, hops it to a visible open port, knocks that port back to
  // CLOSED with the same static shimmer + modem sting as a real revert, then
  // the Mapper's greedy sweep re-opens it and the clear card still lands.
  function demoHackTick(w, dt) {
    const hk = w.demoHack;
    if (hk.done) return;
    if (!hk.triggered) {
      // fire when the round is genuinely near its end (and has been going a
      // while, so 'nearly done' can't be a false early read)
      if (w.elapsed < 6000 || w.stats.changed < 5 || w.stats.changed < w.stats.total - 3) return;
      // target a visible, already-open port (rows 1-4 — never the apex, so
      // the hacker can't sit on the Mapper's respawn cube)
      const open = [];
      for (const kk in w.cubes) {
        const cb = w.cubes[kk];
        if (cb.state === 2 && cb.r >= 1 && cb.r <= 4) open.push(cb);
      }
      if (!open.length) { hk.done = true; return; }   // nothing to show — skip
      const t = open[(rnd() * open.length) | 0];
      hk.target = [t.u, t.v];
      hk.triggered = true;
      spawnHacker(w);
      const e = w.enemies[w.enemies.length - 1];
      e.hackTarget = hk.target;        // excluded from the random-walk loop below
      e.life = 1e9;                    // never expires mid-showcase
      // attract viewers to the mechanic: a small broken-signal HACKER DETECTED
      // alert flashes near the apex (a fixed landmark — the spawn cube itself
      // is random mid-pyramid) plus a danger burst where the hacker landed
      const apex = R.cubeCenter(w.geo, 0, 0);
      makeFloat(w, apex.x, apex.y - floatUp(w, 20), STR.floats.hackerDetected, C.PALETTE.danger, 1000, { glitch: true });
      const prev = world; world = w;
      burst(e.u, e.v, C.PALETTE.danger, 10, 2);
      world = prev;
      return;
    }
    const e = w.enemies.find(function (x) { return x.hackTarget; });
    if (!e) { hk.done = true; return; }              // lost — bail quietly
    // keep the lock-on ripple lit on the doomed port for the whole approach —
    // re-armed every tick so the 450ms fade can't outrun the march
    const warnCb = w.cubes[key(hk.target[0], hk.target[1])];
    if (warnCb) warnCb.warn = 1;
    // already standing on the target (e.g. the spawn landed there) — revert now.
    // Gate on idle: u/v update to the target at hop START, so mid-hop the
    // coords match without the hop having landed — reverting then would
    // truncate the final arc. Only an idle hacker on the target is 'arrived'.
    if (e.state === 'idle' && e.u === hk.target[0] && e.v === hk.target[1]) { demoHackRevert(e); hk.done = true; return; }
    if (e.state === 'hop') {
      if (w.elapsed >= e.hop.t0 + e.hop.dur) {
        placePlayer(w, e, e.u, e.v);
        e.state = 'idle';
        if (e.u === hk.target[0] && e.v === hk.target[1]) { demoHackRevert(e); hk.done = true; }
        else e.nextT = 0;
      }
      return;
    }
    if (e.state === 'fall') {
      if (w.elapsed >= e.fall.t0 + e.fall.dur) { e.dead = true; e.hackTarget = null; }
      return;
    }
    if (e.nextT === 0) {
      e.nextT = -1;
      const dir = hackDirToward(w, e, hk.target);
      if (dir) {
        const prev = world; world = w;
        enemyHop(e, dir, hackerHopDur());   // same cadence model as live hackers
        world = prev;
      } else {
        e.dead = true; e.hackTarget = null; hk.done = true;   // unreachable — abort
      }
    }
  }

  // One-tile hop toward the target, favouring the longer axis so the approach
  // reads as a purposeful advance (never leaves the pyramid).
  function hackDirToward(w, e, t) {
    const du = t[0] - e.u, dv = t[1] - e.v;
    const cands = [];
    if (du > 0) cands.push('DR'); else if (du < 0) cands.push('UL');
    if (dv > 0) cands.push('DL'); else if (dv < 0) cands.push('UR');
    if (Math.abs(dv) > Math.abs(du) && cands.length === 2) cands.reverse();
    for (const d of cands) {
      const [tu, tv] = targetTile(e.u, e.v, d);
      if (tu >= 0 && tv >= 0 && tu + tv < w.rows) return d;
    }
    return null;
  }

  // The payoff: the port drops OPEN -> CLOSED in one shot with the white pop,
  // the on-cube static shimmer and the modem-sting audio. It goes all the way
  // to CLOSED (not the 2->1 intermediate) so the demo Mapper's greedy sweep
  // can re-open it and the speedrun still completes.
  function demoHackRevert(e) {
    const w = menuWorld;
    const cb = w.cubes[key(e.u, e.v)];
    if (!cb || cb.state !== 2) { e.dead = true; e.hackTarget = null; return; }
    cb.state = 0;
    cb.flash = 1;
    cb.revert = 1;                  // renderer draws the static shimmer on the cube
    cb.hacked = 1;                  // the Mapper's re-open will play the re-secured chime
    w.stats.changed--;
    A.sfx('hackerRev');             // the broken-signal modem sweep (deaths are audible too)
    const ctr = R.cubeCenter(w.geo, e.u, e.v);
    const prev = world; world = w;
    burst(e.u, e.v, C.PALETTE.danger, 10, 2);
    hackerLeave(e);                 // the hacker disconnects off the pyramid
    world = prev;
    makeFloat(w, ctr.x, ctr.y - floatUp(w), STR.floats.portOffline, C.PALETTE.danger, 1300, { glitch: true });
    e.hackTarget = null;
  }

  function updateDemo(dt) {
    if (!menuWorld) { menuWorld = buildWorld(1, true); }
    const w = menuWorld;
    w.elapsed += dt;

    // attract gameplay: the demo Mapper opens ports while enemies patrol
    if (w.demoState === 'play') {
      updateDemoPlayer(dt);
      // scripted hacker showcase: as the round nears its end, a demo hacker
      // knocks one port back to CLOSED (static shimmer + modem sting), then
      // the Mapper re-secures it so the speedrun still clears
      if (w.demoHack && !w.demoHack.done) demoHackTick(w, dt);
    } else {
      w.demoClearT -= dt;
      // The HI-SCORE on the ROUND COMPLETE card rolls up to the bot's final
      // score during the card's first second, ticking like a real cabinet
      // tallying the demo run (ease-out so the digits slow as they land).
      const shown = w.demoScoreShown || 0;
      const target = w.demoScore || 0;
      w.demoScoreTickT = (w.demoScoreTickT || 0) + dt;
      if (shown < target) {
        const progress = Math.min(1, (w.elapsed - (w.demoCardStart || 0)) / 1000);
        if (progress >= 1) {
          // land on the final score exactly at the 1s mark
          w.demoScoreShown = target;
          A.sfx('tick');
        } else if (w.demoScoreTickT >= 40) {
          w.demoScoreTickT = 0;
          const next = Math.round(target * (1 - Math.pow(1 - progress, 2)));
          w.demoScoreShown = Math.max(next, Math.min(target, shown + 1));
          A.sfx('tick');
        }
      }
      if (w.demoClearT <= 0) {
        drainWorldFx(menuWorld);           // recycle the cleared demo round
        menuWorld = buildWorld(1, true);   // fresh round — the attract loop
        return;
      }
    }

    // demo enemies wander continuously (and chase the demo Mapper)
    for (const e of w.enemies) {
      if (e.dead) {
        if (e.type === 'worm' && rnd() < dt * 0.002) {
          // revive as a fresh egg at row 1 (not on the Mapper's apex cube)
          const s = rnd() < 0.5;
          e.dead = false; e.mode = 'egg'; e.nextT = 0;
          e.u = s ? 1 : 0; e.v = s ? 0 : 1;
          e.state = 'idle';
        }
        continue;
      }
      if (e.hackTarget) continue;   // the showcase hacker is driven by demoHackTick
      const prevWorld = world; world = w;
      updateEnemy(e, dt);
      world = prevWorld;
      // scripted catch: hostile traffic lands on the demo Mapper while a
      // death is due — the attract loop shows off deaths like a real run
      if (w.demoState === 'play' && w.demoDeath && w.demoDeath.type === 'catch' && w.elapsed >= w.demoDeath.at) {
        const p = w.player;
        if (p && p.state === 'idle' && p.invuln <= 0 && e.state !== 'fall' &&
            e.type !== 'hacker' && e.type !== 'freezeball' && e.u === p.u && e.v === p.v) {
          if (p.shield > 0) demoShieldBlock(w, p);
          else demoPlayerDie('enemy');
        }
      }
    }

    // guarantee a catch death fires: if no hostile packet overlapped in time,
    // convert the scripted catch into a fall so the bot still dies on cue
    if (w.demoDeath && w.demoDeath.type === 'catch' && w.elapsed >= w.demoDeath.at + 2600) {
      w.demoDeath.type = 'fall';
    }

    // demo power-ups + disc respawn only tick during live play (the 'clear'
    // card world is discarded on rebuild anyway)
    if (w.demoState === 'play') {
      if (w.powerups.length < 1 && w.elapsed >= w.timers.nextPower) {
        spawnPowerup(w);
        w.timers.nextPower = w.elapsed + 5500 + rnd() * 3500;
      }
      for (let i = w.powerups.length - 1; i >= 0; i--) {
        const pu = w.powerups[i];
        pu.life -= dt;
        if (pu.life <= 0) {
          const ctr = R.cubeCenter(w.geo, pu.u, pu.v);
          w.particles.push(mkP(ctr.x, ctr.y - w.geo.hh - 14, 0, -30, 350, C.POWERUPS[pu.type].color, 'circle', 3));
          w.powerups.splice(i, 1);
        }
      }
      // a ridden service pack returns after a pause
      for (const d of w.discs) {
        if (d.used && d.respawnT !== undefined) {
          d.respawnT -= dt;
          if (d.respawnT <= 0) {
            d.used = false;
            d.visible = true;
            const nr = 1 + Math.floor(rnd() * (w.rows - 2));
            if (d.u === -1) d.v = nr; else d.u = nr;
            const ctr = R.cubeCenter(w.geo, d.u, d.v);
            d.x = ctr.x; d.y = ctr.y - 6;
          }
        }
      }
    }

    // particles, floats & cube flash decay (mirrors updateWorld)
    for (let i = w.particles.length - 1; i >= 0; i--) {
      const pt = w.particles[i];
      pt.life -= dt; pt.x += pt.vx * dt * 0.06; pt.y += pt.vy * dt * 0.06;
      if (pt.life <= 0) killParticle(w, i);
    }
    for (let i = w.floats.length - 1; i >= 0; i--) {
      const f = w.floats[i];
      f.life -= dt; f.y -= dt * 0.03;
      if (f.life <= 0) killFloat(w, i);
    }
    for (const k in w.cubes) {
      const cb = w.cubes[k];
      if (cb.flash > 0) cb.flash = Math.max(0, cb.flash - dt / 450);
      if (cb.revert > 0) cb.revert = Math.max(0, cb.revert - dt / 420);
      if (cb.warn > 0) cb.warn = Math.max(0, cb.warn - dt / 450);
    }
    // juice decay (mirrors updateWorld — without it the death flash/shake
    // would stick to the title screen until the round rebuilds)
    w.shake = Math.max(0, w.shake - dt * 0.045);
    w.flash = Math.max(0, w.flash - dt * 0.002);
    w.levelFlash = Math.max(0, w.levelFlash - dt / 1200);
  }

  /* ================= loop ================= */

  // One 50Hz simulation tick — every branch of the state machine runs here
  // with a FIXED dt, so rnd draws, hops, timers and spawns all advance in
  // whole 20ms steps regardless of the display's frame rate.
  function tick(dt) {
    if (state === 'playing') {
      updateWorld(dt);
    } else if (state === 'ready') {
      updateWorld(dt); // lets particles settle; enemies frozen by state gate
      readyT -= dt;
      if (readyT <= 0) {
        state = 'playing';
        if (world) world.readyCard = null;   // the READY card fades with the pause
        I.clearQueue();
      }
    } else if (state === 'levelclear') {
      updateWorld(dt);
      clearT -= dt;
      if (clearT <= 0) advanceLevel();
    } else if (state === 'paused') {
      // frozen
    } else if (state === 'gameover' || state === 'initials') {
      if (world) updateWorld(dt); // keep particles/ambience alive behind the panel
      // idle attract return: an abandoned game-over screen cycles back to
      // the title like a real cabinet (only when initials aren't being typed)
      if (PM.UI.screen() === 'gameover' && !PM.UI.entryActive()) {
        goIdle += dt;
        if (goIdle >= C.TIMING.attractReturn) {
          PM.UI.goPressWarn(false);
          skipToTitle();
        } else {
          const remain = C.TIMING.attractReturn - goIdle;
          PM.UI.goPressWarn(remain <= C.TIMING.attractWarn, Math.ceil(remain / 1000));
        }
      } else {
        goIdle = 0;
        PM.UI.goPressWarn(false);
      }
    } else {
      // menu family — attract mode
      updateDemo(dt);
      // attract auto-start: after enough idle time on the title, flash
      // PRESS START and begin a round on the last difficulty, like a cabinet
      if (state === 'menu' && PM.UI.screen() === 'menu') {
        menuIdle += dt;
        const autoT = autoStartMs !== null ? autoStartMs : C.TIMING.attractAutoStart;
        if (menuIdle >= autoT) {
          PM.UI.hideScreens();
          startGame(diff.id);
        } else {
          const remain = autoT - menuIdle;
          PM.UI.attractWarn(remain <= C.TIMING.attractWarn, Math.ceil(remain / 1000));
        }
      } else {
        menuIdle = 0;
        PM.UI.attractWarn(false);
      }
    }
  }

  function loop(t) {
    if (!timerMode) rafId = requestAnimationFrame(loop);
    if (!last) last = t;
    const frame = Math.min(50, t - last);
    last = t;
    tGlobal = t;
    I.pollGamepad();
    const pt0 = performance.now();

    // fixed-timestep accumulator: drain whole 20ms simulation steps from the
    // frame budget (capped at 4/frame so a janky frame can't trigger a
    // catch-up burst; the cap plus the 50ms frame clamp prevent a spiral of
    // death, at the cost of the sim running slightly slower during jank)
    acc += frame;
    let steps = 0;
    while (acc >= STEP && steps < 4 && !fpShown) {
      acc -= STEP; steps++; tick(STEP);
      // fp harness: checked BETWEEN steps (not after the frame's drain) so the
      // fingerprint is stamped at the exact multiple-of-20 sim instant it
      // crosses fpAt — every frame cadence lands on the identical state
      if (fpAt !== null) {
        const fpW = (state === 'menu' || state === 'difficulty' || state === 'scores' || state === 'help' || state === 'sound')
          ? menuWorld : world;
        if (fpW && fpW.elapsed >= fpAt) {
          fpShown = true;
          const fp = fingerprint();
          document.title = 'FP ' + fp;
          document.body.setAttribute('data-fp', fp);
        }
      }
    }
    if (acc >= STEP) acc = 0;   // overflow guard — drop any backlog

    const pt1 = performance.now();
    // render
    if (state === 'menu' || state === 'difficulty' || state === 'scores' || state === 'help' || state === 'sound') {
      if (menuWorld) R.drawWorld(menuWorld, t);
    } else {
      if (world) R.drawWorld(world, t);
    }
    const pt2 = performance.now();
    PM.UI.updateHUD();
    // note: the one-shot ?fp= fingerprint stamping lives inside the step loop
    // (update phase) — harness-only, negligible
    // debug profiler: accumulate per-phase frame timings
    const pt3 = performance.now();
    prof.frames++; prof.update += pt1 - pt0; prof.render += pt2 - pt1; prof.hud += pt3 - pt2; prof.total += pt3 - pt0;
    const pft = pt3 - pt0;
    if (pft > prof.maxFrame) prof.maxFrame = pft;
    if (pft > 50) prof.longFrames++;
  }

  /* ================= system keys while playing ================= */

  function systemKey(code) {
    if (state === 'playing') {
      if (code === 'KeyP' || code === 'Escape') { pause(); }
      else if (code === 'KeyM') { PM.UI.toggleMute(); }
    } else if (state === 'paused') {
      if (code === 'KeyP' || code === 'Escape' || code === 'Enter' || code === 'Space') resume();
      else PM.UI.pauseKey(code);
    }
  }

  /* ================= misc ================= */

  function targetTile(u, v, dir) {
    switch (dir) {
      case 'DL': return [u, v + 1];
      case 'DR': return [u + 1, v];
      case 'UL': return [u - 1, v];
      case 'UR': return [u, v - 1];
    }
    return [u, v];
  }

  // A compact, order-stable snapshot of everything deterministic in the current
  // world — two runs from the same seed must produce byte-identical strings.
  // Used by the ?fp= harness for replay verification (and handy for debugging).
  function fingerprint() {
    const w = (state === 'menu' || state === 'difficulty' || state === 'scores' || state === 'help' || state === 'sound')
      ? menuWorld : world;
    if (!w) return 'NO_WORLD';
    const out = [];
    out.push('state=' + state, 'level=' + w.level, 't=' + Math.round(w.elapsed), 'score=' + score, 'lives=' + lives);
    if (w.demo) {
      out.push('demo=' + w.demoState, 'demoScore=' + w.demoScore, 'demoChain=' + w.demoChain);
      out.push('dDeath=' + (w.demoDeath ? w.demoDeath.type + '@' + Math.round(w.demoDeath.at) : '0'));
      out.push('dRide=' + (w.demoRide ? Math.round(w.demoRide.at) + (w.demoRide.done ? 'D' : '') : '0'));
      out.push('dHack=' + (w.demoHack ? (w.demoHack.triggered ? 'T' + (w.demoHack.target || '-') : '0') : '0'));
    }
    out.push('changed=' + w.stats.changed + '/' + w.stats.total);
    const ck = Object.keys(w.cubes).sort();
    out.push('cubes=' + ck.map(k => {
      const c = w.cubes[k];
      return c.state + (c.hacked ? 'h' : '') + (c.warn ? 'w' : '') + (c.flash > 0 ? 'f' : '') + (c.revert > 0 ? 'r' : '');
    }).join(''));
    const p = w.player;
    if (p) {
      out.push('p=' + p.u + ',' + p.v + ':' + p.state +
        (p.hop ? ':' + Math.round(p.hop.t0) + ',' + Math.round(p.hop.dur) : '') +
        (p.fall ? ':F' : ''));
    }
    const es = w.enemies.map(e =>
      e.type + ':' + e.u + ',' + e.v + ':' + e.state + (e.dead ? 'D' : '') +
      (e.mode ? ':' + e.mode : '') +
      (e.hop ? ':' + Math.round(e.hop.t0) : '') +
      (e.respawnT !== undefined ? ':' + Math.round(e.respawnT) : '')
    ).sort();
    out.push('e=' + es.join('|'));
    out.push('discs=' + w.discs.map(d => d.u + ',' + d.v + (d.used ? 'u' : '') + (d.respawnT !== undefined ? ':' + Math.round(d.respawnT) : '')).join('|'));
    out.push('pow=' + w.powerups.map(pu => pu.type + ':' + pu.u + ',' + pu.v + ':' + Math.round(pu.life)).join('|'));
    out.push('timers=' + ['nextHacker', 'nextGreen', 'nextPower', 'nextDisc'].map(k => Math.round(w.timers[k] || 0)).join(','));
    out.push('nP=' + w.particles.length, 'nF=' + w.floats.length);
    return out.join(' ');
  }

  // Per-phase frame timing from the loop's profiler — call _debug.profile()
  // after a play session to see where the frame budget actually goes.
  function profileReport() {
    const n = prof.frames;
    if (!n) return null;
    const avg = prof.total / n;
    return {
      frames: n,
      updateMs: +(prof.update / n).toFixed(3),
      renderMs: +(prof.render / n).toFixed(3),
      hudMs: +(prof.hud / n).toFixed(3),
      avgFrameMs: +avg.toFixed(3),
      fps: +(1000 / avg).toFixed(1),
      maxFrameMs: +prof.maxFrame.toFixed(2),
      longFrames: prof.longFrames,   // frames over 50ms (missed vblanks)
    };
  }

  function init() {
    if (bootSeed !== null) RNG.setSeed(bootSeed);   // deterministic runs (URL)
    I.init();
    hi = Math.max(hi, S.highScore());
    last = 0;
    if (bootDiff) {
      startGame(bootDiff, bootLevel);     // ?diff= (+ optional ?level=) boots straight in
      // ui.js hides the menu overlay in its own start flow; the boot shortcut
      // must do the same, but ui.init() runs after game.init() — defer one tick
      // so PM.UI has its element cache before the overlay is cleared
      setTimeout(function () { PM.UI.hideScreens(); }, 0);
    }
    if (fpAt !== null) {
      // deterministic timer-driven driver: headless virtual time advances
      // setTimeout but NOT requestAnimationFrame, so a timer loop replays
      // byte-identically across runs — the same mechanism a future input-log
      // replay will use. ?hz=N changes the cadence (default 60) to prove the
      // simulation is frame-rate independent. Gated on ?fp= alone so
      // ?autostart= stays a pure attract-clock tweak.
      timerMode = true;
      let vt = 0;
      const frameMs = 1000 / hzMs;
      (function vloop() {
        vt += frameMs;
        loop(vt);
        if (vt < 10 * 60 * 1000) setTimeout(vloop, frameMs);   // cap: 10 min
      })();
    } else {
      rafId = requestAnimationFrame(loop);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state === 'playing') pause();
    });
    // any interaction on the title resets the attract auto-start timer
    const activity = function () {
      if (state === 'menu') menuIdle = 0;
      if (state === 'gameover' || state === 'initials') goIdle = 0;
    };
    document.addEventListener('keydown', activity);
    document.addEventListener('pointerdown', activity);
  }

  return {
    init, startGame, toMenu, skipToTitle, restart, pause, resume, systemKey,
    isPlaying: () => state === 'playing' || state === 'ready' || state === 'levelclear',
    state: () => state,
    score: () => score,
    lives: () => lives,
    level: () => level,
    diff: () => diff,
    hi: () => hi,
    world: () => world,
    // live re-secure streak (0 when no round is running) — the HUD reads this
    // every frame to paint the QUICK ×N counter
    reSecureStreak: () => (world ? world.stats.reSecureStreak : 0),
    // the quick-combo cap climbs 50 per level (400 → 450 → 500 …) so the
    // escalation arc keeps stretching on deep runs — single source of truth
    // shared with the HUD readout
    reSecureCap: reSecureCap,
    // deterministic runs: reseed the RNG stream (?seed=N does this at boot)
    setSeed: function (s) { RNG.setSeed(s); },
    // hidden helpers (testing / easter egg)
    _debug: {
      fingerprint: fingerprint,
      profile: profileReport,
      profileReset: function () { prof = { frames: 0, update: 0, render: 0, hud: 0, total: 0, maxFrame: 0, longFrames: 0 }; },
      poolStats: function () { return { partFree: partPool.length, floatFree: floatPool.length }; },
      rngSeed: function () { return RNG.seed(); },
      rngNext: function () { return RNG.f(); },
      // reseed + rebuild both worlds so a fresh deterministic run starts
      // (debug helper: pair with startGame() for a fully clean run — module
      // state like hi/nextExtra is not reset here)
      setSeed: function (s) {
        RNG.setSeed(s);
        if (world) drainWorldFx(world);
        world = world ? buildWorld(world.level, world.demo) : world;
        if (menuWorld) drainWorldFx(menuWorld);
        menuWorld = menuWorld ? buildWorld(1, true) : menuWorld;
        score = 0; lives = diff.lives; level = 1; resetRunStats();
      },
      completeLevel: function () { for (const k in world.cubes) { world.cubes[k].state = 2; world.stats.changed = world.stats.total; } levelClear(); },
      addScore: function (n) { addScore(n); },
      menuWorld: function () { return menuWorld; },
      demoRoundClear: function () { if (menuWorld) demoRoundClear(); },
      levelClear: function () { if (world && !world.demo) levelClear(); },
      gameOver: function () { lives = 0; gameOver(); },
      goIdle: function () { return goIdle; },
    },
  };
})();
