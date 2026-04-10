/*
  Ukulele Hero — Serial → WebSocket bridge
  ----------------------------------------
  Use this when the browser can't talk to the Arduino directly
  (Safari / Firefox / mobile / locked-down Chromebooks).

  Usage:
    npm install
    node server.js                        # auto-detect port
    node server.js /dev/tty.usbmodem1101  # explicit port
    PORT=8765 BAUD=9600 node server.js

  Protocol: whatever the Arduino sends (lines like "P0", "R2") is forwarded
  verbatim to every connected WebSocket client.
*/

const { SerialPort, ReadlineParser } = require("serialport");
const { WebSocketServer } = require("ws");

const WS_PORT = parseInt(process.env.PORT || "8765", 10);
const BAUD = parseInt(process.env.BAUD || "9600", 10);

async function pickSerialPath() {
  if (process.argv[2]) return process.argv[2];
  const ports = await SerialPort.list();
  // Prefer entries that look like an Arduino / USB-serial adapter.
  const likely = ports.find((p) =>
    /usb|arduino|wch|ch340|cp210|usbmodem|usbserial/i.test(
      `${p.path} ${p.manufacturer || ""} ${p.productId || ""}`
    )
  );
  return (likely || ports[0])?.path;
}

async function main() {
  const path = await pickSerialPath();
  if (!path) {
    console.error("No serial port found. Plug in the Arduino or pass a path:");
    console.error("  node server.js /dev/tty.usbmodem1101");
    process.exit(1);
  }
  console.log(`[bridge] opening serial ${path} @ ${BAUD}`);

  const serial = new SerialPort({ path, baudRate: BAUD });
  const parser = serial.pipe(new ReadlineParser({ delimiter: "\n" }));

  serial.on("error", (err) => console.error("[serial] error:", err.message));
  serial.on("close", () => {
    console.warn("[serial] closed. Exiting.");
    process.exit(1);
  });

  const wss = new WebSocketServer({ port: WS_PORT });
  console.log(`[bridge] websocket listening on ws://localhost:${WS_PORT}`);

  wss.on("connection", (ws) => {
    console.log("[bridge] client connected");
    ws.send("HELLO UKULELE");
    ws.on("close", () => console.log("[bridge] client disconnected"));
  });

  parser.on("data", (raw) => {
    const line = String(raw).trim();
    if (!line) return;
    // Log presses for sanity checks, skip handshake spam.
    if (!line.startsWith("HELLO")) console.log("[serial]", line);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(line);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
