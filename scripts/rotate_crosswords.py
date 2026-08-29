#!/usr/bin/env python3
"""Daily crossword rotation for onyxpc.us — FAST version.

Updates data/crosswords.json with a rolling window of puzzles from the
validated bank (/home/ai/Documents/Obsidian Vault/Games/Crosswords/).
No generation, no timeouts — just copies curated puzzles into the site's
fallback pool. The daily_fun.py script handles today_crossword.json with
its own no-repeat cursor; this just keeps the fallback pool fresh & sized.
"""
import argparse, json, os, sys, glob, datetime, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
BANK_DIR = "/home/ai/Documents/Obsidian Vault/Games/Crosswords"
BANK_TECH_DIRS = ["tech", "computer", "technology"]
WINDOW = 30
BANK_FILE = os.path.join(REPO, "data", "crosswords.json")


def _bank_valid(p):
    """Mirror the converter's validate(): every clue reads back, no orphans."""
    raw = p.get("grid")
    if not isinstance(raw, list) or not raw:
        return False
    try:
        rows = ["".join(row) if isinstance(row, list) else str(row) for row in raw]
    except Exception:
        return False
    n = p.get("size") or len(rows)
    if n != len(rows):
        return False
    width = min(len(r) for r in rows)
    if width != max(len(r) for r in rows):
        return False
    grid = rows
    for dirn in ("across", "down"):
        for cl in p.get("clues", {}).get(dirn, []):
            if not all(k in cl for k in ("num", "row", "col", "len", "answer", "clue")):
                return False
            r, c = cl["row"] - 1, cl["col"] - 1
            if r < 0 or c < 0 or r >= n or c >= width:
                return False
            try:
                got = "".join(grid[r][c + i] if dirn == "across" else grid[r + i][c]
                              for i in range(cl["len"]))
            except Exception:
                return False
            if got != cl["answer"]:
                return False
    return True


def _load_bank_puzzles():
    """Load and validate bank puzzles, compact-size first.

    2026-08-28: daily puzzle grids grew to 38×38, flooring mobile cells to ~5px
    (see the adaptive-gap note in assets/js/crossword.js). The daily rotation now
    prefers COMPACT puzzles (size <= 30) so the fallback pool stays phone-readable.
    """
    cand_dirs = []
    for d in BANK_TECH_DIRS:
        pp = os.path.join(BANK_DIR, d)
        if os.path.isdir(pp):
            cand_dirs.append(pp)
    if not cand_dirs:
        cand_dirs = [os.path.join(BANK_DIR, d) for d in sorted(os.listdir(BANK_DIR))
                     if os.path.isdir(os.path.join(BANK_DIR, d))]
    puzzles = []
    for d in cand_dirs:
        for fp in sorted(glob.glob(os.path.join(d, "*.json"))):
            if os.path.basename(fp) in ("index.json", "Crosswords.md"):
                continue
            try:
                pz = json.load(open(fp))
            except Exception:
                continue
            if not _bank_valid(pz):
                continue
            if len(pz.get("clues", {}).get("across", [])) < 2:
                continue
            puzzles.append(pz)
    # stable de-dup by slug/title+size
    seen, out = set(), []
    for pz in puzzles:
        key = (pz.get("slug") or pz.get("title"), pz.get("size"))
        if key in seen:
            continue
        seen.add(key)
        out.append(pz)
    # 2026-08-28: prefer COMPACT puzzles (size <= 30) so the rotation stays
    # phone-readable. Only if the compact pool is short of the window do we
    # backfill with larger puzzles (ascending size).
    compact = [pz for pz in out if (pz.get("size") or 0) <= 30]
    larger = sorted(
        (pz for pz in out if (pz.get("size") or 0) > 30),
        key=lambda pz: pz.get("size") or 0,
    )
    ordered = compact + larger
    out[:] = ordered
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", type=int, default=WINDOW)
    args = ap.parse_args()

    bank = json.load(open(BANK_FILE))
    puzzles = bank.get("puzzles", [])
    if len(puzzles) == 0:
        print("EMPTY bank - aborting (would destroy content)")
        return 1

    fresh_pool = _load_bank_puzzles()
    if len(fresh_pool) < 12:
        raise RuntimeError(f"bank pool too small: {len(fresh_pool)}")

    # Keep the existing window but inject a fresh puzzle at the front
    # (so the daily rotation modulus stays stable, content just refreshes).
    # 2026-08-28: prefer COMPACT puzzles (size <= 30) so the daily injection
    # stays phone-readable too.
    compact = [pz for pz in fresh_pool if (pz.get("size") or 0) <= 30]
    fresh = compact[datetime.date.today().toordinal() % len(compact)]
    roll = [fresh] + puzzles[:args.window - 1]
    roll = roll[-args.window:]

    tmp = BANK_FILE + ".tmp"
    json.dump({"puzzles": roll}, open(tmp, "w"), separators=(",", ":"))
    os.replace(tmp, BANK_FILE)
    print(f"ROTATED: {len(puzzles)} -> {len(roll)} puzzles (fresh: {fresh['title']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())