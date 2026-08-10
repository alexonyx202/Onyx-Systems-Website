/* =========================================================================
   PORT MAPPER — strings.js
   Every player-facing string in the game, in one place.

   The JS-generated UI (menus, HUD, cards, scoreboard, in-game floats) reads
   its text from PM.STR below, so translating or re-skinning the game is a
   single-file job: edit this table and you are done with every dynamic
   string. Values may be plain strings or format functions taking a params
   object; call PM.STR.fmt('key', {n: 3}) to expand {n} placeholders.

   NOTE: a few screens are written as static markup (index.html — the help
   screen, pause panel, game-over panel). Those stay in the HTML so the
   layout and styling stay visible; everything the JS builds at runtime
   lives here.
   ========================================================================= */
window.PM = window.PM || {};

PM.STR = (function () {
  'use strict';

  // {n} placeholder expansion for dynamic strings.
  function fmt(template, params) {
    if (typeof template !== 'string') return template;
    return template.replace(/\{(\w+)\}/g, function (_, k) {
      return (params && params[k] !== undefined) ? params[k] : _;
    });
  }

  const T = {

    /* ============ title screen ============ */

    // rotating one-liner under the logo (attract mode)
    tagline: [
      'A Q*BERT TRIBUTE · OPEN EVERY PORT',
      'THE NETWORK IS YOURS FOR THE TAKING',
      'DON\'T LET THE HACKERS WIN',
      'SECURE THE GRID · SURVIVE THE NIGHT',
      'EVERY PORT IS A DOOR — KNOCK LOUDLY',
      'NO PATCH. NO PEACE.',
      'WATCH YOUR STEP, OPERATOR',
    ],

    // rolling attract marquee under the logo
    marquee: {
      insertCoin: 'INSERT COIN',
      credits: 'CREDITS 0',
      gameOver: 'GAME OVER',
      hiScore: 'HI-SCORE {score}',
      rank: '{rank}. {name}  {score}',
      emptyTable: 'BE THE FIRST ON THE NETWORK',
      courtesy: 'COURTESY OF PORT MAPPER SYSTEMS',
    },

    pressStart: 'PRESS START',
    startingIn: 'STARTING IN {n}',
    returningToTitle: 'RETURNING TO TITLE {n}',

    /* ============ menus ============ */

    menu: {
      start: 'START GAME',
      difficulty: 'DIFFICULTY',
      sound: 'SOUND',
      highScores: 'HIGH SCORES',
      howToPlay: 'HOW TO PLAY',
    },
    screenTitles: {
      difficulty: 'SELECT THREAT LEVEL',
      sound: 'SOUND SETTINGS',
      scores: 'HIGH SCORES',
      help: 'HOW TO PLAY',
    },
    soundHint: 'M MUTES EVERYTHING ANYWHERE',
    clearScores: 'CLEAR',
    back: '← BACK',
    pressStartBlink: 'PRESS START',
    footer: {
      brand: '© 2026 PORT MAPPER SYSTEMS',
      insertCoin: 'INSERT COIN',
      controls: '▲▼ SELECT · ENTER CONFIRM',
    },

    /* ============ help screen ============
       Prose blocks are stored as HTML snippets (data-i18n-html targets in the
       markup) so translators can keep <b>/<span class> emphasis. The CONTROLS
       key-diamond is structural art and stays in index.html; only its captions
       are translated here. */
    help: {
      objectiveH: '▸ OBJECTIVE',
      objective:
        '<p>Hop the Mapper across the pyramid of <b>network ports</b>. Land on a port to change its status from ' +
        '<span class="c-red">CLOSED</span> to <span class="c-amber">SCANNING</span> to ' +
        '<span class="c-green">OPEN</span>. Open every port to clear the level — the apex port is always the last one standing.</p>' +
        '<p class="c-amber small">Level 1 ports open in one hop. From Level 2 they need two hops.</p>',
      controlsH: '▸ CONTROLS',
      keysDiamond: 'DIAMOND KEYS',
      keysArrows: 'ARROW KEYS',
      controlsHint:
        '<p class="small">Both key sets hop the Mapper along the pyramid\'s four diagonals — same moves, ' +
        'pick whichever feels right. Numpad <b>7 · 9 · 1 · 3</b> and a gamepad stick / D-pad work too. ' +
        'Hold a key to keep hopping.</p>',
      sysPause: 'PAUSE',
      sysMute: 'MUTE',
      sysTitle: 'TITLE',
      sysBack: 'BACK',
      sysConfirm: 'CONFIRM',
      hostileH: '▸ HOSTILE TRAFFIC',
      hostile:
        '<ul class="enemy-list">' +
        '<li><span class="e-worm">●</span> <b>COILY WORM</b> — a purple egg bounces down the pyramid and hatches ' +
        'at the base into a snake that hunts you down. Lure it off an edge, or escape by disc while it\'s close: ' +
        '<span class="c-green">+500</span></li>' +
        '<li><span class="e-ping">●</span> <b>PING / PONG</b> — purple packets (Ugg &amp; Wrongway) climbing the pyramid flanks. Avoid!</li>' +
        '<li><span class="e-packet">●</span> <b>RED PACKET</b> — bounces down through the middle of the pyramid. Avoid!</li>' +
        '<li><span class="e-green">●</span> <b>FREEZE BALL</b> — a green ball bouncing down. CATCH it: ' +
        '<span class="c-green">+100</span> and all hostile traffic freezes solid.</li>' +
        '<li><span class="e-hack">●</span> <b>HACKERS</b> — hop across the pyramid reverting OPEN ports to SCANNING. ' +
        'Not deadly — catch them for <span class="c-green">+300</span>!</li>' +
        '</ul>',
      pickupsH: '▸ SERVICE PACKS & PICKUPS',
      pickups:
        '<ul class="enemy-list">' +
        '<li><span class="p-disc">◍</span> <b>SERVICE PACK</b> — hovercraft on the pyramid flanks. Hop off the edge ' +
        'onto it to ride straight to the apex <span class="c-green">+200</span>. Unused discs pay out at level end.</li>' +
        '<li><span class="p-packet">▣</span> <b>DATA PACKET</b> — bonus <span class="c-green">+500</span>.</li>' +
        '<li><span class="p-fw">▢</span> <b>FIREWALL</b> — blocks one hit.</li>' +
        '<li><span class="p-oc">⚡</span> <b>OVERCLOCK</b> — faster hops.</li>' +
        '</ul>',
      scoringH: '▸ SCORING',
      scoring:
        '<ul class="scoring-list">' +
        '<li>Port status change <span>15 / 25</span></li>' +
        '<li>Chain multiplier <span>×2…×5</span></li>' +
        '<li>Worm falls off edge <span>+500</span></li>' +
        '<li>Hacker caught <span>+300</span></li>' +
        '<li>Re-secure a hacked port <span>+75 · QUICK +150→400 (+50/level)</span></li>' +
        '<li>Level bonus <span>1000 + 250/level (max 5000)</span></li>' +
        '<li>Perfect round (no losses) <span>+1500</span></li>' +
        '<li>Extra life <span>at 8000, then every 14000</span></li>' +
        '</ul>',
      notesH: '▸ FIELD NOTES',
      notes:
        '<ul class="enemy-list">' +
        '<li>Falling off the pyramid costs a life — but it\'s also your escape route.</li>' +
        '<li>Hoppers can\'t pass through each other: time your landings.</li>' +
        '<li>Keep moving — consecutive port opens build a <span class="c-mag">CHAIN</span> multiplier.</li>' +
        '<li>Quick re-secures chain into a <span class="c-mag">QUICK</span> streak — each rung pays more, a slow reclaim resets it.</li>' +
        '<li>The apex is the final port. Guard it from hackers.</li>' +
        '<li>Leave the title idle for 30 seconds and the cabinet starts a round for you.</li>' +
        '<li>Abandon a game-over screen and it cycles back to attract mode after 10 seconds.</li>' +
        '</ul>',
    },
    pause: {
      title: 'PAUSED',
      resume: 'RESUME',
      restart: 'RESTART',
      quit: 'QUIT TO MENU',
      sound: 'SOUND: {state}',
      resumeHint: 'P OR ESC TO RESUME',
    },
    gameover: {
      title: 'GAME OVER',
      score: 'SCORE',
      level: 'LEVEL',
      difficulty: 'DIFFICULTY',
      playAgain: 'PLAY AGAIN',
      highScores: 'HIGH SCORES',
      menu: 'MENU',
    },

    settings: {
      soundFx: 'SOUND FX',
      music: 'MUSIC',
      crt: 'CRT FILTER',
      on: 'ON',
      off: 'OFF',
    },

    /* ============ high scores / initials ============ */

    scoresEmpty: 'NO SCORES RECORDED YET.<br>BE THE FIRST ON THE NETWORK.',
    scoresHead: { rank: '#', name: 'NAME', score: 'SCORE', lvl: 'LVL', diff: 'DIFF' },
    newHighScore: 'NEW HIGH SCORE — ENTER YOUR INITIALS',
    initialsHint: 'TYPE A–Z · ▲▼ CYCLE · ENTER CONFIRM',
    finalScore: 'FINAL SCORE',
    allTimeBest: 'ALL-TIME BEST: {score}',
    defaultName: 'AAA',

    /* ============ game over round report ============ */

    reportTitle: 'ROUND REPORT',
    report: {
      ports: 'PORTS OPENED',
      chain: 'BEST CHAIN',
      quick: 'BEST QUICK',
      reSecures: 'RE-SECURES',
      hackers: 'HACKERS CAUGHT',
      worms: 'WORMS FELLED',
      losses: 'LOSSES',
      time: 'ROUND TIME',
    },

    /* ============ HUD ============ */

    hud: {
      score: 'SCORE',
      hiScore: 'HI-SCORE',
      level: 'LEVEL',
      diff: 'DIFF',
      lives: 'LIVES',
      quick: 'QUICK',
    },
    hudQuick: '×{streak} +{pay}',
    livesMore: ' ×{n}',
    muteOn: '♪',
    muteOff: '✕',

    /* ============ cards (in-canvas) ============ */

    cards: {
      roundComplete: 'ROUND COMPLETE',
      hiScore: 'HI-SCORE {score}',
      insertCoin: 'INSERT COIN',
      levelClear: 'LEVEL {n} CLEAR',
      levelIntro: 'LEVEL {n}',
      levelBonus: 'LEVEL BONUS',
      hackersActive: 'HACKERS ACTIVE',
      portsNeedHops: 'PORTS NEED 2 HOPS',
      oneHopPorts: 'ONE HOP PORTS',
      servicePacks: 'SERVICE PACKS ×{n}',
      perfectRound: 'PERFECT ROUND!',
      reSecured: 'RE-SECURED ×{n}',
      totalBonus: 'TOTAL BONUS',
      getReady: 'GET READY FOR LEVEL {n}',
      openAll: 'OPEN ALL {n} PORTS',
      ready: 'READY?',
    },

    /* ============ gameplay floats ============ */

    floats: {
      extraLife: 'EXTRA LIFE!',
      chain: 'CHAIN ×{n}',
      streak: 'STREAK ×{n}',
      quickReSecured: 'QUICK RE-SECURED +{n}!',
      reSecured: 'RE-SECURED +{n}!',
      nextQuick: 'NEXT QUICK +{n}',
      frozen: 'FROZEN!',
      blocked: 'BLOCKED!',
      offline: 'OFFLINE!',
      caught: 'CAUGHT!',
      glitch: '!?#@!',
      servicePack: 'SERVICE PACK',
      hackerDetected: 'HACKER DETECTED',
      portOffline: 'PORT OFFLINE',
    },

    /* ============ difficulty tiers ============ */

    diff: {
      easy: {
        label: 'EASY', short: 'EASY',
        desc: '5 LIVES · LIGHT TRAFFIC · MORE POWER-UPS',
      },
      normal: {
        label: 'NORMAL', short: 'NORM',
        desc: '3 LIVES · STOCK SETTINGS',
      },
      hard: {
        label: 'HARD', short: 'HARD',
        desc: '3 LIVES · HEAVY TRAFFIC · HACKERS FROM LEVEL 1',
      },
      gamer: {
        label: 'GAMER', short: 'GMR',
        desc: '2 LIVES · MAXIMUM THREAT · NO MERCY',
      },
    },

    /* ============ power-ups ============ */

    powerups: {
      packet: 'DATA PACKET',
      firewall: 'FIREWALL',
      overclock: 'OVERCLOCK',
    },
  };

  // Push the static DOM strings (buttons, headings, footer) from the table
  // into elements marked data-i18n="key.path". Call once at boot, after the
  // markup exists. Keeps index.html copy in ONE place (the strings table)
  // while the layout itself stays in the markup.
  //   data-i18n="key"       -> plain text (textContent)
  //   data-i18n-html="key"  -> rich HTML snippet (innerHTML), used by the
  //                             help screen's prose blocks
  function staticI18n() {
    const lookup = function (key) {
      return key.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, T);
    };
    const plain = document.querySelectorAll('[data-i18n]');
    for (let i = 0; i < plain.length; i++) {
      const el = plain[i];
      const val = lookup(el.getAttribute('data-i18n'));
      if (typeof val === 'string') el.textContent = val;
    }
    const rich = document.querySelectorAll('[data-i18n-html]');
    for (let i = 0; i < rich.length; i++) {
      const el = rich[i];
      const val = lookup(el.getAttribute('data-i18n-html'));
      if (typeof val === 'string') el.innerHTML = val;
    }
  }

  // Debug flag for translator tooling (?debug=1 in the URL). When armed, a
  // watcher script polls this file and reloads the page on change so edits
  // appear without a manual refresh. Never enabled in normal play.
  let debugMode = false;

  return {
    T,
    fmt,
    staticI18n,
    debugMode: function () { return debugMode; },
    setDebug: function (on) { debugMode = !!on; },
  };
})();
