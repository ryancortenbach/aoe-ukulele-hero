// src/input/keyboardSource.js
import { emit, registerSource } from "./inputManager";

const SOURCE_ID = "keyboard";

const KEY_MAP = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
};

export function startKeyboard() {
  const onKeyDown = (e) => {
    if (e.repeat) return;
    const lane = KEY_MAP[e.key.toLowerCase()];
    if (lane === undefined) return;
    emit(lane, "press");
  };

  const onKeyUp = (e) => {
    const lane = KEY_MAP[e.key.toLowerCase()];
    if (lane === undefined) return;
    emit(lane, "release");
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  registerSource({
    id: SOURCE_ID,
    label: "Keyboard (A/S/D/F)",
    status: "connected",
    stop: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  });

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}