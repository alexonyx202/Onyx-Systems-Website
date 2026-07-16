# Onyx Systems Homepage — 4-Pillar Grader Audit & Implementation Spec
**File audited:** `/home/ai/onyx-systems-website/index.html` (1292 lines, 89,455 bytes)
**Date:** 2026-07-15 · **Method:** Read every line of the actual file + `grep`/`hexdump` ground-truth on every suspect value. No edits performed — research + validated spec only.
**Thresholds:** HubSpot Website Grader + Google Core Web Vitals (LCP < 2.5s, CLS < 0.1, INP < 200ms), SEO (title 50–60, desc ~155), Mobile (tap targets ≥ 44px, no horizontal overflow ≤ 390px), Security (HTTPS-only, no mixed content, no dereferenced assets).

---

## 0. False positives CLEARED (verified by hexdump — do NOT "fix" these)
- **`tel:+138****7772`** appears in the tool *display*, but the raw bytes are `tel:+13867557772` (= 386-755-7772). Every Call button works. Not a bug.
- **`"@context":"https://***`** display was masking `https://schema.org`. The JSON-LD is valid and parses. `"@type":"LocalBusiness"`, `founder`, `postalCode`, `areaServed` are all spelled correctly. Structured data is sound — only the `image` value is root-relative (see P2-5).
- **Mixed content (`http://`)**: none. Only `http://www.sitemaps.org` (an XML namespace) and the `hasMap` Google URL (https). Clean.
- **`<img>` alt coverage**: all 27 `<img>` tags have `alt`. Clean.
- **`rel="noopener"`** on every `target="_blank"` link. Clean.

---

## 1. PRIORITIZED FIX LIST (SEO/Security → Mobile → Performance)

### 🔴 P0-SEO-1 — Missing `meta name="robots"`
No robots directive exists, so crawlers fall back to defaults and rich-result image previews aren't explicitly allowed. HubSpot/Search Console flag this.
- **Line 8→9.** Insert between canonical and `og:title`:
```
OLD:  <meta rel="canonical" href="https://onyxpc.us/">
      <meta property="og:title" content="Onyx Systems | Computer &amp; IT Repair, Lake City FL">
NEW:  <meta rel="canonical" href="https://onyxpc.us/">
      <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
      <meta property="og:title" content="Onyx Systems | Computer &amp; IT Repair, Lake City FL">
```

### 🔴 P0-SEC/PERF-2 — Favicon: 64 KB PNG at a root-relative path
Ground-truth: `assets/img/brand/favicon.png` = **64,146 bytes, 600×197 px**, served via `link rel="icon" href="assets/img/brand/favicon.png"`. Problems: (a) 64 KB for a 16–32 px icon is ~20–40× oversized → wasted bandwidth on every page load; (b) root-relative path 404s on any sub-page (e.g. `/games/wargames-v3.html`); (c) `.png` favicon lacks multi-resolution support.
- **Line 18.** Use an absolute, multi-size `.ico` (≤ 40 KB):
```
OLD:  <link rel="icon" href="assets/img/brand/favicon.png">
NEW:  <link rel="icon" href="https://onyxpc.us/favicon.ico" sizes="any">
```
- **Build step (verification §2):** `convert assets/img/brand/favicon.png -background none -define icon:auto-resize=16,32,48,64 public/favicon.ico` then commit `favicon.ico` to repo root + deploy. (ImageMagick or `png2ico`.)

### 🟠 P1-SEO-3 — Open Graph image missing `width`/`height`; no `site_name`/`locale`
OG validators warn without explicit dimensions (causes a late layout shift / rejected preview in some scrapers). `site_name`/`locale` improve share cards.
- **Line 13→14.** After `og:image`:
```
OLD:  <meta property="og:image" content="https://onyxpc.us/og-image.png">
      <meta name="twitter:card" content="summary_large_image">
NEW:  <meta property="og:image" content="https://onyxpc.us/og-image.png">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <meta property="og:site_name" content="Onyx Systems">
      <meta property="og:locale" content="en_US">
      <meta name="twitter:card" content="summary_large_image">
```
(og:image is already absolute `https://onyxpc.us/og-image.png` and the file is 1200×630 — correct. twitter:image is already absolute. Good.)

### 🟠 P1-SEO-4 — No `twitter:site` / `twitter:creator`
Needed for Twitter/X card attribution. Add only if a handle exists (placeholder below — replace or omit).
- **Line 17→18.** After `twitter:image`:
```
OLD:  <meta name="twitter:image" content="https://onyxpc.us/og-image.png">
      <script>document.documentElement.dataset.theme=localStorage.getItem('onyx-theme')||'dark';</script>
NEW:  <meta name="twitter:image" content="https://onyxpc.us/og-image.png">
      <meta name="twitter:site" content="@OnyxSystems">
      <meta name="twitter:creator" content="@OnyxSystems">
      <script>document.documentElement.dataset.theme=localStorage.getItem('onyx-theme')||'dark';</script>
```

### 🟠 P1-SEC-5 — `src=""` on two images → console 404s
`src=""` resolves to the *current document URL* and fires a load → 404 (or reload) error in DevTools. Ground-truth: line 600 (`#wxIcon`) and line 831 (`#p-ic`). JS fills `src` later, so the empty attribute is pure waste + a console error.
- **Line 600:**
```
OLD:              <img class="wx-icon" id="wxIcon" alt="" src="" hidden>
NEW:              <img class="wx-icon" id="wxIcon" alt="" hidden>
```
- **Line 831:**
```
OLD:      <span class="pic"><img id="p-ic" src="" alt=""></span>
NEW:      <span class="pic"><img id="p-ic" alt=""></span>
```

### 🟡 P2-SEO/BRAND-6 — `Oswald` declared but never loaded
`--brand-font:'Oswald',…` (line 50) is used for every heading/brand word, but there is **no `<link>` or `@font-face`** for Oswald anywhere. The site silently falls back to Segoe UI → brand identity lost + the CSS is misleading. Fix by actually loading it (small, `display=swap`).
- **Before line 20 (`<script type="application/ld+json">`):**
```
OLD:  <script>document.documentElement.dataset.theme=localStorage.getItem('onyx-theme')||'dark';</script>
      <script type="application/ld+json">
NEW:  <script>document.documentElement.dataset.theme=localStorage.getItem('onyx-theme')||'dark';</script>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&display=swap">
      <script type="application/ld+json">
```

### 🟡 P2-MOB-7 — ARCADE `.gtag` not line-clamped → overflow risk at 390px
`.arcade-sec .gtag{font-size:12px;min-height:32px}` (line 424). The 5 uniform cards are `max-width:clamp(180px,17vw,220px)`; on a 390px viewport they're ~180px wide, so 2–3-word taglines ("Defend NORAD, Moscow & Beijing from incoming ICBMs.") wrap to **2 lines**, and with only `min-height:32px` the text can crowd the "▶ Play now" button. Clamp to 2 lines for safety.
- **Line 424:**
```
OLD:  .arcade-sec .gtag{font-size:12px;min-height:32px}
NEW:  .arcade-sec .gtag{font-size:12px;min-height:32px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
```

### 🟡 P2-PERF-8 — Oversized news JPGs
Ground-truth largest: `2026-07-13-farside.jpg` = **621 KB**, composites ~300 KB each. These are injected only when the News & Tips toggle opens (so they're lazy by design — good), but 621 KB is excessive. Re-compress to WebP ≤ 120 KB.
- Action (no HTML change): `cwebp -q 72 assets/img/news/*.jpg` → replace. Verification §2 lists the offenders.

### 🟡 P2-SEO-9 — JSON-LD `image` is root-relative
- **Line 23:**
```
OLD:    "image":"og-image.png",
NEW:    "image":"https://onyxpc.us/og-image.png",
```

### ⚪ P2-nice — `theme-color` meta (optional)
Improves mobile browser-chrome theming. **Line 5:**
```
OLD:  <meta name="viewport" content="width=device-width, initial-scale=1.0">
NEW:  <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#16161A">
```
- **Meta description** is 164 chars (line 7) — acceptable (≤ ~160 ideal). Optional trim; left as-is.

---

## 2. EXECUTABLE VERIFICATION PLAN

```bash
cd /home/ai/onyx-systems-website

# --- A. Patches applied cleanly? (each old_string must match exactly once) ---
grep -n 'meta name="robots"' index.html            # expect 1 hit after P0-1
grep -n 'favicon.ico' index.html                  # expect 1 hit after P0-2
grep -n 'og:image:width\|og:site_name\|og:locale' index.html   # expect 3 hits after P1-3
grep -n 'twitter:site' index.html                 # expect 1–2 hits after P1-4
grep -c 'src=""' index.html                        # expect 0 after P1-5 (was 2)
grep -n 'family=Oswald' index.html                # expect 1 hit after P2-6
grep -n 'line-clamp:2' index.html                # expect 1 hit after P2-7
grep -n '"image":"https://onyxpc.us/og-image.png"' index.html  # expect 1 after P2-9

# --- B. Favicon built & absolute-clean ---
ls -l favicon.ico && [ $(stat -c%s favicon.ico) -lt 40960 ] && echo "FAVICON OK (<40KB)" || echo "FAVICON TOO BIG"
# any remaining root-relative asset refs in <head> that 404 on subpages?
grep -nE 'href="assets/|src="assets/' index.html | grep -v 'favicon'   # all others are fine (page-relative from root)

# --- C. JSON-LD still valid after P2-9 ---
python3 - <<'PY'
import re,json
h=open('index.html',encoding='utf-8').read()
b=re.search(r'<script type="application/ld\+json">(.*?)</script>',h,re.S).group(1)
json.loads(b); print("JSON-LD parses OK")
PY

# --- D. No mixed content / no missing alt ---
grep -nE 'src="http://|href="http://' index.html | grep -v 'sitemaps.org' || echo "NO MIXED CONTENT"
grep -nE '<img [^>]*>' index.html | grep -vE 'alt=' || echo "ALL <img> HAVE alt"

# --- E. Re-compress news images (P2-8) ---
for f in assets/img/news/*.jpg; do
  kb=$(( $(stat -c%s "$f") / 1024 ))
  [ $kb -gt 120 ] && echo "RECOMPRESS ($kb KB): $f"
done
# then: cwebp -q 72 <file>.jpg -o <file>.webp  (and update FEED_FALLBACK image refs if kept)

# --- F. Live render smoke test (optional, needs network) ---
# curl -sI https://onyxpc.us/favicon.ico        # expect HTTP/2 200
# curl -s https://onyxpc.us/ | grep -c 'meta name="robots"'   # expect 1
```

**Browser console check (manual):** open `https://onyxpc.us/` in Chrome DevTools → Console must show **0 errors** (confirms P1-5 empty-`src` fix). Performance tab → Lighthouse SEO = 100, Best-Practices ≥ 95 (favicon + robots now present). Device toolbar at **390px** → ARCADE row shows 5 cards, no horizontal scrollbar (confirms P2-7).

---

## 3. SUMMARY OF FINDINGS
| ID | Pillar | Issue | Impact | Patch lines |
|----|--------|-------|--------|-------------|
| P0-1 | SEO | No `meta robots` | Crawl/index hint missing | 8→9 |
| P0-2 | Sec/Perf | Favicon 64 KB PNG, root-relative | Bandwidth + 404 on subpages | 18 (+build) |
| P1-3 | SEO | OG image lacks w/h, site_name, locale | Weaker share cards | 13→14 |
| P1-4 | SEO | No twitter:site/creator | No X card attribution | 17→18 |
| P1-5 | Security | `src=""` → console 404 | Silent console errors | 600, 831 |
| P2-6 | SEO/Brand | Oswald declared, never loaded | Brand font missing | 19 |
| P2-7 | Mobile | ARCADE `.gtag` not clamped @390px | Button crowding | 424 |
| P2-8 | Perf | News JPGs up to 621 KB | Slow toggle reveal | assets |
| P2-9 | SEO | LD `image` root-relative | Suboptimal LD | 23 |

**What is already GOOD (no action):** single `<h1>`; valid 53-char title; 164-char meta description; canonical + sitemap.xml + robots.txt present; all 27 `<img>` alt-covered; all `target="_blank"` use `rel="noopener"`; zero `http://` mixed content; JSON-LD parses and classifies as `LocalBusiness`; all 11 cartoon SVGs + `crossword.js` + `bg-wireframe.jpg` exist; og:image/twitter:image already absolute (1200×630).
