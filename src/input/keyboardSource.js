// Keyboard input source. Maps A/S/D/F to lanes 0/1/2/3.
// Guards against auto-repeat.

import { LANES } from "../theme";
import { emit, registerSource, unregisterSource } from "./inputManager";

let started = false;
// Current teardown function, set on start, cleared on stop. Subsequent
// calls to startKeyboardSource() while already started are no-ops but
// still return the same teardown so callers don't need to care.
let currentStop = () => {};

export function startKeyboardSource() {
  if (started) return currentStop;
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

  const stopListeners = () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    started = false;
    currentStop = () => {};
  };

  registerSource({
    id: "keyboard",
    label: "Keyboard (A S D F)",
    status: "connected",
    stop: stopListeners,
  });

  // Returned teardown unregisters the source too (which also invokes
  // stopListeners via inputManager.unregisterSource).
  currentStop = () => {
    if (!started) return;
    unregisterSource("keyboard");
  };
  return currentStop;
}
