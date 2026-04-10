import { useEffect, useState } from "react";
import { FONT_STACK } from "../theme";

export default function Countdown({ onDone }) {
  const [n, setN] = useState(3);

  useEffect(() => {
    if (n === 0) {
      const id = setTimeout(onDone, 400);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setN((x) => x - 1), 800);
    return () => clearTimeout(id);
  }, [n, onDone]);

  return (
    <div style={styles.root}>
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
