"use strict";
/* ============================================================
   DATA BREAK — input (keyboard / mouse / touch / gamepad)
   World-space pointer + button state, consumed by the engine.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const S = {
    pointer: { x: 0, y: 0, wx: 0, wy: 0, tx: 0, ty: 0 },   // wx/wy raw world coords;
                                                            // tx/ty: tremor-smoothed world
                                                            // coords for touch drags only
    touchSamples: [],   // rolling world samples for sub-frame averaging (flat x0,y0,x1,y1...)
    pointerSet: false,  // true once the player has actually moved the pointer
    down: false,        // any primary pointer held
    pressed: false,     // rising edge this frame
    released: false,    // falling edge this frame
    keys: new Set(),
    justPressedKeys: new Set(),
    gamepad: null,
    padAxes: { x: 0 },
    padPressed: false,
    padPressedThisFrame: false,
    touchMode: false,
    lastInput: "none"   // "keys" | "pointer" | "pad" — last device that moved the paddle
  };

  const axisDead = 0.3;

  // sub-frame pointer averaging for touch drags: pointermove events can arrive
  // faster than the frame rate, so averaging the most recent world samples keeps
  // the paddle steady under finger micro-tremor. Mouse is never routed here.
  function pushTouchSample(wx, wy) {
    const n = R.Config.TOUCH_AVG_SAMPLES || 0;
    if (n <= 1) { S.pointer.tx = wx; S.pointer.ty = wy; return; }
    S.touchSamples.push(wx, wy);
    const max = n * 2;
    if (S.touchSamples.length > max) S.touchSamples.splice(0, S.touchSamples.length - max);
    let sx = 0, sy = 0;
    for (let i = 0; i < S.touchSamples.length; i += 2) { sx += S.touchSamples[i]; sy += S.touchSamples[i + 1]; }
    const c = S.touchSamples.length / 2;
    S.pointer.tx = sx / c;
    S.pointer.ty = sy / c;
  }

  function setup(engine) {
    const canvas = engine.canvas;
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const toWorld = (lx, ly) => {
      const p = engine.toWorld(lx, ly);
      S.pointer.wx = p.x; S.pointer.wy = p.y;
    };

    canvas.addEventListener("pointerdown", (e) => {
      engine.uiPointer(true);
      if (!S.down) { S.pressed = true; S.released = false; }
      S.down = true;
      S.touchMode = e.pointerType !== "mouse";
      S.pointerSet = true;
      S.lastInput = "pointer";
      const l = toLocal(e);
      S.pointer.x = l.x; S.pointer.y = l.y;
      toWorld(l.x, l.y);
      if (S.touchMode) {
        // fresh drag: start the smoothing window at the press point, no stale samples
        S.touchSamples.length = 0;
        pushTouchSample(S.pointer.wx, S.pointer.wy);
      }
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      S.pointerSet = true;
      // A hover move only counts as pointer input when the button is held or
      // the pointer already owns control — so a keyboard/gamepad player who
      // nudges the mouse mid-game never loses control to the parked cursor.
      if (S.down || S.lastInput === "pointer" || S.lastInput === "none") S.lastInput = "pointer";
      if (e.pointerType) S.touchMode = e.pointerType !== "mouse";
      const l = toLocal(e);
      S.pointer.x = l.x; S.pointer.y = l.y;
      toWorld(l.x, l.y);
      // touch-only smoothing: mouse stays raw 1:1
      if (S.touchMode) pushTouchSample(S.pointer.wx, S.pointer.wy);
    });
    const up = (e) => {
      if (S.down) { S.released = true; }
      S.down = false;
      const l = toLocal(e);
      toWorld(l.x, l.y);
      S.touchSamples.length = 0;
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (!S.keys.has(k)) S.justPressedKeys.add(k);
      S.keys.add(k);
      if (["arrowleft", "arrowright", "a", "d"].includes(k)) S.lastInput = "keys";
    });
    window.addEventListener("keyup", (e) => { S.keys.delete(e.key.toLowerCase()); });
    window.addEventListener("blur", () => { S.keys.clear(); S.down = false; });
  }

  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let g = null;
    for (const p of pads) { if (p && p.connected) { g = p; break; } }
    S.gamepad = g;
    if (g) {
      const ax = g.axes[0] || 0;
      S.padAxes.x = Math.abs(ax) > axisDead ? ax : 0;
      if (S.padAxes.x !== 0) S.lastInput = "pad";
      const btn = g.buttons[0];
      const p = btn && btn.pressed;
      if (p && !S.padPressed) S.padPressedThisFrame = true;
      S.padPressed = !!p;
    } else {
      S.padAxes.x = 0;
    }
  }

  function resetFrame() {
    S.pressed = false;
    S.released = false;
    S.justPressedKeys.clear();
    S.padPressedThisFrame = false;
  }

  // ---- helpers ----
  function key(k) { return S.keys.has(k); }
  function justKey(k) { return S.justPressedKeys.has(k); }
  function anyKey(...ks) { for (const k of ks) if (S.keys.has(k)) return true; return false; }
  function anyJustKey(...ks) { for (const k of ks) if (S.justPressedKeys.has(k)) return true; return false; }

  // axis: -1..1 for paddle movement (keyboard + gamepad)
  function axisX() {
    let x = 0;
    if (key("arrowleft") || key("a")) x -= 1;
    if (key("arrowright") || key("d")) x += 1;
    x += S.padAxes.x;
    return Math.max(-1, Math.min(1, x));
  }

  function launchPressed() {
    return S.pressed || justKey(" ") || S.padPressedThisFrame;
  }

  function pausePressed() {
    return justKey("p") || justKey("escape") || S.padPressedThisFrame;
  }

  R.Input = {
    state: S,
    setup, resetFrame, pollGamepad,
    key, justKey, anyKey, anyJustKey,
    axisX, launchPressed, pausePressed
  };
})(window.BREAK);
