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
        ptype = p.get("type", "news")
        target = p.get("target_array", "posts")
        
        # Remove any existing with same id (if provided)
        pid = p.get("id")
        if pid:
            if target == "news":
                feed['news'] = [x for x in feed['news'] if x.get('id') != pid]
            else:
                feed['posts'] = [x for x in feed['posts'] if x.get('id') != pid]
        
        # Also deduplicate by headline/title (content-based, in case IDs differ but content is same)
        headline = p.get("headline") or p.get("title") or ""
        if headline:
            if target == "news":
                feed['news'] = [x for x in feed['news'] if x.get('title') != headline]
            else:
                feed['posts'] = [x for x in feed['posts'] if x.get('title') != headline]
        
        # Build entry from S2 format
        entry = {}
        if ptype == "newsletter":
            # Daily-Brief summary post -> goes to news[]
            entry = {
                "id": pid or f"onyx-{d}-daily-brief-auto",
                "type": "newsletter",
                "date": d,
                "title": p.get("headline") or p.get("title") or "",
                "tag": p.get("tag") or "Daily Brief",
                "excerpt": p.get("tip") or p.get("summary") or "",
            }
            if p.get("tags"):
                entry["tags"] = p.get("tags")
            if p.get("cta"):
                entry["cta"] = p.get("cta")
            feed['news'].insert(0, entry)
        elif ptype == "news":
            # Tech note news -> goes to posts[]
            entry = {
                "id": pid or f"onyx-{d}-news-{len(feed['posts'])+1}",
                "type": "news",
                "date": d,
                "title": p.get("headline") or p.get("title") or "",
                "tag": p.get("tag") or "Tech Note",
                "summary": p.get("tip") or p.get("summary") or "",
                "truth": p.get("truth") or "",
            }
            if p.get("tags"):
                entry["tags"] = p.get("tags")
            if p.get("cta"):
                entry["cta"] = p.get("cta")
            feed['posts'].insert(0, entry)
        elif ptype == "tip":
            # Tech tip -> goes to posts[]
            entry = {
                "id": pid or f"onyx-{d}-tip-{len(feed['posts'])+1}",
                "type": "tip",
                "date": d,
                "title": p.get("headline") or p.get("title") or "",
                "tag": p.get("tag") or "Tech Tip",
                "summary": p.get("tip") or p.get("summary") or "",
                "truth": p.get("truth") or "",
            }
            if p.get("tags"):
                entry["tags"] = p.get("tags")
            if p.get("cta"):
                entry["cta"] = p.get("cta")
            feed['posts'].insert(0, entry)

    # Cap news to 5 (newest first - already sorted by insert(0))
    feed['news'] = feed['news'][:5]

    # Cap posts by type: 5 news + 5 tips = 10 max
    news_posts = [p for p in feed['posts'] if p.get('type') == 'news']
    tip_posts = [p for p in feed['posts'] if p.get('type') == 'tip']
    feed['posts'] = news_posts[:5] + tip_posts[:5]

    # Update timestamp
    feed['updated'] = d

    # Save
    save_json("data/feed.json", feed)
    print(f"feed.json updated for {d}")
    print(f"news count: {len(feed['news'])}")
    print(f"posts count: {len(feed['posts'])}")

if __name__ == "__main__":
    main()