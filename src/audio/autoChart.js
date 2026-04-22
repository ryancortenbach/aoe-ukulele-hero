// Chart generation: turn (bpm, offset, duration, difficulty) into a
// sequence of notes. Notes support tap, hold (long tile), and chord
// (multi-lane simultaneous) types.

import { DIFFICULTIES } from "../theme";

// Lane sequences hand-picked for musical feel. Each difficulty gets its
// own pattern — harder difficulties mix in more lane jumps and overlaps.
const PATTERNS = {
  easy:   [0, 1, 2, 3, 0, 2, 1, 3],
  medium: [0, 1, 2, 3, 2, 0, 3, 1, 2, 3, 1, 0],
  hard:   [0, 1, 2, 3, 0, 2, 1, 3, 2, 0, 3, 1, 0, 3, 1, 2],
};

// Simple deterministic PRNG so chart generation is stable.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateChart({
  bpm,
  offsetMs = 0,
  durationMs,
  difficulty = "medium",
  padEndMs = 1500,
} = {}) {
  if (!bpm || !durationMs) return [];
  const cfg = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;
  const msPerBeat = 60_000 / bpm;
  const step = msPerBeat / cfg.subdivision;
  const pattern = PATTERNS[difficulty] || PATTERNS.medium;

  // Make sure the first note isn't immediately at song start, but KEEP it
  // on the beat grid anchored at `offsetMs`. Previously this was
  // `Math.max(offsetMs, 800)`, which would silently shift the first note
  // off-beat when offsetMs < 800 (e.g. offsetMs=200, bpm=120 → firstT=800,
  // which is 100ms past a true beat at 700). We now step forward in whole
  // `step` increments from offsetMs until we clear the 800 ms minimum —
  // that way every note stays on the grid and the chart actually feels
  // synced to the music.
  const MIN_FIRST_NOTE_MS = 800;
  let firstT = offsetMs;
  if (firstT < MIN_FIRST_NOTE_MS && step > 0) {
    const stepsToSkip = Math.ceil((MIN_FIRST_NOTE_MS - firstT) / step);
    firstT = offsetMs + stepsToSkip * step;
  }
  const lastT = Math.max(firstT, durationMs - padEndMs);

  const rng = mulberry32(Math.round(bpm * 1000 + durationMs));
  const notes = [];
  let beatIdx = 0;
  let nextId = 0;
  // Don't place two long notes back-to-back on the same lane.
  let lastHoldEnd = -Infinity;

  for (let t = firstT; t <= lastT; t += step) {
    const lane = pattern[beatIdx % pattern.length];

    // Roll for a hold note (only on certain difficulty beats).
    const shouldHold =
      cfg.holdChance > 0 &&
      t > lastHoldEnd + msPerBeat * 2 &&
      rng() < cfg.holdChance;

    if (shouldHold) {
      // Hold length: 2–4 beats.
      const holdBeats = 2 + Math.floor(rng() * 3);
      const duration = Math.round(msPerBeat * holdBeats);
      notes.push({
        id: nextId++,
        lane,
        time: Math.round(t),
        duration,
        kind: "hold",
      });
      lastHoldEnd = t + duration;
      // Skip ahead so we don't overlap the next note with this hold's tail.
      // TODO: beatIdx is stepping per `step` (e.g. eighth-notes on Hard,
      // half-notes on Easy), not per whole beat, so `beatIdx += holdBeats`
      // under-advances the lane pattern on Hard and over-advances on Easy.
      // Timing is unaffected (this only changes which lane the next note
      // lands in), but holds can land on visually awkward lane sequences.
      // The timing-correct advance is `holdBeats * cfg.subdivision`.
      beatIdx += holdBeats;
      t += duration - step; // compensate for the for-loop's +=step
      continue;
    }

    notes.push({
      id: nextId++,
      lane,
      time: Math.round(t),
      duration: 0,
      kind: "tap",
    });

    // Occasional chord on Hard: add a second lane note at the same time.
    if (cfg.chordChance > 0 && rng() < cfg.chordChance) {
      let otherLane = (lane + 1 + Math.floor(rng() * 3)) % 4;
      if (otherLane === lane) otherLane = (lane + 2) % 4;
      notes.push({
        id: nextId++,
        lane: otherLane,
        time: Math.round(t),
        duration: 0,
        kind: "tap",
      });
    }

    beatIdx += 1;
  }
  return notes;
}
