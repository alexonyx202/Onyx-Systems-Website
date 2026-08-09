#!/usr/bin/env python3
"""
audit-cdp.py — headless layout + console + behavior audit for a static site.
NO puppeteer needed. Uses the already-installed Chromium over the DevTools Protocol.

Hardened launch (learned the hard way):
  - Pick a FREE debug port at runtime via socket.bind(('127.0.0.1',0)) then close it.
    NEVER hardcode a port (e.g. 9333) — leftover chromium from a prior run holds it
    and every later run dies with "Connection refused".
  - Use a UNIQUE temp --user-data-dir per run (tempfile.mkdtemp).
  - Wait ~6s after launch before hitting /json/version. On the snap chromium here,
    headless cold-start needs ~5s to bind the CDP port; 2.5s is too short -> refused.
  - Serve the site yourself with an in-process http.server (localhost/file:// nav is
    blocked by the Hermes browser tool for private addresses; CDP drives http:// fine).

What it checks at 1280/768/390:
  - horizontal overflow (doc.scrollWidth vs window.innerWidth)
  - exactly 1 <h1>
  - tel: link count + masked-tel detection ('****' inside a tel: href = dead button)
  - console errors / page exceptions
  - OPTIONAL: --shots DIR writes full-page PNGs (dark/light captured by caller).

Usage:
  python3 audit-cdp.py http://localhost:8771/ [chromium-path]
  python3 audit-cdp.py http://localhost:8771/ --shots /tmp/shots

Requires: websocket-client  (python3 -m pip install websocket-client)
Why CDP not puppeteer: puppeteer-core is NOT installed on this box; Chromium + the
websocket-client lib are. This script is self-contained.
"""
import sys, json, time, subprocess, os, signal, socket as pysock, tempfile, urllib.request, websocket, base64

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8771/"
CHROME = "chromium"
SHOTS = None
args = sys.argv[2:]
for i, a in enumerate(args):
    if a == "--shots" and i + 1 < len(args):
        SHOTS = args[i + 1]
    elif a.startswith("--shots="):
        SHOTS = a.split("=", 1)[1]
    elif not a.startswith("--"):
        CHROME = a
WIDTHS = [1280, 768, 390]


def rpc(ws, method, params=None, sid=None, mid=1):
    p = {"id": mid, "method": method}
    if params: p["params"] = params
    if sid: p["sessionId"] = sid
    ws.send(json.dumps(p))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == mid: return m.get("result")


def main():
    # FREE PORT (avoid stale-chromium collisions that cause "Connection refused")
    _s = pysock.socket(pysock.AF_INET, pysock.SOCK_STREAM)
    _s.bind(("127.0.0.1", 0)); PORT = _s.getsockname()[1]; _s.close()
    PROF = tempfile.mkdtemp(prefix="audit-cdp-")
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
         f"--user-data-dir={PROF}", f"--remote-debugging-port={PORT}", "--remote-allow-origins=*", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        # ~6s cold-start wait (snap chromium needs it; 2.5s is too short -> refused)
        for _ in range(60):
            try:
                ver = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=1).read())
                break
            except Exception:
                time.sleep(0.25)
        else:
            print("ERROR: Chromium CDP did not come up (stale chromium holding the port? kill leftover chromium)"); return 1
        ws_url = ver["webSocketDebuggerUrl"]
        failures = []
        for w in WIDTHS:
            ws = websocket.create_connection(ws_url, timeout=20)
            r = rpc(ws, "Target.createTarget", {"url": "about:blank"}); tid = r["targetId"]
            a = rpc(ws, "Target.attachToTarget", {"targetId": tid, "flatten": True}); sid = a["sessionId"]
            rpc(ws, "Page.enable", sid=sid); rpc(ws, "Runtime.enable", sid=sid); rpc(ws, "Log.enable", sid=sid)
            rpc(ws, "Emulation.setDeviceMetricsOverride", {"width": w, "height": 900, "deviceScaleFactor": 1, "mobile": (w < 700)}, sid=sid)
            rpc(ws, "Page.navigate", {"url": URL}, sid=sid); time.sleep(2.5)
            errs = []
            ws.settimeout(2)
            try:
                while True:
                    m = json.loads(ws.recv())
                    if m.get("method") in ("Runtime.exceptionThrown", "Log.entryAdded"):
                        errs.append(m["method"])
            except Exception:
                pass
            expr = """(()=>{const d=document.documentElement;const w=window.innerWidth;
              let ov=[];document.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();
              if(r.right>w+1.5&&r.width>0)ov.push(e.tagName+'.'+(e.className||'').toString().split(' ')[0]);});
              return JSON.stringify({docW:d.scrollWidth,winW:w,overflow:ov.slice(0,6),
              h1:document.querySelectorAll('h1').length,
              tel:document.querySelectorAll('a[href^="tel:"]').length,
              masked:document.querySelectorAll('a[href*="****"]').length});})()"""
            res = rpc(ws, "Runtime.evaluate", {"expression": expr, "returnByValue": True}, sid=sid)
            data = json.loads(res["result"]["result"]["value"])
            ox = data["docW"] > data["winW"]
            print(f"W={w:4d} overflowX={ox} docW={data['docW']} winW={data['winW']} h1={data['h1']} tel={data['tel']} masked={data['masked']} consoleErr={len(errs)}")
            if ox: failures.append(f"W={w} horizontal overflow")
            if data["h1"] != 1: failures.append(f"W={w} h1 count = {data['h1']} (want 1)")
            if data["masked"]: failures.append(f"W={w} {data['masked']} masked tel link(s)")
            if errs: failures.append(f"W={w} {len(errs)} console error(s)")
            if SHOTS:
                try:
                    sh = rpc(ws, "Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True, "fromSurface": True}, sid=sid)
                    os.makedirs(SHOTS, exist_ok=True)
                    open(f"{SHOTS}/site-{w}.png", "wb").write(base64.b64decode((sh or {}).get("data", "")))
                except Exception as e:
                    print(f"  (screenshot skipped: {e})")
            rpc(ws, "Target.closeTarget", {"targetId": tid}); ws.close()
        print("\nRESULT:", "PASS" if not failures else "FAIL -> " + "; ".join(failures))
        return 0 if not failures else 1
    finally:
        try:
            proc.send_signal(signal.SIGTERM); proc.wait(timeout=5)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    sys.exit(main())
