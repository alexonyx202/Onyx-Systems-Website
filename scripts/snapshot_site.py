#!/usr/bin/env python3
"""snapshot_site.py — recreate the dated "Site Snapshots" folder in the vault.

Keeps the corrected website + its documentation current in one command:

    python3 scripts/snapshot_site.py            # snapshot for today
    python3 scripts/snapshot_site.py --date 2026-08-26
    python3 scripts/snapshot_site.py --dry-run  # preview without writing

What it does
------------
1. Copies the repo working tree (the corrected site) into
   "<vault>/Onyx Website/Site Snapshots/<date> Corrected Site/" with rsync
   (--delete), excluding non-site dirs (.git, _archive, .freebuff,
   __pycache__) and the snapshot-owned files (README.md, docs/,
   FILE-INVENTORY.txt, scripts/snapshot_docs/) so they are never clobbered
   or deleted.
2. If the dated folder does not exist, seeds it from the most recent
   existing snapshot (carries the hand-written CHANGELOG-*.md history).
3. Refreshes the evergreen docs from scripts/snapshot_docs/ and writes
   README.md from its template with live facts (commit, counts).
4. Regenerates docs/INDEX.md and FILE-INVENTORY.txt.

Per the vault's add-only convention, add a dated note in Reference/ after
a significant snapshot — the script prints a reminder.
"""

import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VAULT_SITE = os.path.dirname(REPO)                    # "…/Onyx Website"
SNAPSHOTS_ROOT = os.path.join(VAULT_SITE, "Site Snapshots")
DOC_SRC = os.path.join(REPO, "scripts", "snapshot_docs")
DOC_SRC_DOCS = os.path.join(DOC_SRC, "docs")
README_TEMPLATE = os.path.join(DOC_SRC, "README.template.md")

# Never copied into the snapshot (not site content) and never deleted by
# rsync --delete (they are managed by this script instead).
RSYNC_EXCLUDES = [
    "/.git",
    "/_archive",
    "/.freebuff",
    "/__pycache__",
    "/README.md",
    "/docs/",
    "/FILE-INVENTORY.txt",
]

# Evergreen docs that live in the repo and are refreshed into every snapshot.
EVERGREEN_DOCS = [
    "ARCHITECTURE.md",
    "PAGES.md",
    "GAMES.md",
    "TOOLING.md",
    "QA.md",
]

FACTS_BEGIN = "<!-- SNAPSHOT-FACTS-BEGIN -->"
FACTS_END = "<!-- SNAPSHOT-FACTS-END -->"


def log(msg):
    print(msg, flush=True)


def run(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True,
                              check=False).stdout.strip()
    except Exception:
        return ""


def git_head():
    return run(["git", "-C", REPO, "log", "-1", "--format=%h %s"]) or "(not a git checkout)"


def git_uncommitted():
    # Avoid porcelain XY-prefix parsing (git -C path-relative quirks):
    # tracked-modified via diff --name-only, untracked via ls-files.
    paths = []
    for out in (
        run(["git", "-C", REPO, "diff", "--name-only"]),
        run(["git", "-C", REPO, "ls-files", "--others", "--exclude-standard"]),
    ):
        paths += [p for p in out.splitlines() if p.strip()]
    return paths


def count_files(d):
    return sum(len(files) for _, _, files in os.walk(d))


def dir_size_mb(d):
    total = 0
    for root, _, files in os.walk(d):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total / (1024 * 1024)


def load_games():
    p = os.path.join(REPO, "games", "games.json")
    try:
        with open(p, "r", encoding="utf-8") as fh:
            return json.load(fh).get("games", [])
    except Exception:
        return []


def latest_existing_snapshot():
    if not os.path.isdir(SNAPSHOTS_ROOT):
        return None
    dirs = [d for d in os.listdir(SNAPSHOTS_ROOT)
            if d.endswith(" Corrected Site")
            and os.path.isdir(os.path.join(SNAPSHOTS_ROOT, d))]
    return os.path.join(SNAPSHOTS_ROOT, sorted(dirs)[-1]) if dirs else None


def rsync_site(target, dry_run):
    os.makedirs(target, exist_ok=True)
    src = REPO.rstrip("/") + "/"
    cmd = ["rsync", "-a", "--delete"]
    if dry_run:
        cmd.append("-n")
    for ex in RSYNC_EXCLUDES:
        cmd += ["--exclude", ex]
    cmd += [src, target]
    log("  rsync %s -> %s" % (src, target))
    p = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if p.returncode != 0:
        sys.exit("rsync failed: " + p.stderr[-500:])


def seed_new_snapshot(target, dry_run):
    """Seed a brand-new dated folder from the most recent existing snapshot."""
    latest = latest_existing_snapshot()
    if not latest or latest == target:
        return
    log("  seeding %s from %s" % (target, os.path.basename(latest)))
    if dry_run:
        return
    os.makedirs(os.path.join(target, "docs"), exist_ok=True)
    for name in ("README.md", "FILE-INVENTORY.txt"):
        src = os.path.join(latest, name)
        if os.path.isfile(src):
            shutil.copyfile(src, os.path.join(target, name))
    src_docs = os.path.join(latest, "docs")
    if os.path.isdir(src_docs):
        for name in os.listdir(src_docs):
            src = os.path.join(src_docs, name)
            if os.path.isfile(src):
                shutil.copyfile(src, os.path.join(target, "docs", name))


def starter_changelog(target, date_str, dry_run):
    """Brand-new vault with no prior snapshot: drop a starter changelog."""
    path = os.path.join(target, "docs", "CHANGELOG-%s.md" % date_str)
    if os.path.exists(path):
        return
    log("  creating starter %s" % os.path.basename(path))
    if dry_run:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("# Changelog — %s\n\n(Add site-change entries for this snapshot.)\n" % date_str)


def copy_evergreen_docs(target, dry_run):
    log("  refreshing evergreen docs from scripts/snapshot_docs/")
    if dry_run:
        return
    docs_dir = os.path.join(target, "docs")
    os.makedirs(docs_dir, exist_ok=True)
    for name in EVERGREEN_DOCS:
        src = os.path.join(DOC_SRC_DOCS, name)
        if os.path.isfile(src):
            shutil.copyfile(src, os.path.join(docs_dir, name))


def render_facts(facts):
    return "\n".join([
        FACTS_BEGIN,
        "- **Captured**: %s" % facts["date"],
        "- **Source commit**: `%s`" % facts["commit"],
        "- **Working tree**: %s" % facts["tree"],
        "- **Files**: %s · **Size**: %.0f MB" % (facts["files"], facts["size_mb"]),
        "- **Games registered**: %s (games/games.json)" % facts["games"],
        "- **Data files**: %s (data/*.json)" % facts["data"],
        FACTS_END,
    ])


def write_readme(target, facts, dry_run):
    log("  writing README.md (template + live facts)")
    if dry_run:
        return
    with open(README_TEMPLATE, "r", encoding="utf-8") as fh:
        tmpl = fh.read()
    if FACTS_BEGIN in tmpl and FACTS_END in tmpl:
        head, rest = tmpl.split(FACTS_BEGIN, 1)
        _, tail = rest.split(FACTS_END, 1)
        tmpl = head + render_facts(facts) + tail
    with open(os.path.join(target, "README.md"), "w", encoding="utf-8") as fh:
        fh.write(tmpl)


def list_target(target, rel):
    p = os.path.join(target, rel)
    if not os.path.isdir(p):
        return []
    return sorted(os.listdir(p))


def write_index(target, facts, games, local_only, dry_run):
    log("  regenerating docs/INDEX.md")
    if dry_run:
        return
    core = [f for f in list_target(target, ".") if f.endswith(".html")]
    data = list_target(target, "data")
    docs = list_target(target, "docs")
    lines = [
        "# Snapshot index — %s" % facts["date"],
        "",
        "Generated by `scripts/snapshot_site.py` (vault snapshot tooling).",
        "",
        "## Source",
        "",
        "- Commit: `%s`" % facts["commit"],
        "- Working tree: %s" % facts["tree"],
        "",
        "## Pages",
        "",
        "- Core: %s" % ", ".join(core),
        "- Arcade hub: `games/index.html`",
        "- Game pages: %s (%s registered + %s local-only)"
        % (len(games) + len(local_only), len(games), len(local_only)),
        "",
        "## Games (registered — `games/games.json`)",
        "",
        "| file | title |",
        "|---|---|",
    ]
    for g in games:
        lines.append("| %s | %s |" % (g.get("file", "?"), g.get("title", "?")))
    lines += ["", "## Local-only (not deployed)", ""]
    lines += ["- `%s`" % x for x in local_only] if local_only else ["- (none)"]
    lines += ["", "## Data (`data/*.json`)"]
    lines += ["- `%s`" % x for x in data]
    lines += ["", "## Docs (`docs/`)"]
    lines += ["- `%s`" % x for x in docs]
    lines += ["", "## Inventory", "", "- %s files · %.0f MB" % (facts["files"], facts["size_mb"])]
    with open(os.path.join(target, "docs", "INDEX.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def write_inventory(target, facts, dry_run):
    log("  regenerating FILE-INVENTORY.txt")
    if dry_run:
        return
    lines = [
        "Onyx Systems corrected website snapshot — %s" % facts["date"],
        "Source commit: %s" % facts["commit"],
        "Working tree: %s" % facts["tree"],
        "(excludes .git, _archive, .freebuff, __pycache__; README/docs/inventory managed by snapshot_site.py)",
        "",
        "== FILES ==",
    ]
    for root, dirs, files in os.walk(target):
        dirs.sort()
        for f in sorted(files):
            rel = os.path.relpath(os.path.join(root, f), target)
            lines.append("./" + rel)
    lines += ["", "== DIRS =="]
    for root, dirs, files in os.walk(target):
        dirs.sort()
        rel = os.path.relpath(root, target)
        lines.append("./" + (rel if rel != "." else "."))
    with open(os.path.join(target, "FILE-INVENTORY.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", default=datetime.date.today().isoformat(),
                    help="snapshot date, YYYY-MM-DD (default: today)")
    ap.add_argument("--dry-run", action="store_true",
                    help="show what would happen without writing anything")
    args = ap.parse_args()

    try:
        date_str = datetime.date.fromisoformat(args.date).isoformat()
    except ValueError:
        sys.exit("bad --date: %r (want YYYY-MM-DD)" % args.date)

    target = os.path.join(SNAPSHOTS_ROOT, "%s Corrected Site" % date_str)
    log("snapshot target: %s" % target)

    if not os.path.isdir(SNAPSHOTS_ROOT):
        log("  (creating %s)" % SNAPSHOTS_ROOT)
        if not args.dry_run:
            os.makedirs(SNAPSHOTS_ROOT, exist_ok=True)

    exists = os.path.isdir(target)
    log("existing folder: %s — %s"
        % ("yes" if exists else "no", "refreshing" if exists else "creating"))
    if not exists:
        seed_new_snapshot(target, args.dry_run)
        starter_changelog(target, date_str, args.dry_run)

    rsync_site(target, args.dry_run)

    games = load_games()
    registered = {g.get("file") for g in games}
    game_html = [f for f in list_target(target, "games") if f.endswith(".html")
                 and f != "index.html"]
    local_only = sorted(f for f in game_html if f not in registered)

    uncommitted = git_uncommitted()
    tree = "clean"
    if uncommitted:
        tree = "has uncommitted: %s" % ", ".join(uncommitted[:5])
    facts = {
        "date": date_str,
        "commit": git_head(),
        "tree": tree,
        "files": count_files(target),
        "size_mb": dir_size_mb(target),
        "games": len(games),
        "data": len(list_target(target, "data")),
    }

    copy_evergreen_docs(target, args.dry_run)
    write_readme(target, facts, args.dry_run)
    write_index(target, facts, games, local_only, args.dry_run)
    write_inventory(target, facts, args.dry_run)

    log("")
    log("done: %s" % target)
    log("files: %s · size: %.0f MB · games registered: %s"
        % (facts["files"], facts["size_mb"], facts["games"]))
    log("reminder: add a dated note in Reference/ per the add-only "
        "convention (e.g. 'Website Snapshot & Documentation <date>.md').")


if __name__ == "__main__":
    main()
