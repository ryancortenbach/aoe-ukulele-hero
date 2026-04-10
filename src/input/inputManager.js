// Central input bus for Ukulele Hero.
//
// Any input source (keyboard, touch, Web Serial, WebSocket bridge) pushes
// normalized events into this bus:
//
//   { lane: 0|1|2|3, type: 'press'|'release', t: performance.now() }
//
// The game loop subscribes once and does not care which physical device
// produced the event. This is the seam between software and hardware.

const listeners = new Set();
const sources = new Map(); // id -> { id, label, status, stop }

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(lane, type) {
  if (lane < 0 || lane > 3) return;
  if (type !== "press" && type !== "release") return;
  const evt = { lane, type, t: performance.now() };
  for (const fn of listeners) {
    try { fn(evt); } catch (e) { console.error("input listener error", e); }
  }
}

export function registerSource(source) {
  sources.set(source.id, source);
  notifySourceChange();
  return () => unregisterSource(source.id);
}

export function unregisterSource(id) {
  const s = sources.get(id);
  if (s && typeof s.stop === "function") {
    try { s.stop(); } catch (e) { /* ignore */ }
  }
  sources.delete(id);
  notifySourceChange();
}

export function listSources() {
  return Array.from(sources.values());
}

const sourceListeners = new Set();
export function subscribeSources(fn) {
  sourceListeners.add(fn);
  fn(listSources());
  return () => sourceListeners.delete(fn);
}
function notifySourceChange() {
  const snapshot = listSources();
  for (const fn of sourceListeners) {
    try { fn(snapshot); } catch (e) { /* ignore */ }
  }
}

export function updateSourceStatus(id, status) {
  const s = sources.get(id);
  if (!s) return;
  s.status = status;
  notifySourceChange();
}
