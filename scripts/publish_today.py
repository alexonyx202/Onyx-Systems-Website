#!/usr/bin/env python3
"""
publish_today.py — deterministic daily website publish for Onyx Systems (onyxpc.us).

Encodes the mechanical half of the 08:45 publishing job so the agent's turn is only a
thin verify step. Runs, in order:

  1. git checkout main + pull --rebase
  2. daily widget generators:  scripts/daily_fun.py + scripts/joke_daily.py (idempotent)
  3. render the Daily Brief:    scripts/build_newsletter_html.py <DATE>
  4. copy the Far Side comic + convert the composite/comic-square PNGs to JPEG
  5. import today's News & Tips into data/feed.json + data/news.json
     (mechanically extracted from the emailed newsletter + Onyx Tech Notes markdown)
  6. prune past events from data/events.json
  7. completeness gate:         verify_feed_complete.py --all (exit 0 required)
  8. (with --push) commit + push origin main

Default behavior (no --push) does steps 1-7 and STOPS, printing the extracted feed/news
entries so a reviewer can fix wording/selection before anything ships. Then:

  python3 scripts/publish_today.py --verify-only --push

re-runs only the completeness gate + commit/push, preserving any hand-edits.

CLI:
  python3 scripts/publish_today.py [--date YYYY-MM-DD] [--push] [--verify-only]

Extraction rules (deterministic — review, don't trust blindly):
  - Daily Brief summary post (news[])  <- newsletter frontmatter title + 🔴 ALERT body
  - News post (posts[], type=news)     <- tech notes Post 1 (headline / The Tip / truth)
  - Tip post  (posts[], type=tip)      <- tech notes Post 2 (headline / The Tip / truth)
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

VAULT = Path("/home/ai/Documents/Obsidian Vault")
REPO = Path("/home/ai/onyx-systems-website")  # symlink -> OnyxSystems-Website
DAILY = VAULT / "Daily"
POSTS = VAULT / "Posts"

BASE_TAGS = ["#OnyxSystems", "#LakeCityFL", "#ComputerRepair"]
NEWS_MAX = 5       # feed.json news[] cap
POSTS_NEWS_MAX = 5  # feed.json posts[] news cap
POSTS_TIP_MAX = 5   # feed.json posts[] tip cap
NEWS_JSON_MAX = 12  # data/news.json cap (matches update_news.py)


def _today_et():
    if ZoneInfo:
        return datetime.datetime.now(ZoneInfo("America/New_York")).date()
    return datetime.date.today()


def _run(cmd, cwd=None, check=True):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=check)


def _write_json(path, obj):
    tmp = str(path) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def _read_json(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return None


# ---------------------------------------------------------------------------
# markdown resolution + parsing
# ---------------------------------------------------------------------------

def resolve_newsletter(date_iso):
    ptr = DAILY / "last_sent_newsletter.json"
    if ptr.exists():
        try:
            p = json.loads(ptr.read_text(encoding="utf-8"))
            mp = p.get("md_path")
            if mp and date_iso in mp and Path(mp).exists():
                return Path(mp)
        except Exception:
            pass
    cands = sorted(DAILY.glob(f"Newsletter - {date_iso}*.md"))
    return cands[-1] if cands else None


def resolve_tech_notes(date_iso):
    cands = sorted(POSTS.glob(f"Onyx-Tech-Notes-{date_iso}*.md"))
    return cands[-1] if cands else None


def _frontmatter(md):
    m = re.search(r"^---\n(.*?)\n---", md, re.S)
    if not m:
        return {}
    fm = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip().strip('"')
    return fm


def _box_section(md, marker):
    """Body after a header line containing `marker`, up to the next ━━ header or ---."""
    idx = md.find(marker)
    if idx < 0:
        return ""
    nl = md.find("\n", idx)
    rest = md[nl + 1:] if nl > 0 else ""
    out = []
    for ln in rest.split("\n"):
        if ln.lstrip().startswith("━") or ln.strip() == "---" or set(ln.strip()) == {"-"}:
            break
        out.append(ln)
    return "\n".join(out).strip()


def _heading_section(body, heading):
    # Match ### Heading or **Heading:** (bold inline format)
    m = re.search(rf"^(?:###\s*{re.escape(heading)}\s*$|\*\*{re.escape(heading)}:?(?:\*\*|$))", body, re.M)
    if not m:
        return ""
    rest = body[m.end():]
    # Skip blank lines after the heading marker
    rest = re.sub(r"^\s*\n", "", rest)
    # End at next ###, next **Bold:**, or end of body
    nm = re.search(r"^(?:###\s+|\*\*[A-Z])", rest, re.M)
    end = nm.start() if nm else len(rest)
    return rest[:end].strip()


def _hashtags(body):
    tags = re.findall(r"(?:^|\s)(#\w+)", body)
    # Deduplicate while preserving order
    seen = set()
    out = []
    for t in tags:
        tl = t.lower()
        if tl not in seen:
            seen.add(tl)
            out.append(t)
    return out


def parse_newsletter(md_path):
    md = md_path.read_text(encoding="utf-8")
    fm = _frontmatter(md)
    alert = _box_section(md, "ALERT")
    alert = re.sub(r"\*Source:.*?\*", "", alert).strip()
    return {"title": fm.get("title", ""), "alert": alert}


def parse_tech_notes(md_path):
    md = md_path.read_text(encoding="utf-8")
    posts = []
    # Today's Onyx Tech Notes carry the headline on the `## Post N — <headline>` line
    # itself (no separate **Headline:** field), so capture it as group 2.
    for m in re.finditer(r"^##\s*Post\s+(\d+)\s*(?:[—–-]\s*)?(.*)$", md, re.M):
        start = m.end()
        headline = m.group(2).strip()
        nm = re.search(r"^##\s*Post\s+\d+\s*(?:[—–-]\s*)?.*$", md[start:], re.M)
        end = start + (nm.start() if nm else len(md[start:]))
        body = md[start:end]
        posts.append({
            "headline": headline or _heading_section(body, "Headline"),
            "tip": _heading_section(body, "The Tip"),
            "truth": _heading_section(body, "The Shop Owner's Truth"),
            "tags": _hashtags(body) or BASE_TAGS,
        })
    return posts


def build_entries(date_iso):
    nl_md = resolve_newsletter(date_iso)
    tn_md = resolve_tech_notes(date_iso)
    if not nl_md:
        raise SystemExit(f"ERROR: no newsletter markdown found for {date_iso}")
    if not tn_md:
        raise SystemExit(f"ERROR: no tech-notes markdown found for {date_iso}")
    nl = parse_newsletter(nl_md)
    tn = parse_tech_notes(tn_md)
    if not tn:
        raise SystemExit(f"ERROR: no posts parsed from {tn_md}")

    daily_brief = {
        "id": f"onyx-{date_iso}-daily-brief-auto",
        "type": "newsletter",
        "date": date_iso,
        "title": nl["title"] or f"Daily Computer Brief — {date_iso}",
        "tag": "Daily Brief",
        "excerpt": nl["alert"],
        "tags": BASE_TAGS + ["#DailyBrief"],
        "image": f"assets/img/news/{date_iso}-composite.jpg",
        "comic": f"assets/img/news/{date_iso}-comic-square.jpg",
        "read_more": "#contact",
    }

    news_src = tn[0]
    tip_src = tn[1] if len(tn) > 1 else tn[0]
    news_post = {
        "id": f"onyx-{date_iso}-post-1",
        "type": "news",
        "date": date_iso,
        "title": news_src["headline"],
        "tag": "Tech Note",
        "summary": news_src["tip"],
        "truth": news_src["truth"],
        "tags": news_src["tags"],
    }
    tip_post = {
        "id": f"onyx-{date_iso}-post-2",
        "type": "tip",
        "date": date_iso,
        "title": tip_src["headline"],
        "tag": "Tech Tip",
        "summary": tip_src["tip"],
        "truth": tip_src["truth"],
        "tags": tip_src["tags"],
    }
    return daily_brief, news_post, tip_post


# ---------------------------------------------------------------------------
# data updates (idempotent: dedupe by id, then prepend + cap)
# ---------------------------------------------------------------------------

def update_feed(daily_brief, news_post, tip_post):
    path = REPO / "data" / "feed.json"
    feed = _read_json(path) or {"site": {}, "news": [], "posts": [], "reviews": []}

    feed["news"] = [n for n in feed.get("news", []) if n.get("id") != daily_brief["id"]]
    feed["news"].insert(0, daily_brief)
    feed["news"] = feed["news"][:NEWS_MAX]

    posts = [p for p in feed.get("posts", []) if p.get("id") not in (news_post["id"], tip_post["id"])]
    news_group = [p for p in posts if p.get("type") == "news"]
    tip_group = [p for p in posts if p.get("type") == "tip"]
    news_group.insert(0, news_post)
    tip_group.insert(0, tip_post)
    feed["posts"] = news_group[:POSTS_NEWS_MAX] + tip_group[:POSTS_TIP_MAX]

    feed["updated"] = daily_brief["date"]
    _write_json(path, feed)
    return feed


def update_news(daily_brief, news_post, tip_post):
    path = REPO / "data" / "news.json"
    data = _read_json(path) or {"updated": "", "items": []}
    date_iso = daily_brief["date"]

    entries = [
        {
            "id": f"n-{date_iso}", "type": "newsletter", "date": date_iso,
            "title": daily_brief["title"], "tag": "Daily Brief",
            "summary": daily_brief["excerpt"],
            "comic": f"Newsletter - {date_iso}-comic-square.png",
            "readMore": "https://onyxpc.us/#contact",
        },
        {
            "id": f"t-{date_iso}-news1", "type": "tech-note", "date": date_iso,
            "title": news_post["title"], "tag": "Tech Note", "summary": news_post["summary"],
        },
        {
            "id": f"t-{date_iso}-tip1", "type": "tech-note", "date": date_iso,
            "title": tip_post["title"], "tag": "Tech Tip", "summary": tip_post["summary"],
        },
    ]
    ids = {e["id"] for e in entries}
    items = [it for it in data.get("items", []) if it.get("id") not in ids]
    items = entries + items  # brief first, then news, then tip (stable sort keeps order)
    items.sort(key=lambda x: x.get("date", ""), reverse=True)
    data["items"] = items[:NEWS_JSON_MAX]
    data["updated"] = date_iso
    _write_json(path, data)
    return data


def prune_events(date_iso):
    path = REPO / "data" / "events.json"
    evs = _read_json(path) or []
    kept = [e for e in evs if str(e.get("date", "")) >= date_iso]
    dropped = [e for e in evs if str(e.get("date", "")) < date_iso]
    tmp = str(path) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(kept, f, indent=1)
        f.write("\n")
    os.replace(tmp, path)
    return len(dropped)


# ---------------------------------------------------------------------------
# content steps
# ---------------------------------------------------------------------------

def run_generators():
    _run(["python3", "scripts/daily_fun.py"], cwd=str(REPO))
    _run(["python3", "scripts/joke_daily.py"], cwd=str(REPO))


def render_and_images(date_iso):
    _run(["python3", "scripts/build_newsletter_html.py", date_iso], cwd=str(REPO))
    # comic
    comic_src = DAILY / f"farside_{date_iso}.jpg"
    comic_dst = REPO / "assets" / "img" / "news" / f"{date_iso}-farside.jpg"
    if comic_src.exists():
        shutil.copy2(comic_src, comic_dst)
    else:
        print(f"WARNING: comic not found: {comic_src}", file=sys.stderr)
    # composite + comic-square PNG -> JPEG
    from PIL import Image
    for name in ("composite", "comic-square"):
        src = DAILY / f"Newsletter - {date_iso}-{name}.png"
        dst = REPO / "assets" / "img" / "news" / f"{date_iso}-{name}.jpg"
        if src.exists():
            Image.open(src).convert("RGB").save(dst, "JPEG", quality=82)


def verify():
    r = _run(["python3", "verify_feed_complete.py", "--all"], cwd=str(REPO), check=False)
    print(r.stdout.strip())
    if r.returncode != 0:
        print(r.stderr.strip(), file=sys.stderr)
    return r.returncode


# Files the daily publish owns. commit_and_push stages ONLY these — never
# `git add -A` — so stray untracked scratch (e.g. _preview_*.html) can't ride
# along in the daily commit. Everything else is code committed on its own
# schedule (scripts/ etc.) or deliberately excluded (see .gitignore).
CONTENT_PATHS = [
    "newsletter.html",
    "onyxsystems-header.png",  # brand copies build_newsletter_html.py refreshes
    "Onyx_Card.png",
    "data",                    # feed/news/events, today_*.json, pools, *_state.json, poll
    "assets/img/news",         # comic + composite/comic-square images
]


def commit_and_push(date_iso):
    _run(["git", "add", "--"] + CONTENT_PATHS, cwd=str(REPO))
    r = _run(["git", "diff", "--cached", "--quiet"], cwd=str(REPO), check=False)
    if r.returncode == 0:
        print("No changes to commit.")
        return
    _run(["git", "commit", "-m", f"daily: {date_iso} brief + news/tips + widgets"], cwd=str(REPO))
    _run(["git", "push", "origin", "main"], cwd=str(REPO))
    print(f"Pushed to origin/main ({date_iso}).")


# ---------------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(description="Deterministic daily publish for onyxpc.us.")
    ap.add_argument("--date", default=_today_et().isoformat(), help="publish this YYYY-MM-DD")
    ap.add_argument("--push", action="store_true", help="commit + push after the completeness gate")
    ap.add_argument("--verify-only", action="store_true",
                    help="skip content steps; only re-run the gate + (with --push) commit/push")
    args = ap.parse_args(argv)
    date_iso = args.date

    if not args.verify_only:
        _run(["git", "checkout", "main"], cwd=str(REPO))
        pr = _run(["git", "pull", "--rebase", "origin", "main"], cwd=str(REPO), check=False)
        if pr.returncode != 0:
            print(f"WARNING: git pull failed (continuing with local state): {pr.stderr.strip()[:200]}",
                  file=sys.stderr)
        print("--- generators ---")
        run_generators()
        print("--- render + images ---")
        render_and_images(date_iso)
        print("--- import feed/news ---")
        daily_brief, news_post, tip_post = build_entries(date_iso)
        update_feed(daily_brief, news_post, tip_post)
        update_news(daily_brief, news_post, tip_post)
        dropped = prune_events(date_iso)
        print(f"pruned {dropped} past event(s)")
        print("\n=== extracted feed/news entries (review before --push) ===")
        for label, e in (("Daily Brief (news[])", daily_brief),
                         ("News post", news_post),
                         ("Tip post", tip_post)):
            print(f"\n[{label}]")
            print(f"  title:   {e['title'][:120]}")
            print(f"  summary: {e.get('summary', e.get('excerpt', ''))[:120]}")
            print(f"  truth:   {e.get('truth', '')[:120]}")
            print(f"  tags:    {', '.join(e['tags'])}")

    print("\n--- completeness gate ---")
    rc = verify()
    if rc != 0:
        print("❌ completeness gate FAILED — fix the flagged entries and re-run "
              "`python3 scripts/publish_today.py --verify-only --push`.")
        return 1

    if args.push:
        print("--- commit + push ---")
        commit_and_push(date_iso)
    else:
        print("\n✅ Gate passed. Review the entries above; to ship, run "
              "`python3 scripts/publish_today.py --verify-only --push`.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
