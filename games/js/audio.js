"use strict";
/* ============================================================
   DATA BREAK — audio engine
   All sounds synthesized with Web Audio (no assets, fully offline).
   SFX: oscillator/noise envelopes. Music: step sequencer.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let musicOn = true;
  let sfxOn = true;
  let currentSong = null;
  let songTimer = null;
  let nextStep = 0;
  let step = 0;
  let running = false;
  let intensity = 0;          // 0-3 music intensity (combo-driven layers)

  const NOISE_BUF_CACHE = {};

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      master.connect(comp);
      comp.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = musicOn ? 0.5 : 0;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = sfxOn ? 1 : 0;
      sfxGain.connect(master);
      return true;
    } catch (e) {
      return false;
    }
  }

  function noiseBuffer(type) {
    if (NOISE_BUF_CACHE[type]) return NOISE_BUF_CACHE[type];
    const len = ctx.sampleRate * 1;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    NOISE_BUF_CACHE[type] = buf;
    return buf;
  }

  function env(g, t0, a, peak, d, target = 0.0001) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(target, t0 + a + d);
  }

  function tone(opts) {
    if (!ctx) return;
    const { type = "square", f0 = 440, f1 = null, dur = 0.12, vol = 0.3, delay = 0, slideExp = false } = opts;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) {
      if (slideExp) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    }
    env(g, t0, 0.004, vol, dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(opts) {
    if (!ctx) return;
    const { dur = 0.12, vol = 0.3, delay = 0, freq = 4000, q = 0.8, type = "bandpass" } = opts;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer("n");
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t0, 0.003, vol, dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // ---------------- one-shot SFX ----------------
  const SFX = {
    paddle() { tone({ type: "triangle", f0: 300, f1: 190, dur: 0.07, vol: 0.25 }); },
    wall()   { tone({ type: "sine", f0: 240, f1: 180, dur: 0.05, vol: 0.18 }); },
    brick(kind = "normal") {
      const base = kind === "strong" ? 320 : kind === "super" ? 240 : 420;
      tone({ type: "square", f0: base, f1: base * 0.8, dur: 0.06, vol: 0.22 });
      if (kind === "super") noise({ dur: 0.09, vol: 0.14, freq: 900 });
    },
    boom()   { tone({ type: "sawtooth", f0: 200, f1: 40, dur: 0.34, vol: 0.4, slideExp: true }); noise({ dur: 0.3, vol: 0.3, freq: 700, type: "lowpass" }); },
    chain()  { tone({ type: "square", f0: 700, f1: 120, dur: 0.16, vol: 0.3, slideExp: true }); },
    power()  { tone({ type: "square", f0: 520, f1: 1040, dur: 0.12, vol: 0.25 }); tone({ type: "square", f0: 780, f1: 1560, dur: 0.14, vol: 0.2, delay: 0.06 }); },
    laser()  { tone({ type: "sawtooth", f0: 900, f1: 260, dur: 0.12, vol: 0.2, slideExp: true }); },
    hurt()   { tone({ type: "sawtooth", f0: 300, f1: 60, dur: 0.4, vol: 0.4, slideExp: true }); noise({ dur: 0.35, vol: 0.28, freq: 500, type: "lowpass" }); },
    life()   { [660, 880, 1320].forEach((f, i) => tone({ type: "triangle", f0: f, dur: 0.12, vol: 0.25, delay: i * 0.09 })); },
    boss()   { tone({ type: "sawtooth", f0: 110, f1: 55, dur: 0.7, vol: 0.4, slideExp: true }); noise({ dur: 0.6, vol: 0.2, freq: 300, type: "lowpass" }); },
    bossHit(){ tone({ type: "square", f0: 180, f1: 90, dur: 0.09, vol: 0.3, slideExp: true }); },
    combo(n) { const f = 440 * Math.pow(1.06, Math.min(n, 12)); tone({ type: "square", f0: f, dur: 0.07, vol: 0.14 }); },
    launch() { tone({ type: "triangle", f0: 240, f1: 720, dur: 0.14, vol: 0.28 }); },
    explode(){ noise({ dur: 0.5, vol: 0.42, freq: 400, type: "lowpass" }); tone({ type: "sawtooth", f0: 150, f1: 30, dur: 0.5, vol: 0.4, slideExp: true }); },
    turret() { tone({ type: "square", f0: 600, f1: 220, dur: 0.1, vol: 0.18, slideExp: true }); },
    alert()  { tone({ type: "square", f0: 620, dur: 0.09, vol: 0.2 }); tone({ type: "square", f0: 620, dur: 0.09, vol: 0.2, delay: 0.14 }); },
    ui()     { tone({ type: "sine", f0: 700, f1: 900, dur: 0.06, vol: 0.16 }); },
    tick()   { tone({ type: "square", f0: 1000, dur: 0.03, vol: 0.1 }); },
    win()    { [523, 659, 784, 1047].forEach((f, i) => tone({ type: "triangle", f0: f, dur: 0.16, vol: 0.26, delay: i * 0.11 })); },
    winBoss(){
      // triumphant boss-kill fanfare: deep root + rising arpeggio + shimmer
      tone({ type: "triangle", f0: 196, dur: 0.55, vol: 0.3 });
      [262, 330, 392, 523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone({ type: "triangle", f0: f, dur: 0.2, vol: 0.24, delay: 0.12 + i * 0.09 }));
      tone({ type: "square", f0: 196, dur: 0.5, vol: 0.14, delay: 0.1 });
      noise({ dur: 0.5, vol: 0.14, freq: 5200, type: "highpass", delay: 0.85 });
    },
    lose()   { [392, 330, 262, 196].forEach((f, i) => tone({ type: "triangle", f0: f, dur: 0.2, vol: 0.26, delay: i * 0.15 })); },
    shield() { tone({ type: "sine", f0: 180, f1: 520, dur: 0.18, vol: 0.3 }); },
    freeze() { tone({ type: "sine", f0: 1200, f1: 2400, dur: 0.3, vol: 0.18 }); tone({ type: "sine", f0: 800, f1: 200, dur: 0.3, vol: 0.18, delay: 0.05 }); },
    vacuum() { noise({ dur: 0.5, vol: 0.2, freq: 2500, q: 0.4 }); tone({ type: "sine", f0: 400, f1: 80, dur: 0.5, vol: 0.24, slideExp: true }); }
  };

  // ---------------- music sequencer ----------------
  // Tracks are 16-step patterns; drums + bass + arp + lead.

  const SONGS = {
    menu: {
      bpm: 104,
      bass: [0, 0, 7, 0, 0, 10, 0, 5, 0, 0, 7, 0, 12, 0, 10, 0],
      bassOct: [0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0],
      arp:  [0, 7, 12, 7, 0, 7, 12, 15, 0, 7, 12, 7, 10, 12, 15, 12],
      arpOn:[1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      hat:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
      snare:[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      key: "a"
    },
    action: {
      bpm: 126,
      bass: [0, 0, 3, 0, 0, 5, 0, 3, 0, 0, 3, 0, 0, 7, 5, 3],
      bassOct:[0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1],
      arp:  [0, 12, 7, 12, 3, 12, 7, 12, 5, 12, 8, 12, 7, 12, 10, 12],
      arpOn:[1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
      hat:  [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
      snare:[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
      key: "d"
    },
    boss: {
      bpm: 138,
      bass: [0, 0, 0, 1, 0, 0, 5, 0, 0, 0, 0, 1, 0, 0, 8, 0],
      bassOct:[0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
      arp:  [0, 3, 7, 10, 0, 3, 7, 10, 0, 3, 7, 12, 0, 3, 7, 10],
      arpOn:[1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
      kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1],
      hat:  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      snare:[0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      key: "e"
    },
    bonus: {
      bpm: 118,
      bass: [0, 0, 7, 0, 0, 7, 0, 12, 0, 0, 7, 0, 0, 7, 0, 12],
      bassOct:[0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1],
      arp:  [0, 7, 12, 16, 12, 7, 12, 19, 12, 7, 12, 16, 12, 7, 12, 16],
      arpOn:[1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      hat:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
      snare:[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      key: "f"
    }
  };

  const NOTE_OFF = { a: 220, d: 146.83, e: 164.81, f: 174.61, g: 196.0, c: 130.81, b: 246.94, "f#": 185.0 };
  const ROOT = { a: 55, d: 36.7, e: 41.2, f: 43.65, g: 49.0, c: 32.7, b: 61.74, "f#": 46.25 };
  const SEMI = Math.pow(2, 1 / 12);

  // melodic motifs reused across worlds (bass/arp/lead lines)
  const MOTIFS = {
    pulse: {
      bass: [0, 0, 7, 0, 0, 10, 0, 5, 0, 0, 7, 0, 12, 0, 10, 0],
      bassOct: [0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0],
      arp: [0, 7, 12, 7, 0, 7, 12, 15, 0, 7, 12, 7, 10, 12, 15, 12],
      arpOn: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      lead: [12, 0, 19, 12, 15, 0, 24, 12, 12, 0, 19, 15, 17, 0, 24, 19],
      leadOn: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1]
    },
    chase: {
      bass: [0, 0, 0, 5, 0, 0, 7, 5, 0, 0, 0, 5, 0, 0, 10, 7],
      bassOct: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1],
      arp: [0, 10, 7, 10, 12, 10, 7, 10, 5, 12, 10, 12, 7, 10, 12, 15],
      arpOn: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      lead: [12, 0, 19, 15, 12, 0, 17, 15, 12, 0, 19, 15, 17, 0, 24, 19],
      leadOn: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1]
    },
    drive: {
      bass: [0, 0, 3, 0, 0, 5, 0, 3, 0, 0, 3, 0, 0, 7, 5, 3],
      bassOct: [0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1],
      arp: [0, 12, 7, 12, 3, 12, 7, 12, 5, 12, 8, 12, 7, 12, 10, 12],
      arpOn: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      lead: [12, 0, 15, 12, 19, 0, 15, 12, 17, 0, 20, 17, 19, 0, 24, 19],
      leadOn: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1]
    },
    float: {
      bass: [0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 5, 0, 0, 0, 10, 0],
      bassOct: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      arp: [0, 7, 12, 16, 12, 7, 12, 19, 12, 7, 12, 16, 12, 7, 12, 16],
      arpOn: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
      lead: [16, 0, 19, 12, 24, 0, 19, 16, 16, 0, 19, 12, 24, 0, 19, 24],
      leadOn: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1]
    },
    drone: {
      bass: [0, 0, 0, 1, 0, 0, 5, 0, 0, 0, 0, 1, 0, 0, 8, 0],
      bassOct: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
      arp: [0, 3, 7, 10, 0, 3, 7, 10, 0, 3, 7, 12, 0, 3, 7, 10],
      arpOn: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
      lead: [12, 0, 15, 10, 12, 0, 15, 12, 12, 0, 15, 10, 12, 0, 17, 15],
      leadOn: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1]
    }
  };

  // drum kits (kick / hat / snare patterns)
  const KITS = {
    four:    { kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], hat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0] },
    dense:   { kick: [1,0,0,1,1,0,0,1,1,0,0,1,1,0,1,1], hat: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], snare: [0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,1] },
    shuffle: { kick: [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0], hat: [1,0,0,1,1,0,0,1,1,0,0,1,1,0,0,1], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0] },
    half:    { kick: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], hat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0] },
    heavy:   { kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,1], hat: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], snare: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0] }
  };

  // per-world assignments: key, tempo, motif, kit
  const WORLD_DEFS = [
    { key: "a",  bpm: 120, motif: "pulse", kit: "four" },    // MAIN MEMORY
    { key: "f",  bpm: 112, motif: "chase", kit: "shuffle" }, // CACHE CLOUD
    { key: "d",  bpm: 126, motif: "drive", kit: "four" },    // DISK ARRAY
    { key: "e",  bpm: 132, motif: "pulse", kit: "dense" },   // NETWORK CORE
    { key: "g",  bpm: 108, motif: "float", kit: "half" },    // CLOUD FABRIC
    { key: "c",  bpm: 124, motif: "chase", kit: "four" },    // BIOS
    { key: "b",  bpm: 136, motif: "drive", kit: "dense" },   // KERNEL SPACE
    { key: "f#", bpm: 140, motif: "drone", kit: "heavy" }    // SYSTEM ABYSS
  ];

  function buildWorldSongs() {
    WORLD_DEFS.forEach((def, i) => {
      const m = MOTIFS[def.motif], k = KITS[def.kit];
      SONGS["world" + i] = {
        bpm: def.bpm, key: def.key,
        bass: m.bass, bassOct: m.bassOct,
        arp: m.arp, arpOn: m.arpOn,
        lead: m.lead, leadOn: m.leadOn,
        kick: k.kick, hat: k.hat, snare: k.snare
      };
    });
  }
  buildWorldSongs();

  function drumKick(t, vol) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    env(g, t, 0.003, vol, 0.13);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.2);
  }
  function drumSnare(t, vol) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer("sn");
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.7;
    const g = ctx.createGain(); env(g, t, 0.002, vol, 0.12);
    src.connect(f); f.connect(g); g.connect(musicGain);
    src.start(t); src.stop(t + 0.16);
  }
  function drumHat(t, vol, offbeat) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer("ht");
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
    const g = ctx.createGain(); env(g, t, 0.002, offbeat ? vol * 0.7 : vol, 0.04);
    src.connect(f); f.connect(g); g.connect(musicGain);
    src.start(t); src.stop(t + 0.06);
  }
  function leadNote(t, key, sem, vol, dur) {
    const f0 = NOTE_OFF[key] * Math.pow(SEMI, sem);
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = f0;
    const fl = ctx.createBiquadFilter(); fl.type = "bandpass"; fl.frequency.value = 1500; fl.Q.value = 1.5;
    env(g, t, 0.004, vol, dur);
    o.connect(fl); fl.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur);
  }

  function scheduleSong(song) {
    if (!ctx || !song) return;
    const spb = 60 / song.bpm / 4;          // seconds per 16th
    const lookahead = 0.18;
    const inten = intensity;                // snapshot: layers build with combo
    while (nextStep < ctx.currentTime + lookahead) {
      const i = step % 16;
      const t = nextStep;
      // drums (base pattern + intensity layers)
      if (song.kick[i]) drumKick(t, 0.6);
      else if (inten >= 3 && (i === 6 || i === 10 || i === 14)) drumKick(t, 0.28);
      if (song.snare[i]) drumSnare(t, 0.28);
      else if (inten >= 2 && i % 4 === 3) drumSnare(t, 0.1);   // ghost snare
      if (song.hat[i]) drumHat(t, i % 2 ? 0.12 : 0.06, false);
      else if (inten >= 1 && i % 2 === 1) drumHat(t, 0.08, true); // offbeat hats
      // bass (slightly louder as intensity rises)
      if (song.bass[i] !== 0 || song.bassOct[i]) {
        const sem = song.bass[i] + 12 * song.bassOct[i];
        const f0 = ROOT[song.key] * Math.pow(SEMI, sem);
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sawtooth";
        o.frequency.value = f0;
        const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 400; fl.Q.value = 6;
        env(g, t, 0.004, 0.32 + inten * 0.03, spb * 0.92);
        o.connect(fl); fl.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + spb);
      }
      // arp (plucky rhythm part)
      if (song.arpOn[i]) {
        const f0 = NOTE_OFF[song.key] * Math.pow(SEMI, song.arp[i]);
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "square";
        o.frequency.value = f0;
        const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 2400;
        env(g, t, 0.003, 0.09, spb * 0.8);
        o.connect(fl); fl.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + spb);
      }
      // lead melody line (only when intensity >= 2)
      if (inten >= 2 && song.leadOn && song.leadOn[i]) {
        leadNote(t, song.key, song.lead[i], 0.12, spb * 0.9);
      }
      step++;
      nextStep += spb;
    }
  }

  function musicLoop() {
    if (running && currentSong) scheduleSong(currentSong);
    songTimer = setTimeout(musicLoop, 60);
  }

  const Audio = {
    init() { ensure(); },
    unlock() {
      if (!ensure()) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    },

    // ---- sfx ----
    play(name, ...args) {
      if (!ctx || !sfxOn) return;
      if (SFX[name]) SFX[name](...args);
      else console.warn("unknown sfx", name);
    },
    setSfx(on) {
      sfxOn = on;
      if (sfxGain) sfxGain.gain.value = on ? 1 : 0;
    },
    getSfx() { return sfxOn; },

    // ---- music ----
    setMusic(on) {
      musicOn = on;
      if (musicGain) musicGain.gain.value = on ? 0.5 + intensity * 0.06 : 0;
      if (!on) {
        this.stopSong();
        currentSong = null;
      } else if (!currentSong) {
        this.playSong("menu");
      }
    },
    getMusic() { return musicOn; },
    setIntensity(n) {
      intensity = Math.max(0, Math.min(3, Math.round(n) || 0));
      if (musicGain) musicGain.gain.value = musicOn ? 0.5 + intensity * 0.06 : 0;
    },
    getIntensity() { return intensity; },
    playSong(id) {
      if (!ensure()) return;
      if (!musicOn || !id) { currentSong = null; return; }
      const s = SONGS[id];
      if (!s) return;
      if (currentSong === s) return;
      currentSong = s;
      this.setIntensity(0);   // fresh song: reset combo layers + gain
      step = 0;
      nextStep = ctx.currentTime + 0.05;
      if (!songTimer) {
        running = true;
        songTimer = setTimeout(musicLoop, 60);
      }
    },
    stopSong() {
      currentSong = null;
      running = false;
      if (songTimer) { clearTimeout(songTimer); songTimer = null; }
    }
  };

  R.Audio = Audio;
})(window.BREAK);
