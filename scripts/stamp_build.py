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
Exit 0 on success, 1 on any error. Typical deploy flow:

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
    with open(path, "r", encoding="utf-8") as f:
        s = f.read()
    orig = s
    if os.path.basename(path) == SW:
        s, n = CACHE_RE.subn(r"\g<1>" + date + r"\g<2>", s)
        if n == 0:
            raise SystemExit("FATAL: %s: no 'CACHE = \\'onyx-vYYYYMMDD\\'' token found" % path)
    else:
        s, n = META_RE.subn(r"\g<1>" + date + r"\g<2>", s)
        if n == 0:
            raise SystemExit("FATAL: %s: no <meta name=\"onyx-build\" content=\"YYYYMMDD\"> token found" % path)
    if s == orig:
        return False
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(s)
    os.replace(tmp, path)
    return True


def main():
    ap = argparse.ArgumentParser(description="Stamp the Eastern build date into freshness tokens.")
    ap.add_argument("--date", help="explicit YYYYMMDD (default: today in America/New_York)")
    args = ap.parse_args()

    date = args.date or eastern_today()
    if not DATE_RE.match(date):
        raise SystemExit("FATAL: --date must be YYYYMMDD, got %r" % date)

    targets = PAGES + [SW]
    changed = False
    for rel in targets:
        path = os.path.join(ROOT, rel)
        if stamp_file(path, date):
            changed = True
            print("UPDATED  %s  -> onyx-v%s" % (rel, date))
        else:
            print("SYNC     %s  (already stamped %s)" % (rel, date))

    if not changed:
        print("no changes — every freshness token already %s" % date)
    else:
        print("stamped %s — remember to commit & push (GitHub Pages deploys automatically)" % date)
    return 0


if __name__ == "__main__":
    sys.exit(main())
