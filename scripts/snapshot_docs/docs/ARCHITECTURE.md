# Architecture

## Stack

- **Pure static site** — hand-written HTML + CSS + vanilla JavaScript.
  No framework, no build step, no package dependencies at runtime.
- **Hosting**: GitHub Pages from the `main` branch root, bound to the
  custom domain **https://onyxpc.us** via the `CNAME` file (this file
  exists at the repo root; GitHub Pages uses it to serve the apex domain).
- **Pages are single-file**: each page carries its own inline CSS/JS,
  with shared code split under `assets/` and per-game engines under
  `games/assets/<game>/`.

## Top-level layout

```
index.html             homepage (nav, hero, arcade, news, FAQ, gallery,
                       daily widgets, reviews, weather, contact)
crossword.html         daily crossword
gallery.html           photo gallery + lightbox
newsletter.html        generated newsletter
sw.js                  service worker
manifest.webmanifest   PWA manifest
sitemap.xml, robots.txt, favicon.ico, og-image.png
CNAME                  onyxpc.us custom domain binding
assets/                shared css / js / img (site-wide)
games/                 arcade hub (index.html), 22 game pages, games.json,
                       games/assets/<game>/, games/css, games/js
data/                  daily content JSON (crosswords, words, trivia,
                       jokes, quiz, polls, news, events, feed)
scripts/               generation, stamp, verification, deploy tooling
.github/workflows/     verify.yml (CI gates), update-poll-count.yml
_archive/              historical site snapshots (NOT part of the site —
                       excluded from this snapshot copy)
```

## Key conventions

### Freshness tokens (the "stamp")

Every core page carries a build stamp as a meta tag, and the service worker
carries a matching cache version:

- Pages: `<meta name="onyx-build" content="YYYYMMDD">`
  (`index.html`, `games/index.html`, `newsletter.html`, `gallery.html`,
  `crossword.html`)
- SW cache name: `CACHE = 'onyx-vYYYYMMDD'` in `sw.js`

Both are written by `scripts/stamp_build.py`. The CI gate
`scripts/check_freshness_tokens.py` (and the verify workflow's static gate)
fails a push if any token is missing or stale. **Same-day re-deploys are
fine**: the service worker is network-first for HTML, so fresh pages reach
online visitors immediately even with an unchanged stamp; the versioned
cache name exists to force a full cache rollover when a stamp bump is
intended (e.g., a new deploy day).

### Game registry + manifests

- `games/games.json` is the **single source of truth** for the arcade:
  each entry has `file`, `title`, `tagline`, `desc`, `thumb`, `cabinet`.
- The arcade hub (`games/index.html`) renders its 19 cards from it.
- The homepage embeds a **fallback manifest** of game entries (used when
  `games.json` can't be fetched); `scripts/regenerate_manifest.py`
  regenerates it from `games.json`, and CI requires a zero-diff after
  regeneration — a game added to `games.json` but not the inline manifest
  fails the push.

### Service worker (`sw.js`)

Three-tier strategy (documented in the file's header):

1. **HTML navigations → network-first** — always fresh online; cached copy
   serves offline.
2. **JSON/data (`games.json` + others) → network-first** — daily content
   never goes stale.
3. **Static assets (images/css/js/fonts/media) → stale-while-revalidate** —
   instant loads, newest version fetched in the background for next visit.

On `activate`, every old cache version is purged, so a bumped `CACHE`
name equals a forced refresh. This is the layer that self-heals repeat
visitors after a deploy.

## Data layer (daily content)

`data/*.json` holds the daily-generated content — crosswords and puzzle
state, word of the day, trivia, jokes, quiz, poll (with `poll_counts.json`
updated by a scheduled workflow), news/tips, events, and the news feed.
These are regenerated every morning by the daily pipeline
(`scripts/publish_today.py` + `scripts/daily_fun.py` + friends) and
committed as `daily:` commits. `verify_feed_complete.py` is the
completeness gate that runs after the regeneration cron.

## Mobile-first layout notes

- The site is responsive, tuned at 390×844 (phone), 1280/1440/1920
  (desktop), plus intermediate widths.
- The homepage header (`header.site`) has a hamburger (`#nav-toggle`)
  for the desktop nav and the **bottom tab bar** (`#nav-links`, which
  contains the `.nav-phone` tabs) on touch devices. No `backdrop-filter`
  on `header.site` — it trapped the fixed tab bar (see CHANGELOG).
- Theme toggle (`#themeToggle`) switches light/dark.
- All interactive widgets (FAQ accordion, news toggle, gallery lightbox,
  crossword cells, game cards) are **tap-reachable** — the QA verifier
  enforces this (see QA.md).

## The snapshot vs. the live site

The deployed site == repo `main` == the working tree (everything in this
snapshot) *except*: (1) `data/*.json` and `verify_feed_complete.py` here
reflect the latest uncommitted daily refresh, which the pipeline commits
on its next run; (2) the live site is what Pages last deployed. A parity
scan on 2026-08-26 confirmed the live site matches the repo for everything
deployed (see CHANGELOG).
