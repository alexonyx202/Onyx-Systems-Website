// Real headless-Chromium verification for the Onyx crossword fit.
// Measures ACTUAL pixel rects (no fabricated booleans). Catches clipped-left
// and real scroll. Usage: node verify_xw.js [width] [height] [forceSize]
const { spawn, execSync } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const PORT = 9222;
const URL = 'http://localhost:8099/crossword.html';
const CHROME = process.env.CHROME_BIN || '/snap/bin/chromium';

function getJSON(path){return new Promise((res,rej)=>{http.get('http://localhost:'+PORT+path,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function waitChrome(){
  for(let i=0;i<40;i++){ try{ await getJSON('/json/version'); return; }catch(e){ await sleep(300); } }
  throw new Error('chrome never came up');
}

async function main(){
  const width = parseInt(process.argv[2]||'1280',10);
  const height = parseInt(process.argv[3]||'800',10);
  const forceSize = process.argv[4]?parseInt(process.argv[4],10):null;

  const ver = await getJSON('/json/version');
  const targets = await getJSON('/json');
  let page = targets.find(t=>t.type==='page');
  if(!page){
    // open a new tab via /json/new
    page = await getJSON('/json/new?'+encodeURIComponent(URL));
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id=0; const pending={};
  function send(method,params={}){ return new Promise((res,rej)=>{ const i=++id; pending[i]={res,rej}; ws.send(JSON.stringify({id:i,method,params})); }); }
  ws.on('message',m=>{ const o=JSON.parse(m); if(o.id&&pending[o.id]){ if(o.error)pending[o.id].rej(new Error(o.error.message)); else pending[o.id].res(o.result); delete pending[o.id]; } });
  await new Promise(r=>ws.on('open',r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Runtime.consoleEventsEnabled',{enabled:true}).catch(()=>{});
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});

  await send('Page.navigate',{url:URL});
  await sleep(1500); // load + XW.load (fetch) + build + rAF settle

  const consoleMsgs=[];
  ws.on('message',m=>{ try{ const o=JSON.parse(m); if(o.method==='Runtime.consoleAPICalled'){ consoleMsgs.push((o.params.args||[]).map(a=>a.value||a.description||'').join(' ')); } }catch(e){} });

  let result;
  if(forceSize){
    // force a specific-size puzzle and re-render, then measure after settle
    const data = await send('Runtime.evaluate',{expression:`(async()=>{const d=await (await fetch('data/crosswords.json')).json();const big=d.puzzles.find(p=>p.size===${forceSize});XW._force(big);XW.renderFull(document.getElementById('xwGrid'),document.getElementById('xwAcross'),document.getElementById('xwDown'),document.getElementById('xwMsg'),document.getElementById('xwTitle'));return XW.current().size;})()`,awaitPromise:true,returnByValue:true});
    await sleep(1200);
  }

  const measure = `(()=>{
    const board=document.getElementById('xwBoard');
    const grid=document.getElementById('xwGrid');
    if(!grid) return {error:'no grid el'};
    const cellCount=grid.children.length;
    const cs=getComputedStyle(board);
    const brect=board.getBoundingClientRect();
    const grect=grid.getBoundingClientRect();
    const csGrid=getComputedStyle(grid);
    const borderL=parseInt(cs.borderLeftWidth)||0, borderT=parseInt(cs.borderTopWidth)||0;
    const padL=parseInt(cs.paddingLeft)||0, padT=parseInt(cs.paddingTop)||0;
    const padR=parseInt(cs.paddingRight)||0, padB=parseInt(cs.paddingBottom)||0;
    const contentLeft=brect.left+borderL+padL;
    const contentTop=brect.top+borderT+padT;
    const contentRight=brect.right-borderL-padR;
    const contentBottom=brect.bottom-borderT-padB;
    const boardOverflowX = board.scrollWidth - board.clientWidth;
    const boardOverflowY = board.scrollHeight - board.clientHeight;
    const pageOverflowX = document.documentElement.scrollWidth - window.innerWidth;
    const pageOverflowY = document.documentElement.scrollHeight - window.innerHeight;
    return {
      cellVar: document.documentElement.style.getPropertyValue('--xw-cell'),
      gridTemplateCols: csGrid.gridTemplateColumns.split(' ').length,
      cellCount,
      gridLeft: Math.round(grect.left*10)/10, gridTop: Math.round(grect.top*10)/10,
      gridRight: Math.round(grect.right*10)/10, gridBottom: Math.round(grect.bottom*10)/10,
      contentLeft: Math.round(contentLeft*10)/10, contentTop: Math.round(contentTop*10)/10,
      contentRight: Math.round(contentRight*10)/10, contentBottom: Math.round(contentBottom*10)/10,
      // clipped if grid extends past the board's content box in any direction
      clippedLeft: Math.round((contentLeft-grect.left)*10)/10,   // >0 => left edge of grid is LEFT of content box => clipped
      clippedRight: Math.round((grect.right-contentRight)*10)/10,// >0 => right edge past content box
      clippedTop: Math.round((contentTop-grect.top)*10)/10,
      clippedBottom: Math.round((grect.bottom-contentBottom)*10)/10,
      boardOverflowX: Math.round(boardOverflowX*10)/10, boardOverflowY: Math.round(boardOverflowY*10)/10,
      pageOverflowX: Math.round(pageOverflowX*10)/10, pageOverflowY: Math.round(pageOverflowY*10)/10,
      anyScroll: (boardOverflowX>0.5||boardOverflowY>0.5||pageOverflowX>0.5||pageOverflowY>0.5),
      fitOK: (grect.left>=contentLeft-0.5 && grect.top>=contentTop-0.5 && grect.right<=contentRight+0.5 && grect.bottom<=contentBottom+0.5)
    };
  })()`;

  const out = await send('Runtime.evaluate',{expression:measure,returnByValue:true});
  const r = out.result.value;
  r.viewport = width+'x'+height + (forceSize?(' forcedSize='+forceSize):'');
  r.consoleErrors = consoleMsgs.filter(m=>/error/i.test(m));
  const shot = '/tmp/xw_shot_'+(forceSize?('sz'+forceSize+'_'):'')+width+'x'+height+'.png';
  const {data} = await send('Page.captureScreenshot',{format:'png', captureBeyondViewport:false});
  require('fs').writeFileSync(shot, Buffer.from(data,'base64'));
  r.screenshot = shot;
  const txt = JSON.stringify(r,null,2);
  await new Promise(res=>process.stdout.write(txt+'\n',res));
  require('fs').writeFileSync('/tmp/xw_measure.json', txt+'\n');
  ws.close();
  await sleep(300);
}

// ensure chrome running
(async()=>{
  let running=false;
  try{ await getJSON('/json/version'); running=true; }catch(e){ running=false; }
  let child;
  if(!running){
    child = spawn(CHROME, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port='+PORT,'--user-data-dir=/tmp/xw_cdp'], {stdio:'ignore'});
    await waitChrome();
  }
  try{ await main(); }
  finally{
    if(child) child.kill();
    // process.exit(0);  // avoid race with stdout flush
  }
})().catch(e=>{ require('fs').writeFileSync('/tmp/xw_err.txt', String(e&&e.stack||e)); console.error('ERR', e.message); process.exit(1); });
