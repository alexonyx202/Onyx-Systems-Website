'use strict';
/* ============================================================
   BUG SWARM — Galaga-style mainframe defense
   Game logic: wave entry, formation, dive attacks, tractor-beam
   capture & rescue, dual fighter, bonus stages, HUD, hi-score.
   ============================================================ */
(function(){
const W=300, H=400;
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const PLAYER_Y=H-36;
let COLGAP=29, ROWGAP=25; const FORMTOP=62; /* modern: roomy grid + per-type sprite scale (BUG_TYPES.s); RETRO SCALE restores 26×21 */
const RETRO_COLGAP=26, RETRO_ROWGAP=21;

const $=id=>document.getElementById(id);
const elTitle=$('screen-title'), elPause=$('screen-pause'), elOver=$('screen-over');
const elOverScore=$('over-score'), elOverHi=$('over-hi'), elNewRecord=$('new-record');
const elBtns=$('crt-buttons');
const elInitials=$('screen-initials'), elInitialsScore=$('initials-score');
const elOverBoard=$('over-board'), elScoreList=$('score-list');
const btnInitialsOk=$('btn-initials-ok'), btnInitialsDel=$('btn-initials-del');
const btnStart=$('btn-start'), btnQuick=$('btn-quick'), btnResume=$('btn-resume'), btnRestart=$('btn-restart'), btnMenu=$('btn-menu');
const btnRestart2=$('btn-restart2'), btnMenu2=$('btn-menu2');
const btnPause=$('btn-pause'), btnMute=$('btn-mute'), btnFs=$('btn-fs'), btnHaptic=$('btn-haptic');
const elTouch=$('touch-controls'), tcLeft=$('tc-left'), tcRight=$('tc-right'), tcFire=$('tc-fire');

/* ---------------- input ---------------- */
const keys={};
let touchOn=false, touchTarget=null;
let touchMove={left:false,right:false}, touchFire=false;
const isTouchDevice=('ontouchstart' in window)||navigator.maxTouchPoints>0;
const gamepad={connected:false,dx:0,fire:false};
let padPrev=[];
let hapticOn=true;
try{ hapticOn=localStorage.getItem('bugswarm_haptic')!=='0'; }catch(e){}
window.addEventListener('keydown',e=>{
  const c=e.key.toLowerCase();
  if([' ','arrowleft','arrowright','arrowup','arrowdown'].includes(c)) e.preventDefault();
  keys[c]=true;
  if(state==='title') demoIdle=0;
  if(demo){ toTitle(); }
  if(awaitingInitials&&state==='over'){
    if(c==='m'){ toggleMute(); return; }
    if(c==='f'){ toggleFs(); return; }
    handleInitialsKey(c);
    return;
  }
  if(c==='p'||c==='escape'){ if(state==='play') togglePause(); }
  else if(c==='m'){ toggleMute(); }
  else if(c==='f'){ toggleFs(); }
  else if(c==='h'){ toggleHaptics(); }
  else if(c==='enter'||c===' '){
    if(state==='title') startGame();
    else if(state==='over') startGame();
    else if(state==='play'&&paused) togglePause();
  }
});
window.addEventListener('keyup',e=>{ keys[e.key.toLowerCase()]=false; });
document.addEventListener('pointerdown',()=>{ if(state==='title') demoIdle=0; });
window.addEventListener('blur',()=>{ if(state==='play'&&!paused&&!demo) togglePause(); });
document.addEventListener('visibilitychange',()=>{ if(document.hidden&&state==='play'&&!paused&&!demo) togglePause(); });

canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  const r=canvas.getBoundingClientRect();
  touchTarget=(e.touches[0].clientX-r.left)/r.width*W;
  touchOn=true;
  AudioSys.ensure();
  if(demo){ toTitle(); return; }
  if(state==='title') startGame();
});
canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  const r=canvas.getBoundingClientRect();
  touchTarget=(e.touches[0].clientX-r.left)/r.width*W;
});
canvas.addEventListener('touchend',()=>{ touchOn=false; touchTarget=null; });

/* on-screen touch controls (d-pad + FIRE) */
function bindHold(el,on,off){
  const down=e=>{
    e.preventDefault();
    try{ el.setPointerCapture(e.pointerId); }catch(err){}
    el.classList.add('active'); on();
  };
  const up=e=>{
    e.preventDefault();
    el.classList.remove('active'); off();
  };
  el.addEventListener('pointerdown',down);
  el.addEventListener('pointerup',up);
  el.addEventListener('pointercancel',up);
  el.addEventListener('pointerleave',up);
}
bindHold(tcLeft, ()=>{ touchMove.left=true; }, ()=>{ touchMove.left=false; });
bindHold(tcRight,()=>{ touchMove.right=true;}, ()=>{ touchMove.right=false;});
bindHold(tcFire, ()=>{ touchFire=true; }, ()=>{ touchFire=false; });
function updateTouchControls(){
  if(state==='play'&&!paused&&!demo&&isTouchDevice) elTouch.classList.add('show');
  else elTouch.classList.remove('show');
}

/* haptics (Vibration API) */
function vibrate(pattern){
  if(!hapticOn||document.hidden) return;
  try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(e){}
}
function toggleHaptics(){
  hapticOn=!hapticOn;
  try{ localStorage.setItem('bugswarm_haptic', hapticOn?'1':'0'); }catch(e){}
  btnHaptic.textContent=hapticOn?'📳':'📴';
  AudioSys.sfx.uiMove();
  if(hapticOn) vibrate(30);
}

/* Gamepad API: stick/d-pad move, A/B fire, START pause/confirm */
function pollGamepad(){
  if(!navigator.getGamepads) return;
  let pads;
  try{ pads=navigator.getGamepads(); }catch(e){ return; }
  if(!pads) return;
  let startEdge=false, aEdge=false, dLeft=false, dRight=false, dUp=false, dDown=false;
  gamepad.dx=0; gamepad.fire=false; gamepad.connected=false;
  for(const p of pads){
    if(!p) continue;
    gamepad.connected=true;
    const idx=p.index;
    if(!padPrev[idx]) padPrev[idx]=Array.from(p.buttons,()=>false);
    const prev=padPrev[idx];
    let ax=0;
    const a0=(p.axes&&p.axes.length>0)?p.axes[0]:0;
    const a2=(p.axes&&p.axes.length>2)?p.axes[2]:0;
    if(Math.abs(a0)>0.3) ax+=a0;
    if(Math.abs(a2)>0.3) ax+=a2;
    const held=i=>!!(p.buttons[i]&&p.buttons[i].pressed);
    if(held(14)) ax-=1; /* d-pad left  */
    if(held(15)) ax+=1; /* d-pad right */
    gamepad.dx+=Math.max(-1,Math.min(1,ax));
    gamepad.fire=gamepad.fire||held(0)||held(1); /* A or B */
    startEdge=startEdge||(!prev[9]&&held(9));        /* START */
    aEdge=aEdge||(!prev[0]&&held(0))||(!prev[1]&&held(1));
    dLeft=dLeft||(!prev[14]&&held(14));
    dRight=dRight||(!prev[15]&&held(15));
    dUp=dUp||(!prev[12]&&held(12));
    dDown=dDown||(!prev[13]&&held(13));
    padPrev[idx]=Array.from(p.buttons,x=>!!(x&&x.pressed));
  }
  gamepad.dx=Math.max(-1,Math.min(1,gamepad.dx));
  /* route button edges like keyboard presses; START always pauses mid-game,
     even if A (fire) happens to be pressed the same frame */
  if(demo&&(startEdge||aEdge)){ toTitle(); }
  if(startEdge){
    if(state==='title') startGame();
    else if(state==='over'&&awaitingInitials) confirmInitials();
    else if(state==='over') startGame();
    else if(state==='play') togglePause();
  }else if(aEdge){
    if(state==='title') startGame();
    else if(state==='over'&&awaitingInitials) confirmInitials();
    else if(state==='over') startGame();
    else if(state==='play'&&paused) togglePause();
  }
  if(dLeft&&awaitingInitials&&state==='over') cycleLetter(-1);
  if(dRight&&awaitingInitials&&state==='over') cycleLetter(1);
  if((dUp||dDown)&&awaitingInitials&&state==='over') cycleLetter(dUp?-1:1);
}

/* ---------------- state ---------------- */
let state='title', paused=false;
let demo=false, demoIdle=0, demoTime=0, demoDx=0, demoFire=false;
let phase='ready', phaseT=0;
let wave=0, score=0, hi=0, lives=3, nextExtra=20000;
let clearStreak=0, waveEscapes=0; /* PERFECT WAVE streak — 0 escapes in a wave → escalating CLEAR BONUS */
let bossDiff=1.0, bossStartT=0; /* adaptive King difficulty — ±15% step per kill, clamped 0.8–1.3 */
/* global difficulty multiplier — EASY .95 / NORMAL 1.1 (+10% base) / HARD 1.25. Bosses excluded. */
const DIFF_TIERS={easy:0.95, normal:1.1, hard:1.25};
let diffKey='normal';
try{ const d=localStorage.getItem('bugswarm_diff'); if(DIFF_TIERS[d]) diffKey=d; }catch(e){}
let DIFF=DIFF_TIERS[diffKey];
let player={x:W/2,y:PLAYER_Y,alive:true,dual:false,invuln:0,fireCd:0,captured:null,respawnT:0,fall:null};
let rescues=[]; /* freed ships gliding home before they rejoin as the dual fighter */
let pBullets=[], eBullets=[], bugs=[], particles=[], popups=[], stars=[], streams=[];
let shake=0, flash=0, time=0;
let bonus={active:false,time:0,hits:0,spawnT:0,total:16,spawned:0};
let boss=null; /* ROOTKIT KING — {state:'enter'|'active'|'dying', ...} */
let announce={text:'',sub:'',t:0};
let hintShown=false; /* first-capture hint banner — once per run, so new players learn the shoot-to-rescue rule */
let entryQueue=[], entryT=0, attackT=0;
let attract=[];
let awaitingInitials=false;
let initials={slots:['A','A','A'],idx:0};
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
try{
  const legacy=+(localStorage.getItem('bugswarm_hi')||0);
  const top=getBoard().length?getBoard()[0].score:0;
  hi=Math.max(legacy,top);
}catch(e){ hi=0; }

/* ---------------- utils ---------------- */
const rand=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const easeInOut=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const pad6=n=>String(n).padStart(6,'0');
function qbez(p0,p1,p2,t){
  const u=1-t;
  return {x:u*u*p0.x+2*u*t*p1.x+t*t*p2.x, y:u*u*p0.y+2*u*t*p1.y+t*t*p2.y};
}
function pathPos(p,t,sx,sy,tx){
  t=clamp(t,0,1);
  if(p==='dive')   return {x:sx+(tx-sx)*t+Math.sin(t*Math.PI*2)*26*(1-t), y:sy+(H+24-sy)*t};
  if(p==='zigzag') return {x:sx+Math.sin(t*Math.PI*7)*(1-t*0.4)*52,      y:sy+(H+24-sy)*t};
  if(p==='swoop')  return {x:sx+(tx-sx)*t+Math.sin(t*Math.PI*2.5)*58,    y:Math.min(H+16, sy+(H+16-sy)*Math.min(1,t*1.2))};
  if(p==='loop')   return {x:sx+(tx-sx)*t+Math.sin(t*Math.PI*4)*34,      y:sy+(H+24-sy)*t};
  if(p==='boss')   return {x:sx+Math.sin(t*Math.PI*3)*42,                y:sy+(H+24-sy)*t};
  return {x:sx,y:sy};
}

/* ---------------- background ---------------- */
function initBG(){
  stars=[];
  for(let i=0;i<70;i++) stars.push({x:Math.random()*W,y:Math.random()*H,sp:rand(8,46),sz:Math.random()<0.3?2:1,ph:rand(0,6)});
  streams=[];
  for(let i=0;i<6;i++) streams.push({x:Math.random()*W, y:Math.random()*H, sp:rand(20,60), len:rand(30,80)});
}
function updateBG(dt){
  for(const s of stars){ s.y+=s.sp*dt; if(s.y>H+2){ s.y=-2; s.x=Math.random()*W; } }
  for(const st of streams){ st.y+=st.sp*dt; if(st.y-st.len>H){ st.y=-st.len; st.x=Math.random()*W; } }
}
function drawBG(){
  ctx.fillStyle='#01040a'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(61,255,138,0.03)'; ctx.lineWidth=1;
  ctx.beginPath();
  for(let x=0;x<=W;x+=30){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for(let y=0;y<=H;y+=30){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();
  for(const s of stars){
    const a=0.25+0.45*Math.abs(Math.sin(time*2+s.ph));
    ctx.globalAlpha=a;
    ctx.fillStyle='#9fffd0';
    ctx.fillRect(s.x,s.y,s.sz,s.sz);
  }
  ctx.globalAlpha=1;
  ctx.strokeStyle='rgba(80,255,170,0.06)';
  for(const st of streams){
    ctx.beginPath();
    ctx.moveTo(st.x,st.y); ctx.lineTo(st.x,st.y+st.len);
    ctx.stroke();
  }
  ctx.strokeStyle='rgba(255,255,255,0.03)';
  ctx.beginPath(); ctx.moveTo(0,H-14); ctx.lineTo(W,H-14); ctx.stroke();
}

/* ---------------- formation ---------------- */
function slotXY(r,c){
  const x=W/2+(c-3.5)*COLGAP+(r%2?-1.5:1.5);
  const y=FORMTOP+r*ROWGAP+Math.abs(c-3.5)*3.5;
  return [x,y];
}
function rowType(r){ return ['rootkit','virus','virus','worm','bug'][r]; }

function makeBug(type,col,row){
  const [sx,sy]=slotXY(row,col);
  return {
    id:0, type, col, row,
    x:W/2, y:-26, slotX:sx, slotY:sy,
    hp:BUG_TYPES[type].hp,
    state:'queued', t:0, dur:(1.5+Math.random()*0.5)/DIFF, /* entry flight — faster on higher difficulty */
    flash:0, angle:0,
    sx0:0, sy0:-26, fireCd:1+Math.random()*2, holdT:0,
    pattern:'dive', tx:W/2, rx0:0, ry0:0, /* return-flight origin for the tractor carrier */
    /* scout dive cooldown — capture attempts should come regularly, not feel
       like they need coaxing: 7-12s base (FLOORED at 7 so HARD keeps its extra
       dives but never back-to-back). Old value was 14-24s — far too rare. */
    attached:false, beamMax:0, beamT:0, /* wall-time accumulator for the beam */
    cd:Math.max(7,rand(7,12)/DIFF), runPhase:null, captive:null,
    vx:0, baseY:0, amp:0, freq:0, phase0:col*0.8+row*2.1+rand(0,6.28) /* per-bug phase — neighbours never lockstep */
  };
}

function buildWave(){
  bugs=[]; entryQueue=[];
  const rowsOrder=[4,3,2,1,0];
  for(const r of rowsOrder){
    const type=rowType(r);
    for(const c of [0,1,2,3]){
      for(const s of [0,1]){
        const col=s?7-c:c;
        const b=makeBug(type,col,r);
        bugs.push(b); entryQueue.push(b);
      }
    }
  }
  for(const s of [0,1]){
    /* retro scouts tuck closer to the dense grid; modern ones sit lower to clear the edge bugs */
    const sx=W/2+(s?(RETRO_MODE?95:99):(RETRO_MODE?-95:-99));
    const sy=FORMTOP+4*ROWGAP+(RETRO_MODE?36:41);
    const b=makeBug('scout',s,5);
    b.slotX=sx; b.slotY=sy;
    bugs.push(b); entryQueue.push(b);
  }
  bugs.forEach((b,i)=>b.id=i);
}

/* ---------------- particles & popups ---------------- */
function explosion(x,y,color,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, sp=rand(30,120);
    particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:rand(0.35,0.8),max:0.8,size:rand(1,2.6),color,grav:40});
  }
  particles.push({x,y,vx:0,vy:0,life:0.22,max:0.22,size:11,color:'#ffffff',grav:0});
}
function perfectPayoff(){
  /* PERFECT fanfare + a visual payoff that lands on the same beat as the
     sparkle — the fanfare schedules its 2637Hz tone + noise at when=0.32,
     so the flash and gold burst fire PERFECT_SPARKLE_MS later, in sync with
     the audio. Keep this constant matched to audio.js's perfect() when=0.32. */
  const PERFECT_SPARKLE_MS=320;
  AudioSys.sfx.perfect();
  setTimeout(()=>{
    if(paused||state!=='play') return; /* don't freeze the flash on a pause mid-window */
    flash=Math.max(flash,0.45);
    shake=Math.max(shake,5);
    for(let i=0;i<30;i++){
      const a=Math.random()*Math.PI*2, sp=rand(30,160);
      particles.push({
        x:W/2+rand(-6,6), y:H/2+rand(-6,6),
        vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-30,
        life:rand(0.4,0.9), max:0.9,
        size:rand(1.5,3.4),
        color:i%3? (Math.random()<0.5?'#ffd27a':'#ffe97a') : '#ffffff',
        grav:60
      });
    }
    particles.push({x:W/2,y:H/2,vx:0,vy:0,life:0.22,max:0.22,size:12,color:'#ffffff',grav:0});
  },PERFECT_SPARKLE_MS);
}
function popup(x,y,txt,color){
  popups.push({x:x+rand(-6,6),y,txt,t:1,max:1,color:color||'#eafff4'});
}
function bugEscaped(b){
  /* a diver slipped off the bottom edge — faint afterimage + ESCAPED popup
     so players see it wasn't destroyed, it got away */
  if(phase!=='bonus') waveEscapes++; /* an escape breaks the PERFECT WAVE streak (bonus strays fly off the sides, not here) */
  const col=BUG_TYPES[b.type]?BUG_TYPES[b.type].color:'#5cff5c';
  for(let i=0;i<8;i++){
    particles.push({
      x:clamp(b.x+rand(-14,14),6,W-6), y:H+rand(-8,8),
      vx:rand(-10,10), vy:rand(-8,2),
      life:rand(0.3,0.6), max:1.8, /* low life/max → faint ghost that lingers and fades */
      size:rand(1.5,3.2), color:col, grav:0
    });
  }
  popup(clamp(b.x,14,W-14),Math.min(b.y,H-16),'ESCAPED','#8fb8c9');
}
function updateFX(dt){
  for(const p of particles){
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=p.grav*dt; p.life-=dt;
  }
  particles=particles.filter(p=>p.life>0);
  for(const p of popups){ p.t-=dt*0.9; p.y-=22*dt; }
  popups=popups.filter(p=>p.t>0);
}
function drawFX(){
  for(const p of particles){
    ctx.globalAlpha=clamp(p.life/p.max,0,1);
    ctx.fillStyle=p.color;
    ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);
  }
  ctx.globalAlpha=1;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='7px "Press Start 2P",monospace';
  for(const p of popups){
    ctx.globalAlpha=clamp(p.t,0,1);
    ctx.fillStyle=p.color;
    ctx.shadowColor=p.color; ctx.shadowBlur=6;
    ctx.fillText(p.txt,p.x,p.y);
  }
  ctx.globalAlpha=1; ctx.shadowBlur=0;
}

/* ---------------- scoring ---------------- */
function checkExtra(){
  while(score>=nextExtra){
    lives=Math.min(lives+1,6);
    nextExtra+=40000;
    AudioSys.sfx.extra();
    vibrate([40,20,70]);
    popup(player.x,player.y-20,'1UP!','#ffd27a');
  }
}

/* ---------------- attract demo AI ---------------- */
function demoAI(dt){
  let danger=false;
  /* dodge enemy bullets heading for the ship */
  for(const b of eBullets){
    const dy=b.y-player.y;
    if(dy<30&&dy>-80&&Math.abs(b.x-player.x)<30){ danger=true; demoDx=b.x>=player.x?-1:1; }
  }
  /* dodge diving bugs */
  if(!danger){
    for(const bug of bugs){
      if(bug.state==='diving'){
        const dy=bug.y-player.y;
        if(dy<40&&dy>-60&&Math.abs(bug.x-player.x)<34){ danger=true; demoDx=bug.x>=player.x?-1:1; break; }
      }
    }
  }
  /* otherwise track the boss, or the lowest bug in formation/entering/bonus */
  if(!danger){
    if(boss&&(boss.state==='enter'||boss.state==='active')){
      const d=boss.x-player.x; demoDx=Math.abs(d)>8?(d>0?1:-1):0;
    }else{
      let best=null,bestY=-1;
      for(const bug of bugs){
        if(bug.state==='formed'||bug.state==='entering'||bug.state==='bonus'){
          if(bug.y>bestY){ bestY=bug.y; best=bug; }
        }
      }
      if(best){ const d=best.x-player.x; demoDx=Math.abs(d)>6?(d>0?1:-1):0; }
      else demoDx=0;
    }
  }
  demoFire=true;
}

/* ---------------- player ---------------- */
function updatePlayer(dt){
  if(player.fall){
    player.fall.vy+=300*dt;
    player.fall.y+=player.fall.vy*dt;
    if(player.fall.y>=PLAYER_Y){
      player.fall=null; player.alive=true; player.y=PLAYER_Y; player.invuln=2.5;
    }
    return;
  }
  if(!player.alive){
    player.respawnT-=dt;
    if(player.respawnT<=0){ player.alive=true; player.x=W/2; player.y=PLAYER_Y; player.invuln=2.5; }
    return;
  }
  /* note: a captured ship is HELPLESS — it hangs in the tractor beam and cannot
     fire (classic Galaga). The player keeps flying a fresh ship and must shoot
     the carrier bug to free the captive. */
  let dx=0;
  if(demo){
    demoAI(dt);
    dx=demoDx;
  }else{
    if(keys['arrowleft']||keys['a']||touchMove.left) dx-=1;
    if(keys['arrowright']||keys['d']||touchMove.right) dx+=1;
    dx+=gamepad.dx;
    if(touchOn&&touchTarget!=null) dx=Math.sign(touchTarget-player.x);
  }
  dx=clamp(dx,-1,1);
  player.x+=dx*150*dt;
  player.x=clamp(player.x,16,W-16);
  player.invuln=Math.max(0,player.invuln-dt);
  player.fireCd-=dt;
  const fireOk=(phase==='entry'||phase==='attack'||phase==='boss'||phase==='bonus');
  const wantFire=demo?demoFire:(keys[' ']||keys['z']||touchOn||touchFire||gamepad.fire);
  if(fireOk && wantFire && player.fireCd<=0){
    if(player.dual){
      /* the DUAL-CORE fighter fires both cannons at once — one from each ship */
      if(pBullets.length<=2){ /* cap the field at 4 (two volleys), matching Galaga's double fighter */
        pBullets.push({x:player.x-9,y:player.y-12,vy:-380});
        pBullets.push({x:player.x+9,y:player.y-12,vy:-380});
        player.fireCd=0.28;
        AudioSys.sfx.shoot();
        vibrate(12);
      }
    }else if(pBullets.length<2){
      pBullets.push({x:player.x,y:player.y-12,vy:-380});
      player.fireCd=0.28;
      AudioSys.sfx.shoot();
      vibrate(12);
    }
  }
}

function killPlayer(){
  if(!player.dual){
    lives--;
    explosion(player.x,player.y,'#3df0ff',28);
    shake=Math.max(shake,10); flash=Math.max(flash,0.5);
    AudioSys.sfx.playerDie(); AudioSys.sfx.tractorStop();
    vibrate([90,40,140]);
    player.alive=false; player.dual=false; player.captured=null;
    player.respawnT=1.9;
    if(lives<=0){ endGame(); }
  }else{
    player.dual=false; player.invuln=2;
    explosion(player.x-9,player.y,'#ffb347',12);
    explosion(player.x+9,player.y,'#ffb347',12);
    shake=Math.max(shake,6); flash=Math.max(flash,0.25);
    AudioSys.sfx.playerDie();
    vibrate(40);
  }
}

/* capture the whole (single) fighter, or one wing of a dual fighter.
   Rebalanced Galaga rule: a capture does NOT cost a life up front — the
   held ship is marked lifePending and the penalty is charged ONLY if it is
   truly lost (the freed ship flies off uncaught). Rescue it at any time
   (diving, climbing, or parked in formation) and the dual-core fighter is
   yours with zero cost. A fresh fighter launches so the player keeps flying. */
function capturePlayer(b){
  b.attached=true;
  b.rx0=b.x; b.ry0=b.y; /* turn at once — carry the captive back to the formation */
  b.runPhase='up'; b.t=0;
  vibrate(70);
  /* onboarding hint on the FIRST capture of the run: rescue now works in any
     carrier state — shoot it diving, climbing, or parked in formation */
  if(!demo&&!hintShown){ hintShown=true; announceText('SHOOT THE SPIDER','TO FREE YOUR SHIP'); }
  if(player.dual){
    player.dual=false;
    b.captive={x:b.x,y:b.y+24};
    AudioSys.sfx.capture();
    popup(b.x,b.y-14,'WING LOST','#ff4f6d');
  }else{
    /* lifePending — the life is charged later, and only if the ship is lost */
    b.captive={x:b.x,y:b.y+24, whole:true, lifePending:true};
    AudioSys.sfx.capture();
    popup(b.x,b.y-14,'SHIP CAPTURED','#ff4f6d');
    /* a fresh fighter launches from the deck so the player keeps flying —
       and no life is lost at capture time */
    player.x=W/2; player.y=PLAYER_Y; player.invuln=2.5;
  }
}

/* the deferred capture penalty — charged only when a captured ship is truly
   lost (missed catch, or unreachable). Never called at capture time. */
function chargeCapturedLife(){
  if(state==='over') return; /* the run is already done — don't decrement into the grave or re-enter endGame */
  lives--;
  if(lives<=0){ endGame(); return; } /* consistent with killPlayer — 0 lives means game over */
  vibrate(60);
  AudioSys.sfx.playerDie();
}

/* free a captive ship (either a wing or the whole fighter) — +500 for the
   catch, and it joins as the DUAL-CORE fighter */
function rescueShip(x,y){
  score+=500; checkExtra();
  AudioSys.sfx.rescue();
  vibrate([30,30,60]);
  popup(x,y,'+500 RESCUE','#ffd27a');
}
/* a freed captive FALLS from the carrier — catch it as it drops to form the
   DUAL-CORE fighter (classic Galaga). If it flies off the bottom, it's lost
   — and a whole-ship captive that is lost finally pays its deferred life. */
function startRescue(x,y,pendingLife){
  rescues.push({x, y:y+24, vy:0, t:0, pendingLife:!!pendingLife});
}
function updateRescues(dt){
  for(const r of rescues){
    r.t+=dt;
    r.vy+=260*dt;                 /* accelerates as it falls */
    r.y+=r.vy*dt;
    r.x+=Math.sin(r.t*3)*20*dt;   /* gentle sway while dropping */
    if(player.alive&&!player.fall){
      const dx=r.x-player.x, dy=r.y-player.y;
      if(dx*dx+dy*dy<24*24){      /* caught! */
        r.done=true;
        r.pendingLife=false;       /* rescued — the deferred life is forgiven */
        player.dual=true; player.invuln=Math.max(player.invuln,1);
        rescueShip(r.x,r.y);
        popup(player.x,player.y-18,'DUAL FIGHTER!','#ffd27a');
        continue;
      }
    }
    if(r.y>H+20){                 /* missed — the ship is truly lost: pay the deferred life */
      r.done=true;
      if(r.pendingLife) chargeCapturedLife();
      popup(clamp(r.x,16,W-16),H-24,'SHIP LOST','#ff4f6d');
    }
  }
  rescues=rescues.filter(r=>!r.done);
}
function drawRescues(){
  for(const r of rescues){
    ctx.save(); ctx.globalAlpha=0.85;
    drawPlayerShip(ctx,r.x,r.y,time);
    ctx.restore();
    /* engine sparkle trail while it descends */
    if(Math.random()<0.5){
      particles.push({x:r.x+rand(-3,3), y:r.y+6, vx:rand(-8,8), vy:rand(8,26),
        life:rand(0.2,0.4), max:0.4, size:rand(1,2.2), color:'#3df0ff', grav:0});
    }
  }
}

/* ---------------- bullets ---------------- */
function updateBullets(dt){
  for(const b of pBullets) b.y+=b.vy*dt;
  pBullets=pBullets.filter(b=>b.y>-14);
  for(const b of eBullets){
    b.t+=dt;
    b.x+=b.vx*dt; /* Galaga bullets fly straight — no wobble */
    b.y+=b.vy*dt;
  }
  eBullets=eBullets.filter(b=>b.y<H+20&&b.y>-20&&b.x>-30&&b.x<W+30);
}
function fireEnemyBullet(b){
  const ay=player.alive&&!player.captured? player.y : H*0.8;
  const ax=player.alive&&!player.captured? player.x : W/2;
  const a=Math.atan2(ay-b.y,ax-b.x);
  const sp=Math.min(118,(68+wave*3)*DIFF); /* formation bullets scale with difficulty */
  eBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,t:0});
}
function checkBulletHits(){
  for(let i=pBullets.length-1;i>=0;i--){
    const b=pBullets[i];
    let hit=false;
    /* boss body takes hits (rootking s=1 so hitRadius is unchanged) */
    if(boss&&(boss.state==='enter'||boss.state==='active')){
      const dx=b.x-boss.x, dy=b.y-boss.y;
      const rr=hitRadius('rootking')+6;
      if(dx*dx+dy*dy<rr*rr){
        hit=true;
        boss.hp--; boss.flash=0.25;
        AudioSys.sfx.enemyHit();
        if(boss.hp<=0) killBoss();
      }
    }
    if(!hit){
      for(const bug of bugs){
        if(bug.state==='queued') continue;
        const r=hitRadius(bug.type)+2; /* FAIR HITS enlarges to match retro's full-size sprites */
        const dx=b.x-bug.x, dy=b.y-bug.y;
        if(dx*dx+dy*dy<r*r){
          hit=true;
          bug.hp--; bug.flash=0.25;
          AudioSys.sfx.enemyHit();
          if(bug.hp<=0) killBug(bug);
          break;
        }
      }
    }
    if(hit) pBullets.splice(i,1);
  }
}

/* ---------------- bugs ---------------- */
function killBug(bug){
  const isBonus=(phase==='bonus'||bug.state==='bonus');
  const gain=isBonus?500:BUG_TYPES[bug.type].score;
  if(bug.state==='bonus') bonus.hits++;
  /* rescue handling when the carrier dies — SHOOT IT, ANY TIME, and the
     captive is freed: it falls and can be caught for the DUAL-CORE fighter.
     There is deliberately NO state gate: shooting a carrier parked in
     formation rescues the ship exactly like shooting it mid-dive. The classic
     "only shoot it while it dives, else the ship turns against you" rule is
     gone — it made rescue feel like the scout had to crash into the player.
     The +500 RESCUE is awarded at the CATCH, not here. */
  if(bug.captive){
    AudioSys.sfx.tractorStop();
    const pending=bug.captive.whole&&bug.captive.lifePending;
    if(player.alive) startRescue(bug.x,bug.y,pending);
    else if(pending&&state==='play') chargeCapturedLife(); /* only charge while the run is live — a game-over death may already have called endGame */
    bug.captive=null;
  }
  score+=gain; checkExtra();
  popup(bug.x,bug.y,'+'+gain);
  explosion(bug.x,bug.y,BUG_TYPES[bug.type].color,14);
  AudioSys.sfx.enemyDie();
  vibrate(15);
  bugs=bugs.filter(x=>x!==bug);
}

function startDive(b){
  b.state='diving'; b.t=0;
  b.sx0=b.x; b.sy0=b.y; /* launch from the bug's real swayed position, not the nominal slot */
  b.tx=player.x+rand(-30,30);
  b.pattern=pickPattern(b.type, waveSignature(wave));
  b.dur=(b.type==='rootkit'?2.6:rand(1.6,2.2))/DIFF; /* faster dives on higher difficulty */
  if(b.pattern==='swoop') b.dur+=0.3/DIFF;
}
/* Galaga-style scripted waves — each wave runs ONE signature dive pattern
   for its whole formation (no randomness), cycling every 4 waves:
     wave 1 = STRAIGHT DIVES · wave 2 = LOOPS · wave 3 = ZIGZAGS ·
     wave 4 = SWOOPS … then the cycle repeats (waves 5,10,… are the boss). */
const WAVE_SIGNATURES=['dive','loop','zigzag','swoop'];
const SIG_NAMES={dive:'STRAIGHT RUN',loop:'LOOP RUN',zigzag:'ZIGZAG RUN',swoop:'SWOOP RUN'};
function waveSignature(w){ return WAVE_SIGNATURES[(w-1)%4]; }
function pickPattern(type, signature){
  /* rootkits keep their heavy armored weave as their signature dive —
     except on the swoop wave, where they swoop with the swarm. */
  if(type==='rootkit') return signature==='swoop'?'swoop':'boss';
  return signature;
}

function updateBugs(dt){
  for(const b of bugs){
    b.flash=Math.max(0,b.flash-dt);

    if(b.state==='entering'){
      b.t+=dt/b.dur;
      const p0={x:b.sx0,y:b.sy0}, p2={x:b.slotX,y:b.slotY};
      const p1={x:(b.sx0+b.slotX)/2+(b.slotX-b.sx0)*0.7, y:Math.min(b.sy0,b.slotY)+(b.slotY-b.sy0)*0.5-20};
      const pos=qbez(p0,p1,p2,Math.min(1,b.t));
      b.angle=(b.slotX-b.sx0>0?1:-1)*0.35*(1-Math.min(1,b.t));
      b.x=pos.x; b.y=pos.y;
      if(b.t>=1){ b.state='formed'; b.x=b.slotX; b.y=b.slotY; b.angle=0; }
    }
    else if(b.state==='formed'){
      /* the whole formation drifts side to side as one unit — Galaga's signature sway */
      const sway=Math.sin(time*0.6)*10;
      /* RETRO SCALE: the dense full-size grid has no room for the modern per-bug
         idle motion, so retro fields get the classic look — unit sway only,
         every sprite locked in its slot like the 1981 arcade original. */
      if(!RETRO_MODE){
        /* whole-field breath — every bug rises and falls together on one slow sine,
           so the relative gaps between neighbours NEVER change: the airy grid stays
           clear while the field itself feels alive between dives */
        const breath=Math.sin(time*0.5)*1.5;
        /* each creature sways at its own speed — rootkits thrum heavy & slow,
           worms wiggle fast & wide, viruses twitch, ladybugs float, spiders skitter */
        const bob=BUG_TYPES[b.type].bob||{f:1.4,ax:1.4,ay:1.1};
        const ph=time*bob.f+b.phase0;
        b.x=b.slotX+sway+Math.sin(ph)*bob.ax;
        b.y=b.slotY+breath+Math.sin(ph*0.8+b.phase0*1.3)*bob.ay;
        /* gentle idle rock — each creature tilts at its own slow rhythm (a fast
           worm shivers, a heavy rootkit barely lists). Rotation is around the
           sprite centre; the 0.045 rad keeps the tight bug↔scout diagonal clear. */
        b.angle=Math.sin(ph*0.5+b.phase0*1.7)*0.045;
      }else{
        b.x=b.slotX+sway; b.y=b.slotY; b.angle=0;
      }
      /* Galaga fidelity: only the lower rows (3rd–5th) fire, sparingly */
      if(phase==='attack'&&b.type!=='scout'&&b.row>=2&&eBullets.length<3){
        b.fireCd-=dt;
        if(b.fireCd<=0&&Math.random()<0.012*DIFF){ /* more & faster formation fire on higher difficulty */
          fireEnemyBullet(b); b.fireCd=rand(9,16)/DIFF;
        }
      }
    }
    else if(b.state==='diving'){
      b.t+=dt/b.dur;
      const px=b.x,py=b.y;
      const pos=pathPos(b.pattern,b.t,b.sx0,b.sy0,b.tx);
      b.x=pos.x; b.y=pos.y;
      b.angle=Math.atan2(b.y-py,b.x-px)*0.55;
      /* divers don't shoot — classic Galaga: only the formation fires */
      if(b.t>=1&&b.y>H+8){ /* fully off the bottom edge — gone, no score */
        bugEscaped(b);
        bugs=bugs.filter(x=>x!==b);
      }
    }
    else if(b.state==='scoutRun') updateScout(b,dt);
    else if(b.state==='hold'){
      b.x=b.slotX; b.y=b.slotY;
      if(b.captive){ b.captive.x=b.x; b.captive.y=b.y+24; }
      b.holdT+=dt;
      /* Galaga: the carrier holding your ship periodically DIVES AGAIN with it —
         a fresh rescue window. (Shooting the carrier rescues the captive in ANY
         state, so the re-dive is a convenience, not a requirement.) */
      if(b.holdT>5){
        b.state='scoutRun'; b.runPhase='down'; b.t=0;
        b.sx0=b.slotX; b.sy0=b.slotY; b.tx=player.x;
        b.attached=true; /* keeps carrying the captive on the re-dive */
        AudioSys.sfx.tractorStart();
      }
    }
    else if(b.state==='bonus'){
      b.x+=b.vx*dt; b.t+=dt;
      b.y=b.baseY+Math.sin(b.t*b.freq+b.phase0)*b.amp;
      b.angle=Math.sin(b.t*2+b.phase0)*0.25;
      if(b.x<-30||b.x>W+30) bugs=bugs.filter(x=>x!==b);
    }
  }
}

/* ---------------- tractor scout ---------------- */
function updateScout(b,dt){
  if(b.runPhase==='down'){
    /* descent is FLOORED at 0.9s so HARD (DIFF 1.25, natural 0.72s) can't
       compress the rescue choreography — the beam window and the re-dive
       kill shot stay as generous as on NORMAL; EASY keeps its natural 0.95s. */
    b.t+=dt/Math.max(0.9,0.9/DIFF);
    const tt=easeInOut(Math.min(1,b.t/0.62));
    /* RE-DIVE HOMING: when the carrier dives again WITH the captive it tracks
       the player's LIVE position (smooth pursuit, not the stale snapshot taken
       at dive start) so the descent comes straight down at the player — a
       clean, catchable kill shot. The initial capture dive keeps its fixed
       tx-from-dive-start and full sway, preserving the sideways-dodge mechanic. */
    if(b.attached) b.tx+=(player.x-b.tx)*Math.min(1,dt*4);
    const sway=b.attached?1.5:6; /* nearly straight when homing with a captive */
    b.x=b.sx0+(b.tx-b.sx0)*tt+Math.sin(b.t*5)*sway;
    b.y=b.sy0+(H-64-b.sy0)*tt;
    /* beam extends rapidly from the start — full 135px reach so the scout
       captures the player as it passes through. The beam now uses its OWN
       WALL-TIME accumulator (b.beamT += dt) instead of phase-time, so the
       full-extension window is pinned at max(0.35, 0.35/DIFF) SECONDS of real
       time on every difficulty — completely independent of the descent
       phase's timing. Retuning or scoping the descent can never silently
       re-compress the beam again. */
    if(!b.attached){ b.beamT+=dt; b.beamMax=Math.max(b.beamMax,Math.min(135,b.beamT/Math.max(0.35,0.35/DIFF)*135)); }
    /* Galaga: the beam has a horizontal reach — dodge it by moving to the side.
       The scout sways ±6 around its target x, so the catch zone is roughly
       b.x±24 once the beam reaches the player's deck height. */
    if(!b.attached && player.alive&&!player.captured&&player.invuln<=0
      && b.y+b.beamMax>=player.y && Math.abs(b.x-player.x)<24){ /* ±24 — the beam catches a nearby ship without demanding pixel-perfect alignment */
      capturePlayer(b);
    }
    if(b.attached&&b.captive){ b.captive.x=b.x; b.captive.y=b.y+24; }
    if(b.t>=1){
      if(b.attached){ b.rx0=b.x; b.ry0=b.y; b.runPhase='up'; b.t=0; }
      else{ b.runPhase='retreat'; b.t=0; AudioSys.sfx.tractorStop(); }
    }
  }
  else if(b.runPhase==='up'){
    /* Galaga return: RISE-THEN-TUCK. The carrier climbs straight up from the
       capture point (x locked at rx0 for the first ~65% of the flight), then
       glides sideways into its slot only near the top of the formation.
       Previously it drifted sideways the whole way (~85px/s toward the slot)
       and straight-up bullets could never keep pace — the rescue only
       connected if the player was already perfectly aligned. Now the carrier
       hangs motionless in x right above the player for most of the climb, a
       long, generous rescue window. The duration is FLOORED at 1.4s so the
       window stays equally generous on HARD (DIFF 1.25 would otherwise shrink
       it to 1.12s); EASY keeps its slightly slower 1.47s. */
    b.t+=dt/Math.max(1.4,1.4/DIFF);
    const tt=Math.min(1,b.t);
    const rise=easeInOut(Math.min(1,tt/0.65));                       /* vertical: done by 65% */
    const tuck=easeInOut(clamp((tt-0.65)/0.35,0,1));                 /* horizontal: last 35%, at the top */
    b.y=b.ry0+(b.slotY-b.ry0)*rise;
    b.x=b.rx0+(b.slotX-b.rx0)*tuck;
    if(b.captive){ b.captive.x=b.x; b.captive.y=b.y+24; }
    if(b.t>=1){ b.runPhase=null; b.state='hold'; b.holdT=0; }
  }
  else if(b.runPhase==='retreat'){
    b.t+=dt/1.0;
    const tt=easeInOut(Math.min(1,b.t));
    b.x=b.tx+(b.slotX-b.tx)*tt;
    b.y=(H-64)+(b.slotY-(H-64))*tt;
    b.beamMax=Math.max(0,b.beamMax*(1-dt*3));
    if(b.t>=1){ b.runPhase=null; b.state='formed'; b.cd=Math.max(9,rand(9,15)/DIFF); } /* post-dive cd also floored at its 9s base — old 18-28s made rescues feel like a stall */
  }
}

function updateScouts(dt){
  if(phase!=='attack'||bonus.active) return;
  for(const b of bugs){
    if(b.type!=='scout'||b.state!=='formed') continue;
    b.cd-=dt;
    if(b.cd<=0 && player.alive&&!player.captured&&player.invuln<=0){
      /* never launch a second capture beam while another scout is already
         descending fresh (attached=false) — two simultaneous beams would
         double-capture and cost two lives in one second. (An attached carrier
         climbing or re-diving doesn't block this.) */
      const freshDive=bugs.some(o=>o!==b&&o.type==='scout'&&o.state==='scoutRun'&&!o.attached);
      if(freshDive){ b.cd=1.5; continue; }
      b.state='scoutRun'; b.runPhase='down'; b.t=0;
      b.sx0=b.slotX; b.sy0=b.slotY; b.tx=player.x;
      b.attached=false; b.beamMax=0; b.beamT=0; b.captive=null;
      b.angle=0; /* drop the formation idle-rock before the beam descent */
      AudioSys.sfx.tractorStart();
    }
  }
}

/* ---------------- attack waves ---------------- */
function updatePhase(dt){
  if(phase==='ready'){
    phaseT-=dt;
    if(phaseT<=0){
      if(wave%3===0) startBonus();
      else{ phase='entry'; entryT=0.4/DIFF; }
    }
  }
  else if(phase==='entry'){
    entryT-=dt;
    if(entryT<=0&&entryQueue.length){
      const batch=entryQueue.splice(0,4).filter(b=>bugs.includes(b));
      for(const b of batch){
        b.state='entering'; b.t=0;
        b.sx0=W/2+(b.slotX<W/2?-1:1)*(5+Math.random()*12);
        b.sy0=-26; b.x=b.sx0; b.y=-26;
      }
      entryT=0.34/DIFF;
      AudioSys.sfx.warpIn();
    }
    if(!entryQueue.length&&!bugs.some(b=>b.state==='entering'||b.state==='queued')){
      phase='attack'; attackT=2.0;
      announceText('READY','');
      AudioSys.sfx.formation();
    }
  }
  else if(phase==='attack'){
    attackT-=dt;
    const pool=bugs.filter(x=>x.state==='formed'&&x.type!=='scout');
    if(attackT<=0&&pool.length){
      const n=Math.min(pool.length,1+Math.floor(Math.random()*3));
      for(let i=0;i<n;i++) startDive(pool[Math.floor(Math.random()*pool.length)]);
      attackT=(Math.max(1.6,2.7-wave*0.05)+Math.random()*0.8)/DIFF; /* more frequent dive attacks */
    }
    if(pool.length>0&&pool.length<=3&&Math.random()<0.02) startDive(pool[0]);
    /* wave clear? — every enemy must actually be gone (covers all bug states),
       then sweep the field so no stragglers linger behind the WAVE CLEAR banner */
    if(bugs.length===0){
      bugs=[]; entryQueue=[]; pBullets=[]; eBullets=[];
      phase='clear'; phaseT=2.2;
      if(waveEscapes===0){
        /* PERFECT WAVE — every bug destroyed, none escaped: escalating CLEAR
           BONUS with a streak multiplier for consecutive clean clears */
        clearStreak++;
        const gain=500+500*clearStreak;
        score+=gain; checkExtra();
        popup(W/2,H/2-40,'+'+gain,'#ffd27a');
        announceText('PERFECT WAVE!','BONUS +'+gain+(clearStreak>1?' \u00d7'+clearStreak:''));
        perfectPayoff();
      }else{
        clearStreak=0;
        score+=500; checkExtra();
        popup(W/2,H/2-40,'+500 BONUS','#ffd27a');
        announceText('WAVE CLEAR','BONUS +500');
        AudioSys.sfx.formation();
      }
      waveEscapes=0;
    }
  }
  else if(phase==='boss'){
    updateBoss(dt);
  }
  else if(phase==='clear'){
    phaseT-=dt;
    if(phaseT<=0){ wave++; startWave(); }
  }
  else if(phase==='bonus'){
    bonus.time-=dt; bonus.spawnT-=dt;
    if(bonus.spawnT<=0&&bonus.spawned<bonus.total){ spawnBonusBug(); bonus.spawnT=0.6; }
    if(bonus.time<=0){
      bonus.active=false;
      /* stragglers still crossing the field get swept — they explode first
         (nothing vanishes while visible) and each pays a small consolation
         bonus, so clearing the field early still keeps meaning something */
      let stragglers=0;
      for(const m of bugs){
        if(m.state!=='queued'){
          stragglers++;
          const ex=clamp(m.x,6,W-6), ey=clamp(m.y,8,H-8);
          explosion(ex,ey,BUG_TYPES[m.type]?BUG_TYPES[m.type].color:'#ffd27a',8);
          popup(ex,ey,'+100','#ffd27a');
        }
      }
      bugs=[]; entryQueue=[]; pBullets=[]; eBullets=[]; /* clear the field for the next wave */
      /* a PERFECT round — every bug shot, none left flying — pays a flat
         +1000 on top of the 500/bug, so a full clear feels special */
      const perfect=(bonus.hits===bonus.total&&stragglers===0);
      const gained=bonus.hits*500+stragglers*100+(perfect?1000:0);
      score+=gained; checkExtra();
      popup(W/2,H/2-40,'+'+gained,'#ffd27a');
      /* banner shows the full tally breakdown — e.g. HITS 7×500 + 3 STRAYS×100 */
      let tally='';
      if(bonus.hits>0) tally+='HITS '+bonus.hits+'\u00d7500';
      if(stragglers>0) tally+=(tally?' + ':'')+stragglers+' STRAYS\u00d7100';
      if(perfect) tally+=(tally?' + ':'')+'PERFECT +1000';
      if(!tally) tally='+0';
      announceText(perfect?'PERFECT!':'BONUS COMPLETE',tally,perfect);
      if(perfect) perfectPayoff(); else AudioSys.sfx.extra();
      phase='clear'; phaseT=2.4;
    }
  }
}

function startBonus(){
  /* clearability model: 16 bugs / 16s = 1.0 kills/s, cadence 0.6s means
     the last bug lands at 9.4s with a 6.6s cleanup window — a full clear
     is tight but achievable for a skilled player (see spawnBonusBug). */
  bonus.active=true; bonus.time=16; bonus.hits=0; bonus.spawnT=0.4; bonus.spawned=0;
  bugs=[]; entryQueue=[]; pBullets=[]; eBullets=[]; /* clean slate — the bonus field replaces the wave */
  phase='bonus'; /* leave 'ready' or the timer/spawner never run (soft-lock) */
  announceText('BONUS STAGE!','SHOOT FOR 500 PTS');
  AudioSys.sfx.bonusStart();
}
function spawnBonusBug(){
  const types=['worm','worm','bug','bug','virus','virus','scout','rootkit'];
  const type=types[Math.floor(Math.random()*types.length)];
  const side=Math.random()<0.5?-1:1;
  const b=makeBug(type,0,0);
  b.state='bonus';
  b.x=side<0?-16:W+16;
  b.baseY=rand(50,H-120);
  b.y=b.baseY;
  b.vx=-side*rand(75,125); /* fly ACROSS the field — spawn side and travel direction must oppose, or bugs fly straight off-screen */
  b.amp=rand(14,42);
  b.freq=rand(0.6,1.8);
  b.phase0=rand(0,6);
  b.hp=1;
  bugs.push(b);
  bonus.spawned++;
}

/* ---------------- ROOTKIT KING boss wave ---------------- */
function startBossWave(){
  bugs=[]; entryQueue=[]; bonus.active=false;
  bossStartT=time; /* start the kill-clock for adaptive difficulty */
  /* base armor scales with boss tier; the adaptive multiplier tunes it so the
     next King fits how fast you dropped the last one */
  const maxHp=Math.max(10,Math.round(bossBaseHp()*bossDiff));
  boss={
    state:'enter', x:W/2, y:-30, t:0, dur:2.0,
    hp:maxHp, maxHp, phase:1,
    fireCd:2.0, spawnCd:2.8, flash:0, angle:0,
    sx:W/2, sy:-30, tx:W/2, bob:rand(0,6)
  };
  phase='boss';
  announceText('WAVE '+wave,'ROOTKIT KING');
  AudioSys.sfx.bonusStart();
}
function bossBaseHp(){ return 32+Math.floor((wave-5)/5)*10; } /* wave5:32, wave10:42, wave15:52… */
function tuneBossDiff(){
  /* adaptive difficulty — how fast did you drop the King? The next King's HP
     and volley cadence step by at most ±15% to keep the fight tense but fair. */
  const refT=bossBaseHp()*0.65; /* target: ~21s at wave 5, scales with the King's armor */
  const killT=Math.max(1,time-bossStartT);
  const rate=clamp(refT/killT,0.85,1.15); /* one ±15% step per king */
  const prevDiff=bossDiff;
  bossDiff=clamp(bossDiff*rate,0.8,1.3);
  const up=bossDiff>prevDiff; /* arrow always matches the displayed multiplier */
  popup(W/2,100,(up?'DIFF UP':'DIFF DOWN')+' ×'+bossDiff.toFixed(2),up?'#ffd27a':'#5cff5c');
}
function bossPhaseAt(){
  const f=boss.hp/boss.maxHp;
  return f>0.7?1:(f>0.4?2:3); /* phase 3 (the ring barrage) kicks in later — 40% left, not 33% */
}
function updateBoss(dt){
  if(!boss) return;
  boss.flash=Math.max(0,boss.flash-dt);
  if(boss.state==='enter'){
    boss.t+=dt/boss.dur;
    const tt=easeInOut(Math.min(1,boss.t));
    boss.x=boss.sx+(boss.tx-boss.sx)*tt;
    boss.y=boss.sy+90*tt;
    if(boss.t>=1){ boss.state='active'; boss.y=60; }
    return;
  }
  if(boss.state==='dying'){
    boss.t+=dt;
    if(boss.t>0.9){ boss=null; bossDefeated(); }
    return;
  }
  /* active: patrol sine at top */
  boss.t+=dt;
  boss.x=W/2+Math.sin(boss.t*(0.6+boss.phase*0.25)+boss.bob)*85;
  boss.y=60+Math.sin(boss.t*1.8+boss.bob)*6;
  /* attack patterns */
  boss.fireCd-=dt;
  if(boss.fireCd<=0 && eBullets.length<6){ /* fewer boss bullets on screen at once — real shot windows */
    bossAttack();
    const base=boss.phase===1?2.2:(boss.phase===2?1.7:1.2);
    boss.fireCd=rand(base*0.8,base*1.2)/bossDiff; /* adaptive: a hardened King volleys faster */
  }
  /* spawn minions */
  boss.spawnCd-=dt;
  if(boss.spawnCd<=0 && bugs.length<8){
    spawnMinion();
    const base=boss.phase===1?3.2:(boss.phase===2?2.4:1.6);
    boss.spawnCd=rand(base*0.7,base*1.3);
  }
  /* phase transitions on damage */
  const np=bossPhaseAt();
  if(np!==boss.phase){
    boss.phase=np;
    boss.flash=0.5;
    announceText('PHASE SHIFT','KING WEAKENING');
    AudioSys.sfx.bossPhase();
  }
}
function bossAttack(){
  const bx=boss.x, by=boss.y+14;
  const ax=player.alive&&!player.captured?player.x:W/2;
  const ay=player.alive&&!player.captured?player.y:H*0.8;
  const a0=Math.atan2(ay-by,ax-bx);
  const sp=Math.min(115,70+wave*2.5);
  const big=true;
  if(boss.phase===1){
    eBullets.push({x:bx,y:by,vx:Math.cos(a0)*sp,vy:Math.sin(a0)*sp,t:0,big});
  }else if(boss.phase===2){
    /* 3-way fan instead of 5 — dodgeable without abandoning the fight */
    for(let i=-1;i<=1;i++){
      const a=a0+i*0.22;
      eBullets.push({x:bx,y:by,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,t:0,big});
    }
  }else{
    /* 5-ring instead of 10 — 72° gaps the player can shoot straight through */
    const n=5, off=rand(0,Math.PI*2);
    for(let i=0;i<n;i++){
      const a=off+i/n*Math.PI*2;
      eBullets.push({x:bx,y:by,vx:Math.cos(a)*sp*0.9,vy:Math.sin(a)*sp*0.9,t:0,big});
    }
    eBullets.push({x:bx,y:by,vx:Math.cos(a0)*sp,vy:Math.sin(a0)*sp,t:0,big});
  }
  AudioSys.sfx.bossFire();
}
function spawnMinion(){
  const types=['worm','bug','virus'];
  const type=types[Math.floor(Math.random()*types.length)];
  const b=makeBug(type,0,0);
  b.state='diving'; b.t=0;
  b.sx0=boss.x+rand(-40,40); b.sy0=boss.y-20; b.x=b.sx0; b.y=b.sy0;
  b.tx=player.x+rand(-30,30);
  b.pattern=pickPattern(b.type, waveSignature(wave)); /* minions follow the wave signature too */
  b.dur=b.type==='virus'?rand(1.7,2.2):rand(1.5,2.0);
  b.hp=1;
  bugs.push(b);
}
function killBoss(){
  boss.state='dying'; boss.t=0;
  /* minions are caught in the King's death — each one detonates instead of
     silently vanishing from the field */
  for(const m of bugs){
    if(m.state!=='queued') explosion(clamp(m.x,6,W-6),clamp(m.y,8,H-8),BUG_TYPES[m.type]?BUG_TYPES[m.type].color:'#ffd27a',10);
  }
  bugs=[]; entryQueue=[]; pBullets=[]; eBullets=[]; /* minions vanish the instant the King falls */
  const gain=5000+Math.floor(wave/5)*1000;
  score+=gain; checkExtra();
  popup(boss.x,boss.y,'+'+gain,'#ffd27a');
  /* huge multi-stage eruption */
  for(let i=0;i<6;i++){
    explosion(boss.x+rand(-22,22),boss.y+rand(-18,18), i%2?'#5cff5c':'#ffe97a', 26);
  }
  explosion(boss.x,boss.y,'#ffffff',40);
  explosion(boss.x,boss.y,'#ffd27a',28);
  shake=Math.max(shake,24); flash=Math.max(flash,0.8);
  AudioSys.sfx.bossDie();
  vibrate([120,60,200]);
}
function bossDefeated(){
  bugs=[]; entryQueue=[]; pBullets=[]; eBullets=[]; /* sweep remaining minions off the field */
  phase='clear'; phaseT=2.6;
  if(waveEscapes===0){
    /* boss wave also counts toward the PERFECT streak — no minion escaped */
    clearStreak++;
    const gain=500+500*clearStreak;
    score+=gain; checkExtra();
    popup(W/2,H/2-40,'+'+gain,'#ffd27a');
    announceText('PERFECT WAVE!','KING SLAIN · +'+gain+(clearStreak>1?' \u00d7'+clearStreak:''));
    perfectPayoff();
  }else{
    clearStreak=0;
    announceText('ROOTKIT KING DOWN','KING SLAIN');
    AudioSys.sfx.formation();
  }
  waveEscapes=0;
  if(!demo) tuneBossDiff(); /* adaptive difficulty — ±15% step per king kill */
}

/* ---------------- collisions with player ---------------- */
function checkPlayerHits(){
  if(!player.alive||player.captured||player.invuln>0||player.fall) return;
  for(let i=eBullets.length-1;i>=0;i--){
    const b=eBullets[i];
    const dx=b.x-player.x, dy=b.y-player.y;
    if(dx*dx+dy*dy<(b.big?144:100)){ eBullets.splice(i,1); killPlayer(); return; }
  }
  /* boss body collision (rootking s=1 so hitRadius is unchanged) */
  if(boss&&(boss.state==='enter'||boss.state==='active')){
    const r=hitRadius('rootking')+8;
    const dx=boss.x-player.x, dy=boss.y-player.y;
    if(dx*dx+dy*dy<r*r){ killPlayer(); return; }
  }
  for(const bug of bugs){
    if(bug.state!=='diving'&&bug.state!=='scoutRun') continue;
    const r=hitRadius(bug.type)+3; /* FAIR HITS enlarges to match retro's full-size sprites */
    const dx=bug.x-player.x, dy=bug.y-player.y;
    if(dx*dx+dy*dy<r*r){ killPlayer(); return; }
  }
}

/* ---------------- flow ---------------- */
function announceText(text,sub,perfect){
  announce={text,sub,t:2.6,perfect:!!perfect};
}
function startGame(isDemo){
  AudioSys.ensure();
  demo=!!isDemo; demoTime=0; demoIdle=0; demoDx=0; demoFire=false;
  if(!demo) saveHi();
  state='play'; paused=false;
  wave=1; score=0; lives=3; nextExtra=20000;
  clearStreak=0; waveEscapes=0;
  bossDiff=1.0; bossStartT=0; /* a fresh game starts against a baseline King */
  player={x:W/2,y:PLAYER_Y,alive:true,dual:false,invuln:2,fireCd:0,captured:null,respawnT:0,fall:null};
  pBullets=[]; eBullets=[]; particles=[]; popups=[]; rescues=[];
  touchMove={left:false,right:false}; touchFire=false;
  bonus={active:false,time:0,hits:0,spawnT:0,total:16,spawned:0};
  boss=null;
  shake=0; flash=0;
  awaitingInitials=false;
  hintShown=false; /* the SHOOT THE SPIDER hint is a per-run onboarding beat */
  elInitials.classList.remove('active');
  elTitle.classList.remove('active');
  elOver.classList.remove('active');
  elPause.classList.remove('active');
  if(!demo) elBtns.classList.add('show');
  updateTouchControls();
  buildWave();
  phase='ready'; phaseT=1.6;
  announceText(demo?'DEMO MODE':'WAVE 1', demo?'PRESS START TO PLAY':'STRAIGHT RUN');
  AudioSys.startMusic();
}
function startDemo(){
  startGame(true);
}
function startWave(){
  waveEscapes=0; /* fresh escape tally for the new wave */
  if(wave%5===0){ startBossWave(); return; }
  buildWave();
  phase='ready'; phaseT=1.5;
  announceText('WAVE '+wave,(wave%3===0)?'BONUS STAGE AHEAD':SIG_NAMES[waveSignature(wave)]);
}
function saveHi(){
  try{ if(score>hi){ hi=score; localStorage.setItem('bugswarm_hi',String(hi)); } }catch(e){}
}
function endGame(){
  if(demo){ toTitle(); return; } /* attract demo ends quietly */
  if(state==='over') return; /* already finishing — guard against double-call from chargeCapturedLife racing a player-death endGame */
  state='over';
  rescues=[]; /* clear any falling rescues so the next run starts clean, and so updateRescues doesn't waste cycles on dead entries */
  paused=false;
  AudioSys.stopMusic(); AudioSys.sfx.tractorStop();
  elBtns.classList.remove('show');
  updateTouchControls();
  if(qualifies(score)){
    awaitingInitials=true;
    initials={slots:['A','A','A'],idx:0};
    elInitialsScore.textContent=pad6(score);
    elInitials.classList.add('active');
    renderInitials();
    AudioSys.sfx.extra();
    vibrate([60,30,80]);
  }else{
    saveHi();
    showGameOver(-1,getBoard());
    AudioSys.sfx.gameOver();
    vibrate([120,50,180]);
  }
}
function toTitle(){
  state='title'; paused=false; demo=false; demoIdle=0;
  awaitingInitials=false;
  boss=null; rescues=[];
  elTitle.classList.add('active');
  elInitials.classList.remove('active');
  elOver.classList.remove('active');
  elPause.classList.remove('active');
  elBtns.classList.remove('show');
  updateTouchControls();
  AudioSys.stopMusic(); AudioSys.sfx.tractorStop();
  renderTitleBoard();
  buildDemo();
}
function togglePause(force){
  if(state!=='play'||demo) return;
  paused=(force!==undefined)?force:!paused;
  if(paused){
    elPause.classList.add('active');
    AudioSys.stopMusic();
    AudioSys.sfx.tractorStop();
  }else{
    elPause.classList.remove('active');
    AudioSys.startMusic();
  }
  updateTouchControls();
}
function toggleMute(){
  AudioSys.toggleMute();
  refreshMuteUI();
}
function refreshMuteUI(){
  const muted=AudioSys.muted;
  btnMute.textContent=muted?'🔇':'🔊';
  const ind=$('mute-indicator');
  if(ind){
    ind.textContent=muted?'SOUND: OFF':'SOUND: ON';
    ind.classList.toggle('muted',muted);
  }
}
function toggleFs(){
  if(document.fullscreenElement) document.exitFullscreen();
  else if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
}

/* ---------------- high scores & initials ---------------- */
function getBoard(){
  try{
    const raw=localStorage.getItem('bugswarm_board');
    const b=raw?JSON.parse(raw):[];
    if(!Array.isArray(b)) return [];
    return b.filter(e=>e&&typeof e.score==='number'&&typeof e.initials==='string')
            .sort((x,y)=>y.score-x.score||x.date-y.date)
            .slice(0,10);
  }catch(e){ return []; }
}
function qualifies(s){
  if(s<=0) return false;
  const b=getBoard();
  if(b.length<10) return true;
  return s>=b[b.length-1].score;
}
function saveEntry(inits,s,w){
  const entry={initials:inits,score:s,wave:w,date:Date.now(),id:Math.random().toString(36).slice(2)};
  const b=getBoard(); b.push(entry);
  b.sort((x,y)=>y.score-x.score||x.date-y.date);
  const nb=b.slice(0,10);
  let rank=nb.findIndex(e=>e.id===entry.id);
  if(rank===-1){ nb[9]=entry; rank=9; } /* tie at the boundary: keep the new entry */
  try{ localStorage.setItem('bugswarm_board',JSON.stringify(nb)); }catch(e){}
  hi=nb.length?nb[0].score:hi;
  try{ localStorage.setItem('bugswarm_hi',String(hi)); }catch(e){}
  return {rank, board:nb};
}
function renderBoard(container,board,highlightId){
  container.innerHTML='';
  if(!board.length){
    const d=document.createElement('div');
    d.className='empty'; d.textContent='NO RECORDS YET — BE THE FIRST';
    container.appendChild(d);
    return;
  }
  board.forEach((e,i)=>{
    const row=document.createElement('div');
    row.className='row'+(e.id===highlightId?' new':'');
    const rk=document.createElement('span'); rk.className='rk'; rk.textContent=String(i+1).padStart(2,'0');
    const nm=document.createElement('span'); nm.className='in'; nm.textContent=e.initials;
    const sc=document.createElement('span'); sc.className='sc'; sc.textContent=pad6(e.score);
    row.append(rk,nm,sc);
    container.appendChild(row);
  });
}
function renderTitleBoard(){ renderBoard(elScoreList,getBoard().slice(0,5),null); }
function buildAlphaGrid(){
  const grid=document.getElementById('alpha-grid');
  for(const ch of ALPHABET){
    const b=document.createElement('button');
    b.className='alpha-btn';
    b.textContent=ch;
    b.addEventListener('click',()=>{ AudioSys.ensure(); typeLetter(ch); });
    grid.appendChild(b);
  }
}

function renderInitials(){
  for(let i=0;i<3;i++){
    const el=document.getElementById('slot-'+i);
    el.textContent=initials.slots[i];
    el.classList.toggle('active', i===Math.min(initials.idx,2));
  }
}
function typeLetter(ch){
  if(initials.idx>=3) return;
  initials.slots[initials.idx]=ch;
  initials.idx++;
  AudioSys.sfx.uiSelect();
  renderInitials();
}
function cycleLetter(dir){
  const s=Math.min(initials.idx,2);
  let i=ALPHABET.indexOf(initials.slots[s]);
  i=(i+dir+ALPHABET.length)%ALPHABET.length;
  initials.slots[s]=ALPHABET[i];
  AudioSys.sfx.uiMove();
  renderInitials();
}
function initialsBack(){
  initials.idx=Math.max(0,initials.idx-1);
  AudioSys.sfx.uiMove();
  renderInitials();
}
function handleInitialsKey(c){
  if(c==='arrowleft'||c==='arrowup') cycleLetter(-1);
  else if(c==='arrowright'||c==='arrowdown') cycleLetter(1);
  else if(c==='backspace') initialsBack();
  else if(c==='enter'||c===' ') confirmInitials();
  else if(c.length===1&&ALPHABET.includes(c.toUpperCase())) typeLetter(c.toUpperCase());
}
function confirmInitials(){
  if(!awaitingInitials) return;
  awaitingInitials=false;
  const res=saveEntry(initials.slots.join(''),score,wave);
  elInitials.classList.remove('active');
  showGameOver(res.rank,res.board);
  renderTitleBoard();
}
function showGameOver(rank,board){
  const b=board||getBoard();
  elOverScore.textContent=pad6(score);
  elOverHi.textContent=pad6(hi);
  elNewRecord.style.display=(rank===0)?'block':'none';
  renderBoard(elOverBoard,b,rank>=0?b[rank].id:null);
  elOver.classList.add('active');
}

/* ---------------- demo / attract ---------------- */
function buildDemo(){
  attract=[];
  for(let r=0;r<5;r++){
    for(let c=0;c<8;c++){
      const [x,y]=slotXY(r,c);
      attract.push({type:rowType(r),x,y,phase0:c*0.8+r*2.1+Math.random()*6.28});
    }
  }
  attract.push({type:'scout',x:W/2-(RETRO_MODE?95:99),y:FORMTOP+4*ROWGAP+(RETRO_MODE?36:41),phase0:Math.random()*6.28});
  attract.push({type:'scout',x:W/2+(RETRO_MODE?95:99),y:FORMTOP+4*ROWGAP+(RETRO_MODE?36:41),phase0:Math.random()*6.28});
}

/* ---------------- update ---------------- */
function update(dt){
  time+=dt;
  updateBG(dt);
  shake=Math.max(0,shake-dt*26);
  flash=Math.max(0,flash-dt*1.6);
  if(announce.t>0) announce.t-=dt;
  updatePlayer(dt);
  updateBullets(dt);
  updateBugs(dt);
  updateScouts(dt);
  checkBulletHits();
  checkPlayerHits();
  updatePhase(dt);
  updateFX(dt);
  updateRescues(dt);
}

/* ---------------- render ---------------- */
function drawGameScene(){
  drawTractorBeams();
  if(boss){
    const pulse=1+Math.sin(time*5)*0.04;
    let alpha=1;
    if(boss.state==='dying') alpha=Math.max(0,1-boss.t*1.1);
    drawBug(ctx,'rootking',boss.x,boss.y,{angle:boss.angle,flash:boss.flash,alpha,scale:1.55*pulse,time,glow:14});
  }
  for(const b of bugs){
    let alpha=1;
    if(b.state==='queued') continue;
    /* subtle size thrum at the creature's own pace — body breathes as it bobs.
       Phase is detuned from the bob itself (f*1.7) so a sprite is never at its
       biggest exactly when it's at max displacement — the tight row gaps stay clear.
       The glow halo breathes in time with the idle rock, so the whole creature —
       body, tilt and aura — moves as one living thing. */
    let scale=1, glow=null;
    if(b.state==='formed'&&!RETRO_MODE){
      const bob=BUG_TYPES[b.type].bob;
      if(bob){
        scale=1+(bob.pulse-1)*Math.sin(time*bob.f*1.7+b.phase0*2);
        /* aura breathes in lockstep with the idle rock (same phase b.phase0*2.2) */
        glow=6*(1+0.2*Math.sin(time*bob.f*0.5+b.phase0*2.2));
      }
    }
    drawBug(ctx,b.type,b.x,b.y,{angle:b.angle,flash:b.flash,alpha,scale,glow,time});
  }
  drawCaptiveWings();
  drawRescues();
  drawPlayer();
  drawBullets();
  drawFX();
}
function drawTractorBeams(){
  for(const b of bugs){
    if(b.type!=='scout') continue;
    let beamTo=null;
    if(b.state==='scoutRun'&&b.beamMax>0) beamTo=b.y+b.beamMax;
    if(b.state==='scoutRun'&&b.attached) beamTo=b.captive?b.captive.y:player.y;
    if(b.state==='hold'&&b.captive) beamTo=b.captive.y;
    if(beamTo==null) continue;
    ctx.save();
    /* wider beam — a soft aura pass under the bright core so it reads at the new sprite scale */
    ctx.strokeStyle='#7dffb0'; ctx.shadowColor='#3dff8a'; ctx.shadowBlur=12; ctx.lineWidth=6;
    ctx.globalAlpha=0.22;
    ctx.beginPath();
    ctx.moveTo(b.x,b.y+6);
    const seg=6;
    for(let i=1;i<=seg;i++){
      const yy=b.y+6+(beamTo-b.y-6)*i/seg;
      const xx=b.x+Math.sin(time*14+i*1.3)*3.2*(i/seg);
      ctx.lineTo(xx,yy);
    }
    ctx.stroke();
    ctx.globalAlpha=0.55; ctx.lineWidth=3; ctx.shadowBlur=8;
    ctx.stroke(); /* same path re-stroked as the bright core */
    ctx.globalAlpha=0.3; ctx.strokeStyle='#eafff4'; ctx.lineWidth=1.5; ctx.shadowBlur=0;
    ctx.beginPath(); ctx.moveTo(b.x,b.y+8); ctx.lineTo(b.x+Math.sin(time*17)*2,beamTo); ctx.stroke();
    ctx.restore();
  }
}
function drawCaptiveWings(){
  for(const b of bugs){
    if(b.captive) drawPlayerShip(ctx,b.captive.x,b.captive.y,time);
  }
}
function drawPlayer(){
  if(player.fall){ drawPlayerShip(ctx,player.fall.x,player.fall.y,time); return; }
  if(!player.alive) return;
  let alpha=1;
  if(player.invuln>0&&!player.captured) alpha=Math.sin(time*22)>0?0.3:0.85;
  ctx.save();
  ctx.globalAlpha=alpha;
  if(player.dual){
    drawPlayerShip(ctx,player.x-9,player.y,time);
    drawPlayerShip(ctx,player.x+9,player.y,time);
  }else{
    drawPlayerShip(ctx,player.x,player.y,time);
  }
  ctx.restore();
}
function drawBullets(){
  ctx.save();
  ctx.shadowColor='#3df0ff'; ctx.shadowBlur=6;
  ctx.fillStyle='#c8f6ff';
  for(const b of pBullets){
    ctx.fillRect(b.x-1.5,b.y-5,3,10);
    ctx.fillStyle='#3df0ff';
    ctx.beginPath(); ctx.arc(b.x,b.y-6,2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#c8f6ff';
  }
  ctx.shadowColor='#ffb347'; ctx.shadowBlur=8;
  for(const b of eBullets){
    if(b.big){
      ctx.shadowColor='#ff4f6d'; ctx.shadowBlur=12;
      ctx.fillStyle='#ffb3bd';
      ctx.beginPath(); ctx.arc(b.x,b.y,4.5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ffd27a';
      ctx.beginPath(); ctx.arc(b.x,b.y,2.2,0,Math.PI*2); ctx.fill();
      ctx.shadowColor='#ffb347'; ctx.shadowBlur=8;
      ctx.fillStyle='#ffd27a';
    }else{
      ctx.beginPath(); ctx.arc(b.x,b.y,3,0,Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();
}
function drawHUD(){
  ctx.textBaseline='top';
  ctx.font='7px "Press Start 2P",monospace';
  ctx.textAlign='left';
  ctx.fillStyle='rgba(61,255,138,.55)'; ctx.fillText('SCORE',8,8);
  ctx.fillStyle='#eafff4'; ctx.fillText(pad6(score),8,17);
  ctx.textAlign='center';
  ctx.fillStyle='rgba(61,255,138,.55)'; ctx.fillText('HI-SCORE',W/2,8);
  ctx.fillStyle='#ffd27a'; ctx.fillText(pad6(Math.max(hi,score)),W/2,17);
  ctx.textAlign='right';
  ctx.fillStyle='rgba(61,255,138,.55)'; ctx.fillText(bonus.active?'BONUS':'ROUND',W-8,8);
  ctx.fillStyle='#eafff4'; ctx.fillText((bonus.active?String(Math.ceil(bonus.time)).padStart(2,'0'):String(wave).padStart(2,'0')),W-8,17);
  /* PERFECT WAVE streak — a gold ×N under the round counter when the streak is live */
  if(!bonus.active&&clearStreak>=1&&!demo){
    ctx.fillStyle='rgba(255,210,122,'+(0.7+0.3*Math.sin(time*3)).toFixed(2)+')';
    ctx.fillText('PERFECT \u00d7'+clearStreak,W-8,30);
  }
  /* lives */
  const n=Math.min(Math.max(lives,0),5);
  ctx.save();
  ctx.globalAlpha=0.9;
  for(let i=0;i<n;i++) drawPlayerShip(ctx,16+i*17,H-11,time);
  ctx.restore();
  if(bonus.active){
    ctx.textAlign='left'; ctx.fillStyle='#ffd27a';
    ctx.fillText('HITS '+bonus.hits,8,H-26);
  }
  if(gamepad.connected){
    ctx.textAlign='right'; ctx.fillStyle='rgba(61,255,138,.45)';
    ctx.fillText('PAD',W-8,H-26);
  }
  if(demo){
    ctx.textAlign='center';
    ctx.font='7px "Press Start 2P",monospace';
    ctx.fillStyle='rgba(255,210,122,'+(0.65+0.3*Math.sin(time*4)).toFixed(2)+')';
    ctx.fillText('DEMO MODE',W/2,boss?54:30);
  }
  /* boss health bar (below the top HUD row, clear of the hi-score digits) */
  if(boss&&(boss.state==='enter'||boss.state==='active')){
    const bw=150, bx=W/2-bw/2, by=42, bh=6;
    const frac=clamp(boss.hp/boss.maxHp,0,1);
    ctx.textAlign='center';
    ctx.font='6px "Press Start 2P",monospace';
    ctx.fillStyle='rgba(255,210,122,.9)';
    ctx.fillText('ROOTKIT KING'+(bossDiff!==1?' ×'+bossDiff.toFixed(2):''),W/2,by-8);
    /* segment ticks */
    ctx.fillStyle='rgba(0,0,0,.55)';
    ctx.fillRect(bx-1,by-1,bw+2,bh+2);
    const col=frac>0.66?'#5cff5c':(frac>0.33?'#ffd27a':'#ff4f6d');
    ctx.fillStyle=col;
    ctx.fillRect(bx,by,bw*frac,bh);
    ctx.fillStyle='rgba(0,0,0,.5)';
    ctx.fillRect(bx+bw/3-0.5,by,1,bh);
    ctx.fillRect(bx+bw*2/3-0.5,by,1,bh);
    ctx.strokeStyle='rgba(255,255,255,.4)'; ctx.lineWidth=1;
    ctx.strokeRect(bx-1,by-1,bw+2,bh+2);
  }
}
function drawAnnounce(){
  if(announce.t<=0) return;
  const a=Math.min(1,announce.t*2)*(0.6+0.4*Math.sin(time*6));
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='14px "Press Start 2P",monospace';
  /* a PERFECT clear gets a gold headline — the one announcement that breaks the green */
  if(announce.perfect){
    ctx.shadowColor='#ffd27a'; ctx.shadowBlur=20;
    ctx.fillStyle='rgba(255,224,150,'+a.toFixed(2)+')';
  }else{
    ctx.shadowColor='#3dff8a'; ctx.shadowBlur=14;
    ctx.fillStyle='rgba(234,255,244,'+a.toFixed(2)+')';
  }
  ctx.fillText(announce.text,W/2,H/2-26);
  ctx.shadowBlur=0;
  if(announce.sub){
    ctx.font='8px "Press Start 2P",monospace';
    ctx.fillStyle='rgba(255,210,122,'+a.toFixed(2)+')';
    ctx.fillText(announce.sub,W/2,H/2-6);
  }
}
function drawDemoScene(){
  for(const d of attract){
    if(RETRO_MODE){ /* classic look — full-size sprites locked in their slots */
      drawBug(ctx,d.type,d.x,d.y,{glow:6});
      continue;
    }
    const bob=BUG_TYPES[d.type].bob||{f:1.4,ax:1.6,ay:1.2,pulse:1};
    const p=d.phase0||0;
    const ph=time*bob.f+p;
    const ox=Math.sin(ph)*bob.ax*1.2;
    /* field breath is lockstep (no per-bug phase) — same as the in-game formed
       state, so the attract grid breathes as one unit exactly like the real one */
    const oy=Math.sin(ph*0.8+p*1.3)*bob.ay+Math.sin(time*0.5)*1.5;
    drawBug(ctx,d.type,d.x+ox,d.y+oy,{
      angle:Math.sin(ph*0.5+p*1.7)*0.045, /* gentle idle rock */
      glow:6*(1+0.2*Math.sin(ph*0.5+p*1.7)), /* breathing aura in lockstep with tilt */
      scale:1+(bob.pulse-1)*Math.sin(ph*1.7+p*2)
    });
  }
  drawFX();
}

/* ---------------- sprite compare strip ---------------- */
/* Draws a side-by-side MODERN vs RETRO reference on the title screen so players
   see what RETRO SCALE changes before enabling it. Each side is FORCED to its
   true scale regardless of the current toggle: drawBug multiplies o.scale by
   c.s in modern mode and by 1 in retro mode, so modern side passes
   RETRO_MODE?c.s:1 and retro side passes RETRO_MODE?1:1/c.s — both render
   identically whether the toggle is on or off. */
function drawSpriteCompare(){
  const cv=$('sprite-compare'); if(!cv) return;
  const g=cv.getContext('2d');
  const W=cv.width, H=cv.height;
  g.clearRect(0,0,W,H);
  const types=['rootkit','virus','worm']; /* three personalities: rootkit slow & heavy, virus twitchy, worm fast & wiggly */
  const leftX=W*0.27, rightX=W*0.75, y=H*0.48; /* 0.48 keeps the full-size rootkit's bottom spikes clear of the labels */
  /* live status: the side matching the current RETRO SCALE state is the active
     one — full brightness with a pulsing glow — while the other dims. The strip
     doubles as a readout of what you'd get if you toggled now. */
  const modernActive=!RETRO_MODE;
  const pulse=Math.sin(time*3)*1.8; /* subtle glow pulse on the active side */
  /* faint center divider */
  g.strokeStyle='rgba(61,240,255,.14)'; g.lineWidth=1;
  g.beginPath(); g.moveTo(W/2,6); g.lineTo(W/2,H-10); g.stroke();
  /* per-type idle personality — the SAME bob the bugs do in the modern
     formation (BUG_TYPES.bob): the worm wiggles fast & wide (3.6Hz/±2.2), the
     virus twitches (3.0Hz/±1.3), the rootkit thrums heavy & slow (0.7Hz/±0.8).
     MODERN and RETRO are offset by a
     quarter-wave (π/2) so the two sizes sway independently instead of
     mirroring each other — same rhythm, never lockstep. Bob is world-space
     (added to the position, not scaled by the sprite), exactly like updateBugs,
     so the amplitude is identical across sizes; only the phase differs. */
  const DESYNC=window.__DESYNC||Math.PI/2; /* phase gap — set window.__DESYNC=Math.PI/4 in the console, then call drawSpriteCompare() to see the change live */
  const motion=types.map((t,i)=>{
    const bob=BUG_TYPES[t].bob||{f:1.4,ax:1.4,ay:1.1};
    const ph0=i*2.1+1.3; /* fixed per-type phase — rootkit & worm never lockstep */
    const make=off=>{
      const p=time*bob.f+ph0+off; /* side offset shifts the whole rhythm */
      return {
        bx:Math.sin(p)*bob.ax,
        by:Math.sin(p*0.8+ph0*1.3)*bob.ay,
        ang:Math.sin(p*0.5+ph0*1.7)*0.045
      };
    };
    return {modern:make(0), retro:make(DESYNC)};
  });
  for(let i=0;i<types.length;i++){
    const c=BUG_TYPES[types[i]];
    const m=motion[i]; /* {modern, retro} — each side bobs with its own phase */
    const ox=(i-1)*W*0.065; /* triptych spread: 3 types per half at ±17.9px pitch */
    /* MODERN — per-type scale c.s (active when RETRO SCALE is off) */
    drawBug(g,types[i],leftX+ox+m.modern.bx,y+m.modern.by,{
      scale:RETRO_MODE?c.s:1,
      angle:m.modern.ang,
      alpha:modernActive?1:0.55,
      glow:modernActive?(6+pulse):2,
      time
    });
    /* RETRO — full size (scale 1) (active when RETRO SCALE is on). Idle
       animations (virus twitch, rootkit heartbeat) get the same DESYNC phase
       offset as the bob, so the two halves never mirror each other. */
    drawBug(g,types[i],rightX+ox+m.retro.bx,y+m.retro.by,{
      scale:RETRO_MODE?1:1/c.s,
      angle:m.retro.ang,
      alpha:modernActive?0.55:1,
      glow:modernActive?2:(6+pulse),
      time:time+DESYNC
    });
  }
  /* faint red hitbox rings — draw AFTER the sprites so the ring overlays the
     body, BEFORE the veil so the inactive half's rings dim along with its
     sprites. MODERN always shows the classic c.r+2 (forgiving, matches the
     modern sprite); RETRO honors FAIR HITS (c.r/s+2, hugging the full-size
     sprite) — computed prospectively so toggling FAIR HITS grows the ring
     instantly, even while RETRO SCALE itself is off. */
  g.strokeStyle='rgba(255,90,90,0.5)'; g.lineWidth=1;
  for(let i=0;i<types.length;i++){
    const c=BUG_TYPES[types[i]];
    const m=motion[i];
    const ox=(i-1)*W*0.065;
    const rM=c.r+2; /* modern hitbox — classic radius, sprite is drawn smaller */
    const rR=(c.r*((FAIR_HITS&&c.s)?1/c.s:1))+2; /* retro hitbox — FAIR HITS enlarges to 1/s to match the full-size sprite */
    /* rings ride their side's bob — in-game the collision circle is centered on
       the bug's real (bobbing) position, so each ring tracks its own body */
    g.beginPath(); g.arc(leftX+ox+m.modern.bx,y+m.modern.by,rM,0,Math.PI*2); g.stroke();
    g.beginPath(); g.arc(rightX+ox+m.retro.bx,y+m.retro.by,rR,0,Math.PI*2); g.stroke();
  }
  /* dim the inactive half with a soft veil over the sprite band — the sprites'
     own stacked fills never dim far enough under globalAlpha alone, so the veil
     guarantees the inactive side reads as clearly secondary */
  g.fillStyle='rgba(1,6,12,.5)';
  if(modernActive) g.fillRect(W/2,6,W/2,H-12); /* dim RETRO */
  else g.fillRect(0,6,W/2,H-12);               /* dim MODERN */
  g.font='6px "Press Start 2P",monospace';
  g.textAlign='center';
  g.fillStyle=modernActive?'#7dffb0':'#3d5a4a';
  g.shadowColor='rgba(61,255,138,.5)'; g.shadowBlur=modernActive?(4+Math.max(0,pulse)):0;
  g.fillText('MODERN',W*0.27,H-5);
  g.fillStyle=modernActive?'#6a5426':'#ffd27a';
  g.shadowColor='rgba(255,210,122,.5)'; g.shadowBlur=modernActive?0:(4+Math.max(0,pulse));
  g.fillText('RETRO',W*0.75,H-5);
  g.shadowBlur=0;
}

/* ---------------- main loop ---------------- */
let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  let dt=Math.min(0.05,(now-last)/1000)*(window.__SPEED__||1); last=now; /* __SPEED__ = debug timescale, mirrors the __DESYNC tuning hook */
  pollGamepad();
  if(state==='play'&&!paused){
    if(demo){
      demoTime+=dt;
      if(demoTime>70){ toTitle(); return; } /* cap demo run, back to title */
    }
    update(dt);
  }
  else if(state==='title'){
    time+=dt; updateBG(dt);
    demoIdle+=dt;
    if(demoIdle>30) startDemo();
  }
  render();
}
function render(){
  drawBG();
  ctx.save();
  if(shake>0) ctx.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);
  if(state==='title'){ drawDemoScene(); drawSpriteCompare(); }
  else drawGameScene();
  ctx.restore();
  if(flash>0){
    ctx.fillStyle='rgba(255,255,255,'+Math.min(1,flash*0.5).toFixed(3)+')';
    ctx.fillRect(0,0,W,H);
  }
  if(state!=='title'){
    drawHUD();
    drawAnnounce();
  }
}

/* ---------------- UI wiring ---------------- */
btnStart.addEventListener('click',()=>{ AudioSys.ensure(); AudioSys.sfx.uiSelect(); startGame(); });
btnQuick.addEventListener('click',()=>{ AudioSys.ensure(); AudioSys.sfx.uiSelect(); startGame(); });
btnResume.addEventListener('click',()=>{ AudioSys.sfx.uiSelect(); togglePause(false); });
btnRestart.addEventListener('click',()=>{ AudioSys.sfx.uiSelect(); togglePause(false); startGame(); });
btnMenu.addEventListener('click',()=>{ AudioSys.sfx.uiSelect(); toTitle(); });
btnRestart2.addEventListener('click',()=>{ AudioSys.sfx.uiSelect(); startGame(); });
btnMenu2.addEventListener('click',()=>{ AudioSys.sfx.uiSelect(); toTitle(); });
btnPause.addEventListener('click',()=>{ AudioSys.sfx.uiMove(); togglePause(); });
btnMute.addEventListener('click',()=>{ AudioSys.sfx.uiMove(); toggleMute(); });
btnFs.addEventListener('click',()=>{ toggleFs(); });
btnHaptic.addEventListener('click',()=>{ AudioSys.sfx.uiMove(); toggleHaptics(); });
btnInitialsOk.addEventListener('click',()=>{ AudioSys.sfx.uiSelect(); confirmInitials(); });
btnInitialsDel.addEventListener('click',()=>{ AudioSys.sfx.uiMove(); initialsBack(); });
/* difficulty selector — EASY .95 / NORMAL 1.1 (+10%) / HARD 1.25; bosses excluded */
const diffBtns=[...document.querySelectorAll('.diff-btn')];
function setDiff(k){
  if(!DIFF_TIERS[k]) k='normal';
  diffKey=k; DIFF=DIFF_TIERS[k];
  try{ localStorage.setItem('bugswarm_diff',k); }catch(e){}
  diffBtns.forEach(b=>b.classList.toggle('active',b.dataset.diff===k));
  refreshQuickDiff();
}
function refreshQuickDiff(){
  const el=$('quick-diff');
  if(el) el.textContent=diffKey.toUpperCase();
}
diffBtns.forEach(b=>b.addEventListener('click',()=>{ AudioSys.sfx.uiMove(); setDiff(b.dataset.diff); }));

/* RETRO SCALE — restores the classic dense look: full-size sprites (RETRO_MODE
   skips BUG_TYPES.s in drawBug) + the tight 26×21 grid + scouts tucked back in.
   Persisted as 'bugswarm_retro'. Rebuilds the attract field live so the title
   screen flips instantly between the two looks. */
const btnRetro=$('btn-retro');
function setRetro(on,skipRebuild){
  RETRO_MODE=!!on;
  COLGAP=RETRO_MODE?RETRO_COLGAP:29;
  ROWGAP=RETRO_MODE?RETRO_ROWGAP:25;
  try{ localStorage.setItem('bugswarm_retro',RETRO_MODE?'1':'0'); }catch(e){}
  btnRetro.classList.toggle('active',RETRO_MODE);
  btnRetro.textContent='RETRO SCALE — '+(RETRO_MODE?'ON':'OFF');
  if(!skipRebuild&&state==='title') buildDemo(); /* flip the attract field between looks immediately */
}
btnRetro.addEventListener('click',()=>{
  AudioSys.sfx.uiMove();
  if(state==='play'&&demo) toTitle(); /* exit the attract demo cleanly before flipping the look */
  setRetro(!RETRO_MODE);
});

/* clickable sprite comparison strip — clicking the MODERN or RETRO half
   flips the RETRO SCALE toggle so the preview doubles as a direct way to
   try the look. Clicking the active side does nothing (it's already applied). */
const cvComp=$('sprite-compare');
if(cvComp){
  cvComp.addEventListener('pointerdown',e=>{
    if(state!=='title'||!e.target) return;
    const rect=cvComp.getBoundingClientRect();
    const x=e.clientX-rect.left;
    const half=x<rect.width/2; /* true = left (MODERN), false = right (RETRO) */
    const wantRetro=!half; /* clicking MODERN wants retro ON, clicking RETRO wants retro ON if it's OFF */
    if(wantRetro!==RETRO_MODE){
      AudioSys.sfx.uiMove();
      setRetro(wantRetro);
    }
  });
}

/* CRT FILTER — strips the full-screen scanline / aperture / vignette overlay
   (and the flicker animation) for a clean, crisp image. Default is ON — the
   phosphor look is the game's signature. Persisted as 'bugswarm_crt'. */
const btnCrt=$('btn-crt');
let CRT_FILTER=true;
function setCrt(on){
  CRT_FILTER=!!on;
  $('screen').classList.toggle('no-crt',!CRT_FILTER);
  btnCrt.classList.toggle('active',CRT_FILTER);
  btnCrt.textContent='CRT FILTER — '+(CRT_FILTER?'ON':'OFF');
  try{ localStorage.setItem('bugswarm_crt',CRT_FILTER?'1':'0'); }catch(e){}
}
btnCrt.addEventListener('click',()=>{ AudioSys.sfx.uiMove(); setCrt(!CRT_FILTER); });

/* FAIR HITS — companion to RETRO SCALE: enlarges hitboxes by 1/s so they match
   the full-size retro sprites exactly (in modern mode sprites are drawn s×
   smaller, so the classic r is already forgiving). No-op in modern mode —
   hitRadius() in bugs.js only scales up when FAIR_HITS && RETRO_MODE. Persisted
   as 'bugswarm_fair'. */
const btnFair=$('btn-fair');
/* FAIR_HITS lives in bugs.js (global) — hitRadius() reads it, so we assign to
   the shared global rather than shadowing it with a local here. */
function setFairHits(on){
  FAIR_HITS=!!on;
  btnFair.classList.toggle('active',FAIR_HITS);
  btnFair.textContent='FAIR HITS — '+(FAIR_HITS?'ON':'OFF');
  try{ localStorage.setItem('bugswarm_fair',FAIR_HITS?'1':'0'); }catch(e){}
}
btnFair.addEventListener('click',()=>{
  AudioSys.sfx.uiMove();
  setFairHits(!FAIR_HITS);
  /* FAIR HITS only enlarges hitboxes in retro mode — give a visible cue if it's
     switched on while RETRO SCALE is off, so it never looks like a silent no-op */
  if(FAIR_HITS&&!RETRO_MODE) popup(W/2,H/2-70,'PAIRS WITH RETRO SCALE','#cdb8ff');
});

/* ---------------- boot ---------------- */
/* restore persisted settings before the attract field builds. setRetro is told
   to skip its own rebuild — boot builds the attract field once below. CRT filter
   defaults to ON; only an explicit stored '0' turns it off. FAIR HITS defaults
   OFF; only an explicit stored '1' turns it on. */
try{
  const r=localStorage.getItem('bugswarm_retro');
  const d=localStorage.getItem('bugswarm_diff');
  const c=localStorage.getItem('bugswarm_crt');
  const f=localStorage.getItem('bugswarm_fair');
  setRetro(r==='1',true);
  if(d&&DIFF_TIERS[d]) setDiff(d);
  setCrt(c!=='0');
  setFairHits(f==='1');
}catch(e){}
initBG();
buildDemo();
buildAlphaGrid();
renderTitleBoard();
refreshMuteUI();
btnHaptic.textContent=hapticOn?'📳':'📴';
if(document.fonts&&document.fonts.load){
  document.fonts.load('8px "Press Start 2P"');
  document.fonts.load('16px "Press Start 2P"');
}
/* ---------------- debug hook ---------------- */
/* read-only state snapshot for console/live validation — mirrors the
   window.__DESYNC tuning hook. Never writes game state. NOTE: pBullets and
   eBullets are arrays of {x,y} (not counts) — update console scripts if
   you rely on the older scalar shape. */
window.__TEST__={
  /* debug: nudge the next formed scout into its dive early — the dive is
     exactly the one the AI would run anyway (same cd path, same dive code). */
  forceScoutDive(){ for(const b of bugs) if(b.type==='scout'&&b.state==='formed') b.cd=0.2; }
};
window.__BUGSWARM__=()=>({
  v:'1.47.0', state, demo, paused, phase, wave, score, lives, hi,
  awaitingInitials, dual:player.dual, captured:!!player.captured,
  player:{x:Math.round(player.x),y:Math.round(player.y),alive:player.alive,
          invuln:+player.invuln.toFixed(2),fireCd:+player.fireCd.toFixed(2),
          respawnT:+player.respawnT.toFixed(2)},
  rescues:rescues.map(r=>({x:Math.round(r.x),y:Math.round(r.y),vy:+r.vy.toFixed(1),pending:!!r.pendingLife})),
  scouts:bugs.filter(b=>b.type==='scout').map(b=>({
    state:b.state, runPhase:b.runPhase, t:+b.t.toFixed(2), attached:b.attached,
    beamMax:+b.beamMax.toFixed(0), beamT:+b.beamT.toFixed(2), x:Math.round(b.x), y:Math.round(b.y),
    holdT:+b.holdT.toFixed(1), captive:!!b.captive, cd:+b.cd.toFixed(1)})),
  bugs:bugs.length,
  pBullets:pBullets.map(b=>({x:Math.round(b.x),y:Math.round(b.y)})),
  eBullets:eBullets.map(b=>({x:Math.round(b.x),y:Math.round(b.y)})),
  divers:bugs.filter(b=>b.state==='diving').map(b=>({x:Math.round(b.x),y:Math.round(b.y),type:b.type}))
});
requestAnimationFrame(loop);
})();
