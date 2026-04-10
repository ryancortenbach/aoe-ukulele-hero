# Ukulele Hero — Hardware & EE Guide

Full electrical and firmware reference for turning Ukulele Hero into an IRL
arcade cabinet. Four physical buttons → Arduino → USB → browser.

- [Architecture](#architecture)
- [Bill of materials](#bill-of-materials)
- [Circuit](#circuit)
- [Breadboard layout](#breadboard-layout)
- [Wiring table](#wiring-table)
- [Debouncing strategy](#debouncing-strategy)
- [Firmware](#firmware)
- [Serial protocol](#serial-protocol)
- [Connecting to the web app](#connecting-to-the-web-app)
- [Latency budget](#latency-budget)
- [Power](#power)
- [Enclosure notes](#enclosure-notes)
- [Extensions](#extensions)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
  ┌──────────────┐         ┌─────────────────┐           ┌───────────────┐
  │ 4× arcade    │         │   Arduino       │  USB CDC  │  React app    │
  │ buttons      │──INPUT──▶  (ATmega328P/   │──Serial──▶│  (browser)    │
  │ (momentary)  │  PULLUP │   32u4/SAMD)    │   9600bd  │  inputManager │
  └──────────────┘         └─────────────────┘           └───────────────┘
                                     │
                        (fallback)   │
                                     ▼
                             ┌────────────────┐   ws://   ┌───────────────┐
                             │  Node bridge   │──────────▶│  React app    │
                             │  (serialport)  │   :8765   │  inputManager │
                             └────────────────┘           └───────────────┘
```

Two paths get button events into the game:

1. **Direct Web Serial** — Chrome/Edge read the Arduino's USB CDC stream
   directly via `navigator.serial`. No extra process. Preferred.
2. **Node bridge** — a ~60-line `serialport`→`ws` relay for browsers
   without Web Serial (Safari, Firefox, mobile). Identical protocol.

Both feed the same normalized event onto the app's input bus
(`src/input/inputManager.js`):

```js
{ lane: 0|1|2|3, type: 'press' | 'release', t: performance.now() }
```

Keyboard, touch, Arduino, and bridge all push into this bus. The game
logic never knows which device produced an event.

---

## Bill of materials

Minimal working rig. Substitute freely — nothing here is exotic.

| Qty | Part                                      | Notes                                           |
| --- | ----------------------------------------- | ----------------------------------------------- |
| 1   | Arduino Uno / Nano / Pro Micro / Leonardo | Any 5 V board with USB serial works             |
| 4   | Momentary SPST push button                | 24 mm or 30 mm arcade buttons recommended       |
| 4   | 6" jumper wires, M–M                      | Or solid-core 22 AWG if soldering               |
| 1   | Breadboard (half-size min)                | Skip if soldering to a protoboard               |
| 1   | USB cable (A→B / A→Micro-B / A→C)         | Matches your Arduino                            |
| —   | Hook-up wire (22 AWG)                     | For longer runs from panel buttons to the board |

**Optional but recommended:**

| Qty | Part                                 | Notes                                                         |
| --- | ------------------------------------ | ------------------------------------------------------------- |
| 4   | 0.1 µF ceramic caps                  | Hardware debounce, button leg → GND (see [Debouncing](#debouncing-strategy)) |
| 4   | 10 kΩ resistors                      | Only if you prefer external pull-ups over `INPUT_PULLUP`      |
| 4   | 5 mm LEDs + 330 Ω resistors          | Per-lane press indicators — one on each D9–D12                |
| 1   | Piezo buzzer                         | Diagnostic beeper on `HELLO UKULELE` boot                     |
| 1   | 3D-printed / laser-cut faceplate     | For the ukulele-shaped enclosure                              |

**Why arcade buttons over tactile?** Travel + force profile matches a
strum motion, and microswitches are rated for ~10 M presses. Tactile
dome switches feel bad for rhythm play and die faster.

---

## Circuit

Each button is wired **active-LOW** with the Arduino's internal
pull-up resistor. No external resistor needed.

```
        +5V (internal)
           │
           │  (INPUT_PULLUP enables this internally)
           │
 Arduino ──┤
 pin Dn    │
           ├──────┐
           │      │
           │     [ ] Button (momentary SPST)
           │      │
           │      │
           └──────┴──── GND
```

When the button is **open** (not pressed), the pin reads HIGH through
the ~20 kΩ internal pull-up. When **closed** (pressed), the pin is
shorted directly to GND → reads LOW. The firmware inverts this so
`LOW == pressed` internally.

**Full circuit for 4 buttons (default pins D2–D5):**

```
                               Arduino
                         ┌───────────────────┐
                         │               D2 ─┼─────┐
                         │               D3 ─┼─┐   │
                         │               D4 ─┼┐│   │
                         │               D5 ─┼││   │
                         │                   ││◦   │
                         │              GND ─┼┴┘   │
                         │                   │     │
                         │         USB ──────┼── to computer
                         └───────────────────┘
                                             │
       ┌───────────────┐ ┌───────────────┐   │
       │  Button G (0) │ │  Button C (1) │   │
       │      ┌──┐     │ │      ┌──┐     │   │
       │      │  │     │ │      │  │     │   │
       │   ───┴──┴───  │ │   ───┴──┴───  │   │
       │  │         │  │ │  │         │  │   │
       │  │         │  │ │  │         │  │   │
       │  D2       GND │ │  D3       GND │   │
       └──┬──────────┬─┘ └──┬──────────┬─┘   │
          │          │      │          │     │
          └──────────┼──────┼──────────┴─────┤ GND rail
                     │      │                │
       ┌───────────────┐ ┌───────────────┐   │
       │  Button E (2) │ │  Button A (3) │   │
       │      ┌──┐     │ │      ┌──┐     │   │
       │   ───┴──┴───  │ │   ───┴──┴───  │   │
       │  │         │  │ │  │         │  │   │
       │  D4       GND │ │  D5       GND │   │
       └──┬──────────┬─┘ └──┬──────────┬─┘   │
          │          │      │          │     │
          │          └──────┼──────────┴─────┘
          │                 │
```

All four GND legs tie to the same Arduino GND rail. You only need one
GND wire back to the Arduino — daisy-chain the rest on the breadboard
ground rail.

---

## Breadboard layout

Half-size breadboard, Arduino Uno beside it. `+` rail unused, `-` rail
is the shared ground bus.

```
        a b c d e   f g h i j
      ┌─────────────────────────┐
   1  │             │           │
   2  │ D2──●       │           │    <- Button 0 (G / pink)
   3  │   [PB]──────┼──────●    │
   4  │             │      │    │
   5  │ D3──●       │      │    │    <- Button 1 (C / yellow)
   6  │   [PB]──────┼──────●    │
   7  │             │      │    │
   8  │ D4──●       │      │    │    <- Button 2 (E / cyan)
   9  │   [PB]──────┼──────●    │
  10  │             │      │    │
  11  │ D5──●       │      │    │    <- Button 3 (A / blue)
  12  │   [PB]──────┼──────●    │
  13  │             │      │    │
  14  │ GND─────────┼──────●    │    <- common ground rail
      └─────────────────────────┘
         +  -                +  -
```

`[PB]` = arcade push button spanning the center gap. One terminal to
the Arduino digital pin, the other to the ground rail.

---

## Wiring table

Default (edit `BUTTON_PINS[]` in the `.ino` if you need other pins):

| Lane | String | Color  | Arduino pin | Other button leg |
| ---- | ------ | ------ | ----------- | ---------------- |
| 0    | G      | Pink   | D2          | GND              |
| 1    | C      | Yellow | D3          | GND              |
| 2    | E      | Cyan   | D4          | GND              |
| 3    | A      | Blue   | D5          | GND              |

**Why D2–D5?** Lowest free digital pins on the Uno (D0/D1 are USB
serial and get corrupted if you wire inputs there). On the Pro Micro /
Leonardo you can use D2–D5 identically; if you want interrupts, D0, D1,
D2, D3, D7 are the INT-capable pins.

---

## Debouncing strategy

Mechanical buttons bounce for 1–10 ms when pressed or released — the
contact physically chatters before settling. Without debouncing, one
strum registers as 3–20 press events and the game freaks out.

We debounce in **two layers**:

### 1. Software (required)

`UkuleleHero.ino` implements a simple time-hysteresis debouncer:

```c
const unsigned long DEBOUNCE_MS = 15;
// On any raw change, record the time. Only accept a new stable state
// once DEBOUNCE_MS has elapsed with the raw reading unchanged.
```

15 ms is a sweet spot:
- Faster than any human can double-strum a single button
- Slower than the bounce envelope on any button under ~$5
- Adds at most 15 ms to press latency (invisible at 60 Hz)

### 2. Hardware (optional but very nice)

Adding a **0.1 µF ceramic cap** across each button (button pin → GND)
smooths the bounce electrically. Combined with the 15 ms software
window, this is bulletproof even for cheap clicky switches.

```
   Dn ──┬──────┐
        │      │
        │     [Btn]
        │      │
       === 0.1µF
        │      │
        └──────┴── GND
```

The cap charges through the pull-up and discharges through the closed
switch, so transitions become smooth RC curves. Software still sees a
clean HIGH→LOW transition.

Do not add a series resistor in line with the button — it forms a
voltage divider against the pull-up and can leave the pin reading HIGH
even when pressed.

---

## Firmware

File: [`arduino/UkuleleHero/UkuleleHero.ino`](arduino/UkuleleHero/UkuleleHero.ino)

**Behavior:**
1. On boot, set D2–D5 to `INPUT_PULLUP`, open Serial at 9600 baud,
   print `HELLO UKULELE`.
2. Main loop: read each button, debounce, and emit a single line per
   state change — `P0`..`P3` on press, `R0`..`R3` on release.

**State variables per lane:**
- `stableState[i]` — current debounced state (true = pressed)
- `lastRawState[i]` — last raw `digitalRead`
- `lastChange[i]` — millis timestamp of last raw transition

The loop is non-blocking: no `delay()`, no interrupts, just a scan
across the 4 pins each iteration. Loop rate on a stock Uno with this
sketch is comfortably >10 kHz — debounce resolution is limited by
`millis()` (1 ms), not the loop speed.

**Editing pins:**

```c
const uint8_t BUTTON_PINS[4] = {2, 3, 4, 5};
```

**Tightening/loosening debounce:**

```c
const unsigned long DEBOUNCE_MS = 15;  // raise to 25 for cheap tact switches
```

### Flashing

**Arduino IDE:**
1. Open `hardware/arduino/UkuleleHero/UkuleleHero.ino`
2. Tools → Board → *your board*
3. Tools → Port → the `/dev/tty.usbmodem*` or `COM*` that appears when
   the Arduino is plugged in
4. Sketch → Upload (⌘U / Ctrl-U)
5. Tools → Serial Monitor, set baud to **9600**. You should see
   `HELLO UKULELE` followed by `P0`, `R0`, etc. as you press buttons.

**arduino-cli:**

```bash
arduino-cli core install arduino:avr                    # Uno/Nano
arduino-cli compile --fqbn arduino:avr:uno hardware/arduino/UkuleleHero
arduino-cli upload -p /dev/tty.usbmodem1101 --fqbn arduino:avr:uno hardware/arduino/UkuleleHero
arduino-cli monitor -p /dev/tty.usbmodem1101 -c baudrate=9600
```

---

## Serial protocol

ASCII, newline-terminated (`\n`), 9600 baud 8N1. One message per line.

| Message                   | Direction     | Meaning                                   |
| ------------------------- | ------------- | ----------------------------------------- |
| `HELLO UKULELE`           | device → host | Sent once on Arduino boot (optional)      |
| `P0` / `P1` / `P2` / `P3` | device → host | Button **pressed** on lane 0..3           |
| `R0` / `R1` / `R2` / `R3` | device → host | Button **released** on lane 0..3          |

Lane ↔ string mapping:

| Lane | String | Color  |
| ---- | ------ | ------ |
| 0    | G      | Pink   |
| 1    | C      | Yellow |
| 2    | E      | Cyan   |
| 3    | A      | Blue   |

**Forward compatibility:** both `serialSource.js` and the bridge ignore
unknown lines. Feel free to add diagnostic prints like `# loop=12345`
without breaking the app.

**Host → device** (reserved, not implemented yet): future versions may
accept `L0`/`L1` / … for LED lane-light commands back to the Arduino.
See [Extensions](#extensions).

---

## Connecting to the web app

### Option A — Web Serial (Chrome/Edge/Brave)

1. `npm start` from the repo root.
2. Open `http://localhost:3000` in Chrome/Edge/Brave.
3. Click the **`KEYBOARD`** pill in the top-left corner.
4. Click **Connect Arduino**.
5. Browser prompts you to pick a serial device → pick the one labeled
   with your Arduino's USB VID/PID (e.g. `Arduino Uno`, `USB Serial`,
   `Leonardo`).
6. The pill turns cyan and reads **`CONTROLLER`**. Done. Strumming
   physical buttons now drives the game.

> Web Serial requires a secure context. `localhost` counts as secure,
> so dev mode works out of the box. For a deployed build you need
> HTTPS.

### Option B — Node bridge (any browser)

Use this if:
- You're on Safari or Firefox (no Web Serial)
- You're on iPad / mobile and want to point it at a Mac running the
  bridge
- You want multiple browsers to share one Arduino (kiosk mode)

```bash
cd hardware/bridge
npm install               # first time only
node server.js            # auto-detect USB port
# or explicit path:
node server.js /dev/tty.usbmodem1101
# or custom port/baud:
PORT=8765 BAUD=9600 node server.js
```

The bridge opens the serial port, streams lines to all connected
WebSocket clients at `ws://localhost:8765`.

Then in the app's controller panel (top-left pill), click
**Connect Bridge**.

To list serial ports the system can see:

```bash
cd hardware/bridge && npm run list-ports
```

### Option C — both at once

Not supported. Web Serial holds an exclusive lock on the port; the
bridge will fail to open it. Pick one path per session.

---

## Latency budget

Target: sub-50 ms end-to-end (one 60 Hz frame ≈ 16.7 ms).

| Stage                                  | Typical       |
| -------------------------------------- | ------------- |
| Mechanical button close → pin LOW      | <1 ms         |
| Firmware debounce window               | 15 ms         |
| Serial write (9600 bd, 3 bytes)        | ~3 ms         |
| macOS USB CDC → browser Web Serial     | 2–6 ms        |
| inputManager → game loop               | <1 ms         |
| Next `requestAnimationFrame` paint     | 0–16 ms       |
| **Total press → visible glow**         | **~20–40 ms** |

The debounce window dominates. If you add hardware caps (0.1 µF) you
can safely lower `DEBOUNCE_MS` to 5 ms for a meaningful latency win.

**Calibration:** not implemented yet. A calibration screen that
auto-measures the round trip (flash a lane, wait for the first press,
average over N trials) is on the roadmap.

---

## Power

The Arduino is powered entirely by USB from the host computer. Current
draw is trivial (~40 mA with all buttons open, ~60 mA with all pressed
via the pull-ups). No external power supply needed.

**If you add LEDs (per-lane indicators):**
- 5 mm LED at 20 mA × 4 lanes = 80 mA extra
- Still well within the 500 mA USB port budget
- Use a 330 Ω series resistor per LED from a digital pin to GND

**If you add a servo / motor / anything over 200 mA:** drive it from an
external 5 V supply with a common ground, not from the Arduino's 5V
pin.

---

## Enclosure notes

The stretch goal is a 3D-printed or laser-cut ukulele-shaped faceplate
with the 4 arcade buttons arranged vertically where the sound hole
would be, matching the on-screen lane order (G/C/E/A top to bottom).

**Ergonomic constraints:**
- Button spacing: 35–45 mm center-to-center (comfortable for one hand)
- Recess the button housing so only the cap sits above the faceplate
- Strain-relieve the USB cable exit
- Keep the Arduino centered under the body for weight balance

**Mounting the Arduino:**
- M3 standoffs through the Uno's mounting holes
- Or a snap-fit TPU clip printed into the backplate

**Cable management:**
- Twisted pairs (signal + ground) per button reduce EMI on long runs
- Keep button wires under 500 mm or you may need to lower `BAUD` and
  add bigger caps

---

## Extensions

Future hardware ideas — none currently implemented, but the event-bus
architecture means they're ~1 file of firmware + 0 changes to the app.

### Strum bar (Guitar-Hero style)

Add a 5th button as a "strum bar". Modify the sketch so:
- Holding a fret button alone emits nothing
- Pressing the strum bar while a fret is held emits the
  corresponding `Pn`/`Rn` event for that lane
- Pressing the strum bar with no fret held emits nothing (or a miss
  event)

```c
bool fretHeld[4];
// on strum edge:
for (int i = 0; i < 4; i++) {
  if (fretHeld[i]) { Serial.print('P'); Serial.println(i); }
}
```

### Whammy (pitch-bend analog input)

Wire a 10 kΩ potentiometer to A0. Every ~20 ms, emit `W<0..1023>`.
Extend `serialSource.js` to parse `W` and forward it as a
`{ type: 'whammy', value }` event. Use it to modulate visual effects
or future audio.

### Lane LEDs

Drive 4 LEDs from D9–D12 (or a WS2812 strip from one data pin). The
host→device protocol is currently undefined — reserve `L0 <brightness>`
/ `L1 <brightness>` for future use.

With WS2812s you can light the lanes by color in sync with hits, on
misses, and during combo milestones. One 4-pixel strip + one 470 Ω
series resistor on the data line.

### Accelerometer "strum"

MPU6050 on I²C. Emit a `P`/`R` pulse for the focused lane when Y-axis
acceleration crosses a threshold. Lets you strum the whole thing like
a real uke instead of mashing buttons.

### Vibration feedback

Small ERM motor wired through a 2N2222 transistor + flyback diode on a
PWM pin. Pulse on successful hits, buzz on misses. Transparent to the
game — fires from the Arduino side based on the host → device LED
protocol once that's defined.

---

## Troubleshooting

**App shows `KEYBOARD`, never turns into `CONTROLLER`:**
- You're not on Chrome/Edge/Brave → use Option B (bridge), or switch
  browser.
- You clicked Connect but didn't pick a device in the prompt.
- The Arduino IDE's Serial Monitor is open. Close it — it holds an
  exclusive lock on the port.

**Browser prompt is empty / "No compatible devices found":**
- Bad USB cable (charge-only cables are common and silent killers —
  try a different cable).
- Driver missing for CH340/CH341 clone boards on macOS: install the
  `wch.cn` CH34x driver.
- Arduino isn't flashed yet. Flash `UkuleleHero.ino` first.

**`HELLO UKULELE` never shows in the Serial Monitor:**
- Baud mismatch. Must be 9600 in both Monitor and sketch.
- Wrong board selected in Tools → Board.
- `Serial.begin()` missing → reflash.

**Buttons register multiple presses per strum (bounce):**
- Raise `DEBOUNCE_MS` to 25 in the sketch.
- Add a 0.1 µF ceramic cap button-leg → GND.
- Check for cold solder joints if you wired arcade buttons via flying
  leads.

**One button always reads pressed:**
- That pin is shorted to GND outside the switch (wiring error) or
  you forgot `INPUT_PULLUP` and left the pin floating.

**All four buttons behave like lane 0:**
- You wired all buttons to the same Arduino pin. Each lane needs its
  own pin.

**Bridge says "No serial port found":**
- Unplug/replug the Arduino, then rerun `node server.js`.
- Pass the path explicitly: `node server.js /dev/tty.usbmodem1101`.
- `npm run list-ports` to see what the system actually sees.

**Latency feels bad:**
- Close other browser tabs running heavy JS.
- Disable browser extensions that hook USB (uncommon but possible).
- Lower `DEBOUNCE_MS` (add hardware caps first).
- On long cable runs, drop to 4800 baud and widen debounce.

**Game loop pauses when I click the on-screen buttons:**
- That's a browser tab-backgrounding issue (`requestAnimationFrame`
  throttles). Keep the game tab in the foreground during play.

---

## File map

```
hardware/
├── arduino/
│   └── UkuleleHero/
│       └── UkuleleHero.ino      ← 4-button debounced firmware (~60 LOC)
├── bridge/
│   ├── server.js                ← serial → websocket relay (~60 LOC)
│   └── package.json
└── README.md                    ← this file
```

Software counterparts on the app side:

```
src/input/
├── inputManager.js              ← central event bus
├── keyboardSource.js            ← A/S/D/F
├── serialSource.js              ← Web Serial (Option A)
└── websocketSource.js           ← WebSocket client (Option B)
```

The seam between hardware and software is `inputManager.emit(lane, type)`.
Any new input device — Arduino, MIDI pedal, gamepad, capacitive sensor
— is one file in `src/input/` that calls that function. Zero changes
to the game loop, rendering, scoring, or chart format.
