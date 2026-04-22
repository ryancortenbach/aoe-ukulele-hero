// Per-device high scores using localStorage. Keyed by `${songId}:${difficulty}`.

const KEY = "uh_highscores_v1";

// Module-level cache. Menu.jsx calls getHighScore once per song per render
// (so O(n) parses per re-render with n songs), which is wasteful. We parse
// localStorage on first read and invalidate on local writes.
//
// Cross-tab writes won't trigger our writeAll(), but the `storage` event
// fires in the *other* tab when localStorage changes in *this* one — we
// also invalidate the cache there so state stays consistent across tabs.
let cache = null;

function readAll() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch (e) {
    cache = {};
  }
  return cache;
}

function writeAll(data) {
  cache = data;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) { /* localStorage full or disabled */ }
}

// Invalidate the cache when another tab writes to our key. Guarded for
// non-browser environments (tests / SSR) where `window` may be absent.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null /* storage cleared */) {
      cache = null;
    }
  });
}

export function getHighScore(songId, difficulty) {
  const all = readAll();
  return all[`${songId}:${difficulty}`] || null;
}

export function recordScore(songId, difficulty, stats) {
  const all = readAll();
  const key = `${songId}:${difficulty}`;
  const prev = all[key];
  if (!prev || stats.score > prev.score) {
    all[key] = {
      score: stats.score,
      maxCombo: stats.maxCombo,
      perfect: stats.perfect,
      good: stats.good,
      miss: stats.miss,
      total: stats.total,
      grade: stats.grade,
      accuracy: stats.accuracy,
      date: Date.now(),
    };
    writeAll(all);
    return { isNew: true, prev };
  }
  return { isNew: false, prev };
}

