import { useEffect, useRef, useState } from "react";
import { FONT_STACK } from "../theme";
import { playSfx } from "../audio/sfxPlayer";

// NOTE: `onCancel` is optional and currently unwired. Wire it up in
// src/components/Game.jsx in a later wave (this wave does not touch Game.jsx).
// When provided, pressing Escape during the countdown aborts and calls it.
export default function Countdown({ onDone, onCancel }) {
  const [n, setN] = useState(3);

  // Keep a stable ref to onDone so parent re-renders (e.g. from unrelated
  // state like lane-press visuals) don't reset the countdown timer.
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  // Escape aborts the countdown. Safe if onCancel isn't provided — just
  // swallow the key so stray Escape presses don't bubble weirdly.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (typeof onCancelRef.current === "function") {
          onCancelRef.current();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (n === 0) {
      playSfx('countdown-go');
      const id = setTimeout(() => onDoneRef.current?.(), 400);
      return () => clearTimeout(id);
    }
    playSfx('countdown-tick');
    const id = setTimeout(() => setN((x) => x - 1), 800);
    return () => clearTimeout(id);
  }, [n]);

  return (
    <div style={styles.root} aria-live="assertive" aria-atomic="true">
      <div key={n} style={styles.num}>
        {n === 0 ? "GO!" : n}
      </div>
    </div>
  );
}

const styles = {
  root: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 1000,
    fontFamily: FONT_STACK,
  },
  num: {
    fontSize: "10rem",
    color: "#fff",
    textShadow:
      "0 0 40px #f682f4, 0 0 80px #4d9eff, 0 0 120px #54e4e9",
    animation: "uh-countdown-pop 0.8s ease-out forwards",
  },
};
