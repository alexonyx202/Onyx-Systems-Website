# Games (the arcade)

## Registry — `games/games.json`

The single source of truth for the arcade. Each entry:

```json
{ "file": "wargames-v3.html",
  "title": "WarGames: Missile Defense",
  "tagline": "…",
  "desc": "…",
  "thumb": "assets/wargames-thumbnail.webp",
  "cabinet": "assets/cabinet-wargames.webp" }
```

The hub (`games/index.html`) renders cards from it; the homepage embeds a
regenerated fallback manifest (kept in sync by
`scripts/regenerate_manifest.py`, enforced by CI).

## The 19 registered (deployed) games

| file | title |
|---|---|
| wargames-v3.html | WarGames: Missile Defense |
| disk-defrag.html | Disk Defrag |
| drone-hunt-v4.html | Drone Hunt |
| computer-chaos-v7.html | Computer Chaos |
| skydrift.html | SKYDRIFT |
| bit-byte.html | BIT-BYTE |
| bug-swarm.html | BUG SWARM |
| data-break.html | DATA BREAK |
| neon-pilot.html | NEON PILOT |
| technobonk.html | TECHNOBONK |
| stack-overflow.html | STACK OVERFLOW |
| cyber-dash.html | CYBER DASH |
| neon-breaker.html | NEON BREAKER |
| byte-bird.html | BYTE BIRD |
| glitch-bug.html | GLITCH BUG |
| data-router.html | DATA ROUTER |
| port-mapper.html | PORT MAPPER |
| barrel-fishing.html | BARREL FISHING |
| rally-z.html | RALLY Z |

## Local-only games (gitignored — "unpublished games, never deploy")

`games/algo-chaser.html`, `games/de-flock.html`, `games/signal-noise.html`
are covered by the `.gitignore` rule "unpublished games — never deploy"
and are **not** in `games.json`; they are unreachable from the site.
`games/whack-a-troll.html` was untracked/gitignored and was **deleted
2026-08-26** (its vault note marked it LOCAL-only; its canonical dev copy
lives outside the site repo).

## Per-game structure

Games with split engines keep them under `games/assets/<game>/`:
`games/assets/port-mapper/css/style.css` + `js/ui.js` etc. Shared game
styles/scripts live under `games/css` / `games/js`. Each game registers
assets in the hub's link check (`scripts/check_games_links.js`).

## Touch controls (the audit's focus)

Most games are keyboard/mouse-first with a touch layer:

- **port-mapper** uses a 2×2 on-screen touch pad: `#touch-pad` is a 0×0
  anchor (`position:absolute; bottom: 94px; pointer-events:none`) with four
  `.tbtn` buttons positioned around it via `--tx/--ty` transforms
  (`pointer-events:auto`). Each button is individually tappable.
  **Fix 2026-08-26**: the anchor was `bottom: 26px`, which put the bottom
  row (hop down-left/down-right) centers 20px below a 844px-tall phone
  viewport — only a 12px sliver was tappable. Raised to `bottom: 94px`
  (78px cluster + 16px margin); verified with real touches at 390×844.
- **bug-swarm** has `.tbtn` touch controls (`#tc-left`, `#tc-right`,
  `#tc-fire`) plus a screen system (`#screen-title` etc.) that covers the
  HUD until START — by design.
- **cyber-dash** HUD buttons (`#muteBtn` etc.) sit under the main-menu
  overlay until START — by design.
- Game overlays/screens generally hide inactive screens with
  `opacity:0; pointer-events:none` (technobonk) or `display:none`
  (port-mapper `.screen.active`), so stacked DOM elements never block taps
  on the active screen.

## Known-good QA state (2026-08-26)

All 19 registered games pass the link check; the browser verifier passes
desktop 1280/1440/1920 + mobile 390×844 with 0 console errors. The full
touch audit (traps, collapsed elements, hover-only reveals,
click-blocking overlays, out-of-viewport interactive elements) found **no
remaining issues** after the 2026-08-26 fixes (see QA.md + CHANGELOG).
