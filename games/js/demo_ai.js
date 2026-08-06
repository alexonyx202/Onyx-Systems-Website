"use strict";
/* ============================================================
   DATA BREAK — AI Demo Player (arcade attract loop)
   When the title screen is idle for several seconds, the AI
   takes over: loads a level, plays automatically, and returns
   to the title when the player interacts.

   Sessions cycle deterministically through campaign sectors
   1-6, then an endless run (a few waves), then repeats — each
   with a randomized ship/scrubber loadout shown in a corner
   card. The overlay chrome fades in, holds, and fades back out
   on an arcade "insert coin" rhythm while the AI keeps playing.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const U = R.Util;
  const C = R.Config;

  let idleTimer = 0;
  let idleThreshold = 6;             // seconds of inactivity before demo starts
  let demoActive = false;

  // ---- attract-loop overlay fade cycle ----
  // The overlay (corner card + bottom bar) fades in, holds, then fades back
  // out so the screen breathes like a real attract loop; the AI keeps playing
  // through the gap.
  const OVERLAY_IN = 0.7;            // fade in
  const OVERLAY_HOLD = 4.2;          // full visibility
  const OVERLAY_OUT = 0.8;           // fade out
  const OVERLAY_GAP = 1.3;           // bare gameplay moment
  const OVERLAY_CYCLE = OVERLAY_IN + OVERLAY_HOLD + OVERLAY_OUT + OVERLAY_GAP;
  let overlayT = 0;                  // seconds into the fade cycle

  // ---- deterministic session queue ----
  // campaign sectors 1-6, then one endless run, then wrap. `peekSession`
  // exposes the queue so tests (and the UI) can reason about it deterministically.
  const DEMO_QUEUE = [];
  for (let i = 1; i <= 6; i++) DEMO_QUEUE.push({ endless: false, level: i });
  DEMO_QUEUE.push({ endless: true, waves: 6 });
  let cyclePos = 0;                  // index of the NEXT session to start
  let session = null;                // current session descriptor
  let sessionTarget = 1;             // sector to end after / endless wave cap

  // AI state
  let aiTargetX = 0;                 // smoothed target X for paddle
  let aiLaunchTimer = 0;             // countdown to auto-launch
  let aiBallGoingDown = false;
  let aiPaddleTarget = 0;            // actual paddle movement target
  let aiDifficulty = "trainee";      // use trainee for demo (more forgiving)
  let aiShip = "laptop";
  let aiScrubber = "standard";

  // current run state pointers
  let eng = null;

  // ---- idle detection ----
  function resetIdle() {
    idleTimer = 0;
    if (demoActive) {
      stopDemo();
    }
  }

  function tickIdle(dt) {
    if (demoActive) return;
    idleTimer += dt;
    if (idleTimer >= idleThreshold) {
      startDemo();
    }
  }

  // ---- attract-loop timing ----
  function overlayAlphaAt(t) {
    const tt = t % OVERLAY_CYCLE;
    if (tt < OVERLAY_IN) return tt / OVERLAY_IN;
    const t2 = tt - OVERLAY_IN;
    if (t2 < OVERLAY_HOLD) return 1;
    const t3 = t2 - OVERLAY_HOLD;
    if (t3 < OVERLAY_OUT) return 1 - t3 / OVERLAY_OUT;
    return 0;
  }
  function overlayAlpha() { return overlayAlphaAt(overlayT); }

  // ---- session queue ----
  function peekSession(offset) {
    return DEMO_QUEUE[(cyclePos + (offset || 0)) % DEMO_QUEUE.length];
  }

  // ---- demo lifecycle ----
  function startDemo() {
    const E = R.Engine;
    eng = E;
    demoActive = true;
    overlayT = 0;

    // advance the attract-loop cycle: sectors 1..6, endless, repeat
    const s = DEMO_QUEUE[cyclePos % DEMO_QUEUE.length];
    cyclePos++;
    session = s;
    sessionTarget = s.endless ? s.waves : s.level;

    // randomize demo loadout for variety (the corner card shows it)
    const ships = ["laptop", "server", "cyber", "ai", "quantum", "mother", "firewall", "cloud", "net", "kernel"];
    const scrubs = ["standard", "antivirus", "nano", "quantum", "magnetic", "laser", "compression", "emp", "breaker", "duo", "multicore"];
    aiShip = U.pick(ships);
    aiScrubber = U.pick(scrubs);
    aiDifficulty = "trainee";

    // force the engine into a demo run
    E.difficulty = C.DIFFICULTIES[aiDifficulty];
    E.shipId = aiShip;
    E.scrubberId = aiScrubber;
    E.endless = !!s.endless;
    E.level = s.endless ? 1 : s.level;
    E.wave = 0;
    E.score = 0;
    E.combo = 0;
    E.setMult(1);
    E.lives = 99;                     // never die in demo
    E.nextLifeAt = C.EXTRA_LIFE_SCORE;
    E.ballsLost = 0;
    E.laserKills = 0;
    E.bonusCaught = 0;
    E.bonusMode = false;
    E.demoMode = true;

    // hide title screen, show the canvas
    R.UI.hideAllScreens();
    document.getElementById("btn-pause").classList.remove("show");

    E.loadLevel(E.level);
    aiLaunchTimer = 1.0;              // brief delay before first launch
    aiTargetX = E.worldW / 2;
    aiPaddleTarget = E.worldW / 2;
    aiBallGoingDown = false;
  }

  function stopDemo() {
    if (!demoActive) return;
    demoActive = false;
    if (eng) {
      eng.demoMode = false;
      eng.quitToTitle();
    }
    eng = null;
    overlayT = 0;
  }

  // ---- AI logic ----
  function update(dt) {
    if (!demoActive || !eng) return;
    const E = eng;
    if (E.state === R.Engine.STATE.TITLE) {
      // Safety net: if the engine ever lands on the title mid-session (the
      // normal session end calls startDemo() directly instead), pick up the
      // next session rather than idling on a blank title.
      if (demoActive) {
        startDemo();
      }
      return;
    }

    // attract-loop overlay clock (the AI keeps playing through the fade gap)
    overlayT += dt;

    // if we're in the intro countdown, wait
    if (E.state === R.Engine.STATE.INTRO) {
      return;
    }

    // End the session once its showcase target is reached — the campaign
    // sector cleared, or the endless wave cap hit. Uses the engine's live mode
    // (E.endless) so campaign ends on the sector, endless on the wave cap.
    // Restart directly (like the VICTORY path): bouncing through quitToTitle()
    // would clear the engine's demoMode and freeze the attract loop.
    if (E.state === R.Engine.STATE.CLEAR) {
      const done = E.endless ? E.wave >= sessionTarget : E.level >= sessionTarget;
      if (done) {
        startDemo();
      }
      return;
    }

    // if game over or victory, restart demo
    if (E.state === R.Engine.STATE.GAMEOVER || E.state === R.Engine.STATE.VICTORY) {
      startDemo();
      return;
    }

    // if paused (shouldn't happen in demo), resume
    if (E.state === R.Engine.STATE.PAUSE) {
      E.resume();
      return;
    }

    if (E.state !== R.Engine.STATE.PLAY) return;

    const pad = E.paddle;
    if (!pad) return;

    // ---- AI paddle movement ----
    // Find the most dangerous ball (lowest y, moving down)
    let targetBall = null;
    let lowestY = Infinity;
    for (const b of E.balls) {
      if (b.stuck) {
        targetBall = b;
        lowestY = -Infinity;
        break;
      }
      // track if ball is moving down
      const goingDown = b.vy > 0;
      // prioritize balls that are moving down AND are low
      const urgency = goingDown ? b.y : b.y - 300;
      if (urgency < lowestY || (!targetBall && goingDown)) {
        lowestY = goingDown ? b.y : b.y - 300;
        targetBall = b;
        aiBallGoingDown = goingDown;
      }
    }

    if (targetBall) {
      if (targetBall.stuck) {
        // ball is stuck on paddle: aim slightly upward and launch
        aiTargetX = pad.x;
        // launch handled in the stuck-ball loop below
      } else {
        // predict where the ball will be at paddle Y
        // Simple prediction: if moving down, aim for where it'll cross the paddle line
        if (aiBallGoingDown && targetBall.vy > 0) {
          const timeToPaddle = (C.PADDLE_Y - targetBall.y) / targetBall.vy;
          const predictedX = targetBall.x + targetBall.vx * timeToPaddle;
          // clamp to playfield
          const padMin = pad.w / 2 + 8;
          const padMax = E.worldW - pad.w / 2 - 8;
          aiTargetX = U.clamp(predictedX, padMin, padMax);
        } else {
          // ball moving up: drift toward center to be ready
          aiTargetX = U.damp(aiTargetX, E.worldW / 2, 1.5, dt);
        }
      }
    }

    // Move paddle toward target with smooth easing.
    // Use the pointer position approach: set the pointer's world x so the
    // engine's pointer branch picks it up naturally (avoids fighting the
    // brake logic in the keyboard/no-input branches).
    const padMin = pad.w / 2 + 8;
    const padMax = E.worldW - pad.w / 2 - 8;
    aiPaddleTarget = U.clamp(aiTargetX, padMin, padMax);

    // Set the pointer position to the AI target so the engine's pointer
    // branch takes over (mouse mode, not touch mode).
    const ptr = R.Input.state.pointer;
    ptr.wx = aiPaddleTarget;
    ptr.wy = C.PADDLE_Y - 20;
    R.Input.state.pointerSet = true;
    R.Input.state.lastInput = "pointer";
    R.Input.state.touchMode = false;

    // Auto-launch stuck balls (single timer, not per-ball)
    let hasStuck = false;
    for (const b of E.balls) {
      if (b.stuck) { hasStuck = true; break; }
    }
    if (hasStuck) {
      aiLaunchTimer -= dt;
      if (aiLaunchTimer <= 0) {
        for (const b of E.balls) {
          if (b.stuck) {
            const aimAngle = U.rand(-0.15, 0.15);
            E.launchBall(b);
            const sp = U.len(b.vx, b.vy);
            const ang = -Math.PI / 2 + aimAngle;
            b.vx = Math.cos(ang) * sp;
            b.vy = Math.sin(ang) * sp;
          }
        }
        aiLaunchTimer = U.rand(1.5, 3.5);
      }
    }
  }

  // ---- render overlay (arcade attract loop) ----
  // Two pieces, both governed by the shared fade cycle:
  //   1. a corner card (top-left) showing the current ship + scrubber loadout
  //   2. a bottom bar with the pulsing REC dot and blinking "press any key"
  function renderOverlay(ctx, viewW, viewH) {
    if (!demoActive || !eng) return;
    const a = overlayAlpha();
    if (a <= 0.01) return;

    const E = eng;
    const t = E.time;

    // ---- corner loadout card ----
    // The demo overlay is drawn in SCREEN space (after the world transform is
    // restored), so anchor the card in screen px and scale it by E.scale to
    // read at the same size relative to the playfield on every screen.
    const sx = 18, sy = 140;          // screen-space anchor (top-left)
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(sx, sy);
    ctx.scale(E.scale, E.scale);
    const cw = 300, ch = 96;

    // panel
    ctx.fillStyle = "rgba(4, 8, 18, 0.72)";
    R.Art.rr(ctx, 0, 0, cw, ch, 10); ctx.fill();
    ctx.strokeStyle = "rgba(34, 211, 238, 0.3)";
    ctx.lineWidth = 1.2;
    R.Art.rr(ctx, 0, 0, cw, ch, 10); ctx.stroke();

    // column labels
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = '10px "Cascadia Code", monospace';
    ctx.fillStyle = "rgba(125, 147, 184, 0.95)";
    ctx.fillText("SHIP", 10, 12);
    ctx.fillText("SCRUBBER", 165, 12);

    // ship sprite, gently banking on a slow sway
    const sway = Math.sin(t * 0.9) * 0.14;
    R.Art.drawShip(ctx, 42, 42, 96, 34, aiShip, { t, bank: sway });

    // scrubber ball next to it
    R.Art.drawBall(ctx, { x: 218, y: 42, r: 12, kind: aiScrubber }, t);

    // names (truncated to the column)
    const shipDef = R.Ships.get(aiShip);
    const scrubDef = R.Scrubbers.get(aiScrubber);
    ctx.font = '600 12px "Cascadia Code", monospace';
    ctx.fillStyle = "#eaf6ff";
    ctx.fillText(trunc(ctx, shipDef.name, 148), 10, 74);
    ctx.fillText(trunc(ctx, scrubDef.name, 120), 165, 74);

    // mode line (session progress)
    ctx.font = '10px "Cascadia Code", monospace';
    ctx.fillStyle = "rgba(34, 211, 238, 0.85)";
    const modeText = E.endless
      ? "ENDLESS  ·  WAVE " + Math.min(E.wave + 1, sessionTarget) + "/" + sessionTarget
      : "SECTOR " + session.level + "/6";
    ctx.fillText(modeText, 10, 89);

    ctx.restore();

    // ---- bottom bar ----
    const barH = 64;
    ctx.save();
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = "rgba(4, 8, 16, 0.8)";
    ctx.fillRect(0, viewH - barH, viewW, barH);
    // accent hairline on top of the bar
    ctx.fillStyle = "rgba(34, 211, 238, 0.5)";
    ctx.fillRect(0, viewH - barH, viewW, 2);

    // left: AI DEMO tag + pulsing REC dot
    const rec = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = '700 16px "Cascadia Code", ui-monospace, monospace';
    ctx.fillStyle = "#22d3ee";
    ctx.fillText("AI DEMO", 26, viewH - barH / 2 + 1);
    const dotX = 26 + ctx.measureText("AI DEMO").width + 14;
    ctx.fillStyle = `rgba(248, 113, 113, ${0.3 + 0.7 * rec})`;
    ctx.beginPath(); ctx.arc(dotX, viewH - barH / 2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '600 11px "Cascadia Code", monospace';
    ctx.fillStyle = `rgba(248, 113, 113, ${0.35 + 0.65 * rec})`;
    ctx.fillText("LIVE", dotX + 12, viewH - barH / 2 + 1);

    // center: press any key (blinks at full-alpha moments)
    const blink = 0.55 + 0.45 * Math.sin(t * 3);
    ctx.textAlign = "center";
    ctx.globalAlpha = a * blink;
    ctx.font = '700 19px "Cascadia Code", ui-monospace, monospace';
    ctx.fillStyle = "#22d3ee";
    ctx.fillText("▶ PRESS ANY KEY TO PLAY", viewW / 2, viewH - barH / 2 + 2);

    // right: current ship · scrubber (compact). Skipped on narrow screens —
    // the full names would collide with the center prompt (and the corner
    // card already shows the loadout there).
    if (viewW >= 720) {
      ctx.textAlign = "right";
      ctx.globalAlpha = a * 0.85;
      ctx.font = '600 12px "Cascadia Code", monospace';
      ctx.fillStyle = "rgba(214, 231, 255, 0.85)";
      ctx.fillText(shipDef.name.toUpperCase() + " · " + scrubDef.name.toUpperCase(), viewW - 26, viewH - barH / 2 + 1);
    }

    ctx.restore();
  }

  function trunc(ctx, s, maxW) {
    if (ctx.measureText(s).width <= maxW) return s;
    let out = s;
    while (out.length > 1 && ctx.measureText(out + "…").width > maxW) {
      out = out.slice(0, -1);
    }
    return out + "…";
  }

  // ---- public API ----
  R.DemoAI = {
    resetIdle,
    tickIdle,
    update,
    renderOverlay,
    peekSession,
    overlayAlpha,
    overlayAlphaAt,
    get active() { return demoActive; },
    get ship() { return aiShip; },
    get scrubber() { return aiScrubber; },
    get session() { return session; },
    get cyclePos() { return cyclePos; }
  };

})(window.BREAK);
