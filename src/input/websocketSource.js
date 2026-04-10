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

export function connectWebsocket(url = DEFAULT_URL) {
  if (ws) return;

  registerSource({
    id: SOURCE_ID,
    label: `Bridge (${url})`,
    status: "connecting",
    stop: () => disconnectWebsocket(),
  });

  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => updateSourceStatus(SOURCE_ID, "connected");
    ws.onmessage = (msg) => handleMessage(String(msg.data || ""));
    ws.onerror = () => updateSourceStatus(SOURCE_ID, "error");
    ws.onclose = () => {
      updateSourceStatus(SOURCE_ID, "disconnected");
      ws = null;
      // Simple retry
      reconnectTimer = setTimeout(open, 1500);
    };
  };
  open();
}

export function disconnectWebsocket() {
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
