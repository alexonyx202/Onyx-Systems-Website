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
  /* Render a SMALL static preview (no inputs) into #el.
     Shape-only silhouette: shows the puzzle outline via filled vs blocked
     cells — no solution letters (unreadable on large grids). The thumbnail is
     a launch affordance; the full puzzle (with clues + letters) opens on click. */
  function renderThumb(el, titleEl){
    var p=current(); if(!p||!el)return;
    if(titleEl) titleEl.textContent=p.title||'Today’s Puzzle';
    var n=p.size, grid=p.grid;
    el.innerHTML=''; el.style.gridTemplateColumns='repeat('+n+',1fr)';
    el.style.gridTemplateRows='repeat('+n+',1fr)';
    for(var r=0;r<n;r++)for(var c=0;c<n;c++){
      var ch=grid[r][c];
      var cell=document.createElement('div');
      cell.className='xw-tcell'+(ch==='.'?' block':'');
      el.appendChild(cell);
    }
  }
  /* Render a FULL interactive puzzle into #grid, with #clues-across / #clues-down,
     and wire Check/Reveal/Clear buttons (#xwCheck/#xwReveal/#xwClear) + #xwMsg.
     The board renders the TRUE full size x size layout (block cells in their real
     positions) and auto-sizes so the puzzle + title + clues + controls always fit
     the viewport (no half-empty page, no overflow). The board container is a definite
     flex child, so cell sizing is read from its REAL measured box (no circular
     dependency). A readable floor (22px) is enforced; oversized grids (> ~44 cells)
     spill into a scrollable board instead of shrinking unreadably. */
  function renderFull(gridEl, acrossEl, downEl, msgEl, titleEl){
    var p=current(); if(!p||!gridEl)return;
    if(titleEl) titleEl.textContent=p.title||'Today’s Puzzle';
    /* meta line: size + clue counts */
    var meta=document.getElementById('xwMeta');
    if(meta) meta.textContent='· '+p.size+'×'+p.size+' · '+(p.clues.across.length)+(p.clues.across.length===1?' across':' across')+' / '+(p.clues.down.length)+(p.clues.down.length===1?' down':' down');
    var n=p.size, grid=p.grid, sol=[], cells=[], clues=p.clues||{across:[],down:[]}, numMap={}, state={dir:'across',active:null};
    for(var r=0;r<n;r++){ sol[r]=[]; cells[r]=[]; }
    var boardEl=gridEl.parentElement;   /* .xw-board (definite flex child) */

    /* --- cell sizing from the board's EXACT usable inner box ---
       Account for the board's own padding AND the grid's own padding + gaps, so
       the entire puzzle fits the frame with zero overflow. No hard readability
       floor that forces scroll on large grids — the cell simply shrinks to fit
       (with a low safety floor so it never vanishes). */
    function fitCell(){
      var bcs=getComputedStyle(boardEl);
      var bPadX=(parseInt(bcs.paddingLeft)||0)+(parseInt(bcs.paddingRight)||0);
      var bPadY=(parseInt(bcs.paddingTop)||0)+(parseInt(bcs.paddingBottom)||0);
      var gcs=getComputedStyle(gridEl);
      var gPadX=(parseInt(gcs.paddingLeft)||0)+(parseInt(gcs.paddingRight)||0);
      var gPadY=(parseInt(gcs.paddingTop)||0)+(parseInt(gcs.paddingBottom)||0);
      /* Adaptive gap (2026-08-28): a fixed 3px gap eats 111px of a 360px phone on a
         38×38 daily puzzle (daily sizes have grown 22→38 since 2026-08-19), flooring
         cells to ~5px — unreadable and failing the mobile crossword gate in
         verify_arcade.js. Scale the gap with the grid so big boards keep readable
         cells: 3px for small grids, 1px past ~30 cells. */
      var gap=(n>=30)?1:3;
      var availW=Math.max(60, boardEl.clientWidth  - bPadX - gPadX);
      var availH=Math.max(60, boardEl.clientHeight - bPadY - gPadY);
      var byW=Math.floor((availW - (n-1)*gap) / n);
      var byH=Math.floor((availH - (n-1)*gap) / n);
      var cell=Math.min(byW, byH);
      /* Never floor the cell for "readability": a floor forces the grid wider
         than the frame once it needs smaller cells, which causes overflow +
         the flex-center left clip. The cell simply shrinks to fit — the only
         hard rule is the 42px cap for small puzzles and a 1px safety guard. */
      cell=Math.max(1, Math.min(cell, 42));
      return cell;
    }
    var wordEls=[];
    function paint(){ /* hoisted below */ }
    function build(){
      var cell=fitCell();
      document.documentElement.style.setProperty('--xw-cell', cell+'px');
      gridEl.style.gridTemplateColumns='repeat('+n+','+cell+'px)';
      gridEl.style.gridTemplateRows='repeat('+n+','+cell+'px)';
      /* Reserve scrollbar gutter so a scrollbar never steals the measured box
         and re-trigger an overflow/refit loop. */
      boardEl.style.overflowY='scroll';
      gridEl.innerHTML=''; wordEls=[];
      var num=0;
      for(var r=0;r<n;r++)for(var c=0;c<n;c++){
        var ch=grid[r][c]; sol[r][c]=ch;
        var cellDiv=document.createElement('div'); cellDiv.className='xw-cell';
        if(ch==='.'){ cellDiv.classList.add('block'); gridEl.appendChild(cellDiv); cells[r][c]=null; continue; }
        var isAc=(c===0||grid[r][c-1]==='.')&&(c+1<n&&grid[r][c+1]!=='.');
        var isDn=(r===0||grid[r-1][c]==='.')&&(r+1<n&&grid[r+1][c]!=='.');
        if(isAc||isDn){ num++; var s=document.createElement('span'); s.className='xw-num'; s.textContent=num; cellDiv.appendChild(s); numMap[r+'-'+c]=num; }
        var inp=document.createElement('input'); inp.maxLength=1; inp.dataset.r=r; inp.dataset.c=c; inp.setAttribute('inputmode','text');
        inp.setAttribute('aria-label', (isAc?'across':'down')+' clue square');
        (function(inp,r,c){
          inp.addEventListener('focus',function(){ state.active={r:r,c:c}; state.dir=clueFor(r,c,'across')?'across':'down'; paint(); });
          inp.addEventListener('input',function(){ this.value=this.value.toUpperCase().replace(/[^A-Z]/g,''); step(1); updateRevealLock(); });
          inp.addEventListener('keydown',function(e){ onKey(e); });
        })(inp,r,c);
        cellDiv.appendChild(inp); gridEl.appendChild(cellDiv); cells[r][c]=inp;
      }
      renderClues();
      if(!state.active) state.active=first();
      paint();
    }
    function first(){ for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(cells[r][c])return{r:r,c:c}; return null; }
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
      for(var r=0;r<n;r++)for(var c=0;c<n;c++){ var e=cells[r][c]; if(e){ e.parentElement.classList.remove('word','active-cell'); } }
      if(!state.active)return;
      var ar=state.active.r, ac=state.active.c;
      var clue=clueFor(ar,ac,state.dir)||clueFor(ar,ac,state.dir==='across'?'down':'across');
      if(clue && clueFor(ar,ac,state.dir)!==clue){ state.dir = (clueFor(ar,ac,'across')? 'across':'down'); }
      else if(clue && clueFor(ar,ac,state.dir)===clue){ /* keep */ }
      else { /* fallback: whichever exists */ if(clueFor(ar,ac,'across'))state.dir='across'; else if(clueFor(ar,ac,'down'))state.dir='down'; }
      var r=ar,c=ac;
      while(r>0&&cells[r-1]&&cells[r-1][c]&&state.dir==='down') r--;
      while(c>0&&cells[r][c-1]&&state.dir==='across') c--;
      while(cells[r]&&cells[r][c]){
        var e=cells[r][c];
        if(e){ e.parentElement.classList.add('word');
          if(r===ar&&c===ac) e.parentElement.classList.add('active-cell'); }
        if(state.dir==='across'){ if(c+1>=n||!cells[r][c+1])break; c++; }
        else { if(r+1>=n||!cells[r+1][c])break; r++; }
      }
      /* current-clue bar */
      var cur=clueFor(ar,ac,state.dir)||clueFor(ar,ac,state.dir==='across'?'down':'across');
      var now=document.getElementById('xwNow');
      if(cur && now){
        var numEl=now.querySelector('.xw-now-num'), txtEl=now.querySelector('.xw-now-text');
        if(numEl) numEl.textContent=cur.num+' '+(state.dir==='across'?'Across':'Down');
        if(txtEl) txtEl.textContent=cur.clue;
      }
      if(clue){ var elc=document.getElementById('xwClue'+clue.num+'-'+state.dir); if(elc)elc.classList.add('active'); }
    }
    function renderClues(){
      acrossEl.innerHTML=''; downEl.innerHTML='';
      (clues.across||[]).forEach(function(cl){ var li=document.createElement('li'); li.className='xw-clue'; li.id='xwClue'+cl.num+'-across'; li.setAttribute('role','listitem'); li.innerHTML='<b>'+cl.num+'.</b> '+cl.clue; li.addEventListener('click',function(){ state.active={r:cl.row-1,c:cl.col-1}; setDir('across'); paint(); var e=cells[cl.row-1][cl.col-1]; if(e)e.focus(); }); acrossEl.appendChild(li); });
      (clues.down||[]).forEach(function(cl){ var li=document.createElement('li'); li.className='xw-clue'; li.id='xwClue'+cl.num+'-down'; li.setAttribute('role','listitem'); li.innerHTML='<b>'+cl.num+'.</b> '+cl.clue; li.addEventListener('click',function(){ state.active={r:cl.row-1,c:cl.col-1}; setDir('down'); paint(); var e=cells[cl.row-1][cl.col-1]; if(e)e.focus(); }); downEl.appendChild(li); });
    }
    /* ---- clue tabs (mobile switches visible list; desktop shows both) ---- */
    var tabs=document.querySelectorAll('.xw-tab');
    function selectTab(dir){
      tabs.forEach(function(t){ t.setAttribute('aria-selected', t.dataset.dir===dir?'true':'false'); });
      acrossEl.hidden=(dir!=='across');
      downEl.hidden=(dir!=='down');
    }
    tabs.forEach(function(t){ t.addEventListener('click',function(){ selectTab(t.dataset.dir); }); });

    var revealBtn=document.getElementById('xwReveal');
    function filledPct(){ var f=0,t=0; for(r=0;r<n;r++)for(c=0;c<n;c++){ var e=cells[r][c]; if(!e)continue; t++; if(e.value!=='')f++; } return t? f/t : 0; }
    function updateRevealLock(){ if(!revealBtn)return; var unlocked=filledPct()>=0.5; revealBtn.disabled=!unlocked; if(msgEl&&!unlocked&&revealBtn.dataset.shown!=='1'){ msgEl.textContent='Fill at least 50% of the squares to unlock Reveal.'; } }
    function allFilled(){ for(r=0;r<n;r++)for(c=0;c<n;c++){ var e=cells[r][c]; if(e&&e.value==='')return false; } return true; }
    if(document.getElementById('xwCheck')) document.getElementById('xwCheck').addEventListener('click',function(){
      var right=0,total=0;
      for(r=0;r<n;r++)for(c=0;c<n;c++){ var e=cells[r][c]; if(!e)continue; total++; var ok=e.value.toUpperCase()===sol[r][c].toUpperCase(); e.parentElement.classList.toggle('correct',ok&&e.value!==''); e.parentElement.classList.toggle('wrong',!ok&&e.value!==''); if(ok)right++; }
      if(msgEl){ if(total>0&&right===total&&allFilled()) msgEl.textContent='🎉 Solved! Nicely done.'; else msgEl.textContent=right+' of '+total+' squares correct — keep going!'; }
    });
    if(revealBtn) revealBtn.addEventListener('click',function(){ if(this.disabled)return; for(r=0;r<n;r++)for(c=0;c<n;c++){ var e=cells[r][c]; if(e){ e.value=sol[r][c]; e.parentElement.classList.remove('wrong'); e.parentElement.classList.add('correct'); } } this.dataset.shown='1'; if(msgEl) msgEl.textContent='Here’s the solution — come back tomorrow for a new one!'; });
    if(document.getElementById('xwClear')) document.getElementById('xwClear').addEventListener('click',function(){
      for(r=0;r<n;r++)for(c=0;c<n;c++){ var e=cells[r][c]; if(e){ e.value=''; e.parentElement.classList.remove('correct','wrong'); } }
      if(msgEl) msgEl.textContent='';
    });
    build();
    updateRevealLock();
    /* Refit on ANY real change to the board's size — window resize, orientation
       change, AND the responsive layout switch (mobile stacks the board to full
       width). A ResizeObserver catches the layout-timing cases a window 'resize'
       event misses, so cells never size against a stale/measured-too-early box. */
    var rzT=null;
    function scheduleBuild(){ if(rzT)clearTimeout(rzT); rzT=setTimeout(build, 100); }
    if(window.ResizeObserver){ try{ new ResizeObserver(scheduleBuild).observe(boardEl); }catch(e){} }
    window.addEventListener('resize', scheduleBuild);
    window.addEventListener('orientationchange', scheduleBuild);
    /* one more pass on the next frame, in case the first paint measured pre-layout */
    requestAnimationFrame(function(){ requestAnimationFrame(build); });
  }
  return { load:load, renderThumb:renderThumb, renderFull:renderFull, current:current,
    /* test hook: force a specific puzzle as 'current' (used by verification harness only) */
    _force:function(p){ forced=p; } };
})();
