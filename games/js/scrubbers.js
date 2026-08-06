"use strict";
/* ============================================================
   DATA BREAK — Data Scrubber types
   Twelve scrubbers, each with a distinct gameplay modifier.
   Unlocks are tied to campaign progress, exactly like ships.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const DEFS = {
    standard:   { name: "Standard Scrubber",   trait: "Balanced",               desc: "Reliable all-round data cleaner." },
    antivirus:  { name: "Anti-Virus Scrubber", trait: "+1 dmg vs virus",        desc: "Virus fragments break in one hit." },
    quantum:    { name: "Quantum Scrubber",    trait: "8% chance split x3",     desc: "Occasionally forks on bounce." },
    nano:       { name: "Nano Scrubber",       trait: "Small & fast",           desc: "Tiny footprint, quick launches." },
    magnetic:   { name: "Magnetic Scrubber",   trait: "Pulls capsules",         desc: "Power-ups drift toward the ship." },
    laser:      { name: "Laser Scrubber",      trait: "Stronger lasers",        desc: "Laser cannons deal double damage." },
    compression:{ name: "Compression Scrubber",trait: "Heavy impact +1 dmg",    desc: "Massive ball crushes data blocks." },
    emp:        { name: "EMP Scrubber",        trait: "EMP chain on destroy",   desc: "Destroyed blocks arc to neighbors." },
    breaker:    { name: "Breaker Scrubber",    trait: "+1 dmg vs strong",       desc: "Chews through reinforced files." },
    duo:        { name: "Duo Scrubber",        trait: "Launches two scrubbers", desc: "Every life starts with twin balls." },
    multicore:  { name: "Multicore Scrubber",  trait: "8% chance split x2",     desc: "Occasionally forks on bounce." },
    vacuum:     { name: "Vacuum Scrubber",     trait: "+1 dmg, pulls capsules", desc: "Crushing pull that drags drops in." }
  };

  // level at which each scrubber becomes available
  const UNLOCKS = {
    quantum: 6, duo: 10, magnetic: 15, laser: 20,
    compression: 25, emp: 30, breaker: 35, multicore: 38, vacuum: 40
  };

  const START = ["standard", "antivirus", "nano"];

  function unlocked() {
    return R.Save.get("progress.scrubbers", START);
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
        R.UI.toast("SCRUBBER UNLOCKED — " + DEFS[id].name.toUpperCase(), "#c084fc");
      }
    }
    if (changed) R.Save.set("progress.scrubbers", have);
  }

  function list() {
    return Object.keys(DEFS);
  }
  function get(id) { return DEFS[id] || DEFS.standard; }
  function unlockLevel(id) { return UNLOCKS[id] || null; }

  R.Scrubbers = { DEFS, UNLOCKS, START, list, get, unlocked, isUnlocked, unlockCheck, unlockLevel };
})(window.BREAK);
