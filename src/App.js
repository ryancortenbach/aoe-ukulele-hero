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
  const [difficulty, setDifficulty] = useState("medium");
  const [stats, setStats] = useState(null);

  useEffect(() => { startKeyboardSource(); }, []);

  return (
    <>
      {screen === "menu" && (
        <Menu
          onStart={(s, d) => {
            setSong(s);
            setDifficulty(d);
            setScreen("game");
          }}
        />
      )}
      {screen === "game" && song && (
        <Game
          song={song}
          difficulty={difficulty}
          onFinish={(finalStats) => { setStats(finalStats); setScreen("results"); }}
          onExit={() => setScreen("menu")}
        />
      )}
      {screen === "results" && song && stats && (
        <Results
          song={song}
          difficulty={difficulty}
          stats={stats}
          onReplay={() => setScreen("game")}
          onMenu={() => setScreen("menu")}
        />
      )}

      <ControllerStatus />
    </>
  );
}
