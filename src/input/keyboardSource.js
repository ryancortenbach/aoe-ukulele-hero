// Keyboard input source. Maps A/S/D/F to lanes 0/1/2/3.
// Guards against auto-repeat.

import { LANES } from "../theme";
import { emit, registerSource } from "./inputManager";

let started = false;

export function startKeyboardSource() {
  if (started) return;
  started = true;

  const keyMap = {};
  LANES.forEach((l) => { keyMap[l.key] = l.id; });

  const down = (e) => {
    if (e.repeat) return;
    const lane = keyMap[e.key.toLowerCase()];
    if (lane === undefined) return;
    emit(lane, "press");
  };
  const up = (e) => {
    const lane = keyMap[e.key.toLowerCase()];
    if (lane === undefined) return;
    emit(lane, "release");
  };

  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);

  registerSource({
    id: "keyboard",
    label: "Keyboard (A S D F)",
    status: "connected",
    stop() {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      started = false;
    },
  });
}
