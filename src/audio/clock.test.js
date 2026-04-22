import { computeCurrentMs } from "./clock";

// These tests pin the song-clock formula that Game.jsx uses inline. If the
// formula drifts between this file and the rAF loop, one of these fails.
describe("computeCurrentMs", () => {
  const audioStartCtxTime = 10; // ctx.currentTime at which song pos 0 is scheduled
  const latencyMs = 20;          // AUDIO_LATENCY_MS_BUFFER-ish

  it("returns a negative clock during lead-in (nowCtx < audioStartCtxTime)", () => {
    // 500 ms before scheduled start
    const currentMs = computeCurrentMs({
      nowCtx: audioStartCtxTime - 0.5,
      audioStartCtxTime,
      latencyMs,
    });
    expect(currentMs).toBeLessThan(0);
    // -500ms of lead-in, minus 20ms latency = -520ms
    expect(currentMs).toBeCloseTo(-520, 6);
  });

  it("reads ~-latencyMs at the exact scheduled start moment", () => {
    const currentMs = computeCurrentMs({
      nowCtx: audioStartCtxTime,
      audioStartCtxTime,
      latencyMs,
    });
    expect(currentMs).toBeCloseTo(-latencyMs, 6);
  });

  it("reads ~1000 - latencyMs one second after scheduled start", () => {
    const currentMs = computeCurrentMs({
      nowCtx: audioStartCtxTime + 1.0,
      audioStartCtxTime,
      latencyMs,
    });
    expect(currentMs).toBeCloseTo(1000 - latencyMs, 6);
  });

  it("defaults pauseAccumSec to 0 and latencyMs to 0 when unset", () => {
    expect(
      computeCurrentMs({ nowCtx: 11, audioStartCtxTime: 10 })
    ).toBeCloseTo(1000, 6);
  });

  // Element path: pause/resume accumulates pauseAccumSec, which shifts the
  // clock so it continues from where it paused rather than jumping forward
  // by the wall-clock pause duration.
  it("continues from the pause point on the element path (pauseAccumSec)", () => {
    // Clock at t=1s into song
    const beforePause = computeCurrentMs({
      nowCtx: audioStartCtxTime + 1.0,
      audioStartCtxTime,
      pauseAccumSec: 0,
      latencyMs,
    });

    // Paused for 0.5s (wall-clock) — nowCtx advances, pauseAccumSec is
    // credited exactly that amount, so the song clock should stand still.
    const afterPause = computeCurrentMs({
      nowCtx: audioStartCtxTime + 1.5, // 0.5s of wall-clock elapsed while paused
      audioStartCtxTime,
      pauseAccumSec: 0.5,
      latencyMs,
    });
    expect(afterPause).toBeCloseTo(beforePause, 6);

    // Play for another 0.25s post-resume: clock advances by 0.25s.
    const afterMore = computeCurrentMs({
      nowCtx: audioStartCtxTime + 1.75,
      audioStartCtxTime,
      pauseAccumSec: 0.5,
      latencyMs,
    });
    expect(afterMore - beforePause).toBeCloseTo(250, 6);
  });

  // BufferSource path rebases audioStartCtxTime on resume, so the same
  // "continue from pause point" behavior must hold with pauseAccumSec=0
  // and a shifted anchor.
  it("continues from the pause point on the buffer path (anchor rebase)", () => {
    const beforePause = computeCurrentMs({
      nowCtx: audioStartCtxTime + 1.0,
      audioStartCtxTime,
      pauseAccumSec: 0,
      latencyMs,
    });

    // Resume logic in Game.jsx: audioStartCtxTimeRef.current = startAt - offsetSec
    // After a 0.5s pause at t=1s, offsetSec=1.0 and startAt=audioStartCtxTime+1.5,
    // so the rebased anchor is (audioStartCtxTime + 1.5) - 1.0 = audioStartCtxTime + 0.5.
    const rebasedAnchor = audioStartCtxTime + 0.5;
    const justAfterResume = computeCurrentMs({
      nowCtx: audioStartCtxTime + 1.5,
      audioStartCtxTime: rebasedAnchor,
      pauseAccumSec: 0,
      latencyMs,
    });
    expect(justAfterResume).toBeCloseTo(beforePause, 6);
  });
});
