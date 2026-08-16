#!/usr/bin/env python3
"""Regenerate the inline game MANIFESTs from games/games.json (single source of truth).

Both pages carry an inline fallback copy of the arcade manifest so they render
instantly and never break offline:
  - games/index.html   (the arcade hub page)
  - index.html         (the homepage's ARCADE DAILY LINEUP)

The arcade release rule demands games.json + every inline MANIFEST stay
identical. Run this after ANY change to games/games.json (add/edit/remove a
game or its copy), then commit:

    python3 scripts/regenerate_manifest.py

It replaces each `var MANIFEST=[...];` block atomically (temp file + rename),
reports per-file status, and auto-runs the Node verification harness
(scripts/verify_daily_arcade.js) at the end. Exit 0 = everything in sync.

SKILL NOTE: do NOT hand-edit the inline MANIFEST lines — always regenerate.
Never use regex-substitution over the JSON itself; the block is replaced as a
single sliced unit so escape sequences can never break the page.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMES_JSON = os.path.join(ROOT, "games", "games.json")
TARGETS = [
    os.path.join(ROOT, "games", "index.html"),
    os.path.join(ROOT, "index.html"),
]
MARKER = "var MANIFEST="


def load_manifest():
    with open(GAMES_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    games = data.get("games")
    if not isinstance(games, list) or not games:
        raise SystemExit("FATAL: games/games.json has no non-empty 'games' array")
    # Compact single-line JSON matching the existing inline style (no spaces,
    # literal UTF-8 so em dashes stay readable in the source).
    return json.dumps(games, ensure_ascii=False, separators=(",", ":"))


def regenerate(path, manifest):
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    start = html.find(MARKER)
    if start < 0:
        raise SystemExit(f"FATAL: {path}: no '{MARKER}' block found")
    end = html.find("];", start)
    if end < 0:
        raise SystemExit(f"FATAL: {path}: no '];' terminator after '{MARKER}'")
    end += 2
    old_block = html[start:end]
    new_block = MARKER + manifest + ";"
    if old_block == new_block:
        return False
    new_html = html[:start] + new_block + html[end:]
    if new_html.count(MARKER) != 1:
        raise SystemExit(f"FATAL: {path}: regeneration produced {new_html.count(MARKER)} MANIFEST blocks")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(new_html)
    os.replace(tmp, path)  # atomic swap — a crash can never leave a half-written block
    return True


def main():
    manifest = load_manifest()
    changed = False
    for p in TARGETS:
        rel = os.path.relpath(p, ROOT)
        if regenerate(p, manifest):
            changed = True
            print(f"UPDATED  {rel}  (manifest {len(manifest)} chars)")
        else:
            print(f"SYNC     {rel}  (already identical)")
    if not changed:
        print("no changes — all manifests already identical to games/games.json")

    verify = os.path.join(ROOT, "scripts", "verify_daily_arcade.js")
    if os.path.exists(verify):
        try:
            subprocess.run(["node", verify], cwd=ROOT, check=True)
        except FileNotFoundError:
            print("note: 'node' not found — run `node scripts/verify_daily_arcade.js` manually")
        except subprocess.CalledProcessError:
            print("FATAL: verification failed — manifests are NOT in sync, do not commit")
            return 1
    else:
        print("note: scripts/verify_daily_arcade.js missing — run it from a full checkout")
    return 0


if __name__ == "__main__":
    sys.exit(main())
