/*
  Ukulele Hero — Arduino firmware
  --------------------------------
  Reads 4 arcade-style buttons and emits a simple text protocol over USB Serial
  that the web app consumes via Web Serial or the Node WebSocket bridge.

  Protocol (ASCII, newline-terminated):
    HELLO UKULELE   — on boot, identifies the device
    P0 | P1 | P2 | P3   — button pressed (lane 0..3 = G C E A)
    R0 | R1 | R2 | R3   — button released

  Wiring (default):
    Lane 0 (G) -> D2
    Lane 1 (C) -> D3
    Lane 2 (E) -> D4
    Lane 3 (A) -> D5
    Other leg of each button -> GND

  We use INPUT_PULLUP so buttons are active-LOW. No external resistors needed.

  Baud: 9600 (must match serialSource.js and bridge/server.js).
*/

const uint8_t BUTTON_PINS[4] = {2, 3, 4, 5};
const char LANE_LABELS[4] = {'G', 'C', 'E', 'A'};

const unsigned long DEBOUNCE_MS = 15;

bool stableState[4];      // current debounced state (true = pressed)
bool lastRawState[4];     // last raw reading
unsigned long lastChange[4];

void setup() {
  Serial.begin(9600);
  for (uint8_t i = 0; i < 4; i++) {
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
    stableState[i] = false;
    lastRawState[i] = false;
    lastChange[i] = 0;
  }

  // Give USB a moment, then announce ourselves.
  delay(200);
  Serial.println("HELLO UKULELE");
}

void loop() {
  unsigned long now = millis();

  for (uint8_t i = 0; i < 4; i++) {
    // Active-LOW with INPUT_PULLUP: LOW = pressed.
    bool raw = (digitalRead(BUTTON_PINS[i]) == LOW);

    if (raw != lastRawState[i]) {
      lastRawState[i] = raw;
      lastChange[i] = now;
    }

    if ((now - lastChange[i]) >= DEBOUNCE_MS && raw != stableState[i]) {
      stableState[i] = raw;
      Serial.print(raw ? 'P' : 'R');
      Serial.println((int)i);
    }
  }
}
