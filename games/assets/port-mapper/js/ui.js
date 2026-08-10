/* =========================================================================
   PORT MAPPER — ui.js
   Menu system, HUD, pause, game-over flow, arcade initials entry,
   high-score table and settings screens.
   ========================================================================= */
window.PM = window.PM || {};

PM.UI = (function () {
  'use strict';

  const C = PM.Config, I = PM.Input, A = PM.Audio, S = PM.Storage, G = PM.Game, R = PM.Render;
  const STR = PM.STR.T;   // strings table — text is centralized in strings.js

  const HUD_OFF = ['menu', 'difficulty', 'sound', 'scores', 'help'];
  let current = 'menu';
  let shakeT = 0;
  let entryActive = false;              // initials entry mode
  let initials = { letters: ['', '', ''], pos: 0 };
  let pendingEntry = null;              // {score, level, diff} awaiting initials
  let warnCache = { active: false, secs: -1 };
  let goWarnCache = { active: false, secs: -1 };   // game-over press-start countdown
  let marqueeIdx = 0;                               // current attract-marquee message
  let taglineIdx = 0;                               // current rotating title one-liner
  let hiOverride = false;                           // demo-score taunt active on title-hi

  const els = {};
  const hudCache = { score: '', hi: '', level: '', diff: '', mute: -1, quick: -1 };
  let livesCache = -1;
  let livesCanvas = null, livesImg = null;

  function $(id) { return document.getElementById(id); }
  function qa(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }

  /* ================= boot ================= */

  function init() {
    ['hud', 'screen-menu', 'screen-difficulty', 'screen-sound', 'screen-scores', 'screen-help',
     'screen-pause', 'screen-gameover', 'touch-pad',
     'hud-score', 'hud-hi', 'hud-level', 'hud-diff', 'hud-lives', 'hud-quick', 'hud-quick-wrap', 'hud-mute', 'screens',
     'scores-table', 'sound-menu', 'go-score', 'go-level', 'go-diff', 'go-entry', 'go-title', 'go-report',
     'hud-diff-label', 'title-hi', 'am-track'].forEach(function (id) { els[id] = $(id); });

    marqueeTick();      // seed the rolling attract marquee right away
    taglineTick();      // seed the rotating title one-liner right away
    PM.STR.staticI18n();   // push the static DOM strings from the strings table

    livesCanvas = document.createElement('canvas');
    livesImg = document.createElement('img');

    buildDifficultyMenu();
    buildSoundMenu();
    wireClicks();
    wireTouchPad();

    // apply persisted settings
    const st = S.loadSettings();
    A.setSound(st.sound);
    A.setMusic(st.music);
    document.body.classList.toggle('no-crt', !st.crt);

    // route keys: gameplay vs menu
    I.setHandler(globalKey);

    // first interaction unlocks audio (browser autoplay policy)
    const unlockOnce = function () {
      A.unlock();
      A.refreshMusic();
      document.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    document.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);

    updateHUD();
    show('menu');

    // cycle the attract marquee behind the title, like a real cabinet
    setInterval(marqueeTick, 4200);

    // rotate the title one-liner every few seconds
    setInterval(taglineTick, 4200);
  }

  /* ================= rotating title one-liner ================= */

  // The title screen cycles a cabinet-style tagline under the logo so the
  // attract frame never sits still — one quip per visitor, like the marquee
  // card out front. First phrase stays on screen the longest (it is the
  // default tagline, shown before the first rotation and on the first tick).
  function taglinePhrases() { return STR.tagline; }

  function taglineTick() {
    const el = document.querySelector('.tagline');
    if (!el || current !== 'menu') return;
    const phrases = taglinePhrases();
    if (taglineIdx >= phrases.length) taglineIdx = 0;
    const text = phrases[taglineIdx++];
    if (el.textContent === text) return;
    el.textContent = text;
    // restart the fade so each new one-liner eases in like a marquee swap
    el.classList.remove('tag-fade');
    void el.offsetWidth;
    el.classList.add('tag-fade');
  }

  /* ================= rolling attract marquee ================= */

  // The title screen cycles attract messages like a real arcade cabinet:
  // INSERT COIN / GAME OVER / the current hi-score / the top of the table.
  // Rebuilt each tick so the hi-score stays live.
  function marqueeMessages() {
    const hi = S.highScore();
    const pad = function (n) { return String(n).padStart(6, '0'); };
    const msg = [
      { text: STR.marquee.insertCoin, cls: 'green' },
      { text: STR.marquee.credits, cls: 'amber' },
      { text: STR.marquee.gameOver, cls: 'mag' },
      { text: PM.STR.fmt(STR.marquee.hiScore, { score: pad(hi) }), cls: 'amber wide' },
    ];
    const list = S.loadScores();
    if (list.length) {
      list.slice(0, 5).forEach(function (s, i) {
        msg.push({ text: PM.STR.fmt(STR.marquee.rank, { rank: i + 1, name: s.name, score: pad(s.score) }), cls: 'cyan wide' });
      });
    } else {
      msg.push({ text: STR.marquee.emptyTable, cls: 'cyan wide' });
    }
    msg.push({ text: STR.marquee.courtesy, cls: 'dim wide' });
    return msg;
  }

  function marqueeTick() {
    const track = els['am-track'];
    if (!track) return;
    // only churn the DOM while the title is actually on screen
    if (current !== 'menu') return;
    const msg = marqueeMessages();
    if (marqueeIdx >= msg.length) marqueeIdx = 0;
    const m = msg[marqueeIdx++];
    track.className = 'am-track ' + m.cls;
    track.textContent = m.text;
    // hard-restart the scroll: kill the inline animation, reflow, re-apply
    track.style.animation = 'none';
    void track.offsetWidth;
    track.style.animation = '';
  }

  /* ================= menu construction ================= */

  function buildDifficultyMenu() {
    const box = $('difficulty-menu');
    if (!box) return;
    box.innerHTML = '';
    for (const id in C.DIFF) {
      const d = C.DIFF[id];
      const b = document.createElement('button');
      b.className = 'btn diff-btn';
      b.dataset.diff = id;
      b.innerHTML = '<span class="d-name">' + d.label + '</span><span class="d-desc">' + d.desc + '</span>';
      box.appendChild(b);
    }
  }

  function buildSoundMenu() {
    const box = els['sound-menu'];
    if (!box) return;
    box.innerHTML = '';
    const st = S.loadSettings();
    const rows = [
      { key: 'sound', label: STR.settings.soundFx },
      { key: 'music', label: STR.settings.music },
      { key: 'crt', label: STR.settings.crt },
    ];
    rows.forEach(function (r) {
      const b = document.createElement('button');
      b.className = 'btn toggle-btn';
      b.dataset.setting = r.key;
      b.innerHTML = '<span class="t-label">' + r.label + '</span><span class="t-value">' + (st[r.key] ? STR.settings.on : STR.settings.off) + '</span>';
      box.appendChild(b);
    });
  }

  /* ================= screen management ================= */

  function show(name) {
    current = name;
    qa('.screen').forEach(function (s) { s.classList.remove('active'); });
    const scr = $('screen-' + name);
    if (scr) scr.classList.add('active');
    els.hud.classList.toggle('hidden', HUD_OFF.indexOf(name) >= 0);
    if (name === 'scores') renderScores(-1);
    if (name === 'sound') buildSoundMenu();
    focusFirst(name);
    A.sfx(name === 'menu' ? 'title' : 'uiMove');
    // attract-mode soundtrack for the title; startMusic guards no-ops
    if (name === 'menu') A.startMusic();
    // block gameplay input while a menu screen is up
    I.clearQueue();
  }

  function hideScreens() {
    qa('.screen').forEach(function (s) { s.classList.remove('active'); });
    els.hud.classList.remove('hidden');
    current = 'game';
    I.clearQueue();
  }

  /* Attract auto-start warning: flashes PRESS START harder and shows a
     STARTING IN n… countdown during the final seconds before the cabinet
     starts a round for you. */
  function attractWarn(active, secs) {
    const root = document.querySelector('#screen-menu .press-start');
    const t = root ? root.querySelector('.ps-text') : null;
    if (!t) return;
    if (warnCache.active === active && warnCache.secs === secs) return;
    warnCache.active = active;
    warnCache.secs = secs;
    root.classList.toggle('auto', !!active);
    const label = (active && secs !== undefined && secs <= 3) ? PM.STR.fmt(STR.startingIn, { n: secs }) : STR.pressStart;
    if (t.textContent !== label) t.textContent = label;
  }

  /* Attract-mode taunt: while the demo's ROUND COMPLETE card is up, the title
     HI-SCORE marquee shows the bot's fake score — like real cabinets daring
     you to beat the demo run. Pass null to restore the real hi-score. */
  function demoHiScore(n) {
    const el = els['title-hi'];
    if (!el) return;
    const box = document.querySelector('.hi-marquee');
    const set = (n !== null && n !== undefined);
    if (!set && !hiOverride) return;   // nothing to clear — skip the DOM churn
    hiOverride = set;
    if (set) {
      el.textContent = String(n).padStart(6, '0');
      if (box) box.classList.add('demo');
    } else {
      el.textContent = String(Math.max(S.highScore(), G.hi())).padStart(6, '0');
      if (box) box.classList.remove('demo');
      hudCache.hi = '';          // let updateHUD repaint the live value
    }
  }

  /* Game-over attract return: the abandoned game-over screen shows the same
     countdown treatment as the title — flashes PRESS START harder and warns
     RETURNING TO TITLE n… before the cabinet cycles back to attract mode. */
  function goPressWarn(active, secs) {
    const el = document.querySelector('.go-press');
    if (!el) return;
    if (goWarnCache.active === active && goWarnCache.secs === secs) return;
    goWarnCache.active = active;
    goWarnCache.secs = secs;
    el.classList.toggle('auto', !!active);
    const label = (active && secs !== undefined && secs <= 3) ? PM.STR.fmt(STR.returningToTitle, { n: secs }) : STR.pressStart;
    if (el.textContent !== label) el.textContent = label;
  }

  /* retro juice: shake the whole screen on game-state transitions (pause/
     game-over actions, dying) — deliberately NOT on menu navigation, which
     stays calm so browsing the title and submenus doesn't rattle the cabinet */
  function shakeScreen(hard) {
    const sc = els['screens'];
    if (!sc) return;
    sc.classList.remove('shake', 'shake-hard');
    void sc.offsetWidth; // restart the CSS animation
    sc.classList.add(hard ? 'shake-hard' : 'shake');
    clearTimeout(shakeT);
    shakeT = setTimeout(function () {
      sc.classList.remove('shake', 'shake-hard');
    }, 800);
  }

  function focusFirst(name) {
    const scr = $('screen-' + name);
    if (!scr) return;
    const btns = qa('.btn', scr);
    setFocus(btns, 0);
    // Tall scrollable panels (the help screen) keep the focus outline on the
    // BACK button at the bottom, but scrollIntoView would yank the panel down
    // past the CONTROLS block. Anchor the panel at the top on open so the
    // first thing a player sees is the section they came for.
    const panel = qa('.panel', scr)[0];
    if (panel && panel.scrollHeight > panel.clientHeight) panel.scrollTop = 0;
  }

  function setFocus(btns, idx) {
    if (!btns.length) return;
    if (idx < 0) idx = 0;
    if (idx >= btns.length) idx = btns.length - 1;
    btns.forEach(function (b, i) {
      b.classList.toggle('focused', i === idx);
      if (i === idx) b.scrollIntoView({ block: 'nearest' });
    });
  }

  function focusedButton() {
    const scr = $('screen-' + current);
    if (!scr) return null;
    const btns = qa('.btn', scr);
    return btns.find(function (b) { return b.classList.contains('focused'); }) || null;
  }

  /* ================= click handling ================= */

  function wireClicks() {
    document.addEventListener('click', function (e) {
      const b = e.target.closest('.btn');
      if (!b) return;
      handleButton(b);
    });
    // hover also moves focus
    document.addEventListener('mouseover', function (e) {
      const b = e.target.closest('.btn');
      if (!b) return;
      const scr = b.closest('.screen');
      if (!scr) return;
      qa('.btn', scr).forEach(function (x) { x.classList.toggle('focused', x === b); });
    });
  }

  function handleButton(b) {
    if (b.dataset.diff) { A.sfx('uiSelect'); G.startGame(b.dataset.diff); hideScreens(); return; }
    if (b.dataset.setting) { toggleSetting(b.dataset.setting); return; }
    const act = b.dataset.action;
    if (!act) return;
    switch (act) {
      // menu navigation is calm — no screen shake on the title or submenu
      // clicks; the shake stays for game-state transitions below
      case 'start': show('difficulty'); break;
      case 'difficulty': show('difficulty'); break;
      case 'sound': show('sound'); break;
      case 'scores': show('scores'); break;
      case 'help': show('help'); break;
      case 'back-menu': A.sfx('uiBack'); show('menu'); break;
      case 'clear-scores': S.clearScores(); renderScores(-1); A.sfx('uiSelect'); break;
      case 'resume': shakeScreen(); G.resume(); break;
      case 'restart': shakeScreen(); G.restart(); hideScreens(); break;
      case 'quit': shakeScreen(); G.toMenu(); show('menu'); break;
      case 'mute': shakeScreen(); toggleMute(); break;
      case 'menu': shakeScreen(); G.toMenu(); show('menu'); break;
      default: break;
    }
  }

  function toggleSetting(key) {
    const st = S.loadSettings();
    st[key] = !st[key];
    S.saveSettings(st);
    if (key === 'sound') A.setSound(st.sound);
    if (key === 'music') A.setMusic(st.music);
    document.body.classList.toggle('no-crt', !st.crt);
    buildSoundMenu();
    A.sfx('uiSelect');
  }

  function toggleMute() {
    const st = S.loadSettings();
    const next = !(st.sound || st.music);
    st.sound = next; st.music = next;
    S.saveSettings(st);
    A.setSound(next); A.setMusic(next);
    hudCache.mute = -1;
    updateHUD();
    if (current === 'pause') {
      const b = qa('#screen-pause .btn').find(function (x) { return x.dataset.action === 'mute'; });
      if (b) b.lastChild.textContent = 'SOUND: ' + (next ? STR.settings.on : STR.settings.off);
    }
    A.sfx('uiSelect');
  }

  /* ================= keyboard dispatch ================= */

  function globalKey(code) {
    if (code === 'KeyM') { toggleMute(); return; }
    if (code === 'F1') { G.skipToTitle(); return; }   // operator skip-to-title
    if (G.isPlaying() || current === 'pause' || current === 'gameover' || current === 'initials') {
      if (current === 'pause') G.systemKey(code);       // P/Esc/Enter resume, arrows navigate
      else if (current === 'gameover' || current === 'initials') menuKey(code);
      else G.systemKey(code);
      return;
    }
    menuKey(code);
  }

  function menuKey(code) {
    if (entryActive && current === 'gameover') { initialsKey(code); return; }
    const scr = $('screen-' + current);
    if (!scr) return;
    const btns = qa('.btn', scr);
    let idx = btns.indexOf(focusedButton());
    const move = function (d) {
      idx = Math.max(0, Math.min(btns.length - 1, idx + d));
      setFocus(btns, idx);
      A.sfx('uiMove');
    };
    if (code === 'ArrowUp' || code === 'ArrowLeft') { e.preventDefault && 0; move(-1); }
    else if (code === 'ArrowDown' || code === 'ArrowRight') { move(1); }
    else if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
      const b = focusedButton();
      if (b) handleButton(b);
    } else if (code === 'Escape' || code === 'Backspace') {
      if (current === 'menu') return;
      const back = qa('.btn[data-action="back-menu"]', scr)[0];
      if (back) handleButton(back);
      else if (current === 'pause') G.resume();
      else show('menu');
    }
  }

  /* ================= initials entry ================= */

  function initialsKey(code) {
    const L = initials.letters;
    if (code.indexOf('Key') === 0 && code.length === 4) {
      const ch = code[3];
      if (/[A-Z]/.test(ch)) {
        L[initials.pos] = ch;
        if (initials.pos < 2) initials.pos++;
        else submitInitials();
        renderInitials();
        A.sfx('uiMove');
      }
      return;
    }
    if (code === 'ArrowUp') { cycleLetter(1); return; }
    if (code === 'ArrowDown') { cycleLetter(-1); return; }
    if (code === 'ArrowLeft') { initials.pos = Math.max(0, initials.pos - 1); renderInitials(); A.sfx('uiMove'); return; }
    if (code === 'ArrowRight') { initials.pos = Math.min(2, initials.pos + 1); renderInitials(); A.sfx('uiMove'); return; }
    if (code === 'Backspace') {
      if (L[initials.pos]) { L[initials.pos] = ''; }
      else if (initials.pos > 0) { initials.pos--; L[initials.pos] = ''; }
      renderInitials(); A.sfx('uiMove');
      return;
    }
    if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
      if (L[0] || L[1] || L[2]) submitInitials();
      else { L[0] = 'A'; L[1] = 'A'; L[2] = 'A'; submitInitials(); }
    }
  }

  function cycleLetter(d) {
    const L = initials.letters;
    const cur = L[initials.pos].charCodeAt(0);
    let next = cur;
    if (!L[initials.pos]) next = d > 0 ? 65 : 90;
    else next = cur + d;
    if (next > 90) next = 65;
    if (next < 65) next = 90;
    L[initials.pos] = String.fromCharCode(next);
    renderInitials();
    A.sfx('uiMove');
  }

  function submitInitials() {
    const name = (initials.letters.join('') || STR.defaultName);
    const res = S.submitScore({
      name: name,
      score: pendingEntry.score,
      level: pendingEntry.level,
      diff: pendingEntry.diff,
      date: Date.now(),
    });
    entryActive = false;
    pendingEntry = null;
    A.sfx('levelClear');
    // show the table with the new entry highlighted
    $('screen-gameover').classList.remove('active');
    els.hud.classList.add('hidden');
    current = 'scores';
    show('scores');
    renderScores(res.rank);
  }

  function renderInitials() {
    const box = els['go-entry'];
    if (!box) return;
    const L = initials.letters;
    box.innerHTML =
      '<div class="init-label">' + STR.newHighScore + '</div>' +
      '<div class="init-boxes">' +
      [0, 1, 2].map(function (i) {
        return '<span class="init-box' + (i === initials.pos ? ' active' : '') + '">' + (L[i] || '·') + '</span>';
      }).join('') +
      '</div>' +
      '<div class="init-hint">' + STR.initialsHint + '</div>';
  }

  /* ================= high scores table ================= */

  function renderScores(highlightRank) {
    const box = els['scores-table'];
    if (!box) return;
    const list = S.loadScores();
    if (!list.length) {
      box.innerHTML = '<div class="scores-empty">' + STR.scoresEmpty + '</div>';
      return;
    }
    let html = '<table class="scores"><thead><tr><th>' + STR.scoresHead.rank + '</th><th>' + STR.scoresHead.name + '</th><th>' + STR.scoresHead.score + '</th><th>' + STR.scoresHead.lvl + '</th><th>' + STR.scoresHead.diff + '</th></tr></thead><tbody>';
    list.forEach(function (s, i) {
      const hl = (i === highlightRank) ? ' class="hl"' : '';
      html += '<tr' + hl + '><td>' + (i + 1) + '</td><td>' + s.name + '</td><td>' + String(s.score).padStart(6, '0') + '</td><td>' + s.level + '</td><td>' + (s.diff || STR.diff.normal.short) + '</td></tr>';
    });
    html += '</tbody></table>';
    box.innerHTML = html;
  }

  /* ================= pause / game over / banner ================= */

  function showPause() {
    show('pause');
    const b = qa('#screen-pause .btn').find(function (x) { return x.dataset.action === 'mute'; });
    if (b) b.lastChild.textContent = 'SOUND: ' + (S.loadSettings().sound ? STR.settings.on : STR.settings.off);
  }

  function hidePause() { hideScreens(); }

  function pauseKey(code) {
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      const scr = $('screen-pause');
      const btns = qa('.btn', scr);
      const idx = btns.indexOf(focusedButton());
      setFocus(btns, idx + (code === 'ArrowUp' ? -1 : 1));
      A.sfx('uiMove');
    } else if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
      const b = focusedButton();
      if (b) handleButton(b);
    }
  }

  function showGameOver(score, level, diffLabel, report) {
    els['go-score'].textContent = String(score).padStart(6, '0');
    els['go-level'].textContent = level;
    els['go-diff'].textContent = diffLabel;
    renderRoundReport(report);
    pendingEntry = { score: score, level: level, diff: diffLabel };
    entryActive = false;
    shakeScreen(true);

    if (S.qualifies(score) && score > 0) {
      entryActive = true;
      initials = { letters: ['', '', ''], pos: 0 };
      renderInitials();
    } else {
      const hi = S.highScore();
      els['go-entry'].innerHTML = '<div class="init-label">' + STR.finalScore + '</div><div class="init-hint">' + PM.STR.fmt(STR.allTimeBest, { score: String(hi).padStart(6, '0') }) + '</div>';
    }
    show('gameover');
  }

  // Arcade-style round report: a two-column grid of stat cells built from the
  // world.stats snapshot game.js passes at game over. Styled in the same panel
  // family as the LEVEL CLEAR card so the run's "story" reads as part of the
  // cabinet, not a separate modal.
  function renderRoundReport(r) {
    const box = els['go-report'];
    if (!box) return;
    if (!r) { box.innerHTML = ''; return; }
    const m = Math.floor((r.timeMs || 0) / 60000);
    const s = Math.floor((r.timeMs || 0) / 1000) % 60;
    const time = m + ':' + String(s).padStart(2, '0');
    const cells = [
      [STR.report.ports, r.ports + '/' + r.total, 'cyan'],
      [STR.report.chain, '×' + r.chainBest, 'mag'],
      [STR.report.quick, '×' + r.reSecureBest, 'green'],
      [STR.report.reSecures, r.reSecures + ' · +' + r.reSecureBonus, 'green'],
      [STR.report.hackers, String(r.hackersCaught), 'cyan'],
      [STR.report.worms, String(r.worms), 'worm'],
      [STR.report.losses, String(r.deaths), r.deaths > 0 ? 'red' : 'green'],
      [STR.report.time, time, 'amber'],
    ];
    box.innerHTML =
      '<div class="go-report-title">' + STR.reportTitle + '</div>' +
      '<div class="go-rep-grid">' +
      cells.map(function (c) {
        return '<div class="go-rep-cell"><span class="go-rep-label">' + c[0] + '</span>' +
          '<span class="go-rep-value gr-' + c[2] + '">' + c[1] + '</span></div>';
      }).join('') +
      '</div>';
  }

  /* ================= HUD ================= */

  function updateHUD() {
    if (!els['hud-score']) return;
    const s = G.score();
    const h = Math.max(G.hi(), s);
    const lv = G.level();
    const d = G.diff();
    const str = function (n) { return String(n).padStart(6, '0'); };

    if (hudCache.score !== str(s)) { els['hud-score'].textContent = str(s); hudCache.score = str(s); }
    if (hudCache.hi !== str(h)) {
      els['hud-hi'].textContent = str(h);
      if (!hiOverride && els['title-hi']) els['title-hi'].textContent = str(h);
      hudCache.hi = str(h);
    }
    if (hudCache.level !== String(lv)) { els['hud-level'].textContent = String(lv); hudCache.level = String(lv); }
    if (hudCache.diff !== d.short) { els['hud-diff'].textContent = d.short; hudCache.diff = d.short; }

    const lives = G.lives();
    if (lives !== livesCache) {
      livesCache = lives;
      drawLives(lives);
    }

    // live QUICK ×N streak counter — the escalating re-secure ladder
    // (150 → 200 → … → 400). Hidden at streak 0, so a slow re-secure
    // resetting the streak makes the counter vanish. updateHUD runs every
    // frame, so the cache keeps this a no-op until the streak actually moves.
    const qw = els['hud-quick-wrap'];
    if (qw) {
      const streak = G.reSecureStreak();
      if (hudCache.quick !== streak) {
        const grew = streak > hudCache.quick && streak > 0;
        hudCache.quick = streak;
        qw.classList.toggle('hidden', streak < 1);
        if (streak > 0) {
          // the cap climbs 50 per level — read it from game.js so the HUD
          // can never drift from the payout actually banked
          const pay = Math.min(G.reSecureCap(), C.SCORE.reSecureQuick + (streak - 1) * C.SCORE.reSecureStep);
          els['hud-quick'].textContent = PM.STR.fmt(STR.hudQuick, { streak: streak, pay: pay });
          if (grew) {
            els['hud-quick'].classList.remove('pop');
            void els['hud-quick'].offsetWidth;   // restart the pixel pop
            els['hud-quick'].classList.add('pop');
          }
        } else if (els['hud-quick'].classList.contains('pop')) {
          els['hud-quick'].classList.remove('pop');   // clear a stale pop on reset
        }
      }
    }

    const st = S.loadSettings();
    const muted = !(st.sound || st.music);
    if (hudCache.mute !== (muted ? 1 : 0)) {
      hudCache.mute = muted ? 1 : 0;
      els['hud-mute'].textContent = muted ? STR.muteOff : STR.muteOn;
      els['hud-mute'].classList.toggle('off', muted);
    }
  }

  function drawLives(n) {
    const shown = Math.min(n, 8);
    livesCanvas.width = Math.max(1, shown * 20);
    livesCanvas.height = 26;
    const g = livesCanvas.getContext('2d');
    g.clearRect(0, 0, livesCanvas.width, livesCanvas.height);
    for (let i = 0; i < shown; i++) R.drawMiniHead(g, 9 + i * 20, 2, 1);
    livesImg.src = livesCanvas.toDataURL();
    els['hud-lives'].innerHTML = '';
    els['hud-lives'].appendChild(livesImg);
    if (n > 8) els['hud-lives'].appendChild(document.createTextNode(PM.STR.fmt(STR.livesMore, { n: n })));
  }

  /* ================= touch pad ================= */

  function wireTouchPad() {
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    if (!touch) return;
    const pad = els['touch-pad'];
    pad.classList.remove('hidden');
    qa('.tbtn', pad).forEach(function (b) {
      const dir = b.dataset.dir;
      const on = function (e) { e.preventDefault(); b.classList.add('pressed'); I.virtualPress(dir, true); };
      const off = function (e) { e.preventDefault(); b.classList.remove('pressed'); I.virtualPress(dir, false); };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off, { passive: false });
      b.addEventListener('touchcancel', off, { passive: false });
      b.addEventListener('mousedown', on);
      b.addEventListener('mouseup', off);
      b.addEventListener('mouseleave', off);
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  }

  return {
    init, updateHUD, show, hideScreens, showPause, hidePause, pauseKey,
    showGameOver, toggleMute, renderScores,
    screen: () => current,
    attractWarn,
    goPressWarn,
    demoHiScore,
    entryActive: () => entryActive,
  };
})();
