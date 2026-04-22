import { useEffect, useRef, useState } from "react";
import { subscribeSources } from "../input/inputManager";
import { connectSerial, isSerialSupported, disconnectSerial } from "../input/serialSource";
import { connectWebsocket, disconnectWebsocket } from "../input/websocketSource";
import { FONT_STACK, COLORS } from "../theme";

// Small always-on overlay in the corner showing connected input sources
// and a button to hook up the Arduino (Web Serial) or the WebSocket bridge.
export default function ControllerStatus() {
  const [sources, setSources] = useState([]);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState(null);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const toggleBtnRef = useRef(null);

  useEffect(() => subscribeSources(setSources), []);

  // Click-outside + Escape dismissal while the dropdown is open. Uses
  // a capturing mousedown listener so we catch the event before any
  // inner button handlers run.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Focus management: on open, move focus into the first focusable
  // element inside the panel. On close, return focus to the toggle
  // button so keyboard users are not dropped back at <body>.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const first = panelRef.current?.querySelector(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    } else if (!open && wasOpenRef.current) {
      toggleBtnRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  const serial = sources.find((s) => s.id === "serial");
  const ws = sources.find((s) => s.id === "websocket");
  const keyboard = sources.find((s) => s.id === "keyboard");

  const handleConnectSerial = async () => {
    setErr(null);
    try {
      await connectSerial();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div style={styles.root} ref={rootRef}>
      <button
        ref={toggleBtnRef}
        style={{
          ...styles.pill,
          borderColor: serial || ws ? "#54e4e9" : "#ffffff33",
          color: serial || ws ? "#54e4e9" : "#ffffffaa",
        }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Input source settings"
      >
        <span style={styles.dot(serial || ws ? "#54e4e9" : "#ffffff66")} />
        {serial || ws ? "CONTROLLER" : "KEYBOARD"}
      </button>

      {open && (
        <div style={styles.panel} ref={panelRef}>
          <div style={styles.panelTitle}>INPUT SOURCES</div>

          <SourceRow label="Keyboard" status={keyboard?.status || "off"} />
          <SourceRow label="Arduino (Web Serial)" status={serial?.status || "off"} />
          <SourceRow label="WebSocket Bridge" status={ws?.status || "off"} />

          <div style={styles.actions}>
            {!serial && (
              <button
                style={styles.btn}
                onClick={handleConnectSerial}
                disabled={!isSerialSupported()}
                title={!isSerialSupported() ? "Use Chrome/Edge for Web Serial" : ""}
              >
                Connect Arduino
              </button>
            )}
            {serial && (
              <button style={styles.btnGhost} onClick={disconnectSerial}>
                Disconnect Arduino
              </button>
            )}
            {!ws && (
              <button style={styles.btnGhost} onClick={() => connectWebsocket()}>
                Connect Bridge
              </button>
            )}
            {ws && (
              <button style={styles.btnGhost} onClick={disconnectWebsocket}>
                Stop Bridge
              </button>
            )}
          </div>

          {err && <div style={styles.err}>{err}</div>}
          {!isSerialSupported() && (
            <div style={styles.hint}>
              Web Serial needs Chrome/Edge. Otherwise run the Node bridge in
              <code style={styles.code}> hardware/bridge</code>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceRow({ label, status }) {
  const color =
    status === "connected" ? "#54e4e9" :
    status === "connecting" ? "#ffd95a" :
    status === "error" ? "#ff4d6d" :
    "#ffffff44";
  return (
    <div style={styles.row}>
      <span style={styles.dot(color)} />
      <span>{label}</span>
      <span style={styles.rowStatus}>{status}</span>
    </div>
  );
}

const styles = {
  root: {
    position: "fixed",
    top: 16,
    left: 16,
    zIndex: 2000,
    fontFamily: FONT_STACK,
    color: "#fff",
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.4rem 0.9rem",
    borderRadius: "999px",
    background: "#00000088",
    border: "1px solid #ffffff33",
    cursor: "pointer",
    fontSize: "0.7rem",
    letterSpacing: "0.15em",
    fontFamily: FONT_STACK,
    backdropFilter: "blur(8px)",
  },
  dot: (c) => ({
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: c,
    boxShadow: `0 0 8px ${c}`,
  }),
  panel: {
    marginTop: 8,
    padding: "1rem",
    minWidth: 260,
    background: "#0b0b14ee",
    border: "1px solid #ffffff22",
    borderRadius: 12,
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 40px #000a",
  },
  panelTitle: {
    fontSize: "0.65rem",
    letterSpacing: "0.2em",
    color: COLORS.textMuted,
    marginBottom: "0.6rem",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.8rem",
    padding: "0.25rem 0",
  },
  rowStatus: {
    marginLeft: "auto",
    fontSize: "0.6rem",
    letterSpacing: "0.15em",
    color: COLORS.textMuted,
    textTransform: "uppercase",
  },
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    marginTop: "0.8rem",
  },
  btn: {
    padding: "0.5rem 0.8rem",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #f682f4, #4d9eff)",
    color: "#fff",
    cursor: "pointer",
    fontFamily: FONT_STACK,
    fontSize: "0.75rem",
    letterSpacing: "0.1em",
  },
  btnGhost: {
    padding: "0.5rem 0.8rem",
    borderRadius: 8,
    border: "1px solid #ffffff33",
    background: "transparent",
    color: "#ffffffcc",
    cursor: "pointer",
    fontFamily: FONT_STACK,
    fontSize: "0.75rem",
    letterSpacing: "0.1em",
  },
  err: {
    marginTop: "0.6rem",
    padding: "0.5rem",
    borderRadius: 6,
    background: "#ff4d6d22",
    border: "1px solid #ff4d6d66",
    color: "#ffb3c1",
    fontSize: "0.7rem",
  },
  hint: {
    marginTop: "0.6rem",
    fontSize: "0.65rem",
    color: COLORS.textMuted,
    lineHeight: 1.5,
  },
  code: {
    background: "#ffffff11",
    padding: "1px 5px",
    borderRadius: 4,
    fontFamily: "monospace",
    color: "#fff",
  },
};
