"use strict";
/* ============================================================
   DATA BREAK — corrupted bosses
   Eight unique bosses with hp, phases, and BRICK-BASED attacks.
   Design rule: this is a brick breaker, not a shooter. Bosses
   drift above the playfield and summon DATA BLOCK formations the
   player must break — nothing ever falls toward the ship.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const U = R.Util;
  const C = R.Config;

  // Base HP is now flatter (mid bosses no longer compound to tanky values); the
  // piecewise curve in spawn() below turns these into the tuned boss table
  // 26/31/37/43/45/48/50/52 at levels 5/10/15/20/25/30/35/40 (playtested to
  // land each fight in the 30-60s Ricochet TTK band with a realistic kit).
  const DEFS = [
    { id: 0, name: "Virus King",        hp: 24, w: 150, h: 130, attackEvery: 5.0 },
    { id: 1, name: "Firewall Guardian", hp: 27, w: 190, h: 120, attackEvery: 6.0 },
    { id: 2, name: "Corrupted Server",  hp: 30, w: 180, h: 150, attackEvery: 5.5 },
    { id: 3, name: "Quantum CPU",       hp: 33, w: 160, h: 160, attackEvery: 7.0 },
    // shieldEvery (shield-wall reinforcement cadence) only matters for bosses
    // with spawnShields: true (ids 2, 5, 6); id 2 uses the default 3.
    { id: 4, name: "Cloud Overlord",    hp: 33, w: 200, h: 140, attackEvery: 4.5 },
    { id: 5, name: "Mega Database",     hp: 34, w: 190, h: 160, attackEvery: 6.0, shieldEvery: 3 },
    { id: 6, name: "AI Core",           hp: 34, w: 180, h: 170, attackEvery: 5.0, shieldEvery: 4 },
    { id: 7, name: "Malware Hive",      hp: 34, w: 200, h: 170, attackEvery: 3.6 }
  ];

  // brick formations each boss summons. Each entry is a small pattern grid;
  // chars use the standard block legend (Bricks.charType). Formations spawn
  // in the upper brick zone, centered under the boss — they never fall.
  const FORMATIONS = [
    [ // 0 Virus King: chevrons of virus fragments
      ["..VVV..", ".VVVVV.", "VVVVVVV"],
      ["..#....", ".##....", "###...."]
    ],
    [ // 1 Firewall Guardian: strong firewall columns
      ["S..S..S", "S..S..S", "S..S..S"],
      ["#S#.S#.", "S#S#S#S", "#S#.S#."]
    ],
    [ // 2 Corrupted Server: binary server racks
      ["B.B.B.B", "BB.BB.B", "B.B.B.B"],
      ["S..S..S", "..S..S.", "S..S..S"]
    ],
    [ // 3 Quantum CPU: splitter + binary halo
      ["P...P", ".P.P.", "..P.."],
      ["B.B.B", "BBBBB", "B.B.B"]
    ],
    [ // 4 Cloud Overlord: banks of moving encryption
      ["M.M.M.M", "M.M.M.M", "M.M.M.M"],
      ["H#H#H#H", "#H#H#H#H"]
    ],
    [ // 5 Mega Database: regenerating cache rows
      ["RRRRRRR", ".......", "RRRRRRR"],
      ["R.R.R.R", ".R.R.R.", "R.R.R.R"]
    ],
    [ // 6 AI Core: super-brick grid — thinned so the 4hp bricks lane the ball
      // (a full 19-brick super wall made the fight a slog at 1.6s per HP; the
      // surge rows use 2hp strong bricks so the grid still reads "encrypted")
      ["T.T.T..", ".T.T.T.", "T..T.T."],
      ["S#S#S#S", "#S#S#S#S"]
    ],
    [ // 7 Malware Hive: explosive clusters
      [".E.E.E.", "E.E.E.E", ".E.E.E."],
      ["O.O.O.O", ".O.O.O.", "O.O.O.O"]
    ]
  ];

  // ---------------- arena theming ----------------
  // Boss arenas borrow the level's world palette so the fight reads as part of
  // the same sector. Shield walls run a layered gradient down each column;
  // summon formations tint their plain bricks with the level's scheme using
  // LOCAL pattern coordinates (the boss drifts, so absolute grid positions
  // would reshuffle hues between attacks). Special cells (virus, prism, lock,
  // cache, explosive, regen, moving, hidden, ...) keep their identity colors —
  // their colors are gameplay-relevant and stay readable on the themed field.
  // The theme itself comes from Levels.sectorTheme (same source as build()
  // and describe()), so the arena always matches the sector's palette.
  function tintArenaBrick(engine, b, localCol, localRow, localW, localRows) {
    const plain = b.style === "normal" || b.style === "binary" || b.style === "strong"
      || b.style === "super";
    if (!plain) return;
    const { themeIdx, scheme } = R.Levels.sectorTheme(engine.level, engine.endless, engine.wave);
    const theme = R.Art.THEMES[themeIdx % R.Art.THEMES.length];
    if (!theme || !theme.colors.length) return;
    const n = theme.colors.length;
    const hue = theme.colors[
      R.Art.schemeColorIdx(scheme, localRow, localCol, Math.max(1, localW), Math.max(1, localRows), n)];
    b.tint = hue;
    b.tint2 = R.Art.shadeHex(hue, 0.45);
  }

  // Shield walls run a layered gradient down the column. localRow is the
  // wall's own row index (0 = top row), decoupled from absolute grid rows so
  // the anchor never shifts if wall placement ever changes.
  function tintShieldWall(engine, b, localRow) {
    const { themeIdx } = R.Levels.sectorTheme(engine.level, engine.endless, engine.wave);
    const theme = R.Art.THEMES[themeIdx % R.Art.THEMES.length];
    if (!theme || !theme.colors.length) return;
    const n = theme.colors.length;
    const hue = theme.colors[((localRow % n) + n) % n];
    b.tint = hue;
    b.tint2 = R.Art.shadeHex(hue, 0.45);
  }

  function spawn(engine, id) {
    const def = DEFS[id];
    // Piecewise HP curve: gentle growth through the mid-game (levels <= knee so
    // bosses 10-25 land in the Ricochet 30-60s TTK band), then a stronger late
    // rate so the finale stays challenging against end-game kits.
    // Endless mode keeps engine.level at 1 (loadLevel(1) every wave), so map each
    // endless boss id to the campaign level where it first appears (id0->L5 ...
    // id7->L40); otherwise the flattened DEFS would silently nerf endless bosses
    // by 17-25% while the curve never applies.
    const lvl = engine.endless ? 5 + 5 * id : engine.level;
    const knee = C.BOSS_HP_CURVE_KNEE;
    const early = Math.min(lvl - 1, knee - 1) * C.BOSS_HP_PER_LEVEL;
    const late = Math.max(0, lvl - knee) * C.BOSS_HP_LATE_PER_LEVEL;
    const hpScale = 1 + early + late + (engine.difficulty.name === "Expert" ? C.BOSS_HP_EXPERT_BONUS : 0);
    const boss = {
      id,
      def,
      name: def.name,
      x: engine.worldW / 2,
      y: C.BRICK_TOP + 150,
      w: def.w,
      h: def.h,
      hp: Math.round(def.hp * hpScale),
      maxHp: Math.round(def.hp * hpScale),
      t: 0,
      attackT: 1.5,
      phase: 1,
      vx: 0,
      spawnCount: 0,
      enraged: false,
      spawnShields: id === 2 || id === 5 || id === 6
    };
    if (boss.spawnShields) spawnShieldWalls(engine, boss);
    return boss;
  }

  function spawnShieldWalls(engine, boss) {
    // vertical shield columns that guard the boss; player must chew through
    const rows = 4;
    const colL = Math.floor(engine.cols * 0.14);
    const colR = engine.cols - 1 - colL;
    for (let r = 0; r < rows; r++) {
      for (const col of [colL, colR]) {
        const b = R.Bricks.make("shield", col, r + 2, engine.cols, rows + 2);
        tintShieldWall(engine, b, r);   // world palette, row gradient down the wall
        engine.bricks.push(b);
        engine.shieldCells = engine.shieldCells || [];
        engine.shieldCells.push(b);
      }
    }
  }

  // place a pattern grid in the upper brick zone, centered on the boss.
  // Bricks land at fixed rows — they move around above, never fall.
  function summonFormation(engine, boss, rows, rowOffset) {
    const cell = C.CELL;
    const bh = C.BRICK_H, gap = C.BRICK_GAP_Y;
    const inset = Math.floor((cell - C.BRICK_W) / 2);
    const patW = Math.max(...rows.map((r) => r.length));
    const startX = U.clamp(boss.x - (patW * cell) / 2, 30, engine.worldW - (patW * cell) / 2 - 30);
    const y0 = C.BRICK_TOP + (rowOffset || 0) * (bh + gap);
    for (let r = 0; r < rows.length; r++) {
      const rowStr = rows[r];
      for (let c = 0; c < rowStr.length; c++) {
        const type = R.Bricks.charType(rowStr[c]);
        if (!type) continue;
        // skip cells that already hold a live brick (surge must not stack)
        let occupied = false;
        for (const o of engine.bricks) {
          if (o.dead) continue;
          if (o.x === startX + c * cell + inset && o.y === y0 + r * (bh + gap)) { occupied = true; break; }
        }
        if (occupied) continue;
        const b = R.Bricks.make(type, 0, 0, engine.cols, 6);
        b.x = startX + c * cell + inset;
        b.y = y0 + r * (bh + gap);
        b.col = Math.round(b.x / cell);
        b.row = r + (rowOffset || 0);
        R.Bricks.resetBrickBase(b);
        // theme tint from local pattern coords (specials stay identity-colored)
        tintArenaBrick(engine, b, c, r, patW, rows.length);
        engine.bricks.push(b);
      }
    }
    engine.bricksDirty = true;
  }

  function update(engine, dt) {
    const boss = engine.boss;
    if (!boss) return;
    const t = engine.time;
    boss.t += dt;
    boss.attackT -= dt;
    const def = boss.def;

    // movement: gentle drift + phase-based swoop
    boss.vx += (Math.sin(t * 0.7) * 120 - boss.vx) * dt;
    boss.x = U.clamp(boss.x + boss.vx * dt, boss.w / 2 + 40, engine.worldW - boss.w / 2 - 40);

    // enrage at 40% hp: attacks come twice as fast
    if (!boss.enraged && boss.hp < boss.maxHp * 0.4) {
      boss.enraged = true;
      R.Audio.play("boss");
      R.Particles.ring(boss.x, boss.y, "#f87171", 60, 0.6);
      engine.toast("BOSS ENRAGED", "#fb7185");
    }

    if (boss.attackT <= 0) {
      boss.attackT = def.attackEvery * (boss.enraged ? 0.5 : 1);
      boss.spawnCount++;
      doAttack(engine, boss);
    }
  }

  function doAttack(engine, boss) {
    // the boss summons a brick formation above — every attack is breakable
    const forms = FORMATIONS[boss.id] || FORMATIONS[0];
    // alternate between the boss's two patterns; enraged bosses pull in both
    const pick = boss.spawnCount % 2;
    const rows = forms[pick];
    summonFormation(engine, boss, rows);
    R.Audio.play("alert");
    R.Particles.burst(boss.x, boss.y + boss.h * 0.3, { count: 14, color: R.Art.BOSS_ART[boss.id].c, speed: 200 });

    // phase flair: every 4th attack is a wider, mixed "surge" formation
    if (boss.spawnCount % 4 === 0) {
      // drop the surge a full formation-height below so it never stacks on
      // the pattern just summoned — both rows stay in the brick zone.
      summonFormation(engine, boss, forms[(pick + 1) % forms.length], rows.length);
      R.Particles.ring(boss.x, boss.y, R.Art.BOSS_ART[boss.id].c, 40, 0.5);
    }

    // some bosses reinforce their shield walls as the fight drags on.
    // shieldEvery is per-boss: AI Core's super-brick grid already eats time,
    // so its walls reinforce every 4th attack instead of every 3rd (keeps the
    // fight brick-oriented without stacking into a slog on top of the grid).
    const shieldEvery = boss.def.shieldEvery || 3;
    if (boss.spawnShields && boss.spawnCount % shieldEvery === 0) {
      const colL = Math.floor(engine.cols * 0.14);
      const colR = engine.cols - 1 - colL;
      for (const col of [colL, colR]) {
        // never stack a second shield on a live one at the same cell
        const dup = engine.shieldCells.some((o) => !o.dead && o.col === col && o.row === 2);
        if (dup) continue;
        const b = R.Bricks.make("shield", col, 2, engine.cols, 6);
        tintShieldWall(engine, b, 0);   // top wall row -> hue 0, matches the initial wall
        engine.bricks.push(b);
        engine.shieldCells.push(b);
      }
      engine.bricksDirty = true;
    }
  }

  function hit(engine, dmg) {
    const boss = engine.boss;
    if (!boss) return 0;
    const actual = Math.min(dmg, boss.hp);
    boss.hp -= dmg;
    R.Audio.play("bossHit");
    R.Particles.burst(boss.x + U.rand(-30, 30), boss.y + U.rand(-20, 20), { count: 8, color: "#fbbf24", speed: 200 });
    engine.shake(2);
    if (boss.hp <= 0) {
      defeat(engine);
    }
    return actual;
  }

  function defeat(engine) {
    const boss = engine.boss;
    R.Audio.play("explode");
    // boss kills get their own fanfare — triggerLevelClear("winBoss") below
    R.Particles.confetti(boss.x, boss.y, 90);
    R.Particles.ring(boss.x, boss.y, "#fbbf24", 30, 0.7);
    engine.shake(10);
    engine.addScore(5000, boss.x, boss.y);   // addScore applies scoreMult internally
    R.Save.bumpStat("bossesDefeated");
    if (R.Save.unlock("boss_1")) engine.toastAchievement("boss_1");
    if (R.Save.get("stats.bossesDefeated") >= 8 && R.Save.unlock("boss_all")) engine.toastAchievement("boss_all");
    // power-up shower
    for (let i = 0; i < 3; i++) {
      R.Powerups.spawn(engine, boss.x + (i - 1) * 90, boss.y, i === 1 ? "life" : undefined);
    }
    engine.boss = null;
    // clear shield cells still standing
    for (const b of [...engine.bricks]) {
      if (b.type === "shield") engine.destroyBrick(b, "boss");
    }
    engine.triggerLevelClear("winBoss");
  }

  function render(engine, ctx, t) {
    if (!engine.boss) return;
    R.Art.drawBoss(ctx, engine.boss, t);
  }

  // ---------------- mini-bosses (elite encounters) ----------------
  // Smaller drifting cores that summon a single brick formation every few
  // seconds and drop a capsule shower when purged. They do NOT gate level
  // clear (unlike main bosses) — they are a bonus threat that stops spawning
  // once destroyed, so an ignored mini just piles up breakable bricks.
  const MINIS = [
    { id: 0, name: "Packet Siphon",   hp: 9,  w: 120, h: 90,  attackEvery: 4.5 },
    { id: 1, name: "Sector Sentinel", hp: 11, w: 130, h: 100, attackEvery: 5.0 },
    { id: 2, name: "Cloud Wisp",     hp: 10, w: 130, h: 100, attackEvery: 4.0 },
    { id: 3, name: "Kernel Gate",    hp: 12, w: 130, h: 110, attackEvery: 4.5 }
  ];

  const MINI_FORMATIONS = [
    [ // 0 Packet Siphon (world 2): binary spines + strong struts — plain,
      // durable bricks so the first encounter reads fair on the early levels
      ["B.B.B", ".....", "B.B.B"],
      ["S..S.", ".S..S", "S..S."]
    ],
    [ // 1 Sector Sentinel (world 4): prism chevrons + phasing caches — echoes
      // the prism-wave level it guards (level 17)
      ["..Y..", ".Y.Y.", "Y...Y"],
      ["..F..", ".F.F.", "F...F"]
    ],
    [ // 2 Cloud Wisp (world 6): moving encryption banks + hidden haze
      ["M.M.M", ".....", "M.M.M"],
      ["H.H.H", ".H.H.", "H.H.H"]
    ],
    [ // 3 Kernel Gate (world 8): lock diamond (opening one pops the gate) +
      // regenerating cache guards
      ["..L..", ".L.L.", "..L.."],
      ["R.R.R", ".R.R.", "R.R.R"]
    ]
  ];

  function miniSpawn(engine, id) {
    const def = MINIS[id];
    // scale gently with progress, capped so late minis stay "mini" — they are
    // an encounter, not a roadblock. Endless keeps engine.level at 1, so map
    // each endless mini id to the campaign level where it first appears.
    const lvl = engine.endless ? 3 + 5 * id : engine.level;
    const hpScale = 1 + Math.min(lvl - 1, 12) * 0.05 + (engine.difficulty.name === "Expert" ? 0.25 : 0);
    return {
      id,
      def,
      name: def.name,
      x: engine.worldW / 2,
      y: C.BRICK_TOP + 120,
      w: def.w,
      h: def.h,
      hp: Math.round(def.hp * hpScale),
      maxHp: Math.round(def.hp * hpScale),
      t: 0,
      attackT: 1.2,
      vx: 0,
      spawnCount: 0,
      mini: true
    };
  }

  function miniUpdate(engine, dt) {
    const mini = engine.mini;
    if (!mini) return;
    const t = engine.time;
    mini.t += dt;
    mini.attackT -= dt;
    // lighter drift than the main bosses
    mini.vx += (Math.sin(t * 0.9) * 90 - mini.vx) * dt;
    mini.x = U.clamp(mini.x + mini.vx * dt, mini.w / 2 + 30, engine.worldW - mini.w / 2 - 30);
    if (mini.attackT <= 0) {
      mini.attackT = mini.def.attackEvery;
      mini.spawnCount++;
      const forms = MINI_FORMATIONS[mini.id] || MINI_FORMATIONS[0];
      summonFormation(engine, mini, forms[mini.spawnCount % forms.length]);
      R.Audio.play("alert");
      R.Particles.burst(mini.x, mini.y + mini.h * 0.3, { count: 10, color: R.Art.MINI_ART[mini.id].c, speed: 160 });
    }
  }

  function miniHit(engine, dmg) {
    const mini = engine.mini;
    if (!mini) return 0;
    const actual = Math.min(dmg, mini.hp);
    mini.hp -= dmg;
    R.Audio.play("bossHit");
    R.Particles.burst(mini.x + U.rand(-24, 24), mini.y + U.rand(-16, 16), { count: 6, color: "#fbbf24", speed: 180 });
    engine.shake(1);
    if (mini.hp <= 0) miniDefeat(engine);
    return actual;
  }

  function miniDefeat(engine) {
    const mini = engine.mini;
    R.Audio.play("explode");
    R.Particles.confetti(mini.x, mini.y, 50);
    R.Particles.ring(mini.x, mini.y, "#fbbf24", 24, 0.6);
    engine.shake(6);
    engine.addScore(1500, mini.x, mini.y);
    R.Save.bumpStat("minisDefeated");
    if (R.Save.get("stats.minisDefeated") >= 1 && R.Save.unlock("mini_1")) engine.toastAchievement("mini_1");
    // loot shower: two capsules drift down from the core
    for (let i = 0; i < 2; i++) R.Powerups.spawn(engine, mini.x + (i - 0.5) * 80, mini.y);
    engine.toast("SIGNAL NEUTRALIZED — " + mini.name.toUpperCase(), "#fbbf24");
    engine.mini = null;
    engine.miniId = null;
  }

  R.Boss = { DEFS, FORMATIONS, MINIS, MINI_FORMATIONS, spawn, update, hit, defeat, render, miniSpawn, miniUpdate, miniHit, miniDefeat };
})(window.BREAK);
