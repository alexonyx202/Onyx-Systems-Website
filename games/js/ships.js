"use strict";
/* ============================================================
   DATA BREAK — Tech Maintenance Ships
   Ten craft, each with a distinct gameplay modifier.
   Unlocks are tied to campaign progress.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  // per-ship banking profile: how the hull leans into motion.
  //   scale — target lean per unit of velocity (larger = leans further at speed)
  //   max   — clamp on the lean target in radians (pre render scale). Kept modest
  //           so the drawn hull stays close to its flat collision box: the ball
  //           bounces off the unrotated paddle rect, so a huge lean reads as
  //           imprecise (you aim with the tilted ship, the ball ignores the tilt).
  //   stiff — spring stiffness (higher = snaps to the lean faster)
  //   damp  — spring damping. Set to ~2*sqrt(stiff) = critical damping: the lean
  //           eases in and recovers in one smooth pass with NO overshoot, so fast
  //           direction reversals settle clean instead of ringing/jumping.
  // absent keys fall back to Config.PADDLE_BANK_* globals.
  // class identity: heavy 'server' leans slowly but relatively further; agile
  // 'cyber' leans fast and shallow; the rest are tuned between.
  const BANK = {
    laptop:   { scale: 0.00045, max: 0.6,  stiff: 95,  damp: 20 },
    server:   { scale: 0.00075, max: 0.8,  stiff: 55,  damp: 15 },
    ai:       { scale: 0.0005,  max: 0.65, stiff: 100, damp: 20 },
    cyber:    { scale: 0.0003,  max: 0.45, stiff: 165, damp: 26 },
    quantum:  { scale: 0.0006,  max: 0.7,  stiff: 85,  damp: 18 },
    mother:   { scale: 0.00065, max: 0.75, stiff: 70,  damp: 17 },
    firewall: { scale: 0.00045, max: 0.6,  stiff: 95,  damp: 20 },
    cloud:    { scale: 0.0004,  max: 0.55, stiff: 130, damp: 23 },
    net:      { scale: 0.0005,  max: 0.65, stiff: 105, damp: 21 },
    kernel:   { scale: 0.0005,  max: 0.65, stiff: 95,  damp: 20 }
  };

  const DEFS = {
    laptop:   { name: "Laptop Repair Drone",       trait: "+precision bounces",            desc: "Agile all-rounder maintenance craft." },
    server:   { name: "Server Maintenance Craft",  trait: "+12% width, slower",            desc: "Wide stable platform, deliberate pace." },
    ai:       { name: "AI Repair Unit",            trait: "auto-aim toward data",          desc: "Self-correcting shot guidance." },
    cyber:    { name: "Cyber Technician Hovercraft", trait: "+12% speed, narrower",         desc: "Fast and responsive, tighter footprint." },
    quantum:  { name: "Quantum Maintenance Platform", trait: "8% scrubber split",           desc: "Occasionally forks scrubbers on bounce." },
    mother:   { name: "Motherboard Cruiser",       trait: "15% pierce on bounce",           desc: "Grants temporary piercing flights." },
    firewall: { name: "Firewall Defender",         trait: "starts with shield",             desc: "Deploys with one absorbing shield." },
    cloud:    { name: "Cloud Maintenance Drone",   trait: "capsules drift to ship",         desc: "Magnetic deck attracts power-ups." },
    net:      { name: "Network Engineer Craft",    trait: "faster combo + lasers",          desc: "Combo builds quicker, lasers recharge faster." },
    kernel:   { name: "Kernel Repair Ship",        trait: "rares drop more often",          desc: "Tuned to attract rare power-ups." }
  };

  // resolved banking profile for a ship id (Config globals as fallback)
  function bank(id) {
    const b = BANK[id] || {};
    const C = R.Config;
    return {
      scale: b.scale !== undefined ? b.scale : C.PADDLE_BANK_SCALE,
      max:   b.max   !== undefined ? b.max   : C.PADDLE_BANK_MAX,
      stiff: b.stiff !== undefined ? b.stiff : C.PADDLE_BANK_STIFF,
      damp:  b.damp  !== undefined ? b.damp  : C.PADDLE_BANK_DAMP
    };
  }

  const UNLOCKS = {
    ai: 6, quantum: 10, mother: 15, firewall: 20, cloud: 25, net: 30, kernel: 40
  };

  const START = ["laptop", "server", "cyber"];

  function unlocked() {
    return R.Save.get("progress.ships", START);
  }

  function isUnlocked(id) {
    return unlocked().includes(id);
  }

  // called by the engine whenever progress may have advanced
  function unlockCheck() {
    const maxLevel = R.Save.get("progress.maxLevel", 1);
    const have = unlocked();
    let changed = false;
    for (const [id, lvl] of Object.entries(UNLOCKS)) {
      if (maxLevel >= lvl && !have.includes(id)) {
        have.push(id);
        changed = true;
        R.UI.toast("SHIP UNLOCKED — " + DEFS[id].name.toUpperCase(), "#c084fc");
      }
    }
    if (changed) R.Save.set("progress.ships", have);
  }

  function list() {
    return Object.keys(DEFS);
  }
  function get(id) { return DEFS[id] || DEFS.laptop; }

  R.Ships = { DEFS, BANK, bank, list, get, unlocked, isUnlocked, unlockCheck };
})(window.BREAK);
