import { useState, useEffect } from "react";
import { LANES, COLORS, FONT_STACK } from "../theme";
import { SONGS } from "../songs";

export default function Menu({ onStart }) {
  const [selected, setSelected] = useState(0);
  const song = SONGS[selected];

  // Pulse the strings for some life
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => (p + 1) % LANES.length), 450);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={styles.root}>
      <div style={styles.bgDots} />
      <div style={styles.bgGlow} />

      <div style={styles.titleWrap}>
        <h1 style={styles.title}>
          <span style={{ ...styles.titleUku, color: LANES[0].color, textShadow: `0 0 24px ${LANES[0].color}88` }}>Uku</span>
          <span style={{ ...styles.titleLele, color: LANES[1].color, textShadow: `0 0 24px ${LANES[1].color}88` }}>lele</span>
          <span style={styles.titleHero}> Hero</span>
        </h1>
        <p style={styles.tagline}>4 strings · 4 keys · infinite aloha</p>
      </div>

      {/* Animated strings */}
      <div style={styles.stringRow}>
        {LANES.map((b, i) => (
          <div
            key={b.id}
            style={{
              ...styles.string,
              background: `linear-gradient(to bottom, ${b.color}, ${b.color}22)`,
              boxShadow: pulse === i ? `0 0 24px ${b.glow}` : `0 0 6px ${b.color}44`,
              transform: pulse === i ? "scaleY(1.08)" : "scaleY(1)",
            }}
          />
        ))}
      </div>

      {/* Song select */}
      <div style={styles.songCard}>
        <div style={styles.songLabel}>NOW PLAYING</div>
        <div style={styles.songTitle}>{song.title}</div>
        <div style={styles.songMeta}>
          {song.artist} · {song.bpm} BPM · {song.difficulty}
        </div>
        {SONGS.length > 1 && (
          <div style={styles.songDots}>
            {SONGS.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                style={{
                  ...styles.songDot,
                  background: i === selected ? "#fff" : "#ffffff33",
                }}
                aria-label={`Select song ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <button
        style={styles.playBtn}
        onClick={() => onStart(song)}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        ▶  PLAY
      </button>

      <div style={styles.hint}>
        Press <kbd style={styles.kbd}>A</kbd> <kbd style={styles.kbd}>S</kbd>{" "}
        <kbd style={styles.kbd}>D</kbd> <kbd style={styles.kbd}>F</kbd> to strum
      </div>
    </div>
  );
}

const styles = {
  root: {
    position: "fixed",
    inset: 0,
    background: `radial-gradient(ellipse at 50% 30%, ${COLORS.bg1} 0%, ${COLORS.bg0} 60%, #000 100%)`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: FONT_STACK,
    userSelect: "none",
    overflow: "hidden",
  },
  bgDots: {
    position: "absolute",
    inset: 0,
    backgroundImage: "radial-gradient(circle, #ffffff0d 1px, transparent 1px)",
    backgroundSize: "30px 30px",
    pointerEvents: "none",
    animation: "uh-bg-drift 18s ease-in-out infinite",
  },
  bgGlow: {
    position: "absolute",
    top: "20%",
    left: "50%",
    width: "700px",
    height: "400px",
    transform: "translateX(-50%)",
    background: "radial-gradient(ellipse, #f682f422 0%, transparent 70%)",
    filter: "blur(40px)",
    pointerEvents: "none",
  },
  titleWrap: {
    textAlign: "center",
    zIndex: 2,
    animation: "uh-title-float 4s ease-in-out infinite",
  },
  title: {
    fontSize: "clamp(3rem, 10vw, 6rem)",
    margin: 0,
    lineHeight: 1,
    letterSpacing: "-0.02em",
  },
  titleUku: {},
  titleLele: {},
  titleHero: {
    color: "#ffffff",
    fontStyle: "italic",
    textShadow: "0 0 20px #ffffff55",
  },
  tagline: {
    marginTop: "1rem",
    color: COLORS.textDim,
    letterSpacing: "0.15em",
    fontSize: "0.9rem",
    textTransform: "uppercase",
  },
  stringRow: {
    display: "flex",
    gap: "2.4rem",
    height: "80px",
    marginTop: "2rem",
    marginBottom: "1.5rem",
    zIndex: 2,
  },
  string: {
    width: "4px",
    height: "80px",
    borderRadius: "4px",
    transition: "box-shadow 0.3s, transform 0.3s",
  },
  songCard: {
    zIndex: 2,
    background: "#ffffff08",
    border: "1px solid #ffffff22",
    borderRadius: "14px",
    padding: "1.2rem 2rem",
    textAlign: "center",
    minWidth: "260px",
    backdropFilter: "blur(8px)",
  },
  songLabel: {
    fontSize: "0.65rem",
    letterSpacing: "0.2em",
    color: COLORS.textMuted,
  },
  songTitle: {
    fontSize: "1.6rem",
    marginTop: "0.3rem",
  },
  songMeta: {
    fontSize: "0.8rem",
    color: COLORS.textDim,
    marginTop: "0.2rem",
    letterSpacing: "0.05em",
  },
  songDots: {
    display: "flex",
    gap: "0.5rem",
    justifyContent: "center",
    marginTop: "0.8rem",
  },
  songDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    padding: 0,
  },
  playBtn: {
    marginTop: "1.8rem",
    fontSize: "1.4rem",
    padding: "0.9rem 3.2rem",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(135deg, #f682f4, #4d9eff)",
    color: "#fff",
    cursor: "pointer",
    fontFamily: FONT_STACK,
    letterSpacing: "0.1em",
    boxShadow: "0 8px 32px #f682f455, 0 0 60px #4d9eff33",
    transition: "transform 0.15s",
    zIndex: 2,
  },
  hint: {
    marginTop: "2.2rem",
    color: COLORS.textMuted,
    fontSize: "0.85rem",
    letterSpacing: "0.05em",
    zIndex: 2,
  },
  kbd: {
    display: "inline-block",
    padding: "2px 8px",
    border: "1px solid #ffffff33",
    borderRadius: "4px",
    margin: "0 2px",
    fontFamily: "monospace",
    background: "#ffffff08",
    color: "#fff",
  },
};
