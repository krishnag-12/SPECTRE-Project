// =============================================================================
// S.P.E.C.T.R.E. — 4x4 Button Matrix Keypad Driver
// Replaces individual push buttons with a scanned matrix input.
// =============================================================================
#ifndef KEYPAD_MATRIX_H
#define KEYPAD_MATRIX_H

#include <Arduino.h>

// =============================================================================
// 4x4 Button Matrix — GPIO Wiring
// =============================================================================
//
// PCB Labels   ESP32 GPIO   Direction
// ----------   ----------   ---------
// R1           GPIO 32      OUTPUT (active-LOW row scan)
// R2           GPIO 33      OUTPUT
// R3           GPIO 25      OUTPUT
// R4           GPIO  4      OUTPUT
// C1           GPIO 16      INPUT_PULLUP (column read)
// C2           GPIO 17      INPUT_PULLUP
// C3           GPIO 13      INPUT_PULLUP
// C4           GPIO 27      INPUT_PULLUP
//
// Key Mapping (S1–S16):
// ─────────────────────────────────────────────────
//          C1(16)   C2(17)   C3(13)   C4(27)
// R1(32)   S1=UP    S2=DOWN  S3=SEL   S4=TQM1
// R2(33)   S5=TQM2  S6=TQM3  S7=TQM4  S8=TQM5
// R3(25)   S9=TQM6  S10=TQM7 S11=TQM8 S12=TQM9
// R4( 4)   S13=RSV  S14=RSV  S15=RSV  S16=RSV
// ─────────────────────────────────────────────────
//
// Scanning method:
//   All rows HIGH (idle). Drive one row LOW at a time and read columns.
//   A pressed key connects the LOW row to the column, pulling it LOW.
//   Internal pull-ups on column GPIOs keep unpressed columns HIGH.
//
// Debouncing:
//   A key must be stable for DEBOUNCE_MS consecutive scans to register.
//   Once registered, it is blocked from re-triggering until released
//   and stable for DEBOUNCE_MS again (single-shot per press).
// =============================================================================

// --- Row GPIOs (active-LOW outputs) ---
#define MATRIX_ROW_COUNT 4
static const int MATRIX_ROW_PINS[MATRIX_ROW_COUNT] = { 32, 33, 25, 4 };

// --- Column GPIOs (INPUT_PULLUP reads) ---
#define MATRIX_COL_COUNT 4
static const int MATRIX_COL_PINS[MATRIX_COL_COUNT] = { 16, 17, 13, 27 };

// --- Debounce timing ---
#define MATRIX_DEBOUNCE_MS  50   // Minimum stable time before accepting press
#define MATRIX_SCAN_INTERVAL_MS 5 // Scan every 5ms in the main loop

// --- Logical key identifiers ---
// Derived from the physical S1–S16 positions (row-major order).
enum MatrixKey : uint8_t {
    KEY_NONE      = 0,

    // Row 1: Navigation
    KEY_UP        = 1,   // S1
    KEY_DOWN      = 2,   // S2
    KEY_SELECT    = 3,   // S3
    KEY_TQM1      = 4,   // S4  — CONTACT

    // Row 2: Tactical Quick Messages 2–5
    KEY_TQM2      = 5,   // S5  — SATHI GHAYAL
    KEY_TQM3      = 6,   // S6  — MAYDAY
    KEY_TQM4      = 7,   // S7  — LZ CLEAR
    KEY_TQM5      = 8,   // S8  — LZ HOT

    // Row 3: Tactical Quick Messages 6–9
    KEY_TQM6      = 9,   // S9  — TGT SPOTTED
    KEY_TQM7      = 10,  // S10 — SITREP
    KEY_TQM8      = 11,  // S11 — WILCO
    KEY_TQM9      = 12,  // S12 — OUT

    // Row 4: Reserved
    KEY_RSV13     = 13,  // S13 — RESERVED
    KEY_RSV14     = 14,  // S14 — RESERVED
    KEY_RSV15     = 15,  // S15 — RESERVED
    KEY_RSV16     = 16,  // S16 — RESERVED
};

// Row-major lookup table: keyMap[row][col] → MatrixKey
static const MatrixKey MATRIX_KEY_MAP[MATRIX_ROW_COUNT][MATRIX_COL_COUNT] = {
    { KEY_UP,    KEY_DOWN,  KEY_SELECT, KEY_TQM1  },  // R1
    { KEY_TQM2,  KEY_TQM3,  KEY_TQM4,   KEY_TQM5  },  // R2
    { KEY_TQM6,  KEY_TQM7,  KEY_TQM8,   KEY_TQM9  },  // R3
    { KEY_RSV13, KEY_RSV14, KEY_RSV15,  KEY_RSV16 },  // R4
};

// =============================================================================
// Internal state — per-key debounce tracking
// =============================================================================

static uint32_t _matrixLastScanMs = 0;

// Per-key state for debouncing
struct _KeyState {
    bool     rawPressed;      // Current raw reading
    bool     debouncedPressed; // Debounced state (true = held)
    bool     eventFired;      // True after press event has been dispatched
    uint32_t stableStartMs;   // millis() when current raw state began
};

static _KeyState _keyStates[MATRIX_ROW_COUNT * MATRIX_COL_COUNT];

// =============================================================================
// matrixInit() — Call once in setup()
// =============================================================================
static void matrixInit() {
    // Configure row pins as outputs, idle HIGH
    for (int r = 0; r < MATRIX_ROW_COUNT; r++) {
        pinMode(MATRIX_ROW_PINS[r], OUTPUT);
        digitalWrite(MATRIX_ROW_PINS[r], HIGH);
    }

    // Configure column pins as inputs with internal pull-up
    for (int c = 0; c < MATRIX_COL_COUNT; c++) {
        pinMode(MATRIX_COL_PINS[c], INPUT_PULLUP);
    }

    // Clear key states
    memset(_keyStates, 0, sizeof(_keyStates));
}

// =============================================================================
// matrixScan() — Call from loop(). Returns the key that was just pressed
//                (single-shot: one event per physical press).
//                Returns KEY_NONE if no new press detected.
//                Non-blocking; respects MATRIX_SCAN_INTERVAL_MS pacing.
// =============================================================================
static MatrixKey matrixScan() {
    uint32_t now = millis();
    if (now - _matrixLastScanMs < MATRIX_SCAN_INTERVAL_MS) {
        return KEY_NONE;
    }
    _matrixLastScanMs = now;

    MatrixKey pressedKey = KEY_NONE;

    for (int r = 0; r < MATRIX_ROW_COUNT; r++) {
        // Drive this row LOW
        digitalWrite(MATRIX_ROW_PINS[r], LOW);

        // Brief settling delay for GPIO state propagation
        delayMicroseconds(10);

        for (int c = 0; c < MATRIX_COL_COUNT; c++) {
            int idx = r * MATRIX_COL_COUNT + c;
            bool isPressed = (digitalRead(MATRIX_COL_PINS[c]) == LOW);

            _KeyState& ks = _keyStates[idx];

            // Detect raw state change → reset debounce timer
            if (isPressed != ks.rawPressed) {
                ks.rawPressed = isPressed;
                ks.stableStartMs = now;
            }

            // Check if stable long enough for debounce
            if ((now - ks.stableStartMs) >= MATRIX_DEBOUNCE_MS) {
                if (isPressed && !ks.debouncedPressed) {
                    // Transition: released → pressed (debounced)
                    ks.debouncedPressed = true;
                    ks.eventFired = false;
                } else if (!isPressed && ks.debouncedPressed) {
                    // Transition: pressed → released (debounced)
                    ks.debouncedPressed = false;
                    ks.eventFired = false;
                }
            }

            // Fire single-shot press event
            if (ks.debouncedPressed && !ks.eventFired) {
                ks.eventFired = true;
                if (pressedKey == KEY_NONE) {
                    pressedKey = MATRIX_KEY_MAP[r][c];
                }
            }
        }

        // Return row to idle HIGH
        digitalWrite(MATRIX_ROW_PINS[r], HIGH);
    }

    return pressedKey;
}

// =============================================================================
// Helper: Convert MatrixKey to Tactical Quick Message line number (1-9).
// Returns 0 if the key is not a TQM key.
// =============================================================================
static inline uint8_t matrixKeyToTacLine(MatrixKey key) {
    if (key >= KEY_TQM1 && key <= KEY_TQM9) {
        return (uint8_t)(key - KEY_TQM1 + 1);
    }
    return 0;
}

#endif // KEYPAD_MATRIX_H
