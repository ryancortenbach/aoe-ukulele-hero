# Ukulele Hero

A Guitar-Hero-style rhythm game for ukulele, built in React. Ships with a
hardware input framework so you can play it on a keyboard, on screen, or
via an Arduino with 4 real buttons.

## Quick start

```bash
npm install
npm start
```

Then open http://localhost:3000.

Play with **A S D F** (G/C/E/A strings), tap on mobile, or hook up an
Arduino — see [`hardware/README.md`](hardware/README.md).

## Architecture

```
src/
├── App.js                    # state machine: menu → game → results
├── theme.js                  # design tokens + gameplay constants
├── songs.js                  # sample song charts
├── index.css                 # global reset + keyframes
├── components/
│   ├── Menu.jsx              # title screen, song select
│   ├── Game.jsx              # scrolling highway, game loop, hit detection
│   ├── Hud.jsx               # score, combo, multiplier, progress bar
│   ├── Countdown.jsx         # 3-2-1-GO
│   ├── Results.jsx           # end screen with grade, stats
│   └── ControllerStatus.jsx  # input-source overlay + Connect Arduino
└── input/
    ├── inputManager.js       # central event bus (hw-agnostic)
    ├── keyboardSource.js     # A/S/D/F
    ├── serialSource.js       # Web Serial → Arduino (Chrome/Edge)
    └── websocketSource.js    # ws:// fallback (any browser + Node bridge)

hardware/
├── arduino/UkuleleHero/
│   └── UkuleleHero.ino       # firmware, 4 debounced buttons
├── bridge/
│   ├── server.js             # Node serial→websocket bridge
│   └── package.json
└── README.md                 # wiring + flashing + protocol
```

### Input pipeline

All input sources push the same normalized event into a central bus:

```js
{ lane: 0|1|2|3, type: 'press' | 'release', t: performance.now() }
```

The game loop subscribes once. Keyboard, on-screen touch, Web Serial
(Arduino), and WebSocket (bridge) are interchangeable. Adding a new input
source — a MIDI controller, a gamepad, a motion sensor — means writing one
file in `src/input/` that calls `emit(lane, type)`.

### Game loop

`components/Game.jsx` runs a single `requestAnimationFrame` loop. Game state
lives in a ref so the loop doesn't fight React renders; a lightweight
`force` state call ticks React at 60fps for the scroll + score paint.

Timing windows (in `theme.js`):
- Perfect: ±50ms → 100pts
- Good: ±100ms → 50pts
- Miss: beyond that or note passes the hit line → combo reset

Combo multipliers kick in at 10 / 25 / 50 combo (2x / 3x / 4x).

### Songs

Charts are arrays of `{ lane, time }`. `songs.js` ships a helper
`chartFromPattern()` for authoring beat patterns as ASCII:

```
G
-
C
-
GA
-
CE
```

Each row is one rhythmic unit (half-beat by default). To add audio later,
set `song.audioSrc` and play it from `Game.jsx` at `phase === "playing"`.

### Audio playback + clock sync

Songs play through the Web Audio API rather than a bare `<audio>` element.
When `audio/audioEngine.js` can decode a song's file into an `AudioBuffer`
(the common case for uploaded files and same-origin assets), playback runs
through an `AudioBufferSourceNode` scheduled at a deterministic
`ctx.currentTime`. The game-loop clock is anchored to the same
`AudioContext` timeline and subtracts `ctx.outputLatency + ctx.baseLatency`
so the visual scroll lines up with what the player actually hears rather
than with the buffer playhead. Pause/resume rebases that anchor so no
pause-accumulator drift can creep in on this path. An `HTMLAudioElement`
fallback is kept for CORS-restricted remote sources that can't be decoded;
that path uses a slightly larger constant latency pad and tracks pauses via
a `pauseAccumSec` accumulator. See the top-of-file comment block in
`components/Game.jsx` for the full rationale and the
`AUDIO_LATENCY_MS_BUFFER` / `AUDIO_LATENCY_MS_ELEMENT` constants in
`theme.js`.

## Hardware mode

See [`hardware/README.md`](hardware/README.md) for wiring, flashing, and the
two ways to connect (Web Serial or Node bridge). Both paths feed
`src/input/inputManager.js`, which means the game code never has to know
whether an input came from a key, a finger, or a soldered arcade button.

## Roadmap

- [ ] Audio: Web Audio strum tones, then real uke samples
- [ ] More songs + a chart editor
- [ ] Latency calibration screen (auto-offset for hardware round-trip)
- [ ] Sustained notes (hold frets)
- [ ] Chord mode (multi-lane simultaneous hits)
- [ ] Local high scores via localStorage

## References

Projects worth looking at while building this:
- [KozielGPC/piano-hero](https://github.com/KozielGPC/piano-hero) — React+TS falling notes, editor
- [ericcalabrese/guitarHero](https://github.com/ericcalabrese/guitarHero) — CRA React
- [detalhe/GuitarHeroJS](https://github.com/detalhe/GuitarHeroJS) — Three.js 3D fretboard
- [jhedev96/JS-Hero](https://github.com/jhedev96/JS-Hero) — live demo
- [clonehero-game](https://github.com/clonehero-game) — for `.chart` format
