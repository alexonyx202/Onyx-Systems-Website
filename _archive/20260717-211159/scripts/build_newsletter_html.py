#!/usr/bin/env python3
"""
Onyx Systems — templatize data/newsletter.html from the canonical Daily Brief .md.

The Daily Brief content source of truth is the pointer file:
  /home/ai/Documents/Obsidian Vault/Daily/last_sent_newsletter.json  -> md_path
(only set after the email is confirmed sent; guarantees the website shows exactly
what was emailed). Falls back to the newest Newsletter - <DATE>.md on the date.

This script parses the brief markdown into:
  - alert headline + body (section after 🔴 ALERT)
  - "today in tech" bullets
  - daily tip (section after 💡 DAILY TIP)
  - the Far Side comic (assets/img/news/<DATE>-farside.jpg)
and writes a clean, themed newsletter.html in the site repo.

Run:  python3 scripts/build_newsletter_html.py [DATE]
"""
import os, re, json, datetime, sys

VAULT = "/home/ai/Documents/Obsidian Vault/Daily"
REPO = "/home/ai/onyx-systems-website"
DATA = os.path.join(REPO, "data")

def today_iso():
    return datetime.date.today().isoformat()

def resolve_md(date_str):
    ptr = os.path.join(VAULT, "last_sent_newsletter.json")
    if os.path.exists(ptr):
        try:
            p = json.load(open(ptr))
            mp = p.get("md_path")
            if mp and os.path.exists(mp) and date_str in mp:
                return mp, date_str
        except Exception:
            pass
    # fallback: newest Newsletter - <DATE>.md
    cands = sorted([f for f in os.listdir(VAULT) if f.startswith("Newsletter - ") and f.endswith(".md") and date_str in f])
    if cands:
        return os.path.join(VAULT, cands[-1]), date_str
    return None, date_str

def find_section(md, marker_prefix):
    """Return the TEXT BODY after a `━━━ <marker_prefix> ... ━━━` header line.
    The header line itself (which may include a title after the marker) is NOT
    included in the body. Stops at the next ━━━ boundary or '---' or EOF.
    Returns (title, body): title = text after marker_prefix on the header line (if any)."""
    idx = md.find(marker_prefix)
    if idx < 0:
        return "", ""
    # header line runs from idx to the next newline
    nl = md.find("\n", idx)
    header = md[idx:nl] if nl > 0 else md[idx:]
    # title = everything after the marker_prefix on the header line
    title = header[len(marker_prefix):].strip().strip("━").strip()
    # body starts after the header newline
    rest = md[nl + 1:] if nl > 0 else ""
    # A section runs until the next box-drawing header line (starts with ━) or a
    # horizontal rule (---). The old boundary regex failed to match headers that
    # carry text after the leading ━, which made every section over-capture the
    # rest of the document. Split on header/rule lines instead.
    seg_lines = []
    for ln in rest.split("\n"):
        if ln.lstrip().startswith("━"):
            break
        if ln.strip() == "---" or set(ln.strip()) == {"-"}:
            break
        seg_lines.append(ln)
    seg = "\n".join(seg_lines).strip()
    # strip the comic markdown line (![...](farside...)) if it leaked in
    seg = re.sub(r"!\[[^]]*\]\([^)]*farside[^]]*\)", "", seg)
    seg = re.sub(r"\n{2,}", "\n", seg).strip()
    return title, seg

def bullets(md):
    items = re.findall(r"^\s*[-•*]\s+(.+)$", md, re.MULTILINE)
    return [i.strip() for i in items if i.strip()]

def main():
    date_str = sys.argv[1] if len(sys.argv) > 1 else today_iso()
    md_path, _ = resolve_md(date_str)
    if not md_path:
        print(f"ERROR: no brief markdown for {date_str}")
        return 1
    md = open(md_path).read()
    alert_title, alert_body = find_section(md, "ALERT")
    tip_title, tip_body = find_section(md, "DAILY TIP")
    _, today = find_section(md, "TODAY IN TECH")
    alert_body = alert_body.strip()
    tip_body = tip_body.strip()
    tech_bullets = bullets(today) or bullets(alert_body)
    d = datetime.date.fromisoformat(date_str)
    weekday = d.strftime("%A")
    month = d.strftime("%B")
    day = d.day
    ordinal = f"{day}{'th' if 11<=day<=13 else {1:'st',2:'nd',3:'rd'}.get(day%10,'th')}"
    comic = f"assets/img/news/{date_str}-farside.jpg"
    comic_alt = f"The Far Side comic for {weekday}, {month} {ordinal}, {d.year}"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daily Computer Brief — {weekday}, {month} {ordinal}, {d.year} | ONYX SYSTEMS</title>
<meta name="description" content="ONYX SYSTEMS Daily Computer Brief for {weekday}, {month} {ordinal}, {d.year}.">
<style>
  :root{{--paper:#F7F4EF;--ink:#23201C;--muted:#6B635A;--accent:#C2703D;--line:#E4DED3;--shadow:0 6px 24px rgba(0,0,0,.08)}}
  body{{margin:0;background:#EDE8DF;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);line-height:1.6}}
  .wrap{{max-width:760px;margin:32px auto;background:var(--paper);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}}
  .mast{{background:#16161A;color:#F7F4EF;padding:22px 28px;display:flex;justify-content:space-between;align-items:center}}
  .brand{{font-weight:800;letter-spacing:.06em;font-size:20px}}
  .date{{color:#C9C2B6;font-size:14px}}
  .doc{{padding:28px}}
  h1{{font-size:28px;margin:0 0 18px}}
  .section{{border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:16px 0}}
  .section.alert{{border-color:#f3c9c2;background:#fdf3f1}}
  .section.alert h2{{color:#b3261e;margin-top:0}}
  .section.tip{{border-color:#d9ead0;background:#f3f9ef}}
  .section.tip h2{{color:#3f7a2e;margin-top:0}}
  h2{{font-size:20px;margin:0 0 10px}}
  ul{{margin:8px 0 0;padding-left:20px}}
  li{{margin:6px 0}}
  .comic{{text-align:center;margin:30px 0}}
  .comic img{{max-width:760px;width:100%;height:auto;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}}
  .comic .cap{{font-style:italic;color:var(--muted);margin-top:10px;font-size:14px}}
  .foot{{padding:18px 28px;background:#16161A;color:#C9C2B6;font-size:13px;text-align:center}}
  .foot a{{color:var(--accent);text-decoration:none}}
</style>
</head>
<body>
<article class="wrap doc">
  <div class="mast"><span class="brand">ONYX SYSTEMS</span><span class="date">{weekday}, {month} {ordinal}, {d.year}</span></div>
  <h1>Your Daily Computer Brief</h1>
  <div class="section alert">
    <h2>{alert_title}</h2>
    <p>{alert_body}</p>
  </div>
  <div class="section">
    <h2>Today in Tech</h2>
    <ul>
"""
    for b in tech_bullets[:5]:
        html += f"      <li>{b}</li>\n"
    html += f"""    </ul>
  </div>
  <div class="section tip">
    <h2>Daily Tip</h2>
    <p>{tip_body}</p>
  </div>
  <div class="comic">
    <img src="{comic}" alt="{comic_alt}">
    <div class="cap">The Far Side &mdash; your daily laugh.</div>
  </div>
</article>
<div class="foot">ONYX SYSTEMS &mdash; Computer Care Center &middot; Lake City, FL &middot; (386) 755-7772</div>
</body>
</html>
"""
    out = os.path.join(REPO, "newsletter.html")
    with open(out, "w") as f:
        f.write(html)
    print(f"OK wrote {out} from {os.path.basename(md_path)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
