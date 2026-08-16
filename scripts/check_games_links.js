/* Game link/asset check: every entry in games/games.json must resolve to a real
   file on disk — the game HTML itself plus its cabinet/thumbnail assets — so a
   stale filename can never ship to the arcade again (the drone-hunt.html vs
   drone-hunt-v4.html 404 on 2026-08-09). Also guards the homepage + hub, which
   render from the same manifest.
   Run: node scripts/check_games_links.js   (exit 0 PASS / 1 FAIL) */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'games', 'games.json'), 'utf8'));

let fails = 0;
function miss(title, key, val) {
  console.log('MISSING  ' + title + ': ' + key + ' -> ' + val);
  fails++;
}

for (const g of data.games) {
  const html = path.join(root, 'games', g.file);
  if (!fs.existsSync(html)) miss(g.title, 'file', g.file);
  else if (fs.statSync(html).size === 0) { console.log('EMPTY    ' + g.title + ': ' + g.file); fails++; }
  for (const key of ['thumb', 'cabinet']) {
    if (!g[key]) continue;
    // Manifest values are site-root-relative: "assets/cabinet-x.webp" lives at
    // games/assets/cabinet-x.webp from the repo root.
    const p = path.join(root, 'games', 'assets', path.basename(g[key]));
    if (!fs.existsSync(p)) miss(g.title, key, g[key]);
  }
}

if (fails) {
  console.log(fails + ' problem(s) — fix before deploying');
  process.exit(1);
}
console.log('OK — all ' + data.games.length + ' games resolve (HTML + assets)');
