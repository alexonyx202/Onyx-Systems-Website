"use strict";
/* ============================================================
   DATA BREAK — power-ups
   Capsule drops, effects, duration timers.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const U = R.Util;
  const C = R.Config;

  const KINDS = {
    expand:   { name: "Expansion Field",  color: "#22d3ee", icon: "up",       dur: 0,   r: 3, desc: "Widen the maintenance ship" },
    shrink:   { name: "Nano Compactor",   color: "#a78bfa", icon: "down",     dur: 0,   r: 3, desc: "Shrink the maintenance ship" },
    life:     { name: "Spare Part",       color: "#34d399", icon: "heart",    dur: 0,   r: 1, desc: "Restore one maintenance ship" },
    multiball:{ name: "Multi Scrubber",   color: "#22d3ee", icon: "plus",     dur: 0,   r: 2, desc: "Add an extra data scrubber" },
    laser:    { name: "Laser Cannons",    color: "#fb7185", icon: "bolt",     dur: 12,  r: 2, desc: "Auto-fire cleansing lasers" },
    plasma:   { name: "Plasma Cannons",   color: "#f97316", icon: "flame",    dur: 12,  r: 1, desc: "Heavy piercing plasma shots" },
    sticky:   { name: "Adhesive Field",   color: "#c084fc", icon: "magnet",   dur: 12,  r: 2, desc: "Catch and re-aim scrubbers" },
    magnet:   { name: "Magnet Field",     color: "#60a5fa", icon: "ring",     dur: 10,  r: 2, desc: "Attract scrubbers and capsules" },
    slow:     { name: "Slow Motion",      color: "#22d3ee", icon: "snow",     dur: 8,   r: 2, desc: "Slow the whole sector" },
    speedup:  { name: "Overclock",        color: "#fbbf24", icon: "flame",    dur: 0,   r: 2, desc: "Boost scrubber velocity + bonus" },
    pierce:   { name: "Piercing Scrubber",color: "#38bdf8", icon: "bolt",     dur: 10,  r: 2, desc: "Scrubbers cut through data" },
    shield:   { name: "Shield",           color: "#38bdf8", icon: "shield",   dur: 0,   r: 2, desc: "Absorb one hit on the ship" },
    wall:     { name: "Safety Net",       color: "#34d399", icon: "shield2",  dur: 10,  r: 1, desc: "A barrier catches falling scrubbers" },
    autocollect: { name: "Auto Collect",  color: "#e879f9", icon: "ring",     dur: 10,  r: 1, desc: "Capsules drift toward the ship" },
    combomult:{ name: "Combo Amplifier",  color: "#fbbf24", icon: "x2",       dur: 15,  r: 1, desc: "Combo builds twice as fast" },
    firewall: { name: "Firewall Spread",  color: "#fb923c", icon: "wifi",     dur: 10,  r: 1, desc: "Spread-fire cleansing cannons" },
    virusclean: { name: "Virus Cleaner",  color: "#34d399", icon: "shield",   dur: 0,   r: 1, desc: "Purge all virus fragments instantly" },
    emp:      { name: "EMP Burst",        color: "#e879f9", icon: "ring",     dur: 0,   r: 1, desc: "Shockwave damages all data blocks" },
    drone:    { name: "Drone Assistant",  color: "#38bdf8", icon: "drone",    dur: 20,  r: 1, desc: "An escort drone catches scrubbers" },
    dmg2:     { name: "Double Damage",    color: "#fb7185", icon: "dmg2",     dur: 12,  r: 2, desc: "Scrubbers deal double damage" },
    dmg3:     { name: "Triple Damage",    color: "#f87171", icon: "dmg3",     dur: 12,  r: 1, desc: "Scrubbers deal triple damage" },
    gravity:  { name: "Gravity Shift",    color: "#c084fc", icon: "grav",     dur: 10,  r: 1, desc: "Scrubbers gain downward pull" },
    freeze:   { name: "Time Freeze",      color: "#22d3ee", icon: "clock",    dur: 4,   r: 1, desc: "Freeze moving data and hazards" },
    vacuum:   { name: "Data Vacuum",      color: "#5eead4", icon: "vac",      dur: 6,   r: 1, desc: "Strongly attract scrubbers & capsules" },
    scorex2:  { name: "Score Amplifier",  color: "#fbbf24", icon: "x2",       dur: 20,  r: 2, desc: "Double all score gained" },
    chain:    { name: "Chain Detonation", color: "#fb923c", icon: "bomb",     dur: 10,  r: 1, desc: "Destroyed blocks explode in a chain" },
    precision:{ name: "Precision Bounce", color: "#a3e635", icon: "bits",     dur: 10,  r: 1, desc: "Sharper, more controllable bounces" },
    ghost:    { name: "Ghost Scrubber",   color: "#94a3b8", icon: "ghost2",   dur: 8,   r: 1, desc: "Scrubbers pass through everything" },
    quantum:  { name: "Quantum Split",    color: "#67e8f9", icon: "split",    dur: 8,   r: 1, desc: "Scrubbers split into three on bounce" },
    cookie:   { name: "Cache Cookie",     color: "#d4a373", icon: "cookie",   dur: 0,   r: 1, desc: "Bonus points" },
    // --- bad capsules (Ricochet-style negative drops) ---
    // r: 2 (not 1) so the kernel ship's "boost rare drops" trait (rollKind
    // multiplies r<=1 kinds 2.2x) never amplifies the BAD capsules.
    chaos:    { name: "Chaos Scramble",   color: "#fb7185", icon: "chaos",    dur: 0,   r: 2, desc: "Scramble every scrubber's direction (bad!) " },
    drain:    { name: "Data Drain",       color: "#f87171", icon: "drain",    dur: 0,   r: 2, desc: "Drain one scrubber if you have extras (bad!) " }
  };

  let powerups = [];
  let seq = 1;

  // drop pool weight (rarity): lower = rarer
  const DROP_TABLE = [
    ["expand", 3], ["shrink", 3], ["life", 1], ["multiball", 3],
    ["laser", 2.5], ["plasma", 1.5], ["sticky", 2], ["magnet", 2],
    ["slow", 2], ["speedup", 2.5], ["pierce", 2], ["shield", 2],
    ["wall", 1.5], ["autocollect", 1.5], ["combomult", 1.5],
    ["firewall", 1.5], ["virusclean", 1], ["emp", 1], ["drone", 1],
    // dmg2/dmg3 boosted (playtest: 2/1 left a damage powerup so rare the
    // duo+dmg kit couldn't sustain the 30-60s boss TTK band; 3/1.5 makes a
    // damage capsule land roughly every other boss fight)
    ["dmg2", 3], ["dmg3", 1.5], ["gravity", 1.5], ["freeze", 1.5],
    ["vacuum", 1.5], ["scorex2", 2], ["chain", 1.5], ["precision", 1.5],
    ["ghost", 1.5], ["quantum", 1.5], ["cookie", 2],
    // bad capsules: chaos scramble + data drain round out the drop pool so a
    // shower of capsules isn't a pure win (Ricochet always mixes risk in).
    // Weight 3 each (~10% of the pool) so the bads are actually felt.
    ["chaos", 3], ["drain", 3]
  ];

  function rollKind(engine) {
    let table = DROP_TABLE;
    if (engine.shipId === "kernel") {
      // shift rarity toward rare ones
      table = DROP_TABLE.map(([k, w]) => [k, KINDS[k].r <= 1 ? w * 2.2 : w]);
    }
    const total = table.reduce((s, e) => s + e[1], 0);
    let v = U.rand(0, total);
    for (const [k, w] of table) {
      v -= w;
      if (v <= 0) return k;
    }
    return "cookie";
  }

  function spawn(engine, x, y, forced) {
    const kind = forced || rollKind(engine);
    const p = {
      id: seq++,
      kind,
      x, y,
      vx: U.rand(-30, 30),
      vy: C.POWERUP_SPEED,
      dead: false
    };
    powerups.push(p);
    return p;
  }

  function update(engine, dt) {
    const paddle = engine.paddle;
    const magnetR = engine.hasPower("magnet") ? 320
      : (engine.shipId === "cloud" || engine.scrubberId === "magnetic" || engine.scrubberId === "vacuum") ? 150
      : engine.hasPower("autocollect") ? 260 : 0;
    const vacuumR = engine.hasPower("vacuum") ? 460 : 0;
    const r = Math.max(magnetR, vacuumR);

    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - 1.5 * dt);

      if (r > 0) {
        const d = U.dist(p.x, p.y, paddle.x, paddle.y - 20);
        if (d < r && d > 1) {
          const pull = (1 - d / r) * (vacuumR > 0 ? 900 : 420);
          p.x += ((paddle.x - p.x) / d) * pull * dt;
          p.y += ((paddle.y - 20 - p.y) / d) * pull * dt;
        }
      }

      // catch on ship
      if (Math.abs(p.x - paddle.x) < paddle.w / 2 + C.POWERUP_R * 0.6 &&
          Math.abs(p.y - (paddle.y - C.PADDLE_H / 2)) < C.PADDLE_H / 2 + C.POWERUP_R * 0.9) {
        p.dead = true;
        apply(engine, p.kind);
        engine.onPowerup(p.kind);
        if (engine.bonusMode) engine.bonusCaught++;
        powerups.splice(i, 1);
        continue;
      }
      if (p.y > engine.worldH + 60) {
        powerups.splice(i, 1);
      }
    }
  }

  function apply(engine, kind) {
    const e = engine;
    switch (kind) {
      case "expand": {
        const pw = e.basePaddleW;
        e.paddle.w = Math.min(pw * 1.75, e.paddle.w + 42);
        if (e.paddle.w >= pw * 1.75) e.paddle.w = pw * 1.4; // rebound if maxed
        R.Particles.sparkle(e.paddle.x, e.paddle.y, "#22d3ee");
        break;
      }
      case "shrink": {
        const pw = e.basePaddleW;
        e.paddle.w = Math.max(pw * 0.5, e.paddle.w - 34);
        R.Particles.sparkle(e.paddle.x, e.paddle.y, "#a78bfa");
        break;
      }
      case "life":
        e.lives = Math.min(9, e.lives + 1);
        R.Audio.play("life");
        R.Particles.confetti(e.paddle.x, e.paddle.y - 40, 30);
        break;
      case "multiball":
        e.addBall(e.paddle.x + (U.chance(0.5) ? -60 : 60), e.paddle.y - 30);
        R.Particles.burst(e.paddle.x, e.paddle.y, { count: 16, color: "#22d3ee", speed: 260 });
        break;
      case "laser":
      case "plasma":
      case "firewall":
        e.setPower(kind, KINDS[kind].dur);
        break;
      case "sticky":
        e.setPower("sticky", KINDS.sticky.dur);
        break;
      case "magnet":
      case "autocollect":
      case "vacuum":
        e.setPower(kind, KINDS[kind].dur);
        break;
      case "slow":
        e.setPower("slow", 8);
        break;
      case "speedup": {
        e.balls.forEach((b) => {
          const l = U.len(b.vx, b.vy);
          const nv = Math.min(C.MAX_SPEED, l * 1.28);
          b.vx = b.vx / l * nv; b.vy = b.vy / l * nv;
        });
        e.addScore(150, e.paddle.x, e.paddle.y - 40);
        R.Particles.burst(e.paddle.x, e.paddle.y, { count: 14, color: "#fbbf24", speed: 240 });
        break;
      }
      case "pierce": e.setPower("pierce", 10); break;
      case "shield": {
        if (!e.paddle.shield) {
          e.paddle.shield = 1;
          e.paddle.shieldFlash = 1;
          R.Audio.play("shield");
        } else {
          e.addScore(500, e.paddle.x, e.paddle.y - 30);
        }
        break;
      }
      case "wall": e.setPower("wall", 10); break;
      case "combomult": e.setPower("combomult", 15); break;
      case "virusclean": {
        let n = 0;
        for (let i = e.bricks.length - 1; i >= 0; i--) {
          const b = e.bricks[i];
          if (b.type === "virus") { e.destroyBrick(b, "cleaner"); n++; }
        }
        e.addScore(300 * n, e.paddle.x, e.paddle.y - 40);
        R.Audio.play("boom");
        break;
      }
      case "emp": {
        for (const b of [...e.bricks]) {
          if (b.type === "steel") continue;
          if (b.type === "shield" || b.type === "lock") { b.hp -= 2; if (b.hp <= 0) e.destroyBrick(b, "emp"); continue; }
          e.damageBrick(b, 1, "emp");
        }
        R.Particles.ring(e.paddle.x, e.paddle.y - 80, "#e879f9", 40, 0.5);
        R.Audio.play("boom");
        break;
      }
      case "drone": {
        if (!e.drone) e.drone = { x: e.paddle.x - 120, y: e.paddle.y, alive: true, t: 0 };
        e.setPower("drone", 20);
        break;
      }
      case "dmg2": e.setPower("dmg2", 12); break;
      case "dmg3": e.setPower("dmg3", 12); break;
      case "gravity": e.setPower("gravity", 10); break;
      case "freeze": e.setPower("freeze", 4); break;
      case "scorex2": e.setPower("scorex2", 20); break;
      case "chain": e.setPower("chain", 10); break;
      case "precision": e.setPower("precision", 10); break;
      case "ghost": e.setPower("ghost", 8); break;
      case "quantum": e.setPower("quantum", 8); break;
      case "cookie": e.addScore(1000, e.paddle.x, e.paddle.y - 40); break;
      // --- bad capsules ---
      case "chaos": {
        // scramble every flying scrubber's direction (keep its speed) — the
        // player must re-catch the chaos, Ricochet style
        for (const b of e.balls) {
          if (b.stuck) continue;
          const sp = U.len(b.vx, b.vy) || 1;
          const a = U.rand(-Math.PI * 0.85, -Math.PI * 0.15);
          b.vx = Math.cos(a) * sp;
          b.vy = Math.sin(a) * sp;
        }
        R.Audio.play("alert");
        R.Particles.ring(e.paddle.x, e.paddle.y - 60, "#fb7185", 40, 0.5);
        e.toast("CHAOS SCRAMBLE", "#fb7185");
        break;
      }
      case "drain": {
        // pull one extra scrubber out of play if there are more than one
        // (never the last ball — that would end a life); otherwise the drain
        // has nothing to take and only makes a warning ping. Splice by
        // identity, deliberately NOT via loseBall(): the bad capsule is about
        // losing a ball, not silently wiping the combo / forfeiting the
        // no-miss achievement.
        const flyers = e.balls.filter((b) => !b.stuck);
        if (e.balls.length > 1 && flyers.length > 0) {
          const victim = flyers[flyers.length - 1];
          const idx = e.balls.indexOf(victim);
          if (idx >= 0) e.balls.splice(idx, 1);
          R.Particles.burst(victim.x, victim.y, { count: 14, color: "#f87171", speed: 220 });
        }
        R.Audio.play("alert");
        R.Particles.burst(e.paddle.x, e.paddle.y - 60, { count: 12, color: "#f87171", speed: 220 });
        e.toast("DATA DRAIN", "#f87171");
        break;
      }
    }
  }

  function render(engine, ctx, t) {
    for (const p of powerups) {
      R.Art.drawPowerup(ctx, p, t);
    }
  }

  function clear() { powerups.length = 0; }
  function count() { return powerups.length; }
  function all() { return powerups; }

  R.Powerups = { KINDS, spawn, update, render, apply, clear, count, all, rollKind };
})(window.BREAK);
