import { useEffect } from "react";
import { FONT_STACK, COLORS } from "../theme";

export default function PauseMenu({ onResume, onRestart, onQuit }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "p") {
        e.preventDefault();
        onResume();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResume]);

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.label}>PAUSED</div>
        <div style={styles.title}>Take a breath</div>
        <div style={styles.btns}>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={onResume}>
            ▶  RESUME
          </button>
          <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={onRestart}>
            ↻  RESTART
          </button>
          <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={onQuit}>
            ✕  QUIT
          </button>
        </div>
        <div style={styles.hint}>
          <kbd style={styles.kbd}>Esc</kbd> or <kbd style={styles.kbd}>P</kbd> to resume
        </div>
      </div>
    </div>
  );
}

const styles = {
  root: {
    position: "absolute",
    inset: 0,
    background: "#0008",
    backdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    fontFamily: FONT_STACK,
    animation: "uh-combo-flash 0.3s ease-out forwards",
  },
  card: {
    background: "#0d0d1aee",
    border: "1px solid #ffffff33",
    borderRadius: 20,
    padding: "2.4rem 3.2rem",
    textAlign: "center",
    boxShadow: "0 30px 80px #000c, 0 0 80px #f682f422",
    minWidth: 340,
  },
  label: {
    fontSize: "0.7rem",
    letterSpacing: "0.25em",
    color: COLORS.textMuted,
  },
  title: {
    fontSize: "2.4rem",
    color: "#fff",
    marginTop: "0.3rem",
    marginBottom: "1.5rem",
    textShadow: "0 0 24px #f682f488",
  },
  btns: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
  },
  btn: {
    padding: "0.8rem 1.4rem",
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    fontFamily: FONT_STACK,
    fontSize: "1rem",
    letterSpacing: "0.12em",
    color: "#fff",
  },
  btnPrimary: {
    background: "linear-gradient(135deg, #f682f4, #4d9eff)",
    boxShadow: "0 8px 28px #f682f455",
  },
  btnGhost: {
    background: "transparent",
    border: "1px solid #ffffff33",
  },
  hint: {
    marginTop: "1.2rem",
    fontSize: "0.7rem",
    color: COLORS.textMuted,
    letterSpacing: "0.05em",
  },
  kbd: {
    display: "inline-block",
    padding: "2px 7px",
    border: "1px solid #ffffff33",
    borderRadius: "4px",
    margin: "0 2px",
    fontFamily: "monospace",
    background: "#ffffff08",
    color: "#fff",
  },
};
