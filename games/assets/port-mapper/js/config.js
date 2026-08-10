/* =========================================================================
   PORT MAPPER — config.js
   Core constants, difficulty tables and geometry tuning.
   ========================================================================= */
window.PM = window.PM || {};

PM.Config = (function () {
  'use strict';

  const STR = PM.STR.T;   // strings table — text is centralized in strings.js

  // ---- Logical canvas space (scaled to fit any window) --------------------
  const VW = 1280, VH = 720;

  // ---- Isometric geometry --------------------------------------------------
  const GEO = {
    hw: 46,          // reference half-width (entity art scales off this)
    hh: 24,
    z: 16,
    fillW: 0.84,     // fraction of canvas width the pyramid base spans
    compute: function (rows) {
      // size the cubes so the pyramid fills most of the screen at any size
      const hw = rows > 1 ? Math.floor((VW * this.fillW) / (2 * (rows - 1))) : 46;
      const hh = Math.round(hw * 0.52);
      const z = Math.round(hw * 0.38);
      // vertically CENTER the playfield: the pyramid spans from the apex cube's
      // top face (by - hh) to the plinth bottom (by + rows*hh + z), so put its
      // midpoint on VH/2 instead of hugging the bottom edge of the screen
      const by = Math.round(VH / 2 - ((rows - 1) * hh + z) / 2);
      return {
        hw: hw, hh: hh, z: z,
        cx: VW / 2,
        by: by,
        topY: by - hh - 30,     // where the patch-disc hovers
      };
    },
  };

  // ---- Pyramid layout -------------------------------------------------------
  function rowsForLevel(level) {
    // Level 1-3: classic 7 rows (28 cubes). Grows every 3 levels, capped at 10.
    return Math.min(7 + Math.floor((level - 1) / 3), 10);
  }

  // Cube state machine: 0 CLOSED -> 1 SCANNING -> 2 OPEN
  // Level 1 is a single pass (0 -> 2), levels 2+ are two passes.
  function multiPass(level) { return level >= 2; }

  // ---- Difficulty presets ---------------------------------------------------
  const DIFF = {
    easy: {
      id: 'easy', label: STR.diff.easy.label, short: STR.diff.easy.short,
      lives: 5, enemySpeed: 0.78, enemyCount: 0.75,
      hackerFrom: 5, redFrom: 4, greenFrom: 3, powerFreq: 1.35, wormDelay: 1.4,
      hackerFreq: 0.6,     // spawn-rate multiplier (higher = more frequent)
      hackerSpeed: 0.8,    // hop-speed scalar (1.0 = baseline 360ms hop)
      hackerLife: 0.7,     // life-span multiplier
      maxHackers: 1,
      desc: STR.diff.easy.desc,
    },
    normal: {
      id: 'normal', label: STR.diff.normal.label, short: STR.diff.normal.short,
      lives: 3, enemySpeed: 1.0, enemyCount: 1.0,
      hackerFrom: 3, redFrom: 2, greenFrom: 2, powerFreq: 1.0, wormDelay: 1.0,
      hackerFreq: 1.0,
      hackerSpeed: 1.0,
      hackerLife: 1.0,
      maxHackers: 2,
      desc: STR.diff.normal.desc,
    },
    hard: {
      id: 'hard', label: STR.diff.hard.label, short: STR.diff.hard.short,
      lives: 3, enemySpeed: 1.16, enemyCount: 1.22,
      hackerFrom: 1, redFrom: 1, greenFrom: 1, powerFreq: 0.85, wormDelay: 0.75,
      hackerFreq: 1.35,
      hackerSpeed: 1.18,
      hackerLife: 1.2,
      maxHackers: 2,
      desc: STR.diff.hard.desc,
    },
    gamer: {
      id: 'gamer', label: STR.diff.gamer.label, short: STR.diff.gamer.short,
      lives: 2, enemySpeed: 1.32, enemyCount: 1.5,
      hackerFrom: 1, redFrom: 1, greenFrom: 1, powerFreq: 0.65, wormDelay: 0.55,
      hackerFreq: 1.7,
      hackerSpeed: 1.4,
      hackerLife: 1.35,
      maxHackers: 3,
      desc: STR.diff.gamer.desc,
    },
  };

  // ---- Timing (ms) ----------------------------------------------------------
  const TIMING = {
    playerHop: 300,        // base hop duration for the Mapper
    playerHopOverclock: 200,
    overclockDur: 8000,
    freezeDur: 5000,
    reSecureWindow: 4000,  // ms after a hacker revert to claim the quick re-secure combo
    invuln: 2500,          // after respawn
    shieldInvuln: 1200,
    respawnDelay: 1100,
    levelClearPause: 2800,
    readyPause: 1600,
    levelBanner: 1200,
    discRide: 900,
    powerLife: 9000,
    powerSpawnBase: 13000,
    discRespawn: 20000,
    hackerLife: 30000,
    attractAutoStart: 30000,   // idle ms on the title before an auto-started round
    attractWarn: 5000,         // flash PRESS START during the final seconds
    attractReturn: 10000,      // idle ms on game over before cycling back to the title
  };

  // ---- Enemy tuning (level 1 base values, scaled per level/difficulty) -------
  const ENEMY = {
    eggHop: 460,           // Coily's egg bounce duration at level 1
    wormHop: 400,          // Coily (snake) chase hop duration at level 1
    pingHop: 430,          // flank-climber slide duration at level 1
    packetHop: 380,        // red packet bounce duration at level 1
    greenHop: 400,         // green freeze ball bounce duration
    hackerHop: 360,
    wormRespawn: 7000,     // delay before a new egg after a worm dies
    speedPerLevel: 0.965,  // enemy hop time multiplier each level (^ level-1)
    minHop: 190,
  };

  // ---- Scoring ---------------------------------------------------------------
  const SCORE = {
    firstChange: 15,
    finalChange: 25,
    reSecure: 75,        // bonus for re-opening a port the hacker knocked offline
    reSecureQuick: 150,  // higher combo payout when reclaimed fast after the revert
    reSecureStep: 50,    // each CONSECUTIVE quick re-secure raises the next payout (150→200→250…); a slow re-secure resets the streak
    reSecureMax: 400,    // base ceiling for the quick-combo escalation (level 1)
    reSecureMaxPerLevel: 50,  // the cap grows 50 per level (400→450→500…) so the arc keeps stretching on deep runs
    wormFall: 500,
    hackerCatch: 300,
    greenBall: 100,        // catching the freeze ball
    discRide: 200,
    discUnused: 100,
    powerPacket: 500,
    powerPickup: 100,      // firewall / overclock
    levelBase: 1000,
    levelPer: 250,         // added per level past 1
    levelCap: 5000,
    perfectBonus: 1500,
    chainCap: 5,           // max chain multiplier on cube changes
    extraLifeFirst: 8000,
    extraLifeStep: 14000,
  };

  // ---- Cube colour palette ---------------------------------------------------
  const CUBE = {
    // state: [top face, left face, right face, glow colour]
    0: { top: '#e2554a', left: '#70160f', right: '#9c2a20', glow: null },      // CLOSED
    1: { top: '#ffb13d', left: '#7d4a0c', right: '#a86614', glow: '#ffb13d' }, // SCANNING
    2: { top: '#3fe08a', left: '#0f5e38', right: '#1b8a52', glow: '#3fe08a' }, // OPEN
    edge: '#10142b',       // lattice line colour
  };

  const PALETTE = {
    bgTop: '#0b0f22', bgBottom: '#04050c',
    playerBody: '#eef4ff', playerVisor: '#3fd4ff', playerOutline: '#0a1020',
    // authentic Q*Bert colours: Coily (egg + snake) and Ugg/Wrongway are
    // purple; the bouncing packets are red; the freeze ball is green
    worm: '#b06bff', wormDark: '#6a25c4',
    ping: '#b06bff', pong: '#9b5cf0',
    packet: '#ff5b5b', greenball: '#5df28e',
    hacker: '#262b3d', hackerEyes: '#41f0ff',
    disc: '#9be8ff', discDark: '#2b6d8f',
    amber: '#ffb13d', cyan: '#3fd4ff', magenta: '#ff3bd4', green: '#3fe08a',
    white: '#f4f7ff', danger: '#ff4757',
  };

  // ---- Power-up definitions --------------------------------------------------
  const POWERUPS = {
    packet:    { label: STR.powerups.packet,  color: '#3fe08a', icon: 'packet',    pts: SCORE.powerPacket },
    firewall:  { label: STR.powerups.firewall, color: '#3fd4ff', icon: 'shield',    pts: SCORE.powerPickup },
    overclock: { label: STR.powerups.overclock, color: '#ffb13d', icon: 'bolt',     pts: SCORE.powerPickup },
  };

  return {
    VW, VH, GEO, rowsForLevel, multiPass, DIFF, TIMING, ENEMY, SCORE, CUBE, PALETTE, POWERUPS,
  };
})();
