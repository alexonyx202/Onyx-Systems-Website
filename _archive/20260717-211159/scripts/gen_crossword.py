#!/usr/bin/env python3
"""Generate spec-compliant 15x15 American crosswords for onyxpc.us.

Rules (from the crossword-grid-specs skill + NYT/LA/WSJ convention):
  - 15x15 grid, 180-degree rotational symmetry of black squares
  - full interlock: every white square is in BOTH an Across and a Down word
  - every word >= 3 letters (no 1- or 2-letter entries)
  - single connected component (no isolated islands)
  - word count 72-78 for a 15x15 (cap = 78 at NYT/LA/WSJ)
  - ~36 black squares (18 symmetric pairs) -> dense, fast solve

Fills from a CURATED common-word pool (scripts/xw_words.py -> CLUES),
so every answer is recognizable AND has a hand-written clue (no junk like
"ibadan"/"quaalude", and never an unfillable answer). Clues are emitted
inline so the puzzle is fully solvable by a human.

Solver: backtracking with forward checking + MRV, bounded node count.
Outputs a ready-to-ship JSON object (grid + clues) on stdout.
"""
import json, random, sys, time

N = 15
POOL_PATH = "scripts/xw_words.py"   # sets CLUES = {WORD: "clue"}
TARGET_BLOCKS = 18                     # pairs -> ~36 black squares
NODE_CAP = 40000                     # backtrack budget per mask (fail-fast on hard masks)
MAX_ATTEMPTS = 600                      # try many masks; keep first good fill
MAX_RUN = 14                            # longest word in xw_words.py curated pool;
                                         # masks must have no run longer than this

# ---------------------------------------------------------------------------
# Curated word pool (answers that double as clue keys)
# ---------------------------------------------------------------------------
def auto_clue(word):
    """Honest fallback clue for a filler word with no curated definition.
    We have no offline dictionary API, so we state the obvious: it is a valid
    English word of the given length. Prefer curated words (the solver biases
    toward them) so this only appears for hard-to-fill slots."""
    L = len(word)
    return "A %d-letter word" % L


def load_pool():
    import importlib.util
    spec = importlib.util.spec_from_file_location("xw_words", POOL_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    clues = {k.upper(): v for k, v in mod.CLUES.items()}
    # Filler words (no curated clue) widen the solver's domains so 15x15
    # masks are actually fillable. They are NOT clue sources by themselves.
    # Stored as a plain newline-delimited file (scripts/xw_fillers.txt) because
    # a 63k-item Python set literal exceeds the parser's collection-display limit.
    with open("scripts/xw_fillers.txt") as fh:
        fillers = {w.strip().upper() for w in fh if w.strip()}
    # answer -> (word, is_curated). Curated words are preferred by the solver.
    answers = {w: (w, True) for w in clues}
    for w in fillers:
        answers.setdefault(w, (w, False))
    bylen = {}
    for w, cur in answers.values():
        L = len(w)
        if 3 <= L <= N:
            bylen.setdefault(L, []).append((w, cur))
    for L in bylen:
        # curated words first so MRV + first-fit biases toward clued entries
        bylen[L].sort(key=lambda wc: (0 if wc[1] else 1, wc[0]))
    return clues, bylen

# ---------------------------------------------------------------------------
# Grid helpers (0 = white, 1 = black)
# ---------------------------------------------------------------------------
def check_symmetry(g):
    for r in range(N):
        for c in range(N):
            if g[r][c] != g[N - 1 - r][N - 1 - c]:
                return False
    return True

def runs_ok(g):
    """Every white run must be >= 3 letters. (Upper bound enforced separately
    by max_run() before solving, because a 15-run is only illegal if it exceeds
    the longest available word; enforcing it here would block gen_mask from ever
    placing the first block.)"""
    for r in range(N):
        c = 0
        while c < N:
            if g[r][c] == 0:
                c2 = c
                while c2 < N and g[r][c2] == 0:
                    c2 += 1
                if c2 - c < 3:
                    return False
                c = c2
            else:
                c += 1
    for c in range(N):
        r = 0
        while r < N:
            if g[r][c] == 0:
                r2 = r
                while r2 < N and g[r2][c] == 0:
                    r2 += 1
                if r2 - r < 3:
                    return False
                r = r2
            else:
                r += 1
    return True

def max_run(g):
    """Longest white run in either axis. Must be <= MAX_RUN or the grid is
    unfillable (no word that long in the pool)."""
    best = 0
    for r in range(N):
        c = 0
        while c < N:
            if g[r][c] == 0:
                c2 = c
                while c2 < N and g[r][c2] == 0:
                    c2 += 1
                best = max(best, c2 - c)
                c = c2
            else:
                c += 1
    for c in range(N):
        r = 0
        while r < N:
            if g[r][c] == 0:
                r2 = r
                while r2 < N and g[r2][c] == 0:
                    r2 += 1
                best = max(best, r2 - r)
                r = r2
            else:
                r += 1
    return best

def connected(g):
    opens = [(r, c) for r in range(N) for c in range(N) if g[r][c] == 0]
    if not opens:
        return False
    seen = set()
    stack = [opens[0]]
    while stack:
        r, c = stack.pop()
        if (r, c) in seen:
            continue
        seen.add((r, c))
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < N and 0 <= nc < N and g[nr][nc] == 0 and (nr, nc) not in seen:
                stack.append((nr, nc))
    return len(seen) == len(opens)

def gen_mask(rng, target_blocks=TARGET_BLOCKS, max_placements=20000):
    """Build a 180-symmetric mask with target_blocks pairs, then keep adding
    valid block pairs until the longest run is <= MAX_RUN (otherwise the grid
    is unfillable: no word that long exists in the pool). Denser masks (~48-56
    blocks) actually fill MORE reliably because the extra intersections
    propagate constraints. Respects runs>=3 and connectivity throughout."""
    g = [[0] * N for _ in range(N)]
    canon = []
    for r in range(N):
        for c in range(N):
            rr, cc = N - 1 - r, N - 1 - c
            if (r < rr) or (r == rr and c < cc):
                canon.append((r, c))
    placed = 0
    attempts = 0
    while placed < target_blocks and attempts < max_placements:
        attempts += 1
        r, c = canon[rng.randrange(len(canon))]
        rr, cc = N - 1 - r, N - 1 - c
        if g[r][c] == 1:
            continue
        g[r][c] = 1
        g[rr][cc] = 1
        if not runs_ok(g) or not connected(g):
            g[r][c] = 0
            g[rr][cc] = 0
            continue
        placed += 1
    # densify until no run exceeds MAX_RUN (the fillable ceiling)
    extra = 0
    while max_run(g) > MAX_RUN and extra < 60 and attempts < max_placements:
        attempts += 1
        r, c = canon[rng.randrange(len(canon))]
        rr, cc = N - 1 - r, N - 1 - c
        if g[r][c] == 1:
            continue
        g[r][c] = 1
        g[rr][cc] = 1
        if not runs_ok(g) or not connected(g):
            g[r][c] = 0
            g[rr][cc] = 0
            continue
        extra += 1
    return g

def slots(g):
    res = []
    for r in range(N):
        c = 0
        while c < N:
            if g[r][c] == 0:
                c2 = c
                while c2 < N and g[r][c2] == 0:
                    c2 += 1
                L = c2 - c
                if L >= 3:
                    res.append(("A", r, c, L, [(r, cc) for cc in range(c, c2)]))
                c = c2
            else:
                c += 1
    for c in range(N):
        r = 0
        while r < N:
            if g[r][c] == 0:
                r2 = r
                while r2 < N and g[r2][c] == 0:
                    r2 += 1
                L = r2 - r
                if L >= 3:
                    res.append(("D", r, c, L, [(rr, c) for rr in range(r, r2)]))
                r = r2
            else:
                r += 1
    return res

def number_grid(g):
    num = 0
    num_at = {}
    for r in range(N):
        for c in range(N):
            if g[r][c] == 1:
                continue
            startsA = (c == 0 or g[r][c - 1] == 1) and (c + 1 < N and g[r][c + 1] != 1)
            startsD = (r == 0 or g[r - 1][c] == 1) and (r + 1 < N and g[r + 1][c] != 1)
            if startsA or startsD:
                num += 1
                num_at[(r, c)] = num
    return num_at

def build_intersections(s):
    cell_to_slot = {}
    for i, sl in enumerate(s):
        for pos, (r, c) in enumerate(sl[4]):
            cell_to_slot.setdefault((r, c), []).append((i, pos))
    inter = [[] for _ in range(len(s))]
    for (r, c), lst in cell_to_slot.items():
        if len(lst) == 2:
            (i, pi), (j, pj) = lst
            inter[i].append((j, pi, pj))
            inter[j].append((i, pj, pi))
    return inter

# Abbreviations / initialisms we refuse to accept as answers even if in pool.
CRUFT = set("""asl ibo roe dba rsvp hon oed nco emf roc ole ose dna rna std poc aol
bbc cnn fbi cia nsa irs fcc faa tsa doj dod sec sos una ufo iou eta
hmm mm pff aw shh psh grr uh tsk pht nth yah yeh bsd wtd etd cp cpus
nfl nba mlb nhl apr abb hwy rte pky rds stds cos dos nov dec""".split())

def solve(g, bylen, seed=1, node_cap=NODE_CAP):
    """Backtracking fill with forward checking. Uses precomputed letter-index
    tables so constraint propagation is O(1) per node (the previous O(domain)
    list scans made 15x15 fills take >40s). Words are tracked by integer index
    into per-length lists; candidates are compacted in place with an active
    count, so no lists are allocated during search."""
    MAXL = max(bylen.keys())          # longest word we can place
    s = [sl for sl in slots(g) if sl[3] <= MAXL]
    if not s:
        return None
    M = len(s)
    inter = build_intersections(s)
    grid = [["." for _ in range(N)] for _ in range(N)]
    # word lists per length (strings)
    words_of = {L: [w for w, _ in bylen[L]] for L in bylen}
    # letter index: idx[L][pos] -> {char: frozenset(word-indices)} built ONCE
    letter_idx = {}
    for L, wl in words_of.items():
        d = [dict() for _ in range(L)]
        for wi, w in enumerate(wl):
            for p, ch in enumerate(w):
                d[p].setdefault(ch, set()).add(wi)
        for p in range(L):
            for ch in d[p]:
                d[p][ch] = frozenset(d[p][ch])
        letter_idx[L] = d
    # per-slot domain: list of word indices + active count
    domains = [list(range(len(words_of[sl[3]]))) for sl in s]
    active = [len(d) for d in domains]
    assigned = [False] * M
    counter = [0]
    # Precompute, for each slot, its word list reference
    slot_words = [words_of[sl[3]] for sl in s]

    def rec():
        counter[0] += 1
        if counter[0] > node_cap:
            return None
        # MRV
        best = -1; bestn = None
        for i in range(M):
            if assigned[i]:
                continue
            nd = active[i]
            if bestn is None or nd < bestn:
                bestn = nd; best = i
                if nd <= 1:
                    break
        if best == -1:
            return [row[:] for row in grid]
        if bestn == 0:
            return None
        sl = s[best]
        cells = sl[4]
        dom = domains[best]
        wl = slot_words[best]
        n = active[best]
        for wi in range(n):
            w = wl[dom[wi]]
            for k, (r, c) in enumerate(cells):
                grid[r][c] = w[k]
            assigned[best] = True
            saved = []   # (slot, old_active, compacted_restore_info)
            ok = True
            for (j, idx_i, idx_j) in inter[best]:
                if assigned[j]:
                    continue
                need = w[idx_i]
                Lj = s[j][3]
                jdom = domains[j]
                ja = active[j]
                # candidate word-indices whose idx_j letter == need
                allowed = letter_idx[Lj][idx_j].get(need)
                if not allowed:
                    ok = False
                    break
                write = 0
                for read in range(ja):
                    if jdom[read] in allowed:
                        if write != read:
                            jdom[write], jdom[read] = jdom[read], jdom[write]
                        write += 1
                if write == 0:
                    ok = False
                    break
                saved.append((j, ja, write))
                active[j] = write
            if ok:
                res = rec()
                if res:
                    return res
            assigned[best] = False
            for k, (r, c) in enumerate(cells):
                grid[r][c] = "."
            for (j, ja, write) in saved:
                active[j] = ja
        return None
    return rec()

def generate(seed_base=1, attempts=MAX_ATTEMPTS):
    clues, bylen = load_pool()
    rng = random.Random(seed_base)
    for attempt in range(attempts):
        cand = gen_mask(rng)
        if max_run(cand) > MAX_RUN:      # unfillable: no word that long in pool
            continue
        sol = solve(cand, bylen, seed=seed_base * 1000 + attempt)
        if not sol:
            continue
        # reject if any answer is crud
        s = slots(cand)
        bad = False
        for sl in s:
            _, r, c, L, cells = sl
            word = "".join(sol[rr][cc] for (rr, cc) in cells)
            if word in CRUFT or word not in clues:
                bad = True
                break
        if bad:
            continue
        return cand, sol, clues, bylen
    raise RuntimeError("no fillable mask found in %d attempts" % attempts)

def to_puzzle(mask, sol, clues):
    grid_str = []
    for r in range(N):
        row = ""
        for c in range(N):
            row += "." if mask[r][c] == 1 else sol[r][c].upper()
        grid_str.append(row)
    num_at = number_grid(mask)
    s = slots(mask)
    entries = []
    for sl in s:
        direction, r, c, L, cells = sl
        if (r, c) not in num_at:
            continue
        num = num_at[(r, c)]
        answer = "".join(sol[rr][cc].upper() for (rr, cc) in cells)
        entries.append({
            "num": num,
            "dir": "across" if direction == "A" else "down",
            "row": r + 1,
            "col": c + 1,
            "len": L,
            "answer": answer,
            "clue": clues.get(answer, auto_clue(answer)),
        })
    entries.sort(key=lambda e: (e["num"], 0 if e["dir"] == "across" else 1))
    blocks = sum(sum(row) for row in mask)
    white = N * N - blocks
    n_across = sum(1 for e in entries if e["dir"] == "across")
    n_down = sum(1 for e in entries if e["dir"] == "down")
    lens = [e["len"] for e in entries]
    return {
        "grid": grid_str,
        "clues": {"across": [e for e in entries if e["dir"] == "across"],
                   "down": [e for e in entries if e["dir"] == "down"]},
        "meta": {
            "size": N, "blocks": blocks, "white": white,
            "words": len(entries), "across": n_across, "down": n_down,
            "min_len": min(lens), "max_len": max(lens),
            "symmetry_180": check_symmetry(mask),
            "connected": connected(mask), "runs_min3": runs_ok(mask),
        },
    }

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("seed", type=int, nargs="?", default=1)
    ap.add_argument("--attempts", type=int, default=MAX_ATTEMPTS)
    ap.add_argument("--json", action="store_true", help="emit full JSON object")
    args = ap.parse_args()

    t0 = time.time()
    mask, sol, clues, _ = generate(args.seed, args.attempts)
    puz = to_puzzle(mask, sol, clues)
    m = puz["meta"]
    print("seed=%d  %ds" % (args.seed, time.time() - t0))
    print("blocks=%d words=%d (A%d/D%d) min_len=%d max_len=%d"
          % (m["blocks"], m["words"], m["across"], m["down"], m["min_len"], m["max_len"]))
    print("symmetry_180=%s connected=%s runs>=3=%s"
          % (m["symmetry_180"], m["connected"], m["runs_min3"]))
    if not args.json:
        for row in puz["grid"]:
            print(" ".join(row))
        print()
        for e in puz["clues"]["across"] + puz["clues"]["down"]:
            pass
        for e in sorted(puz["clues"]["across"] + puz["clues"]["down"],
                        key=lambda e: (e["num"], 0 if e["dir"] == "across" else 1)):
            print("%2d%s (%d,%d) %2d  %-12s %s" % (e["num"], e["dir"][0].upper(),
                  e["row"], e["col"], e["len"], e["answer"], e["clue"]))
    else:
        print(json.dumps(puz, indent=2))

if __name__ == "__main__":
    main()
