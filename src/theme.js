// Design tokens and gameplay constants for Ukulele Hero.

export const LANES = [
  {
    id: 0,
    label: "G",
    key: "a",
    color: "#f682f4", // pink
    glow: "#ff7cf0",
    shadow: "#8b007f",
  },
  {
    id: 1,
    label: "C",
    key: "s",
    color: "#ffd95a", // warm yellow
    glow: "#ffe27a",
    shadow: "#a07900",
  },
  {
    id: 2,
    label: "E",
    key: "d",
    color: "#54e4e9", // cyan
    glow: "#7af3f7",
    shadow: "#0f8a8d",
  },
  {
    id: 3,
    label: "A",
    key: "f",
    color: "#4d9eff", // blue
    glow: "#7ab8ff",
    shadow: "#1a4fa8",
  },
];

export const COLORS = {
  bg0: "#0d0d1a",
  bg1: "#1a0d2e",
  bg2: "#0d1a2a",
  highwayTop: "#05050f",
  highwayBottom: "#12102a",
  laneDivider: "#ffffff18",
  fretLine: "#ffffff14",
  hitLine: "#ffffff",
  textDim: "#ffffff80",
  textMuted: "#ffffff55",
  good: "#ffd95a",
  perfect: "#7af3f7",
  miss: "#ff4d6d",
};

// Timing windows (ms around the hit moment).
export const TIMING = {
  perfect: 50,
  good: 100,
  // anything worse and the note is a miss.
};

export const SCORE = {
  perfect: 100,
  good: 50,
  miss: 0,
};

// Combo thresholds → multiplier.
export const MULTIPLIERS = [
  { combo: 50, mult: 4 },
  { combo: 25, mult: 3 },
  { combo: 10, mult: 2 },
  { combo: 0, mult: 1 },
];

export const FONT_STACK = "'Fredoka One', 'Nunito', cursive, sans-serif";

// Highway geometry.
export const HIGHWAY = {
  widthPx: 520,      // flat width at the hit line
  heightPx: 620,     // visible highway height
  perspectiveDeg: 38, // rotateX amount (feel of 3D)
  noteTravelMs: 1800, // how long a note takes to travel from spawn to hit line
  noteSizePx: 84,    // button-face size of a note
  hitLineFromBottom: 150, // px from bottom of highway where buttons sit
};
