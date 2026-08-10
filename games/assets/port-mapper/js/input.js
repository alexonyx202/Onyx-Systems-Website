/* =========================================================================
   PORT MAPPER — input.js
   Keyboard (diamond keys + arrows + numpad), gamepad and touch.

   Control scheme matches the original Q*Bert arcade cabinet, whose 4-way
   joystick was mounted at a 45° angle. The four arrow keys circle the
   pyramid's four diagonal axes:

        ↑ = up-right (↗)          W E        (diamond keys)
      ←   → = up-left / down-right   A D
        ↓ = down-left (↙)
   ========================================================================= */
window.PM = window.PM || {};

PM.Input = (function () {
  'use strict';

  const DL = 'DL', DR = 'DR', UL = 'UL', UR = 'UR';

  // Single-key mapping to the four diagonals.
  // Arrows (rotated joystick): ← ↖ · ↑ ↗ · → ↘ · ↓ ↙
  const DIRECT = {
    KeyW: UL, KeyE: UR, KeyA: DL, KeyD: DR,
    ArrowLeft: UL, ArrowUp: UR, ArrowRight: DR, ArrowDown: DL,
    Numpad7: UL, Numpad9: UR, Numpad1: DL, Numpad3: DR,
  };
  const GAME_KEYS = [
    'KeyW', 'KeyE', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Numpad7', 'Numpad9', 'Numpad1', 'Numpad3', 'Space', 'Enter', 'NumpadEnter',
  ];

  let held = new Set();      // currently-held physical keys
  let virtual = new Set();   // touch-button held directions
  let queue = [];            // direction input queue (last wins, max 2)
  let handler = null;        // system-key dispatcher (set by Game or UI)
  let padDir = null;         // current gamepad diagonal

  function isMove(code) { return code in DIRECT; }

  /* Resolve the current intended direction from held keys. */
  function resolveDir() {
    for (const k in DIRECT) {
      if (held.has(k)) return DIRECT[k];
    }
    if (virtual.has(UL)) return UL;
    if (virtual.has(UR)) return UR;
    if (virtual.has(DL)) return DL;
    if (virtual.has(DR)) return DR;
    if (padDir) return padDir;
    return null;
  }

  function pushDir(dir) {
    if (!dir) return;
    queue.push(dir);
    if (queue.length > 2) queue.shift();
  }

  function onKeyDown(e) {
    const code = e.code;
    if (GAME_KEYS.indexOf(code) >= 0) e.preventDefault();
    if (isMove(code)) {
      if (!held.has(code)) {
        held.add(code);
        pushDir(resolveDir());
      }
    }
    if (handler) handler(code, e);
  }

  function onKeyUp(e) {
    const code = e.code;
    if (!isMove(code)) return;
    held.delete(code);
    const d = resolveDir();
    if (d) pushDir(d);
  }

  /* Touch: virtual diagonal buttons (diamond pad). */
  function virtualPress(dir, down) {
    if (down) { virtual.add(dir); pushDir(dir); }
    else { virtual.delete(dir); const d = resolveDir(); if (d) pushDir(d); }
  }

  /* Gamepad: left stick / d-pad mapped by quadrant (the rotated joystick). */
  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = pads[0];
    if (!g || !g.connected) { padDir = null; return; }
    let x = 0, y = 0;
    if (g.axes && g.axes.length >= 2) { x = g.axes[0]; y = g.axes[1]; }
    const buttons = g.buttons || [];
    if (buttons[12] && buttons[12].pressed) x = -1;
    if (buttons[13] && buttons[13].pressed) x = 1;
    if (buttons[14] && buttons[14].pressed) y = -1;
    if (buttons[15] && buttons[15].pressed) y = 1;
    const dead = 0.45;
    if (Math.abs(x) < dead && Math.abs(y) < dead) { padDir = null; return; }
    if (y > dead && x > dead) padDir = DR;
    else if (y > dead && x < -dead) padDir = DL;
    else if (y < -dead && x < -dead) padDir = UL;
    else if (y < -dead && x > dead) padDir = UR;
    else if (y > dead) padDir = x > 0 ? DR : DL;
    else if (y < -dead) padDir = x > 0 ? UR : UL;
    else if (x > dead) padDir = DR;
    else padDir = DL;
  }

  function init() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => { held.clear(); });
  }

  /* The game consumes directions each frame when the player is idle. */
  function consumeDir() {
    if (queue.length) return queue.shift();
    return null;
  }
  function heldDir() { return resolveDir(); }
  function clearQueue() { queue.length = 0; }
  function setHandler(fn) { handler = fn; }

  return {
    init, pollGamepad, virtualPress, consumeDir, heldDir, clearQueue, setHandler,
    isMove, DL, DR, UL, UR,
  };
})();
