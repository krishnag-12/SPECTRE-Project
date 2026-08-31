// =============================================================================
// S.P.E.C.T.R.E. — 9-Line MEDEVAC Messaging Module
// Indian Military Standard MEDEVAC Request Format
// =============================================================================
#ifndef SPECTRE_MEDEVAC_H
#define SPECTRE_MEDEVAC_H

#include <Arduino.h>

// ---------------------------------------------------------------------------
// 9-Line MEDEVAC Line Definitions (Indian Army / NATO-compatible)
// ---------------------------------------------------------------------------
// Each line corresponds to a structured field in the MEDEVAC request.
// The payload is transmitted as: "MEDEVAC:L<n>:<MODE>:<TARGET>:<data>"
//   - <n>     = line number (1-9)
//   - <MODE>  = B (broadcast) or I (individual)
//   - <TARGET>= target node ID (or "*" for broadcast)
//   - <data>  = the line content
// ---------------------------------------------------------------------------

static const char* MEDEVAC_LINE_LABELS[] = {
    "LOCATION",       // Line 1: Pickup-site grid coordinates
    "COMMS",          // Line 2: Radio frequency, callsign, suffix
    "PATIENTS",       // Line 3: Patients by precedence (U/P/R)
    "SPECIAL EQUIP",  // Line 4: Hoist, ventilator, extraction equip
    "PAT TYPE",       // Line 5: Litter / Ambulatory count
    "SECURITY",       // Line 6: Pickup-site security status
    "MARKING",        // Line 7: Panels, pyro, smoke, etc.
    "NATIONALITY",    // Line 8: Patient nationality & status
    "CBRN/TERRAIN"    // Line 9: CBRN contamination / terrain info
};

// Short labels for OLED display (max 10 chars to fit with "L1:" prefix)
static const char* MEDEVAC_SHORT_LABELS[] = {
    "LOCATION",
    "COMMS",
    "PATIENTS",
    "SPEC EQUIP",
    "PAT TYPE",
    "SECURITY",
    "MARKING",
    "NATIONAL",
    "CBRN/TERR"
};

// Default field data — operational defaults that a soldier can override
// via the MEDEVAC config menu. Kept short to fit MAX_PAYLOAD_LEN.
static char medevacLineData[9][64] = {
    "GRID TBD",              // L1: Location
    "FREQ TBD CALLSIGN TBD", // L2: Comms
    "U:0 P:0 R:0",          // L3: Patients by precedence
    "NONE",                  // L4: Special equipment
    "L:0 A:0",              // L5: Patients by type
    "SECURE",               // L6: Security
    "SMOKE",                // L7: Marking method
    "INDIAN MIL",           // L8: Nationality
    "NO CONTAM"             // L9: CBRN/Terrain
};

// ---------------------------------------------------------------------------
// MEDEVAC Transmission Mode
// ---------------------------------------------------------------------------

enum MedevacTxMode : uint8_t {
    MEDEVAC_TX_BROADCAST  = 0,
    MEDEVAC_TX_INDIVIDUAL = 1
};

static MedevacTxMode medevacMode = MEDEVAC_TX_BROADCAST;
static char medevacTargetNode[16] = "*"; // "*" = broadcast, else node ID

// ---------------------------------------------------------------------------
// GPIO Pin Definitions for 9 MEDEVAC Buttons
// ---------------------------------------------------------------------------
// These GPIOs are chosen from the ESP32-WROOM-32 available pins that do
// NOT conflict with existing SPI (5,18,19,23), I2C (21,22), LoRa IRQ
// (26,35), LoRa RST (14), or nav buttons (25,32,33).
//
// Available safe GPIOs: 2, 4, 12, 13, 15, 16, 17, 27, 34
// GPIO 34 is input-only (no pull-up) — usable with external pull-up.
// GPIO 12 affects boot (strapping pin) — use with caution.
// GPIO 2 has onboard LED — acceptable for button use.
//
// Mapping: 9 dedicated buttons for Line 1–9
// ---------------------------------------------------------------------------

#define MEDEVAC_BTN_L1_PIN   4   // Line 1: Location
#define MEDEVAC_BTN_L2_PIN   16  // Line 2: Comms
#define MEDEVAC_BTN_L3_PIN   17  // Line 3: Patients by precedence
#define MEDEVAC_BTN_L4_PIN   13  // Line 4: Special equipment
#define MEDEVAC_BTN_L5_PIN   12  // Line 5: Patients by type
#define MEDEVAC_BTN_L6_PIN   27  // Line 6: Security
#define MEDEVAC_BTN_L7_PIN   2   // Line 7: Marking method
#define MEDEVAC_BTN_L8_PIN   15  // Line 8: Nationality
#define MEDEVAC_BTN_L9_PIN   34  // Line 9: CBRN/Terrain (input-only, ext pull-up)

static const int MEDEVAC_BTN_PINS[9] = {
    MEDEVAC_BTN_L1_PIN, MEDEVAC_BTN_L2_PIN, MEDEVAC_BTN_L3_PIN,
    MEDEVAC_BTN_L4_PIN, MEDEVAC_BTN_L5_PIN, MEDEVAC_BTN_L6_PIN,
    MEDEVAC_BTN_L7_PIN, MEDEVAC_BTN_L8_PIN, MEDEVAC_BTN_L9_PIN
};

// Message ID range for MEDEVAC lines: 0xD1–0xD9 (Line 1–9)
// This avoids collision with existing message IDs:
//   0x01-0x04 = tactical messages, 0x90 = PING, 0x92 = ZERO,
//   0xAB = data magic, 0xAC = key exchange magic,
//   0xFD = key exchange notification, 0xFE = key exchange TX, 0xFF = error
#define MEDEVAC_MSG_ID_BASE  0xD0  // Line N → messageID = 0xD0 + N

// ---------------------------------------------------------------------------
// Build the MEDEVAC payload string.
// Format: "MEDEVAC:L<n>:<B|I>:<target>:<data>"
// Returns the number of bytes written (excluding null terminator).
// ---------------------------------------------------------------------------
static int medevacBuildPayload(char* buf, size_t bufLen, uint8_t lineNum) {
    if (lineNum < 1 || lineNum > 9 || bufLen < 32) return 0;
    const char modeChar = (medevacMode == MEDEVAC_TX_BROADCAST) ? 'B' : 'I';
    return snprintf(buf, bufLen, "MEDEVAC:L%u:%c:%s:%s",
                    lineNum, modeChar, medevacTargetNode,
                    medevacLineData[lineNum - 1]);
}

// ---------------------------------------------------------------------------
// Check if a received payload is a MEDEVAC message.
// Returns the line number (1-9) or 0 if not a MEDEVAC message.
// ---------------------------------------------------------------------------
static uint8_t medevacParseLineNumber(const char* payload) {
    if (strncmp(payload, "MEDEVAC:L", 9) != 0) return 0;
    char lineChar = payload[9];
    if (lineChar >= '1' && lineChar <= '9') return (uint8_t)(lineChar - '0');
    return 0;
}

// ---------------------------------------------------------------------------
// Parse the mode from a MEDEVAC payload. Returns 'B' or 'I'.
// ---------------------------------------------------------------------------
static char medevacParseMode(const char* payload) {
    // Format: "MEDEVAC:L<n>:<B|I>:..."
    if (strlen(payload) < 12) return 'B';
    return payload[11]; // position of mode char
}

// ---------------------------------------------------------------------------
// Parse the target node from a MEDEVAC payload.
// Writes into targetBuf (null-terminated). Returns true on success.
// ---------------------------------------------------------------------------
static bool medevacParseTarget(const char* payload, char* targetBuf, size_t targetBufLen) {
    // Format: "MEDEVAC:L<n>:<B|I>:<target>:<data>"
    if (strlen(payload) < 14) return false;
    const char* targetStart = payload + 13; // after "MEDEVAC:Ln:M:"
    const char* colon = strchr(targetStart, ':');
    if (!colon) return false;
    size_t len = (size_t)(colon - targetStart);
    if (len >= targetBufLen) len = targetBufLen - 1;
    strncpy(targetBuf, targetStart, len);
    targetBuf[len] = '\0';
    return true;
}

#endif // SPECTRE_MEDEVAC_H
