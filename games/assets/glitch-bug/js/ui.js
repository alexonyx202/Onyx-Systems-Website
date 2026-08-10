/* ============================================================
   GLITCH BUG — ui.js
   Boot sequence, menus, high scores, initials entry,
   pause & game-over overlays, global key handling.
   ============================================================ */
'use strict';

const UI = (function () {
  const $ = (id) => document.getElementById(id);

  const PANELS = {
    boot: $('bootPanel'), menu: $('menuPanel'), diff: $('diffPanel'),
    sound: $('soundPanel'), controls: $('controlsPanel'), scores: $('scoresPanel'),
    help: $('helpPanel'), pause: $('pausePanel'), gameover: $('gameoverPanel'),
  };

  let state = 'boot'; // boot | menu | playing | paused | gameover
  let bootDone = false;
  let initials = { active: false, chars: ['A', 'A', 'A'], pos: 0 };
  let goEntry = null; // { score, level, qualified, saved }
  let savedRank = -1;
  let capture = null; // { action } — controls-panel key rebinding

  /* ---------------- ATTRACT TAKEOVER ---------------- */
  const ATTRACT_IDLE_MS = 30000;   // idle on the title before the demo takes over
  const ATTRACT_WAKE_MOVE = 10;    // px of mouse travel that wakes the attract screen
  const ATTRACT_SWALLOW_MS = 350;  // ignore the click that just woke the attract screen
  let attractTimer = null;
  let attractOn = false;
  let attractWokeAt = 0;
  let attractPointer = { x: -1, y: -1 };

  /* ---------------- BOOT SEQUENCE ---------------- */
  const BOOT_LINES = [
    '  .-~-.  .-~-.  .-~-.  .-~-.',
    '( o o )( o o )( o o )( o o )',
    '  `-~-`  `-~-`  `-~-`  `-~-`',
    '',
    'GLITCH BUG BIOS v2.1.0',
    'COPYRIGHT (C) 1981-2026 SYNTHESIS CORP.',
    'LOADING KERNEL .......... OK',
    'MOUNTING /dev/arcade .... OK',
    'INITIALIZING BUG GRID ... OK',
    'CALIBRATING PHOSPHOR .... OK',
    'LOADING ANTIVIRUS CORE .. OK',
    '',
    'SYSTEM READY.',
  ];

  function runBoot() {
    const log = $('bootLog');
    log.textContent = '';
    let i = 0;
    const timer = setInterval(() => {
      if (i >= BOOT_LINES.length) {
        clearInterval(timer);
        $('bootPrompt').classList.remove('hidden');
        revealBootExtras();
        bootDone = true;
        return;
      }
      log.textContent += BOOT_LINES[i] + '\n';
      AudioSys.sfx.uiMove();
      i++;
    }, 160);
  }

  function skipBoot() {
    if (state !== 'boot') return;
    $('bootPrompt').classList.remove('hidden');
    $('bootLog').textContent = BOOT_LINES.join('\n');
    revealBootExtras();
    bootDone = true;
  }

  /* the DISPLAY / color-cycling hint lines appear once the BIOS is done */
  function revealBootExtras() {
    $('bootDisplay').classList.remove('hidden');
  }

  function updateBootDisplay() {
    const el = $('bootDisplay');
    el.textContent = 'DISPLAY: ' + THEMES[themeKey];
    // retrigger the swap animation (textContent changes don't restart it).
    // Under reduced motion the swap is calmed (CSS animation: none) and the
    // forced reflow dance below would be wasted work — skip the retrigger.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  function bootToMenu() {
    if (!bootDone) return;
    if (state !== 'boot') return;
    state = 'menu';
    showPanel('menu');
    Game.backToMenu();
    refreshHiScoreFooter();
    armAttract();
    AudioSys.sfx.coin();
  }

  /* ---------------- PANELS ---------------- */
  function showPanel(name) {
    for (const k in PANELS) PANELS[k].classList.add('hidden');
    const p = PANELS[name];
    if (p) {
      p.classList.remove('hidden');
      p.scrollTop = 0;
    }
  }

  function refreshHiScoreFooter() {
    const hi = HighScores.best();
    $('hiScoreFooter').textContent = 'HI-SCORE: ' + String(hi ? hi.score : 0).padStart(6, '0');
  }

  function showMenu() {
    capture = null; // never leave a rebind capture hanging when leaving the panel
    state = 'menu';
    Game.backToMenu();
    showPanel('menu');
    refreshHiScoreFooter();
    refreshSoundPanel();
    armAttract();
    // focus first menu button
    focusFirst('#mainMenu');
  }

  /* ---------------- MENU KEYBOARD NAV ---------------- */
  function visiblePanel() {
    for (const k in PANELS) if (!PANELS[k].classList.contains('hidden')) return k;
    return null;
  }

  function focusables(panelName) {
    const p = PANELS[panelName];
    if (!p) return [];
    return Array.from(p.querySelectorAll('button, [data-action]')).filter(el => el.offsetParent !== null || true);
  }

  function focusFirst(sel) {
    const el = document.querySelector(sel + ' button');
    if (el) { el.focus({ preventScroll: true }); AudioSys.sfx.uiMove(); }
  }

  function moveFocus(dir) {
    const pn = visiblePanel();
    if (!pn) return;
    const els = focusables(pn);
    if (!els.length) return;
    const active = document.activeElement;
    let idx = els.indexOf(active);
    if (idx < 0) idx = dir > 0 ? -1 : 0;
    idx = (idx + dir + els.length) % els.length;
    els[idx].focus({ preventScroll: true });
    AudioSys.sfx.uiMove();
  }

  /* ---------------- GLOBAL KEYS ---------------- */
  function onKey(e) {
    // key-rebinding capture takes priority over everything
    if (capture) { handleCaptureKey(e); return; }
    // any key on the title screen wakes the attract takeover (and resets idle)
    if (atMainMenu()) { if (attractOn) exitAttract(); else armAttract(); }
    // fullscreen toggle works in every state (reserved key — see BASE_KEYS).
    // !e.repeat blocks OS auto-repeat from flickering fullscreen while held.
    if (e.code === 'KeyF' && !e.repeat) { toggleFullscreen(); return; }
    // cabinet color cycles live in every state too (reserved key), so the
    // player can tune the tint mid-run, not just at boot or in the menus.
    // !e.repeat stops OS auto-repeat from strobing through the themes.
    if (e.code === 'KeyC' && !e.repeat) {
      if (state === 'boot') skipBoot(); // boot: any key reveals the prompt
      cycleTheme();
      return;
    }
    if (state === 'boot') {
      skipBoot();
      if (e.code === 'Enter' || e.code === 'Space') bootToMenu();
      return;
    }
    if (state === 'menu') {
      if (e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
      else if (e.code === 'Escape') { doAction('back'); }
      else if (e.code === 'Enter') {
        const pn = visiblePanel();
        if (pn === 'menu') { doAction('play'); }
      }
      return;
    }
    if (state === 'paused') {
      // pause-bound keys (P/Esc) keep their always-resume muscle memory;
      // only Enter activates the focused row (e.g. the FULLSCREEN toggle)
      if (e.code === 'Enter') activatePanel('resume');
      else if (Input.isBound('pause', e.code)) doAction('resume');
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') moveFocus(e.code === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (state === 'playing') {
      if (Input.isBound('pause', e.code)) Game.togglePause();
      return;
    }
    if (state === 'gameover') {
      if (initials.active) handleInitialsKey(e);
      else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') moveFocus(e.code === 'ArrowUp' ? -1 : 1);
      else if (e.code === 'Enter') activatePanel('playagain');
    }
  }

  /* ---------------- ACTIONS ---------------- */
  function doAction(action) {
    switch (action) {
      case 'play': case 'playagain':
        disarmAttract();
        state = 'playing';
        hideAllPanels();
        Game.startRun();
        maybeAutoFullscreen();
        AudioSys.sfx.coin();
        break;
      case 'difficulty':
        disarmAttract();
        renderDifficulty();
        showPanel('diff');
        focusFirst('#diffList');
        break;
      case 'sound':
        disarmAttract();
        refreshSoundPanel();
        showPanel('sound');
        focusFirst('#soundPanel .option-list');
        break;
      case 'controls':
        disarmAttract();
        renderControls();
        showPanel('controls');
        focusFirst('#controlsList');
        break;
      case 'reset-controls':
        Input.resetBindings();
        renderControls();
        flashControlsHint('CONTROLS RESET TO DEFAULTS', 'ok');
        AudioSys.sfx.uiSelect();
        break;
      case 'scores':
        disarmAttract();
        renderScores();
        showPanel('scores');
        focusFirst('#scoresTable');
        break;
      case 'help':
        disarmAttract();
        populateHelpKeys();
        showPanel('help');
        focusFirst('#helpPanel');
        break;
      case 'back':
        showMenu();
        break;
      case 'resume':
        disarmAttract();
        Game.togglePause();
        break;
      case 'restart':
        disarmAttract();
        state = 'playing';
        hideAllPanels();
        Game.startRun();
        maybeAutoFullscreen();
        break;
      case 'quit':
        showMenu();
        break;
      case 'menu':
        showMenu();
        break;
      case 'toggle-music':
        AudioSys.setMusic(!AudioSys.musicOn);
        Store.set('music', AudioSys.musicOn);
        refreshSoundPanel();
        break;
      case 'toggle-sfx':
        AudioSys.setSfx(!AudioSys.sfxOn);
        Store.set('sfx', AudioSys.sfxOn);
        refreshSoundPanel();
        break;
      case 'toggle-volume':
        const v = Math.round(AudioSys.volume * 10 + 1) % 11; // 0..1 in 0.1 steps
        AudioSys.setVolume(v / 10);
        Store.set('volume', v / 10);
        refreshSoundPanel();
        AudioSys.sfx.uiSelect();
        break;
      case 'toggle-theme':
        cycleTheme();
        refreshSoundPanel();
        break;
      case 'toggle-theme-mode':
        setThemeMode(themeMode === 'rotate' ? 'fixed' : 'rotate');
        updateBootDisplay();
        AudioSys.sfx.uiSelect();
        break;
      case 'fullscreen':
        toggleFullscreen();
        break;
    }
  }

  function hideAllPanels() {
    for (const k in PANELS) PANELS[k].classList.add('hidden');
  }

  /* ---------------- DIFFICULTY ---------------- */
  function renderDifficulty() {
    const list = $('diffList');
    list.innerHTML = '';
    for (const key in Game.diffList) {
      const d = Game.diffList[key];
      const btn = document.createElement('button');
      btn.className = 'option-row' + (Game.diffKey === key ? ' selected' : '');
      btn.dataset.diff = key;
      const sel = Game.diffKey === key ? '▶ ' : '';
      btn.innerHTML = '<div class="opt-main"><span class="opt-label">' + sel + d.name + '</span><span class="opt-desc">' + d.desc + '</span></div>';
      btn.addEventListener('click', () => {
        Game.setDifficulty(key);
        renderDifficulty();
        AudioSys.sfx.uiSelect();
      });
      list.appendChild(btn);
    }
  }

  /* ---------------- SOUND ---------------- */
  function refreshSoundPanel() {
    $('musicVal').textContent = AudioSys.musicOn ? 'ON' : 'OFF';
    $('sfxVal').textContent = AudioSys.sfxOn ? 'ON' : 'OFF';
    $('volumeVal').textContent = Math.round(AudioSys.volume * 100) + '%';
    $('themeVal').textContent = THEMES[themeKey];
    $('themeModeVal').textContent = themeMode === 'rotate' ? 'AUTO' : 'FIXED';
  }

  /* ---------------- CABINET THEMES ---------------- */
  const THEMES = { classic: 'CLASSIC', sunset: 'SUNSET', emerald: 'EMERALD' };
  let themeKey = 'classic';
  // FIXED keeps the chosen tint; AUTO rolls a fresh one every level like the
  // original arcade cycled its pastel palettes. Persisted in Store as
  // 'themeMode' (defaults to FIXED so nothing changes out of the box).
  let themeMode = 'fixed';

  function applyTheme(k, persist = true) {
    if (!THEMES[k]) k = 'classic'; // sanitize stored values
    themeKey = k;
    const cab = document.getElementById('cabinet');
    if (cab) cab.dataset.theme = k;
    // AUTO-mode rolls must not clobber the player's FIXED pick in storage
    if (persist) Store.set('theme', k);
  }

  /* FIXED <-> AUTO. Never leaves an unknown value; keeps the SOUND panel's
     THEME MODE row in sync wherever the mode changes. */
  function setThemeMode(m) {
    if (m !== 'fixed' && m !== 'rotate') m = 'fixed';
    themeMode = m;
    Store.set('themeMode', m);
    refreshSoundPanel();
  }

  /* cycle classic -> sunset -> emerald -> classic; shared by the boot-screen
     [C] shortcut and the SOUND panel CABINET row. Cycling the tint manually
     locks the mode: in AUTO the next level would just re-roll it away, so
     pressing C means "this is my theme now". */
  function cycleTheme() {
    if (themeMode === 'rotate') setThemeMode('fixed');
    const keys = Object.keys(THEMES);
    applyTheme(keys[(keys.indexOf(themeKey) + 1) % keys.length]);
    updateBootDisplay(); // keep the boot DISPLAY line in sync wherever the cycle happens
    // mid-run confirmation: the tint changed under you — say which one.
    // Reads Game.state (synchronous) not the UI mirror, which the watchdog
    // only syncs a frame later — otherwise a C pressed in the same tick as
    // P (pause) would toast behind the pause panel.
    if (Game.state === 'playing') showThemeToast('THEME: ' + THEMES[themeKey]);
    AudioSys.sfx.uiSelect();
  }

  /* AUTO mode hook, called by Game.startLevel(): roll a fresh cabinet tint
     each level, never the one before. Cosmetic only — Math.random leaves the
     game's seeded RNG untouched so replays stay byte-identical. */
  function onLevelStart() {
    if (themeMode !== 'rotate') return;
    const keys = Object.keys(THEMES);
    const others = keys.filter(k => k !== themeKey);
    applyTheme(others[(Math.random() * others.length) | 0], false);
    updateBootDisplay();
  }

  /* ---------------- MID-RUN THEME TOAST ---------------- */
  let toastT = 0;
  /* brief on-screen confirmation that the cabinet tint changed mid-run, so
     the player knows what they tuned without opening the pause menu. Stays
     visible as long as the last change is under 1.1s old (rapid C presses
     just refresh the label and the timer). */
  function showThemeToast(text) {
    const el = $('themeToast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 1100);
  }

  /* re-enter fullscreen whenever a run starts, if the player's last fullscreen
     state was ON (persisted). All run starts are user-gesture driven, so the
     request is legal; failures (e.g. the browser rejecting a request) are
     silently ignored and the pref simply stays for the next attempt. */
  let fsGraceUntil = 0; // blur auto-pause is ignored briefly after an auto-enter
  function maybeAutoFullscreen() {
    if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    if (!Store.get('fullscreen', false)) return;
    const bez = $('bezel');
    const req = bez.requestFullscreen || bez.webkitRequestFullscreen;
    if (req) {
      // the transition can fire a window blur on some platforms — don't let
      // the just-started run auto-pause because of it
      fsGraceUntil = Date.now() + 600;
      const p = req.call(bez);
      if (p && p.catch) p.catch(() => {});
    }
  }

  /* ---------------- FULLSCREEN ----------------
     Fullscreens the bezel (the whole CRT + panels; cabinet furniture is
     outside it, so it disappears). Only callable from a user gesture — the
     menu badge and the [F] shortcut both qualify. Prefix fallbacks cover
     Safari; unsupported browsers hide the badge entirely. */
  function toggleFullscreen() {
    const bez = $('bezel');
    const fe = document.fullscreenElement || document.webkitFullscreenElement || null;
    if (fe) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); }
    } else {
      const req = bez.requestFullscreen || bez.webkitRequestFullscreen;
      if (req) { const p = req.call(bez); if (p && p.catch) p.catch(() => {}); }
    }
  }

  /* keep every fullscreen control in sync — the marquee badge AND the pause /
     game-over panel rows — so the label always reflects the live state. This
     also runs on EVERY fullscreen change (toggle, F, browser-Esc, auto-enter),
     so it's the single place the persisted preference is kept accurate: the
     player's last fullscreen state is what decides whether future runs start
     fullscreen. */
  function refreshFullscreenBadge() {
    const fe = document.fullscreenElement || document.webkitFullscreenElement;
    Store.set('fullscreen', !!fe);
    const title = fe ? 'EXIT FULLSCREEN [F]' : 'FULLSCREEN [F]';
    const label = fe ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
    const b = $('fsBtn');
    if (b) {
      b.title = title;
      b.setAttribute('aria-label', title);
    }
    document.querySelectorAll('.fs-panel-btn').forEach(el => {
      el.title = title;
      const l = el.querySelector('.fs-panel-label');
      if (l) l.textContent = label;
    });
  }

  /* ---------------- CONTROLS (key rebinding) ---------------- */
  const CONTROL_HINT_DEFAULT = 'CLICK TO ADD · TAP ✕ TO REMOVE · ESC CANCELS';
  const HOLD_HINT = 'HOLD 1-2 KEYS TO ADD · ENTER CONFIRMS · ESC CANCELS';
  const MOVE_ACTIONS = ['up', 'down', 'left', 'right'];
  const COMBAT_ACTIONS = ['fire', 'bomb', 'missile', 'pause'];

  function controlRow(action) {
    const btn = document.createElement('button');
    btn.className = 'option-row control-row' + (capture && capture.action === action ? ' capturing' : '');
    btn.dataset.action = action;
    const label = Input.actionLabels[action];
    let keysHtml;
    if (capture && capture.action === action) {
      // capture state: show pending keys (or a blinking prompt)
      const pending = capture.pending.map(Input.bindingLabel).join(' + ');
      keysHtml = '<span class="opt-value keys"><span class="key-prompt">' + (pending ? pending + '?' : 'PRESS KEY…') + '</span></span>';
    } else {
      const chips = Input.getActionCodes(action).map(code =>
        '<span class="key-chip">' + Input.bindingLabel(code) +
        '<span class="key-remove" data-remove="' + action + '" data-code="' + code + '" title="REMOVE">✕</span></span>'
      ).join('');
      keysHtml = '<span class="opt-value keys">' + chips + '<span class="key-add">+</span></span>';
    }
    btn.innerHTML = '<span class="opt-label">' + label + '</span>' + keysHtml;
    btn.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-remove]');
      if (rm) { removeKeyFrom(rm.dataset.remove, rm.dataset.code); return; }
      if (e.target.closest('.key-chip')) return; // chip body isn't an add target — only ✕ removes
      startCapture(action);
    });
    return btn;
  }

  function focusControlRow(action) {
    const row = $('controlsList').querySelector('[data-action="' + action + '"]');
    if (row) row.focus({ preventScroll: true });
  }

  function removeKeyFrom(action, code) {
    if (capture) capture = null; // a removal always exits add mode
    const res = Input.removeKey(action, code);
    if (res.ok) {
      renderControls();
      flashControlsHint('REMOVED ' + Input.bindingLabel(code) + ' FROM ' + Input.actionLabels[action], 'ok');
      AudioSys.sfx.uiSelect();
    } else {
      renderControls();
      flashControlsHint(res.reason === 'last key' ? 'LAST KEY — ADD ONE BEFORE REMOVING' : 'CANNOT REMOVE KEY', 'warn');
      AudioSys.sfx.uiMove();
    }
    focusControlRow(action);
  }

  /* boot-screen pad legend: mirrors the [C] hint for pad users — appears
     only while a gamepad is connected, so the boot screen stays clean for
     keyboard players and doubles as a live "pad detected" indicator */
  function refreshBootPadHint() {
    const el = $('bootPadHint');
    if (el) el.classList.toggle('hidden', !Input.gamepadConnected);
  }

  /* the short-press Select action — identical to the keyboard [C] handler:
     wake/arm the attract takeover at the menu, reveal the boot prompt at
     boot, then cycle the cabinet tint (toasting mid-run). */
  function selectCycle() {
    if (atMainMenu()) { if (attractOn) exitAttract(); else armAttract(); }
    if (state === 'boot') skipBoot();
    cycleTheme();
  }

  /* live gamepad indicator: fixed mapping, glows green once a pad connects */
  function refreshGamepadStatus() {
    const el = $('gamepadStatus');
    if (!el) return;
    const on = Input.gamepadConnected;
    el.textContent = on
      ? 'GAMEPAD CONNECTED: ' + (Input.gamepadId || 'PAD').slice(0, 36) + ' · A FIRE · B BOMB · X MISSILE · START PAUSE · SELECT THEME · HOLD: PAUSE · MENUS: A/START OK · B BACK'
      : 'NO GAMEPAD · STICK/D-PAD MOVE · A FIRE · B BOMB · X MISSILE · START PAUSE · SELECT THEME · HOLD: PAUSE · MENUS: A/START OK · B BACK';
    el.classList.toggle('on', on);
  }

  function renderControls() {
    const list = $('controlsList');
    list.innerHTML = '';
    const head = (text) => { const h = document.createElement('div'); h.className = 'control-head'; h.textContent = text; list.appendChild(h); };
    head('MOVE');
    for (const action of MOVE_ACTIONS) list.appendChild(controlRow(action));
    head('COMBAT');
    for (const action of COMBAT_ACTIONS) list.appendChild(controlRow(action));
    refreshGamepadStatus();
  }

  function startCapture(action) {
    if (capture && capture.action === action) return; // already capturing it
    capture = { action, kind: MOVE_ACTIONS.indexOf(action) !== -1 ? 'hold' : 'tap', pending: [] };
    renderControls();
    flashControlsHint(capture.kind === 'hold' ? HOLD_HINT : 'PRESS A KEY TO ADD TO ' + Input.actionLabels[action], 'capture');
    AudioSys.sfx.uiSelect();
    focusControlRow(action);
  }

  function handleCaptureKey(e) {
    e.preventDefault();
    if (!capture) return;
    // belt-and-suspenders: if the panel somehow closed mid-capture, drop it
    if ($('controlsPanel').classList.contains('hidden')) { capture = null; return; }
    const code = e.code;
    if (code === 'Escape') { cancelCapture(); return; }
    if (capture.kind === 'hold') { handleHoldKey(e); return; }
    // tap flow: press a key to add it immediately (existing keys are kept).
    // Only a genuinely new key ends capture — an already-bound key keeps it
    // open so the player can immediately try another.
    if (!Input.isCapturable(code)) return; // ignore modifiers / reserved keys, keep waiting
    const action = capture.action;
    const res = Input.addKey(action, code);
    if (res.ok && res.added.length) capture = null;
    flashRebindResult(res, action);
  }

  /* hold flow: collect 1-2 held keys, ENTER confirms, release clears */
  function handleHoldKey(e) {
    const code = e.code;
    if (code === 'Enter') {
      if (capture.pending.length) confirmHold();
      return;
    }
    if (!Input.isCapturable(code) || capture.pending.indexOf(code) !== -1 || capture.pending.length >= 2) return;
    capture.pending.push(code);
    renderControls();
    flashControlsHint('HOLD ' + capture.pending.map(Input.bindingLabel).join(' + ') + ' · ENTER CONFIRMS', 'capture');
    AudioSys.sfx.uiSelect();
  }

  function handleHoldKeyUp(e) {
    if (!capture || capture.kind !== 'hold') return;
    const idx = capture.pending.indexOf(e.code);
    if (idx !== -1) {
      capture.pending.splice(idx, 1);
      renderControls();
      flashControlsHint(capture.pending.length ? 'HOLD ' + capture.pending.map(Input.bindingLabel).join(' + ') + ' · ENTER CONFIRMS' : HOLD_HINT, 'capture');
    }
  }

  function confirmHold() {
    const action = capture.action;
    const codes = capture.pending.slice();
    capture = null;
    const res = Input.addKeys(action, codes);
    flashRebindResult(res, action);
  }

  /* shared result feedback for both capture flows — reports the keys actually
     added, calls out any skipped because they're another action's last key,
     and notes keys that were already bound */
  function flashRebindResult(res, action) {
    if (res.ok) {
      const parts = [];
      if (res.added && res.added.length) parts.push('ADDED ' + res.added.map(Input.bindingLabel).join(' + ') + ' TO ' + Input.actionLabels[action]);
      if (res.already && res.already.length) parts.push(res.already.map(Input.bindingLabel).join(' + ') + ' ALREADY BOUND');
      if (res.dropped && res.dropped.length) parts.push('SKIPPED ' + res.dropped.map(Input.bindingLabel).join(' + ') + ' (IN USE)');
      flashControlsHint(parts.join(' · '), 'ok');
      AudioSys.sfx.uiSelect();
    } else {
        flashControlsHint('KEY IN USE BY ' + res.reason, 'warn');
      AudioSys.sfx.uiMove();
    }
    renderControls();
    focusControlRow(action);
  }

  function cancelCapture() {
    capture = null;
    renderControls();
    flashControlsHint('REBIND CANCELLED', 'warn');
    AudioSys.sfx.uiMove();
  }

  function flashControlsHint(text, kind) {
    const h = $('controlsHint');
    h.textContent = text;
    h.className = 'controls-hint ' + (kind || '');
    clearTimeout(h._t);
    h._t = setTimeout(() => {
      h.className = 'controls-hint';
      h.textContent = CONTROL_HINT_DEFAULT;
    }, 1500);
  }

  /* keep the HOW TO PLAY table in sync with live bindings */
  function populateHelpKeys() {
    const set = (id, label) => { const el = $(id); if (el) el.textContent = label; };
    set('helpMove', MOVE_ACTIONS.map(d => Input.actionLabels[d].replace('MOVE ', '') + ' ' + Input.getActionCodes(d).map(Input.bindingLabel).join(' / ')).join(' · ') + ' / MOUSE / TOUCH-DRAG');
    set('helpFire', Input.getActionCodes('fire').map(Input.bindingLabel).join(' / ') + ' / MOUSE CLICK (HOLD TO AUTO-FIRE)');
    set('helpMissile', Input.getActionCodes('missile').map(Input.bindingLabel).join(' / '));
    set('helpBomb', Input.getActionCodes('bomb').map(Input.bindingLabel).join(' / '));
    set('helpPause', Input.getActionCodes('pause').map(Input.bindingLabel).join(' / '));
  }

  /* ---------------- HIGH SCORES ---------------- */
  function renderScores() {
    const list = HighScores.load();
    const tbl = $('scoresTable');
    tbl.innerHTML = '';
    if (!list.length) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = 'NO SCORES ON FILE';
      tbl.appendChild(d);
      return;
    }
    const header = document.createElement('div');
    header.className = 'srow header-row';
    header.innerHTML = '<span>RANK</span><span>NAME</span><span class="sc">SCORE</span><span class="lv">LV</span>';
    tbl.appendChild(header);
    list.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'srow' + (i === 0 ? ' top' : '');
      row.innerHTML = '<span class="rk">' + String(i + 1).padStart(2, '0') + '</span><span>' + s.name + '</span><span class="sc">' + String(s.score).padStart(6, '0') + '</span><span class="lv">' + (s.level || 1) + '</span>';
      tbl.appendChild(row);
    });
  }

  function renderGoTable(highlightRank) {
    const list = HighScores.load();
    const tbl = $('goTable');
    tbl.innerHTML = '';
    if (!list.length) {
      const d = document.createElement('div');
      d.className = 'empty'; d.textContent = 'NO SCORES ON FILE';
      tbl.appendChild(d);
      return;
    }
    list.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'srow' + (i === highlightRank ? ' top' : '');
      row.innerHTML = '<span class="rk">' + String(i + 1).padStart(2, '0') + '</span><span>' + (i === highlightRank ? '★ ' : '') + s.name + '</span><span class="sc">' + String(s.score).padStart(6, '0') + '</span>';
      tbl.appendChild(row);
    });
  }

  /* ---------------- GAME OVER + INITIALS ---------------- */
  function onGameOver(score, level) {
    state = 'gameover';
    initials.active = false;
    goEntry = { score, level, qualified: HighScores.qualifies(score), saved: false };
    savedRank = -1;
    $('goScore').textContent = String(score).padStart(6, '0');
    $('goLevel').textContent = 'REACHED LEVEL ' + level;
    renderGoTable(-1);
    showPanel('gameover');
    if (goEntry.qualified) {
      initials.active = true;
      initials.chars = ['A', 'A', 'A'];
      initials.pos = 0;
      $('initialsWrap').classList.remove('hidden');
      updateInitialsBox();
    } else {
      $('initialsWrap').classList.add('hidden');
      focusFirst('#gameoverPanel .menu-nav');
    }
  }

  function updateInitialsBox() {
    const box = $('initialsBox');
    box.textContent = initials.chars.map((c, i) => i === initials.pos ? '[' + c + ']' : c).join(' ');
  }

  function confirmInitials() {
    const name = initials.chars.join('').replace(/ /g, '').padEnd(3, 'A').slice(0, 3);
    HighScores.add({ name, score: goEntry.score, level: goEntry.level });
    const list = HighScores.load();
    savedRank = list.findIndex(s => s.score === goEntry.score && s.name === name);
    initials.active = false;
    $('initialsWrap').classList.add('hidden');
    renderGoTable(savedRank);
    Game.hiScore = Math.max(Game.hiScore, goEntry.score);
    AudioSys.sfx.highScore();
    focusFirst('#gameoverPanel .menu-nav');
  }

  const CHAR_SET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .';
  /* shared by the keyboard and the gamepad — dir +1/-1 cycles the character */
  function initialsChar(dir) {
    const n = CHAR_SET.length;
    initials.chars[initials.pos] = CHAR_SET[(CHAR_SET.indexOf(initials.chars[initials.pos]) + dir + n) % n];
    AudioSys.sfx.uiMove(); updateInitialsBox();
  }
  function initialsMovePos(dir) {
    initials.pos = (initials.pos + dir + 3) % 3;
    AudioSys.sfx.uiMove(); updateInitialsBox();
  }
  function handleInitialsKey(e) {
    if (e.code === 'ArrowUp') initialsChar(1);
    else if (e.code === 'ArrowDown') initialsChar(-1);
    else if (e.code === 'ArrowLeft') initialsMovePos(-1);
    else if (e.code === 'ArrowRight') initialsMovePos(1);
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); confirmInitials(); }
  }

  /* ---------------- PAUSE ---------------- */
  function onPauseChanged(isPaused) {
    if (isPaused) {
      state = 'paused';
      $('pauseStats').textContent = 'SCORE ' + String(Game.currentScore).padStart(6, '0') + '   ·   LV ' + Game.currentLevel;
      $('pauseBindings').textContent =
        'FIRE ' + Input.getActionCodes('fire').map(Input.bindingLabel).join('/') +
        ' · PAUSE ' + Input.getActionCodes('pause').map(Input.bindingLabel).join('/');
      showPanel('pause');
      focusFirst('#pausePanel .menu-nav');
    } else {
      if (Game.state === 'playing') {
        state = 'playing';
        hideAllPanels();
      }
    }
  }

  /* ---------------- ATTRACT TAKEOVER ---------------- */
  function atMainMenu() { return state === 'menu' && visiblePanel() === 'menu'; }

  function enterAttract() {
    if (!atMainMenu() || attractOn) return;
    attractOn = true;
    attractPointer.x = -1; // mouse position unknown until the first move
    $('menuPanel').classList.add('attract');
  }

  function exitAttractCore() {
    attractOn = false;
    $('menuPanel').classList.remove('attract');
  }

  function exitAttract() {
    if (!attractOn) return;
    exitAttractCore();
    attractWokeAt = Date.now(); // swallow the click that just woke the screen
    if (atMainMenu()) armAttract(); // re-arm the idle clock
  }

  function armAttract() {
    if (attractTimer) { clearTimeout(attractTimer); attractTimer = null; }
    if (!atMainMenu()) return;
    attractTimer = setTimeout(enterAttract, ATTRACT_IDLE_MS);
  }

  function disarmAttract() {
    if (attractTimer) { clearTimeout(attractTimer); attractTimer = null; }
    exitAttractCore();
  }

  /* ---------------- ATTRACT TIP CRAWL ----------------
     A scrolling one-liner under the title, like a real cabinet marquee
     ticker. JS drives translateX at a constant pixel speed (so short and
     long tips move alike), cycling through the list. It only runs on the
     main menu — sub-panels and the attract takeover pause it, and it
     re-primes from the right edge whenever the menu comes back. */
  const TIPS = [
    'INSERT COIN',
    "SHOOT THE QUEEN'S EYES",
    'HIT A WALL — THE BUG DROPS A ROW',
    'POP A SEGMENT — THE SWARM SPLITS',
    "MAGENTA MUSHROOMS ARE POISON — DON'T TOUCH",
    'FREEZE THE QUEEN, THEN BOMB HER',
    'EXTRA LIFE AT 10K AND 30K',
    'BOMBS CARRY BETWEEN LIVES',
    'THE LOWER THE SPIDER, THE MORE IT PAYS',
    'SMART MISSILES HOMING — SHIFT / K',
    'CLEAR THE FIELD FOR A BONUS',
    'GOOD LUCK, OPERATOR',
  ];
  const CRAWL_SPEED = 36; // px per second
  const RED_FADE = 0.5;    // seconds per fade leg when reduced motion is on
  const RED_HOLD = 4;      // seconds a tip stays up between fades
  let crawlEl = null, crawlX = 0, crawlIdx = 0, crawlLast = 0, crawlText = 0;
  let crawlMode = null;    // 'scroll' | 'fade' — mode state is reset on switch
  let redPhase = 'in', redT = 0;

  function crawlLoop(ts) {
    const el = crawlEl || (crawlEl = $('tipCrawlText'));
    // cheap state checks first — the offsetWidth layout read below only runs
    // on the menu, never during play/boot/pause where the ticker can't show.
    // !document.hidden pauses the ticker while the tab is away (rAF already
    // suspends callbacks there — this makes the pause explicit so a stray
    // frame can't advance it, mirroring the run's visibilitychange auto-pause)
    if (el && !document.hidden && atMainMenu() && !attractOn) {
      const wrap = el.parentNode;
      if (wrap.offsetWidth === 0) {
        // ticker laid out at 0 width (narrow-screen media query hides it) —
        // would measure 0 and spin tips at frame rate; re-prime when visible
        crawlLast = 0; redT = 0; crawlMode = null;
      } else {
        // read the preference live so an OS-side toggle takes effect at once
        const mode = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'fade' : 'scroll';
        if (mode !== crawlMode) {
          if (mode === 'scroll') { crawlLast = 0; el.style.opacity = '1'; }
          else { el.style.transform = 'none'; crawlLast = ts; redT = 0; redPhase = 'in'; }
          wrap.classList.toggle('reduce', mode === 'fade');
          crawlMode = mode;
        }
        if (mode === 'scroll') {
          if (crawlLast === 0) {
            // (re)entered the menu — start the current tip fresh from the right
            crawlLast = ts;
            el.textContent = TIPS[crawlIdx];
            crawlText = el.offsetWidth;
            crawlX = wrap.offsetWidth;
          } else {
            const dt = Math.min(0.1, (ts - crawlLast) / 1000);
            crawlLast = ts;
            crawlX -= CRAWL_SPEED * dt;
            if (crawlX + crawlText < 0) { // fully past the left edge -> next tip
              crawlIdx = (crawlIdx + 1) % TIPS.length;
              el.textContent = TIPS[crawlIdx];
              crawlText = el.offsetWidth;
              crawlX = wrap.offsetWidth;
            }
            el.style.transform = 'translateX(' + crawlX + 'px)';
          }
        } else {
          // reduced motion: a slow centered crossfade instead of the ticker
          const dt = Math.min(0.1, (ts - crawlLast) / 1000);
          crawlLast = ts;
          redT += dt;
          if (redPhase === 'in') {
            const a = Math.min(1, redT / RED_FADE);
            el.style.opacity = String(a);
            if (a >= 1) { redPhase = 'hold'; redT = 0; }
          } else if (redPhase === 'hold') {
            if (redT >= RED_HOLD) { redPhase = 'out'; redT = 0; }
          } else {
            const a = Math.max(0, 1 - redT / RED_FADE);
            el.style.opacity = String(a);
            if (a <= 0) {
              crawlIdx = (crawlIdx + 1) % TIPS.length;
              el.textContent = TIPS[crawlIdx];
              redPhase = 'in'; redT = 0;
            }
          }
        }
      }
    } else {
      // not on the main menu — re-prime (and re-detect the mode) on return
      crawlLast = 0; redT = 0; crawlMode = null;
    }
    requestAnimationFrame(crawlLoop);
  }

  /* ---------------- STATE WATCHDOG ---------------- */
  /* ---------------- GAMEPAD MENU NAVIGATION ----------------
     Full console parity: a controller can boot, navigate, and confirm from
     the title, exactly like the keyboard. The game loop owns gameplay input;
     here the watchdog (120ms tick) reads the latched button edges — see
     gamepadConsumePressed in input.js — plus deadzoned stick/D-Pad direction
     with a keyboard-like press-and-repeat. A/Start confirm, B backs out. */
  const GP_STICK_THRESHOLD = 0.5;
  const WATCHDOG_MS = 120; // watchdog cadence — also drives the gamepad repeat clock
  let gpUiState = null;   // last UI state we polled (reset latch on change)
  let gpRepeatT = 0;      // hold-repeat timer for sustained stick/D-Pad input
  const GP_SELECT_LONG_MS = 450; // pad Select held this long mid-run = PAUSE
  let selectHold = null;  // { t0, longFired } — a mid-run Select press in flight

  /* A = Enter: at the title it inserts a coin; on a focused row it clicks it */
  function gpConfirm() {
    if (visiblePanel() === 'menu') doAction('play');
    else { const el = document.activeElement; if (el && typeof el.click === 'function') el.click(); }
  }

  /* activate the focused panel button (keyboard Enter / gamepad A), falling
     back to a default action when focus isn't on an actionable element — so
     RESUME/PLAY AGAIN stay the one-press default while rows like the pause
     FULLSCREEN toggle are reachable by focusing them first */
  function activatePanel(defaultAction) {
    const el = document.activeElement;
    if (el && el.dataset && el.dataset.action && typeof el.click === 'function') { el.click(); return; }
    if (defaultAction) doAction(defaultAction);
  }

  function pollGamepadUI() {
    // entering a menu-ish state from elsewhere: drop stale gameplay edges so
    // a held fire button can't instantly confirm/resume a menu
    if (state !== gpUiState) { Input.resetGamepadLatch(); gpUiState = state; }
    if (!Input.gamepadConnected) return;
    // consume ALL latched edges every tick — a quick tap can be shorter than
    // the watchdog cadence, so the latch is the only reliable record of it;
    // the live-input check below only gates the work, never the consumption
    const a = Input.gamepadConsumePressed('fire');
    const b = Input.gamepadConsumePressed('bomb');
    const start = Input.gamepadConsumePressed('pause');
    const dy = Input.gamepadConsumeDirY();
    const dx = Input.gamepadConsumeDirX();
    const qy = Input.gamepadY < -GP_STICK_THRESHOLD ? -1 : Input.gamepadY > GP_STICK_THRESHOLD ? 1 : 0;
    const qx = Input.gamepadX < -GP_STICK_THRESHOLD ? -1 : Input.gamepadX > GP_STICK_THRESHOLD ? 1 : 0;
    if (!(a || b || start || dy || dx || qy !== 0 || qx !== 0 || Input.gamepadActive)) return;
    // any pad input on the title wakes / re-arms the attract takeover
    if (atMainMenu()) { if (attractOn) exitAttract(); else armAttract(); }

    // directional navigation — stick and D-Pad both fold into gamepadX/Y.
    // dy/dx are the LATCHED edges (one nav step per quick tap); sustained
    // hold repeats via the live vector below.
    const inInitials = state === 'gameover' && initials.active;
    gpRepeatT -= WATCHDOG_MS / 1000; // watchdog cadence
    if (dy || dx) gpRepeatT = 0.28; // fresh press starts the repeat clock
    if (inInitials) {
      // gamepad Y is screen-space (-1 = up) but initialsChar wants +1 = next
      // char, so negate; the keyboard path passes +1 for ArrowUp
      if (dy) initialsChar(-dy);
      if (dx) initialsMovePos(dx);
    } else if (state === 'menu' || state === 'paused') {
      if (dy) moveFocus(dy);
    }
    if (gpRepeatT <= 0) {
      if (qy !== 0) {
        gpRepeatT = 0.22;
        if (inInitials) initialsChar(-qy);
        else if (state === 'menu' || state === 'paused') moveFocus(qy);
      } else if (qx !== 0 && inInitials) {
        gpRepeatT = 0.22;
        initialsMovePos(qx);
      }
    }

    if (state === 'boot') {
      if (a || b || start || dy || dx || qy !== 0 || qx !== 0) skipBoot();
      if (a || start) bootToMenu();
    } else if (state === 'menu') {
      if (capture) { if (b) cancelCapture(); return; } // key-rebind capture: pad exit is B
      if (a) gpConfirm();
      else if (b || start) gpBack();
    } else if (state === 'paused') {
      if (a) activatePanel('resume');
      // Start resumes via the game loop — never double-consume it here
    } else if (state === 'gameover') {
      if (initials.active) {
        if (a || start) confirmInitials();
      } else {
        if (a || start) activatePanel('playagain');
        else if (b) doAction('menu');
      }
    }
  }

  function gpBack() { doAction('back'); }

  function watchdog() {
    // keep UI state in sync with Game state (pause key, game over, etc.)
    if (Game.state === 'paused' && state !== 'paused' && state === 'playing') onPauseChanged(true);
    else if (Game.state === 'playing' && state === 'paused') onPauseChanged(false);
    // live gamepad status while the CONTROLS panel is open
    if (!PANELS.controls.classList.contains('hidden')) refreshGamepadStatus();
    // boot-screen pad legend: appears under the hint once a pad connects
    // (lives inside the boot panel, so it only shows at boot); cheap class
    // toggle — classList only writes when the state actually changes
    refreshBootPadHint();
    // pad Select mirrors the keyboard [C] — tap: cycle the cabinet tint in
    // every state (at boot it reveals the prompt too, like any boot key).
    // Mid-run, a HOLD ≥ GP_SELECT_LONG_MS pauses the game instead, freeing a
    // second action from the same button. Consumed even during key-rebind
    // capture so a stale press can't cycle right after capture ends.
    const now = performance.now();
    const selectEdge = Input.gamepadConsumePressed('select');
    const selectHeld = Input.gamepadActionHeld('select');
    if (selectEdge && !selectHold) {
      if (capture) { /* ignored during key-rebind capture */ }
      else if (state === 'playing' && selectHeld) selectHold = { t0: now, longFired: false };
      else selectCycle(); // quick tap or any non-playing state: act immediately
    } else if (selectHold) {
      if (!selectHeld) {
        // released before the long threshold — it was a short press
        const track = selectHold; selectHold = null;
        if (!track.longFired && !capture) selectCycle();
      } else if (!selectHold.longFired && now - selectHold.t0 >= GP_SELECT_LONG_MS) {
        // held long enough mid-run: pause, and swallow the release so the
        // same hold can't also cycle the theme
        selectHold.longFired = true;
        if (Game.state === 'playing') Game.togglePause();
      }
    }
    // gamepad menu navigation (boot / menus / pause / game over). While
    // playing, gameplay latches accumulate un-reset, so ALSO mark the polled
    // state as 'playing' — otherwise a second pause (after a resume cycle)
    // would see the old value, skip the reset, and let a held fire button
    // instantly auto-resume. The mismatch on re-entry triggers the reset.
    if (state !== 'playing') pollGamepadUI();
    else gpUiState = 'playing';
    // safety net: the attract timer only ever runs on the main menu
    if (!atMainMenu()) disarmAttract();
  }

  /* ---------------- WIRING ---------------- */
  function wire() {
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => doAction(btn.dataset.action));
    });
    document.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => doAction('toggle-' + btn.dataset.toggle));
    });

    // click on screen canvas (outside panels) acts as play/boot/continue
    const cv = $('game');
    cv.addEventListener('click', () => {
      if (state === 'boot') bootToMenu();
      else if (state === 'menu') {
        const pn = visiblePanel();
        if (pn === 'menu') doAction('play');
      }
    });

    // arcade attract behaviour: click anywhere on the marquee to insert coin.
    // The click that just woke the attract screen is swallowed so it can't
    // accidentally start a game.
    const mq = document.querySelector('.menu-marquee');
    if (mq) mq.addEventListener('click', (e) => {
      if (state === 'menu' && !e.target.closest('button') && Date.now() - attractWokeAt > ATTRACT_SWALLOW_MS) doAction('play');
    });

    // attract-mode wake: any interaction brings the title back
    window.addEventListener('pointerdown', () => {
      if (atMainMenu()) { if (attractOn) exitAttract(); else armAttract(); }
    });
    window.addEventListener('pointermove', (e) => {
      if (!atMainMenu()) return;
      if (attractOn) {
        if (attractPointer.x < 0) { attractPointer.x = e.clientX; attractPointer.y = e.clientY; }
        else if (Math.abs(e.clientX - attractPointer.x) + Math.abs(e.clientY - attractPointer.y) > ATTRACT_WAKE_MOVE) exitAttract();
      } else {
        armAttract();
      }
    });
    window.addEventListener('wheel', () => {
      if (atMainMenu()) { if (attractOn) exitAttract(); else armAttract(); }
    });

    // auto-pause when tab hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && Game.state === 'playing') Game.togglePause();
      // the menu chrome mirrors that pause: reset the crawl (so it re-primes
      // the current tip on return) and the menu idle clock (so hidden-tab
      // time never makes the attract takeover fire stale right after the
      // player comes back) — armAttract() restarts the 30s count on return
      crawlLast = 0; redT = 0; crawlMode = null;
      if (document.hidden) {
        if (attractTimer) { clearTimeout(attractTimer); attractTimer = null; }
      } else {
        armAttract();
      }
    });
    window.addEventListener('blur', () => {
      // right after an auto-fullscreen request the transition itself can blur
      // the window — that's not the player tabbing away, so skip the pause
      if (Date.now() < fsGraceUntil) return;
      if (Game.state === 'playing' && !Input.touchMode) Game.togglePause();
      // drop any half-held rebind keys so a ghost key can't stick in pending
      if (capture && capture.kind === 'hold' && capture.pending.length) {
        capture.pending.length = 0;
        renderControls();
        flashControlsHint(HOLD_HINT, 'capture');
      }
    });

    Input.bindCanvas(cv);
    Input.setKeyHandler(onKey);
    Input.setKeyUpHandler((e) => handleHoldKeyUp(e));
  }

  /* ---------------- INIT ---------------- */
  function init() {
    themeMode = Store.get('themeMode', 'fixed') === 'rotate' ? 'rotate' : 'fixed';
    applyTheme(Store.get('theme', 'classic'));
    updateBootDisplay();
    refreshSoundPanel(); // rows show persisted values immediately, not after the first open
    wire();
    // fullscreen wiring: hide the badge where unsupported, track enter/exit
    if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
      const b = $('fsBtn');
      if (b) b.classList.add('hidden');
      document.querySelectorAll('.fs-panel-btn').forEach(el => el.classList.add('hidden'));
    }
    document.addEventListener('fullscreenchange', refreshFullscreenBadge);
    document.addEventListener('webkitfullscreenchange', refreshFullscreenBadge);
    Game.stopMusicForMenu();
    Game.startAttractWorld();
    showPanel('boot');
    runBoot();
    setInterval(watchdog, WATCHDOG_MS);
    requestAnimationFrame(crawlLoop);
    // click anywhere advances boot (and unlocks audio on first gesture)
    PANELS.boot.addEventListener('click', () => { if (state === 'boot') { if (bootDone) bootToMenu(); else skipBoot(); } });
    window.addEventListener('pointerdown', () => {
      AudioSys.unlock();
      if (state === 'boot' && bootDone) bootToMenu();
    });
  }

  return {
    init,
    onGameOver,
    onLevelStart,
    onPauseChanged,
    refreshSoundPanel,
    doAction,
    _debug: { atMainMenu, enterAttract, exitAttract, armAttract, disarmAttract },
  };
})();

// Go!
UI.init();
