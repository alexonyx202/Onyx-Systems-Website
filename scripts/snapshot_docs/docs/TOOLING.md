# Tooling, CI & Deploy

## `scripts/` — site tooling

| Script | Purpose |
|---|---|
| `stamp_build.py` | Writes the freshness tokens: `onyx-build` meta (`YYYYMMDD`) into the 5 core pages + the `onyx-vYYYYMMDD` cache name into `sw.js`. Idempotent — reports "no changes" when already stamped. |
| `regenerate_manifest.py` | Regenerates the homepage/arcade inline fallback game manifests from `games/games.json`. CI requires zero diff after running it. |
| `check_games_links.js` | Verifies every game in `games.json` has an on-disk page and that its assets resolve. |
| `check_freshness_tokens.py` | Fails if any core page lacks the `onyx-build` meta or `sw.js` lacks the cache name. |
| `verify_arcade.js` | **The browser QA verifier** — headless-Chromium pass over the whole arcade at desktop + mobile with behavioral interaction guards (see QA.md). |
| `verify_daily_arcade.js` | Daily-lineup harness: sync + determinism + Eastern-midnight flip for the "game of the day". |
| `verify_card_overlap.js` | Deterministic overlap check for arcade cabinet cards (v5 flex-column layout). |
| `verify_arcade_8111.js` | Older verifier variant (superseded by `verify_arcade.js`). |
| `publish_today.py` | Deterministic daily website publish (the mechanical half of the 08:45 publish run). |
| `daily_fun.py`, `make_daily_fun.py`, `joke_daily.py` | Daily widget generation (word/joke/trivia/quiz/poll data). |
| `gen_crossword.py`, `rotate_crosswords.py`, `xw_words.py`, `xw_fillers.txt` | Crossword generation, daily rotation, word lists. |
| `build_newsletter_html.py` | Builds `newsletter.html` from the feed. |
| `audit-cdp.py` | CDP-based audit helper. |
| `snapshot_site.py` | **Vault snapshot tool** — recreates/refreshes the dated `Site Snapshots/<date> Corrected Site/` folder in the vault and regenerates the docs index, README facts and `FILE-INVENTORY.txt` in one command. Evergreen docs live under `scripts/snapshot_docs/` and are refreshed into every snapshot. See the script's docstring for usage. |
| `deploy.sh` | One-command deploy ritual: regenerate manifest → stamp → verify → push. |

## Root-level scripts

| Script | Purpose |
|---|---|
| `update_feed.py` | Update `data/feed.json` from the S2 output file (`--date` arg). |
| `update_news.py` | Append an approved News/Updates entry to `data/news.json` (daily newsletter cron, after John approves). |
| `verify_feed_complete.py` | **Completeness gate** for the feed; runs after the website-team cron regenerates `data/feed.json`. (Has the daily pipeline's uncommitted edit in this snapshot.) |
| `grade_site.py` | Deterministic pre-push DOM grader (redesign 2026-07-14). |
| `verify_xw.js` | Real headless-Chromium verification for the crossword fit — measures actual pixel rects (catches clipped-left and real scaling issues). |

## CI — `.github/workflows/verify.yml`

Gates **every push to main** (Pages deploys from main):

1. **Static gates** (`verify` job, ubuntu-latest):
   - Manifests must be regenerable without changes (`regenerate_manifest.py` + `git diff --exit-code` on `games/index.html index.html`)
   - Daily-lineup harness passes (`verify_daily_arcade.js`)
   - Game links + assets resolve (`check_games_links.js`)
   - Freshness tokens present (`check_freshness_tokens.py`)
2. **Browser pass** (`e2e` job):
   - Serves the site (`python3 -m http.server 8099`) and runs
     `node scripts/verify_arcade.js` with bundled Puppeteer Chromium.
     This executes the mobile-tap/nav/crossword/gallery/news guards.

Also manual-runnable via `workflow_dispatch`. `update-poll-count.yml` runs
the scheduled poll-count refresh.

## Deploy runbook (as used 2026-08-26)

1. Make + verify the change locally (red/green where applicable).
2. `python3 scripts/stamp_build.py` — refresh tokens (no-op if the day's
   stamp already exists; same-day re-deploys are fine because the SW is
   network-first for HTML).
3. Stage the intended files, commit (`fix:`/`ci:`/`daily:` messages),
   push to `main`.
4. GitHub Pages auto-deploys (~30–60 s); CI re-runs the static + browser
   gates on the push.
5. Verify live: content markers (or stamp when it changes), then a
   real-browser check at the relevant viewport (e.g., 390×844 touch).

## Repo hygiene notes

- `.gitignore` groups **unpublished games** ("never deploy") — they stay
  in the repo but never ship.
- The daily pipeline commits data refreshes as `daily:` commits; its
  in-flight edits can appear uncommitted in the working tree — leave them
  alone.
- `_archive/` holds historical snapshots; it is not deployed and is
  excluded from this documentation snapshot.
