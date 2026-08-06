"use strict";
/* ============================================================
   DATA BREAK — configuration & tuning
   ============================================================ */
window.BREAK = window.BREAK || {};
window.BREAK.Config = {

  // ---- world geometry (logical units) ----
  WORLD_H: 1200,          // fixed logical height
  WORLD_MIN_W: 760,       // narrowest playfield (portrait)
  WORLD_MAX_W: 1420,      // widest playfield (desktop landscape)
  CELL: 76,               // brick grid cell
  // data block sizes: kept narrower/shorter than the cell so blocks in a
  // formation show clean gaps instead of visually touching (the old 70px-wide
  // block in a 76px cell left 6px gaps, and its glow halo drew at w*1.2 = 84px
  // — wider than the cell, so halos bled into neighbors). Row pitch stays 36
  // (H + GAP) so every existing level layout keeps its exact row positions.
  BRICK_W: 58,            // block width  (cell - 18: ~9px gaps each side)
  BRICK_H: 26,            // block height
  BRICK_GAP_Y: 10,        // vertical gap between rows (row pitch = H + GAP)
  BRICK_TOP: 130,         // top row of bricks
  PADDLE_Y: 1086,         // ship baseline (world y)
  PADDLE_H: 30,
  WALL: 22,               // side wall thickness

  // ---- ball ----
  BALL_R: 12,
  BASE_SPEED: 560,        // units per second (Ricochet feel: brisk from the first launch)
  MAX_SPEED: 1150,
  PADDLE_ANGLE: 60,       // max reflect angle (degrees from vertical)
  SUBSTEP: 13,            // max units moved per physics substep

  // ---- ball speed ramp ----
  SPEED_RAMP: 9,          // launch speed gained per level (and per endless wave)
  SPEED_RAMP_LEVELS: 20,  // ramp plateaus after this level / wave

  // ---- power-up drops ----
  DROP_CHANCE: 0.16,      // base chance a destroyed brick sheds a capsule (more Ricochet-like showers)
  DROP_MAX_ALIVE: 9,      // cap capsules on screen (prevents floods)
  DROP_COMBO_SCALE: 0.03, // extra drop chance per combo point (up to 20)

  // ---- paddle feel ----
  PADDLE_GAIN: 0.016,     // speed gain per unit edge-hit on a paddle bounce (balls hot off the edge)
  PRECISION_ANGLE: 1.35,  // paddle-angle multiplier while precision is active
  PADDLE_SPEED: 880,      // keyboard/gamepad max paddle speed (u/s)
  PADDLE_ACCEL: 18,       // gamepad/analog stick easing (keyboard moves at constant speed)
  KEYBOARD_ACCEL: 22,     // keyboard ease-in rate: velocity ramps toward target speed.
                          // Constant-velocity stepping (speed*dt per frame) made taps
                          // frame-quantized (13px at 60Hz vs 6.5px at 120Hz) — coarse
                          // and display-dependent. Easing gives a 1-frame tap ~2px,
                          // 80ms tap ~55px, and makes distance frame-rate independent.
  KEYBOARD_BRAKE: 45,     // keyboard ease-out base rate on release: the brake glides
                          // to a stop instead of dead-snapping, so release timing is
                          // forgiving and the stop is predictable. The rate is boosted
                          // by KEYBOARD_BRAKE_SPEED as speed grows (see below).
  KEYBOARD_BRAKE_SPEED: 3, // speed-damped stopping distance: the effective brake rate
                          // scales with current speed (logistic decay), so a fast glide
                          // is pulled up hard (full-speed release ~8px, ~130ms) while a
                          // slow one still settles gently (~3px, ~115ms) — stopping feel
                          // stays consistent across the whole speed range instead of a
                          // constant-rate glide where a fast release coasted ~4x further
                          // than a slow one. 0 = old constant-rate behavior.
  KEYBOARD_EDGE_ZONE: 110, // keyboard held-edge nudge: as the paddle pushes toward a
                          // wall, the velocity target eases to 0 across this many pixels
                          // before the clamp, so a hard hold settles into the boundary
                          // (~15px/s touch, ~0.5s settle) instead of clanging against it
                          // at full speed. Away-from-wall motion is untouched.
  // banking feel: the ship leans toward its real velocity through a
  // spring-damper so direction changes read physical, not snapped.
  // Banking fallbacks — per-ship profiles (Ships.BANK) override these. Kept at
  // critical damping + modest max so the lean is a subtle cosmetic tilt: the ball
  // bounces off the BANKED paddle rect (collision rotates with the hull), so the
  // lean stays honest with where the ball actually reflects.
  PADDLE_BANK_VX_MAX: 1250,   // ceiling on the derived velocity fed to the bank target
                                // (was 1600; EMA does the real spike work, so the ceiling
                                // only guards the top — high enough that agile ships keep
                                // most of their lean character: cyber 83% of max)
  PADDLE_BANK_EMA_TAU: 0.05,   // seconds — EMA time constant on derived velocity; smooths
                                // one-frame spikes before the spring sees them (0 = off)
  PADDLE_BANK_SCALE: 0.00045, // target lean per unit of paddle velocity
  PADDLE_BANK_MAX: 0.6,       // max lean target (radians, pre render scale)
  PADDLE_BANK_RENDER: 0.12,   // visual lean = bank * this (art.js hull + engine.js thrusters)
  PADDLE_BANK_STIFF: 95,      // spring stiffness: how eagerly the ship leans
  PADDLE_BANK_DAMP: 20,       // ~critical damping for stiff 95 (2*sqrt): no overshoot
  TOUCH_SLINGSHOT_GAIN: 0.0018, // touch flick -> bankV kick (rad/s per px/s of flick)
  TOUCH_SLINGSHOT_MAX: 1.5,     // clamp on the flick kick (rad/s) — subtle carry, no whip
  TOUCH_AVG_SAMPLES: 4,         // sub-frame pointer averaging for touch drags (0 = off)
                                // pointermove can fire faster than the frame rate, so we
                                // average the recent world samples to kill finger tremor.
                                // Mouse is never routed through this — it stays raw 1:1.

  // ---- gameplay ----
  COMBO_WINDOW: 3.0,      // seconds to keep combo alive
  MULT_PER_HITS: 6,       // combo hits per multiplier step
  EXTRA_LIFE_SCORE: 12000,// score per bonus life
  POWERUP_SPEED: 330,     // capsule fall speed
  POWERUP_R: 26,
  LASER_COOLDOWN: 0.55,

  // ---- boss hp scaling ----
  // Boss HP curve (piecewise). Playtesting (live engine, duo+dmg kit) showed the
  // old fully-linear ramp left mid bosses too tanky: L15 was 49 HP -> ~108s duo-only,
  // ~60s with dmg2 kept up, vs the Ricochet 30-60s band. Base HP is now flatter and
  // the per-level multiplier grows gently through the mid-game (bosses 10-25 land in
  // the band) then accelerates after BOSS_HP_CURVE_KNEE so the finale stays
  // challenging (late kits - compression/vacuum +1, dmg3, multiball - multiply
  // damage 4-6x, so late HP must climb to compensate).
  BOSS_HP_PER_LEVEL: 0.016, // growth per level up to BOSS_HP_CURVE_KNEE (mid-game)
  BOSS_HP_CURVE_KNEE: 20, // campaign level where the late-game rate takes over
  // Late rate trimmed 0.03 -> 0.012: playtest with the realistic late-game kit
  // (duo + dmg2 + multiball) showed bosses 25-40 ran 80-118s medians (vs the
  // 30-60s band) - the old late ramp over-shot once ball speed + multiball
  // throughput was factored in. New table: 46/53/58/65 at L25/30/35/40.
  BOSS_HP_LATE_PER_LEVEL: 0.012, // growth per level after the knee (finale stays hard)
  BOSS_HP_EXPERT_BONUS: 0.3, // extra hp multiplier on Expert

  // ---- difficulty presets ----
  DIFFICULTIES: {
    trainee:  { name: "Trainee",   desc: "Forgiving system. 5 ships, slow scrubbers, wide craft.",        lives: 5, paddleW: 158, speed: 0.9,  dmg: 1,   scoreMult: 1.0,  hpBonus: 0 },
    standard: { name: "Standard",  desc: "The intended experience. Balanced and brisk.",                   lives: 3, paddleW: 134, speed: 1.0,  dmg: 1,   scoreMult: 1.0,  hpBonus: 0 },
    expert:   { name: "Expert",    desc: "Hostile core. 2 ships, fast scrubbers, reinforced data blocks.", lives: 2, paddleW: 118, speed: 1.08, dmg: 1,   scoreMult: 1.3,  hpBonus: 1 }
  },

  // ---- quality / fps ----
  FPS_CLAMP: 0.05,        // min dt to avoid spiral
  QUALITY: {
    // dprCap caps the canvas backing-store scale factor (fill-rate win on
    // high-density phones); particles/glow/bgDensity scale as before
    low:   { particles: 0.45, glow: false,  bgDensity: 0.6,  dprCap: 1.25 },
    med:   { particles: 0.8,  glow: true,   bgDensity: 0.85, dprCap: 1.5 },
    high:  { particles: 1.0,  glow: true,   bgDensity: 1.0,  dprCap: 2 }
  },

  // ---- run meta ----
  CAMPAIGN_LENGTH: 40,
  BOSS_LEVELS: { 5: 0, 10: 1, 15: 2, 20: 3, 25: 4, 30: 5, 35: 6, 40: 7 },
  BONUS_LEVELS: { 8: true, 18: true, 28: true, 38: true },
  // mini-boss encounters right before the even-world bosses (levels 7, 17,
  // 27, 37 — elite, non-gating). These map 1:1 onto the endless interlude
  // waves (7/17/27/37), so campaign and endless use the same minis.
  MINI_LEVELS: { 7: 0, 17: 1, 27: 2, 37: 3 }
};
