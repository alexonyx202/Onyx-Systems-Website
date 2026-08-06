'use strict';
/* ============================================================
   BUG SWARM — vector sprites (pure canvas art, no assets)
   ============================================================ */

/* RETRO SCALE: when ON, drawBug ignores the per-type sprite scale (BUG_TYPES.s)
   and renders every sprite at full original size, matching the dense 26×21
   formation grid from the classic look. Toggled from the title screen and
   persisted in localStorage ('bugswarm_retro').
   FAIR HITS: when ON (companion to RETRO SCALE), hitboxes are enlarged by the
   inverse of the per-type sprite scale so they match the full-size sprites —
   in modern mode sprites are drawn s× smaller while hitboxes stay r (forgiving);
   in retro the sprites are full-size, so fair hits restores r/s to match what
   you see. Persisted as 'bugswarm_fair'. */
let RETRO_MODE=false;
let FAIR_HITS=false;

/* hitRadius(type) — the collision radius used by game.js. Modern: the classic r
   (sprites are drawn smaller, so this is forgiving). Retro + FAIR HITS: scaled
   up by 1/s so the hitbox matches the full-size sprite exactly. */
function hitRadius(type){
  const c=BUG_TYPES[type]; if(!c) return 8;
  return c.r*((FAIR_HITS&&RETRO_MODE&&c.s)?1/c.s:1);
}

const BUG_TYPES={
  /* s = sprite draw scale (visual only — hitboxes use r, unchanged). The spiky
     viruses and armored rootkits are drawn BIG; the per-type scale keeps them
     from touching in the 30×24 formation grid. */
  /* bob = per-type formation personality: each creature sways at its own speed,
     with its own lean. f=frequency, ax=side-to-side amplitude, ay=vertical
     bob (kept small so the airy grid stays clear), pulse=size thrum at draw.
     rootkits thrum heavy & slow · worms wiggle fast & wide · viruses twitch ·
     ladybugs float gently · spiders skitter. */
  worm:   {score:100, hp:1, r:8,   s:0.82, bob:{f:3.6, ax:2.2, ay:0.4, pulse:1.03}, name:'DATA WORM',  color:'#41e0ff', dark:'#0d6f8f'},
  bug:    {score:100, hp:1, r:8.5, s:0.82, bob:{f:1.2, ax:1.1, ay:0.5, pulse:1.04}, name:'LADYBUG',    color:'#4f8dff', dark:'#1d3f8f'},
  virus:  {score:200, hp:1, r:9.5, s:0.78, bob:{f:3.0, ax:1.3, ay:0.5, pulse:1.03}, name:'RED VIRUS',  color:'#ff5a5a', dark:'#7f1010'},
  rootkit:{score:400, hp:2, r:11,  s:0.72, bob:{f:0.7, ax:0.8, ay:0.6, pulse:1.04}, name:'ROOTKIT',    color:'#5cff5c', dark:'#0d7f2a'},
  scout:  {score:200, hp:1, r:8.5, s:0.85, bob:{f:2.4, ax:1.8, ay:0.5, pulse:1.04}, name:'SPIDER',     color:'#ffb347', dark:'#8f4a10'},
  rootking:{score:5000, hp:60, r:16, s:1, name:'ROOTKIT KING', color:'#5cff5c', dark:'#0d7f2a'}
};

function drawBug(ctx,type,x,y,o){
  o=o||{};
  const c=BUG_TYPES[type]; if(!c) return;
  ctx.save();
  ctx.translate(x,y);
  if(o.angle) ctx.rotate(o.angle);
  const s=(o.scale||1)*((RETRO_MODE)?1:(c.s||1)); /* retro = full-size sprites (1×), modern = per-type scale */
  ctx.scale(s,s);
  if(o.alpha!=null) ctx.globalAlpha=o.alpha;
  ctx.shadowColor=c.color;
  /* glow scales with the sprite (s) so halos never bridge the formation gaps */
  ctx.shadowBlur=((o.glow==null)?6:o.glow)*s;

  if(type==='worm'){
    /* DATA WORM — slithering alien sidewinder: an S-curved chain of body
       segments, a single glowing cyclops eye and a ring of teeth. Long and
       low — the only horizontal creature in the swarm, so its silhouette
       can't be confused with the tall virus or the round bugs. */
    const g=ctx.createLinearGradient(0,-5,0,5);
    g.addColorStop(0,'#c2f8ff'); g.addColorStop(.5,c.color); g.addColorStop(1,c.dark);
    /* body segments — tail (left) to head (right), a gentle rising wave */
    const segs=[[-7,1.2,4.4,3.4],[-2.5,-1,4.8,3.8],[2,-2.5,5,4],[7,-2,5.4,4.4]];
    ctx.fillStyle=g;
    for(let i=0;i<segs.length;i++){
      ctx.beginPath(); ctx.ellipse(segs[i][0],segs[i][1],segs[i][2],segs[i][3],0,0,Math.PI*2); ctx.fill();
    }
    /* top highlight — light rides the crest of each segment */
    ctx.strokeStyle='rgba(255,255,255,.28)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(-9.5,0.2); ctx.quadraticCurveTo(-7,-1,-5,-0.2);
    ctx.moveTo(-4.5,-2.5); ctx.quadraticCurveTo(-2.5,-3.6,-0.5,-3);
    ctx.moveTo(-0.5,-4.5); ctx.quadraticCurveTo(2,-5.6,4.2,-4.9);
    ctx.moveTo(4.8,-4.9); ctx.quadraticCurveTo(7,-5.8,9.2,-4.8);
    ctx.stroke();
    /* segment seams */
    ctx.strokeStyle='rgba(4,42,58,.55)'; ctx.lineWidth=1.2;
    ctx.beginPath();
    ctx.moveTo(-4.8,-4.2); ctx.quadraticCurveTo(-4.6,0,-4.8,4.2);
    ctx.moveTo(-0.4,-5.6); ctx.quadraticCurveTo(-0.2,-0.5,-0.4,4.4);
    ctx.moveTo(4.4,-6); ctx.quadraticCurveTo(4.6,-1,4.4,3.8);
    ctx.stroke();
    /* belly nubs — stubby legs along the underside */
    ctx.strokeStyle=c.dark; ctx.lineWidth=1.1;
    ctx.beginPath();
    ctx.moveTo(-6.6,4.4); ctx.lineTo(-7.4,5.8);
    ctx.moveTo(-1.8,2.8); ctx.lineTo(-2.6,4.2);
    ctx.moveTo(3.4,1.6); ctx.lineTo(2.6,3);
    ctx.moveTo(8.6,2.3); ctx.lineTo(7.8,3.7);
    ctx.stroke();
    /* head — cyclops eye: ONE big glowing orb, unlike every other bug's pair */
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(9.6,-3.6,2.3,0,Math.PI*2); ctx.fill();
    ctx.save();
    ctx.shadowColor='#7ff0ff'; ctx.shadowBlur=5;
    ctx.fillStyle='#35d4ff';
    ctx.beginPath(); ctx.arc(9.9,-3.5,1.15,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(10.4,-4,0.5,0,Math.PI*2); ctx.fill();
    /* tooth-ring mouth — a ring of inward fangs */
    ctx.fillStyle='#031d26';
    ctx.beginPath(); ctx.arc(10.4,-0.4,2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#bfeeff';
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2+0.35;
      const bx=Math.cos(a), by=Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(10.4+bx*1.5,-0.4+by*1.5);
      ctx.lineTo(10.4+bx*2.4,-0.4+by*2.4);
      ctx.lineTo(10.4+bx*1.5+by*.55,-0.4+by*1.5-bx*.55);
      ctx.closePath(); ctx.fill();
    }
    /* feelers — thin antennae from the head */
    ctx.strokeStyle=c.color; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(6.6,-6.3); ctx.quadraticCurveTo(6.4,-9.5,5,-10);
    ctx.moveTo(9,-6.4); ctx.quadraticCurveTo(11.6,-8.5,11,-9.6);
    ctx.stroke();
    ctx.fillStyle=c.color;
    ctx.beginPath(); ctx.arc(5,-10,1.2,0,Math.PI*2); ctx.arc(11,-9.6,1.2,0,Math.PI*2); ctx.fill();

  }else if(type==='bug'){
    /* LADYBUG — compact armored alien beetle: a glossy dome shell with plate
       seams and glowing spots, long whip antennae, big round compound eyes.
       Small, round and shelled — the scout is all legs, this one is armor. */
    /* whip antennae — long, splaying up and out, glowing tips */
    ctx.strokeStyle=c.color; ctx.lineWidth=1.1;
    ctx.beginPath();
    ctx.moveTo(-4.2,-7.4); ctx.quadraticCurveTo(-8.5,-12,-11.2,-11.4);
    ctx.moveTo(4.2,-7.4); ctx.quadraticCurveTo(8.5,-12,11.2,-11.4);
    ctx.stroke();
    ctx.fillStyle='#dcecff';
    ctx.beginPath(); ctx.arc(-11.2,-11.4,1.3,0,Math.PI*2); ctx.arc(11.2,-11.4,1.3,0,Math.PI*2); ctx.fill();
    /* dome shell */
    const g=ctx.createLinearGradient(0,-8,0,12);
    g.addColorStop(0,'#c8d9ff'); g.addColorStop(.45,c.color); g.addColorStop(1,c.dark);
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.moveTo(-8.2,3.5);
    ctx.quadraticCurveTo(-8.2,-8.5,0,-8.5);
    ctx.quadraticCurveTo(8.2,-8.5,8.2,3.5);
    ctx.quadraticCurveTo(6.5,7,4,8.2);
    ctx.lineTo(-4,8.2);
    ctx.quadraticCurveTo(-6.5,7,-8.2,3.5);
    ctx.closePath(); ctx.fill();
    /* shell rim light */
    ctx.strokeStyle='rgba(230,238,255,.5)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(-7,-6.5); ctx.quadraticCurveTo(0,-8.2,7,-6.5); ctx.stroke();
    /* plate seams — the shell reads segmented */
    ctx.strokeStyle='rgba(10,16,60,.5)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(0,-8.5); ctx.lineTo(0,7.5);
    ctx.moveTo(-5.5,-4.5); ctx.quadraticCurveTo(0,-3.5,5.5,-4.5);
    ctx.stroke();
    /* glowing spots */
    ctx.fillStyle='#dcecff';
    [[-4.2,-3.5],[4.2,-3.5],[-4.8,1.5],[4.8,1.5],[0,4]].forEach(p=>{
      ctx.beginPath(); ctx.arc(p[0],p[1],1.6,0,Math.PI*2); ctx.fill();
    });
    /* head plate — teardrop at the front */
    ctx.fillStyle='#0c1a3c';
    ctx.beginPath();
    ctx.moveTo(-4.5,7);
    ctx.quadraticCurveTo(0,10.8,4.5,7);
    ctx.quadraticCurveTo(2.5,14,0,14.5);
    ctx.quadraticCurveTo(-2.5,14,-4.5,7);
    ctx.closePath(); ctx.fill();
    /* big round compound eyes — glowing blue cores */
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(-2,10.3,2.4,0,Math.PI*2); ctx.arc(2,10.3,2.4,0,Math.PI*2); ctx.fill();
    ctx.save();
    ctx.shadowColor='#7fa5ff'; ctx.shadowBlur=5;
    ctx.fillStyle='#1d5bff';
    ctx.beginPath(); ctx.arc(-1.7,10.4,1.2,0,Math.PI*2); ctx.arc(2.3,10.4,1.2,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(-1.2,10,0.5,0,Math.PI*2); ctx.arc(2.8,10,0.5,0,Math.PI*2); ctx.fill();
    /* small pincer mandibles */
    ctx.strokeStyle=c.dark; ctx.lineWidth=1.2;
    ctx.beginPath();
    ctx.moveTo(-2.4,12.6); ctx.quadraticCurveTo(-3.6,13.8,-2.4,14.8);
    ctx.moveTo(2.4,12.6); ctx.quadraticCurveTo(3.6,13.8,2.4,14.8);
    ctx.stroke();
    /* tiny jointed legs */
    ctx.strokeStyle=c.dark; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(-8.2,1.5); ctx.lineTo(-10.6,3);
    ctx.moveTo(-8,4.5); ctx.lineTo(-10.2,6.5);
    ctx.moveTo(8.2,1.5); ctx.lineTo(10.6,3);
    ctx.moveTo(8,4.5); ctx.lineTo(10.2,6.5);
    ctx.stroke();

  }else if(type==='virus'){
    /* RED VIRUS — parasitic alien: an upright segmented menace with a spiked
       back, slanted slit eyes and mandible pincers. Reads tall and hostile —
       the opposite silhouette of the scout's round sprawl. Idle life: the
       pincer tips chitter on a dual-frequency twitch and the slit eyes glow
       brighter on a ~3Hz beat (the virus's own bob speed), so even a parked
       virus looks twitchy and alive. */
    const R=10, t=o.time||0;
    const tw=Math.sin(t*13)*1.3+Math.sin(t*29)*0.6; /* nervous chitter */
    /* abdomen — spiky teardrop hanging below the head */
    const gA=ctx.createLinearGradient(0,-4,0,11);
    gA.addColorStop(0,'#ffc3ad'); gA.addColorStop(.4,c.color); gA.addColorStop(1,c.dark);
    ctx.fillStyle=gA;
    ctx.beginPath();
    ctx.moveTo(0,11);
    ctx.lineTo(4.2,9.6); ctx.lineTo(6.6,7.2); ctx.lineTo(8.8,4.4); ctx.lineTo(9.2,1);
    ctx.lineTo(7,-1.4); ctx.lineTo(4,-3.4); ctx.lineTo(0,-4);
    ctx.lineTo(-4,-3.4); ctx.lineTo(-7,-1.4); ctx.lineTo(-9.2,1); ctx.lineTo(-8.8,4.4);
    ctx.lineTo(-6.6,7.2); ctx.lineTo(-4.2,9.6);
    ctx.closePath(); ctx.fill();
    /* segment ridges — an alien bug's abdomen reads segmented */
    ctx.strokeStyle='rgba(96,0,0,.5)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(-6.4,2.6); ctx.quadraticCurveTo(0,4.4,6.4,2.6);
    ctx.moveTo(-7.4,5.8); ctx.quadraticCurveTo(0,7.6,7.4,5.8);
    ctx.stroke();
    /* back spines — three sharp crests (the spiky-virus heritage, made organic) */
    ctx.fillStyle=c.color;
    ctx.beginPath();
    ctx.moveTo(-2.6,-3.6); ctx.lineTo(0,-12.2); ctx.lineTo(2.6,-3.6);
    ctx.moveTo(-5.6,-2.2); ctx.lineTo(-3.8,-8.8); ctx.lineTo(-1.9,-2.9);
    ctx.moveTo(5.6,-2.2); ctx.lineTo(3.8,-8.8); ctx.lineTo(1.9,-2.9);
    ctx.fill();
    /* head — glossy ovoid on top */
    const gH=ctx.createLinearGradient(0,-10.5,0,-1.5);
    gH.addColorStop(0,'#ffd4c2'); gH.addColorStop(.45,c.color); gH.addColorStop(1,c.dark);
    ctx.fillStyle=gH;
    ctx.beginPath(); ctx.ellipse(0,-5.8,5.6,4.6,0,0,Math.PI*2); ctx.fill();
    /* head highlight */
    ctx.fillStyle='rgba(255,255,255,.2)';
    ctx.beginPath(); ctx.ellipse(-1.6,-7.2,2.4,1.5,0.35,0,Math.PI*2); ctx.fill();
    /* alien slit eyes — angled in toward the top, glowing white with red cores.
       The white glows brighter on a ~3Hz beat (the virus's twitch frequency),
       so the face pulses like a live thing even at rest. */
    const beat=0.5+0.5*Math.sin(t*3*Math.PI*2+0.6);
    ctx.save();
    ctx.shadowColor='#ffb9a8'; ctx.shadowBlur=(2+6*beat)*s; /* scaled like the outer glow so halos never bridge formation gaps */
    ctx.fillStyle='#fff';
    ctx.beginPath();
    ctx.moveTo(-5.6,-4.9); ctx.lineTo(-1.5,-7.1); ctx.lineTo(-1,-5.6); ctx.lineTo(-4.9,-3.9); ctx.closePath();
    ctx.moveTo(5.6,-4.9); ctx.lineTo(1.5,-7.1); ctx.lineTo(1,-5.6); ctx.lineTo(4.9,-3.9); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle='#c41515';
    ctx.beginPath();
    ctx.moveTo(-3.1,-5.4); ctx.lineTo(-1.7,-6.1); ctx.lineTo(-1.9,-5.3); ctx.closePath();
    ctx.moveTo(3.1,-5.4); ctx.lineTo(1.7,-6.1); ctx.lineTo(1.9,-5.3); ctx.closePath();
    ctx.fill();
    /* red pupils brighten on the same beat — a soft glow swell, not a blink */
    ctx.fillStyle='rgba(255,90,80,'+(0.25+0.6*beat).toFixed(3)+')';
    ctx.beginPath();
    ctx.moveTo(-3.1,-5.4); ctx.lineTo(-1.7,-6.1); ctx.lineTo(-1.9,-5.3); ctx.closePath();
    ctx.moveTo(3.1,-5.4); ctx.lineTo(1.7,-6.1); ctx.lineTo(1.9,-5.3); ctx.closePath();
    ctx.fill();
    /* mandible pincers — curved, sharp; the tips chitter nervously, so the
       face never sits perfectly still */
    ctx.strokeStyle=c.dark; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(-3.2,-2.8); ctx.quadraticCurveTo(-5.6,-1,-4.7+tw,1.7); ctx.lineTo(-6+tw,0.9);
    ctx.moveTo(3.2,-2.8); ctx.quadraticCurveTo(5.6,-1,4.7-tw,1.7); ctx.lineTo(6-tw,0.9);
    ctx.stroke();
    ctx.strokeStyle='#ffd9c4'; ctx.lineWidth=.7;
    ctx.beginPath();
    ctx.moveTo(-3.6,-1.8); ctx.lineTo(-5.1+tw*0.7,0.9);
    ctx.moveTo(3.6,-1.8); ctx.lineTo(5.1-tw*0.7,0.9);
    ctx.stroke();
    /* forelegs — two segmented pairs, hooked claws */
    ctx.strokeStyle=c.dark; ctx.lineWidth=1.1;
    ctx.beginPath();
    ctx.moveTo(-5.8,1.4); ctx.lineTo(-8.6,2.6); ctx.lineTo(-10.2,4.6);
    ctx.moveTo(-6.6,4.6); ctx.lineTo(-9.2,6.2); ctx.lineTo(-10.4,8.6);
    ctx.moveTo(5.8,1.4); ctx.lineTo(8.6,2.6); ctx.lineTo(10.2,4.6);
    ctx.moveTo(6.6,4.6); ctx.lineTo(9.2,6.2); ctx.lineTo(10.4,8.6);
    ctx.stroke();
    ctx.fillStyle=c.color;
    ctx.beginPath();
    ctx.arc(-10.2,4.6,1,0,Math.PI*2); ctx.arc(-10.4,8.6,1,0,Math.PI*2);
    ctx.arc(10.2,4.6,1,0,Math.PI*2); ctx.arc(10.4,8.6,1,0,Math.PI*2);
    ctx.fill();

  }else if(type==='rootkit'){
    /* ROOTKIT — armored scarab: heavy carapace, twin horns, stubby blade legs
       and a glowing data-seam. Low, wide and armored — a tank next to the
       virus's tall spikes and the scout's leggy sprawl. Idle life: the
       data-seam pulses like a heartbeat (a sharp lub-dub), so the shell reads
       as a living armored thing even at rest. */
    const R=13, t=o.time||0;
    /* heartbeat envelope: a strong thump then a soft echo — never below 0 */
    const hb=Math.pow(Math.max(0,Math.sin(t*2.2)),3)+0.55*Math.pow(Math.max(0,Math.sin(t*2.2+2.2)),8);
    /* carapace — rounded shield */
    const g=ctx.createLinearGradient(0,-R*.95,0,R*.65);
    g.addColorStop(0,'#c2ffc2'); g.addColorStop(.4,c.color); g.addColorStop(1,c.dark);
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.moveTo(-R*.92,R*.1);
    ctx.quadraticCurveTo(-R*.95,-R*.55,-R*.42,-R*.85);
    ctx.quadraticCurveTo(0,-R*1.0,R*.42,-R*.85);
    ctx.quadraticCurveTo(R*.95,-R*.55,R*.92,R*.1);
    ctx.quadraticCurveTo(R*.5,R*.55,0,R*.58);
    ctx.quadraticCurveTo(-R*.5,R*.55,-R*.92,R*.1);
    ctx.closePath(); ctx.fill();
    /* shell rim light */
    ctx.strokeStyle='rgba(235,255,235,.45)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(-R*.8,-R*.55); ctx.quadraticCurveTo(0,-R*.95,R*.8,-R*.55);
    ctx.stroke();
    /* plate seams */
    ctx.strokeStyle='rgba(0,55,18,.55)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(0,-R*.9); ctx.lineTo(0,R*.5);
    ctx.moveTo(-R*.4,-R*.75); ctx.quadraticCurveTo(0,-R*.66,R*.4,-R*.75);
    ctx.moveTo(-R*.55,-R*.45); ctx.quadraticCurveTo(0,-R*.36,R*.55,-R*.45);
    ctx.stroke();
    /* glowing data-seam down the shell — it IS a rootkit. Brightness, width
       and a pulsing node ride the heartbeat envelope. */
    ctx.save();
    ctx.globalAlpha=Math.min(1,.75+.6*hb);
    ctx.strokeStyle='#c8ffc8'; ctx.lineWidth=.9+1.3*hb;
    ctx.beginPath(); ctx.moveTo(0,-R*.85); ctx.lineTo(0,-R*.28); ctx.stroke();
    ctx.restore();
    /* seam pulse node — a bright bead that swells with each lub */
    ctx.fillStyle='rgba(233,255,233,'+(0.4+.6*Math.min(1,hb*1.4)).toFixed(3)+')';
    ctx.beginPath(); ctx.arc(0,-R*.55,(1+.9*hb),0,Math.PI*2); ctx.fill();
    /* twin horns — curved rhino-style, glowing tips */
    ctx.fillStyle=c.color;
    ctx.beginPath();
    ctx.moveTo(-R*.42,-R*.3); ctx.lineTo(-R*.6,-R*1.05); ctx.lineTo(-R*.2,-R*.42);
    ctx.closePath();
    ctx.moveTo(R*.42,-R*.3); ctx.lineTo(R*.6,-R*1.05); ctx.lineTo(R*.2,-R*.42);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle='#eaffea';
    ctx.beginPath(); ctx.arc(-R*.58,-R*1.02,1.1,0,Math.PI*2); ctx.arc(R*.58,-R*1.02,1.1,0,Math.PI*2); ctx.fill();
    /* head plate */
    ctx.fillStyle=c.dark;
    ctx.beginPath(); ctx.ellipse(0,-R*.22,R*.4,R*.3,0,0,Math.PI*2); ctx.fill();
    /* glowing eye slits */
    ctx.fillStyle='#d8ffd8';
    ctx.beginPath();
    ctx.ellipse(-R*.2,-R*.26,R*.13,R*.07,-0.6,0,Math.PI*2);
    ctx.ellipse(R*.2,-R*.26,R*.13,R*.07,0.6,0,Math.PI*2);
    ctx.fill();
    /* mandible pincers */
    ctx.strokeStyle=c.dark; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(-R*.28,R*.02); ctx.quadraticCurveTo(-R*.46,R*.24,-R*.26,R*.42);
    ctx.moveTo(R*.28,R*.02); ctx.quadraticCurveTo(R*.46,R*.24,R*.26,R*.42);
    ctx.stroke();
    /* stubby armored legs — two jointed pairs */
    ctx.strokeStyle=c.dark; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(-R*.55,R*.3); ctx.lineTo(-R*.92,R*.42); ctx.lineTo(-R*.85,R*.8);
    ctx.moveTo(-R*.34,R*.48); ctx.lineTo(-R*.74,R*.6); ctx.lineTo(-R*.66,R*.92);
    ctx.moveTo(R*.55,R*.3); ctx.lineTo(R*.92,R*.42); ctx.lineTo(R*.85,R*.8);
    ctx.moveTo(R*.34,R*.48); ctx.lineTo(R*.74,R*.6); ctx.lineTo(R*.66,R*.92);
    ctx.stroke();
    ctx.fillStyle=c.color;
    ctx.beginPath();
    ctx.arc(-R*.85,R*.8,1,0,Math.PI*2); ctx.arc(-R*.66,R*.92,1,0,Math.PI*2);
    ctx.arc(R*.85,R*.8,1,0,Math.PI*2); ctx.arc(R*.66,R*.92,1,0,Math.PI*2);
    ctx.fill();
    /* core glow */
    ctx.fillStyle='rgba(255,255,255,.16)';
    ctx.beginPath(); ctx.arc(0,R*.12,R*.26,0,Math.PI*2); ctx.fill();

  }else if(type==='rootking'){
    /* ROOTKIT KING — towering armored monarch of the swarm */
    const R=16, t=o.time||0;
    const pulse=0.9+Math.sin(t*5)*0.1;
    /* outer spike halo (12 spikes) */
    ctx.fillStyle=c.color;
    ctx.beginPath();
    for(let i=0;i<12;i++){
      const a=i/12*Math.PI*2;
      const rr=(i%2===0)?R+6:R+2.5;
      const px=Math.cos(a)*rr, py=Math.sin(a)*rr;
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath(); ctx.fill();
    /* gold spike tips */
    ctx.strokeStyle='#ffe97a'; ctx.lineWidth=1.6;
    ctx.beginPath();
    for(let i=0;i<12;i++){
      if(i%2) continue;
      const a=i/12*Math.PI*2;
      ctx.moveTo(Math.cos(a)*(R+3),Math.sin(a)*(R+3));
      ctx.lineTo(Math.cos(a)*(R+6),Math.sin(a)*(R+6));
    }
    ctx.stroke();
    /* crown (top spikes) */
    ctx.fillStyle='#ffe97a';
    ctx.beginPath();
    ctx.moveTo(-8,-R+2); ctx.lineTo(-5,-R-7); ctx.lineTo(-2.5,-R+2);
    ctx.lineTo(0,-R-10); ctx.lineTo(2.5,-R+2); ctx.lineTo(5,-R-7); ctx.lineTo(8,-R+2);
    ctx.closePath(); ctx.fill();
    /* twin scarab horns flanking the crown — the King wears the rootkit's horns */
    ctx.fillStyle='#b8ffb8';
    ctx.beginPath();
    ctx.moveTo(-R*.62,-R*.2); ctx.lineTo(-R*.95,-R-11); ctx.lineTo(-R*.3,-R*.5);
    ctx.closePath();
    ctx.moveTo(R*.62,-R*.2); ctx.lineTo(R*.95,-R-11); ctx.lineTo(R*.3,-R*.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle='#eaffea';
    ctx.beginPath(); ctx.arc(-R*.92,-R-11,1.6,0,Math.PI*2); ctx.arc(R*.92,-R-11,1.6,0,Math.PI*2); ctx.fill();
    /* inner armored shell */
    ctx.fillStyle=c.dark;
    ctx.beginPath(); ctx.arc(0,0,R*0.72,0,Math.PI*2); ctx.fill();
    const g=ctx.createLinearGradient(0,-R*.7,0,R*.7);
    g.addColorStop(0,'rgba(255,255,255,.5)'); g.addColorStop(1,'rgba(0,0,0,.3)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(0,0,R*0.72,0,Math.PI*2); ctx.fill();
    /* pulsing core */
    ctx.save();
    ctx.shadowColor='#d9ffd9'; ctx.shadowBlur=16;
    ctx.fillStyle='#eaffea';
    ctx.beginPath(); ctx.arc(0,0,R*0.5*pulse,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle='#b8ffb8';
    ctx.beginPath(); ctx.arc(0,0,R*0.34,0,Math.PI*2); ctx.fill();
    /* eyes */
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(-R*.32,-R*.1,4,0,Math.PI*2); ctx.arc(R*.32,-R*.1,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#a00';
    ctx.beginPath(); ctx.arc(-R*.3,-R*.05,2,0,Math.PI*2); ctx.arc(R*.3,-R*.05,2,0,Math.PI*2); ctx.fill();
    /* armored brow */
    ctx.strokeStyle=c.dark; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(-R*.7,-R*.45); ctx.lineTo(-R*.05,-R*.55);
    ctx.moveTo(R*.7,-R*.45); ctx.lineTo(R*.05,-R*.55);
    ctx.stroke();
    /* fangs */
    ctx.fillStyle='#d8ffd8';
    ctx.beginPath(); ctx.moveTo(-R*.2,R*.5); ctx.lineTo(-R*.3,R*.8); ctx.lineTo(-R*.05,R*.6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(R*.2,R*.5); ctx.lineTo(R*.3,R*.8); ctx.lineTo(R*.05,R*.6); ctx.closePath(); ctx.fill();
    /* status LEDs */
    ctx.fillStyle='#ffd27a';
    ctx.beginPath(); ctx.arc(-R*.55,-R*.5,1.4,0,Math.PI*2); ctx.arc(R*.55,-R*.5,1.4,0,Math.PI*2); ctx.fill();

  }else if(type==='scout'){
    /* tractor spider */
    ctx.strokeStyle=c.color; ctx.lineWidth=1.3;
    ctx.beginPath();
    const legs=[[6,3,12,2],[7,5,13,6],[7,8,12,10],[5,10,8,13],
                [-6,3,-12,2],[-7,5,-13,6],[-7,8,-12,10],[-5,10,-8,13]];
    for(const L of legs){ ctx.moveTo(L[0],L[1]); ctx.quadraticCurveTo(L[0]+(L[2]-L[0])*.5,L[1]+2,L[2],L[3]); }
    ctx.stroke();
    const g=ctx.createLinearGradient(0,-8,0,8);
    g.addColorStop(0,'#ffe3b0'); g.addColorStop(1,c.color);
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(0,-3,7,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=c.dark;
    ctx.beginPath(); ctx.ellipse(0,3.5,5.5,4.5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(-2.6,3.6,2.4,0,Math.PI*2); ctx.arc(2.6,3.6,2.4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#3a1400';
    ctx.beginPath(); ctx.arc(-3,3.9,1.1,0,Math.PI*2); ctx.arc(2.2,3.9,1.1,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#6e3608'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(-1.4,7.6); ctx.lineTo(-2.4,9.6); ctx.moveTo(1.4,7.6); ctx.lineTo(2.4,9.6); ctx.stroke();
  }

  /* white hit-flash overlay — tracks the effective hitbox so fair-hits
     enlargements stay visible where shots actually land */
  if(o.flash>0){
    ctx.save();
    ctx.globalAlpha=Math.min(1,o.flash*4)*0.85;
    ctx.shadowBlur=0;
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(0,0,hitRadius(type)+2,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* player fighter — sleek mainframe interceptor */
function drawPlayerShip(ctx,x,y,time){
  ctx.save();
  ctx.translate(x,y);
  const th=0.75+Math.sin(time*18)*0.25;
  /* engine flame */
  ctx.save();
  ctx.globalAlpha=0.75; ctx.shadowColor='#ffb347'; ctx.shadowBlur=10;
  ctx.fillStyle='#ffb347';
  ctx.beginPath(); ctx.moveTo(-3,7); ctx.lineTo(0,7+7*th); ctx.lineTo(3,7); ctx.closePath(); ctx.fill();
  ctx.restore();
  /* hull */
  const g=ctx.createLinearGradient(0,-11,0,8);
  g.addColorStop(0,'#eefdff'); g.addColorStop(.5,'#8fd8e8'); g.addColorStop(1,'#2c5a7a');
  ctx.shadowColor='#3df0ff'; ctx.shadowBlur=8;
  ctx.fillStyle=g;
  ctx.beginPath();
  ctx.moveTo(0,-11);
  ctx.lineTo(4.5,-4); ctx.lineTo(11,6); ctx.lineTo(5.5,5); ctx.lineTo(5.5,8);
  ctx.lineTo(-5.5,8); ctx.lineTo(-5.5,5); ctx.lineTo(-11,6); ctx.lineTo(-4.5,-4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,-11); ctx.lineTo(0,8); ctx.stroke();
  ctx.strokeStyle='#0a3a55'; ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(4.5,-4); ctx.lineTo(9,5);
  ctx.moveTo(-4.5,-4); ctx.lineTo(-9,5);
  ctx.stroke();
  /* cockpit */
  ctx.fillStyle='#3df0ff'; ctx.shadowColor='#3df0ff'; ctx.shadowBlur=6;
  ctx.beginPath(); ctx.ellipse(0,-2.5,2.4,3.4,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.arc(0,-4.2,1,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
