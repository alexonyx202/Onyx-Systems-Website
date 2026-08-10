/* =========================================================================
   PORT MAPPER — audio.js
   WebAudio synthesis: retro sound effects + looping chiptune soundtrack.
   ========================================================================= */
window.PM = window.PM || {};

PM.Audio = (function () {
  'use strict';

  let ctx = null;
  let master = null, sfxBus = null, musicBus = null;
  let soundOn = true, musicOn = true;
  let musicTimer = null, step = 0, nextNoteTime = 0;

  const BPM = 138;
  const STEP = 60 / BPM / 4; // 16th note

  // Am / F / C / G — one bar (8 steps) each, 32 steps total
  const CHORDS = [
    { bass: 110.0,  tones: [220.0, 261.63, 329.63, 440.0] },   // Am
    { bass: 87.31, tones: [174.61, 220.0, 261.63, 349.23] },   // F
    { bass: 130.81, tones: [261.63, 329.63, 392.0, 523.25] },  // C
    { bass: 98.0,  tones: [196.0, 246.94, 293.66, 392.0] },    // G
  ];
  // Lead arpeggio pattern over the bar (indices into tones), +12 semis on rep
  const ARP = [0, 1, 2, 3, 2, 1, 0, 1];
  const BASS_STEPS = [0, 3, 6];   // 8th-note pulse on the root
  const HAT_STEPS = [2, 5];

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.5;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.34;
    musicBus.connect(master);
    return ctx;
  }

  /* ---- low-level helpers --------------------------------------------------- */
  function tone(o) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(Math.max(20, o.freq), t0);
    if (o.end) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.end), t0 + o.dur);
    const v = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(o.bus || sfxBus);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  let noiseBuf = null;
  function noise(o) {
    if (!ctx) return;
    if (!noiseBuf) {
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'highpass';
    if (o.q) f.Q.value = o.q;
    if (o.end) {
      // sweep the filter frequency down over the noise's life (modem-losing-sync)
      f.frequency.setValueAtTime(Math.max(20, o.freq || 4000), t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, o.end), t0 + (o.dur || 0.1));
    } else {
      f.frequency.value = o.freq || 4000;
    }
    g.gain.setValueAtTime(o.vol || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || 0.1));
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t0); src.stop(t0 + o.dur + 0.05);
  }

  /* ---- SFX bank ------------------------------------------------------------- */
  const SFX = {
    uiMove:    () => tone({ freq: 720, dur: 0.05, type: 'square', vol: 0.12 }),
    tick:      () => tone({ freq: 1180, dur: 0.03, type: 'square', vol: 0.07 }),  // score counter tick
    uiSelect:  () => { tone({ freq: 880, dur: 0.07, type: 'square', vol: 0.16 }); tone({ freq: 1320, dur: 0.1, type: 'square', vol: 0.14, delay: 0.05 }); },
    uiBack:    () => tone({ freq: 520, end: 260, dur: 0.12, type: 'square', vol: 0.14 }),
    hop:       () => tone({ freq: 500, end: 760, dur: 0.08, type: 'square', vol: 0.09 }),
    deny:      () => tone({ freq: 180, dur: 0.06, type: 'sawtooth', vol: 0.1 }),
    change1:   () => { tone({ freq: 620, end: 820, dur: 0.09, type: 'square', vol: 0.14 }); tone({ freq: 930, end: 1230, dur: 0.09, type: 'square', vol: 0.09 }); },
    change2:   () => { tone({ freq: 660, end: 990, dur: 0.1, type: 'square', vol: 0.16 }); tone({ freq: 990, end: 1480, dur: 0.12, type: 'square', vol: 0.12 }); },
    egg:       () => tone({ freq: 220, end: 440, dur: 0.25, type: 'triangle', vol: 0.16 }),
    hatch:     () => { tone({ freq: 300, end: 900, dur: 0.2, type: 'sawtooth', vol: 0.16 }); noise({ dur: 0.12, vol: 0.12 }); },
    wormDie:   () => { tone({ freq: 880, end: 110, dur: 0.4, type: 'sawtooth', vol: 0.18 }); noise({ dur: 0.3, vol: 0.14 }); },
    // a port reverting on the board is its own mini signal-loss moment — the
    // revert blip plus a faint static crackle sweeping down, echoing the death
    // sting but far quieter since it can fire on every hacker landing
    hackerRev: () => {
      tone({ freq: 340, end: 180, dur: 0.1, type: 'triangle', vol: 0.12 });
      noise({ dur: 0.12, vol: 0.04, filter: 'bandpass', freq: 1600, end: 320, q: 6 });
    },
    // reclaiming a port the hacker knocked offline — the audio mirror of the
    // broken-signal burst above: a bright clean major arpeggio climbing to a
    // clear top note plus a faint sparkle tail, like the line coming back up
    reSecure: () => {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.1, type: 'triangle', vol: 0.15, delay: i * 0.05 }));
      tone({ freq: 1568, dur: 0.18, type: 'sine', vol: 0.12, delay: 0.2 });
      noise({ dur: 0.1, vol: 0.04, filter: 'highpass', freq: 6000, delay: 0.18 });
    },
    hackerGet: () => { tone({ freq: 520, end: 1040, dur: 0.16, type: 'square', vol: 0.16 }); tone({ freq: 780, end: 1560, dur: 0.16, type: 'square', vol: 0.12, delay: 0.06 }); },
    powerup:   () => { [660, 880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.09, type: 'square', vol: 0.14, delay: i * 0.05 })); },
    shield:    () => { tone({ freq: 300, dur: 0.3, type: 'sine', vol: 0.2 }); tone({ freq: 450, dur: 0.3, type: 'sine', vol: 0.12 }); },
    freeze:    () => { tone({ freq: 1600, end: 400, dur: 0.5, type: 'sine', vol: 0.16 }); },
    overclock: () => { tone({ freq: 300, end: 1400, dur: 0.35, type: 'sawtooth', vol: 0.12 }); noise({ dur: 0.3, vol: 0.06, filter: 'bandpass', freq: 2000 }); },
    disc:      () => { tone({ freq: 440, end: 1760, dur: 0.4, type: 'sine', vol: 0.16 }); },
    fall:      () => { tone({ freq: 900, end: 140, dur: 0.55, type: 'sawtooth', vol: 0.2 }); noise({ dur: 0.5, vol: 0.16 }); },
    death:     () => { noise({ dur: 0.45, vol: 0.25 }); tone({ freq: 300, end: 60, dur: 0.5, type: 'square', vol: 0.2 }); },
    // quiet broken-signal sting for attract-mode deaths — a stuttering cascade of
    // descending square blips plus a static crackle whose bandpass sweeps down
    // with the cascade, like a modem losing sync; softer than the real death
    glitchDeath: () => {
      [1250, 990, 760, 540, 330, 160].forEach((f, i) => {
        tone({ freq: f, end: f * 0.8, dur: 0.045, type: 'square', vol: 0.10, delay: i * 0.032 });
      });
      noise({ dur: 0.22, vol: 0.07, filter: 'bandpass', freq: 2400, end: 150, q: 8 });
    },
    extraLife: () => { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.14, type: 'square', vol: 0.15, delay: i * 0.09 })); },
    levelClear:() => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'square', vol: 0.16, delay: i * 0.09 })); noise({ dur: 0.4, vol: 0.08, delay: 0.35 }); },
    // game-over sting — the mirror of the level-start jingle: a falling whoosh
    // and a sine ramp sweeping DOWN over the panel's ~300ms pop-in, a descending
    // figure, and a dark A-minor landing as the panel settles. Where the ready
    // jingle climbs to a bright C-major stab, this sinks into the relative
    // minor — same machine, opposite journey
    gameOver: () => {
      noise({ dur: 0.3, vol: 0.05, filter: 'bandpass', freq: 3000, end: 260, q: 3 });
      tone({ freq: 660, end: 170, dur: 0.3, type: 'sine', vol: 0.07 });
      [659, 523, 440].forEach((f, i) => tone({ freq: f, dur: 0.09, type: 'triangle', vol: 0.12, delay: i * 0.07 }));
      [220, 440, 523, 659].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.15, delay: 0.3 + i * 0.007 }));
      // the sustained root fills the silent bed a beat longer — music stops at
      // game over, so the sting carries the whole moment
      tone({ freq: 220, dur: 0.7, type: 'sine', vol: 0.1, delay: 0.3 });
    },
    // level-start jingle for the READY card — a snappy pickup phrase landing
    // on a bright major chord stab, punchier and more rhythmic than the
    // level-clear chime (a slow single-line climb), so SETUP and DONE read as
    // different moments on the same machine. The attack carries a subtle riser
    // — a filtered noise whoosh and a soft sine ramp sweeping up over the
    // card's ~250ms scale-up — and the landing chord hits right as the card
    // reaches full size, so the sound lands with the animation, not early.
    ready: () => {
      noise({ dur: 0.24, vol: 0.05, filter: 'bandpass', freq: 260, end: 3000, q: 3 });
      tone({ freq: 170, end: 660, dur: 0.24, type: 'sine', vol: 0.07 });
      [392, 523, 659].forEach((f, i) => tone({ freq: f, dur: 0.07, type: 'square', vol: 0.12, delay: i * 0.055 }));
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'square', vol: 0.14, delay: 0.24 + i * 0.006 }));
      tone({ freq: 1318, dur: 0.22, type: 'triangle', vol: 0.13, delay: 0.28 });
      noise({ dur: 0.1, vol: 0.05, filter: 'highpass', freq: 5500, delay: 0.25 });
    },
    // arcade attract-mode fanfare for the title screen
    title:     () => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: 0.14, type: 'square', vol: 0.14, delay: i * 0.075 })); },
  };

  /* ---- music sequencer ------------------------------------------------------ */
  function scheduleMusic() {
    if (!musicOn || !ctx) return;
    while (nextNoteTime < ctx.currentTime + 0.14) {
      const bar = Math.floor(step / 8) % 4;
      const s = step % 8;
      const ch = CHORDS[bar];
      // bass
      if (BASS_STEPS.includes(s)) {
        tone({ freq: ch.bass, dur: 0.16, type: 'triangle', vol: 0.5, bus: musicBus });
      }
      // lead arpeggio
      if (s % 2 === 0) {
        const idx = ARP[s / 2];
        const oct = (bar % 2 === 1 && idx === 0) ? 2 : 1; // lift the root on the last two bars
        tone({ freq: ch.tones[idx] * (oct === 2 ? 2 : 1), dur: 0.11, type: 'square', vol: 0.22, bus: musicBus });
      }
      // hats
      if (HAT_STEPS.includes(s)) {
        noise({ dur: 0.03, vol: 0.05, bus: musicBus, filter: 'highpass', freq: 6000 });
      }
      step = (step + 1) % 32;
      nextNoteTime += STEP;
    }
  }

  function startMusic() {
    if (!ctx || !musicOn) return;
    if (musicTimer) return;
    step = 0;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 30);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  /* ---- public API ----------------------------------------------------------- */
  function unlock() { ensure(); }

  function sfx(name) {
    if (!soundOn || !ctx) return;
    const fn = SFX[name];
    if (fn) fn();
  }

  function setSound(on) {
    soundOn = on;
    if (!soundOn) stopMusic();
  }
  function setMusic(on) {
    musicOn = on;
    if (on && ctx) startMusic();
    else stopMusic();
  }
  function refreshMusic() {
    if (musicOn && ctx) startMusic();
  }

  return { unlock, sfx, setSound, setMusic, refreshMusic, startMusic, stopMusic,
           isSound: () => soundOn, isMusic: () => musicOn };
})();
