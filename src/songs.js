// Sample song charts. A chart is a list of notes: { lane: 0-3, time: ms }.
// time is measured from song start (t=0). For now these are hand-authored
// rhythmic test patterns, not tied to real audio.

// Helper: build a chart from a pattern string.
// Each row is a beat. Characters G/C/E/A (or g/c/e/a) mark a note in that lane.
// Use '-' or '.' for rests. BPM + rowsPerBeat control timing.
export function chartFromPattern(pattern, { bpm = 100, rowsPerBeat = 2 } = {}) {
  const msPerRow = (60_000 / bpm) / rowsPerBeat;
  const rows = pattern.trim().split("\n").map((r) => r.trim());
  const laneOf = { g: 0, c: 1, e: 2, a: 3, G: 0, C: 1, E: 2, A: 3 };
  const notes = [];
  rows.forEach((row, i) => {
    for (const ch of row) {
      if (ch in laneOf) {
        notes.push({ lane: laneOf[ch], time: Math.round(i * msPerRow) });
      }
    }
  });
  // 2s of lead-in before first note so the player can see notes coming.
  const lead = 2000;
  return notes.map((n) => ({ ...n, time: n.time + lead }));
}

// --- Songs ---

const BEACH_DAY_PATTERN = `
G
-
C
-
E
-
A
-
G
C
E
A
-
GA
-
CE
G
-
C
-
E
-
A
-
GE
-
CA
-
GCEA
-
-
-
`;

export const SONGS = [
  {
    id: "beach-day",
    title: "Beach Day",
    artist: "Tutorial",
    bpm: 100,
    difficulty: "Easy",
    durationMs: 28_000,
    chart: chartFromPattern(BEACH_DAY_PATTERN, { bpm: 100, rowsPerBeat: 2 }),
  },
];
