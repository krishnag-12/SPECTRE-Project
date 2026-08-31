// =============================================================================
// S.P.E.C.T.R.E. — 9 Tactical Quick Messages Module
// Indian Military Standard RT Prowords & Field Commands
// =============================================================================
#ifndef SPECTRE_TACTICAL_H
#define SPECTRE_TACTICAL_H

#include <Arduino.h>

// ---------------------------------------------------------------------------
// 9 Tactical Quick Messages — Indian Military Standard
// References: Indian Army RT procedures, NATO-compatible prowords,
//             Hindi field terminology (SATHI GHAYAL, etc.)
// ---------------------------------------------------------------------------

// Button labels (for OLED display and documentation)
static const char* TAC_BTN_LABELS[] = {
    "CONTACT",          // 1: Enemy contact / engagement
    "SATHI GHAYAL",     // 2: Buddy wounded / casualty (Hindi field term)
    "MAYDAY",           // 3: Extreme emergency / life-threatening
    "LZ CLEAR",         // 4: Landing/extraction zone clear
    "LZ HOT",           // 5: Landing/extraction zone compromised
    "TGT SPOTTED",      // 6: Enemy/target visually identified
    "SITREP",           // 7: Situation report request/send
    "WILCO",            // 8: Will comply (order understood)
    "OUT"               // 9: Transmission terminated
};

// Concise payloads transmitted over LoRa mesh
static const char* TAC_BTN_PAYLOADS[] = {
    "CONTACT! Enemy engagement. Immediate response required.",
    "SATHI GHAYAL. Casualty at position. Medical assistance needed.",
    "MAYDAY MAYDAY MAYDAY. Life-threatening emergency.",
    "LZ CLEAR. Landing zone is secure for extraction.",
    "LZ HOT! Landing zone compromised. Abort approach.",
    "TARGET SPOTTED. Enemy visually identified at position.",
    "SITREP requested. All units report status.",
    "WILCO. Order received and will comply.",
    "OUT. Transmission terminated. No reply expected."
};

// ---------------------------------------------------------------------------
// GPIO Pin Definitions for 9 Tactical Buttons
// ---------------------------------------------------------------------------
// These GPIOs are chosen from the ESP32-WROOM-32 available pins that do
// NOT conflict with existing SPI (5,18,19,23), I2C (21,22), LoRa IRQ
// (26,35), LoRa RST (14), or nav buttons (25,32,33).
//
// Mapping: 9 dedicated buttons for Tactical Quick Messages 1–9
// ---------------------------------------------------------------------------

#define TAC_BTN_1_PIN   4   // CONTACT
#define TAC_BTN_2_PIN   16  // SATHI GHAYAL
#define TAC_BTN_3_PIN   17  // MAYDAY
#define TAC_BTN_4_PIN   13  // LZ CLEAR
#define TAC_BTN_5_PIN   12  // LZ HOT
#define TAC_BTN_6_PIN   27  // TGT SPOTTED
#define TAC_BTN_7_PIN   2   // SITREP
#define TAC_BTN_8_PIN   15  // WILCO
#define TAC_BTN_9_PIN   34  // OUT (input-only, external pull-up required)

static const int TAC_BTN_PINS[9] = {
    TAC_BTN_1_PIN, TAC_BTN_2_PIN, TAC_BTN_3_PIN,
    TAC_BTN_4_PIN, TAC_BTN_5_PIN, TAC_BTN_6_PIN,
    TAC_BTN_7_PIN, TAC_BTN_8_PIN, TAC_BTN_9_PIN
};

// Message ID range: 0xD1–0xD9 (Button 1–9)
// No collision with: 0x01-0x04 tactical, 0x90 PING, 0x92 ZERO,
//   0xAB data, 0xAC key exchange, 0xFD/0xFE/0xFF system
#define TAC_MSG_ID_BASE  0xD0  // Button N → messageID = 0xD0 + N

// ---------------------------------------------------------------------------
// Transmission Mode
// ---------------------------------------------------------------------------

enum TacTxMode : uint8_t {
    TAC_TX_BROADCAST  = 0,
    TAC_TX_INDIVIDUAL = 1
};

static TacTxMode tacTxMode = TAC_TX_BROADCAST;
static char tacTargetNode[16] = "*"; // "*" = broadcast, else node ID

// ---------------------------------------------------------------------------
// Build the Tactical payload string.
// Format: "TAC:L<n>:<B|I>:<target>:<data>"
// Returns the number of bytes written (excluding null terminator).
// ---------------------------------------------------------------------------
static int tacBuildPayload(char* buf, size_t bufLen, uint8_t lineNum) {
    if (lineNum < 1 || lineNum > 9 || bufLen < 32) return 0;
    const char modeChar = (tacTxMode == TAC_TX_BROADCAST) ? 'B' : 'I';
    return snprintf(buf, bufLen, "TAC:L%u:%c:%s:%s",
                    lineNum, modeChar, tacTargetNode,
                    TAC_BTN_PAYLOADS[lineNum - 1]);
}

// ---------------------------------------------------------------------------
// Check if a received payload is a Tactical message.
// Returns the line number (1-9) or 0 if not a Tactical message.
// ---------------------------------------------------------------------------
static uint8_t tacParseLineNumber(const char* payload) {
    if (strncmp(payload, "TAC:L", 5) != 0) return 0;
    char lineChar = payload[5];
    if (lineChar >= '1' && lineChar <= '9') return (uint8_t)(lineChar - '0');
    return 0;
}

// ---------------------------------------------------------------------------
// Parse the mode from a Tactical payload. Returns 'B' or 'I'.
// ---------------------------------------------------------------------------
static char tacParseMode(const char* payload) {
    // Format: "TAC:L<n>:<B|I>:..."
    if (strlen(payload) < 8) return 'B';
    return payload[7]; // position of mode char
}

// ---------------------------------------------------------------------------
// Parse the target node from a Tactical payload.
// Writes into targetBuf (null-terminated). Returns true on success.
// ---------------------------------------------------------------------------
static bool tacParseTarget(const char* payload, char* targetBuf, size_t targetBufLen) {
    // Format: "TAC:L<n>:<B|I>:<target>:<data>"
    if (strlen(payload) < 10) return false;
    const char* targetStart = payload + 9; // after "TAC:Ln:M:"
    const char* colon = strchr(targetStart, ':');
    if (!colon) return false;
    size_t len = (size_t)(colon - targetStart);
    if (len >= targetBufLen) len = targetBufLen - 1;
    strncpy(targetBuf, targetStart, len);
    targetBuf[len] = '\0';
    return true;
}

#endif // SPECTRE_TACTICAL_H
