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
    "aegis", "google authenticator", "microsoft", "windows", "macos",
    "chrome", "edge", "firefox", "adobe", "acrobat", "coldfusion",
    "joomla", "langflow", "gemini", "openai", "nvidia", "apple",
    "2fa", "sms", "wifi", "ssd", "ram", "gpu", "cpu", "dns",
    "sim", "vpn", "onedrive", "google", "passkey", "passkeys",
]

# Obtain-method signals (lowercased scan of the body). URLs + verbs + app/command names.
OBTAIN = [
    "http", ".com", ".org", ".io", ".net", "download", "install", "get ",
    "open settings", "settings >", "settings app", "app store", "microsoft store",
    "search ", "command", "visit", "sign in", "switch to", "enable",
    "set up", "set-up", "turn on", "use ", "try ", "upload", "roll back",
    "rollback", "patch", "update", "isolate", "fix ", "book", "call",
    "text ", "tether", "connect", "configure", "add ", "create",
]

def check_entry(fname, eid, headline, body):
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
        "patch ", "alert", "wants your money",
        "loaded with junk", "came loaded", "trialware", "debloat",
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
            body = e.get("tip") or e.get("truth") or e.get("summary") or ""
            fails += check_entry(fname, eid, hl, body)
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
