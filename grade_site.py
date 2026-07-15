#!/usr/bin/env python3
"""
grade_site.py — Deterministic pre-push grader for the CURRENT Onyx site DOM
(redesign 2026-07-14: #newsTipsGrid post-cards, single #reviewGrid, #themeToggle,
[data-theme] switch, 7 .tile flyouts, ARCADE verbatim).

WHY THIS EXISTS: the bundled audit_cdp.py is STALE — it keys off the old
composite-viewer DOM (featuredNews/newsGrid) and false-fails the new build.

KEY HARNESS LESSONS baked in:
  - Spawns its OWN http.server IN-PROCESS so the CDP client (same process =
    same netns) can always reach it. A server started in a separate terminal()
    call is unreachable here (per-session netns isolation).
  - Launches chromium with --user-data-dir=<unique tempdir> + --disable-dev-shm-usage
    or it won't bind --remote-debugging-port (ConnectionRefused).
  - Fresh tempfile.mkdtemp profile per run => localStorage never leaks between runs
    (a leaked onyx-theme=light once made the "default theme = dark" check fail).
  - Cold-start: sleep ~6s (not 2.5) after Popen; chromium (snap) binds the
    debug port slowly. Pick the debug port at runtime via bind(0).

Run:  python3 grade_site.py [--serve-dir /path]
Exits 0 only if ALL checks pass.
"""
import argparse, json, sys, time, base64, subprocess, os, tempfile, http.server, socketserver, threading, functools, socket as pysock
import websocket, urllib.request

WIDTHS = [1280, 768, 390]


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None)
    ap.add_argument("--serve-dir", default="/home/ai/onyx-systems-website")
    ap.add_argument("--existing-port", type=int, default=0,
                    help="Reuse an already-running chromium CDP port instead of launching a new one (use when the box is saturated with chrome procs).")
    args = ap.parse_args()

    # http server on a fixed localhost port is fine (in-process, same netns)
    args.http_port = 8099
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=args.serve_dir)
    httpd = socketserver.TCPServer(("127.0.0.1", args.http_port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = args.url or f"http://127.0.0.1:{args.http_port}/"
    print(f"[setup] serving {args.serve_dir} at {url}")

    problems = []

    if args.existing_port:
        args.port = args.existing_port
        print(f"[setup] reusing existing chromium CDP on port {args.port} (no new process)")
        proc = None
    else:
        # Pick a FREE debug port at runtime (bind(0)) so a leftover grader's bound
        # port can't collide with this run.
        _ss = pysock.socket(pysock.AF_INET, pysock.SOCK_STREAM)
        _ss.bind(("127.0.0.1", 0))
        args.port = _ss.getsockname()[1]
        _ss.close()
        profile_dir = tempfile.mkdtemp(prefix="onyx-grade-")
        proc = subprocess.Popen(
            ["chromium", "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
             "--disable-dev-shm-usage", f"--user-data-dir={profile_dir}",
             "--remote-debugging-port={args.port}", "--remote-allow-origins=*",
             "--window-size=1280,900", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Chromium (snap) can take longer than 6s to bind the debug port when the
    # box is under load (hundreds of other chrome procs). Poll /json/version
    # until it answers (up to 30s) instead of a fixed sleep that loses the race.
    _deadline = time.time() + 30
    while time.time() < _deadline:
        try:
            connect(args.port); break
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

        # When reusing a persistent browser (--existing-port), a prior run may have
        # leaked localStorage ('onyx-theme=light') into the shared profile, which would
        # make the "default theme = dark" check false-fail. Clear it so each run is clean.
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)
        ev(ws, "try{localStorage.removeItem('onyx-theme');document.documentElement.removeAttribute('data-theme');}catch(e){}", sid); time.sleep(0.3)
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)

        for w in WIDTHS:
            rpc(ws, "Emulation.setDeviceMetricsOverride", {"width": w, "height": 900, "deviceScaleFactor": 1, "mobile": (w < 700)}, sid=sid)
            rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.4)
            d = json.loads(ev(ws, "JSON.stringify({dw:document.documentElement.scrollWidth, iw:window.innerWidth})", sid))
            over = d["dw"] > d["iw"] + 1
            print(f"[{'PASS' if not over else 'FAIL'}] overflow W={w}: scrollW={d['dw']} innerW={d['iw']}")
            if over:
                problems.append(f"horizontal overflow @ {w}px")

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
        print(f"[{'PASS' if not errs else 'FAIL'}] console/page errors: {errs if errs else 'NONE'}")
        if errs:
            problems.append("console/page errors: " + "; ".join(errs[:3]))

        s = json.loads(ev(ws, """(()=>{const g=document.getElementById('newsTipsGrid');const rg=document.getElementById('reviewGrid');const arc=document.getElementById('games');return JSON.stringify({h1:document.querySelectorAll('h1').length,theme:document.documentElement.getAttribute('data-theme'),newsNav:!!document.querySelector('a[href="#news"]'),arcade:!!arc,newsCards:g?g.querySelectorAll('.post-card').length:-1,reviews:rg?rg.querySelectorAll('.rcard').length:-1,wotd:(document.getElementById('wotdWord')||{}).textContent||'',triv:(document.getElementById('trivQ')||{}).textContent||'',joke:(document.getElementById('jokeQ')||{}).textContent||'',wxTime:(document.getElementById('wxTime')||{}).textContent||'',tiles:document.querySelectorAll('.tile').length,toggle:!!document.getElementById('themeToggle')});})()""", sid))
        print(f"[{'PASS' if s['h1']==1 else 'FAIL'}] <h1> count = {s['h1']} (want 1)")
        if s['h1'] != 1:
            problems.append("h1 != 1")
        print(f"[{'PASS' if s['theme']=='dark' else 'FAIL'}] default theme = {s['theme']}")
        if s['theme'] != 'dark':
            problems.append("default theme not dark")
        print(f"[{'PASS' if s['newsNav'] else 'FAIL'}] #news nav link present")
        if not s['newsNav']:
            problems.append("missing #news nav")
        print(f"[{'PASS' if s['arcade'] else 'FAIL'}] ARCADE section present")
        if not s['arcade']:
            problems.append("ARCADE section missing")
        print(f"[{'PASS' if s['newsCards']>=1 else 'FAIL'}] news post-cards = {s['newsCards']}")
        if s['newsCards'] < 1:
            problems.append("news grid empty")
        print(f"[{'PASS' if s['reviews']>=1 else 'FAIL'}] review cards = {s['reviews']}")
        if s['reviews'] < 1:
            problems.append("reviews empty")
        print(f"[{'PASS' if s['tiles']==7 else 'FAIL'}] service tiles = {s['tiles']} (want 7)")
        if s['tiles'] != 7:
            problems.append(f"tiles = {s['tiles']} (want 7)")
        print(f"[{'PASS' if s['toggle'] else 'FAIL'}] theme toggle present")
        if not s['toggle']:
            problems.append("no theme toggle")
        print(f"[INFO] widgets wotd='{s['wotd'][:18]}' triv='{s['triv'][:18]}' joke='{s['joke'][:18]}' wx='{s['wxTime']}'")
        for nm, val in [('wotd', s['wotd']), ('triv', s['triv']), ('joke', s['joke'])]:
            if not val or val in ('…', 'Loading…'):
                problems.append(f"widget {nm} not populated ('{val}')")

        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.5)
        ev(ws, "document.querySelector('.tile').click()", sid); time.sleep(0.6)
        f = json.loads(ev(ws, "JSON.stringify({open:document.getElementById('panel').classList.contains('open'),title:(document.getElementById('p-title')||{}).textContent||'',bodyLen:(document.getElementById('p-body')||{}).innerHTML.length||0})", sid))
        print(f"[{'PASS' if f['open'] and f['title'] and f['bodyLen']>50 else 'FAIL'}] flyout opens: open={f['open']} title='{f['title']}' bodyLen={f['bodyLen']}")
        if not (f['open'] and f['title'] and f['bodyLen'] > 50):
            problems.append("flyout panel did not open with content")
        ev(ws, "document.getElementById('panel-close').click()", sid); time.sleep(0.5)
        closed = ev(ws, "document.getElementById('panel').classList.contains('open')", sid)
        print(f"[{'PASS' if not closed else 'FAIL'}] flyout closes: open={closed}")
        if closed:
            problems.append("flyout did not close")

        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)
        before = ev(ws, "document.documentElement.getAttribute('data-theme')", sid)
        ev(ws, "document.getElementById('themeToggle').click()", sid); time.sleep(0.4)
        tt = json.loads(ev(ws, "JSON.stringify({t:document.documentElement.getAttribute('data-theme'),ls:localStorage.getItem('onyx-theme')})", sid))
        print(f"[{'PASS' if tt['t']=='light' and tt['ls']=='light' else 'FAIL'}] theme toggle: {before} -> {tt['t']} (localStorage={tt['ls']})")
        if not (tt['t'] == 'light' and tt['ls'] == 'light'):
            problems.append("theme toggle did not switch to light+persist")

        # FIX 1 verification — scroll-spy underline must align with the click-landing line.
        # A nav click lands a section top at scroll-margin-top = var(--nav-h) = header height.
        # The active link should match the section whose top is the largest value <= navH+1.
        # Use a REAL click (disable smooth scroll for determinism) and wait for the IO to fire.
        rpc(ws, "Page.navigate", {"url": url}, sid=sid); time.sleep(1.0)
        rpc(ws, "Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False}, sid=sid)
        ev(ws, "document.documentElement.style.scrollBehavior='auto'", sid)  # kill smooth-scroll for instant landing
        time.sleep(0.2)
        ev(ws, "document.querySelector('#nav-links a[href=\"#news\"]').click()", sid)  # real click → scrolls #news to landing line
        time.sleep(0.7)  # let the IntersectionObserver recompute .active
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
          return JSON.stringify({newsTop:Math.round(r.top), navH, landing, href, best,
            aligned: Math.abs(r.top - landing) < 2, match: href==='news' && best==='news'});
        })()""", sid))
        print(f"[{'PASS' if spy['match'] else 'FAIL'}] scroll-spy aligns with click: news.top={spy['newsTop']} landing={spy['landing']} active='{spy['href']}' expected='news' clickAligned={spy['aligned']}")
        if not spy['match']:
            problems.append(f"scroll-spy misaligned: active='{spy['href']}' expected='news' (newsTop={spy['newsTop']}, landing={spy['landing']})")

        # FIX 2 verification — faint always-on copper text-shadow on nav font.
        glow = json.loads(ev(ws, """(()=>{
          const a = document.querySelector('#nav-links a');
          const cs = getComputedStyle(a);
          return JSON.stringify({
            baseShadow: cs.textShadow,
            on: /rgba?\\(194, ?112, ?61/.test(cs.textShadow) || /rgba?\\(199, ?112, ?61/.test(cs.textShadow)
          });
        })()""", sid))
        print(f"[{'PASS' if glow['on'] else 'FAIL'}] nav-font glow present: baseTextShadow='{glow['baseShadow']}'")
        if not glow['on']:
            problems.append("nav-font copper text-shadow not applied")

        rpc(ws, "Target.closeTarget", {"targetId": tid}); ws.close()
    finally:
        if proc is not None:
            proc.terminate()
        try:
            httpd.shutdown()
        except Exception:
            pass
    print("\n=== GRADE RESULT:", "ALL PASS ✅" if not problems else f"{len(problems)} ISSUE(S) ❌", "===")
    for p in problems:
        print(" -", p)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
