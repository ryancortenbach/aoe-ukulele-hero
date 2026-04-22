import { generateChart } from "./autoChart";
import { DIFFICULTIES } from "../theme";

// Beat-grid invariant: every note.time must sit exactly on the difficulty's
// step grid anchored at offsetMs. Written to catch the Wave 3 regression
// where `firstT = Math.max(offsetMs, 800)` silently shifted the first note
// off-grid when offsetMs < 800 (e.g. offsetMs=200, bpm=120 → firstT=800,
// which is 100ms past the nearest true beat at 700ms).
describe("generateChart beat-grid invariant", () => {
  const combos = [
    { bpm: 60,  offsetMs: 0,    difficulty: "easy" },
    { bpm: 90,  offsetMs: 100,  difficulty: "medium" },
    { bpm: 120, offsetMs: 200,  difficulty: "medium" },
    { bpm: 120, offsetMs: 500,  difficulty: "hard" },
    { bpm: 140, offsetMs: 750,  difficulty: "hard" },
    { bpm: 100, offsetMs: 799,  difficulty: "easy" },
    { bpm: 120, offsetMs: 800,  difficulty: "medium" },
    { bpm: 128, offsetMs: 900,  difficulty: "hard" },
    { bpm: 85,  offsetMs: 1234, difficulty: "easy" },
    { bpm: 175, offsetMs: 350,  difficulty: "hard" },
  ];

  for (const { bpm, offsetMs, difficulty } of combos) {
    it(`(bpm=${bpm}, offset=${offsetMs}, diff=${difficulty}) every note lies on the step grid`, () => {
      const cfg = DIFFICULTIES[difficulty];
      const step = (60_000 / bpm) / cfg.subdivision;

      const chart = generateChart({
        bpm,
        offsetMs,
        durationMs: 30_000,
        difficulty,
      });

      // Sanity: we should actually produce notes for these combos.
      expect(chart.length).toBeGreaterThan(0);

      // Small per-note rounding is expected: generateChart stores
      // Math.round(t), and holds add `Math.round(msPerBeat * holdBeats)`
      // which can drift the post-hold cursor by up to 0.5ms per hold.
      // Over many holds this can stack, so we allow a generous absolute
      // slack that's still MUCH tighter than the Wave-3 regression's
      // ~100ms off-grid shift.
      const GRID_TOLERANCE_MS = 10;

      for (const n of chart) {
        const delta = n.time - offsetMs;
        const remainder = ((delta % step) + step) % step;
        const distToGrid = Math.min(remainder, Math.abs(step - remainder));
        expect(distToGrid).toBeLessThanOrEqual(GRID_TOLERANCE_MS);

        // First note must clear 800ms — even when offsetMs < 800.
        expect(n.time).toBeGreaterThanOrEqual(800);
      }

      // Cross-check: the first note specifically should land on the grid
      // within 1ms (there's no hold-drift yet before note 0). This is the
      // tight check that catches the Wave 3 regression directly.
      const first = chart[0];
      const firstDelta = first.time - offsetMs;
      const firstRem = ((firstDelta % step) + step) % step;
      const firstDist = Math.min(firstRem, Math.abs(step - firstRem));
      expect(firstDist).toBeLessThanOrEqual(1);
    });
  }

  it("specifically pins the offsetMs=200 bpm=120 case (Wave 3 regression)", () => {
    // step at bpm=120, medium (subdivision=1) is 500ms.
    // With the regression: firstT = max(200, 800) = 800 → offset from grid
    //   is 100ms. That should fail the invariant.
    // With the fix: first note is offsetMs + ceil((800-200)/500)*500
    //   = 200 + 2*500 = 1200, which IS on the grid.
    const chart = generateChart({
      bpm: 120,
      offsetMs: 200,
      durationMs: 10_000,
      difficulty: "medium",
    });
    expect(chart[0].time).toBe(1200);
    expect(chart[0].time).toBeGreaterThanOrEqual(800);
    expect((chart[0].time - 200) % 500).toBe(0);
  });
});
