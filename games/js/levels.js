"use strict";
/* ============================================================
   DATA BREAK — level data & builder
   40-level campaign: worlds, bosses, bonus stages, specials.
   Design rule: levels are DATA BLOCK FORMATIONS (Ricochet-style
   shapes with voids and mixed block types). No turrets, no laser
   gates, nothing falls — every object either sits in the brick
   zone or moves around above it.
   Pattern legend: . empty # normal B binary S strong T super
   X steel E explosive M moving R regen H hidden G gravity
   P splitter V virus O bomb L lock C cache cell (always drops)
   Y prism (refracts the ball faster) F flicker (phases solid<->ghost)
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const C = R.Config;

  // Worlds for flavor text
  const WORLDS = [
    "MAIN MEMORY",
    "CACHE CLOUD",
    "DISK ARRAY",
    "NETWORK CORE",
    "CLOUD FABRIC",
    "BIOS",
    "KERNEL SPACE",
    "SYSTEM ABYSS"
  ];

  function worldFor(level) {
    const w = Math.min(WORLDS.length - 1, Math.floor((level - 1) / 5));
    return WORLDS[w];
  }

  function worldIndex(level) {
    return Math.min(WORLDS.length - 1, Math.floor((level - 1) / 5));
  }

  function bossFor(level) {
    return C.BOSS_LEVELS[level] !== undefined ? C.BOSS_LEVELS[level] : null;
  }

  function miniFor(level) {
    return C.MINI_LEVELS[level] !== undefined ? C.MINI_LEVELS[level] : null;
  }

  function isBonus(level) { return !!C.BONUS_LEVELS[level]; }

  // ---------------- campaign definitions ----------------
  // Ricochet-style formations: dense full-field shapes with voids the ball can
  // thread — pillars, waves, diamonds, checkerboards, gold (C) cache cells for
  // guaranteed capsule showers. Wall-type patterns use tile so wide screens
  // stay fully covered; shape levels are centered. Moving (M) and gravity (G)
  // blocks sway above; hidden (H) blocks sit next to a solid neighbor.
  const CAMPAIGN = [
    // -- World 1: MAIN MEMORY --
    { pat: ["##########..", "##########..", "##..####..##", "##..####..##", "##########..", "##########.."], tile: true },
    { pat: ["#.#.#.#.#.#.", ".#.#.#.#.#.#", "#.#.#.#.#.#.", ".#.#.#.#.#.#", "#.#.#.#.#.#.", ".#.#.#.#.#.#"], tile: true },
    { pat: ["####....####", "####....####", "##........##", "##........##", "####....####", "####....####"], tile: true },
    { pat: ["##C.##..##..", "##C.##..##..", "##C.##..##..", "##C.##..##..", "##C.##..##..", "##C.##..##.."], tile: true },
    { pat: [], boss: true }, // Boss 1: Virus King
    { pat: ["###..###..##", "###..###..##", "###..###..##", "###..###..##", "###..###..##", "###..###..##"], tile: true },
    { pat: ["MMM..MMM....", "MMM..MMM....", "............", "MMM..MMM....", "MMM..MMM....", "............"], tile: true },
    { pat: [], bonus: true }, // Bonus: capsule catch
    { pat: ["B#B#B#B#B#B#", "#B#B#B#B#B#B", "B#B#B#B#B#B#", "#B#B#B#B#B#B", "B#B#B#B#B#B#", "#B#B#B#B#B#B"], tile: true },
    // -- World 2: CACHE CLOUD (levels 6-10) --
    { pat: [], boss: true }, // Boss 2: Firewall Guardian
    // -- World 3: DISK ARRAY --
    { pat: ["....####....", "..########..", ".##########.", "############", "############", ".##########.", "..########..", "....####...."] },
    { pat: ["S##S##S##S##", "##S##S##S##S", "S##S##S##S##", "##S##S##S##S", "S##S##S##S##", "##S##S##S##S"], tile: true },
    { pat: ["E..E..E..E..", ".E..E..E..E.", "E..C..E..E..", ".E..E..E..E.", "E..E..E..E..", ".E..E..E..E."], tile: true },
    { pat: ["MMM.MMM.MMM.", "MMM.MMM.MMM.", "............", "MMM.MMM.MMM.", "MMM.MMM.MMM.", "............"], tile: true, speed: 1.05 },
    { pat: [], boss: true }, // Boss 3: Corrupted Server
    // -- World 4: NETWORK CORE --
    { pat: ["#.#.#.#.#.#.", "H.H.H.H.H.H.", "#.#.#.#.#.#.", "H.H.H.H.H.H.", "#.#.#.#.#.#.", "H.H.H.H.H.H."], tile: true },
    // Switch Fabric: a refracted wave of prism cells — the ball comes off
    // these hot and fast, so lane discipline keeps it under control
    { pat: ["YY..YY..YY..", ".YY..YY..YY.", "..YY..YY..YY", ".YY..YY..YY.", "YY..YY..YY..", ".YY..YY..YY."], tile: true },
    { pat: [], bonus: true }, // Bonus: capsule catch
    { pat: ["P.P.P.P.P.P.", ".P.P.P.P.P.P", "S..S..S..S..", ".S..C..S..S.", "P.P.P.P.P.P.", ".P.P.P.P.P.P", "#B#B#B#B#B#B", "B#B#B#B#B#B#"], tile: true },
    { pat: [], boss: true }, // Boss 4: Quantum CPU
    // -- World 5: CLOUD FABRIC --
    { pat: ["G..G..G..G..", ".G..G..G..G.", "G..G..G..G..", ".G..G..G..G.", "G..G..G..G..", ".G..G..G..G."], tile: true },
    { pat: ["H#H#H#H#H#H#", "#H#H#H#H#H#H", "H#H#H#H#H#H#", "#H#H#H#H#H#H", "H#H#H#H#H#H#", "#H#H#H#H#H#H"], tile: true },
    { pat: ["V..V..C..V..", ".V..V..V..V.", "V..V..V..V..", ".V..V..V..V.", "V..V..V..V..", ".V..C..V..V."], tile: true, speed: 1.04 },
    // Fog of Data: ghost data over phasing phantom caches, braced by strong
    // struts — solid neighbors reveal the hidden row, the flicker row times
    // your shot (kept at the original 8-row height)
    { pat: ["H#F#H#F#H#F", "#S#F#S#F#S#", "H#F#H#F#H#F", "#S#F#S#F#S#", "H#F#H#F#H#F", "#S#F#S#F#S#", "H#F#H#F#H#F", "#S#F#S#F#S#"], tile: true },
    { pat: [], boss: true }, // Boss 5: Cloud Overlord
    // -- World 6: BIOS --
    { pat: ["T..T..T..T..", ".T..T..T..T.", "T..T..T..T..", ".T..T..T..T.", "T..T..T..T..", ".T..T..T..T."], tile: true },
    { pat: ["RRRRRRRRRRRR", "............", "RRRRRRRRRRRR", "............", "R..R..R..R..", "............", "RRRRRRRRRRRR"], tile: true },
    { pat: [], bonus: true }, // Bonus: capsule catch
    { pat: ["G#G#G#G#G#G#", "#G#G#G#G#G#G", "R#R#R#R#R#R#", "#R#R#R#R#R#R", "G#G#G#G#G#G#", "#G#G#G#G#G#G", "R#R#R#R#R#R#", "#R#R#R#R#R#R"], tile: true },
    { pat: [], boss: true }, // Boss 6: Mega Database
    // -- World 7: KERNEL SPACE --
    { pat: ["L..L..L..L..", ".L..L..L..L.", "L..L..L..L..", ".L..L..L..L.", "L..L..L..L..", ".L..L..L..L."], tile: true },
    { pat: ["T#T#T#T#T#T#", "#B#B#B#B#B#B", "T#T#T#T#T#T#", "#B#B#B#B#B#B", "T#T#T#T#T#T#", "#B#B#B#B#B#B", "T#T#T#T#T#T#", "#B#B#B#B#B#B"], tile: true },
    { pat: ["O..O..O..O..", ".O..O..O..O.", "O..O..C..O..", ".O..O..O..O.", "O..O..O..O..", ".O..O..O..O."], tile: true },
    { pat: ["S#S#S#S#S#S#", "#S#S#S#S#S#S", "C#C#C#C#C#C#", "#C#C#C#C#C#C", "S#S#S#S#S#S#", "#S#S#S#S#S#S"], tile: true },
    { pat: [], boss: true }, // Boss 7: AI Core
    // -- World 8: SYSTEM ABYSS --
    // Defrag War: phasing caches weave between refracting prisms — late-game
    // timing + angle control (prisms speed the ball up on contact)
    { pat: ["F#Y#F#Y#F#Y", "#F#Y#F#Y#F#", "F#Y#F#Y#F#Y", "#F#Y#F#Y#F#", "F#Y#F#Y#F#Y", "#F#Y#F#Y#F#", "F#Y#F#Y#F#Y", "#F#Y#F#Y#F#"], tile: true, speed: 1.04 },
    { pat: ["B#B#B#B#B#B#", "#T#T#T#T#T#T", "B#B#B#B#B#B#", "#T#T#T#T#T#T", "B#B#B#B#B#B#", "#T#T#T#T#T#T", "B#B#B#B#B#B#", "#T#T#T#T#T#T"], tile: true },
    { pat: [], bonus: true }, // Bonus: capsule catch
    { pat: ["X#X#X#X#X#X#", "#X#X#X#X#X#X", "TTTTTTTTTTTT", "............", "TTTTTTTTTTTT", "BBBBBBBBBBBB", "BBBBBBBBBBBB", "CCCCCCCCCCCC"], tile: true, speed: 1.06 },
    { pat: [], boss: true } // Final Boss: Malware Hive
  ];

  // ---------------- level meta ----------------
  const NAMES = [
    "Sector Scan", "Bit Rot", "Memory Fragments", "Cache Wall", null,
    "Dirty Pages", "Frame Shift", null, "Raid Array", null,
    "Bad Sectors", "Mirror Clash", "Disk Fire", "Platter Storm", null,
    "Packet Storm", "Router Jam", "Switch Fabric", "Node Grid", null,
    "Vapor Trails", "Cloud Bank", "Trojan Bloom", "Fog of Data", null,
    "Boot Straps", "POST Failure", "Kernel Panic", "Registry Rot", null,
    "Driver Deadlock", "DLL Hell", "Memory Leak", "Fatal Exception", null,
    "Defrag War", "Dirty Cache", "Blue Screen", "Last Good Config", null
  ];

  // Pure metadata for the ship-select preview strip
  function describe(n) {
    const clamped = Math.max(1, Math.min(n || 1, C.CAMPAIGN_LENGTH));
    const def = CAMPAIGN[clamped - 1];
    if (!def) return null;
    const wi = Math.min(WORLDS.length - 1, Math.floor((clamped - 1) / 5));
    const { themeIdx, scheme } = sectorTheme(clamped, false, 0);
    return {
      n: clamped,
      world: WORLDS[wi],
      name: NAMES[clamped - 1] || "Corrupted Sector",
      themeIdx,
      scheme,
      colors: R.Art && R.Art.THEMES && R.Art.THEMES[themeIdx] ? R.Art.THEMES[themeIdx].colors : null,
      pattern: def.boss !== undefined ? false : def.bonus ? false : !!def.pat,
      boss: def.boss !== undefined ? def.boss : null,
      bonus: !!def.bonus
    };
  }

  function getCampaignLevel(n) {
    const def = CAMPAIGN[n - 1];
    const level = {
      n,
      world: worldFor(n),
      name: NAMES[n - 1] || "Corrupted Sector",
      boss: bossFor(n),
      mini: miniFor(n),
      bonus: isBonus(n),
      hazards: {},
      tile: def.tile,
      speed: def.speed || 1
    };
    if (def.pat) level.pat = def.pat;
    return level;
  }

  // Endless mode: procedural pattern from wave number
  function getEndlessLevel(wave) {
    const n = wave + 1;
    const w = Math.min(11, Math.floor(wave / 3));
    const cols = 12;
    const rows = 4 + Math.min(6, Math.floor(wave / 2));
    const pat = [];
    const pool = ["#", "B", "#", "S", "S", "#"];
    if (wave > 5) pool.push("M", "E");
    if (wave > 9) pool.push("G", "H");
    if (wave > 13) pool.push("V", "O");
    if (wave > 13) pool.push("P", "Y");   // splitters + refracting prisms (world 4+)
    if (wave > 17) pool.push("F");        // phasing phantom caches (world 5+)
    for (let r = 0; r < rows; r++) {
      let row = "";
      for (let c = 0; c < cols; c++) {
        // leave voids so the ball can weave; denser every few rows
        // (bumped from 0.42/0.6 — endless felt sparse next to the denser
        // campaign; now it reads like a proper Ricochet wall)
        const density = r % 3 === 2 ? 0.5 : 0.68;
        row += Math.random() < density ? (Math.random() < 0.22 ? "X" : R.Util.pick(pool)) : ".";
      }
      pat.push(row);
    }

    // shape archetypes: dedicated wave/pillar/arch rows so endless stops
    // reading as pure noise once the pool fills. Early arcs stay honest to
    // campaign worlds 1-3 (plain blocks); prisms and flickers only enter the
    // archetypes once they have appeared in the campaign.
    if (wave >= 4) {
      const archCount = 1 + (wave >= 12 ? 1 : 0);
      const archRows = [...Array(rows).keys()].sort(() => Math.random() - 0.5).slice(0, archCount);
      for (const r of archRows) {
        const kind = R.Util.pick(["wave", "pillar", "arch"]);
        let row = "";
        for (let c = 0; c < cols; c++) {
          if (kind === "wave") row += (c + r) % 3 === 0 ? (wave >= 14 ? "Y" : "#") : ".";
          else if (kind === "pillar") row += c % 4 === 2 ? "#" : (Math.random() < 0.3 ? "S" : ".");
          else row += (c + r) % 4 === 0 ? "#" : (c % 4 === 1 ? (wave >= 18 ? "F" : "B") : ".");
        }
        pat[r] = row;
      }
    }

    // Cache cells (gold guaranteed-drop blocks) reward endless survivors.
    // None in the opening waves; then 1 per 3 waves, capped at 2 so the
    // reward stays meaningful without flooding the DROP_MAX_ALIVE capsule
    // cap. Each is placed on its own column so they read as visible prizes.
    const cacheCount = wave < 3 ? 0 : Math.min(1 + Math.floor((wave - 3) / 3), 2);
    if (cacheCount > 0) {
      // prefer the sparser rows (r%3===2, density 0.42) first so caches land
      // on empty cells instead of overwriting blocks; ascending within tier
      const rowsByTier = [...Array(rows).keys()].sort((a, b) => {
        const ta = a % 3 === 2 ? 0 : 1, tb = b % 3 === 2 ? 0 : 1;
        return ta - tb || a - b;
      });
      const colsIn = [...Array(cols).keys()];
      for (let i = 0; i < cacheCount && colsIn.length > 0; i++) {
        const c = colsIn.splice(Math.floor(Math.random() * colsIn.length), 1)[0];
        let placed = false;
        for (const r of rowsByTier) {
          if (pat[r][c] === ".") {
            pat[r] = pat[r].slice(0, c) + "C" + pat[r].slice(c + 1);
            placed = true;
            break;
          }
        }
        // column was solid: overwrite a plain block (never X steel) so the
        // promised reward still exists
        if (!placed) {
          for (const r of rowsByTier) {
            if (pat[r][c] === "#" || pat[r][c] === "B") {
              pat[r] = pat[r].slice(0, c) + "C" + pat[r].slice(c + 1);
              placed = true;
              break;
            }
          }
        }
        // if the column could not take a cache, leave it out of the pool so
        // the next iteration moves on to a fresh column (never re-try a
        // column that is statically guaranteed to fail)
      }
    }
    return {
      n,
      world: R.Art && R.Art.THEMES ? R.Art.THEMES[(R.Save && R.Save.setting("endlessLockTheme") ? 0 : wave % R.Art.THEMES.length)].name.toUpperCase() : `ENDLESS GRID ${w + 1}`,
      name: "Procedural Purge",
      boss: wave > 0 && wave % 10 === 0 ? Math.min(7, Math.floor(wave / 10)) : null,
      // mini-boss interlude waves sit between the boss waves (7/17/27/37), so
      // every arc of endless gets an elite encounter without stacking one on
      // a main boss fight
      mini: wave > 3 && wave % 10 === 7 ? Math.min(3, Math.floor(wave / 10)) : null,
      bonus: false,
      hazards: {},
      pat,
      endless: true
    };
    // apply the wave's world palette (respects endlessLockTheme)
    if (R.Art && R.Art.THEMES && R.Art.SCHEMES) {
      const { themeIdx, scheme } = sectorTheme(1, true, wave);
      R.Art.tintBricks(engine, themeIdx, scheme);
    }
    return result;
  }

  // ---------------- sector theme helper ----------------
  // Single source for theme + scheme derivation. When endlessLockTheme is
  // enabled, endless always returns theme 0.
  function sectorTheme(level, endless, wave) {
    const TC = R.Art && R.Art.THEMES ? R.Art.THEMES.length : 8;
    const themeIdx = endless
      ? (R.Save && R.Save.setting("endlessLockTheme") ? 0 : (wave || 0) % TC)
      : Math.min(TC - 1, Math.floor(((level || 1) - 1) / 5));
    const scheme = R.Art && R.Art.SCHEMES
      ? R.Art.SCHEMES[(endless ? (wave || 0) : ((level || 1) - 1)) % R.Art.SCHEMES.length]
      : "rows";
    return { themeIdx, scheme };
  }

  // Build a level into the engine
  function build(engine, levelDef) {
    const opts = {
      cols: engine.cols,
      hpBonus: engine.difficulty.hpBonus,
      tile: levelDef.tile
    };
    let layout = { bricks: [], counts: {} };
    if (levelDef.pat && levelDef.pat.length) {
      layout = R.Bricks.buildLayout(levelDef.pat, opts);
    } else if (levelDef.bonus) {
      // bonus stage: no bricks, falling capsule grid instead
      engine.bonusMode = true;
    }
    engine.bricks = layout.bricks;
    for (const b of engine.bricks) R.Bricks.resetBrickBase(b);

    if (!engine.bonusMode) {
      R.Hazards.initLevel(engine, levelDef);
    }

    if (levelDef.boss !== null && levelDef.boss !== undefined) {
      engine.boss = R.Boss.spawn(engine, levelDef.boss);
      engine.bossId = levelDef.boss;
      engine.bossName = engine.boss.name;
    } else {
      engine.boss = null;
      engine.bossId = null;
    }
    if (levelDef.mini !== null && levelDef.mini !== undefined) {
      engine.mini = R.Boss.miniSpawn(engine, levelDef.mini);
      engine.miniId = levelDef.mini;
      engine.miniName = engine.mini.name;
    } else {
      engine.mini = null;
      engine.miniId = null;
    }
    // apply the world's palette to plain-field bricks (respects endlessLockTheme)
    if (levelDef.pat && levelDef.pat.length && R.Art && R.Art.THEMES && R.Art.SCHEMES) {
      const { themeIdx, scheme } = sectorTheme(levelDef.n || 1, !!levelDef.endless, engine.wave);
      if (!levelDef.scheme) levelDef.scheme = scheme;
      R.Art.tintBricks(engine, themeIdx, levelDef.scheme);
    }
    return layout;
  }

  // Infinite/endless generator hook for UI
  function campaignLength() { return C.CAMPAIGN_LENGTH; }
  function hasCampaign(n) { return n >= 1 && n <= C.CAMPAIGN_LENGTH; }

  R.Levels = {
    WORLDS, worldFor, worldIndex, bossFor, isBonus,
    getCampaignLevel, getEndlessLevel, build, describe, sectorTheme,
    campaignLength, hasCampaign
  };
})(window.BREAK);
