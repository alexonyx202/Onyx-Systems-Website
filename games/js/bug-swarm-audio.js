'use strict';
/* ============================================================
   BUG SWARM — synthesized audio engine (Web Audio API, zero assets)
   Galaga-inspired SFX + chiptune music loop.
   ============================================================ */
const AudioSys = (function(){
  let ctx=null, master=null, sfxBus=null, musicBus=null, tractorNode=null;
  let muted=false;
  try{ muted = localStorage.getItem('bugswarm_muted')==='1'; }catch(e){}

  let musicOn=false, sched=null, step=0, nextT=0;
  const BPM=144, EIGHTH=60/BPM/2, STEPS=32;

  /* Chiptune loop — 4 bars in C minor (roots C / Eb / Ab / G).
     Bass: punchy eighth-note square. Lead: syncopated square melody.
     Pad: soft triangle chord tones. */
  const bass=[48,48,55,48, 51,51,58,51, 44,44,51,44, 43,43,50,43,
              48,48,55,48, 51,51,58,51, 44,44,51,44, 43,43,50,50];
  const lead=[79,null,79,76, 79,74,76,72,
              75,null,79,null, 82,79,75,null,
              80,79,75,74, 75,79,80,79,
              74,71,67,71, 74,76,79,null];
  const pad=[36,36,39,39, 32,32,31,31];

  const nf = m => 440*Math.pow(2,(m-69)/12);

  function ensure(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted?0:0.6; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.8; musicBus.connect(master);
    }
    if(ctx.state==='suspended') ctx.resume();
  }

  function setMuted(m){
    muted=m;
    try{ localStorage.setItem('bugswarm_muted', m?'1':'0'); }catch(e){}
    if(master) master.gain.value = m?0:0.6;
  }

  /* single oscillator with exponential decay envelope */
  function tone(type,f0,f1,dur,gain,when=0,attack=0.004,bus){
    ensure();
    const t=ctx.currentTime+Math.max(0,when);
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type;
    o.frequency.setValueAtTime(Math.max(1,f0),t);
    if(f1!==undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(gain,t+attack);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(bus||sfxBus);
    o.start(t); o.stop(t+dur+0.05);
  }

  /* filtered noise sweep */
  function noise(dur,gain,f0,f1,type='bandpass',when=0){
    ensure();
    const t=ctx.currentTime+Math.max(0,when);
    const len=Math.max(1,Math.floor(ctx.sampleRate*dur));
    const buf=ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(); src.buffer=buf;
    const f=ctx.createBiquadFilter(); f.type=type;
    f.frequency.setValueAtTime(Math.max(10,f0),t);
    if(f1!==undefined) f.frequency.exponentialRampToValueAtTime(Math.max(10,f1),t+dur);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(gain,t+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t); src.stop(t+dur+0.05);
  }

  /* ---------------- SFX (Galaga approximations) ---------------- */
  const sfx={
    shoot(){ tone('square',1100,240,0.1,0.15); },
    enemyHit(){ tone('square',680,260,0.06,0.12); },
    enemyDie(){ tone('square',900,80,0.2,0.2); noise(0.07,0.05,5000,900,'bandpass'); },
    playerDie(){ tone('sawtooth',540,45,0.95,0.26); noise(0.5,0.15,2400,120,'lowpass'); tone('square',300,60,0.7,0.13,0.05); },
    warpIn(){ noise(0.42,0.18,2600,320,'bandpass'); tone('square',340,70,0.38,0.09); },
    formation(){ tone('square',660,660,0.07,0.1); tone('square',990,990,0.1,0.1,0.08); },
    capture(){ tone('square',740,740,0.06,0.14); tone('square',740,740,0.06,0.14,0.09); tone('square',988,988,0.12,0.14,0.18); },
    rescue(){ [523,659,784,1047].forEach((f,i)=>tone('square',f,f,0.09,0.14,i*0.07)); },
    bonusStart(){ [392,523,659,784,1047].forEach((f,i)=>tone('square',f,f,0.08,0.12,i*0.06)); },
    bonusHit(){ tone('square',1320,1320,0.05,0.1); },
    extra(){ [784,988,1175,1568].forEach((f,i)=>tone('square',f,f,0.1,0.13,i*0.08)); },
    /* PERFECT bonus — a bright rising fanfare with a high sparkle, distinct from extra() */
    perfect(){ [659,784,988,1319].forEach((f,i)=>tone('square',f,f,0.11,0.15,i*0.07)); tone('square',2637,2637,0.22,0.12,0.32); noise(0.25,0.08,6000,1400,'bandpass',0.32); },
    gameOver(){ [587,523,466,392,311,233].forEach((f,i)=>tone('square',f,f*0.99,0.24,0.14,i*0.24)); },
    uiMove(){ tone('square',520,520,0.04,0.09); },
    uiSelect(){ tone('square',790,790,0.07,0.14); tone('square',1180,1180,0.09,0.1,0.06); },
    bossFire(){ tone('square',260,120,0.16,0.16); noise(0.1,0.05,1200,400,'bandpass'); },
    bossPhase(){ [196,262,330,392].forEach((f,i)=>tone('sawtooth',f,f,0.12,0.11,i*0.09)); },
    bossDie(){ tone('sawtooth',520,40,1.6,0.28); noise(1.2,0.22,3000,80,'lowpass'); [523,392,262,131].forEach((f,i)=>tone('square',f,f*0.97,0.28,0.13,i*0.16)); },
    tractorStart(){
      ensure(); if(tractorNode) return;
      const o=ctx.createOscillator(), g=ctx.createGain(),
            l=ctx.createOscillator(), lg=ctx.createGain();
      o.type='sawtooth'; o.frequency.value=96; g.gain.value=0.045;
      l.frequency.value=7; lg.gain.value=28;
      l.connect(lg); lg.connect(o.detune);
      o.connect(g); g.connect(sfxBus); o.start();
      tractorNode={o,g,l};
    },
    tractorStop(){
      if(tractorNode){ try{ tractorNode.o.stop(); }catch(e){} tractorNode=null; }
    }
  };

  /* ---------------- music sequencer ---------------- */
  function startMusic(){
    ensure();
    if(musicOn) return;
    musicOn=true; step=0; nextT=ctx.currentTime+0.06;
    sched=setInterval(scheduler,25);
  }
  function stopMusic(){
    musicOn=false;
    if(sched){ clearInterval(sched); sched=null; }
  }
  function scheduler(){
    if(!ctx||!musicOn) return;
    while(nextT < ctx.currentTime+0.13){
      playStep(step,nextT);
      nextT+=EIGHTH; step=(step+1)%STEPS;
    }
  }
  function playStep(s,when){
    const delay=Math.max(0,when-ctx.currentTime);
    const b=bass[s];  if(b!=null)  tone('square',nf(b),nf(b),EIGHTH*0.92,0.105,delay,0.004,musicBus);
    const ld=lead[s]; if(ld!=null) tone('square',nf(ld),nf(ld),EIGHTH*0.95,0.08,delay,0.004,musicBus);
    if(s%4===0){
      const p=pad[Math.floor(s/4)%8];
      tone('triangle',nf(p),nf(p),EIGHTH*4,0.045,delay,0.012,musicBus);
    }
  }

  return {
    ensure,
    get muted(){ return muted; },
    setMuted,
    toggleMute(){ setMuted(!muted); return muted; },
    sfx,
    startMusic, stopMusic
  };
})();
