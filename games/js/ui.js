"use strict";
/* ============================================================
   DATA BREAK — UI layer
   DOM screens (title, ships, settings, scores, ...), toasts,
   pause handling, and game over / victory flows.
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const U = R.Util;
  const UI = {
    screens: {},
    container: null,   // #screens overlay container (cached in init)
    current: null,
    pendingDifficulty: "standard",
    pendingShip: "laptop",
    pendingScrubber: "standard",
    settingsFromPause: false,

    init(engine) {
      this.engine = engine;
      this.container = document.getElementById("screens");
      this.cacheScreens();
      this.buildTitleMenu();
      this.buildDifficulty();
      this.buildSettings();
      this.buildHelp();
      this.bindActions();
      this.show("title");
      document.getElementById("btn-pause").classList.remove("show");
      this.setMusicUI();
    },

    cacheScreens() {
      const ids = ["title", "story", "difficulty", "ships", "help", "settings", "scores", "achievements", "credits", "gameover", "victory", "pause"];
      for (const id of ids) {
        const el = document.getElementById("screen-" + id);
        if (el) this.screens[id] = el;
      }
    },

    show(id) {
      this.current = id;
      // The container itself is a full-viewport fixed div at z-index 50 — if it
      // stayed visible while every child screen was hidden it would silently
      // swallow all pointer events during gameplay (mouse steering and click-
      // to-launch would be dead). Hide the container unless a screen is shown.
      const active = id !== null && id !== undefined;
      this.container.classList.toggle("hidden", !active);
      for (const key of Object.keys(this.screens)) {
        this.screens[key].classList.toggle("hidden", key !== id);
      }
      if (id === "ships") this.buildShips();
      if (id === "scores") this.buildScores();
      if (id === "achievements") this.buildAchievements();
      if (id === "title") this.refreshTitleStats();
      if (id === "pause") this.setPauseVisible(true);
      else this.setPauseVisible(false);
      R.Audio.play("ui");
    },

    hideAllScreens() {
      for (const key of Object.keys(this.screens)) {
        this.screens[key].classList.add("hidden");
      }
      this.current = null;
      this.container.classList.add("hidden");
    },

    setPauseVisible(v) {
      document.getElementById("btn-pause").classList.toggle("show", v);
    },

    // ---------------- title menu ----------------
    buildTitleMenu() {
      const menu = document.getElementById("title-menu");
      menu.innerHTML = "";
      const maxLevel = R.Save.get("progress.maxLevel", 1);
      const items = [
        { label: maxLevel > 1 ? "CONTINUE — SECTOR " + maxLevel : "NEW CAMPAIGN", action: "continue", primary: true },
        { label: "SHIP SELECT", action: "ships" },
        { label: "HOW TO PLAY", action: "help" },
        { label: "HIGH SCORES", action: "scores" },
        { label: "ACHIEVEMENTS", action: "achievements" },
        { label: "SETTINGS", action: "settings" },
        { label: "CREDITS", action: "credits" }
      ];
      for (const it of items) {
        const b = document.createElement("button");
        b.className = "btn" + (it.primary ? " btn-primary" : " btn-ghost");
        b.textContent = it.label;
        b.dataset.action = it.action;
        menu.appendChild(b);
      }
    },

    refreshTitleStats() {
      const s = R.Save.get("stats", {});
      const el = document.getElementById("title-stats");
      const scores = R.Save.scores;
      el.innerHTML = scores.length
        ? `BEST ${U.fmt(scores[0].score)} &middot; BLOCKS ${U.fmt(s.blocksDestroyed || 0)} &middot; BOSSES ${s.bossesDefeated || 0}`
        : `BLOCKS ${U.fmt(s.blocksDestroyed || 0)} &middot; BOSSES ${s.bossesDefeated || 0}`;
    },

    // ---------------- actions ----------------
    bindActions() {
      document.addEventListener("click", (e) => {
        const t = e.target.closest("[data-action]");
        if (!t) return;
        const a = t.dataset.action;
        this.handleAction(a, t);
      });
    },

    handleAction(a, t) {
      const E = this.engine;
      switch (a) {
        case "continue": {
          const seen = R.Save.get("progress.seenStory", false);
          const fresh = R.Save.get("progress.maxLevel", 1) <= 1 && !seen;
          if (fresh) this.show("story");
          else this.flowToShips(R.Save.get("progress.difficulty", "standard"), true);
          break;
        }
        case "begin":
          R.Save.set("progress.seenStory", true);
          this.show("difficulty");
          break;
        case "confirm-diff":
          this.flowToShips(this.pendingDifficulty, false);
          break;
        case "back-title":
          if (this.settingsFromPause && E.state === "pause") {
            this.settingsFromPause = false;
            this.show("pause");
          } else {
            this.settingsFromPause = false;
            E.quitToTitle();
          }
          break;
        case "back-ships":
          this.show("ships");
          break;
        case "start-mission": {
          const diff = this.pendingDifficulty;
          const ship = this.pendingShip;
          const scrub = this.pendingScrubber;
          const start = R.Save.get("progress.maxLevel", 1);
          this.show(null);
          document.getElementById("btn-pause").classList.add("show");
          E.startRun(diff, ship, scrub, start, false);
          break;
        }
        case "retry": {
          const diff = R.Save.get("progress.difficulty", "standard");
          const ship = R.Save.get("progress.ship", "laptop");
          const scrub = R.Save.get("progress.scrubber", "standard");
          this.show(null);
          document.getElementById("btn-pause").classList.add("show");
          E.startRun(diff, ship, scrub, 1, false);
          break;
        }
        case "continue-endless": {
          const diff = R.Save.get("progress.difficulty", "standard");
          const ship = R.Save.get("progress.ship", "laptop");
          const scrub = R.Save.get("progress.scrubber", "standard");
          this.show(null);
          document.getElementById("btn-pause").classList.add("show");
          E.startRun(diff, ship, scrub, 1, true);
          break;
        }
        case "resume": E.resume(); break;
        case "restart-level": E.restartLevel(); break;
        case "settings-pause": this.showSettingsInPause(); break;
        case "quit-run": E.quitToTitle(); break;
        case "save-score": this.saveScore(); break;
        case "reset-save": this.resetSave(); break;
        case "ships": this.flowToShips(R.Save.get("progress.difficulty", "standard"), false); break;
        case "help": this.show("help"); break;
        case "scores": this.show("scores"); break;
        case "achievements": this.show("achievements"); break;
        case "settings": this.show("settings"); break;
        case "credits": this.show("credits"); break;
        default: break;
      }
    },

    flowToShips(diff, fromContinue) {
      this.pendingDifficulty = diff;
      this.pendingShip = R.Save.get("progress.ship", "laptop");
      this.pendingScrubber = R.Save.get("progress.scrubber", "standard");
      this.buildDifficulty();
      if (fromContinue && R.Save.get("progress.maxLevel", 1) > 1) {
        // resume straight into the run with the saved loadout
        this.show(null);
        document.getElementById("btn-pause").classList.add("show");
        this.engine.startRun(diff, this.pendingShip, this.pendingScrubber, R.Save.get("progress.maxLevel", 1), false);
      } else {
        this.show("ships");
      }
    },

    // ---------------- difficulty ----------------
    buildDifficulty() {
      const wrap = document.getElementById("diff-cards");
      wrap.innerHTML = "";
      const keys = ["trainee", "standard", "expert"];
      const current = R.Save.get("progress.difficulty", "standard");
      for (const k of keys) {
        const d = R.Config.DIFFICULTIES[k];
        const card = document.createElement("div");
        card.className = "diff-card" + (k === current ? " selected" : "");
        card.dataset.diff = k;
        card.innerHTML = `
          <div class="dc-name">${d.name.toUpperCase()}</div>
          <div class="dc-desc">${d.desc}</div>
          <div class="dc-meta">${d.lives} ships &middot; ${Math.round(d.speed * 100)}% speed &middot; score x${d.scoreMult}</div>`;
        card.addEventListener("click", () => {
          this.pendingDifficulty = k;
          R.Save.set("progress.difficulty", k);
          this.buildDifficulty();
        });
        wrap.appendChild(card);
      }
    },

    // ---------------- ships & scrubbers ----------------
    buildShips() {
      const grid = document.getElementById("ship-grid");
      grid.innerHTML = "";
      const ships = R.Config.SHIP_TRAITS ? Object.keys(R.Config.SHIP_TRAITS) : R.Ships ? R.Ships.list() : shipListFallback();
      const unlocked = R.Save.get("progress.ships", ["laptop", "server", "cyber"]);
      for (const id of ships) {
        const def = R.Ships ? R.Ships.get(id) : { name: id, desc: "", trait: "" };
        const locked = !unlocked.includes(id);
        const card = document.createElement("div");
        card.className = "ship-card" + (id === this.pendingShip ? " selected" : "") + (locked ? " locked" : "");
        const cv = document.createElement("canvas");
        cv.width = 220; cv.height = 74;
        this.paintShip(cv, id);
        card.appendChild(cv);
        const name = document.createElement("div");
        name.className = "sc-name";
        name.textContent = locked ? "???" : def.name;
        card.appendChild(name);
        const desc = document.createElement("div");
        desc.className = "sc-desc";
        desc.textContent = locked ? "Destroy more corrupted data to unlock." : def.desc;
        card.appendChild(desc);
        if (locked) {
          const lk = document.createElement("div");
          lk.className = "sc-lock";
          lk.textContent = "🔒";
          card.appendChild(lk);
          card.addEventListener("click", () => R.Audio.play("alert"));
        } else {
          const tr = document.createElement("div");
          tr.className = "sc-trait";
          tr.textContent = def.trait;
          card.appendChild(tr);
          card.addEventListener("click", () => {
            this.pendingShip = id;
            R.Save.set("progress.ship", id);
            this.buildShips();
          });
        }
        grid.appendChild(card);
      }
      // scrubbers (locked until campaign progress, like ships)
      const brow = document.getElementById("ball-row");
      brow.innerHTML = "";
      const balls = R.Scrubbers ? R.Scrubbers.list() : Object.keys(R.Art.BALL_STYLE);
      const unlockedScrubs = R.Scrubbers ? R.Scrubbers.unlocked() : balls;
      // fallback: a saved scrubber that is no longer owned (reset save / older save)
      if (!unlockedScrubs.includes(this.pendingScrubber)) {
        this.pendingScrubber = unlockedScrubs[0];
        R.Save.set("progress.scrubber", this.pendingScrubber);
      }
      for (const id of balls) {
        const st = R.Art.BALL_STYLE[id];
        const def = R.Scrubbers ? R.Scrubbers.get(id) : { name: id, trait: scrubTrait(id) };
        const locked = !unlockedScrubs.includes(id);
        const needLvl = R.Scrubbers && R.Scrubbers.unlockLevel ? R.Scrubbers.unlockLevel(id) : null;
        const card = document.createElement("div");
        card.className = "ball-card" + (id === this.pendingScrubber ? " selected" : "") + (locked ? " locked" : "");
        card.style.setProperty("--bc-color", st.c);
        const dot = document.createElement("div");
        dot.className = "bc-dot";
        dot.style.background = `radial-gradient(circle at 35% 35%, ${st.c2}, ${st.c})`;
        card.appendChild(dot);
        const nm = document.createElement("div");
        nm.className = "bc-name";
        nm.textContent = locked ? "???" : def.name.toUpperCase();
        card.appendChild(nm);
        if (locked) {
          const lk = document.createElement("div");
          lk.className = "sc-lock";
          lk.textContent = "\uD83D\uDD12";
          card.appendChild(lk);
          const tr = document.createElement("div");
          tr.className = "bc-trait";
          tr.textContent = needLvl ? "Reach Sector " + needLvl + " to unlock" : "Destroy more corrupted data to unlock.";
          card.appendChild(tr);
          card.addEventListener("click", () => R.Audio.play("alert"));
        } else {
          const tr = document.createElement("div");
          tr.className = "bc-trait";
          tr.textContent = def.trait;
          card.appendChild(tr);
          card.addEventListener("click", () => {
            this.pendingScrubber = id;
            R.Save.set("progress.scrubber", id);
            this.buildShips();
          });
        }
        brow.appendChild(card);
      }
      this.buildThemePreview();
    },

    buildThemePreview() {
      const cvs = document.getElementById("tp-canvas");
      if (!cvs) return;
      const ctx = cvs.getContext("2d");
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      const maxLevel = R.Save.get("progress.maxLevel", 1);
      const info = R.Levels.describe(maxLevel);
      if (!info || !info.colors) return;
      R.Art.drawThemePreview(ctx, info);
      const sec = document.getElementById("tp-sector");
      const nm = document.getElementById("tp-name");
      const sc = document.getElementById("tp-scheme");
      const note = document.getElementById("tp-note");
      if (sec) sec.textContent = "UP NEXT — SECTOR " + info.n;
      if (nm) nm.textContent = info.world + " · " + info.name.toUpperCase();
      if (sc) sc.textContent = info.boss ? "BOSS ENCOUNTER" : info.bonus ? "BONUS STAGE" : info.scheme.toUpperCase() + " PATTERN";
      if (note) {
        note.textContent = info.boss ? "Corrupted boss sector — prepare for a fight."
          : info.bonus ? "Bonus round — collect falling capsules!"
          : info.colors ? "Palette: " + info.colors.map(c => c).join(" · ")
          : "";
      }
    },

    paintShip(cv, id) {
      const ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      R.Art.drawShip(ctx, cv.width / 2, cv.height / 2 + 4, 92, 26, id, { t: 0 });
    },

    // ---------------- settings ----------------
    buildSettings() {
      const wrap = document.getElementById("settings-list");
      wrap.innerHTML = "";
      const rows = [
        { key: "music", name: "Music", desc: "Synthesized soundtrack" },
        { key: "sfx", name: "Sound Effects", desc: "UI and gameplay SFX" },
        { key: "crt", name: "CRT Shader", desc: "Retro scanline overlay" },
        { key: "motion", name: "Animations", desc: "Particle & background effects" },
        { key: "fps", name: "Show FPS", desc: "Display frame counter" },
        { key: "contrast", name: "High Contrast", desc: "Brighter palette" },
        { key: "endlessLockTheme", name: "Lock Endless Theme", desc: "Keep one palette across all waves" }
      ];
      for (const r of rows) {
        const row = document.createElement("div");
        row.className = "setting-row";
        const left = document.createElement("div");
        left.className = "sl-name";
        left.innerHTML = `<b>${r.name}</b><small>${r.desc}</small>`;
        const tg = document.createElement("button");
        tg.className = "toggle" + (R.Save.setting(r.key) ? " on" : "");
        tg.setAttribute("role", "switch");
        tg.setAttribute("aria-checked", R.Save.setting(r.key) ? "true" : "false");
        tg.addEventListener("click", () => {
          const on = !R.Save.setting(r.key);
          R.Save.setting(r.key, on);
          this.applySetting(r.key, on);
          tg.classList.toggle("on", on);
          tg.setAttribute("aria-checked", on ? "true" : "false");
        });
        row.appendChild(left);
        row.appendChild(tg);
        wrap.appendChild(row);
      }
    },

    applySetting(key, on) {
      if (key === "music") R.Audio.setMusic(on);
      if (key === "sfx") R.Audio.setSfx(on);
      if (key === "crt") document.getElementById("crt-overlay").classList.toggle("on", on);
      if (key === "motion") document.body.classList.toggle("motion-off", !on);
      if (key === "contrast") document.body.classList.toggle("high-contrast", on);
    },

    setMusicUI() {
      if (R.Save.setting("crt")) document.getElementById("crt-overlay").classList.add("on");
      if (!R.Save.setting("motion")) document.body.classList.add("motion-off");
      if (R.Save.setting("contrast")) document.body.classList.add("high-contrast");
    },

    showSettingsInPause() {
      // reuse settings screen with a back-to-pause escape hatch
      this.settingsFromPause = true;
      this.buildSettings();
      this.show("settings");
      this.setPauseVisible(false);
    },

    // ---------------- help ----------------
    buildHelp() {
      // data-driven block + power-up catalogs so new content shows up here
      // automatically (the swatch color is the block's palette color)
      const blk = document.getElementById("help-blocks");
      if (blk) {
        blk.innerHTML = "";
        const types = R.Bricks ? R.Bricks.TYPE_DEFS : null;
        if (types) {
          for (const key of Object.keys(types)) {
            const d = types[key];
            if (!d.label) continue;
            const st = R.Art.BLOCK_STYLE[d.style];
            const c = st ? st.c : "#94a3b8";
            const li = document.createElement("li");
            li.innerHTML =
              `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-right:6px;box-shadow:0 0 6px ${c}"></span>` +
              `<b>${d.label}</b>` +
              (d.score > 0 ? ` <small style="color:var(--ink-dim)">${d.score} pts</small>` : "");
            blk.appendChild(li);
          }
        }
      }
      const pwr = document.getElementById("help-powerups");
      if (pwr) {
        pwr.innerHTML = "";
        const kinds = R.Powerups ? R.Powerups.KINDS : null;
        if (kinds) {
          for (const key of Object.keys(kinds)) {
            const d = kinds[key];
            if (!d.name) continue;
            const li = document.createElement("li");
            li.innerHTML =
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${d.color};margin-right:6px;box-shadow:0 0 6px ${d.color}"></span>` +
              `<b>${d.name}</b> — <small style="color:var(--ink-dim)">${d.desc || ""}</small>`;
            pwr.appendChild(li);
          }
        }
      }
    },

    // ---------------- scores ----------------
    buildScores() {
      const wrap = document.getElementById("scores-table");
      const scores = R.Save.scores;
      wrap.innerHTML = "";
      if (!scores.length) {
        wrap.innerHTML = '<div class="empty-note">No technicians on record yet.<br>Be the first to purge the system.</div>';
        return;
      }
      scores.forEach((s, i) => {
        const row = document.createElement("div");
        row.className = "score-row" + (i === 0 ? " first" : "");
        row.innerHTML = `
          <div class="sr-rank">#${i + 1}</div>
          <div class="sr-name">${esc(s.name || "ACE")}</div>
          <div class="sr-val">${U.fmt(s.score)}</div>
          <div class="sr-lvl">L${s.level}</div>
          <div class="sr-date">${esc(s.date || "")}</div>`;
        wrap.appendChild(row);
      });
    },

    // ---------------- achievements ----------------
    buildAchievements() {
      const wrap = document.getElementById("ach-grid");
      wrap.innerHTML = "";
      for (const a of R.Save.ACHIEVEMENTS) {
        const got = R.Save.hasAchievement(a.id);
        const card = document.createElement("div");
        card.className = "ach-card" + (got ? " earned" : " locked");
        card.innerHTML = `
          <div class="ach-ic">${got ? a.ic : "🔒"}</div>
          <div><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div>`;
        wrap.appendChild(card);
      }
    },

    // ---------------- game over / victory ----------------
    showGameOver(score, level, combo, isHigh) {
      const s = R.Save.get("stats");
      document.getElementById("gameover-stats").innerHTML = `
        <div class="gs-big">${U.fmt(score)}</div>
        <div class="gs-row">SECTOR ${level} &middot; MAX COMBO ${combo} &middot; BLOCKS ${U.fmt(s.blocksDestroyed || 0)}</div>`;
      const ib = document.getElementById("initials-box");
      if (isHigh) {
        ib.classList.remove("hidden");
        const inp = document.getElementById("initials-input");
        inp.value = R.Save.scores.length ? (R.Save.scores[0].name || "ACE") : "ACE";
        setTimeout(() => inp.focus(), 120);
      } else {
        ib.classList.add("hidden");
        this.saveScoreAuto();
      }
      this.show("gameover");
    },

    saveScore() {
      const score = this.engine.score;
      if (score <= 0) { this.show("title"); return; }
      const name = (document.getElementById("initials-input").value || "ACE").toUpperCase().slice(0, 3);
      R.Save.addScore({ name, score, level: this.engine.level, combo: this.engine.combo });
      document.getElementById("initials-box").classList.add("hidden");
      R.Audio.play("win");
      this.buildScores();
      this.show("scores");
    },

    saveScoreAuto() {
      const score = this.engine.score;
      if (score <= 0 || !R.Save.isHighScore(score)) return;
      R.Save.addScore({ name: "ACE", score, level: this.engine.level, combo: this.engine.combo });
    },

    showVictory(score, level, stats) {
      document.getElementById("victory-stats").innerHTML = `
        <div class="gs-big">${U.fmt(score)}</div>
        <div class="gs-row">CAMPAIGN COMPLETE — 40 SECTORS PURGED</div>
        <div class="gs-row">BLOCKS ${U.fmt(stats.blocks)} &middot; MAX COMBO ${stats.maxCombo}</div>`;
      this.show("victory");
    },

    showPause() {
      this.show("pause");
    },
    hidePause() {
      if (this.current === "pause") {
        this.screens.pause.classList.add("hidden");
        this.current = null;
        this.container.classList.add("hidden");
      }
    },

    // ---------------- toasts ----------------
    toast(msg, color) {
      const wrap = document.getElementById("toasts");
      const el = document.createElement("div");
      el.className = "toast";
      el.style.borderLeftColor = color || "#22d3ee";
      el.textContent = msg;
      wrap.appendChild(el);
      setTimeout(() => {
        el.style.opacity = "0";
        el.style.transition = "opacity 0.4s";
        setTimeout(() => el.remove(), 420);
      }, 2200);
      if (wrap.children.length > 3) wrap.firstChild.remove();
    },

    toastAchievement(id) {
      const def = R.Save.ACHIEVEMENTS.find((a) => a.id === id);
      if (!def) return;
      R.Audio.play("power");
      this.toast(`🏆 ${def.ic} ACHIEVEMENT UNLOCKED — ${def.name}`);
    },

    resetSave() {
      if (confirm("Reset all progress, high scores and settings?")) {
        R.Save.reset();
        this.buildTitleMenu();
        this.buildDifficulty();
        this.buildSettings();
        this.show("title");
      }
    }
  };

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function scrubTrait(id) {
    // primary source is the scrubber catalog; this is only a fallback for
    // exotic ids that are not in the module yet
    if (R.Scrubbers && R.Scrubbers.get) {
      const def = R.Scrubbers.get(id);
      if (def && def.trait) return def.trait;
    }
    const traits = {
      standard: "Balanced scrubber",
      antivirus: "+damage vs viruses",
      quantum: "Chance to split x3",
      nano: "Small & fast",
      magnetic: "Pulls capsules",
      laser: "Stronger lasers",
      compression: "Heavy impact",
      emp: "EMP on destroy",
      breaker: "+damage vs strong",
      duo: "Launches two scrubbers",
      multicore: "Chance to split x2",
      vacuum: "Attracts capsules"
    };
    return traits[id] || "";
  }

  // fallback ship catalog (used by buildShips)
  function shipListFallback() {
    return ["laptop", "server", "cyber", "ai", "quantum", "mother", "firewall", "cloud", "net", "kernel"];
  }

  UI.shipListFallback = shipListFallback;

  R.UI = UI;
})(window.BREAK);
