#!/usr/bin/env bash
# ===== Onyx Arcade deploy ritual (one command) =====
# Chains the release pipeline and pushes to GitHub Pages:
#   1. python3 scripts/regenerate_manifest.py   # manifests from games.json (arcade + homepage)
#   2. python3 scripts/stamp_build.py           # Eastern build tokens (onyx-build metas + sw.js cache)
#   3. node scripts/verify_daily_arcade.js      # daily-lineup gate
#      node scripts/check_games_links.js         # game links/assets gate
#   4. node scripts/verify_arcade.js            # browser QA (local server + headless Chromium)
#   5. stage the arcade pipeline files, commit, push
#
# Usage:
#   scripts/deploy.sh            # run pipeline, review, prompt to commit & push
#   scripts/deploy.sh -y         # skip the prompt (stage known files, commit, push)
#   scripts/deploy.sh --all      # ALSO stage any other changed/untracked files
#   scripts/deploy.sh -m "msg"   # custom commit message
#   scripts/deploy.sh --no-push  # run pipeline + commit only (no push)
#   scripts/deploy.sh --dry-run  # run steps 1-3 + preview only (never stages/commits)
#   scripts/deploy.sh --skip-qa  # skip the browser QA step (CI still runs it on push)
#   scripts/deploy.sh --date YYYYMMDD  # explicit build date (passed to stamp_build)
#
# Safe by default: aborts if the verify gate fails, if nothing is staged, or if
# the user declines the push prompt. Files outside the arcade pipeline set are
# reported but NOT staged unless --all is given.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

YES=0; ALL=0; NOPUSH=0; DRYRUN=0; SKIP_QA=0; MSG=""; DATE_ARG=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes)      YES=1; shift ;;
    --all)         ALL=1; shift ;;
    --no-push)     NOPUSH=1; shift ;;
    --dry-run)     DRYRUN=1; shift ;;
    --skip-qa)     SKIP_QA=1; shift ;;
    -m|--message)  MSG="$2"; shift 2 ;;
    --date)        DATE_ARG=(--date "$2"); shift 2 ;;
    *) echo "deploy.sh: unknown option: $1" >&2; exit 2 ;;
  esac
done

echo "==> 1/5  regenerate inline MANIFESTs from games/games.json"
python3 scripts/regenerate_manifest.py

echo "==> 2/5  stamp Eastern build tokens"
python3 scripts/stamp_build.py "${DATE_ARG[@]+"${DATE_ARG[@]}"}"

echo "==> 3/5  verify gates (abort on failure)"
node scripts/verify_daily_arcade.js
node scripts/check_games_links.js

echo "==> 4/5  browser QA (local server + headless Chromium)"
if [[ "$DRYRUN" -eq 1 || "$SKIP_QA" -eq 1 ]]; then
  echo "      skipped ($([[ "$DRYRUN" -eq 1 ]] && echo dry-run || echo --skip-qa); CI still runs it on push)"
else
  if ! node -e "require('puppeteer')" 2>/dev/null; then
    echo "      puppeteer not installed locally — skipping (CI covers this on push)"
  else
    PORT=8099
    for p in 8099 8111 8123 8137 8141 8167; do
      if ! (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null; then PORT=$p; break; fi
    done
    python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/onyx_qa_server.log 2>&1 &
    QA_PID=$!
    trap 'kill "$QA_PID" 2>/dev/null' EXIT
    sleep 1.5
    if ! node scripts/verify_arcade.js "$PORT"; then
      echo "BROWSER QA FAILED — fix before deploying (CI would reject this too)." >&2
      exit 1
    fi
    kill "$QA_PID" 2>/dev/null
    trap - EXIT
  fi
fi

echo "==> 5/5  stage, commit, push"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "WARNING: on branch '$BRANCH' — GitHub Pages deploys from 'main'."
fi

if [[ -z "$MSG" ]]; then
  DATE="$(python3 -c 'import sys;sys.path.insert(0,"scripts");import stamp_build;print(stamp_build.eastern_today())')"
  MSG="arcade: deploy $DATE (regenerate manifests + stamp build tokens)"
fi

echo
git status --short
echo
echo "commit message: $MSG"

if [[ "$DRYRUN" -eq 1 ]]; then
  echo "dry run — nothing staged, committed, or pushed."
  exit 0
fi

KNOWN=(
  games/games.json
  games/index.html
  index.html
  newsletter.html
  gallery.html
  crossword.html
  sw.js
  scripts/regenerate_manifest.py
  scripts/stamp_build.py
  scripts/verify_daily_arcade.js
  scripts/check_games_links.js
  scripts/verify_arcade.js
  scripts/verify_arcade_8111.js
  scripts/deploy.sh
  .github/workflows/verify.yml
)
git add "${KNOWN[@]}"

# Anything outside the pipeline set (unstaged tracked + untracked)?
{
  git diff --name-only
  git ls-files --others --exclude-standard
} | sort -u > /tmp/deploy_leftovers.$$
if [[ -s /tmp/deploy_leftovers.$$ ]]; then
  echo "NOTE — files NOT staged (outside the arcade pipeline):"
  sed 's/^/        /' /tmp/deploy_leftovers.$$
  if [[ "$ALL" -eq 1 ]]; then
    echo "        (--all: staging everything.)"
    git add -A
  else
    echo "        They will NOT be committed. Re-run with --all to include them."
  fi
fi
rm -f /tmp/deploy_leftovers.$$

git diff --cached --stat

if git diff --cached --quiet; then
  echo "Nothing staged — all up to date. Nothing to commit."
  exit 0
fi

if [[ "$NOPUSH" -eq 1 ]]; then
  git commit -m "$MSG"
  echo "Committed (push skipped via --no-push)."
  exit 0
fi

if [[ "$YES" -ne 1 ]]; then
  read -r -p "Commit & push to origin? [y/N] " ans
  if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
    echo "Aborted — no commit made."
    exit 0
  fi
fi

git commit -m "$MSG"
git push origin HEAD
echo "Deployed. GitHub Pages rebuilds in ~30s — re-verify live after."
