#!/usr/bin/env python3
"""
Generate the daily "Fun & free tools" content for onyxpc.us:
  - data/today_word.json      (Word of the Day, rotated from WORDS)
  - data/today_crossword.json (Daily mini-crossword, rotated from PUZZLES)
  - data/words.json           (full WOTD list  -> page fallback)
  - data/crosswords.json      (full puzzle list -> page fallback)

Run daily by cron. Deterministic per dayIndex() so the page always shows
today's content with zero server logic. Validates every crossword before emit.
"""
import json, os, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
os.makedirs(DATA, exist_ok=True)

def day_index():
    return datetime.date.today().toordinal()

# ---------------------------------------------------------------------------
# WORD OF THE DAY  (tech / computing themed — fits the computer-repair brand)
# ---------------------------------------------------------------------------
WORDS = [
    {"word": "Cache", "pos": "noun",
     "definition": "High-speed temporary storage that keeps frequently used data close to the processor so it can be fetched fast.",
     "example": "Clearing the browser cache fixed the broken images."},
    {"word": "Malware", "pos": "noun",
     "definition": "Software written to harm, hijack, or spy on a computer — viruses, trojans, and ransomware are all malware.",
     "example": "That popup was malware pretending to be a virus scan."},
    {"word": "Firewall", "pos": "noun",
     "definition": "A security barrier that controls what network traffic is allowed in and out of a device or network.",
     "example": "The office firewall blocked the suspicious login attempt."},
    {"word": "Phishing", "pos": "noun",
     "definition": "A scam that tricks you into handing over passwords or card numbers by pretending to be a trusted source.",
     "example": "The email looked like it was from the bank, but it was phishing."},
    {"word": "Bandwidth", "pos": "noun",
     "definition": "The amount of data that can move through a connection in a given time — think of it as the width of the pipe.",
     "example": "Four video calls at once ate all the bandwidth."},
    {"word": "Encryption", "pos": "noun",
     "definition": "Scrambling data so only someone with the key can read it — the backbone of private messaging and shopping.",
     "example": "Encryption keeps your card number safe at checkout."},
    {"word": "Firmware", "pos": "noun",
     "definition": "The low-level software baked into a device that tells its hardware how to boot and behave.",
     "example": "A firmware update made the printer print faster."},
    {"word": "SSHD", "pos": "noun",
     "definition": "A Solid-State Hybrid Drive — a hard disk paired with a small flash cache for quicker starts.",
     "example": "The old laptop felt new again after an SSHD swap."},
    {"word": "Latency", "pos": "noun",
     "definition": "The delay between an action and its response — low latency means snappy, high latency means laggy.",
     "example": "Gamers chase the lowest possible latency."},
    {"word": "Backup", "pos": "noun",
     "definition": "A second copy of your files kept separate from the originals so a crash isn't a catastrophe.",
     "example": "Her photos survived the flood because of a real backup."},
    {"word": "Pixel", "pos": "noun",
     "definition": "The tiny single-colour dot that, by the millions, makes up everything you see on a screen.",
     "example": "A dead pixel showed up as a black speck on the display."},
    {"word": "Thermal", "pos": "adjective",
     "definition": "Relating to heat — in PCs, thermal design is how a machine sheds the heat its chips produce.",
     "example": "New thermal paste dropped the CPU temp by 12 degrees."},
    {"word": "Sandbox", "pos": "noun",
     "definition": "An isolated space where untrusted software can run without touching the rest of your system.",
     "example": "The browser opens downloads in a sandbox."},
    {"word": "Uptime", "pos": "noun",
     "definition": "How long a system has been running without a crash or reboot — a measure of reliability.",
     "example": "The server hit 400 days of uptime."},
    {"word": "Driver", "pos": "noun",
     "definition": "A small program that lets the operating system talk to a piece of hardware like a printer or GPU.",
     "example": "A missing driver left the webcam dark."},
    {"word": "Spam", "pos": "noun",
     "definition": "Unwanted bulk messages — junk mail, fake offers, and the noise that clogs your inbox.",
     "example": "The filter caught 30 spam emails overnight."},
    {"word": "Rootkit", "pos": "noun",
     "definition": "Stealthy malware that hides deep in a system to keep itself and other attacks invisible.",
     "example": "The scan found a rootkit buried in the boot sector."},
    {"word": "Proxy", "pos": "noun",
     "definition": "A go-between server that fetches web content on your behalf, masking where the request came from.",
     "example": "The office routes traffic through a proxy."},
    {"word": "Kernel", "pos": "noun",
     "definition": "The core of an operating system that manages memory, hardware, and running programs.",
     "example": "A kernel panic froze the Mac mid-edit."},
    {"word": "Patch", "pos": "noun",
     "definition": "A small update that fixes a bug or closes a security hole in software.",
     "example": "Install the patch before the flaw gets exploited."},
    {"word": "Overclock", "pos": "verb",
     "definition": "To run a chip faster than its stock speed for more performance — at the cost of heat and stability.",
     "example": "He overclocked the GPU for a few extra frames."},
    {"word": "Botnet", "pos": "noun",
     "definition": "A network of hijacked devices controlled together, often used to flood websites or send spam.",
     "example": "The malware turned the PCs into a botnet."},
]

# ---------------------------------------------------------------------------
# MINI CROSSWORDS  (hand-built, validated below. 5x5, tech-themed.)
# Each entry: across / down lists of (answer, start_row, start_col)  [1-indexed]
# ---------------------------------------------------------------------------
PUZZLES = [
    {"title": "Storage", "size": 5,
     "across": [("DISK", 1, 1)],
     "down":   [("DATA", 1, 1), ("INPUT", 1, 2)]},
    {"title": "Cables", "size": 5,
     "across": [("CABLE", 1, 1)],
     "down":   [("CAP", 1, 1), ("ART", 1, 2), ("BUS", 1, 3)]},
    {"title": "Power", "size": 5,
     "across": [("POWER", 1, 1)],
     "down":   [("PIG", 1, 1), ("OWL", 1, 2), ("WAR", 1, 3)]},
    {"title": "Mice", "size": 5,
     "across": [("MOUSE", 1, 1)],
     "down":   [("MAP", 1, 1), ("OAK", 1, 2), ("URN", 1, 3)]},
    {"title": "Boot", "size": 5,
     "across": [("BOOT", 1, 1)],
     "down":   [("BUS", 1, 1), ("OAT", 1, 2), ("ORE", 1, 3)]},
    {"title": "Tech", "size": 5,
     "across": [("TECH", 1, 1)],
     "down":   [("TAB", 1, 1), ("EVE", 1, 2), ("CUE", 1, 3)]},
]

def build_grid(puzzle):
    n = puzzle["size"]
    grid = [["." for _ in range(n)] for _ in range(n)]
    def place(word, r, c, dr, dc):
        for i, ch in enumerate(word):
            rr, cc = r - 1 + i * dr, c - 1 + i * dc
            if grid[rr][cc] != "." and grid[rr][cc] != ch:
                raise ValueError(f"conflict at {rr},{cc}: {grid[rr][cc]} vs {ch}")
            grid[rr][cc] = ch
    for w, r, c in puzzle["across"]:
        place(w, r, c, 0, 1)
    for w, r, c in puzzle["down"]:
        place(w, r, c, 1, 0)
    return ["".join(row) for row in grid]

def validate(puzzle):
    n = puzzle["size"]
    g = build_grid(puzzle)
    # every across/down word must read correctly from the grid
    for w, r, c in puzzle["across"]:
        got = "".join(g[r-1][c-1+i] for i in range(len(w)))
        assert got == w, f"{puzzle['title']} across {w} != {got}"
    for w, r, c in puzzle["down"]:
        got = "".join(g[r-1+i][c-1] for i in range(len(w)))
        assert got == w, f"{puzzle['title']} down {w} != {got}"
    # no floating single letters: every filled cell must be part of a word
    filled = {(r-1, c-1+i) for w, r, c in puzzle["across"] for i in range(len(w))}
    filled |= {(r-1+i, c-1) for w, r, c in puzzle["down"] for i in range(len(w))}
    for r in range(n):
        for c in range(n):
            if g[r][c] != "." and (r, c) not in filled:
                raise ValueError(f"orphan cell {r},{c}={g[r][c]} in {puzzle['title']}")
    return g

def emit_puzzle(puzzle):
    g = validate(puzzle)
    n = puzzle["size"]
    # numbering
    starts = {}
    num = 1
    for r in range(n):
        for c in range(n):
            if g[r][c] == ".":
                continue
            is_ac = (c == 0 or g[r][c-1] == ".") and (c+1 < n and g[r][c+1] != ".")
            is_dn = (r == 0 or g[r-1][c] == ".") and (r+1 < n and g[r+1][c] != ".")
            if is_ac or is_dn:
                starts[(r, c)] = num
                num += 1
    across, down = [], []
    for w, r, c in puzzle["across"]:
        across.append({"num": starts[(r-1, c-1)], "row": r, "col": c, "len": len(w),
                       "answer": w, "clue": _clue(w)})
    for w, r, c in puzzle["down"]:
        down.append({"num": starts[(r-1, c-1)], "row": r, "col": c, "len": len(w),
                     "answer": w, "clue": _clue(w)})
    return {"title": puzzle["title"], "size": n, "grid": g,
            "clues": {"across": across, "down": down}}

CLUES = {
    "DISK": "Storage drive that holds your files",
    "DATA": "The facts and files your PC stores",
    "INPUT": "What you type into a computer",
    "CABLE": "Wire that carries signal or power",
    "CAP": "A bottle lid, or a short coat",
    "ART": "Painting, music, or sculpture",
    "BUS": "Vehicle that carries passengers",
    "POWER": "The energy that runs your machine",
    "PIG": "Farm animal that loves mud",
    "OWL": "Night bird with big eyes",
    "WAR": "Armed conflict between nations",
    "MOUSE": "Pointing device — or a small rodent",
    "MAP": "Folded guide to where things are",
    "OAK": "Strong, long-lived shade tree",
    "URN": "Vase, often for ashes or tea",
    "BOOT": "Start up a computer",
    "OAT": "Grain in oatmeal and granola",
    "ORE": "Rock mined for metal",
    "TECH": "Short for technology",
    "TAB": "Browser page, or a small bill",
    "EVE": "The night before a holiday",
    "CUE": "Signal to act, or a pool stick",
}

def _clue(w):
    return CLUES.get(w, w)

def main():
    # validate all puzzles up front — fail loudly, write nothing
    puzzles = [emit_puzzle(p) for p in PUZZLES]

    today = datetime.date.today().isoformat()
    di = day_index()

    # Word of the day
    w = WORDS[di % len(WORDS)]
    today_word = {"word": w["word"], "pos": w["pos"], "definition": w["definition"],
                  "example": w["example"], "date": today}
    # Crossword of the day
    cw = puzzles[di % len(puzzles)]
    today_cw = {"title": cw["title"], "size": cw["size"], "grid": cw["grid"],
                "clues": cw["clues"], "date": today}

    def write(name, obj):
        with open(os.path.join(DATA, name), "w") as f:
            json.dump(obj, f, indent=2)

    write("words.json", {"words": WORDS})
    write("crosswords.json", {"puzzles": puzzles})
    write("today_word.json", today_word)
    write("today_crossword.json", today_cw)

    print(f"OK {today}: word='{today_word['word']}' crossword='{today_cw['title']}' "
          f"({len(WORDS)} words, {len(puzzles)} puzzles)")

if __name__ == "__main__":
    main()
