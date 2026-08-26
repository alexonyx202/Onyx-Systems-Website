# Onyx Systems — Corrected Website Snapshot

A complete, self-contained local copy of the **corrected** onyxpc.us
website, kept in the Obsidian vault. This directory is a point-in-time
mirror — it does **not** update itself; the live repo is the source of
truth at `../OnyxSystems-Website/` (the git working tree), and the live
site deploys from it to **https://onyxpc.us** via GitHub Pages.

## Snapshot facts

The block below is **auto-updated** every time
`scripts/snapshot_site.py` runs (one command keeps this copy current):

<!-- SNAPSHOT-FACTS-BEGIN -->
- **Captured**: (auto)
<!-- SNAPSHOT-FACTS-END -->

## What this snapshot contains

- **The full site**: all pages, styles, scripts, game engines, images,
  data, manifests, service worker, and the QA/deploy tooling.
- **Full documentation**: see `docs/` for the site map, architecture,
  page/game inventories, tooling + CI reference, QA methodology, and the
  changelog(s) for each correction day.
- **A file inventory**: `FILE-INVENTORY.txt` (regenerated listing).
- **A generated index**: `docs/INDEX.md` (regenerated listing of pages,
  games, data and docs).

## How to refresh (one command, from the repo)

```bash
python3 scripts/snapshot_site.py            # snapshot/refresh for today
python3 scripts/snapshot_site.py --date YYYY-MM-DD
python3 scripts/snapshot_site.py --dry-run  # preview without writing
```

The script rsyncs the repo working tree into
`Site Snapshots/<date> Corrected Site/` (excluding `.git`, `_archive`,
`.freebuff`, `__pycache__`), seeds new dated folders from the most recent
snapshot (preserving changelog history), refreshes the evergreen docs from
`scripts/snapshot_docs/`, and regenerates the README facts, `docs/INDEX.md`
and `FILE-INVENTORY.txt`. Per the vault's add-only convention, add a dated
note in `Reference/` after a significant snapshot.

**Automatic**: `python3 scripts/snapshot_site.py --install-hook` installs a
pre-push hook (shim at `.git/hooks/pre-push` → `scripts/hooks/pre-push`)
that, on every push to `main`, runs the **local deploy gates** (freshness
tokens, manifest parity, game links, daily-lineup harness, browser QA
verifier — blocking on failure) and then refreshes this snapshot — this
folder was produced that way.

## Where everything lives (quick map)

| Path | What it is |
|---|---|
| `index.html` | Homepage (single file: nav, hero, arcade, news, FAQ, gallery, daily widgets, reviews, weather, contact) |
| `games/index.html` | Arcade hub — 19 game cards from `games/games.json` |
| `games/*.html` | 22 game pages (19 registered + 3 local-only) |
| `games/games.json` | Game registry (cards' copy, thumbnails, cabinets) |
| `crossword.html` | Daily crossword |
| `gallery.html` | Photo gallery + lightbox |
| `newsletter.html` | Generated newsletter |
| `sw.js` | Service worker (network-first HTML/JSON, SWR assets, versioned cache) |
| `assets/` | Shared site assets (css, js, img) |
| `games/assets/<game>/` | Per-game css/js engines |
| `data/*.json` | Daily content (crosswords, words, trivia, jokes, quiz, polls, news, events, feed) |
| `scripts/` | Build, stamp, verify, daily-publish, snapshot tooling |
| `.github/workflows/` | CI: `verify.yml` (gates every push) + `update-poll-count.yml` |

## Documentation index (`docs/`)

- **INDEX.md** — generated index (pages, games, data, docs) for this snapshot
- **ARCHITECTURE.md** — stack, conventions, freshness tokens, service worker, data layer
- **PAGES.md** — every core page, its sections, and mobile behaviors
- **GAMES.md** — the game registry, all 19 games, local-only titles, touch-control patterns
- **TOOLING.md** — every script, the CI workflow, and the deploy runbook
- **QA.md** — the browser verifier, all mobile regression guards, red/green methodology
- **CHANGELOG-*.md** — dated records of the corrections in this snapshot

The Obsidian vault keeps the canonical change log and audit trail in
`Reference/` (dated, add-only notes) — e.g. `Mobile Touch Audit
2026-08-26.md`, `Website Snapshot & Documentation 2026-08-26.md`.
