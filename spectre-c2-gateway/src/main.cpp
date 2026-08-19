// =============================================================================
// S.P.E.C.T.R.E. - DEDICATED C2 GATEWAY FIRMWARE (Sprint A)
// Headless node for Commander's Dashboard.
// Features: JSON Telemetry Bridge, Command Ingestion, AES-256 GCM.
// =============================================================================

#include <Arduino.h>
#include <RadioLib.h>
#include "mbedtls/aes.h"
#include "mbedtls/gcm.h"
#include "mbedtls/ecp.h"
#include "mbedtls/ecdh.h"
#include "mbedtls/entropy.h"
#include "mbedtls/ctr_drbg.h"
#include "mbedtls/sha256.h"

#define NODE_ID "Gateway-1" // Identifier for the dashboard's own node

// =============================================================================
// PIN DEFINITIONS
// =============================================================================

#define LORA_FREQUENCY   433.0  
#define LORA_BANDWIDTH   250.0  
#define LORA_SF          7      
#define LORA_CR          5      
#define LORA_SYNC_WORD   0x34   
#define LORA_TX_POWER    17     

#define LORA_NSS_PIN     5
#define LORA_DIO0_PIN    26
#define LORA_RESET_PIN   14
#define LORA_DIO1_PIN    RADIOLIB_NC

#define MAX_PAYLOAD_LEN   128
#define QUEUE_DEPTH       10
#define NODE_ID_MAX_LEN   16

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
// GLOBALS
// =============================================================================

QueueHandle_t txQueue;
TaskHandle_t  taskRadioHandle;

SX1278 radio = new Module(LORA_NSS_PIN, LORA_DIO0_PIN, LORA_RESET_PIN, LORA_DIO1_PIN);
volatile bool rxFlag = false;

static uint8_t AES_KEY[32] = {0}; 
static bool keyExchangeComplete = false;

mbedtls_ecdh_context ecdh_ctx;
mbedtls_entropy_context entropy;
mbedtls_ctr_drbg_context ctr_drbg;
static uint8_t myPublicKey[65]; 
size_t pubKeyLen;

static char serialCmdBuffer[256];
static size_t serialCmdPos = 0;

// =============================================================================
// CRYPTO HELPERS
// =============================================================================

void initCryptoAndGenerateKeys() {
    mbedtls_ecdh_init(&ecdh_ctx);
    mbedtls_ctr_drbg_init(&ctr_drbg);
    mbedtls_entropy_init(&entropy);
    const char *pers = "spectre_gateway";
    mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy, (const unsigned char *)pers, strlen(pers));
    mbedtls_ecdh_setup(&ecdh_ctx, MBEDTLS_ECP_DP_SECP256R1);
    mbedtls_ecdh_make_public(&ecdh_ctx, &pubKeyLen, myPublicKey, sizeof(myPublicKey), mbedtls_ctr_drbg_random, &ctr_drbg);
}

bool deriveSharedAESKey(const uint8_t* peerPublicKey, size_t peerKeyLen) {
    mbedtls_ecdh_read_public(&ecdh_ctx, peerPublicKey, peerKeyLen);
    uint8_t sharedSecret[32];
    size_t secretLen = 0;
    mbedtls_ecdh_calc_secret(&ecdh_ctx, &secretLen, sharedSecret, sizeof(sharedSecret), mbedtls_ctr_drbg_random, &ctr_drbg);
    mbedtls_sha256(sharedSecret, secretLen, AES_KEY, 0);
    keyExchangeComplete = true;
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

// =============================================================================
// SERIAL BRIDGE LOGIC
// =============================================================================

static bool isSupportedCommandType(const char* type) {
    return strcmp(type, "PING") == 0 || strcmp(type, "REKEY") == 0 || strcmp(type, "ZERO") == 0;
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
                keyPkt.magicByte = 0xAC;
                keyPkt.pubKeyLen = pubKeyLen;
                memcpy(keyPkt.publicKey, myPublicKey, pubKeyLen);
                
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
            int cLen = aes256Encrypt(outMsg.payload, pkt.iv, pkt.encrypted, pkt.tag);
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
                    deriveSharedAESKey(rxKeyPkt->publicKey, rxKeyPkt->pubKeyLen);
                    
                    Serial.printf(
                        "{\"nodeId\":\"%s\",\"msgId\":0,\"hopCount\":0,\"status\":\"ARMED\",\"posX\":0.0,\"posY\":0.0,\"rssi\":%d,\"snr\":%.2f,\"anomalyScore\":0.0,\"payload\":\"%s\",\"timestamp\":%lu}\n",
                        NODE_ID, (int)radio.getRSSI(), (double)radio.getSNR(), "SYS: Secure Key Exchanged!", (unsigned long)(millis()/1000)
                    );
                } 
                else if (buf[0] == 0xAB) {
                    if (!keyExchangeComplete) continue; 
                    LoRaPacket* rxPkt = (LoRaPacket*)buf;
                    char plaintext[MAX_PAYLOAD_LEN];
                    
                    bool authOk = aes256Decrypt(rxPkt->encrypted, rxPkt->payloadLen, rxPkt->iv, rxPkt->tag, plaintext);
                    if (authOk) {
                        char escapedPayload[MAX_PAYLOAD_LEN * 2];
                        jsonEscape(plaintext, escapedPayload, sizeof(escapedPayload));
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