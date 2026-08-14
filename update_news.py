#!/usr/bin/env python3
"""
update_news.py — Append an approved News/Updates entry to data/news.json
Used by the daily newsletter cron AFTER John approves the day's content.

USAGE
  # From a newsletter markdown file (auto-extracts title/date/summary):
  python3 update_news.py --from-newsletter "Daily/Newsletter - 2026-07-12-0957.md" \
                         --comic "Newsletter - 2026-07-12-0957-comic-square.png" \
                         --type newsletter

  # From explicit Onyx Tech Notes fields:
  python3 update_news.py --type tech-note --title "..." --date 2026-07-12 \
                         --summary "..." --tag "Offer" --cta-label "Book now" \
                         --cta-href "tel:+13867557772"

  # Optional: commit + push to GitHub after updating
  --git-push            # only if remote + PAT present; otherwise skipped with warning

SAFETY
  - Never overwrites existing entries with the same `id`.
  - Caps the feed at --max (default 12); oldest trimmed.
  - Writes atomically (temp file + rename).
"""
import argparse, json, os, re, sys, tempfile, datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
NEWS_PATH = os.path.join(ROOT, "data", "news.json")
MAX_ITEMS = 12

def load_news():
    if os.path.exists(NEWS_PATH):
        with open(NEWS_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"updated": "", "items": []}

def save_news(data):
    data["updated"] = datetime.date.today().isoformat()
    tmp = NEWS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, NEWS_PATH)

def parse_newsletter(path):
    txt = open(path, encoding="utf-8").read()
    fm = re.search(r"^---\n(.*?)\n---", txt, re.S)
    title = date = None
    if fm:
        for line in fm.group(1).splitlines():
            if line.startswith("title:"):
                title = line.split(":", 1)[1].strip().strip('"')
            if line.startswith("date:"):
                date = line.split(":", 1)[1].strip()
    if not date:
        m = re.search(r"(\d{4}-\d{2}-\d{2})", path)
        date = m.group(1) if m else datetime.date.today().isoformat()
    # Strip the frontmatter so its key: value lines (e.g. a long `title:`) can never
    # be mistaken for the summary paragraph.
    if fm:
        txt = txt[fm.end():]
    # summary = first paragraph after the alert banner
    paras = [p.strip() for p in txt.split("\n") if p.strip() and not p.startswith("!") and not p.startswith("---")]
    summary = ""
    for p in paras:
        if len(p) > 40 and "ONYX SYSTEMS" not in p and "Serving" not in p:
            summary = p[:280]
            break
    comic = None
    cm = re.search(r"!\[Far Side Comic\]\(([^)]+)\)", txt)
    if cm:
        comic = os.path.basename(cm.group(1))
    return {
        "title": title or "Daily Tech Brief",
        "date": date,
        "summary": summary,
        "comic": comic,
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", required=True, choices=["newsletter", "tech-note"])
    ap.add_argument("--from-newsletter")
    ap.add_argument("--title"); ap.add_argument("--date")
    ap.add_argument("--summary"); ap.add_argument("--tag")
    ap.add_argument("--comic")
    ap.add_argument("--id-suffix", help="unique per-post suffix so multiple same-day tech-notes don't collide")
    ap.add_argument("--cta-label"); ap.add_argument("--cta-href")
    ap.add_argument("--read-more", default="https://onyxpc.us/#contact")
    ap.add_argument("--max", type=int, default=MAX_ITEMS)
    ap.add_argument("--git-push", action="store_true")
    args = ap.parse_args()

    data = load_news()
    items = data.get("items", [])

    if args.from_newsletter:
        meta = parse_newsletter(args.from_newsletter)
        title = meta["title"]; date = meta["date"]; summary = meta["summary"]
        comic = args.comic or meta["comic"]
    else:
        title = args.title; date = args.date or datetime.date.today().isoformat(); summary = args.summary
        comic = args.comic

    if not title or not summary:
        sys.exit("ERROR: need --title/--summary or --from-newsletter")

    eid = f"{args.type[:1]}-{date}"
    # Allow an explicit per-post id suffix so multiple same-day tech-notes don't collide.
    if args.id_suffix:
        eid = f"{eid}-{args.id_suffix}"
    if any(it.get("id") == eid for it in items):
        print(f"SKIP: entry id={eid} already exists")
        return

    entry = {
        "id": eid,
        "type": args.type,
        "date": date,
        "title": title,
        "tag": args.tag or ("Daily Brief" if args.type == "newsletter" else "Tech Note"),
        "summary": summary,
    }
    if comic:
        entry["comic"] = comic
    if args.type == "newsletter":
        entry["readMore"] = args.read_more
    if args.cta_label and args.cta_href:
        entry["cta"] = {"label": args.cta_label, "href": args.cta_href}

    items.append(entry)
    # newest first, cap
    items.sort(key=lambda x: x["date"], reverse=True)
    data["items"] = items[:args.max]
    save_news(data)
    print(f"OK: added {eid} (now {len(data['items'])} items)")

    if args.git_push:
        try:
            import subprocess
            subprocess.run(["git", "-C", ROOT, "add", "data/news.json"], check=True)
            subprocess.run(["git", "-C", ROOT, "commit", "-m", f"news: {eid}"], check=True)
            subprocess.run(["git", "-C", ROOT, "push"], check=True)
            print("PUSHED to GitHub")
        except Exception as e:
            print(f"WARN: git push skipped: {e}")

if __name__ == "__main__":
    main()
