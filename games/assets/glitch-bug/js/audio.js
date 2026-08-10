/* ============================================================
   GLITCH BUG — audio.js
   Web Audio API synth: chiptune music loop + all SFX.
   Fully procedural, zero external assets.
   ============================================================ */
'use strict';

const AudioSys = (function () {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let musicOn = true;
  let sfxOn = true;
  let volume = 0.7;

  let musicTimer = null;
  let nextNoteTime = 0;
  let step = 0;

  const TUNE = {
    bpm: 132,
    // 16 steps per bar, 4 bars (64 steps). chord roots per bar: A A F G  (Am, Am, F, G)
    roots: [57, 57, 53, 55], // MIDI
    bassPattern: [0, 0, 0, 12, 0, 0, 7, 0, 0, 0, 0, 12, 0, 7, 0, 5],
    leadPattern: [0, 12, 15, 19, 24, 19, 15, 12, 7, 12, 15, 19, 22, 19, 24, 19],
    hatPattern: [1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1],
  };

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(master);
    return ctx;
  }

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* ---------- SFX helpers ---------- */
  function blip(type, f0, f1, dur, vol, dest) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq, q, dest) {
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(dest || sfxGain);
    src.start();
  }

  function tone(type, f, dur, vol, dest) {
    blip(type, f, f * 0.99, dur, vol, dest);
  }

  /* ---------- Public SFX ---------- */
  const Sfx = {
    ensure() { ensure(); },
    uiMove() { if (!sfxOn) return; blip('square', 880, 990, 0.04, 0.12); },
    uiSelect() { if (!sfxOn) return; blip('square', 660, 1320, 0.09, 0.18); blip('square', 1320, 990, 0.08, 0.1); },
    coin() {
      if (!sfxOn) return;
      blip('square', 988, 988, 0.06, 0.2);
      setTimeout(() => { if (sfxOn) blip('square', 1319, 1319, 0.18, 0.2); }, 70);
    },
    shoot() { if (!sfxOn) return; blip('square', 1550, 660, 0.05, 0.1); },
    laser() { if (!sfxOn) return; blip('sawtooth', 2200, 300, 0.07, 0.1); },
    hit() { if (!sfxOn) return; noiseBurst(0.05, 0.15, 900, 1); },
    segPop() {
      if (!sfxOn) return;
      blip('square', 880, 220, 0.1, 0.22);
      noiseBurst(0.08, 0.2, 1500, 2);
    },
    headPop() {
      if (!sfxOn) return;
      blip('square', 1200, 120, 0.22, 0.28);
      noiseBurst(0.18, 0.3, 900, 1.5);
      blip('square', 600, 60, 0.25, 0.2);
    },
    explode() { if (!sfxOn) return; noiseBurst(0.4, 0.35, 400, 0.8); blip('sawtooth', 300, 40, 0.4, 0.2); },
    powerUp() {
      if (!sfxOn) return;
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => { if (sfxOn) tone('square', f, 0.12, 0.2); }, i * 70));
    },
    shield() { if (!sfxOn) return; blip('sine', 300, 900, 0.25, 0.25); blip('sine', 600, 1400, 0.2, 0.15); },
    freeze() { if (!sfxOn) return; blip('sine', 1200, 200, 0.5, 0.25); },
    bomb() {
      if (!sfxOn) return;
      noiseBurst(0.7, 0.5, 250, 0.6);
      blip('sawtooth', 200, 30, 0.7, 0.3);
      setTimeout(() => { if (sfxOn) noiseBurst(0.5, 0.3, 180, 0.7); }, 120);
    },
    missile() { if (!sfxOn) return; blip('sawtooth', 500, 1800, 0.25, 0.12); },
    hurt() { if (!sfxOn) return; blip('square', 500, 100, 0.3, 0.3); noiseBurst(0.2, 0.2, 600, 1); },
    life() {
      if (!sfxOn) return;
      [660, 880, 1100, 1320, 1760].forEach((f, i) => setTimeout(() => { if (sfxOn) tone('square', f, 0.1, 0.18); }, i * 60));
    },
    levelClear() {
      if (!sfxOn) return;
      [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => { if (sfxOn) tone('square', f, 0.15, 0.2); }, i * 90));
    },
    gameOver() {
      if (!sfxOn) return;
      [392, 370, 349, 311, 262].forEach((f, i) => setTimeout(() => { if (sfxOn) blip('square', f, f * 0.95, 0.25, 0.25); }, i * 180));
    },
    highScore() {
      if (!sfxOn) return;
      [523, 523, 523, 659, 784, 1047, 784, 1047].forEach((f, i) => setTimeout(() => { if (sfxOn) tone('square', f, 0.12, 0.2); }, i * 110));
    },
    extraLife() { this.life(); },
    gem() { if (!sfxOn) return; [988, 1319].forEach((f, i) => setTimeout(() => { if (sfxOn) tone('sine', f, 0.15, 0.2); }, i * 60)); },
    warn() { if (!sfxOn) return; blip('square', 260, 190, 0.14, 0.16); blip('square', 190, 150, 0.16, 0.12); },
    poison() {
      // faint corruption blip when a scorpion poisons a mushroom — quiet and
      // low so it teaches without grating on repeated poisonings
      if (!sfxOn) return;
      blip('triangle', 660, 330, 0.09, 0.1);
      setTimeout(() => { if (sfxOn) blip('triangle', 440, 200, 0.12, 0.08); }, 80);
    },
    enter() {
      if (!sfxOn) return;
      blip('square', 320, 480, 0.1, 0.14);
      blip('square', 480, 660, 0.09, 0.12);
    },
    /* ---- BUG QUEEN boss ---- */
    roar() {
      if (!sfxOn) return;
      blip('sawtooth', 200, 35, 0.8, 0.4);
      noiseBurst(0.5, 0.3, 220, 0.6);
      setTimeout(() => { if (sfxOn) blip('sawtooth', 150, 25, 0.9, 0.35); }, 180);
    },
    spit() { if (!sfxOn) return; blip('sawtooth', 950, 250, 0.12, 0.12); },
    eggLay() {
      if (!sfxOn) return;
      blip('square', 420, 190, 0.14, 0.14);
      blip('square', 300, 140, 0.16, 0.1);
    },
    hatch() {
      if (!sfxOn) return;
      blip('square', 180, 900, 0.12, 0.14);
      blip('square', 600, 1400, 0.1, 0.1);
    },
    berserk() {
      if (!sfxOn) return;
      [220, 175, 130].forEach((f, i) => setTimeout(() => { if (sfxOn) blip('sawtooth', f, f * 0.7, 0.22, 0.3); }, i * 140));
    },
    bossDie() {
      if (!sfxOn) return;
      noiseBurst(0.9, 0.5, 300, 0.7);
      blip('sawtooth', 300, 18, 1.1, 0.35);
      setTimeout(() => { if (sfxOn) noiseBurst(0.7, 0.35, 150, 0.8); }, 220);
    },
    armorBounce() { if (!sfxOn) return; blip('square', 2400, 1700, 0.035, 0.05); },
    /* ---- bonus round ---- */
    bonus() {
      if (!sfxOn) return;
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => { if (sfxOn) tone('square', f, 0.12, 0.2); }, i * 80));
    },
    bonusEnd() {
      if (!sfxOn) return;
      [1568, 1319, 1047, 784, 659, 523].forEach((f, i) => setTimeout(() => { if (sfxOn) tone('square', f, 0.14, 0.18); }, i * 90));
    },
    shift() {
      // the maze holes slide to new spots — a quick metallic glide so the
      // re-weave reads without a banner
      if (!sfxOn) return;
      blip('square', 1400, 700, 0.09, 0.14);
      setTimeout(() => { if (sfxOn) blip('square', 1050, 520, 0.1, 0.1); }, 60);
    },
  };

  /* ---------- Music sequencer ---------- */
  function scheduleNote(t, freq, type, dur, vol, dest) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function scheduler() {
    if (!ctx || !musicOn) return;
    const spb = 60 / TUNE.bpm / 4; // 16th note seconds
    while (nextNoteTime < ctx.currentTime + 0.18) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      const root = TUNE.roots[bar];
      const t = nextNoteTime;

      // bass
      const bassN = root + (TUNE.bassPattern[s] || 0) - 12;
      if (TUNE.bassPattern[s]) scheduleNote(t, midiToFreq(bassN), 'square', spb * 0.9, 0.5, musicGain);

      // lead (with rests/variation)
      const leadN = root + 12 + TUNE.leadPattern[s];
      const leadOn = (s % 4 === 0) || (s % 8 === 5) || (s === 14);
      if (leadOn) scheduleNote(t, midiToFreq(leadN), 'triangle', spb * 1.4, 0.42, musicGain);

      // hats (noise)
      if (TUNE.hatPattern[s]) {
        const len = Math.floor(ctx.sampleRate * 0.03);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
        const g = ctx.createGain(); g.gain.value = 0.35;
        src.connect(hp); hp.connect(g); g.connect(musicGain);
        src.start(t);
      }

      // kick on beats
      if (s % 4 === 0) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        g.gain.setValueAtTime(0.55, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + 0.14);
      }

      nextNoteTime += spb;
      step = (step + 1) % 64;
    }
  }

  function startMusic() {
    if (!ctx || !musicOn) return;
    if (musicTimer) return;
    nextNoteTime = ctx.currentTime + 0.06;
    step = 0;
    musicTimer = setInterval(scheduler, 25);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  /* ---------- Public API ---------- */
  return {
    unlock() { ensure(); },
    get ready() { return !!ctx; },
    setVolume(v) {
      volume = clamp(v, 0, 1);
      if (master) master.gain.value = volume;
    },
    setMusic(on) {
      musicOn = !!on;
      if (!musicOn) stopMusic();
      else if (ctx && musicOn) startMusic();
    },
    setSfx(on) { sfxOn = !!on; },
    get musicOn() { return musicOn; },
    get sfxOn() { return sfxOn; },
    get volume() { return volume; },
    startMusic, stopMusic,
    sfx: Sfx,
    // paused music state keep-alive is not needed; sequencer runs off ctx clock
  };
})();
