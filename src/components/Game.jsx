import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { LANES, COLORS, FONT_STACK, DIFFICULTIES, SCORE, HIGHWAY } from "../theme";
import { subscribe as subscribeInput, emit as emitInput } from "../input/inputManager";
import { generateChart } from "../audio/autoChart";
import { recordScore } from "../highScores";
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

  const audioRef = useRef(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const restart = useCallback(() => {
    stateRef.current = createState(chart);
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
        }
      }
    } else {
      setLanePressed((p) => ({ ...p, [lane]: false }));
      if (phase === "playing" && !pausedRef.current) {
        judgeRelease(stateRef.current, lane, cfg, setHitFx);
      }
    }
  }, [phase, cfg]);

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

  // Pause audio when paused state changes
  useEffect(() => {
    if (!audioRef.current) return;
    if (paused) audioRef.current.pause();
    else if (phase === "playing" && audioRef.current.paused && stateRef.current.currentMs >= 0) {
      audioRef.current.play().catch(() => {});
    }
  }, [paused, phase]);

  // --- Game loop (audio-synced) ---
  useEffect(() => {
    if (phase !== "playing") return;
    let rafId;
    const startPerfNow = performance.now();
    let pauseAccumMs = 0;
    let pauseStartedAt = null;
    let audioStarted = false;

    const tick = (now) => {
      // Accumulate pause time so "elapsed" only counts unpaused time.
      if (pausedRef.current) {
        if (pauseStartedAt === null) pauseStartedAt = now;
        rafId = requestAnimationFrame(tick);
        return;
      } else if (pauseStartedAt !== null) {
        pauseAccumMs += now - pauseStartedAt;
        pauseStartedAt = null;
      }

      const s = stateRef.current;
      const elapsed = now - startPerfNow - pauseAccumMs;

      if (elapsed < LEAD_IN_MS) {
        s.currentMs = -(LEAD_IN_MS - elapsed);
      } else {
        if (!audioStarted && audioRef.current) {
          audioRef.current.currentTime = 0;
          const pr = audioRef.current.play();
          if (pr && pr.catch) pr.catch((e) => console.error("audio play failed", e));
          audioStarted = true;
        }
        s.currentMs = audioRef.current
          ? audioRef.current.currentTime * 1000
          : elapsed - LEAD_IN_MS;
      }

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
        }
      }

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
      const audioEnded = audioRef.current?.ended;
      if ((allJudged && s.currentMs > lastNoteTime + 600) || audioEnded) {
        setPhase("done");
        if (audioRef.current) audioRef.current.pause();
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
    return () => {
      cancelAnimationFrame(rafId);
      if (capturedAudio) capturedAudio.pause();
    };
  }, [phase, onFinish, renderTick, cfg, song.id, difficulty]);

  // Cleanup audio on unmount
  useEffect(() => {
    const capturedAudio = audioRef.current;
    return () => {
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

      <audio ref={audioRef} src={song.audioUrl} preload="auto" crossOrigin="anonymous" />

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
