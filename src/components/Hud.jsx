import { COLORS, FONT_STACK, MULTIPLIERS } from "../theme";

export function multiplierFor(combo) {
  for (const m of MULTIPLIERS) if (combo >= m.combo) return m.mult;
  return 1;
}

export default function Hud({ score, combo, accuracy, progress }) {
  const mult = multiplierFor(combo);
  return (
    <div style={styles.root}>
      <div style={styles.left}>
        <div style={styles.label}>SCORE</div>
        <div style={styles.score}>{score.toLocaleString()}</div>
      </div>

      <div style={styles.center}>
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressFill,
              width: `${Math.round(progress * 100)}%`,
            }}
          />
        </div>
        <div style={styles.accuracy}>{Math.round(accuracy * 100)}% ACCURACY</div>
      </div>

      <div style={styles.right}>
        <div style={styles.label}>COMBO</div>
        <div
          style={{
            ...styles.combo,
            animation: combo > 0 ? "uh-combo-shake 0.2s" : undefined,
            animationIterationCount: combo > 0 ? 1 : undefined,
          }}
          key={combo}
        >
          {combo} <span style={{ ...styles.mult, color: multColor(mult) }}>x{mult}</span>
        </div>
      </div>
    </div>
  );
}

function multColor(m) {
  if (m >= 4) return "#f682f4";
  if (m >= 3) return "#54e4e9";
  if (m >= 2) return "#ffd95a";
  return "#ffffff77";
}

const styles = {
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: "1.2rem 2rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "2rem",
    fontFamily: FONT_STACK,
    color: "#fff",
    zIndex: 5,
    pointerEvents: "none",
    background:
      "linear-gradient(to bottom, #000000cc 0%, #00000066 60%, transparent 100%)",
  },
  left: { minWidth: "180px" },
  right: { minWidth: "180px", textAlign: "right" },
  center: { flex: 1, maxWidth: "420px" },
  label: {
    fontSize: "0.65rem",
    letterSpacing: "0.2em",
    color: COLORS.textMuted,
  },
  score: {
    fontSize: "2rem",
    letterSpacing: "0.02em",
    textShadow: "0 0 20px #ffffff44",
  },
  combo: {
    fontSize: "2rem",
    letterSpacing: "0.02em",
  },
  mult: {
    fontSize: "1.4rem",
    marginLeft: "0.3rem",
  },
  progressTrack: {
    width: "100%",
    height: "6px",
    background: "#ffffff22",
    borderRadius: "3px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #f682f4, #54e4e9, #4d9eff)",
    transition: "width 0.1s linear",
    boxShadow: "0 0 12px #54e4e988",
  },
  accuracy: {
    marginTop: "0.4rem",
    fontSize: "0.7rem",
    letterSpacing: "0.15em",
    textAlign: "center",
    color: COLORS.textDim,
  },
};
