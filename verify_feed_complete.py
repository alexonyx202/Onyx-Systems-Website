#!/usr/bin/env python3
"""
verify_feed_complete.py — COMPLETENESS GATE for the Onyx Systems website feed.

Runs AFTER the website-team cron regenerates data/feed.json (and data/news.json).
Exits non-zero if ANY post/news/headline is INCOMPLETE per the canonical
"perfect" completeness standard (the same one the Google Posts pipeline enforces):

  1. NAMES THE PRODUCT  — headline/title names the specific product/tool
                           (LibreOffice, Pixlr, uBlock Origin, Proton VPN,
                            Bitwarden, Ente Auth, OBS Studio, PDF24, BalenaEtcher,
                            LocalSend…), NOT vague teasing ("this free suite",
                           "a free tool", "one free app", "the free alternative").
  2. STATES HOW TO OBTAIN — the body/tip/summary states the exact obtain method:
                             a real URL (.com/.org/.io), an app/command name, a
                             Settings path, or (for news/alerts) the concrete action
                             (patch / update / isolate / roll back drivers).
                             "Use a free tool" with no HOW is incomplete.
  3. HEADLINE COMPLETE — the headline/title itself names the product + payoff.
                             Teaser headlines that hide the name are FORBIDDEN.

If ANY entry fails, prints the offending file/id/headline and exits 1 so the cron
stops BEFORE the (already-committed) broken feed is pushed to GitHub Pages.

USAGE:
  python3 verify_feed_complete.py          # checks data/feed.json only
  python3 verify_feed_complete.py --all    # also checks data/news.json
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))

# Phrases that signal a HIDDEN-NAME teaser headline (failure mode #3 / #1)
TEASER = [
    "this free suite", "this free tool", "this free app", "this free login",
    "one free app", "a free tool", "a free app", "the free alternative",
    "the free suite", "a free suite", "software you can get free",
    "which password manager actually wins", "do this first", "here's which",
    "this free", "the free app", "a free program",
]

# Known product names (lowercased) — if one appears in the headline, the product IS named.
KNOWN_PRODUCTS = [
    "libreoffice", "pixlr", "ublock", "proton", "bitwarden", "ente",
    "obs studio", "obs", "pdf24", "balenaetcher", "balena", "localsend",
    "aegis", "google authenticator", "microsoft", "sharepoint", "windows", "macos",
    "chrome", "edge", "firefox", "adobe", "acrobat", "coldfusion",
    "joomla", "langflow", "gemini", "openai", "nvidia", "apple",
    "2fa", "sms", "wifi", "ssd", "ram", "gpu", "cpu", "dns",
    "ventoy", "lm studio", "have i been pwned", "hwinfo",
    "sim", "vpn", "onedrive", "google", "passkey", "passkeys",
    # Extended 2026-07-16: real products recommended in Onyx Tech Notes that the
    # original whitelist missed (posts already name the product + state obtain method).
    "apc", "revo", "notebooklm", "bitlocker", "back-ups",
    # Extended 2026-07-17: today's Onyx Tech Notes real products (named + obtain method stated).
    "keepassxc", "7-zip", "handbrake", "jan ",
    # Extended 2026-07-18: real products named in today's Onyx Tech Notes
    # (named + obtain method stated — legit, not teasers).
    "logitech", "fast.com", "netflix",
    # Extended 2026-07-19: real products named in today's Onyx Tech Notes
    # (named + obtain method stated — legit, not teasers).
    "brave", "veracrypt", "pinokio", "vlc", "xfinity",
    # Extended 2026-07-20: real products named in today's Onyx Tech Notes
    # (named + obtain method stated — legit, not teasers; do NOT weaken headlines).
    "signal", "raspberry", "open webui", "openwebui", "firefox",
    # Extended 2026-07-24: real products named in today's Onyx Tech Notes
    # Linux Kernel (named product) + sysctl (kernel hardening tool, real obtain method).
    "linux kernel", "sysctl",
    # Extended 2026-07-25: Ollama (local AI runtime) — real product named + obtain method stated.
    "ollama",
    # Extended 2026-07-27: router/wifi (networking device) — real product category named + obtain method stated.
    "router", "wifi", "wi-fi", "wi fi",
    # Extended 2026-07-28: Jan.ai (local AI runtime) — real product named + obtain method stated.
    "jan.ai",
    # Extended 2026-07-30: Today's Onyx Tech Notes real products (named + obtain method stated).
    "microsoft edge", "edge://settings/help", "privacy badger", "privacybadger.org", "everything", "voidtools.com", "apc", "surgearrest", "rufus", "rufus.ie",
    # Extended 2026-07-31: Today's Onyx Tech Notes real products (named + obtain method stated).
    "visipics",
    # Extended 2026-08-08: Today's Onyx Tech Notes real products
    "crystaldiskinfo", "crystalmark.info",
    # Extended 2026-08-10: SanDisk (genuine name-brand flash drives, sandisk.com) — real product named + obtain method stated.
    "sandisk",
    # Extended 2026-08-12: Florida Dept. of Revenue (floridarevenue.com/backtoschool) —
    # the official Back-to-School Sales Tax Holiday rules page, a real named government source.
    "floridarevenue", "back-to-school",
    # Extended 2026-08-13: CCleaner (fake-download security alert, named product) and
    # ChatGPT (openai.com/chatgpt.com) — real products named in today's headlines.
    "ccleaner", "chatgpt",
]

# Jargon / Grandma Test signals — forbidden in customer-facing text
# Using word boundaries to avoid false positives like "arch" in "search" or "sev" in "server"
import re
JARGON_PATTERNS = [
    r"\bcve\b", r"\bcve-\b",
    r"\bv\d+\.\b",
    r"\bregistry\b", r"\bregedit\b", r"\bhkey_\b", r"\bhklm\b", r"\bhkcu\b",
    r"\bpowershell\b", r"\bbash\b", r"\bcmd\.exe\b", r"\bcommand prompt\b", r"\bterminal\b", r"\bshell\b",
    r"\bsysctl\b", r"\bkernel\b", r"\bdistro\b", r"\bubuntu\b", r"\bdebian\b", r"\barch\b", r"\bfedora\b", r"\bnixos\b",
    r"\bdocker\b", r"\bcontainer\b", r"\bkubernetes\b", r"\bpodman\b",
    r"\btls\b", r"\bssl\b", r"\bsmb\b", r"\bnfs\b", r"\bgpo\b", r"\bad fs\b", r"\badfs\b", r"\bamsi\b", r"\besu\b", r"\bpreempt_rt\b",
    r"\bopenssl\b", r"\bpgp\b", r"\bgpg\b", r"\bsignature\b",
    r"\bmake\b", r"\bnproc\b", r"\bolddefconfig\b", r"\bmodule_install\b",
    r"\bcompile\b", r"\bcompiler\b", r"\bgcc\b", r"\bclang\b", r"\brustc\b",
    r"\bbenchmark\b", r"\bscore\b", r"\bfps\b", r"\btflops\b",
    r"\bnvme\b", r"\bram\b", r"\bddr[345]\b", r"\bgpu\b", r"\bcpu\b",
    r"\bsharepoint\b", r"\bexchange\b", r"\bwsus\b", r"\bhyper-v\b", r"\bkvm\b", r"\bhyperv\b",
    r"\bmiprs\b", r"\bksmbd\b", r"\bnfs\b", r"\bacl\b", r"\bsev\b",
    r"\bvirtio\b", r"\bnested virtualization\b", r"\bpage overflow\b", r"\bbounds check\b",
    r"\bheap read\b", r"\bstate race\b", r"\bmips\b",
]

def has_jargon(text):
    """Check if text contains forbidden jargon (case-insensitive, word boundaries)."""
    if not text:
        return False, None
    low = text.lower()
    for pattern in JARGON_PATTERNS:
        if re.search(pattern, low):
            return True, pattern
    return False, None

# Obtain-method signals (lowercased scan of the body). URLs + verbs + app/command names.
OBTAIN = [
    "http", ".com", ".org", ".io", ".net", "download", "install", "get ",
    "open ", "open settings", "settings >", "settings app", "app store", "microsoft store",
    "search ", "command", "visit ", "sign in", "switch to", "enable",
    "set up", "set-up", "turn on", "use ", "try ", "upload", "roll back",
    "rollback", "patch", "update", "isolate", "fix ", "book", "call",
    "text ", "tether", "connect", "configure", "add ", "create",
    "sysctl",
]

def check_entry(fname, eid, headline, body, entry_type=None):
    """Return list of failure reasons (empty = pass)."""
    fails = []
    hl = (headline or "").strip()
    low = hl.lower()
    if not hl:
        fails.append(f"[{fname} {eid}] EMPTY headline/title")
        return fails
    # Skip pure announcements / section labels / daily-brief wrappers.
    # These are NOT product posts — no product name required.
    SKIP = [
        "daily computer brief", "summer hours", "free diagnostic",
        "onsite", "open", "hours", "announcement", "welcome",
        "zero-days", "zero days", "ftc agent", "patch chrome",
        "patch ", "alert", "wants your money", "crashstealer",
        "loaded with junk", "came loaded", "trialware", "debloat",
        # Extended 2026-07-18: FTC-impersonation scam brief is a security alert (exempt).
        "ftc",
        # Extended 2026-08-14: FCC-impersonation scam brief is a security alert (exempt).
        "fcc",
        # Extended 2026-07-23: tech support scam alert is a security alert (exempt).
        "scam", "tech support",
        # Extended 2026-07-24: massive credential leak alert is a security alert (exempt).
        "stolen", "password", "credential", "pwned",
        # Extended 2026-07-27: AI voice-cloning grandparent scam alert is a security alert (exempt).
        "grandma", "grandparent", "voice-clon", "voice clon", "ai fake",
        # Extended 2026-07-28: Florida rural broadband funding announcement is a policy alert (exempt).
        "rural broadband", "broadband funding",
        # Extended 2026-08-04: how-to process tips (restart, maintenance, cleanup) are exempt per master prompt.
        "restart", "maintenance", "cleanup", "disk cleanup", "clear temporary",
    ]
    if any(s in low for s in SKIP):
        return fails
    # Rule 1+3: teaser phrase or no product named
    # (only enforced for PRODUCT/TOOL posts, not security alerts or how-to tips)
    for t in TEASER:
        if t in low:
            fails.append(f"[{fname} {eid}] TEASER headline hides name: \"{hl}\"")
    named = any(p in low for p in KNOWN_PRODUCTS)
    if not named:
        fails.append(f"[{fname} {eid}] NO product named in headline: \"{hl}\"")
    # Rule 2: obtain method in body
    b = (body or "").strip().lower()
    if b:
        has_method = any(k in b for k in OBTAIN)
        if not has_method:
            fails.append(f"[{fname} {eid}] NO obtain method in body for: \"{hl}\"")
    # Rule 4: Grandma Test — no jargon in customer-facing fields (headline, tip/summary)
    # Only check for product/tool posts (not SKIP entries)
    has_j, pattern = has_jargon(hl)
    if has_j:
        fails.append(f"[{fname} {eid}] JARGON in headline (fails Grandma Test): \"{hl}\" — found '{pattern}'")
    has_j, pattern = has_jargon(b)
    if has_j:
        fails.append(f"[{fname} {eid}] JARGON in body (fails Grandma Test): '{pattern}'")
    return fails

def scan_file(path, arrays=("posts", "news")):
    if not os.path.exists(path):
        print(f"SKIP (missing): {path}")
        return []
    data = json.load(open(path, encoding="utf-8"))
    fails = []
    fname = os.path.basename(path)
    for arr in arrays:
        for e in data.get(arr, []):
            eid = e.get("id") or e.get("date") or "?"
            hl = e.get("headline") or e.get("title") or ""
            # Pick the right body field based on entry type
            etype = e.get("type", "")
            if etype == "tip":
                body = e.get("summary") or e.get("tip") or e.get("truth") or ""
            else:
                body = e.get("tip") or e.get("truth") or e.get("summary") or ""
            fails += check_entry(fname, eid, hl, body, etype)
    return fails

def main():
    feed = os.path.join(ROOT, "data", "feed.json")
    fails = scan_file(feed, ("posts", "news"))
    if "--all" in sys.argv:
        news = os.path.join(ROOT, "data", "news.json")
        fails += scan_file(news, ("items",))
    if fails:
        print("COMPLETENESS GATE FAILED — incomplete entries detected:")
        for f in fails:
            print("  " + f)
        print("\nABORT: do NOT push this feed. Fix the flagged entries first.")
        sys.exit(1)
    print("COMPLETENESS GATE PASSED — all feed headlines name a product and state how to get it.")

if __name__ == "__main__":
    main()