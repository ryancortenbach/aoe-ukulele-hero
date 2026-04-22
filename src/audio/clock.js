// Song-clock math, extracted so it can be unit-tested without the React
// rendering, AudioContext, or input stack wrapped around Game.jsx.
//
// Game.jsx still computes this inline (see the `s.currentMs = ...` line in
// the rAF loop) rather than importing from here — the live formula lives
// inside the rAF closure where it's cheap to read refs, and pulling it out
// would mean passing five refs into a helper per-frame. Instead, this file
// mirrors the formula exactly. When you change one, change the other.
// Tests in clock.test.js pin the semantics so drift gets caught.
//
// Contract:
//   currentMs = (nowCtx - audioStartCtxTime - pauseAccumSec) * 1000 - latencyMs
//
// nowCtx, audioStartCtxTime, pauseAccumSec are all AudioContext seconds.
// latencyMs is the total output-path latency (buffer or element path,
// see AUDIO_LATENCY_MS_BUFFER / AUDIO_LATENCY_MS_ELEMENT in theme.js).
//
// Semantics:
//   - nowCtx < audioStartCtxTime  → currentMs < 0 (we're in lead-in)
//   - nowCtx == audioStartCtxTime → currentMs == -latencyMs
//     (the song is scheduled to start, but speaker delay pushes the
//      AUDIBLE onset out by latencyMs, so the clock reads slightly
//      negative at the schedule moment)
//   - nowCtx == audioStartCtxTime + dtSec → currentMs == dtSec*1000 - latencyMs
//   - pauseAccumSec grows by the length of every element-path pause and
//     shifts the whole curve right, so post-pause the clock continues
//     from where it paused. The BufferSource path rebases
//     audioStartCtxTime on resume and leaves pauseAccumSec at 0.
export function computeCurrentMs({
  nowCtx,
  audioStartCtxTime,
  pauseAccumSec = 0,
  latencyMs = 0,
}) {
  return (nowCtx - audioStartCtxTime - pauseAccumSec) * 1000 - latencyMs;
}
