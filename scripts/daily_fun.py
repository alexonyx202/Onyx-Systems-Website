#!/usr/bin/env python3
"""
Onyx Systems — consolidated DAILY FUN generator (Play · Learn · Local widgets).

Produces, for TODAY's date, the deterministic daily widgets for onyxpc.us:
  - data/today_word.json      (Word of the Day)        -> rotated from WORDS, NO-REPEAT cursor
  - data/words.json           (full WOTD pool -> page fallback, expanded)
  - data/today_crossword.json (Daily mini-crossword)   -> rotated from PUZZLES, NO-REPEAT cursor
  - data/crosswords.json      (full puzzle pool -> page fallback, expanded)
  - data/today_trivia.json    (Tech Trivia)            -> rotated from TRIVIA, NO-REPEAT cursor
  - data/trivia.json          (full trivia pool -> page fallback, expanded)
  - data/poll.json            (This Week's Poll)       -> refreshed ONLY on Sunday, NO-REPEAT cursor

NEVER-REPEAT design (the proven joke_state.json pattern, applied uniformly):
  Each pool has a sidecar <kind>_state.json = {last_index, used_trailing:[...]}.
  Selection = (last_index + 1) % n, REJECTED if already in used_trailing (a full-cycle
  trailing window). After pick, push index to used_trailing and TRIM to len so a word
  cannot return until the whole pool has been shown once. This guarantees "never repeats"
  for word / crossword / trivia / poll — matching the joke behavior the site already ships.

REFILL: if a pool drops below its floor, append unique items from the *_EXTRA banks
(offline-safe, no web needed at generation time). The website team's specialist subagents
can later enrich pools with freshly web-researched items; this script keeps the daily run
deterministic and fast.

The Daily Joke is handled separately by the website team's S3 (its own joke_state.json
cursor + refill + index.html loader patch) — this script does NOT touch jokes.

This script ONLY WRITES FILES. The publisher (website team) commits + pushes + verifies.

Run:  python3 scripts/daily_fun.py
"""
import json, os, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
os.makedirs(DATA, exist_ok=True)

# -----------------------------------------------------------------------------
# Generic cursor (no-repeat, full-cycle trailing window)
# -----------------------------------------------------------------------------
def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None

def save_json(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=2)

def cursor_pick(pool, state_path, today):
    """Return (item, new_index) using a no-repeat cursor. Mutates state file.

    NEVER-REPEAT guarantee: the trailing window holds the last (n-1) picked indices.
    The next pick is (last_index+1) % n. Because the window keeps only the most
    recent n-1 entries, the natural next index is ALWAYS the one that just aged out
    of the window — so it is NEVER in the window, and every item returns exactly once
    per full cycle (interval = n days), with no repeats. This is correct for all n>=1.
    """
    n = len(pool)
    if n == 0:
        return None, -1
    st = load_json(state_path) or {"last_index": -1, "used_trailing": []}
    used = list(st.get("used_trailing", []))
    idx = (int(st.get("last_index", -1)) + 1) % n
    window = used[-(n - 1):] if n > 1 else []
    guard = 0
    while idx in window and guard < n:
        idx = (idx + 1) % n
        guard += 1
    st["last_index"] = idx
    used.append(idx)
    st["used_trailing"] = used[-(n - 1):] if n > 1 else []
    save_json(state_path, st)
    return pool[idx], idx

# -----------------------------------------------------------------------------
# CROSSWORD: load from the pre-built Obsidian bank (Converted CrosswordLabs
# puzzles). The bank is the authoritative source of complete, fully-clued
# two-way crosswords (real across + down lists). A tech/computer category is
# preferred automatically once John fetches one; otherwise math+science.
# daily_fun.py only READS the bank and rotates through it (never-repeat cursor).
# -----------------------------------------------------------------------------
import glob as _glob
import os.path as _osp

BANK_DIR = "/home/ai/Documents/Obsidian Vault/Games/Crosswords"
BANK_TECH_DIRS = ["tech", "computer", "technology"]  # tried first, in order


def _bank_valid(p):
    """Mirror the converter's validate(): every clue reads back, no orphans.
    Accepts grid either as list-of-strings OR list-of-lists; normalizes first.
    Returns False on any malformed/oversized entry rather than raising.
    """
    raw = p.get("grid")
    if not isinstance(raw, list) or not raw:
        return False
    # normalize rows to strings
    try:
        rows = ["".join(row) if isinstance(row, list) else str(row) for row in raw]
    except Exception:
        return False
    n = p.get("size") or len(rows)
    if n != len(rows):
        return False
    width = min(len(r) for r in rows)
    if width != max(len(r) for r in rows):
        return False  # not square
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
    cand_dirs = []
    for d in BANK_TECH_DIRS:
        pp = os.path.join(BANK_DIR, d)
        if os.path.isdir(pp):
            cand_dirs.append(pp)
    if not cand_dirs:
        # fall back to every category subdir (math, science, ...)
        cand_dirs = [os.path.join(BANK_DIR, d) for d in sorted(os.listdir(BANK_DIR))
                     if os.path.isdir(os.path.join(BANK_DIR, d))]
    puzzles = []
    for d in cand_dirs:
        for fp in sorted(_glob.glob(os.path.join(d, "*.json"))):
            if os.path.basename(fp) in ("index.json", "Crosswords.md"):
                continue
            try:
                pz = json.load(open(fp))
            except Exception:
                continue
            if not _bank_valid(pz):
                continue
            # require a real across list (the whole point of this fix)
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
    return out


def build_puzzles():
    return _load_bank_puzzles()

# -----------------------------------------------------------------------------
# WORD OF THE DAY pool (40 curated tech terms; + EXTRA for refill)
# -----------------------------------------------------------------------------
WORDS = [
    {"word": "Cache", "pos": "noun", "definition": "High-speed temporary storage that keeps frequently used data close to the processor so it can be fetched fast.", "example": "Clearing the browser cache fixed the broken images."},
    {"word": "Malware", "pos": "noun", "definition": "Software written to harm, hijack, or spy on a computer — viruses, trojans, and ransomware are all malware.", "example": "That popup was malware pretending to be a virus scan."},
    {"word": "Firewall", "pos": "noun", "definition": "A security barrier that controls what network traffic is allowed in and out of a device or network.", "example": "The office firewall blocked the suspicious login attempt."},
    {"word": "Phishing", "pos": "noun", "definition": "A scam that tricks you into handing over passwords or card numbers by pretending to be a trusted source.", "example": "The email looked like it was from the bank, but it was phishing."},
    {"word": "Bandwidth", "pos": "noun", "definition": "The amount of data that can move through a connection in a given time — think of it as the width of the pipe.", "example": "Four video calls at once ate all the bandwidth."},
    {"word": "Encryption", "pos": "noun", "definition": "Scrambling data so only someone with the key can read it — the backbone of private messaging and shopping.", "example": "Encryption keeps your card number safe at checkout."},
    {"word": "Firmware", "pos": "noun", "definition": "The low-level software baked into a device that tells its hardware how to boot and behave.", "example": "A firmware update made the printer print faster."},
    {"word": "SSHD", "pos": "noun", "definition": "A Solid-State Hybrid Drive — a hard disk paired with a small flash cache for quicker starts.", "example": "The old laptop felt new again after an SSHD swap."},
    {"word": "Latency", "pos": "noun", "definition": "The delay between an action and its response — low latency means snappy, high latency means laggy.", "example": "Gamers chase the lowest possible latency."},
    {"word": "Backup", "pos": "noun", "definition": "A second copy of your files kept separate from the originals so a crash isn't a catastrophe.", "example": "Her photos survived the flood because of a real backup."},
    {"word": "Pixel", "pos": "noun", "definition": "The tiny single-colour dot that, by the millions, makes up everything you see on a screen.", "example": "A dead pixel showed up as a black speck on the display."},
    {"word": "Thermal", "pos": "adjective", "definition": "Relating to heat — in PCs, thermal design is how a machine sheds the heat its chips produce.", "example": "New thermal paste dropped the CPU temp by 12 degrees."},
    {"word": "Sandbox", "pos": "noun", "definition": "An isolated space where untrusted software can run without touching the rest of your system.", "example": "The browser opens downloads in a sandbox."},
    {"word": "Uptime", "pos": "noun", "definition": "How long a system has been running without a crash or reboot — a measure of reliability.", "example": "The server hit 400 days of uptime."},
    {"word": "Driver", "pos": "noun", "definition": "A small program that lets the operating system talk to a piece of hardware like a printer or GPU.", "example": "A missing driver left the webcam dark."},
    {"word": "Spam", "pos": "noun", "definition": "Unwanted bulk messages — junk mail, fake offers, and the noise that clogs your inbox.", "example": "The filter caught 30 spam emails overnight."},
    {"word": "Rootkit", "pos": "noun", "definition": "Stealthy malware that hides deep in a system to keep itself and other attacks invisible.", "example": "The scan found a rootkit buried in the boot sector."},
    {"word": "Proxy", "pos": "noun", "definition": "A go-between server that fetches web content on your behalf, masking where the request came from.", "example": "The office routes traffic through a proxy."},
    {"word": "Kernel", "pos": "noun", "definition": "The core of an operating system that manages memory, hardware, and running programs.", "example": "A kernel panic froze the Mac mid-edit."},
    {"word": "Patch", "pos": "noun", "definition": "A small update that fixes a bug or closes a security hole in software.", "example": "Install the patch before the flaw gets exploited."},
    {"word": "Overclock", "pos": "verb", "definition": "To run a chip faster than its stock speed for more performance — at the cost of heat and stability.", "example": "He overclocked the GPU for a few extra frames."},
    {"word": "Botnet", "pos": "noun", "definition": "A network of hijacked devices controlled together, often used to flood websites or send spam.", "example": "The malware turned the PCs into a botnet."},
    {"word": "Byte", "pos": "noun", "definition": "A unit of digital info — 8 bits, roughly one character of text.", "example": "That file is about two million bytes."},
    {"word": "Compiler", "pos": "noun", "definition": "A program that turns human-readable code into machine language the CPU can run.", "example": "The compiler caught the typo before it ever ran."},
    {"word": "Daemon", "pos": "noun", "definition": "A background process that runs quietly to handle printing, updates, or network tasks.", "example": "The print daemon restarted when the spool jammed."},
    {"word": "Ethernet", "pos": "noun", "definition": "Wired networking that uses a cable for a fast, steady connection.", "example": "She switched to Ethernet and the lag vanished."},
    {"word": "Gateway", "pos": "noun", "definition": "The device that connects your local network to the wider internet — usually your router.", "example": "The gateway handed out a fresh IP after the reboot."},
    {"word": "Hash", "pos": "noun", "definition": "A fixed-length fingerprint of data, so even a tiny change makes a totally different hash.", "example": "The download's hash proved the file wasn't tampered with."},
    {"word": "Modem", "pos": "noun", "definition": "The box that turns the signal from your provider into data your network can use.", "example": "A modem reboot fixed the 'no internet' light."},
    {"word": "Node", "pos": "noun", "definition": "Any single device or point in a network that sends, receives, or forwards data.", "example": "Every smart bulb is a node on the home network."},
    {"word": "Packet", "pos": "noun", "definition": "A small chunk of data wrapped with an address and sent across a network.", "example": "Lost packets are why a video call freezes for a second."},
    {"word": "Port", "pos": "noun", "definition": "A numbered doorway on a device that a specific kind of network traffic uses.", "example": "The game needed port 25565 opened to host friends."},
    {"word": "Query", "pos": "noun", "definition": "A request for information — usually a question you ask a database or search engine.", "example": "The slow query was missing an index."},
    {"word": "RAM", "pos": "noun", "definition": "Random Access Memory — fast, short-term working space the PC clears when you power off.", "example": "Adding more RAM stopped the tab-crashing."},
    {"word": "Router", "pos": "noun", "definition": "The box that directs traffic between your devices and the internet.", "example": "A router reboot is the first fix for most Wi-Fi woes."},
    {"word": "Socket", "pos": "noun", "definition": "A software endpoint — one end of a two-way connection between programs.", "example": "The app opened a socket to stream the update."},
    {"word": "Thread", "pos": "noun", "definition": "One independent line of execution inside a program, running alongside others.", "example": "Too many threads at once can thrash the CPU."},
    {"word": "Trojan", "pos": "noun", "definition": "Malware disguised as something harmless, like a fake game or tool.", "example": "The 'free' optimizer was actually a trojan."},
    {"word": "USB", "pos": "noun", "definition": "The universal plug almost every peripheral uses to connect and charge.", "example": "A USB hub turned one port into six."},
    {"word": "Virtual", "pos": "adjective", "definition": "Simulated in software rather than physical — like a machine that isn't really a box.", "example": "The virtual server boots in seconds, no hardware needed."},
    {"word": "Virus", "pos": "noun", "definition": "A self-copying malicious program that spreads by attaching to other files.", "example": "The old virus hid in the boot sector."},
]
WORDS_EXTRA = [
    {"word": "Algorithm", "pos": "noun", "definition": "A step-by-step recipe a computer follows to solve a problem or make a decision.", "example": "The feed's algorithm decided what you saw next."},
    {"word": "Binary", "pos": "noun", "definition": "The language of computers — just zeros and ones, on and off.", "example": "Everything you see is binary underneath."},
    {"word": "Cookie", "pos": "noun", "definition": "A small piece of data a site stores in your browser to remember you.", "example": "Clearing cookies logged me out of every site."},
    {"word": "GPU", "pos": "noun", "definition": "Graphics Processing Unit — built to crunch thousands of math ops at once, which is also why it powers AI.", "example": "The new GPU halved render times."},
    {"word": "Linux", "pos": "noun", "definition": "A free, open-source operating system that runs everything from phones to supercomputers.", "example": "Most of the world's servers run Linux."},
]

# -----------------------------------------------------------------------------
# TRIVIA pool (40 curated; + EXTRA for refill). Never mobile-phone trivia.
# -----------------------------------------------------------------------------
TRIVIA = [
    {"q": "What does 'HTTP' stand for?", "a": "HyperText Transfer Protocol — the rulebook your browser uses to fetch web pages.", "category": "Web"},
    {"q": "Which company first shipped a commercial computer mouse?", "a": "Apple, with the 1984 Macintosh (though the mouse was invented at Xerox PARC in the 1970s).", "category": "History"},
    {"q": "What does 'RAM' stand for, and why is it called that?", "a": "Random Access Memory — any byte can be reached in roughly the same time, unlike tape you'd fast-forward.", "category": "Hardware"},
    {"q": "What's the difference between HTTPS and HTTP?", "a": "The 'S' means secure: the connection is encrypted (TLS), so nobody on the Wi-Fi can read what you send.", "category": "Security"},
    {"q": "Roughly how many characters can a 7-bit ASCII code encode?", "a": "128 — enough for English letters, digits, and basic punctuation.", "category": "Basics"},
    {"q": "What does 'GPU' stand for?", "a": "Graphics Processing Unit — built to crunch many simple math ops at once, which is also why it powers AI.", "category": "Hardware"},
    {"q": "What year was the first Raspberry Pi released?", "a": "2012 — it kicked off the modern maker and retro-computing boom.", "category": "History"},
    {"q": "What does 'SSD' stand for, and how is it different from an HDD?", "a": "Solid-State Drive. No moving parts, so it's far faster and more shock-proof than a spinning Hard Disk Drive.", "category": "Hardware"},
    {"q": "What's a 'phishing' email?", "a": "A fake message that pretends to be your bank or boss to trick you into handing over passwords or money.", "category": "Security"},
    {"q": "What does 'Open Source' mean?", "a": "The source code is public and free to use, modify, and share — like Linux.", "category": "Software"},
    {"q": "What is the difference between a modem and a router?", "a": "A modem brings the internet in from your provider; a router shares that connection with your devices.", "category": "Network"},
    {"q": "What does 'BIOS' stand for?", "a": "Basic Input/Output System — the firmware that starts your hardware and hands off to the OS.", "category": "Hardware"},
    {"q": "What is a 'kernel panic'?", "a": "A fatal error where the OS core can't recover, so the system halts (the Mac's version of a Blue Screen).", "category": "Software"},
    {"q": "How many bits are in a byte?", "a": "8. A byte is the standard unit for one character of text.", "category": "Basics"},
    {"q": "What does 'IP' stand for in an IP address?", "a": "Internet Protocol — the address that identifies your device on a network.", "category": "Network"},
    {"q": "What is 'the cloud'?", "a": "Someone else's computers, accessed over the internet, where your files and apps live.", "category": "Web"},
    {"q": "What does 'defragment' mean for a hard drive?", "a": "Reordering scattered file pieces so they sit contiguously again, speeding up reads on an HDD.", "category": "Hardware"},
    {"q": "What is a 'botnet'?", "a": "A network of hijacked devices controlled together, often used to flood websites with traffic.", "category": "Security"},
    {"q": "What does 'SSH' let you do?", "a": "Securely control another computer over a network from the command line.", "category": "Network"},
    {"q": "What is 'cache' memory for?", "a": "It keeps frequently used data close to the CPU so fetches are fast.", "category": "Hardware"},
    {"q": "What does 'GUI' stand for?", "a": "Graphical User Interface — windows, icons, and a mouse instead of typed commands.", "category": "Software"},
    {"q": "What is 'malware'?", "a": "Any software built to harm, hijack, or spy — viruses, trojans, and ransomware are all malware.", "category": "Security"},
    {"q": "What does 'DHCP' do?", "a": "Automatically assigns IP addresses to devices joining a network.", "category": "Network"},
    {"q": "What is 'firmware'?", "a": "Low-level software baked into a device that tells its hardware how to boot and behave.", "category": "Hardware"},
    {"q": "What does 'API' stand for?", "a": "Application Programming Interface — a contract that lets two programs talk to each other.", "category": "Software"},
    {"q": "What is 'latency' in networking?", "a": "The delay before data starts moving — low latency means snappy, high latency means laggy.", "category": "Network"},
    {"q": "What does 'JSON' stand for?", "a": "JavaScript Object Notation — a lightweight text format for exchanging data.", "category": "Software"},
    {"q": "What is a 'QR code'?", "a": "A square barcode a phone camera reads to open a link or info instantly.", "category": "Basics"},
    {"q": "What does 'DNS' do?", "a": "Translates a name like onyxpc.us into the IP address computers actually route to.", "category": "Network"},
    {"q": "What is 'phishing' vs 'spear phishing'?", "a": "Phishing is a mass scam; spear phishing is the same trick aimed at one specific person.", "category": "Security"},
    {"q": "What does 'URL' stand for?", "a": "Uniform Resource Locator — the address of a page or file on the web.", "category": "Web"},
    {"q": "What is 'thermal throttling'?", "a": "When a chip slows itself down to avoid overheating, trading speed for safety.", "category": "Hardware"},
    {"q": "What does 'RAID' stand for?", "a": "Redundant Array of Independent Disks — combining drives for speed or backup.", "category": "Hardware"},
    {"q": "What is 'open-source hardware'?", "a": "Physical designs (like Raspberry Pi) published so anyone can study, modify, and build them.", "category": "Software"},
    {"q": "What does 'SSL/TLS' protect?", "a": "The encrypted channel between your browser and a site, shown by the padlock icon.", "category": "Security"},
    {"q": "What is a 'pixel'?", "a": "The smallest dot of light on a screen; millions of them make up an image.", "category": "Basics"},
    {"q": "What does 'bandwidth' limit?", "a": "How much data can move through a connection at once — the width of the pipe.", "category": "Network"},
    {"q": "What is 'virtual memory'?", "a": "Using disk space as extra RAM when physical memory runs low.", "category": "Software"},
    {"q": "What does 'compile' mean?", "a": "To translate human-written code into machine code the CPU can run.", "category": "Software"},
    {"q": "What is a 'daemon'?", "a": "A background process that quietly handles printing, updates, or network tasks.", "category": "Software"},
    {"q": "What does 'ping' test?", "a": "Whether a device is reachable on the network and how long the round trip takes.", "category": "Network"},
]
TRIVIA_EXTRA = [
    {"q": "What does 'CRC' check?", "a": "A checksum that detects accidental corruption in stored or transmitted data.", "category": "Basics"},
    {"q": "What is 'endianness'?", "a": "The byte order a chip uses to store multi-byte numbers — big-endian vs little-endian.", "category": "Hardware"},
    {"q": "What does 'grep' do?", "a": "Searches text for lines matching a pattern — a staple of the command line.", "category": "Software"},
    {"q": "What is a 'kernel module'?", "a": "A piece of code loaded into the OS core on demand to add driver or filesystem support.", "category": "Software"},
    {"q": "What does 'TTL' mean in networking?", "a": "Time To Live — how many hops a packet may take before routers drop it.", "category": "Network"},
    {"q": "What is 'lossless' compression?", "a": "Shrinking a file (like ZIP or FLAC) with zero loss of original data.", "category": "Basics"},
    {"q": "What does 'MAC address' identify?", "a": "The unique hardware ID burned into a network card — unlike an IP, it doesn't change.", "category": "Network"},
    {"q": "What is 'containerization'?", "a": "Packaging an app with its dependencies so it runs the same anywhere, like Docker.", "category": "Software"},
    {"q": "What does 'UPS' stand for in a server room?", "a": "Uninterruptible Power Supply — a battery that keeps gear running through a flicker.", "category": "Hardware"},
    {"q": "What is 'two-factor authentication'?", "a": "A second proof of identity (like a code) beyond your password, so a leaked password isn't enough.", "category": "Security"},
]

# -----------------------------------------------------------------------------
# POLLS pool (12; refreshed ONLY on Sunday). Never-repeat cursor.
# -----------------------------------------------------------------------------
POLLS = [
    {"question": "What's your biggest tech headache right now?",
     "options": [{"id": "slow", "label": "Sluggish, slow computer"}, {"id": "virus", "label": "Virus / pop-ups"},
                 {"id": "wifi", "label": "Wi-Fi that drops"}, {"id": "data", "label": "Scared I'll lose my files"},
                 {"id": "mac", "label": "My Mac needs help"}]},
    {"question": "How do you back up your photos and files?",
     "options": [{"id": "auto", "label": "Automatic cloud backup"}, {"id": "drive", "label": "External drive"},
                 {"id": "none", "label": "I don't (yet)"}, {"id": "unsure", "label": "Not sure how"}]},
    {"question": "Which upgrade would help you most?",
     "options": [{"id": "ssd", "label": "Faster SSD"}, {"id": "ram", "label": "More RAM"},
                 {"id": "net", "label": "Better Wi-Fi"}, {"id": "clean", "label": "A good cleanup"}]},
    {"question": "Windows, Mac, or both?",
     "options": [{"id": "win", "label": "Windows"}, {"id": "mac", "label": "Mac"},
                 {"id": "both", "label": "Both"}, {"id": "chrome", "label": "Chromebook"}]},
    {"question": "How old is your main computer?",
     "options": [{"id": "lt1", "label": "Under 1 year"}, {"id": "1to3", "label": "1–3 years"},
                 {"id": "3to5", "label": "3–5 years"}, {"id": "gt5", "label": "5+ years"}]},
    {"question": "Biggest reason you put off computer help?",
     "options": [{"id": "cost", "label": "Worried about cost"}, {"id": "time", "label": "No time"},
                 {"id": "trust", "label": "Don't trust shops"}, {"id": "diy", "label": "I'll fix it myself"}]},
    {"question": "What do you mostly use your computer for?",
     "options": [{"id": "email", "label": "Email & web"}, {"id": "work", "label": "Work / school"},
                 {"id": "photo", "label": "Photos & videos"}, {"id": "game", "label": "Gaming"}]},
    {"question": "How's your Wi-Fi at home?",
     "options": [{"id": "great", "label": "Rock solid"}, {"id": "spots", "label": "A few dead spots"},
                 {"id": "drops", "label": "Drops daily"}, {"id": "hotspot", "label": "I use my phone"}]},
    {"question": "Have you ever been phished?",
     "options": [{"id": "yes", "label": "Yes, I fell for one"}, {"id": "maybe", "label": "Maybe — not sure"},
                 {"id": "no", "label": "No, I'm careful"}, {"id": "what", "label": "What's phishing?"}]},
    {"question": "Would a yearly 'computer tune-up' interest you?",
     "options": [{"id": "yes", "label": "Yes, sign me up"}, {"id": "maybe", "label": "Depends on price"},
                 {"id": "diy", "label": "I do it myself"}, {"id": "never", "label": "Not really"}]},
    {"question": "What scares you most about your PC?",
     "options": [{"id": "lose", "label": "Losing my files"}, {"id": "hack", "label": "Getting hacked"},
                 {"id": "slow", "label": "It dying suddenly"}, {"id": "cost", "label": "A big repair bill"}]},
    {"question": "Best time for a house call?",
     "options": [{"id": "morning", "label": "Morning"}, {"id": "after5", "label": "After 5 PM"},
                 {"id": "weekend", "label": "Weekend"}, {"id": "drop", "label": "I'll drop it off"}]},
]
POLLS_EXTRA = [
    {"question": "Do you know your Microsoft account password?",
     "options": [{"id": "yes", "label": "Yes, for sure"}, {"id": "reset", "label": "I'd have to reset it"},
                 {"id": "no", "label": "No idea"}, {"id": "shared", "label": "It's shared/family"}]},
    {"question": "How do you feel about AI features in your apps?",
     "options": [{"id": "love", "label": "Love them"}, {"id": "wary", "label": "A bit wary"},
                 {"id": "confused", "label": "Confused by them"}, {"id": "off", "label": "Turn them off"}]},
    {"question": "Which AI tool do you use most for everyday questions? (Stack Overflow 2024: ChatGPT 82%, Copilot 41%, Gemini 24%)",
     "options": [{"id": "chatgpt", "label": "ChatGPT"}, {"id": "copilot", "label": "GitHub Copilot"},
                 {"id": "gemini", "label": "Google Gemini"}, {"id": "other", "label": "Another / none"}]},
    {"question": "What's your main OS for personal use? (Stack Overflow 2024: Windows 59%, macOS 32%, Linux 28%+)",
     "options": [{"id": "win", "label": "Windows"}, {"id": "mac", "label": "macOS"},
                 {"id": "linux", "label": "Linux (Ubuntu, etc.)"}, {"id": "other", "label": "ChromeOS / other"}]},
]

FLOOR_WORDS = 40
FLOOR_TRIVIA = 40
FLOOR_PUZZLES = 12
FLOOR_POLLS = 10

def norm(s):
    return "".join(ch for ch in s.lower() if ch.isalnum())

def refill(pool, extra, floor, key):
    if len(pool) >= floor:
        return pool
    seen = {norm(x.get(key, "")) for x in pool}
    for x in extra:
        if norm(x.get(key, "")) not in seen:
            pool.append(x)
            seen.add(norm(x.get(key, "")))
    return pool

def this_sunday(d):
    """ISO date of the Sunday of the week containing d (Sun=0)."""
    sun = d - datetime.timedelta(days=d.weekday() + 1 if d.weekday() != 6 else 0)
    return sun

def main():
    today = datetime.date.today()
    today_iso = today.isoformat()
    is_sunday = (today.weekday() == 6)
    sun_iso = this_sunday(today).isoformat()
    report = []

    # ---- WORD OF THE DAY ----
    words = refill(list(WORDS), WORDS_EXTRA, FLOOR_WORDS, "word")
    save_json(os.path.join(DATA, "words.json"), {"words": words})
    w, wi = cursor_pick(words, os.path.join(DATA, "word_state.json"), today_iso)
    tw = dict(w); tw["date"] = today_iso
    save_json(os.path.join(DATA, "today_word.json"), tw)
    report.append(f"WORD: '{w['word']}' (idx {wi}/{len(words)-1})")

    # ---- CROSSWORD ----
    puzzles = build_puzzles()
    if len(puzzles) < FLOOR_PUZZLES:
        raise RuntimeError(f"crossword pool too small: {len(puzzles)}")
    save_json(os.path.join(DATA, "crosswords.json"), {"puzzles": puzzles})
    cw, ci = cursor_pick(puzzles, os.path.join(DATA, "crossword_state.json"), today_iso)
    tcw = dict(cw); tcw["date"] = today_iso
    save_json(os.path.join(DATA, "today_crossword.json"), tcw)
    report.append(f"CROSSWORD: '{cw['title']}' ({cw['size']}x{cw['size']}, idx {ci}/{len(puzzles)-1})")

    # ---- TRIVIA ----
    trivia = refill(list(TRIVIA), TRIVIA_EXTRA, FLOOR_TRIVIA, "q")
    save_json(os.path.join(DATA, "trivia.json"), {"trivia": trivia})
    t, ti = cursor_pick(trivia, os.path.join(DATA, "trivia_state.json"), today_iso)
    tt = dict(t); tt["date"] = today_iso
    save_json(os.path.join(DATA, "today_trivia.json"), tt)
    report.append(f"TRIVIA: '{t['q'][:40]}…' (idx {ti}/{len(trivia)-1})")

    # ---- POLL (Sunday-only refresh; never-repeat) ----
    polls = refill(list(POLLS), POLLS_EXTRA, FLOOR_POLLS, "question")
    poll_path = os.path.join(DATA, "poll.json")
    cur = load_json(poll_path) or {}
    if is_sunday:
        p, pi = cursor_pick(polls, os.path.join(DATA, "poll_state.json"), today_iso)
        new_poll = {"poll": {"weekOf": sun_iso, "question": p["question"], "options": p["options"]}}
        save_json(poll_path, new_poll)
        report.append(f"POLL: NEW (Sunday) '{p['question'][:40]}…' weekOf={sun_iso} (idx {pi}/{len(polls)-1})")
    else:
        # Not Sunday: keep the current poll, but fix weekOf hygiene (must be a Sunday).
        if cur.get("poll", {}).get("weekOf") and not cur["poll"]["weekOf"].endswith(_sunday_of(cur["poll"]["weekOf"])):
            cur["poll"]["weekOf"] = _nearest_sunday_iso(cur["poll"].get("weekOf"))
            save_json(poll_path, cur)
        report.append(f"POLL: unchanged (not Sunday) weekOf={cur.get('poll',{}).get('weekOf')}")

    print("OK " + today_iso)
    for r in report:
        print("  " + r)

def _sunday_of(iso):
    """Return the Sunday ISO of the week containing iso (helper for hygiene check)."""
    d = datetime.date.fromisoformat(iso)
    return this_sunday(d).isoformat()

def _nearest_sunday_iso(iso):
    try:
        d = datetime.date.fromisoformat(iso)
    except Exception:
        return this_sunday(datetime.date.today()).isoformat()
    return this_sunday(d).isoformat()

if __name__ == "__main__":
    main()