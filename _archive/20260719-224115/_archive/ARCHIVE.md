# Website Archive & Versioning Convention

**Rule (user directive, 2026-07-17):** Never overwrite live site files. Keep old versions
AND every revision locally so anything can be retrieved later.

## How it works
- Before ANY edit to the live site, snapshot the entire tree (excluding `_archive` itself):
  ```
  TS=$(date +%Y%m%d-%H%M%S)
  mkdir -p _archive/$TS
  for f in *; do [ "$f" = "_archive" ] && continue; cp -a "$f" "_archive/$TS/"; done
  find . -type f -not -path './_archive/*' -exec sha256sum {} \; | sort > _archive/$TS/MANIFEST-live.txt
  ( cd _archive/$TS && find . -type f -exec sha256sum {} \; | sort > MANIFEST-archive.txt )
  ```
- Source/design assets (Gemini cabinet frames, previews, briefs) go under
  `_archive/$TS/games/assets/_cabinet-source/` and `_archive/$TS/extras/`.
- Each snapshot is immutable and timestamped. To restore: `cp -a _archive/<ts>/<path> <live-path>`.
- The project is also a git repo (`.git`) — commit the baseline for an extra safety net.

## Baseline snapshot
- `20260717-155617` — first full snapshot before the ARCADE cabinet redesign.
  - 1116 live files inventoried; 187 files archived (top-level + games/ + cabinet sources + extras).
  - Contains: live `index.html` + `games/`, Gemini cabinet frames v1 (`62ze62...`) and v2 (`jdv47djdv47...`),
    research brief `arcade-cards-brief.md`, design previews `cabinet-preview.*`, `cab-online-preview.png`.
