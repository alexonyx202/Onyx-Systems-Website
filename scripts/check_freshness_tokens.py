#!/usr/bin/env python3
"""CI gate: every core page must carry a stamped onyx-build token and sw.js must
carry its versioned cache name. Exits non-zero if any is missing or malformed.

The page list and token patterns are imported from scripts/stamp_build.py (the
single source of truth), so this checker and the stamper can never drift apart.

Run: python3 scripts/check_freshness_tokens.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import stamp_build


def main():
    root = stamp_build.ROOT
    failures = []

    for rel in stamp_build.PAGES:
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            failures.append(f"{rel}: file missing")
            continue
        with open(path, encoding="utf-8") as f:
            s = f.read()
        if not stamp_build.META_RE.search(s):
            failures.append(f'{rel}: missing <meta name="onyx-build" content="YYYYMMDD">')

    sw_path = os.path.join(root, stamp_build.SW)
    if not os.path.exists(sw_path):
        failures.append(f"{stamp_build.SW}: file missing")
    else:
        with open(sw_path, encoding="utf-8") as f:
            s = f.read()
        if not stamp_build.CACHE_RE.search(s):
            failures.append(f"{stamp_build.SW}: missing CACHE = 'onyx-vYYYYMMDD'")

    if failures:
        print("Freshness token check FAILED:")
        for f in failures:
            print("  - " + f)
        return 1

    print(f"Freshness token check passed: {len(stamp_build.PAGES)} pages + {stamp_build.SW} all stamped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
