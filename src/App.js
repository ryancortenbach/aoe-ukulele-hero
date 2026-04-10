import { useEffect, useState } from "react";
import Menu from "./components/Menu";
import Game from "./components/Game";
import Results from "./components/Results";
import ControllerStatus from "./components/ControllerStatus";
import { startKeyboardSource } from "./input/keyboardSource";

// Top-level state machine: menu → game → results → menu.
export default function App() {
  const [screen, setScreen] = useState("menu");
  const [song, setSong] = useState(null);
  const [stats, setStats] = useState(null);

  // Boot the keyboard input source once. Serial/WS are opt-in from UI.
  useEffect(() => { startKeyboardSource(); }, []);

  return (
    <>
      {screen === "menu" && (
        <Menu
          onStart={(s) => { setSong(s); setScreen("game"); }}
        />
      )}
      {screen === "game" && song && (
        <Game
          song={song}
          onFinish={(finalStats) => { setStats(finalStats); setScreen("results"); }}
          onExit={() => setScreen("menu")}
        />
      )}
      {screen === "results" && song && stats && (
        <Results
          song={song}
          stats={stats}
          onReplay={() => setScreen("game")}
          onMenu={() => setScreen("menu")}
        />
      )}

      {/* Global controller status overlay — always visible */}
      <ControllerStatus />
    </>
  );
}
