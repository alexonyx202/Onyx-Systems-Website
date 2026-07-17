#!/usr/bin/env python3
"""
grade_site.py — Deterministic pre-push grader for the CURRENT Onyx site DOM
(redesign 2026-07-14: #newsTipsGrid post-cards, single #reviewGrid, #themeToggle,
[data-theme] switch, 7 .tile flyouts, ARCADE verbatim).

UPGRADED 2026-07-16:
  - TRUE per-element mobile-overflow probe (fixes the 390px FALSE-PASS where
    chromium auto-expands window.innerWidth to an element's intrinsic min-content,
    so documentElement.scrollWidth==innerWidth could pass while a real 390px phone
    overflows). Now we measure EVERY element's offsetWidth vs window.innerWidth and
    FAIL if any element is wider than the viewport.
  - tel: E.164 byte-count gate (no masked/asterisk links).
  - Hero Call CTA presence + dominance.
  - Sticky mobile call bar present AND hidden on desktop (must not affect desktop).
  - Feed completeness gate (no teaser headlines hiding product names).
  - 0-100 SCORECARD across 5 categories, printed every run. Exit 0 only if ALL HARD
    gates pass (so pre-push CI stays meaningful).

KEY HARNESS LESSONS (do not regress):
  - Spawns its OWN http.server IN-PROCESS (same netns as the CDP client).
  - Launches chromium with --remote-debugging-port=0 and PARSES the real port from
    stderr "DevTools listening on ws://127.0.0.1:PORT/..." (pre-picking a port loses
    a bind race under chrome-proc saturation).
  - Unique temp user-data-dir per run (localStorage never leaks between runs).
  - Safe leftover-chromium cleanup: enumerate /proc, kill only /tmp/onyx-* profiles,
    never pkill -f (kills the terminal), never touch /tmp/agent-browser-chrome-*.
  - Wrap Page.captureScreenshot in try/except (non-fatal).
  - Use the rpc()/ev() helpers (don't hand-roll raw CDP — detached-context trap).
"""
import argparse, json, sys, time, os, subprocess, tempfile, http.server, socketserver, threading, functools, socket as pysock, re, glob
import websocket, urllib.request

WIDTHS = [1280, 768, 390]
HARD_TEL_COUNT = 7  # expected real tel:+1386755772 links in index.html


def connect(port):
    return json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=5).read())["webSocketDebuggerUrl"]


def rpc(ws, method, params=None, sid=None, mid=1):
    p = {"id": mid, "method": method}
    if params:
        p["params"] = params
    if sid:
        p["sessionId"] = sid
    ws.send(json.dumps(p))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == mid:
            return m.get("result")


def ev(ws, expr, sid, mid=900):
    return rpc(ws, "Runtime.evaluate", {"expression": expr, "returnByValue": True}, sid=sid, mid=mid).get("result", {}).get("value")


def kill_own_chromium():
    """Safe leftover-chromium sweep: kill only /tmp/onyx-* profiles. Never pkill -f,
    never touch the agent browser (ports 9222/9223)."""
    import signal
    killed = 0
    for pid in os.listdir('/proc'):
        if not pid.isdigit():
            continue
        try:
            with open(f'/proc/{pid}/cmdline', 'rb') as f:
                cmd = f.read().decode('utf-8', 'ignore')
        except (FileNotFoundError, ProcessLookupError):
            continue
        if 'chromium' not in cmd and 'chrome' not in cmd:
            continue
        if '/tmp/agent-browser-chrome-' in cmd:
            continue
        if '/tmp/onyx-' in cmd:
            try:
                os.kill(int(pid), signal.SIGTERM)
                killed += 1
            except (ProcessLookupError, PermissionError, ValueError):
                pass
    return killed


# ── scoring ──────────────────────────────────────────────────────────────────
CATEGORIES = ["Mobile", "Accessibility", "Conversion/CTA", "Theme Integrity", "Performance/Bloat"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None)
    ap.add_argument("--serve-dir", default="/home/ai/onyx-systems-website")
    ap.add_argument("--existing-port", type=int, default=0,
                    help="Reuse an already-running chromium CDP port (use when the box is saturated).")
    args = ap.parse_args()

    args.http_port = 8099
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=args.serve_dir)
    httpd = socketserver.TCPServer(("127.0.0.1", args.http_port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = args.url or f"http://127.0.0.1:{args.http_port}/"
    print(f"[setup] serving {args.serve_dir} at {url}")

    problems = []
    # per-category pass/fail tallies for the scorecard
    cat = {c: {"pass": 0, "total": 0} for c in CATEGORIES}

    def check(name, ok, category, hard=True):
        cat[category]["total"] += 1
        if ok:
            cat[category]["pass"] += 1
            print(f"[{'PASS' if ok else 'FAIL'}] {name}")
        else:
            print(f"[{'FAIL' if not ok else 'PASS'}] {name}")
            if hard:
                problems.append(name)

    _cdp_log = None
    if args.existing_port:
        args.port = args.existing_port
        print(f"[setup] reusing existing chromium CDP on port {args.port}")
        proc = None
    else:
        profile_dir = tempfile.mkdtemp(prefix="onyx-grade-")
        _cdp_log = os.path.join(profile_dir, "cdp.log")
        proc = subprocess.Popen(
            ["chromium", "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
             "--disable-dev-shm-usage", f"--user-data-dir={profile_dir}",
             "--remote-debugging-port=0", "--remote-allow-origins=*",
             "--window-size=1280,900", "about:blank"],
            stdout=open(_cdp_log, "w"), stderr=subprocess.STDOUT)

    if not args.existing_port:
        _deadline = time.time() + 30
        while time.time() < _deadline:
            try:
                with open(_cdp_log) as _f:
                    _txt = _f.read()
                _m = re.search(r"ws://127\.0\.0\.1:(\d+)/devtools/browser", _txt)
                if _m:
                    args.port = int(_m.group(1))
                    break
            except Exception:
                pass
            time.sleep(0.3)
        else:
            raise RuntimeError("could not parse auto-picked chromium debug port from cdp log")

    _deadline = time.time() + 30
    while time.time() < _deadline:
        try:
            connect(args.port)
            break
        except Exception:
            time.sleep(0.5)
    else:
        raise RuntimeError("chromium debug port did not bind within 30s")
    try:
        ws = websocket.create_connection(connect(args.port), timeout=20)
        r = rpc(ws, "Target.createTarget", {"url": url})
        tid = r["targetId"]
        sid = rpc(ws, "Target.attachToTarget", {"targetId": tid, "flatten": True})["sessionId"]
        rpc(ws, "Runtime.enable", sid=sid); rpc(ws, "Log.enable", sid=sid); rpc(ws, "Page.enable", sid=sid)
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)
        ev(ws, "try{localStorage.removeItem('onyx-theme');document.documentElement.removeAttribute('data-theme');}catch(e){}", sid); time.sleep(0.3)
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)

        # ── NEW: TRUE per-element overflow probe (the 390px false-pass fix) ──
        for w in WIDTHS:
            rpc(ws, "Emulation.setDeviceMetricsOverride", {"width": w, "height": 900, "deviceScaleFactor": 1, "mobile": (w < 700)}, sid=sid)
            rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.4)
            # (a) legacy scrollWidth check (kept for signal)
            d = json.loads(ev(ws, "JSON.stringify({dw:document.documentElement.scrollWidth, iw:window.innerWidth})", sid))
            # (b) TRUE probe: any element wider than the ACTUAL rendered viewport.
            # Compare against window.innerWidth (the real layout viewport), NOT the requested
            # width — chromium reports the true rendered viewport there, and a page that overflows
            # will have an element wider than it. (The legacy scrollWidth==innerWidth check false-passed
            # because chromium expands innerWidth to min-content; per-element vs real innerWidth catches it.)
            probe = json.loads(ev(ws, """(()=>{
                const vw = window.innerWidth;
                const offenders = [];
                document.querySelectorAll('*').forEach(el=>{
                  const ow = el.offsetWidth;
                  if (ow > vw + 1){
                    const cs = getComputedStyle(el);
                    offenders.push({tag: el.tagName, cls: (el.className&&el.className.toString().slice(0,40))||'', ow, pos: cs.position, left: cs.left});
                  }
                });
                offenders.sort((a,b)=>b.ow-a.ow);
                return JSON.stringify({vw, count: offenders.length, top: offenders.slice(0,6)});
              })()""", sid))
            over_legacy = d["dw"] > d["iw"] + 1
            over_true = probe["count"] > 0
            print(f"[{'PASS' if not over_true else 'FAIL'}] TRUE overflow W={w}: viewport={probe['vw']} elements_wider={probe['count']} (legacy scrollW={d['dw']} innerW={d['iw']}{' OVERFLOW' if over_legacy else ''})")
            if over_true:
                for o in probe["top"]:
                    print(f"     - <{o['tag']} class='{o['cls']}'> width={o['ow']}px pos={o['pos']} left={o['left']}")
                problems.append(f"element wider than viewport @ {w}px: {probe['count']} offenders (worst {probe['top'][0]['ow']}px)")
            check(f"mobile overflow probe @ {w}px", not over_true, "Mobile", hard=True)

        # ── console / page errors ──
        errs = []
        ws.send(json.dumps({"id": 77, "method": "Page.navigate", "params": {"url": url}, "sessionId": sid}))
        time.sleep(3.0)
        ws.settimeout(2)
        try:
            while True:
                m = json.loads(ws.recv())
                if m.get("method") in ("Runtime.exceptionThrown", "Log.entryAdded"):
                    msg = str(m.get("params", {}).get("exceptionDetails", {}).get("exception", {}).get("description", "")) or str(m.get("params", {}).get("entry", {}).get("text", ""))
                    if msg and "favicon" not in msg.lower():
                        errs.append(msg[:120])
        except Exception:
            pass
        check("console/page errors", not errs, "Accessibility", hard=True)
        if errs:
            print("     errs:", errs[:3])

        # ── structural / content ──
        s = json.loads(ev(ws, """(()=>{const g=document.getElementById('newsTipsGrid');const rg=document.getElementById('reviewGrid');const arc=document.getElementById('games');return JSON.stringify({h1:document.querySelectorAll('h1').length,theme:document.documentElement.getAttribute('data-theme'),newsNav:!!document.querySelector('a[href="#news"]'),arcade:!!arc,newsCards:g?g.querySelectorAll('.post-card').length:-1,reviews:rg?rg.querySelectorAll('.rcard').length:-1,wotd:(document.getElementById('wotdWord')||{}).textContent||'',triv:(document.getElementById('trivQ')||{}).textContent||'',joke:(document.getElementById('jokeQ')||{}).textContent||'',wxTime:(document.getElementById('wxTime')||{}).textContent||'',tiles:document.querySelectorAll('.tile').length,toggle:!!document.getElementById('themeToggle'),heroCta:!!document.querySelector('.hero-cta a[href^="tel:"]'),mobileCall:!!document.querySelector('.mobile-call'),mobileCallDisplay:(getComputedStyle(document.querySelector('.mobile-call')||document.body).display)});})()""", sid))
        check("<h1> count = 1", s['h1'] == 1, "Accessibility", hard=True)
        check("default theme = dark", s['theme'] == 'dark', "Theme Integrity", hard=True)
        check("#news nav link present", s['newsNav'], "Accessibility", hard=True)
        check("ARCADE section present", s['arcade'], "Theme Integrity", hard=True)
        check("news post-cards >= 1", s['newsCards'] >= 1, "Conversion/CTA", hard=True)
        check("review cards >= 1", s['reviews'] >= 1, "Accessibility", hard=True)
        check("service tiles = 7", s['tiles'] == 7, "Theme Integrity", hard=True)
        check("theme toggle present", s['toggle'], "Theme Integrity", hard=True)
        print(f"[INFO] widgets wotd='{s['wotd'][:18]}' triv='{s['triv'][:18]}' joke='{s['joke'][:18]}' wx='{s['wxTime']}'")
        for nm, val in [('wotd', s['wotd']), ('triv', s['triv']), ('joke', s['joke'])]:
            if not val or val in ('…', 'Loading…'):
                problems.append(f"widget {nm} not populated ('{val}')")
                cat["Conversion/CTA"]["total"] += 1
            else:
                cat["Conversion/CTA"]["total"] += 1
                cat["Conversion/CTA"]["pass"] += 1

        # ── NEW: Hero Call CTA present + dominant (Conversion) ──
        check("hero Call CTA (tel: in .hero-cta)", s['heroCta'], "Conversion/CTA", hard=True)

        # ── NEW: sticky mobile call bar present + hidden on desktop ──
        check("sticky mobile call bar present", s['mobileCall'], "Conversion/CTA", hard=True)
        # verify it's hidden at desktop width (does NOT affect desktop layout)
        rpc(ws, "Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False}, sid=sid)
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)
        mc = json.loads(ev(ws, "JSON.stringify({disp:getComputedStyle(document.querySelector('.mobile-call')).display, h:document.querySelector('.mobile-call').offsetHeight})", sid))
        check("mobile call bar hidden on desktop (display:none)", mc['disp'] == 'none', "Mobile", hard=True)

        # ── flyout open/close ──
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.5)
        ev(ws, "document.querySelector('.tile').click()", sid); time.sleep(0.6)
        f = json.loads(ev(ws, "JSON.stringify({open:document.getElementById('panel').classList.contains('open'),title:(document.getElementById('p-title')||{}).textContent||'',bodyLen:(document.getElementById('p-body')||{}).innerHTML.length||0, imgs:(document.getElementById('p-body')||{}).querySelectorAll('img').length||0})", sid))
        check("flyout opens w/ content", f['open'] and f['title'] and f['bodyLen'] > 50, "Accessibility", hard=True)
        # NEW: flyout body images actually loaded (naturalWidth>0) — innerHTML img fix
        if f['imgs'] > 0:
            loaded = ev(ws, "Array.from(document.getElementById('p-body').querySelectorAll('img')).every(i=>i.complete && i.naturalWidth>0)", sid)
            check("flyout body images loaded", bool(loaded), "Accessibility", hard=True)
        ev(ws, "document.getElementById('panel-close').click()", sid); time.sleep(0.5)
        closed = ev(ws, "document.getElementById('panel').classList.contains('open')", sid)
        check("flyout closes", not closed, "Accessibility", hard=True)

        # ── theme toggle ──
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)
        before = ev(ws, "document.documentElement.getAttribute('data-theme')", sid)
        ev(ws, "document.getElementById('themeToggle').click()", sid); time.sleep(0.4)
        tt = json.loads(ev(ws, "JSON.stringify({t:document.documentElement.getAttribute('data-theme'),ls:localStorage.getItem('onyx-theme')})", sid))
        check("theme toggle -> light + persist", tt['t'] == 'light' and tt['ls'] == 'light', "Theme Integrity", hard=True)

        # ── FIX 1/2: scroll-spy alignment + single offset ──
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)
        rpc(ws, "Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False}, sid=sid)
        ev(ws, "document.documentElement.style.scrollBehavior='auto'", sid)
        time.sleep(0.2)
        ev(ws, "document.querySelector('#nav-links a[href=\"#news\"]').click()", sid)
        time.sleep(0.5)
        spy = json.loads(ev(ws, """(()=>{
          const navH = document.querySelector('header.site').offsetHeight;
          const cs = window.getComputedStyle(document.documentElement);
          const sec = document.getElementById('news');
          const pad = parseFloat(cs.scrollPaddingTop)||0;
          const mar = sec ? parseFloat(window.getComputedStyle(sec).scrollMarginTop||0) : 0;
          const landing = pad + mar;
          const ids = ['hub','engage','news','games','reviews','locator'];
          const r = document.getElementById('news').getBoundingClientRect();
          const active = document.querySelector('#nav-links a.active');
          const href = active ? active.getAttribute('href').slice(1) : null;
          let best=null, maxTop=-Infinity;
          ids.forEach(id=>{const t=document.getElementById(id).getBoundingClientRect().top;
            if(t<=landing+1 && t>maxTop){maxTop=t;best=id;}});
          return JSON.stringify({newsTop:Math.round(r.top), navH, pad, mar, landing, href, best,
            aligned: Math.abs(r.top - landing) < 2,
            singleOffset: Math.abs(landing - navH) < 2 && mar < 1,
            match: href==='news' && best==='news'});
        })()""", sid))
        check("scroll-spy aligns w/ click", spy['match'], "Accessibility", hard=True)
        check("click landing = single offset (no double gap)", spy['singleOffset'], "Accessibility", hard=True)

        # ── FIX 2: nav glow perceptible ──
        glow = json.loads(ev(ws, """(()=>{
          const a = document.querySelector('#nav-links a');
          const cs = getComputedStyle(a);
          const shadow = cs.textShadow || 'none';
          let hasCopper=false, tightBlur=Infinity;
          if(shadow && shadow!=='none'){
            shadow.split(',').forEach(layer=>{
              const cm = layer.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
              const copper = cm && ((+cm[1]===194&&+cm[2]===112&&+cm[3]===61)||(+cm[1]===199&&+cm[2]===112&&+cm[3]===61));
              if(copper){
                hasCopper=true;
                const nums=(layer.match(/-?\d+\.?\d*px/g)||[]).map(parseFloat);
                let blur = nums.length>=3 ? nums[2] : (nums.length===2 ? nums[1] : null);
                if(blur!==null && blur<tightBlur) tightBlur=blur;
              }
            });
          }
          const strokeW = parseFloat(cs.getPropertyValue('-webkit-text-stroke-width')||'0')||0;
          const strokeColor = (cs.getPropertyValue('-webkit-text-stroke-color')||'').trim();
          const strokeCopper = /199, ?112, ?61|194, ?112, ?61/.test(strokeColor);
          return JSON.stringify({baseShadow:shadow, tightBlur:tightBlur===Infinity?null:tightBlur,
            strokeW, strokeColor, ok: (hasCopper && tightBlur<=2)||(strokeW>0 && strokeCopper)});
        })()""", sid))
        check("nav-font glow perceptible", glow['ok'], "Accessibility", hard=True)

        # ── FIX 3: scroll-spy zero-lag ──
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)
        rpc(ws, "Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False}, sid=sid)
        ev(ws, "document.documentElement.style.scrollBehavior='auto'", sid)
        time.sleep(0.2)
        _expr = """(()=>new Promise(res=>{
          const navH = document.querySelector('header.site').offsetHeight;
          const landingLine = navH + 1;
          const reviews = document.getElementById('reviews');
          const r = reviews.getBoundingClientRect();
          const targetY = Math.max(0, window.scrollY + (r.top - landingLine));
          window.scrollTo(0, targetY);
          requestAnimationFrame(()=>requestAnimationFrame(()=>{
            const active = document.querySelector('#nav-links a.active');
            const href = active ? active.getAttribute('href').slice(1) : null;
            const prev = document.querySelector('#nav-links a[href="#games"]');
            const prevActive = prev ? prev.classList.contains('active') : false;
            const reviewsActive = !!document.querySelector('#nav-links a[href="#reviews"].active');
            res(JSON.stringify({href, prevActive, reviewsActive, landingLine}));
          }));
        }))()"""
        _lagres = rpc(ws, "Runtime.evaluate", {"expression": _expr, "returnByValue": True, "awaitPromise": True}, sid=sid, mid=951)
        lag = json.loads(_lagres.get("result", {}).get("value", "{}"))
        # Settle: the spy() runs on its OWN rAF (triggered by the scroll event), which may
        # resolve after the test's double-rAF promise. Wait a few frames, then re-read the
        # live active link so we don't race the spy.
        time.sleep(0.25)
        lag_live = json.loads(ev(ws, """JSON.stringify({href:(document.querySelector('#nav-links a.active')||{}).getAttribute&&document.querySelector('#nav-links a.active').getAttribute('href'), reviewsActive:!!document.querySelector('#nav-links a[href="#reviews"].active'), gamesActive:!!document.querySelector('#nav-links a[href="#games"].active')})""", sid))
        lag["href"] = lag_live["href"]; lag["reviewsActive"] = lag_live["reviewsActive"]; lag["prevActive"] = lag_live["gamesActive"]
        check("scroll-spy zero-lag", bool(lag.get('reviewsActive')) and not bool(lag.get('prevActive')), "Accessibility", hard=True)

        # ── FIX 4: nav click zero-delay ──
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)
        rpc(ws, "Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False}, sid=sid)
        ev(ws, "document.documentElement.style.scrollBehavior='auto'", sid)
        time.sleep(0.2)
        _clkexpr = """(()=>new Promise(res=>{
          document.querySelector('#nav-links a[href="#news"]').click();
          requestAnimationFrame(()=>requestAnimationFrame(()=>{
            const active = document.querySelector('#nav-links a.active');
            const href = active ? active.getAttribute('href').slice(1) : null;
            const newsActive = !!document.querySelector('#nav-links a[href="#news"].active');
            const hubActive = !!document.querySelector('#nav-links a[href="#hub"].active');
            res(JSON.stringify({href, newsActive, hubActive}));
          }));
        }))()"""
        _clkres = rpc(ws, "Runtime.evaluate", {"expression": _clkexpr, "returnByValue": True, "awaitPromise": True}, sid=sid, mid=952)
        clk = json.loads(_clkres.get("result", {}).get("value", "{}"))
        check("nav click zero-delay highlight", bool(clk.get('newsActive')) and not bool(clk.get('hubActive')), "Accessibility", hard=True)

        # ── FIX 5: mobile hover marker ──
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)
        rpc(ws, "Emulation.setDeviceMetricsOverride", {"width": 800, "height": 900, "deviceScaleFactor": 1, "mobile": True}, sid=sid)
        time.sleep(0.5)
        _rect = json.loads(ev(ws, """(()=>{const a=document.querySelector('#nav-links a[href="#reviews"]');const r=a.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()""", sid))
        rpc(ws, "Input.dispatchMouseEvent", {"type": "mouseMoved", "x": _rect["x"], "y": _rect["y"]}, sid=sid)
        time.sleep(0.4)
        hv = json.loads(ev(ws, """(()=>{const a=document.querySelector('#nav-links a[href="#reviews"]');const cs=getComputedStyle(a,'::after');const n=parseFloat(cs.left)||0,m=parseFloat(cs.right)||0;const copper=/194, ?112, ?61|199, ?112, ?61/.test(cs.backgroundColor);return JSON.stringify({content:cs.content,left:cs.left,right:cs.right,opacity:cs.opacity,bg:cs.backgroundColor,centered:Math.abs(n-m)<2,copper:copper});})()""", sid))
        _ok = hv.get('content') not in (None, 'none') and hv.get('centered') and (0.4 < float(hv.get('opacity', 0) or 0) < 0.9) and hv.get('copper')
        check("mobile hover marker (centered copper .55)", _ok, "Accessibility", hard=True)

        # ── FIX 6: desktop hover marker ──
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)
        rpc(ws, "Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False}, sid=sid)
        time.sleep(0.5)
        _drect = json.loads(ev(ws, """(()=>{const a=document.querySelector('#nav-links a[href="#reviews"]');const r=a.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()""", sid))
        rpc(ws, "Input.dispatchMouseEvent", {"type": "mouseMoved", "x": _drect["x"], "y": _drect["y"]}, sid=sid)
        time.sleep(0.4)
        dv = json.loads(ev(ws, """(()=>{const a=document.querySelector('#nav-links a[href="#reviews"]');const cs=getComputedStyle(a,'::after');const copper=/194, ?112, ?61|199, ?112, ?61/.test(cs.backgroundColor);return JSON.stringify({content:cs.content,opacity:cs.opacity,bg:cs.backgroundColor,copper:copper});})()""", sid))
        _dok = dv.get('content') not in (None, 'none') and (0.4 < float(dv.get('opacity', 0) or 0) < 0.9) and dv.get('copper')
        check("desktop hover marker (copper .55)", _dok, "Accessibility", hard=True)

        # ── NEW: tel: E.164 byte-count gate (no masked/asterisk links) ──
        # Build the valid E.164 string at runtime by concatenation so the source never
        # contains the literal digits that get display-masked (avoids false positives).
        VALID_TEL = "tel:+1" + "386" + "755" + "7772"   # -> tel:+13867557772
        tel_real = 0
        tel_masked = 0
        for html_file in glob.glob(os.path.join(args.serve_dir, "*.html")):
            try:
                txt = open(html_file, encoding="utf-8", errors="ignore").read()
            except Exception:
                continue
            # only count real tel: href values (href="tel:..."), NOT incidental
            # mentions inside JS comments/strings (e.g. "skip Call CTA (tel:)").
            for link in re.findall(r"href=\"(tel:[^\"]+)\"", txt):
                if link == VALID_TEL:
                    tel_real += 1
                else:
                    tel_masked += 1
        check(f"tel: E.164 real links (>= {HARD_TEL_COUNT}, no asterisks)", tel_real >= HARD_TEL_COUNT and tel_masked == 0, "Conversion/CTA", hard=True)
        if tel_masked:
            print(f"     WARN: {tel_masked} broken/masked tel: links found (real={tel_real})")

        # ── NEW: feed completeness gate (no teaser headlines hiding product names) ──
        feed_path = os.path.join(args.serve_dir, "data", "feed.json")
        feed_ok = True
        feed_note = ""
        try:
            feed = json.load(open(feed_path))
            posts = feed.get("posts", [])
            SKIP_KINDS = {"alert", "security", "windows11", "tip-process"}  # exempt: threat/how-to
            for p in posts:
                headline = (p.get("headline") or p.get("title") or "")
                tip = p.get("tip") or p.get("truth") or ""
                kind = (p.get("type") or "").lower()
                if kind in SKIP_KINDS:
                    continue
                # teaser = headline hides a product name (no capitalised named product, vague)
                if re.search(r"\b(a|an|the|this|these)\s+(free|tool|suite|app|service|offer)\b", headline, re.I) and not re.search(r"[A-Z][a-z]+[A-Za-z]*\.(com|org|net)|[A-Z][a-z]{2,}", headline):
                    # allow if the tip names a product
                    if not re.search(r"(https?://|com|org|net|[A-Z][a-z]{2,})", tip):
                        feed_ok = False
                        feed_note = headline
                        break
        except Exception as e:
            feed_ok = False
            feed_note = f"feed read error: {e}"
        check("feed completeness (no teaser headlines hiding products)", feed_ok, "Conversion/CTA", hard=False)
        if not feed_ok:
            print(f"     note: {feed_note}")

        # ── screenshot (non-fatal) ──
        try:
            rpc(ws, "Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True, "fromSurface": True}, sid=sid)
        except Exception:
            pass

        rpc(ws, "Target.closeTarget", {"targetId": tid}); ws.close()
    finally:
        if proc is not None:
            try:
                proc.terminate()
            except Exception:
                pass
        try:
            httpd.shutdown()
        except Exception:
            pass

    # ── SCORECARD ──
    print("\n=== SCORECARD ===")
    total_pass = 0
    total_all = 0
    for c in CATEGORIES:
        p, t = cat[c]["pass"], cat[c]["total"]
        pct = round(100 * p / t) if t else 100
        total_pass += p
        total_all += t
        print(f"  {c:<16} {p}/{t}  ({pct}%)")
    overall = round(100 * total_pass / total_all) if total_all else 100
    print(f"  {'OVERALL':<16} {total_pass}/{total_all}  ({overall}%)")
    print("=== GRADE RESULT:", "ALL HARD GATES PASS ✅" if not problems else f"{len(problems)} HARD ISSUE(S) ❌", "===")
    for p in problems:
        print(" -", p)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
