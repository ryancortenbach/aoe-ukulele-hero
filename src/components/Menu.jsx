import { useEffect, useRef, useState } from "react";
import { LANES, COLORS, FONT_STACK, DIFFICULTIES } from "../theme";
import { useSongLibrary, addUploadedFile, removeSong } from "../audio/songLibrary";
import { getHighScore } from "../highScores";
import { playSfx } from "../audio/sfxPlayer";

export default function Menu({ onStart }) {
  const { songs, loadingIds } = useSongLibrary();
  const [selectedId, setSelectedId] = useState(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);
  const fileRef = useRef(null);

  // Auto-select first song once library has something
  useEffect(() => {
    if (!selectedId && songs.length) setSelectedId(songs[0].id);
  }, [songs, selectedId]);

  const song = songs.find((s) => s.id === selectedId);
  const highScore = song ? getHighScore(song.id, difficulty) : null;

  // Pulse the strings
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => (p + 1) % LANES.length), 280);
    return () => clearInterval(id);
  }, []);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadErr(null);
    setUploading(true);
    try {
      const added = await addUploadedFile(file);
      setSelectedId(added.id);
    } catch (err) {
      setUploadErr(err.message || String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.bgDots} />
      <FloatingNotesBg />
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />
      <div style={styles.vignette} />

      <div style={styles.titleWrap}>
        <h1 style={styles.title}>
          <span style={{ ...styles.titlePart, color: LANES[0].color, textShadow: `0 0 32px ${LANES[0].color}, 0 0 12px ${LANES[0].color}` }}>Uku</span>
          <span style={{ ...styles.titlePart, color: LANES[1].color, textShadow: `0 0 32px ${LANES[1].color}, 0 0 12px ${LANES[1].color}` }}>lele</span>
          <span style={styles.titleHero}> Hero</span>
        </h1>
        <p style={styles.tagline}>4 strings · 4 keys · infinite aloha</p>
      </div>

      <div style={styles.stringRow}>
        {LANES.map((b, i) => (
          <div
            key={b.id}
            style={{
              ...styles.string,
              background: `linear-gradient(to bottom, ${b.color}, ${b.color}22)`,
              boxShadow: pulse === i ? `0 0 32px ${b.glow}, 0 0 60px ${b.glow}55` : `0 0 8px ${b.color}44`,
              transform: pulse === i ? "scaleY(1.12)" : "scaleY(1)",
            }}
          />
        ))}
      </div>

      {/* Difficulty selector */}
      <div style={styles.diffRow}>
        {Object.values(DIFFICULTIES).map((d) => {
          const active = d.id === difficulty;
          return (
            <button
              key={d.id}
              onClick={() => { if (d.id !== difficulty) playSfx('menu-select'); setDifficulty(d.id); }}
              aria-pressed={active}
              aria-label={`Difficulty: ${d.label}`}
              style={{
                ...styles.diffBtn,
                color: active ? "#0d0d1a" : d.color,
                background: active ? d.color : "transparent",
                borderColor: d.color,
                boxShadow: active ? `0 0 30px ${d.color}88, 0 4px 16px ${d.color}55` : "none",
                transform: active ? "scale(1.05)" : "scale(1)",
              }}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      {/* Song picker */}
      <div style={styles.picker}>
        <div style={styles.pickerLabel}>CHOOSE YOUR JAM</div>

        <div style={styles.songList}>
          {songs.length === 0 && loadingIds.size > 0 && (
            <div style={styles.loadingBox}>Loading songs…</div>
          )}

          {songs.map((s) => (
            <SongCard
              key={s.id}
              song={s}
              selected={s.id === selectedId}
              highScore={getHighScore(s.id, difficulty)}
              onSelect={() => { if (s.id !== selectedId) playSfx('menu-select'); setSelectedId(s.id); }}
              onRemove={s.source === "upload" ? () => {
                if (selectedId === s.id) setSelectedId(null);
                removeSong(s.id);
              } : null}
            />
          ))}

          {uploading && <div style={styles.loadingBox}>Analyzing BPM…</div>}

          <button style={styles.addBtn} onClick={() => fileRef.current?.click()}>
            <span style={styles.addIcon}>＋</span>
            <span>Add Song</span>
            <span style={styles.addSub}>mp3 · wav · m4a · ogg</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            onChange={handleFile}
            style={{ display: "none" }}
          />
        </div>

        {uploadErr && <div style={styles.err}>{uploadErr}</div>}
      </div>

      {/* High score for current selection */}
      {highScore && song && (
        <div style={styles.highScoreBox}>
          <span style={styles.highScoreLabel}>BEST</span>
          <span style={styles.highScoreValue}>{highScore.score.toLocaleString()}</span>
          <span style={styles.highScoreGrade}>{highScore.grade}</span>
        </div>
      )}

      <button
        style={{
          ...styles.playBtn,
          opacity: song ? 1 : 0.45,
          cursor: song ? "pointer" : "not-allowed",
        }}
        disabled={!song}
        aria-label={song ? `Play ${song.title} on ${difficulty}` : "Play (select a song first)"}
        onClick={() => { if (song) { playSfx('menu-confirm'); onStart(song, difficulty); } }}
        onMouseEnter={(e) => song && (e.currentTarget.style.transform = "scale(1.06)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        ▶  PLAY
      </button>

      <div style={styles.hint}>
        Press <kbd style={styles.kbd}>A</kbd> <kbd style={styles.kbd}>S</kbd>{" "}
        <kbd style={styles.kbd}>D</kbd> <kbd style={styles.kbd}>F</kbd> to strum ·{" "}
        <kbd style={styles.kbd}>Esc</kbd> to pause
      </div>
    </div>
  );
}

function SongCard({ song, selected, onSelect, onRemove, highScore }) {
  const color = song.color || "#f682f4";
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        ...styles.songCard,
        borderColor: selected ? color : "#ffffff22",
        background: selected
          ? `linear-gradient(135deg, ${color}22, #0d0d1aaa)`
          : "#ffffff06",
        transform: selected ? "scale(1.03) translateY(-2px)" : "scale(1)",
        boxShadow: selected
          ? `0 14px 40px ${color}55, 0 0 30px ${color}44, inset 0 0 0 1px ${color}`
          : "0 6px 20px #00000055",
      }}
    >
      <div
        style={{
          ...styles.songCardArt,
          background: `radial-gradient(circle at 35% 35%, #ffffff22, ${color} 60%, #0d0d1a)`,
          boxShadow: selected ? `0 0 24px ${color}, inset 0 0 16px #000` : "none",
        }}
      >
        <div style={{
          ...styles.songCardVinyl,
          animation: selected ? "uh-spin 6s linear infinite" : undefined,
        }} />
      </div>
      <div style={styles.songCardText}>
        <div style={styles.songCardTitle}>{song.title}</div>
        <div style={styles.songCardMeta}>
          {song.artist} · {song.bpm} BPM
        </div>
        <div style={styles.songCardSub}>
          {Math.round(song.durationMs / 1000)}s · {song.source === "upload" ? "uploaded" : "preview"}
          {highScore && ` · BEST ${highScore.score.toLocaleString()} (${highScore.grade})`}
        </div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={styles.removeBtn}
          title="Remove song"
          aria-label={`Remove ${song.title}`}
        >✕</button>
      )}
    </button>
  );
}

function FloatingNotesBg() {
  return (
    <>
      <style>{`
        @keyframes uh-float-up {
          0%   { transform: translateY(20px) rotate(-15deg); opacity: 0; }
          10%  { opacity: 0.4; }
          100% { transform: translateY(-100vh) rotate(15deg); opacity: 0; }
        }
        @keyframes uh-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={styles.floatNotes}>
        {Array.from({ length: 18 }).map((_, i) => {
          const color = LANES[i % 4].color;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${(i * 53) % 100}%`,
                bottom: "-40px",
                fontSize: `${0.8 + (i % 3) * 0.4}rem`,
                color,
                textShadow: `0 0 12px ${color}`,
                animation: `uh-float-up ${10 + (i % 5) * 3}s linear ${i * 0.8}s infinite`,
                opacity: 0,
              }}
            >
              {["♪", "♫", "♬", "♩"][i % 4]}
            </div>
          );
        })}
      </div>
    </>
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
    fontFamily: FONT_STACK,
    userSelect: "none",
    overflow: "auto",
    padding: "1.2rem 1rem 2rem",
  },
  bgDots: {
    position: "absolute",
    inset: 0,
    backgroundImage: "radial-gradient(circle, #ffffff0d 1px, transparent 1px)",
    backgroundSize: "30px 30px",
    pointerEvents: "none",
    animation: "uh-bg-drift 18s ease-in-out infinite",
  },
  bgGlowA: {
    position: "absolute",
    top: "10%",
    left: "20%",
    width: "500px",
    height: "500px",
    background: "radial-gradient(circle, #f682f433 0%, transparent 70%)",
    filter: "blur(60px)",
    pointerEvents: "none",
    animation: "uh-bg-drift 14s ease-in-out infinite",
  },
  bgGlowB: {
    position: "absolute",
    bottom: "10%",
    right: "15%",
    width: "600px",
    height: "600px",
    background: "radial-gradient(circle, #4d9eff22 0%, transparent 70%)",
    filter: "blur(70px)",
    pointerEvents: "none",
    animation: "uh-bg-drift 20s ease-in-out infinite reverse",
  },
  vignette: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background: "radial-gradient(ellipse at center, transparent 50%, #000a 100%)",
  },
  floatNotes: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  },
  titleWrap: {
    textAlign: "center",
    zIndex: 2,
    marginTop: "1rem",
    animation: "uh-title-float 4s ease-in-out infinite",
  },
  title: {
    fontSize: "clamp(2.6rem, 8vw, 5rem)",
    margin: 0,
    lineHeight: 1,
    letterSpacing: "-0.02em",
  },
  titlePart: {
    transition: "text-shadow 0.3s",
  },
  titleHero: {
    color: "#ffffff",
    fontStyle: "italic",
    textShadow: "0 0 20px #fff7",
  },
  tagline: {
    marginTop: "0.6rem",
    color: COLORS.textDim,
    letterSpacing: "0.15em",
    fontSize: "0.8rem",
    textTransform: "uppercase",
  },
  stringRow: {
    display: "flex",
    gap: "2rem",
    height: "50px",
    marginTop: "0.6rem",
    marginBottom: "0.6rem",
    zIndex: 2,
  },
  string: {
    width: "4px",
    height: "50px",
    borderRadius: "4px",
    transition: "box-shadow 0.25s, transform 0.25s",
  },
  diffRow: {
    display: "flex",
    gap: "0.8rem",
    zIndex: 2,
    marginBottom: "0.8rem",
  },
  diffBtn: {
    padding: "0.45rem 1.2rem",
    borderRadius: 999,
    border: "2px solid",
    cursor: "pointer",
    fontFamily: FONT_STACK,
    fontSize: "0.85rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    transition: "transform 0.15s, box-shadow 0.15s, background 0.15s, color 0.15s",
    background: "transparent",
  },
  picker: {
    zIndex: 2,
    maxWidth: "720px",
    width: "100%",
  },
  pickerLabel: {
    fontSize: "0.6rem",
    letterSpacing: "0.25em",
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: "0.6rem",
  },
  loadingBox: {
    padding: "0.8rem",
    textAlign: "center",
    color: COLORS.textDim,
    fontSize: "0.8rem",
    letterSpacing: "0.1em",
  },
  songList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  songCard: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    padding: "0.7rem",
    borderRadius: "14px",
    border: "1px solid #ffffff22",
    background: "#ffffff06",
    cursor: "pointer",
    fontFamily: FONT_STACK,
    color: "#fff",
    textAlign: "left",
    transition: "transform 0.2s cubic-bezier(.17,.67,.35,1.2), border-color 0.2s, box-shadow 0.2s, background 0.2s",
    position: "relative",
    width: "100%",
  },
  songCardArt: {
    width: 52,
    height: 52,
    borderRadius: 10,
    flexShrink: 0,
    position: "relative",
    overflow: "hidden",
  },
  songCardVinyl: {
    position: "absolute",
    inset: "20%",
    borderRadius: "50%",
    background: "radial-gradient(circle, #0d0d1a 22%, #ffffff22 23%, #0d0d1a 24%, #ffffff11 30%, #0d0d1a 32%, #ffffff11 40%, #0d0d1a 42%)",
    border: "1px solid #ffffff22",
  },
  songCardText: {
    flex: 1,
    minWidth: 0,
  },
  songCardTitle: {
    fontSize: "0.95rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  songCardMeta: {
    fontSize: "0.7rem",
    color: COLORS.textDim,
    letterSpacing: "0.05em",
    marginTop: "0.1rem",
  },
  songCardSub: {
    fontSize: "0.58rem",
    color: COLORS.textMuted,
    letterSpacing: "0.1em",
    marginTop: "0.15rem",
    textTransform: "uppercase",
  },
  removeBtn: {
    position: "absolute",
    top: 6,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "#ffffff15",
    border: "none",
    color: "#ffffffcc",
    fontSize: "0.7rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
    lineHeight: 1,
  },
  addBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.8rem",
    padding: "0.7rem",
    borderRadius: 14,
    border: "1px dashed #ffffff33",
    background: "transparent",
    color: "#ffffffcc",
    cursor: "pointer",
    fontFamily: FONT_STACK,
    fontSize: "0.85rem",
  },
  addIcon: {
    fontSize: "1.3rem",
    color: "#fff",
  },
  addSub: {
    fontSize: "0.58rem",
    color: COLORS.textMuted,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  err: {
    marginTop: "0.6rem",
    padding: "0.5rem 0.8rem",
    borderRadius: 6,
    background: "#ff4d6d22",
    border: "1px solid #ff4d6d66",
    color: "#ffb3c1",
    fontSize: "0.75rem",
    textAlign: "center",
  },
  highScoreBox: {
    display: "flex",
    alignItems: "center",
    gap: "0.8rem",
    marginTop: "1rem",
    padding: "0.4rem 1.2rem",
    background: "#ffffff08",
    border: "1px solid #ffd95a66",
    borderRadius: 999,
    zIndex: 2,
    boxShadow: "0 0 20px #ffd95a33",
  },
  highScoreLabel: {
    fontSize: "0.6rem",
    letterSpacing: "0.2em",
    color: "#ffd95a",
  },
  highScoreValue: {
    fontSize: "1rem",
    color: "#fff",
  },
  highScoreGrade: {
    fontSize: "1rem",
    color: "#ffd95a",
    fontStyle: "italic",
  },
  playBtn: {
    marginTop: "1rem",
    fontSize: "1.4rem",
    padding: "0.9rem 3.2rem",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(135deg, #f682f4, #4d9eff, #54e4e9)",
    backgroundSize: "200% 200%",
    color: "#fff",
    cursor: "pointer",
    fontFamily: FONT_STACK,
    letterSpacing: "0.12em",
    boxShadow: "0 10px 40px #f682f466, 0 0 80px #4d9eff44, inset 0 -3px 0 #0005",
    transition: "transform 0.15s",
    zIndex: 2,
    animation: "uh-gradient-shift 4s ease infinite",
  },
  hint: {
    marginTop: "1rem",
    marginBottom: "1rem",
    color: COLORS.textMuted,
    fontSize: "0.75rem",
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
