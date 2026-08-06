"use strict";
/* ============================================================
   DATA BREAK — persistence (localStorage)
   settings / progress / high scores / achievements / stats
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const KEY = "data-break-save-v1";
  const SCORE_KEY = "data-break-scores-v1";
  // legacy keys from the pre-rename "DATA RICOCHET" era — migrated on first load
  const LEGACY_KEY = "data-ricochet-save-v1";
  const LEGACY_SCORE_KEY = "data-ricochet-scores-v1";
  const MAX_SCORES = 8;

  const DEFAULTS = {
    settings: {
      music: true,
      sfx: true,
      crt: false,
      motion: true,
      quality: "auto",        // auto | low | med | high
      fps: false,
      colorblind: false,
      contrast: false,
      endlessLockTheme: false  // lock endless to one palette instead of rotating
    },
    progress: {
      maxLevel: 1,            // highest unlocked campaign level
      difficulty: "standard",
      ship: "laptop",
      scrubber: "standard",
      ships: ["laptop", "server", "cyber"],
      scrubbers: ["standard", "antivirus", "nano"],
      stars: {},              // level -> completion flags
      seenStory: false
    },
    stats: {
      gamesPlayed: 0,
      blocksDestroyed: 0,
      powerupsCollected: 0,
      bossesDefeated: 0,
      ballsLaunched: 0,
      playTime: 0,
      maxCombo: 0,
      bestScore: 0,
      bestLevel: 0,
      bonusCleared: 0,
      endlessWaves: 0
    },
    achievements: {}
  };

  // ---------------- achievements catalog ----------------
  const ACHIEVEMENTS = [
    { id: "first_blood",    name: "First Purge",        desc: "Destroy your first data block",              ic: "🧹" },
    { id: "combo_10",       name: "Clean Streak",       desc: "Reach a 10-hit combo",                       ic: "⚡" },
    { id: "combo_25",       name: "Rampage",            desc: "Reach a 25-hit combo",                       ic: "🔥" },
    { id: "blocks_100",     name: "Century",            desc: "Destroy 100 data blocks",                    ic: "📦" },
    { id: "blocks_1000",    name: "Mass Purge",         desc: "Destroy 1,000 data blocks",                  ic: "🗄️" },
    { id: "blocks_5000",    name: "Clean Machine",      desc: "Destroy 5,000 data blocks",                  ic: "🏭" },
    { id: "no_miss",        name: "Flawless Sector",    desc: "Clear a level without losing a scrubber",    ic: "✨" },
    { id: "boss_1",         name: "Virus Slayer",       desc: "Defeat your first corrupted boss",           ic: "🦠" },
    { id: "boss_all",       name: "System Restored",    desc: "Defeat all eight corrupted bosses",          ic: "🧠" },
    { id: "mini_1",         name: "Signal Hunter",      desc: "Neutralize a mini-boss encounter",           ic: "📡" },
    { id: "level_10",       name: "Deep Scan",          desc: "Reach level 10",                             ic: "🔬" },
    { id: "level_25",       name: "Core Intrusion",     desc: "Reach level 25",                             ic: "🌀" },
    { id: "campaign_done",  name: "Full Reboot",        desc: "Complete the campaign",                      ic: "🖥️" },
    { id: "bonus_3",        name: "Cache Raider",       desc: "Clear 3 bonus stages",                       ic: "💎" },
    { id: "powerups_50",    name: "Overclocked",        desc: "Collect 50 power-ups",                       ic: "🧪" },
    { id: "laser_10",       name: "Gunboat",            desc: "Destroy 10 blocks with lasers",              ic: "🔫" },
    { id: "score_50k",      name: "High Clearance",     desc: "Score 50,000 in one run",                    ic: "🏆" }
  ];

  const store = {
    data: null,
    scores: [],

    _load() {
      // one-time migration: pick up saves stored under the old game name
      try {
        if (!localStorage.getItem(KEY) && localStorage.getItem(LEGACY_KEY)) {
          localStorage.setItem(KEY, localStorage.getItem(LEGACY_KEY));
        }
        if (!localStorage.getItem(SCORE_KEY) && localStorage.getItem(LEGACY_SCORE_KEY)) {
          localStorage.setItem(SCORE_KEY, localStorage.getItem(LEGACY_SCORE_KEY));
        }
      } catch (e) { /* storage unavailable — ignore */ }
      try {
        const raw = localStorage.getItem(KEY);
        this.data = raw ? JSON.parse(raw) : null;
      } catch (e) { this.data = null; }
      if (!this.data) {
        this.data = JSON.parse(JSON.stringify(DEFAULTS));
        this.data.settings.quality = detectQuality();
        this.persist();
      }
      try {
        const sr = localStorage.getItem(SCORE_KEY);
        this.scores = sr ? JSON.parse(sr) : [];
      } catch (e) { this.scores = []; }
    },

    persist() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage full/blocked */ } },
    persistScores() { try { localStorage.setItem(SCORE_KEY, JSON.stringify(this.scores)); } catch (e) { /* ignore */ } },

    get(path, def) {
      let o = this.data;
      for (const k of path.split(".")) {
        if (o === undefined || o === null || !(k in o)) return def;
        o = o[k];
      }
      return o === undefined ? def : o;
    },
    set(path, val) {
      const keys = path.split(".");
      let o = this.data;
      for (let i = 0; i < keys.length - 1; i++) {
        if (typeof o[keys[i]] !== "object" || o[keys[i]] === null) o[keys[i]] = {};
        o = o[keys[i]];
      }
      o[keys[keys.length - 1]] = val;
      this.persist();
    },

    // ---- settings helpers ----
    setting(name, val) {
      if (name === "glow") return this.quality().glow;
      if (val === undefined) return this.get("settings." + name, DEFAULTS.settings[name]);
      this.set("settings." + name, val);
      return val;
    },

    // resolved quality preset (auto-detected at boot)
    quality() {
      const q = this.setting("quality", "auto");
      const key = q === "auto" ? detectQuality() : q;
      return (window.BREAK.Config.QUALITY[key]) || window.BREAK.Config.QUALITY.med;
    },

    // ---- progress ----
    unlockLevel(n) {
      if (n > this.get("progress.maxLevel", 1)) {
        this.set("progress.maxLevel", n);
      }
    },

    // ---- high scores ----
    isHighScore(score) {
      if (score <= 0) return false;
      if (this.scores.length < MAX_SCORES) return true;
      return score > this.scores[this.scores.length - 1].score;
    },
    addScore(entry) {
      // entry: {name, score, level, combo}
      this.scores.push({ ...entry, date: R.Util.tStamp() });
      this.scores.sort((a, b) => b.score - a.score);
      this.scores = this.scores.slice(0, MAX_SCORES);
      this.persistScores();
      return this.scores.findIndex((s) => s.date === entry.date && s.score === entry.score);
    },

    // ---- stats ----
    bumpStat(name, by) {
      this.set("stats." + name, (this.get("stats." + name, 0) || 0) + (by || 1));
    },

    // ---- achievements ----
    unlock(id) {
      if (this.data.achievements[id]) return false;
      this.set("achievements." + id, R.Util.tStamp());
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      return def;
    },
    hasAchievement(id) { return !!this.data.achievements[id]; },

    reset() {
      localStorage.removeItem(KEY);
      localStorage.removeItem(SCORE_KEY);
      localStorage.removeItem(LEGACY_KEY);
      localStorage.removeItem(LEGACY_SCORE_KEY);
      this._load();
    }
  };

  function detectQuality() {
    const mem = (navigator.deviceMemory || 8);
    if (mem <= 2) return "low";
    if (mem <= 4) return "med";
    return "high";
  }

  store._load();
  R.Save = store;
  R.Save.ACHIEVEMENTS = ACHIEVEMENTS;
})(window.BREAK);
