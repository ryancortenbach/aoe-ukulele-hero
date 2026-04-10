// Per-device high scores using localStorage. Keyed by `${songId}:${difficulty}`.

const KEY = "uh_highscores_v1";

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) { /* localStorage full or disabled */ }
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

export function getAllScoresForSong(songId) {
  const all = readAll();
  return Object.entries(all)
    .filter(([k]) => k.startsWith(`${songId}:`))
    .map(([k, v]) => ({ difficulty: k.split(":")[1], ...v }));
}
