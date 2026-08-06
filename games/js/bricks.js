"use strict";
/* ============================================================
   DATA BREAK — data blocks (bricks)
   Types, factory, movement/regeneration/timing behaviors.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const U = R.Util;
  const C = R.Config;

  const TYPE_DEFS = {
    normal:    { hp: 1, score: 10,  label: "Cache Block",          style: "normal" },
    binary:    { hp: 1, score: 12,  label: "Binary Cluster",       style: "binary" },
    strong:    { hp: 2, score: 20,  label: "Corrupted File",       style: "strong" },
    super:     { hp: 4, score: 40,  label: "Encrypted Data",       style: "super" },
    steel:     { hp: -1, score: 0,  label: "Corrupted Sector",     style: "steel" },
    explosive: { hp: 1, score: 30,  label: "Exploding File",       style: "explosive" },
    moving:    { hp: 1, score: 15,  label: "Moving Encryption",    style: "moving" },
    regen:     { hp: 2, score: 25,  label: "Regenerating Cache",   style: "regen" },
    hidden:    { hp: 1, score: 15,  label: "Ghost Data",           style: "hidden" },
    gravity:   { hp: 1, score: 18,  label: "Gravity Block",        style: "gravity" },
    splitter:  { hp: 1, score: 25,  label: "Splitter Module",      style: "splitter" },
    virus:     { hp: 2, score: 35,  label: "Virus Fragment",       style: "virus" },
    bomb:      { hp: 1, score: 40,  label: "Logic Bomb",           style: "bomb" },
    lock:      { hp: 3, score: 50,  label: "Security Lock",        style: "lock" },
    shield:    { hp: 2, score: 20,  label: "Boss Shield Cell",     style: "shield" },
    cache:     { hp: 1, score: 45,  label: "Cache Cell",           style: "cache" },
    prism:     { hp: 1, score: 25,  label: "Prism Cell",           style: "prism" },    // Y: refracts the ball faster off its face
    flicker:   { hp: 1, score: 15,  label: "Phantom Cache",        style: "flicker" }  // F: phases solid<->ghost on a timer
  };

  let brickId = 1;

  function make(type, col, row, cols, rows) {
    const def = TYPE_DEFS[type];
    const cell = C.CELL;
    const w = C.BRICK_W, h = C.BRICK_H;
    // center the block inside its grid cell (inset = (cell - w) / 2) so
    // formations read as evenly gapped tiles instead of touching slabs
    const inset = Math.floor((cell - w) / 2);
    const gridW = cols * cell;
    const x = (col * cell + inset) + (R.Engine.worldW - gridW) / 2;
    const y = C.BRICK_TOP + row * (h + C.BRICK_GAP_Y);
    const hp = def.hp < 0 ? -1 : def.hp;
    return {
      id: brickId++,
      type, style: def.style, label: def.label,
      hp, maxHp: hp,
      score: def.score,
      x, y, w, h,
      col, row,
      // dynamics
      phase: U.rand(0, U.TAU),
      dir: U.chance(0.5) ? 1 : -1,
      speed: U.rand(22, 38),
      // flicker blocks ride the same hiddenState ghost flag the engine's
      // collision/rendering already skip, but they manage it themselves:
      // start solid and phase to ghost every half-cycle (unlike hidden,
      // which starts ghost and waits for a neighbor reveal).
      hiddenState: type === "hidden" ? "ghost" : type === "flicker" ? "solid" : null,
      flickT: type === "flicker" ? U.rand(0.4, 1.4) : 0,
      regenT: type === "regen" ? 1.8 : 0,
      flash: 0,
      shake: 0,
      bombT: type === "bomb" ? U.rand(7, 11) : 0
    };
  }

  // Build a level layout from pattern rows (strings).
  // Returns array of bricks and a counts object.
  function buildLayout(rows, opts) {
    const o = opts || {};
    const cols = o.cols || Math.round(R.Engine.worldW / C.CELL);
    const bricks = [];
    const counts = {};
    const patW = Math.max(...rows.map((r) => r.length));
    let yCount = 0;

    rows.forEach((rowStr, ri) => {
      let chars;
      if (o.tile) {
        // repeat pattern across full width
        chars = Array.from({ length: cols }, (_, c) => rowStr[c % rowStr.length]);
      } else {
        const pad = Math.floor((cols - patW) / 2);
        const start = pad < 0 ? -pad : 0;   // crop if too narrow
        chars = Array.from({ length: cols }, (_, c) => {
          const idx = c - pad;
          if (idx < 0 || idx >= rowStr.length) return ".";
          return rowStr[idx + start];
        });
      }
      for (let c = 0; c < cols; c++) {
        const ch = chars[c];
        const type = charType(ch);
        if (!type) continue;
        const hpBonus = o.hpBonus || 0;
        const b = make(type, c, ri, cols, rows.length);
        if (hpBonus && TYPE_DEFS[type].hp > 0 && (type === "normal" || type === "binary" || type === "strong")) {
          b.hp += hpBonus;
          b.maxHp += hpBonus;
        }
        if (o.ballSpeed) b.levelSpeed = o.ballSpeed;
        bricks.push(b);
        counts[type] = (counts[type] || 0) + 1;
      }
      yCount++;
    });
    // boss shield bricks and special block types spawn their own extra rows
    return { bricks, counts, rows: yCount };
  }

  function charType(ch) {
    switch (ch) {
      case "#": return "normal";
      case "B": return "binary";
      case "S": return "strong";
      case "T": return "super";
      case "X": return "steel";
      case "E": return "explosive";
      case "M": return "moving";
      case "R": return "regen";
      case "H": return "hidden";
      case "G": return "gravity";
      case "P": return "splitter";
      case "V": return "virus";
      case "O": return "bomb";       // O = bomb (circle)
      case "L": return "lock";
      case "W": return "shield";     // W = boss shield wall
      case "C": return "cache";      // C = cache cell (always drops a capsule)
      case "Y": return "prism";      // Y = prism cell (refracts the ball faster)
      case "F": return "flicker";    // F = phantom cache (phases solid<->ghost)
      default: return null;
    }
  }

  function updateBricks(engine, dt) {
    const t = engine.time;
    const bricks = engine.bricks;
    // Iterate a snapshot: a detonating bomb splices itself out AND explodeBlock()
    // splices nearby bricks out of this same live array mid-pass. A backward loop
    // over the live array (length captured once) then reads past the shrunken
    // array and hits undefined -> crash (reproduced on the L40 Malware Hive fight,
    // the boss that spams explosive O/E bricks). Snapshotting keeps every brick
    // from frame start processed exactly once regardless of mid-pass splices.
    for (const b of [...bricks]) {
      b.phase += dt;
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 4);
      if (b.shake > 0) b.shake = Math.max(0, b.shake - dt * 60);
      const frozen = engine.hasPower("freeze");

      if (b.type === "moving" && !frozen) {
        b.x += b.dir * b.speed * dt;
        const gridW = engine.cols * C.CELL;
        const margin = (engine.worldW - gridW) / 2 + b.w / 2 + 4;
        const minX = margin, maxX = engine.worldW - margin;
        if (b.x < minX || b.x + b.w > maxX) { b.dir *= -1; b.x = U.clamp(b.x, minX, maxX - b.w); }
        engine.bricksDirty = true;   // moving bricks leave their grid cell
      }
      if (b.type === "gravity" && !frozen) {
        // sway: kept under half the inter-cell gap ((CELL - BRICK_W) / 2 = 9) so
        // adjacent gravity blocks never clip into each other at full amplitude
        b.x = b.baseX + Math.sin(t * 1.6 + b.phase) * 8;
        engine.bricksDirty = true;
      }
      if (b.type === "regen" && !frozen) {
        if (b.hp < b.maxHp) {
          b.regenT -= dt;
          if (b.regenT <= 0) {
            b.hp = b.maxHp;
            b.flash = 1;
          }
        } else {
          b.regenT = 1.8;
        }
      }
      if (b.type === "hidden" && b.hiddenState === "ghost") {
        // reveal when a neighbor is destroyed or on proximity — engine handles on destroy
        if (b.revealT) { b.revealT -= dt; if (b.revealT <= 0) { b.hiddenState = "solid"; b.flash = 1; } }
      }
      if (b.type === "flicker" && !frozen) {
        // phase solid<->ghost on a half-cycle timer; the ball weaves through
        // while ghost and hits while solid — timing beats raw HP.
        b.flickT -= dt;
        if (b.flickT <= 0) {
          b.flickT = 0.9;
          b.hiddenState = b.hiddenState === "solid" ? "ghost" : "solid";
          b.flash = 0.7;
        }
      }
      if (b.type === "bomb") {
        b.bombT -= dt;
        if (b.bombT <= 0) {
          // remove by identity first: explodeBlock() splices neighbors out of the
          // same array, so the loop index is stale by then
          const idx = bricks.indexOf(b);
          if (idx >= 0) bricks.splice(idx, 1);
          engine.explodeBlock(b, true);
        }
      }
    }
  }

  // reveal hidden neighbors of a destroyed brick
  function revealNeighbors(engine, col, row) {
    for (const b of engine.bricks) {
      if (b.type === "hidden" && b.hiddenState === "ghost" && Math.abs(b.col - col) <= 1 && Math.abs(b.row - row) <= 1) {
        b.hiddenState = "solid";
        b.flash = 1;
        R.Audio.play("ui");
      }
    }
  }

  function resetBrickBase(b) {
    b.baseX = b.x;
    b.baseY = b.y;
  }

  R.Bricks = { TYPE_DEFS, make, buildLayout, updateBricks, revealNeighbors, resetBrickBase, charType };
})(window.BREAK);
