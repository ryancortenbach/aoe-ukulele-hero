import { FONT_STACK, COLORS } from "../theme";

export default function Results({ song, stats, onReplay, onMenu }) {
  const { score, maxCombo, perfect, good, miss, total } = stats;
  const accuracy = total ? ((perfect + good) / total) : 0;
  const grade = gradeFor(accuracy, miss);

  return (
    <div style={styles.root}>
      <div style={styles.bgGlow} />
      <div style={styles.card}>
        <div style={styles.songLabel}>{song.title.toUpperCase()}</div>
        <div style={styles.doneLabel}>COMPLETE</div>

        <div style={{ ...styles.grade, color: grade.color, textShadow: `0 0 40px ${grade.color}` }}>
          {grade.letter}
        </div>

        <div style={styles.scoreBig}>{score.toLocaleString()}</div>
        <div style={styles.scoreLabel}>FINAL SCORE</div>

        <div style={styles.statGrid}>
          <Stat label="ACCURACY" value={`${Math.round(accuracy * 100)}%`} />
          <Stat label="MAX COMBO" value={maxCombo} />
          <Stat label="PERFECT" value={perfect} color={COLORS.perfect} />
          <Stat label="GOOD" value={good} color={COLORS.good} />
          <Stat label="MISS" value={miss} color={COLORS.miss} />
          <Stat label="NOTES" value={total} />
        </div>

        <div style={styles.btnRow}>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={onReplay}>
            ↻ REPLAY
          </button>
          <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={onMenu}>
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color: color || "#fff" }}>{value}</div>
    </div>
  );
}

function gradeFor(accuracy, miss) {
  if (accuracy >= 0.98 && miss === 0) return { letter: "S", color: "#f682f4" };
  if (accuracy >= 0.92) return { letter: "A", color: "#54e4e9" };
  if (accuracy >= 0.8) return { letter: "B", color: "#ffd95a" };
  if (accuracy >= 0.65) return { letter: "C", color: "#4d9eff" };
  if (accuracy >= 0.5) return { letter: "D", color: "#ff944d" };
  return { letter: "F", color: "#ff4d6d" };
}

const styles = {
  root: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: `radial-gradient(ellipse at 50% 40%, ${COLORS.bg1} 0%, ${COLORS.bg0} 70%, #000 100%)`,
    fontFamily: FONT_STACK,
    overflow: "hidden",
  },
  bgGlow: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse at 50% 40%, #f682f422, transparent 60%)",
    filter: "blur(30px)",
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    minWidth: "460px",
    padding: "2.5rem 3rem",
    borderRadius: "20px",
    background: "#ffffff08",
    border: "1px solid #ffffff22",
    backdropFilter: "blur(10px)",
    textAlign: "center",
    boxShadow: "0 30px 80px #00000088",
  },
  songLabel: {
    fontSize: "0.7rem",
    letterSpacing: "0.25em",
    color: COLORS.textMuted,
  },
  doneLabel: {
    fontSize: "1rem",
    letterSpacing: "0.3em",
    color: COLORS.textDim,
    marginTop: "0.2rem",
  },
  grade: {
    fontSize: "8rem",
    lineHeight: 1,
    marginTop: "0.5rem",
    fontStyle: "italic",
  },
  scoreBig: {
    fontSize: "3rem",
    letterSpacing: "0.03em",
  },
  scoreLabel: {
    fontSize: "0.7rem",
    letterSpacing: "0.25em",
    color: COLORS.textMuted,
    marginTop: "-0.3rem",
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "1rem 2rem",
    marginTop: "1.8rem",
    marginBottom: "1.8rem",
  },
  stat: { textAlign: "center" },
  statLabel: {
    fontSize: "0.6rem",
    letterSpacing: "0.2em",
    color: COLORS.textMuted,
  },
  statValue: {
    fontSize: "1.4rem",
    marginTop: "0.2rem",
  },
  btnRow: {
    display: "flex",
    gap: "1rem",
    justifyContent: "center",
  },
  btn: {
    padding: "0.8rem 2rem",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
    fontSize: "1rem",
    fontFamily: FONT_STACK,
    letterSpacing: "0.1em",
  },
  btnPrimary: {
    background: "linear-gradient(135deg, #f682f4, #4d9eff)",
    color: "#fff",
    boxShadow: "0 6px 24px #f682f455",
  },
  btnGhost: {
    background: "transparent",
    color: "#ffffffcc",
    border: "1px solid #ffffff44",
  },
};
