#!/usr/bin/env python3
"""
update_feed.py — Update data/feed.json from S2 output file.
Usage: python3 update_feed.py --date 2026-07-25
"""
import json, argparse, os, sys
from datetime import date

def load_json(path):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None

def save_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=date.today().isoformat())
    args = ap.parse_args()
    d = args.date

    # Load current feed
    feed = load_json("data/feed.json") or {"site": {}, "news": [], "posts": [], "reviews": []}

    # ---- Load S2 output ----
    s2_path = f"/tmp/onyx_posts_{d}.json"
    s2_posts = load_json(s2_path)
    if not s2_posts:
        print(f"WARNING: S2 output not found at {s2_path}")
        s2_posts = []

    # ---- Today's newsletter entry (from newsletter) ----
    # This would normally come from the newsletter pointer file
    # For now we keep the existing pattern but the S2 posts are the main source
    # We'll just ensure we don't duplicate today's newsletter entry
    feed['news'] = [n for n in feed['news'] if not (n.get('date') == d and n.get('id') == f'news-{d}')]

    # ---- Add S2 posts (news + tip) ----
    for p in s2_posts:
        # Remove any existing with same id
        feed['posts'] = [x for x in feed['posts'] if x.get('id') != p.get('id')]
        # Build entry from S2 format (type, headline, tip/truth/summary, tags)
        entry = {
            "id": p.get("id", f"onyx-{d}-{p.get('type', 'news')}-auto"),
            "type": p.get("type", "news"),
            "date": d,
        }
        if p.get("type") == "news":
            entry["title"] = p.get("headline") or p.get("title") or ""
            entry["tag"] = p.get("tag") or "Tech Note"
            entry["summary"] = p.get("tip") or p.get("summary") or ""
            entry["truth"] = p.get("truth") or ""
        elif p.get("type") == "tip":
            entry["title"] = p.get("headline") or p.get("title") or ""
            entry["tag"] = p.get("tag") or "Tech Tip"
            entry["summary"] = p.get("tip") or p.get("summary") or ""
            entry["truth"] = p.get("truth") or ""
        if p.get("tags"):
            entry["tags"] = p.get("tags")
        if p.get("cta"):
            entry["cta"] = p.get("cta")
        feed['posts'].insert(0, entry)

    # Cap posts to 8
    feed['posts'] = feed['posts'][:8]

    # Cap news to 6
    feed['news'] = feed['news'][:6]

    # Update timestamp
    feed['updated'] = d

    # Save
    save_json("data/feed.json", feed)
    print(f"feed.json updated for {d}")
    print(f"news count: {len(feed['news'])}")
    print(f"posts count: {len(feed['posts'])}")

if __name__ == "__main__":
    main()