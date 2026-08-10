/* =========================================================================
   PORT MAPPER — rng.js
   Seedable deterministic PRNG. Every random draw in the simulation (world
   construction, enemy AI, spawn timers, particles, the attract bot) flows
   through this stream, so a run started from the same seed replays
   byte-for-byte — the foundation for seeded daily challenges, portable
   score codes and deterministic replays.

   Force a seed from the URL:  index.html?seed=12345
   ========================================================================= */
window.PM = window.PM || {};

PM.RNG = (function () {
  'use strict';

  let state = 0;                 // current 32-bit seed (what setSeed accepted)
  let next = mulberry32((Math.random() * 0xFFFFFFFF) >>> 0);

  // mulberry32 — tiny, fast, decent-quality PRNG seeded from a 32-bit int.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Seed the stream. Without a numeric seed, picks a fresh random one.
  function setSeed(seed) {
    state = (typeof seed === 'number' && isFinite(seed)) ? (seed >>> 0) : ((Math.random() * 0xFFFFFFFF) >>> 0);
    next = mulberry32(state);
    return state;
  }

  function seed() { return state; }

  // float in [0, 1) — the only draw primitive; callers shape it as needed.
  // A plain function reference so `const rnd = RNG.f` works without binding.
  function f() { return next(); }

  return { setSeed, seed, f };
})();
