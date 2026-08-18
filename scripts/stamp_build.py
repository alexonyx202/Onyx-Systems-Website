#!/usr/bin/env python3
"""Stamp today's Eastern (America/New_York) build date into the site's freshness tokens.

GitHub Pages exposes no cache headers, so freshness is content-level:
- every core page carries  <meta name="onyx-build" content="YYYYMMDD">
- sw.js carries the versioned cache name  CACHE = 'onyx-vYYYYMMDD'

Run this on deploy AFTER content changes so that:
- a >2-day-old cached page self-heals via the ?cb= cache-buster (see the
  freshness script in the pages), and
- the service worker's asset cache rolls over on its next activation.

    python3 scripts/stamp_build.py                  # stamps today (America/New_York)
    python3 scripts/stamp_build.py --date 20260816  # explicit date (testing/CI)

Idempotent (reports SYNC when already stamped) and atomic per file (tmp + rename).
A file that has no token is SKIPPED with a warning instead of aborting the run, so
one stale page can't block the rest of the deploy. Exit 0 on success (including
skips); exit 1 only on a hard error such as a malformed --date or an unreadable
file. Typical deploy flow:

    python3 scripts/regenerate_manifest.py   # manifests from games.json
    python3 scripts/stamp_build.py           # build tokens + sw.js cache
    node scripts/verify_daily_arcade.js      # sanity gate
    git add ... && git commit && git push
"""
import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = [
    "index.html",
    os.path.join("games", "index.html"),
    "newsletter.html",
    "gallery.html",
    "crossword.html",
]
SW = "sw.js"

META_RE = re.compile(r'(<meta name="onyx-build" content=")\d{8}(")')
CACHE_RE = re.compile(r"(CACHE = 'onyx-v)\d{8}(')")
DATE_RE = re.compile(r"^\d{8}$")


def eastern_today():
    """Today's calendar date in America/New_York as YYYYMMDD (zoneinfo, TZ, UTC fallback)."""
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        dt = datetime.now(ZoneInfo("America/New_York"))
        return "%04d%02d%02d" % (dt.year, dt.month, dt.day)
    except Exception:
        try:
            import time
            os.environ["TZ"] = "America/New_York"
            time.tzset()
            lt = time.localtime()
            return "%04d%02d%02d" % (lt.tm_year, lt.tm_mon, lt.tm_mday)
        except Exception:
            from datetime import datetime, timezone
            dt = datetime.now(timezone.utc)
            return "%04d%02d%02d" % (dt.year, dt.month, dt.day)


def stamp_file(path, date):
    """Stamp `date` into the file's freshness token.

    Returns 'updated' (rewritten), 'sync' (already stamped), or 'missing'
    (no token present — the caller skips it rather than failing the deploy).
    """
    with open(path, "r", encoding="utf-8") as f:
        s = f.read()
    orig = s
    if os.path.basename(path) == SW:
        s, n = CACHE_RE.subn(r"\g<1>" + date + r"\g<2>", s)
    else:
        s, n = META_RE.subn(r"\g<1>" + date + r"\g<2>", s)
    if n == 0:
        return "missing"
    if s == orig:
        return "sync"
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(s)
    os.replace(tmp, path)
    return "updated"


def main():
    ap = argparse.ArgumentParser(description="Stamp the Eastern build date into freshness tokens.")
    ap.add_argument("--date", help="explicit YYYYMMDD (default: today in America/New_York)")
    args = ap.parse_args()

    date = args.date or eastern_today()
    if not DATE_RE.match(date):
        raise SystemExit("FATAL: --date must be YYYYMMDD, got %r" % date)

    targets = PAGES + [SW]
    changed = False
    skipped = []
    for rel in targets:
        path = os.path.join(ROOT, rel)
        status = stamp_file(path, date)
        if status == "updated":
            changed = True
            print("UPDATED  %s  -> onyx-v%s" % (rel, date))
        elif status == "sync":
            print("SYNC     %s  (already stamped %s)" % (rel, date))
        else:
            skipped.append(rel)
            print("SKIP     %s  (no freshness token — leaving as-is)" % rel, file=sys.stderr)

    if skipped:
        print("warning: skipped %d file(s) with no token: %s"
              % (len(skipped), ", ".join(skipped)), file=sys.stderr)

    if changed:
        print("stamped %s — remember to commit & push (GitHub Pages deploys automatically)" % date)
    elif skipped:
        print("no changes — %d file(s) skipped (no token present)" % len(skipped))
    else:
        print("no changes — every freshness token already %s" % date)
    return 0


if __name__ == "__main__":
    sys.exit(main())
