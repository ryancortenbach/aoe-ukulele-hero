// ---------------------------------------------------------------------------
// Beat-sync diagnosis (Waves 1B + 2B + 3B)
// ---------------------------------------------------------------------------
// The original loop mixed `performance.now()` with HTMLAudioElement
// `currentTime`, which drifted and put visuals ahead of audio. Wave 1B
// unified on the AudioContext clock. Waves 2B/3B fix what remained:
//
//  1) The song clock had a DISCONTINUITY at the lead-in / play transition.
//     One unified formula drives the clock end-to-end; lead-in is just the
//     interval when currentMs < 0.
//
//  2) Song playback now routes through the AudioContext via an
//     AudioBufferSourceNode (was: HTMLAudioElement). This makes
//     ctx.outputLatency + ctx.baseLatency meaningful — they describe the
//     actual latency of the graph the player hears — so we re-include them
//     in the compensation. It also gives us a DETERMINISTIC start moment:
//     `source.start(when)` schedules playback at `when`, and `when ===
//     ctx.currentTime` at call time means the clock anchor is exact. No
//     more `audio.play().then()` re-anchor dance, which means pause/resume
//     also stops drifting (each resume creates a fresh source with an
//     exact start moment).
//
//  3) iTunes previews require CORS (they have it). For any host that blocks
//     CORS, audioEngine.songFromUrl falls back to a descriptor with
//     `audioBuffer === null`, and we transparently play that song via the
//     legacy <audio> element path (with looser sync) so the game still runs.
//
// Per-song `offsetMs` (from songLibrary / beat detection) is applied inside
// the chart generator, and can be further tuned by setting `song.offsetMs`.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { LANES, COLORS, FONT_STACK, DIFFICULTIES, SCORE, HIGHWAY, AUDIO_LATENCY_MS } from "../theme";
import { subscribe as subscribeInput, emit as emitInput } from "../input/inputManager";
import { generateChart } from "../audio/autoChart";
import { getCtx, getOutputLatencySec } from "../audio/audioEngine";
import { recordScore } from "../highScores";
import { initSfx, playSfx } from "../audio/sfxPlayer";
import Hud, { multiplierFor } from "./Hud";
import Countdown from "./Countdown";
import PauseMenu from "./PauseMenu";

const LEAD_IN_MS = 2200;

export default function Game({ song, difficulty = "medium", onFinish, onExit }) {
  const cfg = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;

  // Generate the chart once per (song, difficulty) combo.
  const chart = useMemo(
    () => generateChart({
      bpm: song.bpm,
      offsetMs: song.offsetMs || 0,
      durationMs: song.durationMs,
      difficulty,
    }),
    [song, difficulty]
  );

  const [phase, setPhase] = useState("countdown");
  const [paused, setPaused] = useState(false);

  // Mutable state for the game loop
  const stateRef = useRef(createState(chart));
  const [, force] = useState(0);
  const renderTick = useCallback(() => force((n) => (n + 1) % 1_000_000), []);

  // Visual feedback
  const [hitFx, setHitFx] = useState({});
  const [lanePressed, setLanePressed] = useState({});
  const [particles, setParticles] = useState([]);
  const [comboFlash, setComboFlash] = useState(null);
  const [displayScore, setDisplayScore] = useState(0);

  // Playback paths:
  //   - BufferSource path (preferred): song.audioBuffer present → we create a
  //     fresh AudioBufferSourceNode per play/resume, route it through the
  //     AudioContext, and the song clock is anchored to ctx.currentTime.
  //   - <audio> element path (fallback): song.audioBuffer missing (CORS) →
  //     we fall back to the HTMLAudioElement wired up at the JSX level.
  const useBufferSource = !!song.audioBuffer;
  const audioRef = useRef(null);           // <audio> element (fallback path)
  const sourceRef = useRef(null);          // active AudioBufferSourceNode
  const sourceStartCtxTimeRef = useRef(0); // ctx.currentTime when current source started
  const elapsedBeforePauseRef = useRef(0); // song-seconds of audible playback before current source
  const audioStartCtxTimeRef = useRef(0);  // ctx.currentTime at which currentMs === 0
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const prevComboRef = useRef(0);

  // Init SFX once on mount so assets are decoded before first input.
  useEffect(() => { initSfx(); }, []);

  // Fire combo SFX only when combo *crosses* a threshold (not every frame).
  const checkComboThreshold = useCallback((newCombo) => {
    const prev = prevComboRef.current;
    if (newCombo !== prev) {
      if (prev < 10 && newCombo >= 10) playSfx('combo-10');
      else if (prev < 25 && newCombo >= 25) playSfx('combo-25');
      else if (prev < 50 && newCombo >= 50) playSfx('combo-50');
      prevComboRef.current = newCombo;
    }
  }, []);

  const restart = useCallback(() => {
    stateRef.current = createState(chart);
    prevComboRef.current = 0;
    setHitFx({}); setParticles([]); setComboFlash(null); setDisplayScore(0);
    setPaused(false);
    setPhase("countdown");
  }, [chart]);

  // --- Input handling ---
  const handleInput = useCallback((evt) => {
    const { lane, type } = evt;
    if (type === "press") {
      setLanePressed((p) => ({ ...p, [lane]: true }));
      if (phase === "playing" && !pausedRef.current) {
        const result = judgePress(stateRef.current, lane, cfg);
        if (result) {
          playSfx(result.kind === "perfect" ? "hit-perfect" : "hit-good");
          checkComboThreshold(stateRef.current.combo);
          setHitFx((prev) => ({
            ...prev,
            [lane]: { kind: result.kind, ts: performance.now(), text: result.text },
          }));
          setParticles((prev) => [
            ...prev,
            {
              id: Math.random().toString(36).slice(2),
              lane,
              color: LANES[lane].color,
              kind: result.kind,
              ts: performance.now(),
            },
          ]);
          const c = stateRef.current.combo;
          if (c > 0 && (c === 10 || c === 25 || c === 50 || c === 100 || c === 200)) {
            setComboFlash({
              combo: c,
              color: c >= 100 ? "#f682f4" : c >= 50 ? "#54e4e9" : c >= 25 ? "#ffd95a" : "#7af3f7",
              ts: performance.now(),
            });
          }
        } else {
          // Wrong-time press (no note in window) → miss SFX
          playSfx("miss");
        }
      }
    } else {
      setLanePressed((p) => ({ ...p, [lane]: false }));
      if (phase === "playing" && !pausedRef.current) {
        const beforeCombo = stateRef.current.combo;
        judgeRelease(stateRef.current, lane, cfg, setHitFx);
        const afterCombo = stateRef.current.combo;
        if (afterCombo === 0 && beforeCombo > 0) {
          playSfx("miss");
        } else if (afterCombo > beforeCombo) {
          checkComboThreshold(afterCombo);
        }
      }
    }
  }, [phase, cfg, checkComboThreshold]);

  useEffect(() => subscribeInput(handleInput), [handleInput]);

  // Particle garbage collection
  useEffect(() => {
    if (!particles.length) return;
    const id = setTimeout(() => {
      const now = performance.now();
      setParticles((p) => p.filter((x) => now - x.ts < 700));
    }, 200);
    return () => clearTimeout(id);
  }, [particles]);

  // Pause controls
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "p") {
        if (phase === "playing") {
          setPaused((p) => !p);
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  // Pause audio when paused state changes.
  //
  // BufferSource path: AudioBufferSourceNode is one-shot, so pause = stop()
  // the current node (and remember elapsed song-seconds), resume = create a
  // fresh node and start(0, elapsed). The `audioStartCtxTime` anchor gets
  // re-written on resume so the clock formula
  //   currentMs = (nowCtx - audioStartCtxTime) * 1000 - latencyMs
  // keeps reading the correct song position. No pauseAccumSec needed in
  // this path — we rebase on every resume. When pausing during lead-in
  // (no source running yet), we just advance the anchor by the pause
  // duration so the lead-in "pauses" with the game.
  //
  // <audio> path: just pause/play the element. For that path we still need
  // pauseAccumSec (lives in the game loop closure).
  const pauseStartedRef = useRef(null); // ctx.currentTime when pause began (BufferSource lead-in pause)
  useEffect(() => {
    if (useBufferSource) {
      const ctx = getCtx();
      if (paused) {
        const src = sourceRef.current;
        if (src) {
          // Playback in progress: stop the node and capture where we were.
          const playedSec = Math.max(0, ctx.currentTime - sourceStartCtxTimeRef.current);
          elapsedBeforePauseRef.current = elapsedBeforePauseRef.current + playedSec;
          try { src.onended = null; } catch (_) {}
          try { src.stop(); } catch (_) {}
          try { src.disconnect(); } catch (_) {}
          sourceRef.current = null;
        } else {
          // Pausing during lead-in (no source yet). Remember when pause began
          // so we can shift the anchor forward on resume.
          pauseStartedRef.current = ctx.currentTime;
        }
      } else if (phase === "playing") {
        if (pauseStartedRef.current !== null) {
          // Resuming from a lead-in pause: push the scheduled start moment
          // forward by the exact pause duration. No source to restart.
          const pauseDur = ctx.currentTime - pauseStartedRef.current;
          audioStartCtxTimeRef.current += pauseDur;
          pauseStartedRef.current = null;
        } else if (stateRef.current.currentMs >= 0 && !sourceRef.current) {
          // Resuming from a mid-song pause: start a fresh node at the
          // paused offset.
          if (ctx.state === "suspended") ctx.resume().catch(() => {});
          const src = ctx.createBufferSource();
          src.buffer = song.audioBuffer;
          src.connect(ctx.destination);
          const offsetSec = elapsedBeforePauseRef.current;
          const startAt = ctx.currentTime;
          try { src.start(0, offsetSec); } catch (e) { console.error("resume start failed", e); }
          sourceRef.current = src;
          sourceStartCtxTimeRef.current = startAt;
          // Re-anchor the song clock so (nowCtx - audioStartCtxTime)*1000 -
          // latencyMs == offsetSec*1000 at the instant we just started.
          audioStartCtxTimeRef.current = startAt - offsetSec;
        }
      }
    } else {
      // <audio> fallback
      if (!audioRef.current) return;
      if (paused) audioRef.current.pause();
      else if (phase === "playing" && audioRef.current.paused && stateRef.current.currentMs >= 0) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [paused, phase, useBufferSource, song.audioBuffer]);

  // --- Game loop (audio-synced) ---
  useEffect(() => {
    if (phase !== "playing") return;
    let rafId;

    // Single source of truth: the AudioContext clock. It's monotonic,
    // unaffected by tab throttling in the way performance.now can be, and
    // directly comparable to scheduled BufferSource playback time.
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const ctxStart = ctx.currentTime;                   // seconds

    // audioStartCtxTime: the ctx.currentTime at which SONG POSITION 0 will be
    // audible. Starts as an estimate (lead-in end) and is made exact the
    // moment the BufferSource is scheduled. Lives in a ref so the pause
    // effect can rewrite it on resume.
    audioStartCtxTimeRef.current = ctxStart + LEAD_IN_MS / 1000;
    elapsedBeforePauseRef.current = 0;

    // <audio> fallback still needs pauseAccumSec because that path cannot
    // restart at an exact offset — it plays through continuously and we
    // just pause/unpause. BufferSource path rebases on resume instead.
    let pauseAccumSec = 0;
    let pauseStartedCtxTime = null;
    let audioStarted = false;

    // Latency between "audio sample requested at ctx time T" and "sample
    // audible at the speakers". For the BufferSource path, outputLatency +
    // baseLatency describe the context's output graph — exactly what the
    // player hears — so we add them in. AUDIO_LATENCY_MS remains as an
    // empirical pad for element-level buffering / device jitter on top.
    // For the <audio> fallback path the <audio> element bypasses the
    // AudioContext, so only AUDIO_LATENCY_MS applies.
    const extraLatencySec = useBufferSource ? getOutputLatencySec() : 0;
    const latencyMs = AUDIO_LATENCY_MS + extraLatencySec * 1000;

    const tick = () => {
      const nowCtx = ctx.currentTime;

      // For the <audio> fallback, accumulate pause time so song time only
      // counts unpaused time (the element keeps its own playhead, but we
      // re-derive current position from ctx time for consistency).
      if (pausedRef.current) {
        if (!useBufferSource && pauseStartedCtxTime === null) pauseStartedCtxTime = nowCtx;
        rafId = requestAnimationFrame(tick);
        return;
      } else if (!useBufferSource && pauseStartedCtxTime !== null) {
        pauseAccumSec += nowCtx - pauseStartedCtxTime;
        pauseStartedCtxTime = null;
      }

      const s = stateRef.current;

      // Unified song clock: "song position currently audible at the speakers".
      // Negative during lead-in, 0 when the first audio sample is audible,
      // positive while music plays. A single formula end-to-end avoids the
      // discontinuity that used to jump the clock at the lead-in / play
      // transition.
      s.currentMs =
        (nowCtx - audioStartCtxTimeRef.current - pauseAccumSec) * 1000 - latencyMs;

      // Kick off audio playback exactly once at the scheduled song-start moment.
      if (!audioStarted && nowCtx >= audioStartCtxTimeRef.current) {
        audioStarted = true;
        if (useBufferSource) {
          // BufferSource path: create a node, connect, and start at
          // ctx.currentTime. `source.start(when)` is deterministic — the
          // first sample hits the graph at `when`, and `when ===
          // ctx.currentTime` at the call site makes the anchor exact.
          try {
            const src = ctx.createBufferSource();
            src.buffer = song.audioBuffer;
            src.connect(ctx.destination);
            const startAt = ctx.currentTime;
            src.start(startAt);
            sourceRef.current = src;
            sourceStartCtxTimeRef.current = startAt;
            // Rewrite the anchor to exactly `startAt`. Previously it was an
            // estimate; now we know precisely when song position 0 begins.
            audioStartCtxTimeRef.current = startAt;
            elapsedBeforePauseRef.current = 0;
          } catch (e) {
            console.error("BufferSource start failed", e);
          }
        } else if (audioRef.current) {
          // <audio> fallback: non-deterministic start latency, so on resolve
          // we re-anchor against audio.currentTime (Wave 1B pattern).
          try { audioRef.current.currentTime = 0; } catch (_) {}
          const pr = audioRef.current.play();
          if (pr && pr.then) {
            pr.then(() => {
              const ac = audioRef.current;
              if (ac && ac.currentTime > 0) {
                audioStartCtxTimeRef.current =
                  ctx.currentTime - ac.currentTime - pauseAccumSec;
              }
            }).catch((e) => {
              audioStarted = false; // allow retry next tick
              console.error("audio play failed", e);
            });
          }
        }
      }

      const comboBefore = s.combo;
      let autoMissed = false;

      // Handle active holds — auto-complete when tail reaches hit line
      for (let i = 0; i < 4; i++) {
        const heldNote = s.held[i];
        if (heldNote && s.currentMs >= heldNote.time + heldNote.duration) {
          heldNote.judged = true;
          heldNote.result = heldNote.currentResult || "good";
          s.stats[heldNote.result] += 1;
          s.stats.judgedForAcc += 1;
          s.combo += 1;
          if (s.combo > s.maxCombo) s.maxCombo = s.combo;
          s.score += (heldNote.result === "perfect" ? SCORE.perfect : SCORE.good) *
                     multiplierFor(s.combo) * cfg.scoreMult;
          s.held[i] = null;
        }
      }

      // Auto-miss taps that passed the hit window
      for (const n of s.notes) {
        if (n.judged || n.kind === "hold") continue;
        if (s.currentMs - n.time > cfg.good) {
          n.judged = true;
          n.result = "miss";
          s.stats.miss += 1;
          s.stats.judgedForAcc += 1;
          s.combo = 0;
          autoMissed = true;
        }
      }
      // Auto-miss hold note HEADS that weren't pressed in time
      for (const n of s.notes) {
        if (n.judged || n.kind !== "hold") continue;
        if (s.held[n.lane] === n) continue;
        if (s.currentMs - n.time > cfg.good) {
          n.judged = true;
          n.result = "miss";
          s.stats.miss += 1;
          s.stats.judgedForAcc += 1;
          s.combo = 0;
          autoMissed = true;
        }
      }

      if (autoMissed) playSfx("miss");
      if (s.combo > comboBefore) checkComboThreshold(s.combo);
      else if (s.combo === 0 && comboBefore > 0) prevComboRef.current = 0;

      // Smooth score counter
      setDisplayScore((prev) => {
        const diff = s.score - prev;
        if (Math.abs(diff) < 1) return s.score;
        return prev + diff * 0.22;
      });

      // Finish
      const lastNoteTime = s.notes.length
        ? Math.max(...s.notes.map((n) => n.time + (n.duration || 0)))
        : 0;
      const allJudged = s.notes.every((n) => n.judged);
      // BufferSource path: no `.ended` property; use song duration. Fallback
      // path: use the HTMLAudioElement's `ended`.
      const audioEnded = useBufferSource
        ? (song.durationMs > 0 && s.currentMs > song.durationMs)
        : audioRef.current?.ended;
      if ((allJudged && s.currentMs > lastNoteTime + 600) || audioEnded) {
        setPhase("done");
        stopPlayback();
        const final = finalStats(s, cfg);
        const totalJudged = final.perfect + final.good + final.miss;
        const accuracy = totalJudged ? (final.perfect + final.good) / totalJudged : 0;
        const grade = gradeLetter(accuracy, final.miss);
        recordScore(song.id, difficulty, { ...final, accuracy, grade });
        onFinish({ ...final, accuracy, grade });
        return;
      }

      renderTick();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    const capturedAudio = audioRef.current;

    // Local helper: tear down whichever playback path is live.
    function stopPlayback() {
      if (sourceRef.current) {
        try { sourceRef.current.onended = null; } catch (_) {}
        try { sourceRef.current.stop(); } catch (_) {}
        try { sourceRef.current.disconnect(); } catch (_) {}
        sourceRef.current = null;
      }
      if (capturedAudio) {
        try { capturedAudio.pause(); } catch (_) {}
      }
    }

    return () => {
      cancelAnimationFrame(rafId);
      stopPlayback();
    };
  }, [phase, onFinish, renderTick, cfg, song.id, song.audioBuffer, song.durationMs, difficulty, checkComboThreshold, useBufferSource]);

  // Cleanup on unmount (covers the case where we leave the game without
  // going through the "done" exit path — e.g. user clicks quit).
  useEffect(() => {
    const capturedAudio = audioRef.current;
    return () => {
      if (sourceRef.current) {
        try { sourceRef.current.onended = null; } catch (_) {}
        try { sourceRef.current.stop(); } catch (_) {}
        try { sourceRef.current.disconnect(); } catch (_) {}
        sourceRef.current = null;
      }
      if (capturedAudio) {
        capturedAudio.pause();
        capturedAudio.currentTime = 0;
      }
    };
  }, []);

  const s = stateRef.current;
  const progress = computeProgress(s, chart);
  const accuracy = s.stats.judgedForAcc
    ? (s.stats.perfect + s.stats.good) / s.stats.judgedForAcc
    : 1;

  return (
    <div style={styles.root}>
      <div style={styles.bgDots} />
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />
      <div style={styles.vignette} />

      {/* Only rendered when the BufferSource path isn't available (CORS fallback). */}
      {!useBufferSource && (
        <audio ref={audioRef} src={song.audioUrl} preload="auto" crossOrigin="anonymous" />
      )}

      <Hud
        score={Math.round(displayScore)}
        combo={s.combo}
        accuracy={accuracy}
        progress={progress}
      />

      <HighwayView
        state={s}
        hitFx={hitFx}
        lanePressed={lanePressed}
        particles={particles}
      />

      {/* Difficulty + song label */}
      <div style={styles.songTag}>
        <div style={styles.songTagArtist}>{song.artist}</div>
        <div style={styles.songTagTitle}>{song.title}</div>
        <div style={{ ...styles.songTagDiff, color: cfg.color, borderColor: cfg.color }}>
          {cfg.label.toUpperCase()}
        </div>
      </div>

      {comboFlash && (
        <ComboFlash key={comboFlash.ts} flash={comboFlash} onDone={() => setComboFlash(null)} />
      )}

      {phase === "countdown" && (
        <Countdown onDone={() => setPhase("playing")} />
      )}

      {paused && phase === "playing" && (
        <PauseMenu
          onResume={() => setPaused(false)}
          onRestart={restart}
          onQuit={onExit}
        />
      )}

      <button style={styles.pauseBtn} onClick={() => setPaused(true)} title="Pause (Esc)">
        ❙❙
      </button>
    </div>
  );
}

function gradeLetter(accuracy, miss) {
  if (accuracy >= 0.98 && miss === 0) return "S";
  if (accuracy >= 0.92) return "A";
  if (accuracy >= 0.8) return "B";
  if (accuracy >= 0.65) return "C";
  if (accuracy >= 0.5) return "D";
  return "F";
}

// -----------------------------------------------------------------------------
// ComboFlash
// -----------------------------------------------------------------------------

function ComboFlash({ flash, onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, 900);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 50,
      background: `radial-gradient(ellipse at center, ${flash.color}55 0%, transparent 60%)`,
      animation: "uh-combo-flash 0.9s ease-out forwards",
    }}>
      <div style={{
        position: "absolute",
        top: "35%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        fontSize: "5.5rem",
        color: flash.color,
        textShadow: `0 0 40px ${flash.color}, 0 0 80px ${flash.color}, 0 0 120px #fff`,
        fontFamily: FONT_STACK,
        letterSpacing: "0.05em",
        animation: "uh-combo-flash-text 0.9s ease-out forwards",
      }}>
        {flash.combo} COMBO!
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Highway view with tap + hold notes
// -----------------------------------------------------------------------------

function HighwayView({ state, hitFx, lanePressed, particles }) {
  const { widthPx, heightPx, perspectiveDeg, noteTravelMs, noteSizePx, hitLineFromBottom } = HIGHWAY;
  const laneW = widthPx / LANES.length;
  const hitY = heightPx - hitLineFromBottom;
  const pxPerMs = hitY / noteTravelMs;

  return (
    <div style={{ ...styles.highwayWrap, perspective: "900px" }}>
      <div
        style={{
          ...styles.highway,
          width: widthPx,
          height: heightPx,
          transform: `rotateX(${perspectiveDeg}deg)`,
        }}
      >
        {/* Lane backgrounds */}
        {LANES.map((lane) => (
          <div
            key={`bg-${lane.id}`}
            style={{
              position: "absolute",
              left: lane.id * laneW,
              top: 0,
              width: laneW,
              height: heightPx,
              background: lanePressed[lane.id]
                ? `linear-gradient(to bottom, ${lane.color}08 0%, ${lane.color}44 90%, ${lane.color}88 100%)`
                : `linear-gradient(to bottom, transparent 0%, ${lane.color}18 100%)`,
              borderLeft: lane.id === 0 ? "none" : `1px solid ${COLORS.laneDivider}`,
              transition: "background 0.15s",
            }}
          />
        ))}

        {/* Moving fret lines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `repeating-linear-gradient(
              to bottom,
              transparent 0,
              transparent 58px,
              ${COLORS.fretLine} 58px,
              ${COLORS.fretLine} 60px
            )`,
            backgroundPositionY: `${(Math.max(0, state.currentMs) * pxPerMs) % 60}px`,
          }}
        />

        {/* Notes (tap + hold) */}
        {state.notes.map((n) => {
          if (n.judged && !(state.held[n.lane] === n)) return null;
          const dtHead = n.time - state.currentMs;
          if (dtHead > noteTravelMs + 50) return null;
          if (dtHead < -500 && n.kind !== "hold") return null;

          const lane = LANES[n.lane];
          const headY = hitY - dtHead * pxPerMs - noteSizePx / 2;

          if (n.kind === "hold") {
            const dtTail = (n.time + n.duration) - state.currentMs;
            const tailTopY = hitY - dtTail * pxPerMs;
            const tailBottomY = Math.min(headY + noteSizePx * 0.3, hitY);
            const tailHeight = Math.max(0, tailBottomY - tailTopY);
            const isHeld = state.held[n.lane] === n;
            return (
              <div key={n.id} style={{ position: "absolute", left: n.lane * laneW, top: 0, width: laneW, pointerEvents: "none" }}>
                {/* Tail beam */}
                {tailHeight > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: (laneW - noteSizePx * 0.55) / 2,
                      top: tailTopY,
                      width: noteSizePx * 0.55,
                      height: tailHeight,
                      borderRadius: noteSizePx,
                      background: `linear-gradient(to bottom, ${lane.color}aa, ${lane.color}44)`,
                      boxShadow: `0 0 24px ${lane.glow}${isHeld ? 'cc' : '66'}, inset 0 0 12px #fff4`,
                      border: `1px solid ${lane.color}`,
                      opacity: isHeld ? 1 : 0.85,
                    }}
                  />
                )}
                {/* Head */}
                {headY < hitY + 20 && (
                  <div
                    style={{
                      position: "absolute",
                      left: (laneW - noteSizePx) / 2,
                      top: headY,
                      width: noteSizePx,
                      height: noteSizePx * 0.55,
                      borderRadius: noteSizePx,
                      background: `radial-gradient(ellipse at 50% 40%, #ffffffee, ${lane.color} 50%, ${lane.shadow})`,
                      boxShadow: `0 0 30px ${lane.glow}${isHeld ? "ff" : "aa"}, 0 4px 0 ${lane.shadow}`,
                      border: `2px solid ${lane.color}`,
                    }}
                  />
                )}
              </div>
            );
          }

          // Tap note
          return (
            <div
              key={n.id}
              style={{
                position: "absolute",
                left: n.lane * laneW + (laneW - noteSizePx) / 2,
                top: headY,
                width: noteSizePx,
                height: noteSizePx * 0.55,
                borderRadius: noteSizePx,
                background: `radial-gradient(ellipse at 50% 40%, #ffffffee, ${lane.color} 50%, ${lane.shadow})`,
                boxShadow: `0 0 30px ${lane.glow}aa, 0 0 60px ${lane.glow}55, 0 4px 0 ${lane.shadow}, inset 0 2px 8px #fff8`,
                border: `2px solid ${lane.color}`,
              }}
            />
          );
        })}

        {/* Hit line */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: hitY,
            width: widthPx,
            height: "4px",
            background: "linear-gradient(90deg, transparent, #ffffffdd, transparent)",
            boxShadow: "0 0 24px #fff, 0 0 48px #fff9",
          }}
        />

        {/* Hit circles */}
        {LANES.map((lane) => {
          const isPressed = !!lanePressed[lane.id];
          return (
            <div
              key={`target-${lane.id}`}
              style={{
                position: "absolute",
                left: lane.id * laneW + (laneW - noteSizePx) / 2,
                top: hitY - noteSizePx * 0.27,
                width: noteSizePx,
                height: noteSizePx * 0.55,
                borderRadius: noteSizePx,
                border: `3px solid ${isPressed ? "#fff" : lane.color + "cc"}`,
                boxShadow: isPressed
                  ? `0 0 40px ${lane.glow}, 0 0 80px ${lane.glow}66, inset 0 0 24px ${lane.color}`
                  : `0 0 14px ${lane.color}77`,
                background: isPressed
                  ? `radial-gradient(ellipse at 50% 40%, ${lane.color}cc, transparent 70%)`
                  : "transparent",
                transition: "box-shadow 0.08s, background 0.08s",
              }}
            />
          );
        })}
      </div>

      <FlatOverlay hitFx={hitFx} lanePressed={lanePressed} particles={particles} />
    </div>
  );
}

function FlatOverlay({ hitFx, lanePressed, particles }) {
  const { widthPx } = HIGHWAY;
  const laneW = widthPx / LANES.length;

  return (
    <div style={styles.flatOverlay}>
      {particles.map((p) => (
        <ParticleBurst key={p.id} particle={p} laneW={laneW} />
      ))}

      {LANES.map((lane) => {
        const fx = hitFx[lane.id];
        if (!fx) return null;
        const color =
          fx.kind === "perfect" ? COLORS.perfect :
          fx.kind === "good"    ? COLORS.good :
                                  COLORS.miss;
        return (
          <div
            key={`fx-${lane.id}-${fx.ts}`}
            style={{
              position: "absolute",
              left: lane.id * laneW + laneW / 2,
              bottom: 220,
              color,
              fontSize: "1.3rem",
              letterSpacing: "0.1em",
              textShadow: `0 0 18px ${color}, 0 0 32px ${color}`,
              animation: "uh-pop-in 0.7s ease-out forwards",
              pointerEvents: "none",
              fontWeight: 900,
            }}
          >
            {fx.text}
          </div>
        );
      })}

      <div style={styles.btnRow}>
        {LANES.map((lane) => {
          const isPressed = !!lanePressed[lane.id];
          return (
            <button
              key={lane.id}
              onMouseDown={() => emitInput(lane.id, "press")}
              onMouseUp={() => emitInput(lane.id, "release")}
              onMouseLeave={() => isPressed && emitInput(lane.id, "release")}
              onTouchStart={(e) => { e.preventDefault(); emitInput(lane.id, "press"); }}
              onTouchEnd={(e) => { e.preventDefault(); emitInput(lane.id, "release"); }}
              style={{
                ...styles.btn,
                background: isPressed
                  ? `radial-gradient(circle at 40% 35%, #fff8, ${lane.color} 45%, ${lane.shadow})`
                  : `radial-gradient(circle at 40% 35%, ${lane.color}cc, ${lane.shadow})`,
                boxShadow: isPressed
                  ? `0 0 48px 12px ${lane.glow}cc, 0 0 96px 24px ${lane.glow}55, inset 0 2px 8px #fff5`
                  : `0 6px 0 ${lane.shadow}, 0 8px 24px ${lane.color}44, inset 0 2px 4px #fff3`,
                transform: isPressed ? "scale(0.94) translateY(3px)" : "scale(1)",
                border: `3px solid ${isPressed ? "#fff9" : lane.color + "88"}`,
              }}
              aria-label={`String ${lane.label}`}
            >
              <span style={styles.btnLabel}>{lane.label}</span>
              <span style={styles.btnKey}>{lane.key.toUpperCase()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ParticleBurst({ particle, laneW }) {
  const count = particle.kind === "perfect" ? 14 : 8;
  const parts = Array.from({ length: count }).map((_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const dist = 60 + (i % 3) * 25;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 20;
    return { dx, dy, i };
  });
  const cx = particle.lane * laneW + laneW / 2;
  return (
    <>
      {parts.map(({ dx, dy, i }) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: cx,
            bottom: 200,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: particle.color,
            boxShadow: `0 0 12px ${particle.color}, 0 0 24px ${particle.color}`,
            animation: `uh-particle 0.7s ease-out forwards`,
            "--dx": `${dx}px`,
            "--dy": `${dy}px`,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

// -----------------------------------------------------------------------------
// Game state helpers
// -----------------------------------------------------------------------------

function createState(chart) {
  return {
    currentMs: -LEAD_IN_MS,
    score: 0,
    combo: 0,
    maxCombo: 0,
    notes: chart.map((n, i) => ({
      id: i,
      lane: n.lane,
      time: n.time,
      duration: n.duration || 0,
      kind: n.kind || "tap",
      judged: false,
      result: null,
      currentResult: null,
    })),
    held: [null, null, null, null],
    stats: {
      total: chart.length,
      perfect: 0,
      good: 0,
      miss: 0,
      judgedForAcc: 0,
    },
  };
}

function judgePress(s, lane, cfg) {
  let best = null;
  let bestDelta = Infinity;
  for (const n of s.notes) {
    if (n.judged) continue;
    if (n.lane !== lane) continue;
    const delta = Math.abs(n.time - s.currentMs);
    if (delta < bestDelta) { bestDelta = delta; best = n; }
    if (n.time - s.currentMs > cfg.good) break;
  }
  if (!best || bestDelta > cfg.good) return null;

  let kind, text;
  if (bestDelta <= cfg.perfect) { kind = "perfect"; text = "PERFECT"; }
  else { kind = "good"; text = "GOOD"; }

  if (best.kind === "hold") {
    // Don't mark judged yet — wait for release or auto-complete
    best.currentResult = kind;
    s.held[lane] = best;
    return { kind, text };
  }

  best.judged = true;
  best.result = kind;
  s.stats[kind] += 1;
  s.stats.judgedForAcc += 1;
  s.combo += 1;
  if (s.combo > s.maxCombo) s.maxCombo = s.combo;
  s.score += (kind === "perfect" ? SCORE.perfect : SCORE.good) *
             multiplierFor(s.combo) * cfg.scoreMult;
  return { kind, text };
}

function judgeRelease(s, lane, cfg, setHitFx) {
  const n = s.held[lane];
  if (!n) return;
  const expectedEnd = n.time + n.duration;
  const earlyBy = expectedEnd - s.currentMs;
  if (earlyBy > cfg.good) {
    // Released too early — count as miss, combo reset
    n.judged = true;
    n.result = "miss";
    s.stats.miss += 1;
    s.stats.judgedForAcc += 1;
    s.combo = 0;
    s.held[lane] = null;
    setHitFx((prev) => ({
      ...prev,
      [lane]: { kind: "miss", ts: performance.now(), text: "EARLY" },
    }));
  } else {
    // Good enough — count as hit at whatever currentResult was
    n.judged = true;
    n.result = n.currentResult || "good";
    s.stats[n.result] += 1;
    s.stats.judgedForAcc += 1;
    s.combo += 1;
    if (s.combo > s.maxCombo) s.maxCombo = s.combo;
    s.score += (n.result === "perfect" ? SCORE.perfect : SCORE.good) *
               multiplierFor(s.combo) * cfg.scoreMult;
    s.held[lane] = null;
  }
}

function computeProgress(s, chart) {
  if (!chart.length) return 0;
  const last = chart[chart.length - 1].time + (chart[chart.length - 1].duration || 0);
  return Math.max(0, Math.min(1, Math.max(0, s.currentMs) / last));
}

function finalStats(s) {
  return {
    score: Math.round(s.score),
    maxCombo: s.maxCombo,
    perfect: s.stats.perfect,
    good: s.stats.good,
    miss: s.stats.miss,
    total: s.stats.total,
  };
}

// -----------------------------------------------------------------------------

const styles = {
  root: {
    position: "fixed",
    inset: 0,
    background: `radial-gradient(ellipse at 50% 20%, ${COLORS.bg1} 0%, ${COLORS.bg0} 60%, #000 100%)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: FONT_STACK,
    color: "#fff",
    overflow: "hidden",
    userSelect: "none",
  },
  bgDots: {
    position: "absolute",
    inset: 0,
    backgroundImage: "radial-gradient(circle, #ffffff09 1px, transparent 1px)",
    backgroundSize: "30px 30px",
    pointerEvents: "none",
  },
  bgGlowA: {
    position: "absolute",
    top: "10%",
    left: "10%",
    width: "400px",
    height: "400px",
    background: "radial-gradient(circle, #f682f422 0%, transparent 70%)",
    filter: "blur(60px)",
    pointerEvents: "none",
    animation: "uh-bg-drift 16s ease-in-out infinite",
  },
  bgGlowB: {
    position: "absolute",
    bottom: "5%",
    right: "10%",
    width: "500px",
    height: "500px",
    background: "radial-gradient(circle, #4d9eff22 0%, transparent 70%)",
    filter: "blur(70px)",
    pointerEvents: "none",
    animation: "uh-bg-drift 22s ease-in-out infinite reverse",
  },
  vignette: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background: "radial-gradient(ellipse at center, transparent 40%, #000a 100%)",
  },
  highwayWrap: {
    position: "relative",
  },
  highway: {
    position: "relative",
    transformStyle: "preserve-3d",
    transformOrigin: "center bottom",
    background: `linear-gradient(to bottom, ${COLORS.highwayTop} 0%, ${COLORS.highwayBottom} 100%)`,
    borderLeft: "1px solid #ffffff33",
    borderRight: "1px solid #ffffff33",
    boxShadow: "0 0 80px #000c, inset 0 0 80px #000c",
  },
  flatOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    pointerEvents: "none",
  },
  btnRow: {
    position: "absolute",
    bottom: 30,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: "1.2rem",
    pointerEvents: "auto",
  },
  btn: {
    width: "100px",
    height: "100px",
    borderRadius: "18px",
    cursor: "pointer",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    outline: "none",
    transition: "transform 0.08s cubic-bezier(.17,.67,.35,1.2), box-shadow 0.08s, background 0.08s, border 0.08s",
    overflow: "hidden",
    flexShrink: 0,
    color: "#fff",
  },
  btnLabel: {
    fontSize: "1.6rem",
    fontWeight: 900,
    textShadow: "0 2px 6px #0008",
  },
  btnKey: {
    position: "absolute",
    bottom: 6,
    right: 8,
    fontSize: "0.65rem",
    color: "#ffffff77",
    letterSpacing: "0.05em",
    fontFamily: "monospace",
  },
  songTag: {
    position: "absolute",
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    textAlign: "center",
    zIndex: 5,
    pointerEvents: "none",
  },
  songTagArtist: {
    fontSize: "0.65rem",
    letterSpacing: "0.2em",
    color: COLORS.textMuted,
    textTransform: "uppercase",
  },
  songTagTitle: {
    fontSize: "1.1rem",
    color: "#ffffffdd",
    marginTop: "0.15rem",
    textShadow: "0 0 12px #0008",
  },
  songTagDiff: {
    display: "inline-block",
    marginTop: "0.4rem",
    padding: "2px 10px",
    border: "1px solid #fff",
    borderRadius: 999,
    fontSize: "0.6rem",
    letterSpacing: "0.2em",
  },
  pauseBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "#ffffff10",
    border: "1px solid #ffffff33",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.9rem",
    zIndex: 20,
    fontFamily: FONT_STACK,
  },
};
