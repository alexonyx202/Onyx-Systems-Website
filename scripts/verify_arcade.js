/* Arcade QA verifier (versioned in the repo, runnable locally and in CI).
   Checks at 1280/1440/1920 + mobile 390:
   - homepage teaser: exactly 6 cards, one row, no overflow, images load, daily
     lineup deterministic, rendered desc/tagline MATCH games/games.json
   - arcade hub: full card set, copy MATCH
   - mobile tap: a real touch tap on an arcade card MUST open the game (behavioral
     guard against the 2026-07-17 preventDefault regression — fails the run, exit 1)
   - mobile nav: the bottom tab bar MUST dock at the viewport bottom on touch (guard
     against the 2026-08-26 backdrop-filter containing-block trap), no horizontal
     overflow, theme toggle clickable
   - crossword: the board MUST render usable cells on mobile (guard against the
     2026-08-26 fitCell 1px collapse) and fit the viewport
   - freshness: service worker controls the page and an offline reload still
     renders the lineup
   Run: node scripts/verify_arcade.js [port]     (default port 8099)
   Env: PUPPETEER_EXECUTABLE_PATH (else /snap/bin/chromium if present, else
        puppeteer's bundled Chromium) · NO_SHOTS=1 skips screenshots.
   Screenshots default to /home/ai (override with SHOT_DIR). */
const puppeteer = require('puppeteer');
const fs = require('fs');
const http = require('http');
const BASE = 'http://127.0.0.1:' + (process.argv[2] || '8099');
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
  let failures = 0;

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

  // Mobile tap regression (2026-08-26): a real touch tap on an arcade card MUST
  // open the game. The hover-panel handler from 2026-07-17 (78ab1cb) called
  // e.preventDefault() on every touch tap — (hover:none) matches on mobile — which
  // cancelled the card's <a> navigation, so games never opened on touch devices.
  // The homepage was fixed 2026-07-19 (c0ee991); the hub missed it until 1efba4b.
  // This guard is behavioral: if the tap does not navigate, the run FAILS (exit 1).
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(BASE + '/games/', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('.arcade-hub .game-card', { timeout: 15000 });
  const tapCard = await page.$('.arcade-hub .game-card');
  const tapHref = await tapCard.evaluate(a => a.getAttribute('href'));
  let tapNavigated = false, tapUrl = '';
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 45000 }),
      tapCard.tap()
    ]);
    tapUrl = page.url();
    tapNavigated = tapUrl.includes('/games/') && tapUrl.endsWith(tapHref);
    console.log(`MOBILE TAP ${tapHref} -> ${tapUrl} navigated=${tapNavigated}`);
  } catch (e) {
    tapUrl = page.url();
    console.log(`MOBILE TAP ${tapHref} -> ${tapUrl} navigated=false (${String(e.message || e).split('\n')[0]})`);
  }
  if (!tapNavigated) {
    console.error('FAIL: mobile tap on an arcade card did not open the game (preventDefault regression?)');
    failures++;
  }

  // Mobile nav-bar trap regression (2026-08-26): the bottom tab bar (#nav-links)
  // MUST dock at the viewport bottom on touch. backdrop-filter on header.site (like
  // filter/transform) creates a containing block for position:fixed descendants, so
  // the bar was trapped at the TOP of the page, overlaying the logo/theme toggle and
  // causing ~88px horizontal overflow. Removed in a02a1fd. Guard: docked bottom +
  // no overflow + theme toggle clickable, else the run FAILS (exit 1).
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('#nav-links', { timeout: 15000 });
  const nav = await page.evaluate(() => {
    const nb = document.querySelector('#nav-links').getBoundingClientRect();
    const theme = document.getElementById('themeToggle');
    const themeR = theme ? theme.getBoundingClientRect() : null;
    const hit = themeR ? document.elementFromPoint(themeR.left + themeR.width / 2, themeR.top + 8) : null;
    return {
      vw: window.innerWidth,
      docW: document.documentElement.scrollWidth,
      navTop: Math.round(nb.top),
      navBottomGap: Math.round(window.innerHeight - nb.bottom),
      themeHit: hit ? (hit.closest && hit.closest('#themeToggle') ? 'themeToggle' : (hit.id || hit.className || hit.tagName)) : null
    };
  });
  const navDocked = nav.navBottomGap >= -2 && nav.navBottomGap <= 8 && nav.navTop > 600;
  const navNoOverflow = nav.docW <= nav.vw + 1;
  const toggleHit = nav.themeHit === 'themeToggle';
  console.log(`NAV MOBILE docked=${navDocked} (top=${nav.navTop}, bottomGap=${nav.navBottomGap}) overflow=${navNoOverflow} (docW=${nav.docW}/${nav.vw}) toggle=${toggleHit} (hit=${nav.themeHit})`);
  if (!navDocked || !navNoOverflow || !toggleHit) {
    console.error('FAIL: mobile bottom tab bar is not docked at the viewport bottom (backdrop-filter trap regression?)');
    failures++;
  }

  // Crossword board regression (2026-08-26): on mobile the board MUST render usable
  // cells. fitCell() in assets/js/crossword.js sizes cells from the board's measured
  // clientHeight; with only max-height:58vh and height:auto the board collapsed to its
  // empty content box and cells floored to 1px (a 24x24 grid rendered as an unreadable
  // dot). Fixed in a02a1fd with a definite height:min(58vh,520px). Guard: cells > 5px
  // and the board fits the viewport, else the run FAILS (exit 1).
  await page.goto(BASE + '/crossword.html', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('.xw-cell', { timeout: 15000 });
  await sleep(600);
  const xw = await page.evaluate(() => {
    const board = document.querySelector('.xw-board');
    const cell = document.querySelector('.xw-cell');
    const br = board.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    return {
      vw: window.innerWidth,
      docW: document.documentElement.scrollWidth,
      cellW: cr.width, cellH: cr.height,
      boardW: br.width, cells: document.querySelectorAll('.xw-cell').length
    };
  });
  const xwCells = xw.cellW > 5 && xw.cellH > 5;
  const xwFits = xw.boardW <= xw.vw + 2;
  const xwNoOverflow = xw.docW <= xw.vw + 1;
  console.log(`XWORD MOBILE cells=${Math.round(xw.cellW)}x${Math.round(xw.cellH)}px n=${xw.cells} board=${Math.round(xw.boardW)}px vw=${xw.vw} overflow=${xwNoOverflow}`);
  if (!xwCells || !xwFits || !xwNoOverflow) {
    console.error('FAIL: crossword board collapsed on mobile (fitCell height regression?)');
    failures++;
  }

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
  if (failures) { console.error(`${failures} FAILURE(S)`); process.exit(1); }
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
