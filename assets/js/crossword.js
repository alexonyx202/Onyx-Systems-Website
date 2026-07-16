/* Crossword engine — shared by the homepage thumbnail and crossword.html.
   Vanilla JS, no deps. CC0. Renders from data/today_crossword.json
   (falling back to data/crosswords.json rotated by dayIndex()). */
var XW = (function(){
  var puzzles=null, todays=null, forced=null;
  function dayIndex(){ var d=new Date(); return Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(2020,0,1))/864e5); }
  function current(){
    if(forced && forced.grid) return forced;
    var t=new Date().toISOString().slice(0,10);
    if(todays && todays.grid && todays.date===t) return todays;
    if(puzzles && puzzles.length) return puzzles[dayIndex()%puzzles.length];
    return null;
  }
  function load(cb){
    Promise.all([
      fetch('data/crosswords.json',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){puzzles=d.puzzles;}).catch(function(){console.warn('crosswords load failed');}),
      fetch('data/today_crossword.json',{cache:'no-store'}).then(function(r){return r.json();}).then(function(t){todays=t;}).catch(function(){console.warn('today_crossword load failed');})
    ]).then(cb);
  }
  /* Render a SMALL static preview (no inputs) into #el. */
  function renderThumb(el, titleEl){
    var p=current(); if(!p||!el)return;
    if(titleEl) titleEl.textContent=p.title||'Today’s Puzzle';
    var n=p.size, grid=p.grid;
    el.innerHTML=''; el.style.gridTemplateColumns='repeat('+n+',1fr)';
    for(var r=0;r<n;r++)for(var c=0;c<n;c++){
      var ch=grid[r][c];
      var cell=document.createElement('div'); cell.className='xw-tcell'+(ch==='.'?' block':'');
      if(ch!=='.') cell.textContent=ch;
      el.appendChild(cell);
    }
  }
  /* Render a FULL interactive puzzle into #grid, with #clues-across / #clues-down,
     and wire Check/Reveal/Clear buttons (#xwCheck/#xwReveal/#xwClear) + #xwMsg.
     The board is auto-sized to the window: we compute the true bounding box of the
     non-block cells (puzzles are not square), trim empty margins, and pick a cell
     pixel size that fits both viewport width and a comfortable max height, recomputed
     on resize. Internal cell arrays stay full size×size so step()/paint()/sol behave. */
  function renderFull(gridEl, acrossEl, downEl, msgEl, titleEl){
    var p=current(); if(!p||!gridEl)return;
    if(titleEl) titleEl.textContent=p.title||'Today’s Puzzle';
    var n=p.size, grid=p.grid, sol=[], cells=[], clues=p.clues||{across:[],down:[]}, numMap={}, state={dir:'across',active:null};
    for(var r=0;r<n;r++){ sol[r]=[]; cells[r]=[]; }
    /* --- true bounding box of non-block cells --- */
    var minR=n,maxR=0,minC=n,maxC=0;
    for(r=0;r<n;r++)for(var c=0;c<n;c++){ if(grid[r][c]!=='.'){ if(r<minR)minR=r; if(r>maxR)maxR=r; if(c<minC)minC=c; if(c>maxC)maxC=c; } }
    if(maxR<minR){ minR=maxR=0; } if(maxC<minC){ minC=maxC=0; }
    var bbRows=maxR-minR+1, bbCols=maxC-minC+1;
    /* --- intelligent cell sizing --- */
    function fitCell(){
      var pad=36;                                   /* .wrap horizontal padding (18px each side) */
      var gap=3;                                    /* -- matches .xw-grid gap */
      var boardChrome=12+2;                          /* .board padding(18x2->trim) + border approx */
      var availW=Math.min(window.innerWidth, 1080) - pad - boardChrome;
      var availH=window.innerHeight - 360;          /* leave room for header/clues/controls */
      if(availH<200) availH=200;
      var byW=Math.floor((availW - (bbCols-1)*gap) / bbCols);
      var byH=Math.floor((availH - (bbRows-1)*gap) / bbRows);
      var cell=Math.min(byW, byH);
      cell=Math.max(24, Math.min(cell, 44));        /* tappable but not huge */
      return cell;
    }
    function paint(){ /* hoisted below */ }
    var ctx={}; /* shared between render + resize */
    function build(){
      var cell=fitCell();
      document.documentElement.style.setProperty('--xw-cell', cell+'px');
      gridEl.style.gridTemplateColumns='repeat('+bbCols+','+cell+'px)';
      gridEl.style.gridTemplateRows='repeat('+bbRows+','+cell+'px)';
      gridEl.innerHTML='';
      var num=0;
      for(r=0;r<n;r++)for(c=0;c<n;c++){
        var ch=grid[r][c]; sol[r][c]=ch;
        if(ch==='.'){ cells[r][c]=null; continue; }
        /* only render cells inside the bounding box (trim empty margins) */
        if(r<minR||r>maxR||c<minC||c>maxC){ cells[r][c]=null; continue; }
        var cellDiv=document.createElement('div'); cellDiv.className='xw-cell';
        var isAc=(c===0||grid[r][c-1]==='.')&&(c+1<n&&grid[r][c+1]!=='.');
        var isDn=(r===0||grid[r-1][c]==='.')&&(r+1<n&&grid[r+1][c]!=='.');
        if(isAc||isDn){ num++; var s=document.createElement('span'); s.className='xw-num'; s.textContent=num; cellDiv.appendChild(s); numMap[r+'-'+c]=num; }
        var inp=document.createElement('input'); inp.maxLength=1; inp.dataset.r=r; inp.dataset.c=c; inp.setAttribute('inputmode','text');
        (function(inp,r,c){
          inp.addEventListener('focus',function(){ state.active={r:r,c:c}; state.dir='across'; paint(); });
          inp.addEventListener('input',function(){ this.value=this.value.toUpperCase().replace(/[^A-Z]/g,''); step(1); updateRevealLock(); });
          inp.addEventListener('keydown',function(e){ onKey(e); });
        })(inp,r,c);
        cellDiv.appendChild(inp); gridEl.appendChild(cellDiv); cells[r][c]=inp;
      }
      renderClues();
      if(!state.active) state.active=first();
      paint();
    }
    function first(){ for(r=0;r<n;r++)for(c=0;c<n;c++)if(cells[r][c])return{r:r,c:c}; return null; }
    function setDir(d){ state.dir=d; }
    function step(d){
      if(!state.active)return; var r=state.active.r,c=state.active.c;
      if(state.dir==='across'){ c+=d; while(c>=0&&c<n&&cells[r][c]){ state.active={r:r,c:c}; var e=cells[r][c]; if(e){e.focus();return;} } }
      else { r+=d; while(r>=0&&r<n&&cells[r][c]){ state.active={r:r,c:c}; var e=cells[r][c]; if(e){e.focus();return;} } }
    }
    function onKey(e){
      if(e.key==='ArrowRight'||e.key==='ArrowDown'){ e.preventDefault(); setDir(e.key==='ArrowRight'?'across':'down'); step(1); }
      else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){ e.preventDefault(); setDir(e.key==='ArrowLeft'?'across':'down'); step(-1); }
      else if(e.key==='Backspace'){ e.preventDefault(); if(state.active&&cells[state.active.r][state.active.c])cells[state.active.r][state.active.c].value=''; step(-1); }
      else if(e.key===' '){ e.preventDefault(); setDir(state.dir==='across'?'down':'across'); paint(); }
    }
    function clueFor(r,c,dir){ var L=clues[dir]||[]; for(var i=0;i<L.length;i++) if(L[i].row===r+1&&L[i].col===c+1) return L[i]; return null; }
    function paint(){
      for(r=0;r<n;r++)for(c=0;c<n;c++){ var e=cells[r][c]; if(e){ e.classList.remove('active-cell'); e.style.outline=''; } }
      if(!state.active)return;
      var ar=state.active.r, ac=state.active.c;
      var clue=clueFor(ar,ac,state.dir)||clueFor(ar,ac,state.dir==='across'?'down':'across');
      var r=ar,c=ac;
      while(r>0&&cells[r-1]&&cells[r-1][c]&&state.dir==='down') r--;
      while(c>0&&cells[r][c-1]&&state.dir==='across') c--;
      while(cells[r][c]){ var e=cells[r][c]; if(e){ e.classList.add('active-cell'); e.style.outline=(r===ar&&c===ac)?'2px solid #E8B06A':'2px solid rgba(194,112,61,.35)'; e.style.outlineOffset='-2px'; } if(state.dir==='across'){ if(c+1>=n||!cells[r][c+1])break; c++; } else { if(r+1>=n||!cells[r+1][c])break; r++; } }
      if(clue){ var elc=document.getElementById('xwClue'+clue.num+'-'+state.dir); if(elc)elc.classList.add('active'); }
    }
    function renderClues(){
      acrossEl.innerHTML=''; downEl.innerHTML='';
      (clues.across||[]).forEach(function(cl){ var li=document.createElement('li'); li.className='xw-clue'; li.id='xwClue'+cl.num+'-across'; li.innerHTML='<b>'+cl.num+'.</b> '+cl.clue; li.addEventListener('click',function(){ state.active={r:cl.row-1,c:cl.col-1}; setDir('across'); paint(); var e=cells[cl.row-1][cl.col-1]; if(e)e.focus(); }); acrossEl.appendChild(li); });
      (clues.down||[]).forEach(function(cl){ var li=document.createElement('li'); li.className='xw-clue'; li.id='xwClue'+cl.num+'-down'; li.innerHTML='<b>'+cl.num+'.</b> '+cl.clue; li.addEventListener('click',function(){ state.active={r:cl.row-1,c:cl.col-1}; setDir('down'); paint(); var e=cells[cl.row-1][cl.col-1]; if(e)e.focus(); }); downEl.appendChild(li); });
    }
    var revealBtn=document.getElementById('xwReveal');
    function filledPct(){ var f=0,t=0; for(r=0;r<n;r++)for(c=0;c<n;c++){ var e=cells[r][c]; if(!e)continue; t++; if(e.value!=='')f++; } return t? f/t : 0; }
    function updateRevealLock(){ if(!revealBtn)return; var unlocked=filledPct()>=0.5; revealBtn.disabled=!unlocked; revealBtn.classList.toggle('locked',!unlocked); if(msgEl&&!unlocked&&revealBtn.dataset.shown!=='1'){ msgEl.textContent='Fill at least 50% of the squares to unlock Reveal.'; } }
    function allFilled(){ for(r=0;r<n;r++)for(c=0;c<n;c++){ var e=cells[r][c]; if(e&&e.value==='')return false; } return true; }
    if(document.getElementById('xwCheck')) document.getElementById('xwCheck').addEventListener('click',function(){
      var right=0,total=0;
      for(r=0;r<n;r++)for(c=0;c<n;c++){ var e=cells[r][c]; if(!e)continue; total++; var ok=e.value.toUpperCase()===sol[r][c].toUpperCase(); e.classList.toggle('correct',ok&&e.value!==''); e.classList.toggle('wrong',!ok&&e.value!==''); if(ok)right++; }
      if(msgEl){ if(total>0&&right===total&&allFilled()) msgEl.textContent='🎉 Solved! Nicely done.'; else msgEl.textContent=right+' of '+total+' squares correct — keep going!'; }
    });
    if(revealBtn) revealBtn.addEventListener('click',function(){ if(this.disabled)return; for(r=0;r<n;r++)for(c=0;c<n;c++){ var e=cells[r][c]; if(e){ e.value=sol[r][c]; e.classList.remove('wrong'); e.classList.add('correct'); } } this.dataset.shown='1'; if(msgEl) msgEl.textContent='Here’s the solution — come back tomorrow for a new one!'; });
    if(document.getElementById('xwClear')) document.getElementById('xwClear').addEventListener('click',function(){
      for(r=0;r<n;r++)for(c=0;c<n;c++){ var e=cells[r][c]; if(e){ e.value=''; e.classList.remove('correct','wrong'); } }
      if(msgEl) msgEl.textContent='';
    });
    build();
    updateRevealLock();
    /* recompute sizing on resize/orientation (debounced) — keeps board dynamic but sane */
    var rzT=null;
    function onResize(){ if(rzT)clearTimeout(rzT); rzT=setTimeout(build, 120); }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }
  return { load:load, renderThumb:renderThumb, renderFull:renderFull, current:current,
    /* test hook: force a specific puzzle as 'current' (used by verification harness only) */
    _force:function(p){ forced=p; } };
})();
