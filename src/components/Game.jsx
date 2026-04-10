import { useEffect, useRef, useState, useCallback } from "react";
import { LANES, COLORS, FONT_STACK, TIMING, SCORE, HIGHWAY } from "../theme";
import { subscribe as subscribeInput, emit as emitInput } from "../input/inputManager";
import Hud, { multiplierFor } from "./Hud";
import Countdown from "./Countdown";

// Game phases: countdown → playing → done
export default function Game({ song, onFinish, onExit }) {
  const [phase, setPhase] = useState("countdown");

  // Mutable state lives in refs so the rAF loop doesn't fight React renders.
  const stateRef = useRef(createState(song));
  const [, force] = useState(0);
  const renderTick = useCallback(() => force((n) => (n + 1) % 1_000_000), []);

  // Hit feedback visual state (React-rendered)
  const [hitFx, setHitFx] = useState({}); // laneId -> { kind, ts, text }
  const [lanePressed, setLanePressed] = useState({}); // laneId -> bool

  // --- Input handling ---
  const handleInput = useCallback((evt) => {
    const { lane, type } = evt;
    if (type === "press") {
      setLanePressed((p) => ({ ...p, [lane]: true }));
      if (phase === "playing") {
        judgePress(stateRef.current, lane, setHitFx);
      }
    } else {
      setLanePressed((p) => ({ ...p, [lane]: false }));
    }
  }, [phase]);

  useEffect(() => subscribeInput(handleInput), [handleInput]);

  // Escape to quit
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onExit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  // --- Game loop ---
  useEffect(() => {
    if (phase !== "playing") return;
    let rafId;
    const start = performance.now();
    stateRef.current.startTime = start;

    const tick = (now) => {
      const s = stateRef.current;
      s.currentMs = now - s.startTime;

      // Auto-miss notes that slipped past the hit window
      const missWindow = TIMING.good;
      for (const n of s.notes) {
        if (!n.judged && s.currentMs - n.time > missWindow) {
          n.judged = true;
          n.result = "miss";
          s.stats.miss += 1;
          s.combo = 0;
        }
      }

      // Finish condition: all notes judged AND we're past end of chart + 1s
      const lastNoteTime = s.notes.length ? s.notes[s.notes.length - 1].time : 0;
      const allJudged = s.notes.every((n) => n.judged);
      if (allJudged && s.currentMs > lastNoteTime + 1000) {
        setPhase("done");
        onFinish(finalStats(s));
        return;
      }

      renderTick();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase, onFinish, renderTick]);

  const s = stateRef.current;
  const progress = computeProgress(s);
  const accuracy = s.stats.total
    ? (s.stats.perfect + s.stats.good) / s.stats.judgedForAcc
    : 1;

  return (
    <div style={styles.root}>
      <div style={styles.bgDots} />

      <Hud
        score={s.score}
        combo={s.combo}
        accuracy={isFinite(accuracy) ? accuracy : 1}
        progress={progress}
      />

      <HighwayView
        song={song}
        state={s}
        hitFx={hitFx}
        lanePressed={lanePressed}
      />

      {phase === "countdown" && (
        <Countdown onDone={() => setPhase("playing")} />
      )}

      <button style={styles.exitBtn} onClick={onExit}>✕</button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Highway: perspective-tilted 4-lane scrolling track.
// -----------------------------------------------------------------------------

function HighwayView({ song, state, hitFx, lanePressed }) {
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
                ? `linear-gradient(to bottom, ${lane.color}05 0%, ${lane.color}33 90%, ${lane.color}66 100%)`
                : `linear-gradient(to bottom, transparent 0%, ${lane.color}12 100%)`,
              borderLeft: lane.id === 0 ? "none" : `1px solid ${COLORS.laneDivider}`,
              transition: "background 0.15s",
            }}
          />
        ))}

        {/* Moving fret lines (scroll illusion) */}
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
            backgroundPositionY: `${(state.currentMs * pxPerMs) % 60}px`,
          }}
        />

        {/* Notes */}
        {state.notes.map((n) => {
          if (n.judged && n.result !== "perfect" && n.result !== "good") return null;
          if (n.judged) return null; // already hit; hide
          const dt = n.time - state.currentMs;
          if (dt > noteTravelMs + 50) return null;
          if (dt < -TIMING.good - 50) return null;
          const y = hitY - dt * pxPerMs - noteSizePx / 2;
          const lane = LANES[n.lane];
          return (
            <div
              key={n.id}
              style={{
                position: "absolute",
                left: n.lane * laneW + (laneW - noteSizePx) / 2,
                top: y,
                width: noteSizePx,
                height: noteSizePx * 0.55,
                borderRadius: noteSizePx,
                background: `radial-gradient(ellipse at 50% 40%, #ffffffcc, ${lane.color} 50%, ${lane.shadow})`,
                boxShadow: `0 0 24px ${lane.glow}88, 0 4px 0 ${lane.shadow}, inset 0 2px 6px #fff6`,
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
            background: "linear-gradient(90deg, transparent, #ffffffcc, transparent)",
            boxShadow: "0 0 20px #fff, 0 0 40px #fff8",
          }}
        />

        {/* Hit circles (targets) */}
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
                  ? `0 0 30px ${lane.glow}, inset 0 0 20px ${lane.color}88`
                  : `0 0 12px ${lane.color}66`,
                background: isPressed
                  ? `radial-gradient(ellipse at 50% 40%, ${lane.color}aa, transparent 70%)`
                  : "transparent",
                transition: "box-shadow 0.08s, background 0.08s",
              }}
            />
          );
        })}
      </div>

      {/* Flat overlay: hit text + tactile buttons. Not tilted. */}
      <FlatOverlay hitFx={hitFx} lanePressed={lanePressed} />
    </div>
  );
}

function FlatOverlay({ hitFx, lanePressed }) {
  const { widthPx } = HIGHWAY;
  const laneW = widthPx / LANES.length;

  return (
    <div style={styles.flatOverlay}>
      {/* Floating hit text */}
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
              bottom: 210,
              color,
              fontSize: "1.2rem",
              letterSpacing: "0.1em",
              textShadow: `0 0 12px ${color}`,
              animation: "uh-pop-in 0.6s ease-out forwards",
              pointerEvents: "none",
            }}
          >
            {fx.text}
          </div>
        );
      })}

      {/* Physical-feel buttons (click/tap for touch play) */}
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
                  ? `0 0 40px 10px ${lane.glow}cc, 0 0 80px 20px ${lane.glow}55, inset 0 2px 8px #fff5`
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

// -----------------------------------------------------------------------------
// Game state helpers
// -----------------------------------------------------------------------------

function createState(song) {
  return {
    startTime: 0,
    currentMs: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    notes: song.chart.map((n, i) => ({
      id: i,
      lane: n.lane,
      time: n.time,
      judged: false,
      result: null,
    })),
    stats: {
      total: song.chart.length,
      perfect: 0,
      good: 0,
      miss: 0,
      judgedForAcc: 0, // grows as we judge
    },
  };
}

function judgePress(s, lane, setHitFx) {
  // Find the unjudged note in this lane closest to now and within hit window.
  let best = null;
  let bestDelta = Infinity;
  for (const n of s.notes) {
    if (n.judged) continue;
    if (n.lane !== lane) continue;
    const delta = Math.abs(n.time - s.currentMs);
    if (delta < bestDelta) { bestDelta = delta; best = n; }
    if (n.time - s.currentMs > TIMING.good) break; // notes later in list are further in future
  }
  if (!best || bestDelta > TIMING.good) {
    // Wrong strum — don't break combo (could also punish; keep friendly).
    return;
  }

  best.judged = true;
  let kind, text, pts;
  if (bestDelta <= TIMING.perfect) {
    kind = "perfect"; text = "PERFECT"; pts = SCORE.perfect;
    s.stats.perfect += 1;
  } else {
    kind = "good"; text = "GOOD"; pts = SCORE.good;
    s.stats.good += 1;
  }
  best.result = kind;
  s.combo += 1;
  if (s.combo > s.maxCombo) s.maxCombo = s.combo;
  s.score += pts * multiplierFor(s.combo);
  s.stats.judgedForAcc += 1;

  setHitFx((prev) => ({ ...prev, [lane]: { kind, ts: performance.now(), text } }));
}

function computeProgress(s) {
  if (!s.notes.length) return 0;
  const last = s.notes[s.notes.length - 1].time;
  return Math.max(0, Math.min(1, s.currentMs / last));
}

function finalStats(s) {
  return {
    score: s.score,
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
  highwayWrap: {
    position: "relative",
  },
  highway: {
    position: "relative",
    transformStyle: "preserve-3d",
    transformOrigin: "center bottom",
    background: `linear-gradient(to bottom, ${COLORS.highwayTop} 0%, ${COLORS.highwayBottom} 100%)`,
    borderLeft: "1px solid #ffffff22",
    borderRight: "1px solid #ffffff22",
    boxShadow: "0 0 80px #00000088, inset 0 0 60px #00000088",
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
  exitBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "#ffffff10",
    border: "1px solid #ffffff33",
    color: "#fff",
    cursor: "pointer",
    fontSize: "1rem",
    zIndex: 20,
  },
};
