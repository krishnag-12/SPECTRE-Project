// =============================================================================
// S.P.E.C.T.R.E. - Secure Portable Encrypted Communication Terminal
//                  for Remote Environments
// Sprint A: C2 Gateway Integration
// Sprint B: Cryptographic FHSS & The Rendezvous Problem
// Sprint C: Delay-Tolerant Networking (DTN)
// =============================================================================

#define SIMULATOR_MODE 0
#define ENABLE_RADIO_TASK 1
#define C2_BRIDGE_MODE 0
#define ENABLE_FHSS 1
#define ENABLE_DTN 1
#define NODE_ID "Alpha-1"

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <AceButton.h>
#include "spectre_logo.h"
#include "spectre_tactical.h"

// Cryptography Libraries
#include "mbedtls/aes.h"
#include "mbedtls/gcm.h"
#include "mbedtls/ecp.h"
#include "mbedtls/ecdh.h"
#include "mbedtls/entropy.h"
#include "mbedtls/ctr_drbg.h"
#include "mbedtls/sha256.h"

#if !SIMULATOR_MODE
  #include <RadioLib.h>
#endif

// DTN: Non-Volatile Storage for Store-Carry-Forward (Sprint C)
#if ENABLE_DTN
  #include <SPIFFS.h>
#endif

using namespace ace_button;

// =============================================================================
// HARDWARE PIN WIRING REFERENCE (ESP32-WROOM-32 DevKit)
// =============================================================================
//
//  ESP32 GPIO  │  Connected To          │  Function
// ─────────────┼────────────────────────┼──────────────────────────
//  GPIO  5     │  SX1278 NSS  (CS)      │  SPI Chip Select (LoRa)
//  GPIO 14     │  SX1278 RST  (Reset)   │  LoRa Hardware Reset
//  GPIO 26     │  SX1278 DIO0           │  RXDone / CADDone IRQ
//  GPIO 35     │  SX1278 DIO1           │  CADDetected IRQ (FHSS)
//  GPIO 18     │  SX1278 SCK  (SPI CLK) │  SPI Clock (default VSPI)
//  GPIO 23     │  SX1278 MOSI (SPI DI)  │  SPI Master Out
//  GPIO 19     │  SX1278 MISO (SPI DO)  │  SPI Master In
//  GPIO 21     │  SSD1306 SDA (I2C)     │  OLED Data
//  GPIO 22     │  SSD1306 SCL (I2C)     │  OLED Clock
//  GPIO 32     │  Tactile Button (UP)   │  Pull-up, active LOW
//  GPIO 33     │  Tactile Button (DOWN) │  Pull-up, active LOW
//  GPIO 25     │  Tactile Button (SEL)  │  Pull-up, active LOW
//  3V3         │  SX1278 VCC, SSD1306   │  Power rail
//  GND         │  Common ground         │  Ground rail
// ─────────────┴────────────────────────┴──────────────────────────
//
//  Notes:
//  - GPIO 35 is input-only (no internal pull-up). Use external
//    10kΩ pull-down if DIO1 floats when FHSS is disabled.
//  - SPI pins 18/19/23 are ESP32 default VSPI and do NOT need
//    explicit #define — the RadioLib SX1278 constructor uses them.
//  - I2C address for SSD1306: 0x3C (hardcoded in setup()).
// =============================================================================

// =============================================================================
// RADIO CONFIGURATION
// =============================================================================

// Base frequency (Channel 0). FHSS hops across a pool offset from this.
#define LORA_BASE_FREQUENCY   433.0

// WIDER pipe: 250 kHz (doubles speed compared to 125 kHz)
#define LORA_BANDWIDTH   250.0

// SHORTER chirps: SF7 compresses ToA to milliseconds (Max Speed, Medium Range)
#define LORA_SF          7

// TIGHTER error correction: 4/5 rate drops redundant overhead bits
#define LORA_CR          5

// Unique Sync Word to isolate your mesh from civilian LoRa traffic
#define LORA_SYNC_WORD   0x34

// Max hardware power output (17 dBm for SX1278)
#define LORA_TX_POWER    17

#define LORA_NSS_PIN     5      // See wiring table above
#define LORA_DIO0_PIN    26     // See wiring table above
#define LORA_RESET_PIN   14     // See wiring table above
#define LORA_DIO1_PIN    35     // See wiring table above (FHSS CAD)

// =============================================================================
// FHSS CHANNEL POOL & HOPPING CONFIGURATION (Sprint B)
// =============================================================================

// 15 non-overlapping channels within the 433 MHz ISM sub-band.
// Channel spacing = 300 kHz (wider than BW to prevent spectral overlap).
#define FHSS_NUM_CHANNELS      15
#define FHSS_CHANNEL_SPACING    0.3   // MHz between channel centers

// The static channel table. Each entry = base + (index * spacing).
static const float FHSS_CHANNEL_TABLE[FHSS_NUM_CHANNELS] = {
    433.050, 433.350, 433.650, 433.950, 434.250,
    434.550, 434.850, 435.150, 435.450, 435.750,
    436.050, 436.350, 436.650, 436.950, 437.250
};

// Rendezvous channel: all nodes listen here before joining the mesh.
// This is always Channel 0 — the "common ground" for key exchange.
#define FHSS_RENDEZVOUS_CHANNEL_IDX  0

// Dwell time per channel (ms). Must exceed max ToA + processing.
// With SF7/250kHz, ToA ~= 5ms. We allow 50ms dwell for safety.
#define FHSS_DWELL_TIME_MS     50

// Extended preamble length for sync strobe (mesh-join broadcast).
// 37 symbols guarantees intersection with a receiver scanning 15
// channels at ~1.174ms CAD intervals (37 > 15 * 2.4 = 36 symbols).
#define FHSS_SYNC_PREAMBLE_LEN 37

// Standard preamble for normal data packets.
#define FHSS_NORMAL_PREAMBLE_LEN 8

// CAD scan interval per channel: ~1.174ms at SF7.
// This is set by the SX1278 hardware — we just need to call scanChannel().

// Hopping schedule state
static uint8_t  fhssHopSequence[FHSS_NUM_CHANNELS]; // Permuted channel indices
static uint8_t  fhssCurrentSlot  = 0;                // Current position in hop sequence
static uint32_t fhssLastHopMs    = 0;                // Timestamp of last hop
static bool     fhssSynchronized = false;             // True after first packet exchange

// CSPRNG context dedicated to FHSS (seeded from AES_KEY)
static mbedtls_ctr_drbg_context fhss_ctr_drbg;
static mbedtls_entropy_context  fhss_entropy;
static bool fhssCsprngSeeded = false;

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET   -1

#define BTN_UP_PIN    32       // See wiring table above
#define BTN_DOWN_PIN  33       // See wiring table above
#define BTN_SEL_PIN   25       // See wiring table above

// =============================================================================
// CORE MESSAGE / PACKET CONSTANTS
// Defined early because the DTN structures (Sprint C) and the LoRaPacket
// definition further below both reference NODE_ID_MAX_LEN. Keeping these above
// the DTN configuration block avoids use-before-definition of the macro.
// =============================================================================
#define MAX_PAYLOAD_LEN   128
#define QUEUE_DEPTH       5
#define NODE_ID_MAX_LEN   16

// =============================================================================
// DTN: DELAY-TOLERANT NETWORKING CONFIGURATION (Sprint C)
// =============================================================================

#if ENABLE_DTN

// Maximum number of packets that can be stored on flash.
// Each stored packet is ~200 bytes. 32 packets ≈ 6.4 KB of SPIFFS.
#define DTN_MAX_STORED_PACKETS    32

// Maximum number of unique nodes tracked for presence detection.
#define DTN_MAX_TRACKED_NODES     8

// A node is considered "missing" if not heard from in this many ms.
// 30 seconds — aggressive timeout for tactical mesh.
#define DTN_NODE_TIMEOUT_MS       30000

// Interval between data mule dump checks (ms).
#define DTN_DUMP_INTERVAL_MS      5000

// Stored DTN packets live at the SPIFFS root as "/dtn_XXXX.bin".
// (SPIFFS is a flat filesystem, so no real subdirectory is used.)

// On-flash packet header: stored before each raw LoRaPacket.
struct __attribute__((packed)) DtnStoredHeader {
    char     targetNodeId[NODE_ID_MAX_LEN]; // Who this packet is for
    uint32_t storedAtMs;                    // millis() when stored
    uint16_t packetLen;                     // Length of the LoRaPacket blob
};

// Node presence tracking entry.
struct DtnNodePresence {
    char     nodeId[NODE_ID_MAX_LEN];
    uint32_t lastSeenMs;                    // millis() timestamp
    bool     active;                        // Slot in use
};

static DtnNodePresence dtnNodeTable[DTN_MAX_TRACKED_NODES];
static uint32_t dtnLastDumpCheckMs = 0;
static uint16_t dtnNextFileId = 0;          // Auto-incrementing file ID
static bool     dtnInitialized = false;

#endif // ENABLE_DTN

// =============================================================================
// ECDH KEY EXCHANGE & AES CONFIG
// =============================================================================

static uint8_t AES_KEY[32] = {0}; 
static bool keyExchangeComplete = false;

mbedtls_ecdh_context ecdh_ctx;
mbedtls_entropy_context entropy;
mbedtls_ctr_drbg_context ctr_drbg;

static uint8_t myPublicKey[65]; 
size_t pubKeyLen;

// (MAX_PAYLOAD_LEN / QUEUE_DEPTH / NODE_ID_MAX_LEN are defined earlier, above the
//  DTN configuration block, so the Sprint C structures can reference them.)

// =============================================================================
// DATA STRUCTURES
// =============================================================================

struct MessageEvent {
    uint8_t messageID;
    uint8_t hopCount;
    char    payload[MAX_PAYLOAD_LEN];
};

struct __attribute__((packed)) LoRaPacket {
    uint8_t  magicByte;                         
    uint8_t  messageID;
    uint8_t  hopCount;
    uint8_t  payloadLen;                        
    char     nodeId[NODE_ID_MAX_LEN];
    uint8_t  iv[12];                            
    uint8_t  tag[16];                           
    uint8_t  encrypted[MAX_PAYLOAD_LEN];        
};

struct __attribute__((packed)) LoRaKeyExchangePacket {
    uint8_t  magicByte;                         
    uint8_t  pubKeyLen;
    uint8_t  publicKey[65];
};

// =============================================================================
// GLOBALS & DISPLAY SETUP
// =============================================================================

QueueHandle_t txQueue;
QueueHandle_t rxQueue;
TaskHandle_t  taskRadioHandle;

#if !SIMULATOR_MODE
  SX1278 radio = new Module(LORA_NSS_PIN, LORA_DIO0_PIN, LORA_RESET_PIN, LORA_DIO1_PIN);
#endif

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

AceButton btnUp(BTN_UP_PIN);
AceButton btnDown(BTN_DOWN_PIN);
AceButton btnSel(BTN_SEL_PIN);

// 9 Tactical Quick Message buttons (see spectre_tactical.h for pin mapping)
AceButton btnTac[9] = {
    AceButton(TAC_BTN_L1_PIN), AceButton(TAC_BTN_L2_PIN),
    AceButton(TAC_BTN_L3_PIN), AceButton(TAC_BTN_L4_PIN),
    AceButton(TAC_BTN_L5_PIN), AceButton(TAC_BTN_L6_PIN),
    AceButton(TAC_BTN_L7_PIN), AceButton(TAC_BTN_L8_PIN),
    AceButton(TAC_BTN_L9_PIN)
};

volatile bool rxFlag    = false;
volatile bool cadDoneFlag = false;
volatile bool cadDetectedFlag = false;

// Radio state machine for dynamic DIO mapping
enum RadioState {
    RADIO_STATE_RX,          // Normal receive mode (DIO0 = RXDone)
    RADIO_STATE_CAD_SWEEP,   // CAD scanning mode (DIO0 = CADDone, DIO1 = CADDetected)
    RADIO_STATE_TX,          // Transmitting
    RADIO_STATE_STANDBY      // Idle
};
static volatile RadioState radioState = RADIO_STATE_STANDBY;

enum MenuState {
    MENU_MAIN, MENU_INBOX, MENU_COMPOSE,
    MENU_TAC_CFG,        // MEDEVAC TX mode configuration
    MENU_TAC_TARGET,     // MEDEVAC individual target selection
    MENU_TAC_EDIT,       // MEDEVAC line data editing
    MENU_TAC_SENT        // MEDEVAC TX confirmation
};
static MenuState   currentMenu = MENU_MAIN;
static int         menuCursor  = 0;
static bool        needRedraw  = false;
static MenuState   nextMenu    = MENU_MAIN;
static bool        menuChanged = false;

static const char* menuItems[] = {
    "MAYDAY TX", "EXTRACT TX", "REGROUP TX", "SITREP TX",
    "KEY EXCH TX", "TAC MSG CFG", "INBOX"
};
static const int menuCount = 7;
static const char* tacMessages[] = {
    "MAYDAY! Sector 4. Immediate assistance required.",
    "Extraction requested at primary LZ. Awaiting confirmation.",
    "All units regroup at Checkpoint Bravo.",
    "Status nominal. Holding position. No enemy contact.",
    "BROADCASTING PUBLIC ECDH KEY..."
};

// Known target node IDs for MEDEVAC individual mode selection
static const char* tacKnownNodes[] = {
    "Alpha-1", "Bravo-2", "Charlie-3", "Delta-4",
    "Echo-5", "C2-Base", "Gateway-1"
};
static const int tacKnownNodeCount = 7;
static int tacTargetCursor = 0;
static uint8_t lastTacBtnSent = 0; // For TX confirmation display

#if C2_BRIDGE_MODE
  #define DEBUG_PRINTLN(msg) do {} while (0)
  #define DEBUG_PRINTF(...) do {} while (0)
#else
  #define DEBUG_PRINTLN(msg) Serial.println(msg)
  #define DEBUG_PRINTF(...) Serial.printf(__VA_ARGS__)
#endif

static char serialCmdBuffer[128];
static size_t serialCmdPos = 0;

// =============================================================================
// CRYPTO HELPERS
// =============================================================================

void initCryptoAndGenerateKeys() {
    DEBUG_PRINTLN("[Crypto] Initializing RNG and ECDH...");
    mbedtls_ecdh_init(&ecdh_ctx);
    mbedtls_ctr_drbg_init(&ctr_drbg);
    mbedtls_entropy_init(&entropy);
    const char *pers = "spectre_rng";
    mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy, (const unsigned char *)pers, strlen(pers));
    mbedtls_ecdh_setup(&ecdh_ctx, MBEDTLS_ECP_DP_SECP256R1);
    mbedtls_ecdh_make_public(&ecdh_ctx, &pubKeyLen, myPublicKey, sizeof(myPublicKey), mbedtls_ctr_drbg_random, &ctr_drbg);
    DEBUG_PRINTLN("[Crypto] Keys generated successfully.");
}

bool deriveSharedAESKey(const uint8_t* peerPublicKey, size_t peerKeyLen) {
    DEBUG_PRINTLN("[Crypto] Deriving shared secret from peer key...");
    mbedtls_ecdh_read_public(&ecdh_ctx, peerPublicKey, peerKeyLen);
    uint8_t sharedSecret[32];
    size_t secretLen = 0;
    mbedtls_ecdh_calc_secret(&ecdh_ctx, &secretLen, sharedSecret, sizeof(sharedSecret), mbedtls_ctr_drbg_random, &ctr_drbg);
    mbedtls_sha256(sharedSecret, secretLen, AES_KEY, 0);
    keyExchangeComplete = true;
    DEBUG_PRINTLN("[Crypto] AES_KEY derived and locked. Comms are now secure.");
    return true;
}

static int aes256Encrypt(const char* plaintext, const uint8_t* iv, uint8_t* ciphertext, uint8_t* tag) {
    mbedtls_gcm_context ctx;
    mbedtls_gcm_init(&ctx);
    mbedtls_gcm_setkey(&ctx, MBEDTLS_CIPHER_ID_AES, AES_KEY, 256);
    size_t textLen = strnlen(plaintext, MAX_PAYLOAD_LEN - 1);
    mbedtls_gcm_crypt_and_tag(&ctx, MBEDTLS_GCM_ENCRYPT, textLen, iv, 12, NULL, 0, (const unsigned char*)plaintext, ciphertext, 16, tag);
    mbedtls_gcm_free(&ctx);
    return (int)textLen;
}

static bool aes256Decrypt(const uint8_t* ciphertext, int len, const uint8_t* iv, const uint8_t* tag, char* plaintext) {
    mbedtls_gcm_context ctx;
    mbedtls_gcm_init(&ctx);
    mbedtls_gcm_setkey(&ctx, MBEDTLS_CIPHER_ID_AES, AES_KEY, 256);
    int ret = mbedtls_gcm_auth_decrypt(&ctx, len, iv, 12, NULL, 0, tag, 16, ciphertext, (unsigned char*)plaintext);
    mbedtls_gcm_free(&ctx);
    if (ret == 0) {
        plaintext[len] = '\0';
        return true;
    }
    return false;
}

static void jsonEscape(const char* input, char* output, size_t outSize) {
    size_t j = 0;
    for (size_t i = 0; input[i] != '\0' && j + 2 < outSize; i++) {
        const char c = input[i];
        if (c == '"' || c == '\\') {
            output[j++] = '\\';
            output[j++] = c;
        } else if (c == '\n' || c == '\r') {
            output[j++] = ' ';
        } else {
            output[j++] = c;
        }
    }
    output[j] = '\0';
}

static bool isSupportedCommandType(const char* type) {
    return strcmp(type, "PING") == 0 || strcmp(type, "REKEY") == 0 || strcmp(type, "ZERO") == 0;
}

static void emitCommandAck(const char* commandId, const char* nodeId, const char* type, bool success, const char* outcomeCode) {
#if C2_BRIDGE_MODE
    Serial.printf(
        "{\"kind\":\"ack\",\"commandId\":\"%s\",\"nodeId\":\"%s\",\"type\":\"%s\",\"success\":%s,\"outcomeCode\":\"%s\",\"timestamp\":%lu}\n",
        commandId,
        nodeId,
        type,
        success ? "true" : "false",
        outcomeCode,
        (unsigned long)(millis() / 1000)
    );
#else
    (void)commandId;
    (void)nodeId;
    (void)type;
    (void)success;
    (void)outcomeCode;
#endif
}

static bool queueBridgeCommand(const char* type, const char* targetNodeId) {
    MessageEvent txMsg;
    memset(&txMsg, 0, sizeof(txMsg));
    txMsg.hopCount = 3;

    if (strcmp(type, "PING") == 0) {
        txMsg.messageID = 0x90;
    } else if (strcmp(type, "REKEY") == 0) {
        txMsg.messageID = 0xFE;
    } else if (strcmp(type, "ZERO") == 0) {
        txMsg.messageID = 0x92;
    } else {
        return false;
    }

    snprintf(txMsg.payload, MAX_PAYLOAD_LEN, "CMD:%s:%s", type, targetNodeId);
    return xQueueSend(txQueue, &txMsg, 0) == pdPASS;
}

static void handleBridgeSerialLine(char* line) {
#if C2_BRIDGE_MODE
    if (strncmp(line, "CMD:", 4) != 0) {
        return;
    }

    char* savePtr = nullptr;
    char* token = strtok_r(line, ":", &savePtr);
    char* type = strtok_r(nullptr, ":", &savePtr);
    char* targetNodeId = strtok_r(nullptr, ":", &savePtr);
    char* commandId = strtok_r(nullptr, ":", &savePtr);

    if (!token || !type || !targetNodeId || !commandId) {
        emitCommandAck(commandId ? commandId : "missing", targetNodeId ? targetNodeId : "unknown", type ? type : "UNKNOWN", false, "INVALID_FORMAT");
        return;
    }
    if (!isSupportedCommandType(type)) {
        emitCommandAck(commandId, targetNodeId, type, false, "UNSUPPORTED_COMMAND");
        return;
    }
    if (!keyExchangeComplete && strcmp(type, "REKEY") != 0) {
        emitCommandAck(commandId, targetNodeId, type, false, "NOT_ARMED");
        return;
    }

    const bool queued = queueBridgeCommand(type, targetNodeId);
    emitCommandAck(commandId, targetNodeId, type, queued, queued ? "ACKED" : "QUEUE_FULL");
#else
    (void)line;
#endif
}

// =============================================================================
// FHSS HELPERS (Sprint B)
// =============================================================================

// Fisher-Yates shuffle seeded by CSPRNG to generate hop sequence.
static void fhssGenerateHopSequence() {
    // Initialize identity permutation
    for (uint8_t i = 0; i < FHSS_NUM_CHANNELS; i++) {
        fhssHopSequence[i] = i;
    }
    // Shuffle using CSPRNG bytes
    uint8_t rngBuf[FHSS_NUM_CHANNELS];
    mbedtls_ctr_drbg_random(&fhss_ctr_drbg, rngBuf, FHSS_NUM_CHANNELS);
    for (int i = FHSS_NUM_CHANNELS - 1; i > 0; i--) {
        uint8_t j = rngBuf[i] % (i + 1);
        uint8_t tmp = fhssHopSequence[i];
        fhssHopSequence[i] = fhssHopSequence[j];
        fhssHopSequence[j] = tmp;
    }
    fhssCurrentSlot = 0;
    DEBUG_PRINTLN("[FHSS] Hop sequence generated from AES-256 seed.");
}

// Seed the FHSS CSPRNG from the derived AES-256 key.
// Called once after ECDH key exchange completes.
static void fhssSeedFromAESKey() {
    if (fhssCsprngSeeded) return;
    mbedtls_ctr_drbg_init(&fhss_ctr_drbg);
    mbedtls_entropy_init(&fhss_entropy);
    // Use the shared AES_KEY as the personalization string (deterministic seed).
    // Both nodes sharing the same AES_KEY will produce identical hop sequences.
    mbedtls_ctr_drbg_seed(&fhss_ctr_drbg, mbedtls_entropy_func, &fhss_entropy,
                          AES_KEY, 32);
    fhssCsprngSeeded = true;
    fhssGenerateHopSequence();
    DEBUG_PRINTLN("[FHSS] CSPRNG seeded from AES-256 shared secret.");
}

// Advance to the next channel in the hop sequence.
static float fhssAdvanceChannel() {
    fhssCurrentSlot = (fhssCurrentSlot + 1) % FHSS_NUM_CHANNELS;
    // When we wrap around, regenerate the sequence for the next epoch
    if (fhssCurrentSlot == 0) {
        fhssGenerateHopSequence();
    }
    float freq = FHSS_CHANNEL_TABLE[fhssHopSequence[fhssCurrentSlot]];
    fhssLastHopMs = millis();
    return freq;
}

// Get the current channel frequency.
static float fhssCurrentFrequency() {
    if (!fhssSynchronized) {
        return FHSS_CHANNEL_TABLE[FHSS_RENDEZVOUS_CHANNEL_IDX];
    }
    return FHSS_CHANNEL_TABLE[fhssHopSequence[fhssCurrentSlot]];
}

// =============================================================================
// DTN HELPERS — Store-Carry-Forward (Sprint C)
// =============================================================================

// DTN is inseparable from the radio: it detects node presence from received
// frames and burst-transmits buffered packets. It therefore requires the
// SX1278 driver, which is only compiled when !SIMULATOR_MODE. This guard
// matches the DTN call sites (inside #if !SIMULATOR_MODE) and the periodic
// dump trigger in the radio task (#if ENABLE_DTN && !SIMULATOR_MODE).
#if ENABLE_DTN && !SIMULATOR_MODE

// Forward declarations for symbols defined later in the file but referenced
// by the DTN helpers below (avoids use-before-declaration compile errors).
static void configureDioForRx();          // defined in the RADIO TASK section
static int  dtnCountStoredPackets();      // defined below; used by dtnStorePacket

// --- Portable SPIFFS filename helpers -------------------------------------
// The arduino-esp32 core changed File::name() semantics across major versions:
//   core 1.0.x  -> full path,  e.g. "/dtn_0001.bin"
//   core 2.x/3.x-> basename only, e.g. "dtn_0001.bin"
// These helpers normalise both so the DTN store works regardless of the
// installed core version. All matching is done on the basename; all SPIFFS
// operations (open/remove) use a leading-slash full path.
static String dtnBaseName(const String& rawName) {
    const int slash = rawName.lastIndexOf('/');
    return (slash >= 0) ? rawName.substring(slash + 1) : rawName;
}
static bool dtnIsStoredFile(const String& rawName) {
    const String base = dtnBaseName(rawName);
    return base.startsWith("dtn_") && base.endsWith(".bin");
}
static String dtnFullPath(const String& rawName) {
    return "/" + dtnBaseName(rawName);
}
static int dtnParseFileId(const String& rawName) {
    const String base = dtnBaseName(rawName);        // "dtn_0001.bin"
    return base.substring(4, base.length() - 4).toInt();  // strip "dtn_" and ".bin"
}

// Initialize the SPIFFS filesystem for DTN storage.
static bool dtnInitStorage() {
    if (dtnInitialized) return true;
    if (!SPIFFS.begin(true)) { // true = format on first mount
        DEBUG_PRINTLN("[DTN] FATAL: SPIFFS mount failed!");
        return false;
    }
    // Clear the node presence table
    memset(dtnNodeTable, 0, sizeof(dtnNodeTable));
    // Scan existing DTN files to find the highest file ID
    File root = SPIFFS.open("/");
    if (root && root.isDirectory()) {
        File f = root.openNextFile();
        while (f) {
            String name = String(f.name());
            // Files are named dtn_XXXX.bin (see dtn* filename helpers above)
            if (dtnIsStoredFile(name)) {
                int id = dtnParseFileId(name);
                if (id >= dtnNextFileId) dtnNextFileId = id + 1;
            }
            f = root.openNextFile();
        }
    }
    dtnInitialized = true;
    DEBUG_PRINTF("[DTN] SPIFFS mounted. Next file ID: %u. Free: %u bytes.\n",
                 dtnNextFileId, SPIFFS.totalBytes() - SPIFFS.usedBytes());
    return true;
}

// Update node presence table when we hear from a node.
static void dtnUpdateNodePresence(const char* nodeId) {
    // Search for existing entry
    int freeSlot = -1;
    for (int i = 0; i < DTN_MAX_TRACKED_NODES; i++) {
        if (dtnNodeTable[i].active && strncmp(dtnNodeTable[i].nodeId, nodeId, NODE_ID_MAX_LEN) == 0) {
            dtnNodeTable[i].lastSeenMs = millis();
            return;
        }
        if (!dtnNodeTable[i].active && freeSlot < 0) freeSlot = i;
    }
    // New node — use free slot or evict oldest
    if (freeSlot < 0) {
        uint32_t oldest = UINT32_MAX;
        for (int i = 0; i < DTN_MAX_TRACKED_NODES; i++) {
            if (dtnNodeTable[i].lastSeenMs < oldest) {
                oldest = dtnNodeTable[i].lastSeenMs;
                freeSlot = i;
            }
        }
    }
    if (freeSlot >= 0) {
        strncpy(dtnNodeTable[freeSlot].nodeId, nodeId, NODE_ID_MAX_LEN - 1);
        dtnNodeTable[freeSlot].nodeId[NODE_ID_MAX_LEN - 1] = '\0';
        dtnNodeTable[freeSlot].lastSeenMs = millis();
        dtnNodeTable[freeSlot].active = true;
        DEBUG_PRINTF("[DTN] Tracking new node: %s\n", nodeId);
    }
}

// Check if a node is currently reachable (heard from recently).
static bool dtnIsNodeReachable(const char* nodeId) {
    uint32_t now = millis();
    for (int i = 0; i < DTN_MAX_TRACKED_NODES; i++) {
        if (dtnNodeTable[i].active &&
            strncmp(dtnNodeTable[i].nodeId, nodeId, NODE_ID_MAX_LEN) == 0) {
            return (now - dtnNodeTable[i].lastSeenMs) < DTN_NODE_TIMEOUT_MS;
        }
    }
    return false; // Never seen = unreachable
}

// Store an encrypted LoRa packet to SPIFFS for later delivery.
static bool dtnStorePacket(const char* targetNodeId, const uint8_t* pktData, uint16_t pktLen) {
    if (!dtnInitialized) return false;

    // Enforce the logical packet cap so flash usage stays bounded even while
    // plenty of raw bytes remain free.
    if (dtnCountStoredPackets() >= DTN_MAX_STORED_PACKETS) {
        DEBUG_PRINTLN("[DTN] Packet store at capacity (DTN_MAX_STORED_PACKETS) — cannot store.");
        return false;
    }

    // Check raw storage limits (with a safety margin for SPIFFS metadata).
    uint32_t freeBytes = SPIFFS.totalBytes() - SPIFFS.usedBytes();
    if (freeBytes < (sizeof(DtnStoredHeader) + pktLen + 512)) { // 512B safety margin
        DEBUG_PRINTLN("[DTN] SPIFFS full — cannot store packet.");
        return false;
    }

    char filename[24];
    snprintf(filename, sizeof(filename), "/dtn_%04u.bin", dtnNextFileId++);

    File f = SPIFFS.open(filename, FILE_WRITE);
    if (!f) {
        DEBUG_PRINTF("[DTN] Failed to open %s for writing.\n", filename);
        return false;
    }

    DtnStoredHeader hdr;
    memset(&hdr, 0, sizeof(hdr));
    strncpy(hdr.targetNodeId, targetNodeId, NODE_ID_MAX_LEN - 1);
    hdr.storedAtMs = millis();
    hdr.packetLen  = pktLen;

    f.write((uint8_t*)&hdr, sizeof(hdr));
    f.write(pktData, pktLen);
    f.close();

    DEBUG_PRINTF("[DTN] Stored packet for '%s' as %s (%u bytes).\n",
                 targetNodeId, filename, pktLen);
    return true;
}

// Data Mule Dump: check for stored packets whose target node has returned.
// Called periodically from the radio task. Transmits ONE packet per call
// to avoid monopolizing the radio channel.
static bool dtnDumpOnePacket(SX1278& radio) {
    File root = SPIFFS.open("/");
    if (!root || !root.isDirectory()) return false;

    File f = root.openNextFile();
    while (f) {
        String name = String(f.name());
        if (dtnIsStoredFile(name)) {
            // Read the header to check the target
            DtnStoredHeader hdr;
            if (f.read((uint8_t*)&hdr, sizeof(hdr)) == sizeof(hdr)) {
                if (dtnIsNodeReachable(hdr.targetNodeId)) {
                    // Target node is back! Read and transmit the stored packet.
                    // Guard against a corrupt/oversized header before reading
                    // into a fixed-size stack buffer.
                    if (hdr.packetLen > sizeof(LoRaPacket)) {
                        f.close();
                        SPIFFS.remove(dtnFullPath(name)); // drop poison packet
                        return true;
                    }
                    uint8_t pktBuf[sizeof(LoRaPacket)];
                    uint16_t readLen = f.read(pktBuf, hdr.packetLen);
                    f.close();

                    if (readLen == hdr.packetLen) {
                        radio.standby();
#if ENABLE_FHSS
                        radio.setFrequency(fhssCurrentFrequency());
#endif
                        radioState = RADIO_STATE_TX;
                        radio.transmit(pktBuf, readLen);
                        rxFlag = false;
                        configureDioForRx();
                        radio.startReceive();

                        DEBUG_PRINTF("[DTN] MULE DUMP: Delivered stored packet to '%s' from %s.\n",
                                     hdr.targetNodeId, name.c_str());
                    }

                    // Delete the file after delivery attempt
                    SPIFFS.remove(dtnFullPath(name));
                    return true; // One packet per call
                }
            }
        }
        f = root.openNextFile();
    }
    return false; // No packets to deliver
}

// Count how many DTN packets are currently stored on flash.
static int dtnCountStoredPackets() {
    int count = 0;
    File root = SPIFFS.open("/");
    if (!root || !root.isDirectory()) return 0;
    File f = root.openNextFile();
    while (f) {
        String name = String(f.name());
        if (dtnIsStoredFile(name)) count++;
        f = root.openNextFile();
    }
    return count;
}

#endif // ENABLE_DTN && !SIMULATOR_MODE

// =============================================================================
// CORE 0: RADIO TASK — Dynamic DIO Mapping (Sprint B)
// =============================================================================

// ISR for DIO0: fires on RXDone (in RX mode) or CADDone (in CAD mode)
#if !SIMULATOR_MODE
void IRAM_ATTR onDio0Rise() {
    if (radioState == RADIO_STATE_CAD_SWEEP) {
        cadDoneFlag = true;
    } else {
        rxFlag = true;
    }
}

// ISR for DIO1: fires on CADDetected (activity found on channel)
void IRAM_ATTR onDio1Rise() {
    cadDetectedFlag = true;
}
#endif

// Reconfigure DIO mapping for RX mode: DIO0 = RXDone
static void configureDioForRx() {
    radioState = RADIO_STATE_RX;
    // RadioLib's startReceive() automatically maps DIO0 to RXDone
}

// Reconfigure DIO mapping for CAD mode: DIO0 = CADDone, DIO1 = CADDetected
static void configureDioForCad() {
    radioState = RADIO_STATE_CAD_SWEEP;
    cadDoneFlag = false;
    cadDetectedFlag = false;
    // RadioLib's startChannelScan() automatically maps DIO0→CADDone, DIO1→CADDetected
}

// Perform a synchronous CAD sweep across all FHSS channels.
// Returns the channel index where activity was detected, or -1 if none.
static int fhssCadSweep(SX1278& radio) {
    for (uint8_t ch = 0; ch < FHSS_NUM_CHANNELS; ch++) {
        radio.standby();
        radio.setFrequency(FHSS_CHANNEL_TABLE[ch]);

        configureDioForCad();
        cadDoneFlag = false;
        cadDetectedFlag = false;

        // startChannelScan triggers CAD; DIO0 fires when CAD completes
        radio.startChannelScan();

        // Wait for CAD to complete (~1.174ms at SF7)
        uint32_t cadStart = millis();
        while (!cadDoneFlag && (millis() - cadStart < 10)) {
            // Tight spin — CAD is sub-2ms, so this is safe
            delayMicroseconds(100);
        }

        if (cadDetectedFlag) {
            DEBUG_PRINTF("[FHSS] CAD detected activity on channel %u (%.3f MHz)\n",
                         ch, FHSS_CHANNEL_TABLE[ch]);
            return (int)ch;
        }
    }
    return -1; // No activity found
}

// Transmit a sync strobe on the rendezvous channel with extended preamble.
// This allows scanning receivers to intersect the broadcast regardless of
// which channel they are currently scanning.
static void fhssTransmitSyncStrobe(SX1278& radio, const uint8_t* pktData, size_t pktLen) {
    radio.standby();
    radio.setFrequency(FHSS_CHANNEL_TABLE[FHSS_RENDEZVOUS_CHANNEL_IDX]);
    radio.setPreambleLength(FHSS_SYNC_PREAMBLE_LEN);

    radioState = RADIO_STATE_TX;
    radio.transmit(const_cast<uint8_t*>(pktData), pktLen);

    // Restore normal preamble length after strobe
    radio.setPreambleLength(FHSS_NORMAL_PREAMBLE_LEN);
    DEBUG_PRINTLN("[FHSS] Sync strobe transmitted on rendezvous channel.");
}

void taskRadioAndCrypto(void* pvParameters) {
    DEBUG_PRINTF("[Radio] Task started on Core %d\n", xPortGetCoreID());
    
    int state = RADIOLIB_ERR_NONE; 
    LoRaPacket pkt;
    MessageEvent outMsg, inMsg;

#if !SIMULATOR_MODE
    float initFreq = LORA_BASE_FREQUENCY;
#if ENABLE_FHSS
    // Start on the rendezvous channel for key exchange
    initFreq = FHSS_CHANNEL_TABLE[FHSS_RENDEZVOUS_CHANNEL_IDX];
    DEBUG_PRINTF("[FHSS] Starting on rendezvous channel: %.3f MHz\n", initFreq);
#endif

    state = radio.begin(initFreq, LORA_BANDWIDTH, LORA_SF, LORA_CR, LORA_SYNC_WORD, LORA_TX_POWER);
    if (state != RADIOLIB_ERR_NONE) {
        MessageEvent errMsg;
        errMsg.messageID = 0xFF;
        snprintf(errMsg.payload, MAX_PAYLOAD_LEN, "LoRa INIT FAIL! Code: %d", state);
        xQueueSend(rxQueue, &errMsg, portMAX_DELAY);
        vTaskSuspend(NULL);
    }

    // Attach DIO interrupts — both DIO0 and DIO1 for FHSS CAD support
    attachInterrupt(digitalPinToInterrupt(LORA_DIO0_PIN), onDio0Rise, RISING);
#if ENABLE_FHSS
    if (LORA_DIO1_PIN != RADIOLIB_NC) {
        attachInterrupt(digitalPinToInterrupt(LORA_DIO1_PIN), onDio1Rise, RISING);
    }
    radio.setPreambleLength(FHSS_NORMAL_PREAMBLE_LEN);
#endif

    configureDioForRx();
    radio.startReceive();
    DEBUG_PRINTLN("[Radio] LoRa initialised OK.");
#endif

    for (;;) {
        // =====================================================================
        // FHSS: Channel hopping & CAD sweep (Sprint B)
        // =====================================================================
#if ENABLE_FHSS && !SIMULATOR_MODE
        if (fhssSynchronized) {
            // Check if dwell time has expired — time to hop
            if (millis() - fhssLastHopMs >= FHSS_DWELL_TIME_MS) {
                float nextFreq = fhssAdvanceChannel();
                radio.standby();
                radio.setFrequency(nextFreq);
                configureDioForRx();
                rxFlag = false;
                radio.startReceive();
            }
        } else if (keyExchangeComplete && fhssCsprngSeeded) {
            // Post-key-exchange: perform CAD sweep to find the peer's channel
            int activeChannel = fhssCadSweep(radio);
            if (activeChannel >= 0) {
                // Found activity — lock onto that channel to receive
                radio.standby();
                radio.setFrequency(FHSS_CHANNEL_TABLE[activeChannel]);
                configureDioForRx();
                rxFlag = false;
                radio.startReceive();

                // Try to receive the packet on this channel
                uint32_t rxWaitStart = millis();
                while (!rxFlag && (millis() - rxWaitStart < 20)) {
                    delayMicroseconds(500);
                }
                // If we got a packet, the normal RX handler below will process it
            } else {
                // No activity found — go back to rendezvous and listen
                radio.standby();
                radio.setFrequency(FHSS_CHANNEL_TABLE[FHSS_RENDEZVOUS_CHANNEL_IDX]);
                configureDioForRx();
                rxFlag = false;
                radio.startReceive();
            }
        }
#endif

        // =====================================================================
        // TX: Transmit queued messages
        // =====================================================================
        if (xQueueReceive(txQueue, &outMsg, 0) == pdPASS) {
            if (outMsg.messageID == 0xFE) {
                // ECDH Key Exchange — always broadcast on rendezvous channel
                // with extended sync strobe preamble for guaranteed reception
                LoRaKeyExchangePacket keyPkt;
                keyPkt.magicByte = 0xAC;
                keyPkt.pubKeyLen = pubKeyLen;
                memcpy(keyPkt.publicKey, myPublicKey, pubKeyLen);
                
#if ENABLE_FHSS && !SIMULATOR_MODE
                // Use sync strobe for key exchange (mesh-join broadcast)
                fhssTransmitSyncStrobe(radio, (uint8_t*)&keyPkt, sizeof(LoRaKeyExchangePacket));
#else
                radio.standby();
                state = radio.transmit((uint8_t*)&keyPkt, sizeof(LoRaKeyExchangePacket));
#endif
                rxFlag = false;
                configureDioForRx();
                radio.startReceive();
                continue;
            }

            if (!keyExchangeComplete) {
                MessageEvent errMsg;
                errMsg.messageID = 0xFF;
                strncpy(errMsg.payload, "ERR: Run Key Exchange.", MAX_PAYLOAD_LEN);
                xQueueSend(rxQueue, &errMsg, 0);
                continue;
            }

            memset(&pkt, 0, sizeof(pkt));
            pkt.magicByte  = 0xAB;
            pkt.messageID  = outMsg.messageID;
            pkt.hopCount   = outMsg.hopCount;
            strncpy(pkt.nodeId, NODE_ID, NODE_ID_MAX_LEN - 1);
            pkt.nodeId[NODE_ID_MAX_LEN - 1] = '\0';
            esp_fill_random(pkt.iv, 12);
            int cLen = aes256Encrypt(outMsg.payload, pkt.iv, pkt.encrypted, pkt.tag);
            pkt.payloadLen = (uint8_t)cLen;

#if !SIMULATOR_MODE
            radio.standby();
#if ENABLE_FHSS
            // Transmit on current hop channel
            radio.setFrequency(fhssCurrentFrequency());
#endif
            size_t pktSize = sizeof(LoRaPacket) - MAX_PAYLOAD_LEN + cLen;
            radioState = RADIO_STATE_TX;
            state = radio.transmit((uint8_t*)&pkt, pktSize);
            rxFlag = false;
            configureDioForRx();
            radio.startReceive();
#endif
        }

        // =====================================================================
        // RX: Process received packets
        // =====================================================================
#if !SIMULATOR_MODE
        if (rxFlag) {
            rxFlag = false;
            size_t rxLen = radio.getPacketLength(); 
            uint8_t buf[sizeof(LoRaPacket)] = {0}; 
            
            if (radio.readData(buf, rxLen) == RADIOLIB_ERR_NONE) {
                if (buf[0] == 0xAC) {
                    // Key Exchange packet received
                    LoRaKeyExchangePacket* rxKeyPkt = (LoRaKeyExchangePacket*)buf;
                    deriveSharedAESKey(rxKeyPkt->publicKey, rxKeyPkt->pubKeyLen);

#if ENABLE_FHSS
                    // Seed FHSS CSPRNG now that we have the shared AES key
                    fhssSeedFromAESKey();
                    fhssSynchronized = true;
                    fhssLastHopMs = millis();
                    DEBUG_PRINTLN("[FHSS] Synchronized. Beginning channel hopping.");
#endif

                    memset(&inMsg, 0, sizeof(inMsg));
                    inMsg.messageID = 0xFD; 
                    strncpy(inMsg.payload, "SYS: Secure Key Exchanged!", MAX_PAYLOAD_LEN);
                    xQueueSend(rxQueue, &inMsg, 0);
                } 
                else if (buf[0] == 0xAB) {
                    if (!keyExchangeComplete) continue; 
                    LoRaPacket* rxPkt = (LoRaPacket*)buf;
                    memset(&inMsg, 0, sizeof(inMsg));
                    inMsg.messageID = rxPkt->messageID;
                    inMsg.hopCount  = rxPkt->hopCount;
                    
                    bool authOk = aes256Decrypt(rxPkt->encrypted, rxPkt->payloadLen, rxPkt->iv, rxPkt->tag, inMsg.payload);
                    if (authOk) {
#if ENABLE_FHSS
                        // Successful decryption confirms synchronization
                        if (!fhssSynchronized && fhssCsprngSeeded) {
                            fhssSynchronized = true;
                            fhssLastHopMs = millis();
                            DEBUG_PRINTLN("[FHSS] Synchronized via data packet reception.");
                        }
#endif

#if ENABLE_DTN
                        // DTN: Update node presence — this node is alive
                        const char* senderNodeId = rxPkt->nodeId[0] != '\0' ? rxPkt->nodeId : "Unknown-0";
                        dtnUpdateNodePresence(senderNodeId);
#endif

                        xQueueSend(rxQueue, &inMsg, 0);
#if C2_BRIDGE_MODE
                        char escapedPayload[MAX_PAYLOAD_LEN * 2];
                        jsonEscape(inMsg.payload, escapedPayload, sizeof(escapedPayload));
                        const char* packetNodeId = rxPkt->nodeId[0] != '\0' ? rxPkt->nodeId : "Unknown-0";
                        Serial.printf(
                            "{\"nodeId\":\"%s\",\"msgId\":%u,\"hopCount\":%u,\"status\":\"ACTIVE\",\"posX\":0.0,\"posY\":0.0,\"rssi\":%d,\"snr\":%.2f,\"anomalyScore\":0.0,\"payload\":\"%s\",\"timestamp\":%lu}\n",
                            packetNodeId,
                            (unsigned int)rxPkt->messageID,
                            (unsigned int)rxPkt->hopCount,
                            (int)radio.getRSSI(),
                            (double)radio.getSNR(),
                            escapedPayload,
                            (unsigned long)(millis() / 1000)
                        );
#endif
                        // Mesh relay with random backoff
                        if (rxPkt->hopCount > 0) {
                            rxPkt->hopCount--;
                            radio.standby();
                            vTaskDelay((esp_random() % 200 + 50) / portTICK_PERIOD_MS);
#if ENABLE_FHSS
                            radio.setFrequency(fhssCurrentFrequency());
#endif
                            size_t relaySize = sizeof(LoRaPacket) - MAX_PAYLOAD_LEN + rxPkt->payloadLen;
                            radioState = RADIO_STATE_TX;
                            radio.transmit(buf, relaySize);
                            rxFlag = false;
                            configureDioForRx();
                            radio.startReceive();
                        } else {
#if ENABLE_DTN
                            // Hop count exhausted — store for later delivery if
                            // intended destination is not currently reachable.
                            // Extract destination from payload if it contains a
                            // target node hint (e.g. "CMD:PING:Bravo-2").
                            // Otherwise, store generically for any missing node.
                            const char* destNode = rxPkt->nodeId; // originator
                            if (strncmp(inMsg.payload, "CMD:", 4) == 0) {
                                // Extract target from CMD:TYPE:TARGET format
                                char tmpBuf[MAX_PAYLOAD_LEN];
                                strncpy(tmpBuf, inMsg.payload, MAX_PAYLOAD_LEN);
                                char* sv = nullptr;
                                strtok_r(tmpBuf, ":", &sv); // CMD
                                strtok_r(nullptr, ":", &sv); // TYPE
                                char* target = strtok_r(nullptr, ":", &sv);
                                if (target && strlen(target) > 0) destNode = target;
                            }
                            if (!dtnIsNodeReachable(destNode)) {
                                size_t storeSize = sizeof(LoRaPacket) - MAX_PAYLOAD_LEN + rxPkt->payloadLen;
                                dtnStorePacket(destNode, buf, (uint16_t)storeSize);
                            }
#endif
                        }
                    }
                }
            }
        }
#endif

        // =====================================================================
        // DTN: Data Mule Dump — deliver stored packets (Sprint C)
        // =====================================================================
#if ENABLE_DTN && !SIMULATOR_MODE
        if (dtnInitialized && keyExchangeComplete) {
            if (millis() - dtnLastDumpCheckMs >= DTN_DUMP_INTERVAL_MS) {
                dtnLastDumpCheckMs = millis();
                dtnDumpOnePacket(radio);
            }
        }
#endif

        vTaskDelay(20 / portTICK_PERIOD_MS);
    }
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

void drawStatusBar(int battery, int signal, const char* mode) {
    display.fillRect(0, 0, 128, 9, SSD1306_WHITE);
    display.setTextSize(1);
    display.setTextColor(SSD1306_BLACK); 
    display.setCursor(1, 1);
    display.printf("B:%d%% S:%d %s", battery, signal, mode);
}

static void drawMainMenu() {
    display.clearDisplay();
    drawStatusBar(85, 72, "STBY");
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    int startY = 12;
    // Show up to 6 items on screen (64-12)/8 = 6.5 lines
    int viewStart = (menuCursor > 5) ? menuCursor - 5 : 0;
    int viewEnd = viewStart + 6;
    if (viewEnd > menuCount) viewEnd = menuCount;
    for (int i = viewStart; i < viewEnd; i++) {
        int y = startY + ((i - viewStart) * 8);
        display.setCursor(0, y);
        if (i == menuCursor) {
            display.fillRect(0, y - 1, 128, 9, SSD1306_WHITE);
            display.setTextColor(SSD1306_BLACK);
            display.print("> "); display.print(menuItems[i]);
            display.setTextColor(SSD1306_WHITE); 
        } else {
            display.print("  "); display.print(menuItems[i]);
        }
    }
    display.display();
}

static void drawInbox(const MessageEvent& msg) {
    display.clearDisplay();
    // Check if this is a MEDEVAC message
    uint8_t mLine = tacParseLineNumber(msg.payload);
    if (mLine > 0) {
        drawStatusBar(85, 72, "TAC MSG");
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0, 12);
        display.printf("TAC MSG L%u", mLine);
        display.drawLine(0, 22, 128, 22, SSD1306_WHITE);
        display.setCursor(0, 24);
        display.print(TAC_BTN_LABELS[mLine - 1]);
        display.setCursor(0, 34);
        // Extract and display the data portion after the 4th ':'
        const char* p = msg.payload;
        int colons = 0;
        while (*p && colons < 4) { if (*p == ':') colons++; p++; }
        display.setTextWrap(true);
        display.print(p);
        display.display();
    } else {
        drawStatusBar(85, 72, "RX");
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0, 12);
        display.printf("MsgID:%u Hops:%u", msg.messageID, msg.hopCount);
        display.drawLine(0, 22, 128, 22, SSD1306_WHITE);
        display.setCursor(0, 24);
        display.setTextWrap(true);
        display.print(msg.payload);
        display.display();
    }
}

// Draw MEDEVAC TX confirmation screen
static void drawTacSent(uint8_t lineNum) {
    display.clearDisplay();
    drawStatusBar(85, 72, "TAC MSG");
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 14);
    display.printf("TAC L%u", lineNum);
    display.setCursor(0, 24);
    display.print(TAC_BTN_LABELS[lineNum - 1]);
    display.drawLine(0, 34, 128, 34, SSD1306_WHITE);
    display.setCursor(0, 38);
    if (tacTxMode == TAC_TX_BROADCAST) {
        display.print("TX -> BROADCAST");
    } else {
        display.printf("TX -> %s", tacTargetNode);
    }
    display.setCursor(0, 50);
    display.print("SENT");
    display.display();
}
// Draw MEDEVAC config menu
static void drawTacCfgMenu() {
    display.clearDisplay();
    drawStatusBar(85, 72, "TACCFG");
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 12);
    display.println("MEDEVAC TX MODE");
    display.drawLine(0, 22, 128, 22, SSD1306_WHITE);
    // Option 0: BROADCAST
    display.setCursor(0, 26);
    if (menuCursor == 0) {
        display.fillRect(0, 25, 128, 9, SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK);
    }
    display.print(tacTxMode == TAC_TX_BROADCAST ? ">[BROADCAST]" : "> BROADCAST");
    display.setTextColor(SSD1306_WHITE);
    // Option 1: INDIVIDUAL
    display.setCursor(0, 36);
    if (menuCursor == 1) {
        display.fillRect(0, 35, 128, 9, SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK);
    }
    display.print(tacTxMode == TAC_TX_INDIVIDUAL ? ">[INDIVIDUAL]" : "> INDIVIDUAL");
    display.setTextColor(SSD1306_WHITE);
    // Show current target if individual
    if (tacTxMode == TAC_TX_INDIVIDUAL) {
        display.setCursor(0, 50);
        display.printf("TGT: %s", tacTargetNode);
    }
    display.display();
}

// Draw MEDEVAC target node selection
static void drawTacTargetMenu() {
    display.clearDisplay();
    drawStatusBar(85, 72, "TARGET");
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 12);
    display.println("SELECT TARGET NODE");
    display.drawLine(0, 22, 128, 22, SSD1306_WHITE);
    int startY = 26;
    int viewStart = (tacTargetCursor > 3) ? tacTargetCursor - 3 : 0;
    int viewEnd = viewStart + 4;
    if (viewEnd > tacKnownNodeCount) viewEnd = tacKnownNodeCount;
    for (int i = viewStart; i < viewEnd; i++) {
        int y = startY + ((i - viewStart) * 9);
        display.setCursor(0, y);
        if (i == tacTargetCursor) {
            display.fillRect(0, y - 1, 128, 9, SSD1306_WHITE);
            display.setTextColor(SSD1306_BLACK);
            display.printf("> %s", tacKnownNodes[i]);
            display.setTextColor(SSD1306_WHITE);
        } else {
            display.printf("  %s", tacKnownNodes[i]);
        }
    }
    display.display();
}

// =============================================================================
// MEDEVAC BUTTON HANDLER — 9 dedicated line buttons
// =============================================================================
static void handleTacButtonEvent(AceButton* button, uint8_t eventType, uint8_t) {
    if (eventType != AceButton::kEventPressed) return;
    resetIdleTimer();
    if (screensaverActive) return;

    uint8_t pin = button->getPin();
    int lineNum = -1;
    for (int i = 0; i < 9; i++) {
        if (pin == TAC_BTN_PINS[i]) { lineNum = i + 1; break; }
    }
    if (lineNum < 1 || lineNum > 9) return;

    // Build and queue the MEDEVAC message using existing TX infrastructure
    MessageEvent txMsg;
    memset(&txMsg, 0, sizeof(txMsg));
    txMsg.messageID = TAC_MSG_ID_BASE + (uint8_t)lineNum; // 0xD1-0xD9
    txMsg.hopCount  = 3;
    tacBuildPayload(txMsg.payload, MAX_PAYLOAD_LEN, (uint8_t)lineNum);
    xQueueSend(txQueue, &txMsg, 0);

    // Show TX confirmation on OLED
    lastTacBtnSent = (uint8_t)lineNum;
    composePending = true;
    composeDoneMs = millis();
    currentMenu = MENU_TAC_SENT;
    drawTacSent((uint8_t)lineNum);

    DEBUG_PRINTF("[TAC] Line %d TX queued (%s)\n", lineNum,
                 tacTxMode == TAC_TX_BROADCAST ? "BROADCAST" : tacTargetNode);
}

// =============================================================================
// NAVIGATION BUTTON HANDLER (UP/DOWN/SEL)
// =============================================================================
static void handleButtonEvent(AceButton* button, uint8_t eventType, uint8_t) {
    if (eventType != AceButton::kEventPressed) return;
    resetIdleTimer();
    if (screensaverActive) return;
    uint8_t pin = button->getPin();

    // --- MEDEVAC Config Menu ---
    if (currentMenu == MENU_TAC_CFG) {
        if (pin == BTN_UP_PIN) {
            menuCursor = (menuCursor == 0) ? 1 : 0;
            drawTacCfgMenu();
        } else if (pin == BTN_DOWN_PIN) {
            menuCursor = (menuCursor == 1) ? 0 : 1;
            drawTacCfgMenu();
        } else if (pin == BTN_SEL_PIN) {
            if (menuCursor == 0) {
                tacTxMode = TAC_TX_BROADCAST;
                strncpy(tacTargetNode, "*", sizeof(tacTargetNode));
                menuCursor = 0;
                nextMenu = MENU_MAIN; menuChanged = true;
            } else {
                tacTxMode = TAC_TX_INDIVIDUAL;
                menuCursor = 0;
                tacTargetCursor = 0;
                nextMenu = MENU_TAC_TARGET; menuChanged = true;
            }
        }
        return;
    }

    // --- MEDEVAC Target Selection ---
    if (currentMenu == MENU_TAC_TARGET) {
        if (pin == BTN_UP_PIN) {
            tacTargetCursor = (tacTargetCursor - 1 + tacKnownNodeCount) % tacKnownNodeCount;
            drawTacTargetMenu();
        } else if (pin == BTN_DOWN_PIN) {
            tacTargetCursor = (tacTargetCursor + 1) % tacKnownNodeCount;
            drawTacTargetMenu();
        } else if (pin == BTN_SEL_PIN) {
            strncpy(tacTargetNode, tacKnownNodes[tacTargetCursor],
                    sizeof(tacTargetNode) - 1);
            tacTargetNode[sizeof(tacTargetNode) - 1] = '\0';
            menuCursor = 0;
            nextMenu = MENU_MAIN; menuChanged = true;
            DEBUG_PRINTF("[TAC] Target set: %s\n", tacTargetNode);
        }
        return;
    }

    // --- Main Menu ---
    if (currentMenu == MENU_MAIN) {
        if (pin == BTN_UP_PIN) {
            menuCursor = (menuCursor - 1 + menuCount) % menuCount;
            needRedraw = true;
        } else if (pin == BTN_DOWN_PIN) {
            menuCursor = (menuCursor + 1) % menuCount;
            needRedraw = true;
        } else if (pin == BTN_SEL_PIN) {
            if (menuCursor == menuCount - 1) {
                // INBOX
                nextMenu = MENU_INBOX; menuChanged = true;
            } else if (menuCursor == menuCount - 2) {
                // TAC MSG CFG
                menuCursor = (tacTxMode == TAC_TX_BROADCAST) ? 0 : 1;
                nextMenu = MENU_TAC_CFG; menuChanged = true;
            } else {
                // Standard tactical messages
                MessageEvent txMsg;
                if (menuCursor == menuCount - 3) txMsg.messageID = 0xFE; // KEY EXCH
                else txMsg.messageID = (uint8_t)(menuCursor + 1);
                txMsg.hopCount = 3;
                strncpy(txMsg.payload, tacMessages[menuCursor], MAX_PAYLOAD_LEN - 1);
                txMsg.payload[MAX_PAYLOAD_LEN - 1] = '\0';
                xQueueSend(txQueue, &txMsg, 0);
                nextMenu = MENU_COMPOSE; menuChanged = true;
            }
        }
    } else {
        // Any other screen: BACK to main
        menuCursor = 0;
        nextMenu = MENU_MAIN; menuChanged = true;
    }
}

// =============================================================================
// NATIVE CORE 1: SETUP & MAIN UI LOOP
// =============================================================================

static uint32_t composeDoneMs = 0;
static bool     composePending = false;

// Idle / screensaver state (Sprint C+ polish)
// After IDLE_TIMEOUT_MS of no button presses or RX messages,
// the SPECTRE logo screensaver is displayed. Any activity wakes it.
#define IDLE_TIMEOUT_MS   30000   // 30 seconds of inactivity
static uint32_t lastActivityMs   = 0;
static bool     screensaverActive = false;

static void resetIdleTimer() {
    lastActivityMs = millis();
    if (screensaverActive) {
        screensaverActive = false;
        // Wake: redraw whatever screen was showing before the screensaver
        needRedraw = true;
        if (currentMenu == MENU_MAIN) drawMainMenu();
    }
}

void setup() {
    Serial.begin(115200);
    delay(500);
    DEBUG_PRINTLN("\n==============================");
    DEBUG_PRINTLN("  S.P.E.C.T.R.E. OS BOOTING");
    DEBUG_PRINTLN("==============================");

#if !C2_BRIDGE_MODE
    DEBUG_PRINTLN("[Setup] Initializing display...");
    Wire.begin(21, 22);
    Wire.setClock(100000); 
    delay(50); // Let caps stabilize

    // true  = perform software reset sequence (critical for clone SSD1306 modules)
    // false = don't call Wire.begin() internally (we already locked the pins)
    if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C, true, false)) {
        DEBUG_PRINTLN(F("\n\n[FATAL] SSD1306 allocation failed. Check wiring!\n\n"));
        while (true) { delay(100); } 
    }
    
    display.dim(false); // Make sure contrast isn't 0

    // =========================================================================
    // BOOT SPLASH — S.P.E.C.T.R.E. Logo
    // =========================================================================
    drawSpectreBootScreen(display);
    DEBUG_PRINTLN("[Setup] Display OK — boot logo shown.");
    delay(2500); // Hold the logo for 2.5 seconds
    // =========================================================================

    currentMenu = MENU_MAIN;
    drawMainMenu();
#endif

    initCryptoAndGenerateKeys();

#if ENABLE_DTN && !SIMULATOR_MODE
    DEBUG_PRINTLN("[Setup] Initializing DTN store (SPIFFS)...");
    dtnInitStorage();
#endif

    txQueue = xQueueCreate(QUEUE_DEPTH, sizeof(MessageEvent));
    rxQueue = xQueueCreate(QUEUE_DEPTH, sizeof(MessageEvent));
    
#if ENABLE_RADIO_TASK
    DEBUG_PRINTLN("[Setup] Starting Background Radio Task on Core 0...");
    // 49152 byte stack allocation safely buffers mbedTLS memory demands
    xTaskCreatePinnedToCore(taskRadioAndCrypto, "RadioTask", 49152, NULL, 3, &taskRadioHandle, 0);
#endif

#if !C2_BRIDGE_MODE
    pinMode(BTN_UP_PIN,   INPUT_PULLUP);
    pinMode(BTN_DOWN_PIN, INPUT_PULLUP);
    pinMode(BTN_SEL_PIN,  INPUT_PULLUP);
    ButtonConfig* config = ButtonConfig::getSystemButtonConfig();
    config->setEventHandler(handleButtonEvent);
    config->setFeature(ButtonConfig::kFeatureClick);

    // Initialize 9 Tactical buttons
    // GPIO 34 is input-only (no internal pull-up) — requires external pull-up resistor.
    // All other MEDEVAC GPIOs use INPUT_PULLUP (internal pull-up, active LOW).
    static ButtonConfig tacBtnConfig;
    tacBtnConfig.setEventHandler(handleTacButtonEvent);
    tacBtnConfig.setFeature(ButtonConfig::kFeatureClick);
    for (int i = 0; i < 9; i++) {
        int pin = TAC_BTN_PINS[i];
        if (pin == 34) {
            pinMode(pin, INPUT); // GPIO 34: input-only, external pull-up required
        } else {
            pinMode(pin, INPUT_PULLUP);
        }
        btnTac[i].setButtonConfig(&tacBtnConfig);
    }
    DEBUG_PRINTLN("[Setup] 9 Tactical buttons initialized.");
    lastActivityMs = millis(); // Start the idle timer from boot
#endif
}

void loop() {
#if C2_BRIDGE_MODE
    while (Serial.available() > 0) {
        const char c = (char)Serial.read();
        if (c == '\n') {
            serialCmdBuffer[serialCmdPos] = '\0';
            handleBridgeSerialLine(serialCmdBuffer);
            serialCmdPos = 0;
        } else if (c != '\r') {
            if (serialCmdPos < sizeof(serialCmdBuffer) - 1) {
                serialCmdBuffer[serialCmdPos++] = c;
            } else {
                serialCmdPos = 0;
            }
        }
    }
    taskYIELD();
    return;
#else
    // =========================================================================
    // SCREENSAVER: Show SPECTRE logo after IDLE_TIMEOUT_MS of inactivity
    // =========================================================================
    if (!screensaverActive && !composePending &&
        (millis() - lastActivityMs >= IDLE_TIMEOUT_MS)) {
        screensaverActive = true;
        drawSpectreLogo(display);
    }

    // If screensaver is active, only check buttons (wake handled in handler)
    // and check for incoming messages (which also wake the display).
    // Poll all buttons (nav + 9 MEDEVAC)
    btnUp.check();
    btnDown.check();
    btnSel.check();
    for (int i = 0; i < 9; i++) btnTac[i].check();

    if (screensaverActive) {
        // Still check for incoming messages while screensaver is on
        MessageEvent inMsg;
        if (xQueueReceive(rxQueue, &inMsg, 0) == pdPASS) {
            resetIdleTimer(); // Wake on RX
            if (inMsg.messageID == 0xFF) {
                display.clearDisplay();
                display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
                display.setTextSize(1);
                display.setCursor(0, 15);
                display.println(" RADIO ERROR! ");
                display.setTextColor(SSD1306_WHITE);
                display.setCursor(0, 30);
                display.print(inMsg.payload);
                display.display();
            } else {
                drawInbox(inMsg);
                currentMenu = MENU_INBOX;
            }
        }
        taskYIELD();
        return; // Skip normal UI processing while screensaver is active
    }

    // Non-blocking UI timer for composition screens
    if (composePending && (millis() - composeDoneMs > 1200)) {
        composePending = false;
        currentMenu = MENU_MAIN;
        drawMainMenu();
    }

    if (menuChanged) {
        menuChanged = false;
        currentMenu = nextMenu;
        switch (currentMenu) {
            case MENU_MAIN:
                drawMainMenu();
                break;
            case MENU_INBOX:
                display.clearDisplay();
                drawStatusBar(85, 72, "RX");
                display.setTextColor(SSD1306_WHITE);
                display.setTextSize(1);
                display.setCursor(0, 15);
                display.println("== INBOX ==");
                display.drawLine(0, 25, 128, 25, SSD1306_WHITE);
                display.setCursor(0, 35);
                display.println("Awaiting tx...");
                display.display();
                break;
            case MENU_COMPOSE:
                display.clearDisplay();
                drawStatusBar(85, 72, "TX");
                display.setTextColor(SSD1306_WHITE);
                display.setTextSize(1);
                display.setCursor(0, 15);
                display.println("[ TRANSMITTING ]");
                display.setCursor(0, 30);
                display.setTextWrap(true);
                display.print(tacMessages[menuCursor]);
                display.display();
                composePending = true;
                composeDoneMs = millis();
                break;
            case MENU_TAC_CFG:
                drawTacCfgMenu();
                break;
            case MENU_TAC_TARGET:
                drawTacTargetMenu();
                break;
            case MENU_TAC_SENT:
                drawTacSent(lastTacBtnSent);
                composePending = true;
                composeDoneMs = millis();
                break;
            default:
                break;
        }
    }
    
    if (needRedraw) {
        needRedraw = false;
        if (currentMenu == MENU_MAIN) drawMainMenu();
    }

    // Process incoming radio messages
    MessageEvent inMsg;
    if (xQueueReceive(rxQueue, &inMsg, 0) == pdPASS) {
        resetIdleTimer(); // Any incoming message resets the idle timer
        if (inMsg.messageID == 0xFF) {
            display.clearDisplay();
            display.setTextColor(SSD1306_BLACK, SSD1306_WHITE); 
            display.setTextSize(1);
            display.setCursor(0, 15);
            display.println(" RADIO ERROR! ");
            display.setTextColor(SSD1306_WHITE);
            display.setCursor(0, 30);
            display.print(inMsg.payload);
            display.display();
        } else {
            drawInbox(inMsg);
            currentMenu = MENU_INBOX;
        }
    }
    
    // Yield to the RTOS scheduler to allow background tasks to run without blocking
    taskYIELD(); 
#endif
}