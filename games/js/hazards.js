"use strict";
/* ============================================================
   DATA BREAK — field effects
   Player-fired shots (lasers / plasma / firewall spread).
   Hostile hazards were removed by design: this is a brick
   breaker, not a shooter — nothing falls toward the ship.
   Challenge comes from the data blocks themselves.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  // ---------------- level init ----------------
  function initLevel(engine) {
    // legacy arrays kept empty for API compatibility; no hostile entities exist
    engine.turrets.length = 0;
    engine.beams.length = 0;
    engine.projectiles.length = 0;
    engine.minions.length = 0;
    engine.shots.length = 0;
  }

  function update(engine, dt) {
    const frozen = engine.hasPower("freeze");

    // friendly laser shots (the only field projectiles left)
    for (let i = engine.shots.length - 1; i >= 0; i--) {
      const s = engine.shots[i];
      if (frozen) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y < -40 || s.x < -40 || s.x > engine.worldW + 40) {
        engine.shots.splice(i, 1);
      }
    }
  }

  function fireShot(engine, x, y, opts) {
    const o = opts || {};
    const plasma = engine.hasPower("plasma");
    const spread = engine.hasPower("firewall");
    const speed = o.speed || (plasma ? 900 : 780);
    engine.shots.push({
      x, y,
      vx: o.vx || 0,
      vy: -speed,
      r: plasma ? 10 : 6,
      dmg: plasma ? 2 : 1,
      plasma,
      spread: !!spread
    });
  }

  function render(engine, ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of engine.shots) {
      // bright core + colored halo: two arcs beat a per-shot radial gradient,
      // and read identically at these tiny radii
      const c = s.plasma ? "#fb923c" : "#f87171";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.95, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  R.Hazards = { initLevel, update, fireShot, render };
})(window.BREAK);
