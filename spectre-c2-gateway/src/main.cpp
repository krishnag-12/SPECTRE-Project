// =============================================================================
// S.P.E.C.T.R.E. - DEDICATED C2 GATEWAY FIRMWARE (Sprint A + D + E + G + H)
// Headless node for Commander's Dashboard.
// Features: JSON Telemetry Bridge, Command Ingestion, AES-256 GCM,
//           Edge-AI Jamming Detection (IF), Anti-Tamper Zeroization,
//           RF Path-Loss Distance Estimation (E), Crypto Inspector (G),
//           ML Diagnostics & EW Attack Simulation (H).
// =============================================================================

#include <Arduino.h>
#include <RadioLib.h>
#include <Preferences.h>
#include "mbedtls/aes.h"
#include "mbedtls/gcm.h"
#include "anomaly_engine.h"

#define NODE_ID "Gateway-1" // Identifier for the dashboard's own node

// =============================================================================
// HARDWARE PIN WIRING REFERENCE (C2 Gateway — ESP32-WROOM-32 DevKit)
// =============================================================================
//
//  ESP32 GPIO  │  Connected To          │  Function
// ─────────────┼────────────────────────┼──────────────────────────
//  GPIO  5     │  SX1278 NSS  (CS)      │  SPI Chip Select (LoRa)
//  GPIO 14     │  SX1278 RST  (Reset)   │  LoRa Hardware Reset
//  GPIO 26     │  SX1278 DIO0           │  RXDone IRQ
//  GPIO 18     │  SX1278 SCK  (SPI CLK) │  SPI Clock (default VSPI)
//  GPIO 23     │  SX1278 MOSI (SPI DI)  │  SPI Master Out
//  GPIO 19     │  SX1278 MISO (SPI DO)  │  SPI Master In
//  USB         │  PC / Dashboard Host   │  Serial 115200 (JSON stream)
//  3V3         │  SX1278 VCC            │  Power rail
//  GND         │  Common ground         │  Ground rail
// ─────────────┴────────────────────────┴──────────────────────────
//
//  Notes:
//  - No OLED or buttons — this is a headless gateway.
//  - DIO1 is NOT connected (RADIOLIB_NC) — no FHSS on gateway.
//  - SPI pins 18/19/23 are ESP32 default VSPI and are implicit.
//  - The USB serial port must be connected to the host running
//    spectre-dashboard for JSON telemetry bridging.
// =============================================================================

// =============================================================================
// RADIO CONFIGURATION & PIN DEFINITIONS
// =============================================================================

#define LORA_FREQUENCY   433.0  
#define LORA_BANDWIDTH   250.0  
#define LORA_SF          7      
#define LORA_CR          5      
#define LORA_SYNC_WORD   0x34   
#define LORA_TX_POWER    17     

#define LORA_NSS_PIN     5      // See wiring table above
#define LORA_DIO0_PIN    26     // See wiring table above
#define LORA_RESET_PIN   14     // See wiring table above
#define LORA_DIO1_PIN    RADIOLIB_NC  // Not wired on gateway (no FHSS)

#define MAX_PAYLOAD_LEN   128
#define QUEUE_DEPTH       10
#define NODE_ID_MAX_LEN   16

// =============================================================================
// SPRINT E: RF PATH-LOSS DISTANCE ESTIMATION CONSTANTS
// =============================================================================
// Log-Distance Path Loss Model:
//   d = d0 * 10^((RSSI0 - RSSI) / (10 * n))
// RSSI0: Calibrated reference RSSI at d0 = 1 meter (SX1278 @ +17 dBm TX)
// n: Path loss exponent for tactical terrain (suburban/rural/foliage)
// =============================================================================

#define RSSI_REF_1M     (-42.0f)  // RSSI at 1 meter reference distance
#define PATH_LOSS_EXP   (2.4f)    // Empirical tactical exponent
#define MAX_DISPLAY_RANGE 500.0f  // Maximum radar display range in meters

// =============================================================================
// SPRINT E: SECTOR BEARING TABLE (Fireteam Radials)
// =============================================================================
// Pre-assigned tactical vectors relative to C2 Command Post
// =============================================================================

struct SectorEntry {
    const char* nodeId;
    float bearingDeg;  // Degrees from True North (clockwise)
};

static const SectorEntry SECTOR_TABLE[] = {
    { "Alpha-1",   45.0f  },  // NE — Point / Lead Scout
    { "Alpha-2",   60.0f  },  // ENE
    { "Bravo-1",  210.0f  },  // SSW
    { "Bravo-2",  225.0f  },  // SW — Rear Guard / Flank
    { "Charlie-1", 300.0f },  // WNW
    { "Charlie-2", 315.0f },  // NW — Left Flank
    { "Delta-1",  135.0f  },  // SE
    { "Delta-2",  150.0f  },  // SSE
};
static const int SECTOR_TABLE_SIZE = sizeof(SECTOR_TABLE) / sizeof(SECTOR_TABLE[0]);

#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

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
    char     nodeId[NODE_ID_MAX_LEN];
    uint8_t  isResponse;                        // 0 = Master broadcast / Rekey, 1 = Node Joined / Ack
    uint8_t  keyLen;                            // 32
    uint8_t  sessionKey[32];                    // 256-bit network session key
};

// =============================================================================
// GLOBALS & UNIFIED NETWORK SESSION KEY
// =============================================================================

static uint8_t primaryAESKey[32] = {0}; // Active 256-bit network session key
static Preferences prefs;

QueueHandle_t txQueue;
TaskHandle_t  taskRadioHandle;

SX1278 radio = new Module(LORA_NSS_PIN, LORA_DIO0_PIN, LORA_RESET_PIN, LORA_DIO1_PIN);
volatile bool rxFlag = false;

bool keyExchangeComplete = false;

// Sprint D+H: Edge-AI Anomaly Detection Engine
static AnomalyEngine anomalyEngine;

static char serialCmdBuffer[256];
static size_t serialCmdPos = 0;

// =============================================================================
// SPRINT E: RF DISTANCE & POSITION HELPERS
// =============================================================================

static float calculateRfDistance(float rssi) {
    // d = d0 * 10^((RSSI0 - RSSI) / (10 * n))
    float exponent = (RSSI_REF_1M - rssi) / (10.0f * PATH_LOSS_EXP);
    float distance = powf(10.0f, exponent);
    // Clamp to display range
    if (distance < 0.5f) distance = 0.5f;
    if (distance > MAX_DISPLAY_RANGE) distance = MAX_DISPLAY_RANGE;
    return distance;
}

static float getNodeBearing(const char* nodeId) {
    for (int i = 0; i < SECTOR_TABLE_SIZE; i++) {
        if (strncmp(nodeId, SECTOR_TABLE[i].nodeId, NODE_ID_MAX_LEN) == 0) {
            return SECTOR_TABLE[i].bearingDeg;
        }
    }
    // Unknown node: assign a hash-based bearing for visual spread
    uint32_t hash = 0;
    for (int i = 0; nodeId[i] != '\0' && i < NODE_ID_MAX_LEN; i++) {
        hash = hash * 31 + (uint8_t)nodeId[i];
    }
    return (float)(hash % 360);
}

static void calculatePosition(float rssi, const char* nodeId, float* posX, float* posY) {
    float distance = calculateRfDistance(rssi);
    float bearingDeg = getNodeBearing(nodeId);
    float bearingRad = bearingDeg * M_PI / 180.0f;
    // posX = d * sin(θ), posY = d * cos(θ)
    *posX = distance * sinf(bearingRad);
    *posY = distance * cosf(bearingRad);
}

// =============================================================================
// SPRINT G: HEX DUMP HELPER FOR CRYPTO TELEMETRY
// =============================================================================

static void hexDump(const uint8_t* data, size_t len, char* out, size_t outSize) {
    size_t j = 0;
    for (size_t i = 0; i < len && j + 2 < outSize; i++) {
        out[j++] = "0123456789abcdef"[data[i] >> 4];
        out[j++] = "0123456789abcdef"[data[i] & 0x0F];
    }
    out[j] = '\0';
}

// =============================================================================
// CRYPTO HELPERS
// =============================================================================

void initCryptoAndGenerateKeys() {
    prefs.begin("spectre", false);
    if (prefs.isKey("net_key")) {
        size_t len = prefs.getBytes("net_key", primaryAESKey, 32);
        if (len == 32) {
            keyExchangeComplete = true;
        }
    }
}

static int aes256EncryptWithKey(const uint8_t* key, const char* plaintext, const uint8_t* iv, uint8_t* ciphertext, uint8_t* tag) {
    mbedtls_gcm_context ctx;
    mbedtls_gcm_init(&ctx);
    mbedtls_gcm_setkey(&ctx, MBEDTLS_CIPHER_ID_AES, key, 256);
    size_t textLen = strnlen(plaintext, MAX_PAYLOAD_LEN - 1);
    mbedtls_gcm_crypt_and_tag(&ctx, MBEDTLS_GCM_ENCRYPT, textLen, iv, 12, NULL, 0, (const unsigned char*)plaintext, ciphertext, 16, tag);
    mbedtls_gcm_free(&ctx);
    return (int)textLen;
}

static bool aes256DecryptWithKey(const uint8_t* key, const uint8_t* ciphertext, int len, const uint8_t* iv, const uint8_t* tag, char* plaintext) {
    mbedtls_gcm_context ctx;
    mbedtls_gcm_init(&ctx);
    mbedtls_gcm_setkey(&ctx, MBEDTLS_CIPHER_ID_AES, key, 256);
    int ret = mbedtls_gcm_auth_decrypt(&ctx, len, iv, 12, NULL, 0, tag, 16, ciphertext, (unsigned char*)plaintext);
    mbedtls_gcm_free(&ctx);
    if (ret == 0) {
        plaintext[len] = '\0';
        return true;
    }
    return false;
}

static bool aes256DecryptPacket(const LoRaPacket* pkt, char* plaintext) {
    if (!keyExchangeComplete) return false;
    return aes256DecryptWithKey(primaryAESKey, pkt->encrypted, pkt->payloadLen, pkt->iv, pkt->tag, plaintext);
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

// =============================================================================
// SPRINT G+H: ENRICHED JSON EMISSION HELPERS
// =============================================================================

// Emit the "crypto" JSON sub-object for Sprint G
static void emitCryptoJson(const LoRaPacket* pkt, bool authOk) {
    char ivHex[25];    // 12 bytes = 24 hex chars + null
    char tagHex[33];   // 16 bytes = 32 hex chars + null
    char cipherHex[MAX_PAYLOAD_LEN * 2 + 1];
    
    hexDump(pkt->iv, 12, ivHex, sizeof(ivHex));
    hexDump(pkt->tag, 16, tagHex, sizeof(tagHex));
    hexDump(pkt->encrypted, pkt->payloadLen, cipherHex, sizeof(cipherHex));
    
    Serial.printf(
        ",\"crypto\":{\"algo\":\"AES-256-GCM\",\"iv\":\"%s\",\"tag\":\"%s\",\"ciphertext\":\"%s\",\"tagMatch\":%s}",
        ivHex, tagHex, cipherHex, authOk ? "true" : "false"
    );
}

// Emit the "ml" JSON sub-object for Sprint H
static void emitMlJson(const AnomalyResult& ar) {
    Serial.printf(
        ",\"ml\":{\"f\":[%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f],"
        "\"avgPath\":%.2f,\"rawScore\":%.4f,\"ewma\":%.4f,"
        "\"cn\":%.2f,\"trees\":%d,\"ready\":%s}",
        (double)ar.features[0], (double)ar.features[1], (double)ar.features[2],
        (double)ar.features[3], (double)ar.features[4], (double)ar.features[5],
        (double)ar.features[6], (double)ar.features[7],
        (double)ar.avgPathLength, (double)ar.rawScore, (double)ar.ewmaScore,
        (double)IF_C_N, IF_N_TREES, ar.ready ? "true" : "false"
    );
}

// =============================================================================
// SERIAL BRIDGE LOGIC
// =============================================================================

static bool isSupportedCommandType(const char* type) {
    return strcmp(type, "PING") == 0 || strcmp(type, "REKEY") == 0 || strcmp(type, "ZERO") == 0
           || strcmp(type, "TEST_JAM") == 0;  // Sprint H: EW test command
}

static void emitCommandAck(const char* commandId, const char* nodeId, const char* type, bool success, const char* outcomeCode) {
    Serial.printf(
        "{\"kind\":\"ack\",\"commandId\":\"%s\",\"nodeId\":\"%s\",\"type\":\"%s\",\"success\":%s,\"outcomeCode\":\"%s\",\"timestamp\":%lu}\n",
        commandId,
        nodeId,
        type,
        success ? "true" : "false",
        outcomeCode,
        (unsigned long)(millis() / 1000)
    );
}

// Sprint H: Handle EW test jamming simulation
static void handleTestJam(const char* mode, const char* commandId) {
    float testRssi, testSnr;
    
    if (strcmp(mode, "BARRAGE") == 0) {
        testRssi = -35.0f;  testSnr = -14.0f;   // High noise, negative SNR
    } else if (strcmp(mode, "SPOT") == 0) {
        testRssi = -95.0f;  testSnr = -5.0f;    // Deep signal loss
    } else if (strcmp(mode, "PULSE") == 0) {
        testRssi = -50.0f;  testSnr = -2.0f;    // Intermittent burst
    } else if (strcmp(mode, "CLEAR") == 0) {
        testRssi = -72.0f;  testSnr = 8.5f;     // Normal ambient
    } else {
        emitCommandAck(commandId, "Gateway-1", "TEST_JAM", false, "UNKNOWN_MODE");
        return;
    }
    
    // Feed synthetic values into the REAL ML engine on the ESP32 chip
    AnomalyResult ar = anomalyEngine.computeScoreDetailed(testRssi, testSnr);
    
    float posX = 0.0f, posY = 0.0f;
    
    // Emit a full telemetry packet with ML diagnostics
    Serial.printf(
        "{\"nodeId\":\"EW-SIM\",\"msgId\":0,\"hopCount\":0,"
        "\"status\":\"ACTIVE\",\"posX\":%.1f,\"posY\":%.1f,"
        "\"rssi\":%d,\"snr\":%.2f,\"anomalyScore\":%.4f,"
        "\"payload\":\"EW TEST: %s injection via ESP32 AnomalyEngine\","
        "\"timestamp\":%lu",
        (double)posX, (double)posY,
        (int)testRssi, (double)testSnr, (double)ar.ewmaScore,
        mode,
        (unsigned long)(millis() / 1000)
    );
    emitMlJson(ar);
    Serial.println("}");
    
    emitCommandAck(commandId, "EW-SIM", "TEST_JAM", true, "INJECTED");
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
    if (strncmp(line, "CMD:", 4) != 0) {
        return;
    }

    // Make a copy since strtok_r modifies the buffer
    char lineCopy[256];
    strncpy(lineCopy, line, sizeof(lineCopy) - 1);
    lineCopy[sizeof(lineCopy) - 1] = '\0';

    char* savePtr = nullptr;
    char* token = strtok_r(lineCopy, ":", &savePtr);
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
    
    // Sprint H: Handle EW test injection locally (no RF transmission needed)
    if (strcmp(type, "TEST_JAM") == 0) {
        handleTestJam(targetNodeId, commandId);  // targetNodeId field holds the mode (BARRAGE/SPOT/PULSE/CLEAR)
        return;
    }
    
    if (!keyExchangeComplete && strcmp(type, "REKEY") != 0) {
        emitCommandAck(commandId, targetNodeId, type, false, "NOT_ARMED");
        return;
    }

    const bool queued = queueBridgeCommand(type, targetNodeId);
    emitCommandAck(commandId, targetNodeId, type, queued, queued ? "ACKED" : "QUEUE_FULL");
}

// =============================================================================
// CORE 0: RADIO TASK
// =============================================================================
void IRAM_ATTR onDio0Rise() { rxFlag = true; }

void taskGatewayRadio(void* pvParameters) {
    int state = radio.begin(LORA_FREQUENCY, LORA_BANDWIDTH, LORA_SF, LORA_CR, LORA_SYNC_WORD, LORA_TX_POWER);
    if (state != RADIOLIB_ERR_NONE) {
        // Output an error JSON if LoRa fails to initialize
        Serial.printf(
            "{\"nodeId\":\"%s\",\"msgId\":%u,\"hopCount\":0,\"status\":\"COMPROMISED\",\"posX\":0.0,\"posY\":0.0,\"rssi\":0,\"snr\":0.0,\"anomalyScore\":0.0,\"payload\":\"%s\",\"timestamp\":%lu}\n",
            NODE_ID, 0, "FATAL: LoRa hardware init failed.", (unsigned long)(millis() / 1000)
        );
        while (true) { vTaskDelay(1000); }
    }
    attachInterrupt(digitalPinToInterrupt(LORA_DIO0_PIN), onDio0Rise, RISING);
    radio.startReceive();

    LoRaPacket pkt;
    MessageEvent outMsg;

    for (;;) {
        // Handle TX
        if (xQueueReceive(txQueue, &outMsg, 0) == pdPASS) {
            if (outMsg.messageID == 0xFE) { // REKEY
                LoRaKeyExchangePacket keyPkt;
                memset(&keyPkt, 0, sizeof(keyPkt));
                keyPkt.magicByte = 0xAC;
                strncpy(keyPkt.nodeId, NODE_ID, NODE_ID_MAX_LEN - 1);
                keyPkt.nodeId[NODE_ID_MAX_LEN - 1] = '\0';
                keyPkt.isResponse = 0;
                keyPkt.keyLen = 32;
                esp_fill_random(primaryAESKey, 32);
                keyExchangeComplete = true;
                prefs.putBytes("net_key", primaryAESKey, 32);
                memcpy(keyPkt.sessionKey, primaryAESKey, 32);
                
                radio.standby();
                radio.transmit((uint8_t*)&keyPkt, sizeof(LoRaKeyExchangePacket));
                rxFlag = false;
                radio.startReceive();
                continue;
            }

            if (!keyExchangeComplete) {
                continue;
            }

            memset(&pkt, 0, sizeof(pkt));
            pkt.magicByte  = 0xAB;
            pkt.messageID  = outMsg.messageID;
            pkt.hopCount   = outMsg.hopCount;
            strncpy(pkt.nodeId, NODE_ID, NODE_ID_MAX_LEN - 1);
            pkt.nodeId[NODE_ID_MAX_LEN - 1] = '\0';
            esp_fill_random(pkt.iv, 12);

            int cLen = aes256EncryptWithKey(primaryAESKey, outMsg.payload, pkt.iv, pkt.encrypted, pkt.tag);
            pkt.payloadLen = (uint8_t)cLen;

            radio.standby();
            size_t pktSize = sizeof(LoRaPacket) - MAX_PAYLOAD_LEN + cLen;
            radio.transmit((uint8_t*)&pkt, pktSize);
            rxFlag = false;
            radio.startReceive();
        }

        // Handle RX
        if (rxFlag) {
            rxFlag = false;
            size_t rxLen = radio.getPacketLength(); 
            uint8_t buf[sizeof(LoRaPacket)] = {0}; 
            
            if (radio.readData(buf, rxLen) == RADIOLIB_ERR_NONE) {
                if (buf[0] == 0xAC) {
                    LoRaKeyExchangePacket* rxKeyPkt = (LoRaKeyExchangePacket*)buf;
                    if (rxKeyPkt->keyLen == 32) {
                        memcpy(primaryAESKey, rxKeyPkt->sessionKey, 32);
                        keyExchangeComplete = true;
                        prefs.putBytes("net_key", primaryAESKey, 32);
                    }
                    const char* senderNodeId = (rxKeyPkt->nodeId[0] != '\0') ? rxKeyPkt->nodeId : "Unknown-Node";
                    
                    float keRssi = (float)radio.getRSSI();
                    float keSnr  = (float)radio.getSNR();
                    AnomalyResult keAr = anomalyEngine.computeScoreDetailed(keRssi, keSnr);
                    
                    // Sprint E: Calculate position from RSSI + bearing
                    float kePosX = 0.0f, kePosY = 0.0f;
                    calculatePosition(keRssi, senderNodeId, &kePosX, &kePosY);
                    
                    Serial.printf(
                        "{\"nodeId\":\"%s\",\"msgId\":0,\"hopCount\":0,\"status\":\"ARMED\","
                        "\"posX\":%.1f,\"posY\":%.1f,\"rssi\":%d,\"snr\":%.2f,"
                        "\"anomalyScore\":%.4f,\"payload\":\"%s\",\"timestamp\":%lu",
                        senderNodeId, (double)kePosX, (double)kePosY,
                        (int)keRssi, (double)keSnr, (double)keAr.ewmaScore, 
                        (rxKeyPkt->isResponse ? "SYS: Node Joined & Armed!" : "SYS: Secure Key Exchanged!"), 
                        (unsigned long)(millis()/1000)
                    );
                    emitMlJson(keAr);
                    Serial.println("}");
                    // Do NOT transmit RF back — allows field nodes to ack cleanly without RF collision
                } 
                else if (buf[0] == 0xAB) {
                    if (!keyExchangeComplete) continue; 
                    LoRaPacket* rxPkt = (LoRaPacket*)buf;
                    char plaintext[MAX_PAYLOAD_LEN];
                    
                    bool authOk = aes256DecryptPacket(rxPkt, plaintext);
                    if (authOk) {
                        char escapedPayload[MAX_PAYLOAD_LEN * 2];
                        jsonEscape(plaintext, escapedPayload, sizeof(escapedPayload));
                        const char* packetNodeId = rxPkt->nodeId[0] != '\0' ? rxPkt->nodeId : "Unknown-0";

                        // Sprint E: Calculate position
                        float rxRssi = (float)radio.getRSSI();
                        float rxSnr  = (float)radio.getSNR();
                        float rxPosX = 0.0f, rxPosY = 0.0f;
                        calculatePosition(rxRssi, packetNodeId, &rxPosX, &rxPosY);
                        
                        // Sprint H: Get detailed ML result
                        AnomalyResult rxAr = anomalyEngine.computeScoreDetailed(rxRssi, rxSnr);

                        // Detect Tactical messages (payload starts with "TAC:L")
                        bool isTac = (strncmp(plaintext, "TAC:L", 5) == 0
                                          && plaintext[5] >= '1' && plaintext[5] <= '9');
                        if (isTac) {
                            uint8_t tacLine = plaintext[5] - '0';
                            char modeChar = (strlen(plaintext) > 7) ? plaintext[7] : 'B';
                            // Extract target (between 3rd and 4th ':')
                            char tacTarget[16] = "*";
                            if (strlen(plaintext) > 9) {
                                const char* tStart = plaintext + 9;
                                const char* tEnd = strchr(tStart, ':');
                                if (tEnd) {
                                    size_t tLen = (size_t)(tEnd - tStart);
                                    if (tLen > 15) tLen = 15;
                                    strncpy(tacTarget, tStart, tLen);
                                    tacTarget[tLen] = '\0';
                                }
                            }
                            Serial.printf(
                                "{\"kind\":\"tactical\",\"nodeId\":\"%s\",\"msgId\":%u,\"hopCount\":%u,"
                                "\"tacLine\":%u,\"tacMode\":\"%c\",\"tacTarget\":\"%s\","
                                "\"status\":\"ACTIVE\",\"posX\":%.1f,\"posY\":%.1f,\"rssi\":%d,\"snr\":%.2f,"
                                "\"anomalyScore\":%.4f,\"payload\":\"%s\",\"timestamp\":%lu",
                                packetNodeId,
                                (unsigned int)rxPkt->messageID,
                                (unsigned int)rxPkt->hopCount,
                                (unsigned int)tacLine,
                                modeChar,
                                tacTarget,
                                (double)rxPosX, (double)rxPosY,
                                (int)rxRssi,
                                (double)rxSnr,
                                (double)rxAr.ewmaScore,
                                escapedPayload,
                                (unsigned long)(millis() / 1000)
                            );
                            // Sprint G: Append crypto telemetry
                            emitCryptoJson(rxPkt, authOk);
                            // Sprint H: Append ML diagnostics
                            emitMlJson(rxAr);
                            Serial.println("}");
                        } else {
                            Serial.printf(
                                "{\"nodeId\":\"%s\",\"msgId\":%u,\"hopCount\":%u,"
                                "\"status\":\"ACTIVE\",\"posX\":%.1f,\"posY\":%.1f,\"rssi\":%d,\"snr\":%.2f,"
                                "\"anomalyScore\":%.4f,\"payload\":\"%s\",\"timestamp\":%lu",
                                packetNodeId,
                                (unsigned int)rxPkt->messageID,
                                (unsigned int)rxPkt->hopCount,
                                (double)rxPosX, (double)rxPosY,
                                (int)rxRssi,
                                (double)rxSnr,
                                (double)rxAr.ewmaScore,
                                escapedPayload,
                                (unsigned long)(millis() / 1000)
                            );
                            // Sprint G: Append crypto telemetry
                            emitCryptoJson(rxPkt, authOk);
                            // Sprint H: Append ML diagnostics
                            emitMlJson(rxAr);
                            Serial.println("}");
                        }
                    }
                }
            }
            // Cleanly reset the radio state to prevent ghost packet loops
            radio.standby();
            radio.startReceive();
            rxFlag = false; 
        }
        vTaskDelay(20 / portTICK_PERIOD_MS);
    }
}

// =============================================================================
// SYSTEM BOOTSTRAP
// =============================================================================

void setup() {
    Serial.begin(115200);
    // Suppress human-readable logs to maintain a pure JSON stream
    delay(1000);
    
    initCryptoAndGenerateKeys();


    txQueue = xQueueCreate(QUEUE_DEPTH, sizeof(MessageEvent));
    
    // Spawn RTOS task for continuous LoRa operation
    xTaskCreatePinnedToCore(taskGatewayRadio, "GatewayRadio", 49152, NULL, 3, &taskRadioHandle, 0);
}

void loop() {
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
                serialCmdPos = 0; // Overflow, reset
            }
        }
    }
    taskYIELD(); 
}