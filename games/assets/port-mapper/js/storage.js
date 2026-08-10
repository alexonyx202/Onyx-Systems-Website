/* =========================================================================
   PORT MAPPER — storage.js
   localStorage persistence: settings + high scores.
   ========================================================================= */
window.PM = window.PM || {};

PM.Storage = (function () {
  'use strict';

  const KEY_SETTINGS = 'portmapper.settings.v1';
  const KEY_SCORES = 'portmapper.scores.v1';
  const MAX_SCORES = 8;

  const DEFAULTS = {
    difficulty: 'normal',
    sound: true,
    music: true,
    crt: true,
  };

  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  function loadSettings() {
    const s = safeGet(KEY_SETTINGS, {});
    return Object.assign({}, DEFAULTS, s);
  }
  function saveSettings(s) { safeSet(KEY_SETTINGS, s); }

  // Scores: [{name, score, level, diff, date}]
  function loadScores() {
    const arr = safeGet(KEY_SCORES, []);
    return Array.isArray(arr) ? arr : [];
  }
  function saveScores(arr) { safeSet(KEY_SCORES, arr); }

  // Returns {rank, list} — rank is -1 if the score did not place.
  function submitScore(entry) {
    const list = loadScores();
    list.push(entry);
    list.sort((a, b) => b.score - a.score || a.date - b.date);
    const trimmed = list.slice(0, MAX_SCORES);
    const rank = trimmed.indexOf(entry);
    saveScores(trimmed);
    return { rank: rank, list: trimmed };
  }

  function qualifies(score) {
    const list = loadScores();
    if (list.length < MAX_SCORES) return true;
    return score > list[list.length - 1].score;
  }

  function clearScores() { saveScores([]); }

  function highScore() {
    const list = loadScores();
    return list.length ? list[0].score : 0;
  }

  return { loadSettings, saveSettings, loadScores, submitScore, qualifies, clearScores, highScore };
})();
