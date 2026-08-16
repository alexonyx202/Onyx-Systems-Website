/* Headless verification for the homepage's ARCADE DAILY LINEUP.
   Asserts:
   1. The inline MANIFEST in index.html parses and matches games/games.json
      per-game (the arcade release rule — identical data everywhere).
   2. The pure arcade-core (date seed, mulberry32 RNG, Fisher-Yates, pick-6)
      extracted from index.html is deterministic per Eastern (America/New_York)
      date, returns 6 unique games from the full pool, rotates across consecutive
      days, and flips exactly at Eastern midnight (not UTC midnight).

   Run: node scripts/verify_daily_arcade.js   (exit 0 PASS / 1 FAIL)
   The core block in index.html sits between the markers "arcade-core-start" and
   "arcade-core-end" and contains only pure functions, so it evals cleanly under Node. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const json = JSON.parse(fs.readFileSync(path.join(root, 'games', 'games.json'), 'utf8'));

let fails = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : ''));
  if (!ok) fails++;
}

/* ---- 1. inline MANIFEST parses + matches games.json ---- */
const m = home.match(/var MANIFEST=(\[[\s\S]*?\]);/);
check('inline MANIFEST found in index.html', !!m);
let manifest = [];
if (m) {
  try { manifest = JSON.parse(m[1]); }
  catch (e) { check('inline MANIFEST parses as JSON', false, e.message); }
}
check('inline MANIFEST parses as JSON', manifest.length > 0, manifest.length + ' games');

const key = g => JSON.stringify({ file: g.file, title: g.title, tagline: g.tagline, desc: g.desc, thumb: g.thumb, cabinet: g.cabinet });
const fromJson = json.games.map(key).sort().join('\n');
const fromManifest = manifest.map(key).sort().join('\n');
check('inline MANIFEST identical to games/games.json', fromJson === fromManifest, fromJson === fromManifest ? '' : '(fields differ — keep them identical per the arcade release rule)');

/* ---- 2. pure core evals + daily pick behaves ---- */
const core = home.match(/\/\*arcade-core-start\*\/([\s\S]*?)\/\*arcade-core-end\*\//);
check('arcade-core block found', !!core);
if (core) {
  try { eval(core[1]); } catch (e) { check('arcade-core evals under Node', false, e.message); }
}
check('arcade-core evals under Node', typeof arcadePick === 'function');

if (typeof arcadePick === 'function' && manifest.length) {
  // 30 consecutive Eastern dates starting 2026-08-01. Probes are at NOON UTC
  // (08:00 EDT / 07:00 EST), so the Eastern calendar date is unambiguous
  // regardless of DST and always equals the printed date.
  const dates = [];
  for (let i = 0; i < 30; i++) dates.push(new Date(Date.UTC(2026, 7, 1 + i, 12)));
  const picks = dates.map(d => arcadePick(manifest, d));

  const same = JSON.stringify(arcadePick(manifest, dates[0])) === JSON.stringify(arcadePick(manifest, dates[0]));
  check('daily pick is deterministic for a given Eastern date', same);

  // The rotation must flip at EASTERN midnight, not UTC: 03:59 UTC on 2026-08-16
  // is 23:59 EDT on Aug 15, and 04:01 UTC is 00:01 EDT on Aug 16 — different seeds.
  const before = arcadeSeed(new Date(Date.UTC(2026, 7, 16, 3, 59)));
  const after = arcadeSeed(new Date(Date.UTC(2026, 7, 16, 4, 1)));
  check('seed flips at Eastern midnight (23:59 ET vs 00:01 ET)', before === 20260815 && after === 20260816, before + ' -> ' + after);

  const okPick = picks.every(p =>
    Array.isArray(p) && p.length === 6 &&
    new Set(p.map(g => g.file)).size === 6 &&
    p.every(g => manifest.some(x => x.file === g.file)));
  check('every pick = 6 unique games from the full pool', okPick, manifest.length + ' in pool');

  let rotates = true;
  for (let i = 1; i < picks.length; i++) {
    if (picks[i].map(g => g.file).join(',') === picks[i - 1].map(g => g.file).join(',')) rotates = false;
  }
  check('lineup changes across 30 consecutive days', rotates);

  const seen = new Set();
  picks.forEach(p => p.forEach(g => seen.add(g.file)));
  check('full collection surfaces over the month', seen.size === manifest.length, seen.size + '/' + manifest.length + ' games seen');

  console.log('\nsample lineups (Eastern date -> 6 files):');
  [0, 1, 2, 10].forEach(i => {
    const d = dates[i];
    console.log('  ' + d.toISOString().slice(0, 10) + '  ' + picks[i].map(g => g.file).join(', '));
  });
}

process.exit(fails ? 1 : 0);
