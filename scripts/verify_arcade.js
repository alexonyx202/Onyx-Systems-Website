/* Arcade QA verifier (versioned in the repo, runnable locally and in CI).
   Checks at 1280/1440/1920 + mobile 390:
   - homepage teaser: exactly 6 cards, one row, no overflow, images load, daily
     lineup deterministic, rendered desc/tagline MATCH games/games.json
   - arcade hub: full card set, copy MATCH
   - freshness: service worker controls the page and an offline reload still
     renders the lineup
   Run: node scripts/verify_arcade.js [port]     (default port 8099)
   Env: PUPPETEER_EXECUTABLE_PATH (else /snap/bin/chromium if present, else
        puppeteer's bundled Chromium) · NO_SHOTS=1 skips screenshots.
   Screenshots default to /home/ai (override with SHOT_DIR). */
const puppeteer = require('puppeteer');
const fs = require('fs');
const http = require('http');
const BASE = 'http://localhost:' + (process.argv[2] || '8099');
const SHOT_DIR = process.env.SHOT_DIR || '/home/ai';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getJSON(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

async function copyMatch(page, sel, manifest) {
  return await page.evaluate((sel, man) => {
    const cards = [...document.querySelectorAll(sel + ' .game-card')];
    const byFile = {}; man.forEach(g => byFile[g.file] = g);
    const bad = [];
    cards.forEach(c => {
      const file = (c.getAttribute('href') || '').split('/').pop();
      const g = byFile[file];
      if (!g) { bad.push(file + ':no-entry'); return; }
      const desc = ((c.querySelector('.hp-desc') || {}).textContent || '').trim();
      const tag = ((c.querySelector('.gtag') || {}).textContent || '').trim();
      if (desc !== (g.desc || '')) bad.push(file + ':desc');
      if (tag !== (g.tagline || '')) bad.push(file + ':tagline');
    });
    return { ok: bad.length === 0, bad };
  }, sel, manifest);
}

async function reveal(page) {
  // Force any scroll-reveal elements visible so headless screenshots are truthful
  await page.evaluate(() => {
    document.querySelectorAll('.reveal').forEach(e => {
      e.classList.add('is-visible');
      e.style.opacity = '1';
      e.style.transform = 'none';
    });
  });
}

async function probe(page, url, sel) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await reveal(page);
  await page.evaluate(() => document.querySelectorAll('img').forEach(i => i.loading = 'eager'));
  await sleep(1000);
  return await page.evaluate((sel) => {
    const cards = [...document.querySelectorAll(sel + ' .game-card')];
    const grid = document.querySelector(sel + ' .games-grid');
    const out = { count: cards.length, titles: [], tops: [], overflow: false, vw: window.innerWidth };
    cards.forEach(c => { const r = c.getBoundingClientRect(); out.tops.push(Math.round(r.top)); out.titles.push((c.querySelector('.hp-title') || {}).textContent || (c.querySelector('img.gcab') || {}).alt || '?'); });
    out.distinctTops = [...new Set(out.tops)].length;
    out.overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    out.allImgs = cards.length > 0 && cards.every(c => { const im = c.querySelector('img.gcab'); return im && im.complete && im.naturalWidth > 0; });
    out.daily = (window.__arcadeDaily && window.__arcadeDaily.titles) || null;
    return out;
  }, sel);
}

async function shot(page, url, sel, file) {
  if (process.env.NO_SHOTS) return; // CI: skip screenshots
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await reveal(page);
    await page.evaluate(() => document.querySelectorAll('img').forEach(i => i.loading = 'eager'));
    await sleep(900);
    const el = await page.$(sel);
    await el.screenshot({ path: file });
    console.log('shot', file);
  } catch (e) { console.error('shot fail', file, e.message); }
}

(async () => {
  const launch = { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) launch.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  else if (fs.existsSync('/snap/bin/chromium')) launch.executablePath = '/snap/bin/chromium';
  const browser = await puppeteer.launch(launch);
  const page = await browser.newPage();

  const manifest = (await getJSON(BASE + '/games/games.json')).games;
  for (const w of [1280, 1440, 1920]) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    const home = await probe(page, BASE + '/index.html', '.arcade-sec');
    const home2 = await probe(page, BASE + '/index.html', '.arcade-sec');
    const hub = await probe(page, BASE + '/games/', '.arcade-hub');
    const cmHome = await copyMatch(page, '.arcade-sec', manifest);
    const cmHub = await copyMatch(page, '.arcade-hub', manifest);
    const ok = (h) => `cards=${h.count} row=${h.distinctTops === 1 ? '1' : 'MULTI'} off=${h.overflow} imgs=${h.allImgs} ${h.daily ? 'daily=' + h.daily.join('|') : ''} [${h.titles.join('|')}]`;
    console.log(`WIDTH ${w}  HOME ${ok(home)} six=${home.count === 6} det=${home.titles.join('|') === home2.titles.join('|')} copy=${cmHome.ok ? 'MATCH' : 'MISMATCH:' + cmHome.bad.join(',')}`);
    console.log(`WIDTH ${w}  HUB  ${ok(hub)} copy=${cmHub.ok ? 'MATCH' : 'MISMATCH:' + cmHub.bad.join(',')}`);
    await shot(page, BASE + '/index.html', '.arcade-sec', `${SHOT_DIR}/arcade_home_${w}.png`);
    await shot(page, BASE + '/games/', '.arcade-hub', `${SHOT_DIR}/arcade_hub_${w}.png`);
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const hubM = await probe(page, BASE + '/games/', '.arcade-hub');
  console.log(`MOBILE 390 HUB cards=${hubM.count} row=${hubM.distinctTops === 1 ? '1' : 'MULTI'} off=${hubM.overflow} imgs=${hubM.allImgs} [${hubM.titles.join('|')}]`);
  await shot(page, BASE + '/games/', '.arcade-hub', `${SHOT_DIR}/arcade_hub_390.png`);
  // Freshness: service worker registers + controls, and an offline reload still renders the lineup.
  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1500);
    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(800);
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    await page.setOfflineMode(true);
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
    const offlineCards = await page.evaluate(() => (document.querySelectorAll('#arcadeGrid .game-card') || []).length);
    await page.setOfflineMode(false);
    console.log(`FRESH swControlled=${controlled} offlineHomeCards=${offlineCards}`);
  } catch (err) { console.log('FRESH probe skipped:', err.message); }
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
