#!/usr/bin/env python3
"""Deploy gate: every core page must carry a stamped onyx-build token and sw.js
must carry its versioned cache name, AND they must match today's Eastern build
date. Exits non-zero if any token is missing, malformed, or stale (older than
today), or if the pages and sw.js disagree with each other.

Without the date check, a content push that forgets to re-stamp still passes —
leaving returning browsers on the previous day's service-worker cache (the
"site didn't update today" symptom). This gate closes that gap.

The page list and token patterns are imported from scripts/stamp_build.py (the
single source of truth), so this checker and the stamper can never drift apart.

Run: python3 scripts/check_freshness_tokens.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stamp_build


def _stamped_date(rel, text):
    """Return the date captured from rel's freshness token, or '' if absent."""
    if os.path.basename(rel) == stamp_build.SW:
        m = stamp_build.CACHE_STAMP_RE.search(text)
    else:
        m = stamp_build.META_STAMP_RE.search(text)
    return m.group(1) if m else ""


def main():
    root = stamp_build.ROOT
    expected = stamp_build.eastern_today()
    failures = []
    stamps = {}

    for rel in stamp_build.PAGES + [stamp_build.SW]:
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            failures.append(f"{rel}: file missing")
            continue
        with open(path, encoding="utf-8") as f:
            s = f.read()
        date = _stamped_date(rel, s)
        stamps[rel] = date
        if not date:
            kind = "sw cache key" if os.path.basename(rel) == stamp_build.SW else "onyx-build meta"
            failures.append(f'{rel}: missing {kind} token YYYYMMDD — run "python3 scripts/stamp_build.py"')
            continue
        if date != expected:
            failures.append(
                f"{rel}: stamped {date} != today's Eastern date {expected} — "
                f'run "python3 scripts/stamp_build.py" and commit'
            )

    # All present tokens must agree on the same build date, so one forgotten
    # restamp can't be masked by another file that already rolled forward.
    dates = {d for d in stamps.values() if d}
    if len(dates) > 1:
        failures.append(
            "stamp mismatch across files: %s — all pages + sw.js must share one build date"
            % ", ".join(sorted(dates))
        )

    if failures:
        print("Freshness/build-date check FAILED:")
        for f in failures:
            print("  - " + f)
        print('fix: python3 scripts/stamp_build.py && git add <pages> sw.js && git commit')
        return 1

    print(
        f"Freshness/build-date check passed: {len(stamp_build.PAGES)} pages + "
        f"{stamp_build.SW} all stamped with today's Eastern date {expected}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())