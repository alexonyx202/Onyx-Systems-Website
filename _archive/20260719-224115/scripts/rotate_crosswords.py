#!/usr/bin/env python3
"""Daily crossword rotation for onyxpc.us.

Keeps data/crosswords.json a rolling window of exactly WINDOW puzzles (default 30).
Each run, if a fresh on-brand 15x15 puzzle can be generated within BUDGET seconds,
it is appended and the oldest is dropped -> content stays fresh while the window
size (and therefore the engine's day-rotation modulus) never changes.

If generation fails or times out, the existing window is left untouched (idempotent).

The engine (assets/js/crossword.js) reads p.size / p.title / p.grid / p.clues,
so generated puzzles are adapted to that schema (gen_crossword.to_puzzle emits a
nested 'meta' but not a top-level 'size'/'title').

Usage: python3 scripts/rotate_crosswords.py [--window 30] [--budget 60]
"""
import argparse, json, os, sys, time, shutil, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
BANK = os.path.join(REPO, "data", "crosswords.json")
WINDOW = 30
BUDGET = 60  # seconds to allow generation before giving up (keep cron cheap)


def gen_one(budget):
    """Return a schema-correct puzzle dict, or None if it can't be made in time."""
    sys.path.insert(0, HERE)
    import gen_crossword as g
    import signal

    class _Timeout(Exception):
        pass

    def _handler(signum, frame):
        raise _Timeout()

    signal.signal(signal.SIGALRM, _handler)
    signal.alarm(int(budget))
    try:
        seed = int(datetime.date.today().strftime("%Y%m%d"))
        mask, sol, clues, bylen = g.generate(seed_base=seed, attempts=400)
        puz = g.to_puzzle(mask, sol, clues)
    finally:
        signal.alarm(0)
    # Adapt to engine schema: top-level size/title are required by crossword.js
    size = puz["meta"]["size"]
    title = "Onyx Daily Puzzle %s" % datetime.date.today().isoformat()
    return {
        "title": title,
        "size": size,
        "grid": puz["grid"],
        "clues": puz["clues"],
        "category": "general",
        "source_url": "",
        "slug": "onyx-%s" % datetime.date.today().isoformat(),
        "fetched_at": datetime.datetime.now().isoformat(timespec="seconds"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", type=int, default=WINDOW)
    ap.add_argument("--budget", type=int, default=BUDGET)
    args = ap.parse_args()

    bank = json.load(open(BANK))
    puzzles = bank.get("puzzles", [])
    if len(puzzles) == 0:
        print("EMPTY bank - aborting (would destroy content)")
        return 1

    t0 = time.time()
    try:
        fresh = gen_one(args.budget)
    except Exception as ex:
        print("GEN_SKIP: %s (keeping existing %d-puzzle window)" % (ex, len(puzzles)))
        return 0  # no-op; window intact
    dt = time.time() - t0
    if fresh is None:
        print("GEN_TIMEOUT after %.0fs - keeping existing %d-puzzle window" % (dt, len(puzzles)))
        return 0

    roll = puzzles[1:] + [fresh]  # drop oldest, append newest -> same length
    roll = roll[-args.window:]
    # atomic write
    tmp = BANK + ".tmp"
    json.dump({"puzzles": roll}, open(tmp, "w"), separators=(",", ":"))
    os.replace(tmp, BANK)
    print("ROTATED: %d -> %d puzzles in %.0fs (oldest dropped, fresh added: %s)"
          % (len(puzzles), len(roll), dt, fresh["title"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
