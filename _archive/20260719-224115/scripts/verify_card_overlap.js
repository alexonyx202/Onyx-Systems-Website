// scripts/verify_card_overlap.js
// Deterministic overlap check for arcade cabinet cards (v5 flex-column).
// Run from the website repo so puppeteer resolves:
//   cd /home/ai/onyx-systems-website && python3 -m http.server 8099 &
//   node scripts/verify_card_overlap.js [URL]
// Requires a server already serving the repo. Default URL below.
const puppeteer = require('puppeteer');
const url = process.argv[2] || 'http://localhost:8099/games/index.html';
(async () => {
  const browser = await puppeteer.launch({headless:'new', args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width:1280, height:900, deviceScaleFactor:1});
  await page.goto(url, {waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,600));
  const cards = await page.$$eval('.game-card', els => els.map(c => {
    const wrap = c.querySelector('.gcab-wrap');
    const foot = c.querySelector('.gfoot');
    const btn = foot ? foot.querySelector('.gbtn') : null;
    const wr = wrap.getBoundingClientRect();
    const fr = foot.getBoundingClientRect();
    return {
      noOverlap: fr.top >= wr.bottom - 1,
      imgBottom: Math.round(wr.bottom),
      footTop: Math.round(fr.top),
      playText: btn ? btn.textContent.trim() : null
    };
  }));
  await browser.close();
  const bad = cards.filter(c => !c.noOverlap || c.playText !== '▶ Play');
  console.log(JSON.stringify(cards, null, 2));
  if (!cards.length || bad.length) {
    console.error('FAIL: ' + (cards.length ? bad.length + ' card(s) overlap or missing Play' : 'no cards found'));
    process.exit(1);
  }
  console.log('PASS: ' + cards.length + ' cards, no overlap, Play present');
})();
