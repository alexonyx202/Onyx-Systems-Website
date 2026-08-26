# QA — the verifier and the audit methodology

## `scripts/verify_arcade.js` — the browser verifier (CI-enforced)

A headless-Chromium suite (Puppeteer) that serves the site locally and
checks, per page, at desktop viewports **1280 / 1440 / 1920** and the
mobile touch viewport **390×844** (isMobile + hasTouch):

- All game cards render with the expected copy (title/tagline/desc),
  images resolve, no horizontal overflow, 0 console errors.
- Service worker registers and the site works **offline** after caching.
- **Behavioral mobile guards** (real taps, not just presence checks) —
  each FAILs the run with exit 1 (the script exits nonzero on any
  failure):
  - **Arcade tap** — tapping an arcade card on the 390×844 touch viewport
    must navigate into the game (guards the 2026-07-17 `preventDefault`
    bug; commit `5bb23dc`).
  - **NAV MOBILE** — the bottom tab bar (`#nav-links`) must be docked at
    the viewport bottom (`bottomGap ≤ 8`, `top > 600`), no horizontal
    overflow, and the theme toggle must be clickable (guards the
    `backdrop-filter` containing-block trap; `5ea3b86`).
  - **XWORD MOBILE** — crossword board cells must render `> 5px` and the
    board must fit the viewport (guards the `fitCell()` 1×1 collapse;
    `5ea3b86`).
  - **GALLERY MOBILE** — tapping a `figure.gallery-item` must open
    `#glViewer`; tapping `#glvClose` must close it (`d53b9d3`).
  - **NEWS MOBILE** — tapping `#showNewsBtn` must reveal `#newsTipsGrid`
    and flip `aria-expanded`; second tap hides it again (`d53b9d3`).

The file header documents each guard with its commit reference.

## Red/green methodology (used for every guard + fix)

1. **Green**: run the verifier with the fix in place — must PASS, ideally
   ×3 for flake checks.
2. **Red**: temporarily reintroduce the bug (e.g., restore
   `preventDefault`, re-add the `backdrop-filter`, `max-height:58vh`, or a
   `touchstart → preventDefault()` trap) — the guard must print its FAIL
   message and exit 1.
3. Restore the fix; confirm the tree is back at HEAD (no diff).

This proves each guard actually catches its regression and each fix
actually resolves it.

## The 2026-08-26 touch audit scans

In addition to the versioned verifier, the full touch audit used
real-browser scans over **all 27 pages** (4 core + 22 games + hub) at
390×844 mobile and 1280×900 desktop:

- **Containing-block traps**: every `position:fixed` element's ancestor
  chain checked for transform/perspective/filter/backdrop-filter/contain/
  will-change (would have caught the nav trap). Result: **0**.
- **Collapsed / measured-but-empty heights**: elements ≤2px tall/wide with
  visible children (caught the crossword 1×1 collapse class). Result: **0**
  real; flagged items were by-design anchors/accordions.
- **Hover-only reveals**: CSS `:hover` reveals with no
  focus/active/checked tap-equivalent + a JS `mouseenter/mouseover` grep.
  Result: **0**.
- **Click-blocking overlays**: `elementFromPoint` at every visible
  interactive element's center. Result: all triaged as false positives
  (start-screen-over-HUD patterns, opacity-hidden screens, by-design cell
  divs) except one real bug found via the geometry pass — see below.
- **Out-of-viewport interactive elements** (added during the parity run):
  interactive elements partially visible but with centers outside the
  viewport on non-scrolling pages. This caught the **port-mapper touch
  pad** bug (bottom-row buttons centered 20px below the fold).

Every candidate was triaged with targeted probes: per-screen visibility
dumps, click-through-to-gameplay flows, real CDP touchStart/touchEnd
checks asserting `.pressed` state, and screenshots.

## Parity check (live vs repo)

The same scan ran against **https://onyxpc.us** and the local checkout
with byte-identical output except the expected pending-deploy delta
(port-mapper pre/post fix). Fix markers (no `backdrop-filter` on
`header.site`, no `preventDefault` in the hover:none handler, `min(58vh)`
board height) and stamps (`onyx-build 20260826`) all matched.

## Recommendation

The ad-hoc audit scans proved their worth (they caught the port-mapper
bug the verifier missed). Versioning a lightweight version of them into
`scripts/` + CI would close the loop — see the vault notes for the
suggestion.
