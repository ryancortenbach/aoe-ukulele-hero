// Web Serial input source for the Ukulele Hero Arduino.
//
// Protocol (one message per line, newline-terminated):
//   HELLO UKULELE      — optional handshake from the device on startup
//   P0 | P1 | P2 | P3  — button press on lane 0..3
//   R0 | R1 | R2 | R3  — button release on lane 0..3
//
// Baud rate: 9600 (matches the reference Arduino sketch under hardware/).
//
// Requires a Chromium-based browser (Chrome/Edge/Brave). Must be called
// from a user gesture (click).

import { emit, registerSource, updateSourceStatus } from "./inputManager";

const SOURCE_ID = "serial";
const BAUD = 9600;

let active = null; // { port, reader, stop }

export function isSerialSupported() {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export async function connectSerial() {
  if (!isSerialSupported()) {
    throw new Error("Web Serial not supported in this browser. Use Chrome/Edge, or run the WebSocket bridge instead.");
  }
  if (active) return active;

  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: BAUD });

  let keepReading = true;
  const textDecoder = new TextDecoderStream();
  const readableStreamClosed = port.readable.pipeTo(textDecoder.writable).catch(() => {});
  const reader = textDecoder.readable.getReader();

  registerSource({
    id: SOURCE_ID,
    label: "Arduino (Web Serial)",
    status: "connecting",
    stop: () => disconnectSerial(),
  });
  updateSourceStatus(SOURCE_ID, "connected");

  let buffer = "";
  (async () => {
    try {
      while (keepReading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        buffer += value;
        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) handleMessage(line);
        }
      }
    } catch (err) {
      console.warn("serial read loop ended:", err);
    } finally {
      try { reader.releaseLock(); } catch (e) {}
      try { await readableStreamClosed; } catch (e) {}
      try { await port.close(); } catch (e) {}
      updateSourceStatus(SOURCE_ID, "disconnected");
    }
  })();

  active = {
    port,
    reader,
    stop: () => { keepReading = false; try { reader.cancel(); } catch (e) {} },
  };
  return active;
}

export function disconnectSerial() {
  if (active) {
    active.stop();
    active = null;
  }
}

function handleMessage(line) {
  if (line.startsWith("HELLO")) return;
  const type = line[0] === "P" ? "press" : line[0] === "R" ? "release" : null;
  if (!type) return;
  const lane = parseInt(line.slice(1), 10);
  if (Number.isNaN(lane)) return;
  emit(lane, type);
}
