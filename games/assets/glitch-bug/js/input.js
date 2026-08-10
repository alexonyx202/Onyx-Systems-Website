/* ============================================================
   GLITCH BUG — input.js
   Keyboard / mouse / touch unified input.
   ============================================================ */
'use strict';

const Input = (function () {
  const down = {};       // keyCode -> true
  const pressed = {};    // keyCode -> consumed once
  const held = {};       // keyCode -> accumulated frames held

  /* ---------------- REBINDABLE ACTIONS ---------------- */
  const DEFAULT_BINDINGS = {
    up:      ['ArrowUp', 'KeyW'],
    down:    ['ArrowDown', 'KeyS'],
    left:    ['ArrowLeft', 'KeyA'],
    right:   ['ArrowRight', 'KeyD'],
    fire:    ['Space', 'KeyJ', 'KeyZ'],
    bomb:    ['KeyB', 'KeyX'],
    missile: ['KeyK', 'ShiftLeft', 'ShiftRight'],
    pause:   ['KeyP', 'Escape'],
  };
  const ACTION_LABELS = {
    up: 'MOVE UP', down: 'MOVE DOWN', left: 'MOVE LEFT', right: 'MOVE RIGHT',
    fire: 'FIRE', bomb: 'DETONATE BOMB', missile: 'SMART MISSILE', pause: 'PAUSE',
  };

  // keys that stay reserved regardless of bindings (menu confirm, mute,
  // fullscreen) — never rebindable so a shortcut can't be stolen mid-game
  // movement keys are fully rebindable via the up/down/left/right actions
  const BASE_KEYS = ['Enter', 'KeyM', 'KeyF'];
  // modifier / system keys that are never captured as a rebind target
  const NO_CAPTURE = new Set([
    'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
    'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock', 'NumLock', 'ScrollLock',
  ]);

  let bindings = loadBindings();
  let gameKeys = null;
  function rebuildKeys() {
    const s = new Set(BASE_KEYS);
    for (const a in bindings) for (const k of bindings[a]) s.add(k);
    gameKeys = s;
  }
  rebuildKeys();

  function loadBindings() {
    const saved = Store.get('bindings', null);
    const out = {};
    const seen = new Set();
    // sanitize saved data: drop reserved keys (never legitimately bound),
    // dedupe within and across actions. Defaults are trusted as-is.
    const clean = (arr) => {
      const kept = [];
      for (const k of arr) {
        if (BASE_KEYS.indexOf(k) === -1 && !seen.has(k)) { seen.add(k); kept.push(k); }
      }
      return kept;
    };
    for (const a in DEFAULT_BINDINGS) {
      const v = saved && saved[a];
      const base = (Array.isArray(v) && v.length && v.every(k => typeof k === 'string')) ? v.slice() : DEFAULT_BINDINGS[a].slice();
      out[a] = clean(base);
      if (!out[a].length) out[a] = clean(DEFAULT_BINDINGS[a]);
    }
    return out;
  }
  function saveBindings() { Store.set('bindings', bindings); rebuildKeys(); }

  /* ---------------- ACTION QUERIES ---------------- */
  function actionDown(a) { const ks = bindings[a]; for (let i = 0; i < ks.length; i++) if (down[ks[i]]) return true; return false; }
  function actionPressed(a) { const ks = bindings[a]; for (let i = 0; i < ks.length; i++) if (pressed[ks[i]]) return true; return false; }
  function isBound(a, code) { return !!bindings[a] && bindings[a].indexOf(code) !== -1; }

  /* ---------------- REBIND (per-action key sets) ---------------- */
  // Steal-safe ADD: appends keys to an action WITHOUT dropping its existing
  // keys, so fire can keep SPACE plus a custom key. Never leaves any action
  // with zero keys. Returns { ok:true, added, dropped, already } on success
  // (added = newly bound, dropped = blocked because they're another action's
  // last key, already = were already bound to this action) or { ok:false, reason }.
  function addKeys(action, codes) {
    if (!bindings[action]) return { ok: false, reason: 'unknown action' };
    const cleaned = [];
    for (const c of codes) {
      if (isCapturable(c) && cleaned.indexOf(c) === -1) cleaned.push(c);
    }
    if (!cleaned.length) return { ok: false, reason: 'reserved key' };
    const added = [], dropped = [], already = [];
    let blockedBy = null;
    for (const code of cleaned) {
      if (bindings[action].indexOf(code) !== -1) { already.push(code); continue; }
      // can we steal this code from other actions? only if they'd keep >=1 key
      let stealable = true, blocker = null;
      for (const a in bindings) {
        if (a === action) continue;
        const idx = bindings[a].indexOf(code);
        if (idx !== -1) {
          if (bindings[a].length <= 1) { stealable = false; blocker = ACTION_LABELS[a]; break; }
        }
      }
      if (!stealable) { if (!blockedBy) blockedBy = blocker; dropped.push(code); continue; }
      for (const a in bindings) {
        if (a === action) continue;
        const idx = bindings[a].indexOf(code);
        if (idx !== -1) bindings[a].splice(idx, 1);
      }
      added.push(code);
    }
    if (!added.length) {
      if (already.length) return { ok: true, added: [], dropped, already };
      return { ok: false, reason: blockedBy || 'key in use' };
    }
    bindings[action] = bindings[action].concat(added);
    saveBindings();
    return { ok: true, added, dropped, already };
  }
  function addKey(action, code) { return addKeys(action, [code]); }

  // REMOVE a single key from an action. Never removes the last key (that
  // would break the action entirely). Returns { ok:true } or { ok:false, reason }.
  function removeKey(action, code) {
    if (!bindings[action]) return { ok: false, reason: 'unknown action' };
    const idx = bindings[action].indexOf(code);
    if (idx === -1) return { ok: false, reason: 'not bound' };
    if (bindings[action].length <= 1) return { ok: false, reason: 'last key' };
    bindings[action].splice(idx, 1);
    saveBindings();
    return { ok: true };
  }
  // a key can be rebound only if it's not a modifier/system key or a reserved
  // movement/menu key (those would break core controls)
  function isCapturable(code) {
    return !NO_CAPTURE.has(code) && BASE_KEYS.indexOf(code) === -1;
  }

  function resetBindings() {
    for (const a in DEFAULT_BINDINGS) bindings[a] = DEFAULT_BINDINGS[a].slice();
    saveBindings();
    return getBindings();
  }
  function getBindings() {
    const out = {};
    for (const a in bindings) out[a] = bindings[a].slice();
    return out;
  }

  /* Human-readable label for a keyboard event code */
  const CODE_LABELS = {
    Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', Tab: 'TAB', Backspace: 'BKSP', Delete: 'DEL',
    ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', ControlRight: 'CTRL',
    AltLeft: 'ALT', AltRight: 'ALT', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN', Insert: 'INS', Backquote: '`',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
    Quote: "'", Comma: ',', Period: '.', Slash: '/', Numpad0: '0', Numpad1: '1', Numpad2: '2',
    Numpad3: '3', Numpad4: '4', Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9',
  };
  function bindingLabel(code) {
    if (CODE_LABELS[code]) return CODE_LABELS[code];
    const m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
    const d = /^Digit([0-9])$/.exec(code); if (d) return d[1];
    const f = /^F([1-9]|1[0-2])$/.exec(code); if (f) return 'F' + f[1];
    return code.replace(/^Numpad/, 'NUM').replace(/^Key/, '');
  }

  const state = {
    mouseX: 160, mouseY: 128,
    mouseDown: false,
    mouseActive: false,
    touchMode: false,
    touchX: 160, touchY: 128,
    padX: 0, padY: 0,
  };

  /* ---------------- GAMEPAD ----------------
     Standard Web mapping (Xbox-style): A/B/X/Y = buttons 0-3, LB/RB = 4/5,
     Start = 9, Back/Select = 8, D-Pad = 12-15, left stick = axes 0/1. The
     stick is deadzoned and the vector normalized, and hold-vs-press is
     separated by caching the previous frame's button bitset (a held button
     only ever reports one 'pressed' edge). Gamepad input yields to
     keyboard/mouse automatically: _gpadActive is true only while the player
     is actually using the pad. */
  const GP_DEADZONE = 0.25;
  const GP_ACTIONS = {
    fire:    (1 << 0) | (1 << 7), // A or right trigger
    bomb:    (1 << 1) | (1 << 4), // B or LB
    missile: (1 << 2) | (1 << 5), // X or RB
    pause:   1 << 9,              // Start
    select:  1 << 8,              // Back/Select — tap: theme cycle, hold: pause (UI watchdog)
  };
  // note: gamepadActive (below) is about MOVEMENT only — see pollGamepad
  let _gpadConnected = false;
  let _gpadId = '';
  let _gpadX = 0, _gpadY = 0;
  let _gpadButtons = 0; // held this frame (bit i = button i pressed)
  let _gpadPressed = 0; // edge: pressed this frame but not last
  let _gpadLatch = 0; // edges ACCUMULATED until the UI consumes them
  let _gpadDirLatch = 0; // direction edges: 1=down 2=up 4=right 8=left
  let _gpadDirY = 0, _gpadDirX = 0; // last quantized direction (change detect)
  let _gpadActive = false; // meaningful gamepad input this frame

  const listeners = [];

  function on(type, fn) { listeners.push([type, fn]); window.addEventListener(type, fn); }
  function offAll() {
    for (const [t, fn] of listeners) window.removeEventListener(t, fn);
    listeners.length = 0;
  }

  function keyName(e) {
    const map = {
      'ArrowUp': 'UP', 'ArrowDown': 'DOWN', 'ArrowLeft': 'LEFT', 'ArrowRight': 'RIGHT',
      'KeyW': 'W', 'KeyA': 'A', 'KeyS': 'S', 'KeyD': 'D',
      'Space': 'SPACE', 'KeyJ': 'J', 'KeyK': 'K', 'KeyB': 'B', 'KeyX': 'X',
      'KeyP': 'P', 'Escape': 'ESC', 'KeyM': 'M', 'Enter': 'ENTER',
      'ShiftLeft': 'SHIFT', 'ShiftRight': 'SHIFT', 'KeyZ': 'Z', 'Numpad0': '0',
    };
    return map[e.code] || e.code;
  }

  on('keydown', (e) => {
    if (gameKeys.has(e.code)) {
      e.preventDefault();
      if (!down[e.code]) pressed[e.code] = true;
      down[e.code] = true;
    }
    // notify UI/global key handlers (menus, initials entry)
    onKeyDown && onKeyDown(e);
  });
  on('keyup', (e) => {
    down[e.code] = false;
    onKeyUp && onKeyUp(e);
  });
  on('blur', () => { for (const k in down) down[k] = false; });
  on('gamepadconnected', (e) => { _gpadConnected = true; _gpadId = (e.gamepad && e.gamepad.id) || ''; });
  on('gamepaddisconnected', () => { _gpadConnected = false; _gpadId = ''; _gpadActive = false; _gpadX = 0; _gpadY = 0; _gpadButtons = 0; _gpadPressed = 0; _gpadLatch = 0; _gpadDirLatch = 0; _gpadDirY = 0; _gpadDirX = 0; });

  let onKeyDown = null;
  let onKeyUp = null;
  function setKeyHandler(fn) { onKeyDown = fn; }
  function setKeyUpHandler(fn) { onKeyUp = fn; }

  // mouse / touch on canvas
  const canvas = null; // bound later
  function bindCanvas(cv) {
    cv.addEventListener('mousemove', (e) => {
      const r = cv.getBoundingClientRect();
      state.mouseX = (e.clientX - r.left) / r.width * 320;
      state.mouseY = (e.clientY - r.top) / r.height * 256;
      state.mouseActive = true;
    });
    cv.addEventListener('mousedown', (e) => {
      e.preventDefault();
      state.mouseDown = true;
    });
    window.addEventListener('mouseup', () => { state.mouseDown = false; });

    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouch) {
      cv.addEventListener('touchstart', (e) => {
        e.preventDefault();
        state.touchMode = true;
        const t = e.touches[0];
        const r = cv.getBoundingClientRect();
        state.touchX = (t.clientX - r.left) / r.width * 320;
        state.touchY = (t.clientY - r.top) / r.height * 256;
      }, { passive: false });
      cv.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        const r = cv.getBoundingClientRect();
        state.touchX = (t.clientX - r.left) / r.width * 320;
        state.touchY = (t.clientY - r.top) / r.height * 256;
      }, { passive: false });
      cv.addEventListener('touchend', (e) => { e.preventDefault(); }, { passive: false });
    }
  }

  /* Poll the first connected gamepad each frame and reduce it to a deadzoned,
     normalized direction vector plus held/pressed button bitsets. Handles the
     browser quirk where getGamepads() can throw or return null entries. */
  function pollGamepad() {
    let gp = null;
    try {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < gps.length; i++) if (gps[i] && gps[i].connected) { gp = gps[i]; break; }
    } catch (e) { gp = null; }
    if (!gp) {
      _gpadX = 0; _gpadY = 0; _gpadActive = false; _gpadPressed = 0; _gpadButtons = 0;
      return;
    }
    const prev = _gpadButtons;
    let cur = 0;
    const b = gp.buttons || [];
    for (let i = 0; i < b.length; i++) if (b[i] && b[i].pressed) cur |= 1 << i;
    // left stick with a deadzone, D-Pad overriding it
    let vx = Math.abs(gp.axes[0] || 0) > GP_DEADZONE ? gp.axes[0] : 0;
    let vy = Math.abs(gp.axes[1] || 0) > GP_DEADZONE ? gp.axes[1] : 0;
    if (cur & (1 << 14)) vx = -1; else if (cur & (1 << 15)) vx = 1;
    if (cur & (1 << 12)) vy = -1; else if (cur & (1 << 13)) vy = 1;
    const m = Math.hypot(vx, vy);
    if (m > 1) { vx /= m; vy /= m; }
    _gpadX = vx; _gpadY = vy;
    // 'active' means MOVEMENT input (stick/D-Pad engaged) — button-only holds
    // (e.g. A to fire) must not hijack mouse movement for hybrid players
    _gpadActive = m > 0.01;
    _gpadButtons = cur;
    _gpadPressed = cur & ~prev;
    // latch edges for the UI: the menu watchdog ticks ~8x/sec but a button
    // press edge only lives for one game step (~16ms), so unlatched presses
    // would be missed. The UI consumes via gamepadConsumePressed().
    _gpadLatch |= _gpadPressed;
    // same for direction: a quick stick flick / D-Pad tap can be shorter
    // than a watchdog tick, so latch the quantized direction on CHANGE
    // (hold-repeat is driven by the live vector in the UI poll)
    const qy = vy < -0.5 ? -1 : vy > 0.5 ? 1 : 0;
    const qx = vx < -0.5 ? -1 : vx > 0.5 ? 1 : 0;
    if (qy !== 0 && qy !== _gpadDirY) _gpadDirLatch |= qy === -1 ? 2 : 1;
    if (qx !== 0 && qx !== _gpadDirX) _gpadDirLatch |= qx === -1 ? 8 : 4;
    _gpadDirY = qy; _gpadDirX = qx;
  }

  function gamepadActionHeld(a) { const mask = GP_ACTIONS[a] || 0; return !!(_gpadButtons & mask); }
  function gamepadActionPressed(a) { const mask = GP_ACTIONS[a] || 0; return !!(_gpadPressed & mask); }
  /* UI-side consumption: read a latched edge for an action and clear just
     that action's bits, so one physical press fires exactly one menu action.
     resetGamepadLatch() drops everything (called when the UI state changes,
     so stale gameplay presses can never fire menu actions). */
  function gamepadConsumePressed(a) {
    const mask = GP_ACTIONS[a] || 0;
    const v = !!(_gpadLatch & mask);
    _gpadLatch &= ~mask;
    return v;
  }
  function gamepadConsumeDirY() { const v = (_gpadDirLatch & 2) ? -1 : (_gpadDirLatch & 1) ? 1 : 0; _gpadDirLatch &= ~3; return v; }
  function gamepadConsumeDirX() { const v = (_gpadDirLatch & 8) ? -1 : (_gpadDirLatch & 4) ? 1 : 0; _gpadDirLatch &= ~12; return v; }
  function resetGamepadLatch() { _gpadLatch = 0; _gpadDirLatch = 0; _gpadDirY = 0; _gpadDirX = 0; }

  function update() {
    pollGamepad();
    // keyboard vector — follows the rebindable movement actions
    let kx = 0, ky = 0;
    if (actionDown('left')) kx -= 1;
    if (actionDown('right')) kx += 1;
    if (actionDown('up')) ky -= 1;
    if (actionDown('down')) ky += 1;
    state.padX = kx; state.padY = ky;

    // clear pressed flags (after frames update) — done in endFrame
  }

  function endFrame() {
    for (const k in pressed) delete pressed[k];
  }

  return {
    bindCanvas, update, endFrame,
    setKeyHandler, setKeyUpHandler, offAll,
    keyName,
    isDown(code) { return !!down[code]; },
    wasPressed(code) { return !!pressed[code]; },
    actionDown, actionPressed, isBound,
    addKey, addKeys, removeKey, resetBindings, getBindings, isCapturable,
    get actionLabels() { return ACTION_LABELS; },
    getActionCodes(a) { return bindings[a] ? bindings[a].slice() : []; },
    bindingLabel,
    get padX() { return state.padX; },
    get padY() { return state.padY; },
    get mouseX() { return state.mouseX; },
    get mouseY() { return state.mouseY; },
    get mouseDown() { return state.mouseDown; },
    get mouseActive() { return state.mouseActive; },
    setMouseActive(v) { state.mouseActive = v; },
    get touchMode() { return state.touchMode; },
    get touchX() { return state.touchX; },
    get touchY() { return state.touchY; },
    get gamepadConnected() { return _gpadConnected; },
    get gamepadId() { return _gpadId; },
    get gamepadActive() { return _gpadActive; },
    get gamepadX() { return _gpadX; },
    get gamepadY() { return _gpadY; },
    gamepadActionHeld, gamepadActionPressed,
    gamepadConsumePressed, gamepadConsumeDirY, gamepadConsumeDirX, resetGamepadLatch,
  };
})();
