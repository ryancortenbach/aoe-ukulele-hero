// WebSocket input source.
//
// Fallback path when Web Serial isn't available (Safari, Firefox, mobile).
// A tiny Node bridge (see hardware/bridge/) reads serial from the Arduino
// and rebroadcasts the same text protocol over a WebSocket.
//
// Protocol: identical to serialSource.js — lines like "P0", "R2", "HELLO ...".

import { emit, registerSource, updateSourceStatus, unregisterSource } from "./inputManager";

const SOURCE_ID = "websocket";
const DEFAULT_URL = "ws://localhost:8765";

let ws = null;
let reconnectTimer = null;
// Guards against (a) double-connect while we're between attempts (ws is
// null during reconnect backoff) and (b) a pending onclose scheduling a
// reconnect after the user has explicitly disconnected.
let wantConnected = false;

export function connectWebsocket(url = DEFAULT_URL) {
  if (wantConnected) return;
  wantConnected = true;

  registerSource({
    id: SOURCE_ID,
    label: `Bridge (${url})`,
    status: "connecting",
    // Avoid recursing through disconnectWebsocket → unregisterSource →
    // source.stop → disconnectWebsocket. Just drop the socket here;
    // disconnectWebsocket owns the rest.
    stop: () => {
      wantConnected = false;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    },
  });

  const open = () => {
    reconnectTimer = null;
    if (!wantConnected) return;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      // Malformed URL or similar — bail out rather than crashing.
      updateSourceStatus(SOURCE_ID, "error");
      ws = null;
      return;
    }
    ws.onopen = () => updateSourceStatus(SOURCE_ID, "connected");
    ws.onmessage = (msg) => handleMessage(String(msg.data || ""));
    ws.onerror = () => updateSourceStatus(SOURCE_ID, "error");
    ws.onclose = () => {
      ws = null;
      updateSourceStatus(SOURCE_ID, "disconnected");
      if (!wantConnected) return; // user-initiated close — don't reconnect
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(open, 1500);
    };
  };
  open();
}

export function disconnectWebsocket() {
  wantConnected = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  unregisterSource(SOURCE_ID);
}

function handleMessage(line) {
  line = line.trim();
  if (!line || line.startsWith("HELLO")) return;
  const type = line[0] === "P" ? "press" : line[0] === "R" ? "release" : null;
  if (!type) return;
  const lane = parseInt(line.slice(1), 10);
  if (Number.isNaN(lane)) return;
  emit(lane, type);
}
