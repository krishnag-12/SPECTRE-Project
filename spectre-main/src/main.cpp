// =============================================================================
// S.P.E.C.T.R.E. - Secure Portable Encrypted Communication Terminal
//                  for Remote Environments
// =============================================================================

#define SIMULATOR_MODE 0
#define ENABLE_RADIO_TASK 1
#define C2_BRIDGE_MODE 1
#define NODE_ID "Alpha-1"

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h> 
#include <AceButton.h>

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

using namespace ace_button;

// =============================================================================
// PIN DEFINITIONS
// =============================================================================

// Center frequency. (Future upgrade: cycle this for FHSS anti-jamming)
#define LORA_FREQUENCY   433.0  

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

#define LORA_NSS_PIN     5
#define LORA_DIO0_PIN    26
#define LORA_RESET_PIN   14
#define LORA_DIO1_PIN    RADIOLIB_NC

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET   -1

#define BTN_UP_PIN    32
#define BTN_DOWN_PIN  33
#define BTN_SEL_PIN   25

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

#define MAX_PAYLOAD_LEN   128
#define QUEUE_DEPTH       5
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

volatile bool rxFlag = false;

enum MenuState { MENU_MAIN, MENU_INBOX, MENU_COMPOSE };
static MenuState   currentMenu = MENU_MAIN;
static int         menuCursor  = 0;
static bool        needRedraw  = false;
static MenuState   nextMenu    = MENU_MAIN;
static bool        menuChanged = false;

static const char* menuItems[] = {
    "MAYDAY TX", "EXTRACT TX", "REGROUP TX", "SITREP TX", "KEY EXCH TX", "INBOX"
};
static const int menuCount = 6;
static const char* tacMessages[] = {
    "MAYDAY! Sector 4. Immediate assistance required.",
    "Extraction requested at primary LZ. Awaiting confirmation.",
    "All units regroup at Checkpoint Bravo.",
    "Status nominal. Holding position. No enemy contact.",
    "BROADCASTING PUBLIC ECDH KEY..."
};

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
// CORE 0: RADIO TASK
// =============================================================================
#if !SIMULATOR_MODE
void IRAM_ATTR onDio0Rise() { rxFlag = true; }
#endif

void taskRadioAndCrypto(void* pvParameters) {
    DEBUG_PRINTF("[Radio] Task started on Core %d\n", xPortGetCoreID());
    
    int state = RADIOLIB_ERR_NONE; 
    LoRaPacket pkt;
    MessageEvent outMsg, inMsg;

#if !SIMULATOR_MODE
    state = radio.begin(LORA_FREQUENCY, LORA_BANDWIDTH, LORA_SF, LORA_CR, LORA_SYNC_WORD, LORA_TX_POWER);
    if (state != RADIOLIB_ERR_NONE) {
        MessageEvent errMsg;
        errMsg.messageID = 0xFF;
        snprintf(errMsg.payload, MAX_PAYLOAD_LEN, "LoRa INIT FAIL! Code: %d", state);
        xQueueSend(rxQueue, &errMsg, portMAX_DELAY);
        vTaskSuspend(NULL);
    }
    attachInterrupt(digitalPinToInterrupt(LORA_DIO0_PIN), onDio0Rise, RISING);
    radio.startReceive();
    DEBUG_PRINTLN("[Radio] LoRa initialised OK.");
#endif

    for (;;) {
        if (xQueueReceive(txQueue, &outMsg, 0) == pdPASS) {
            if (outMsg.messageID == 0xFE) {
                LoRaKeyExchangePacket keyPkt;
                keyPkt.magicByte = 0xAC;
                keyPkt.pubKeyLen = pubKeyLen;
                memcpy(keyPkt.publicKey, myPublicKey, pubKeyLen);
                
                radio.standby();
                state = radio.transmit((uint8_t*)&keyPkt, sizeof(LoRaKeyExchangePacket));
                rxFlag = false;
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
            size_t pktSize = sizeof(LoRaPacket) - MAX_PAYLOAD_LEN + cLen;
            state = radio.transmit((uint8_t*)&pkt, pktSize);
            rxFlag = false;
            radio.startReceive();
#endif
        }

#if !SIMULATOR_MODE
        if (rxFlag) {
            rxFlag = false;
            size_t rxLen = radio.getPacketLength(); 
            uint8_t buf[sizeof(LoRaPacket)] = {0}; 
            
            if (radio.readData(buf, rxLen) == RADIOLIB_ERR_NONE) {
                if (buf[0] == 0xAC) {
                    LoRaKeyExchangePacket* rxKeyPkt = (LoRaKeyExchangePacket*)buf;
                    deriveSharedAESKey(rxKeyPkt->publicKey, rxKeyPkt->pubKeyLen);
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
                        if (rxPkt->hopCount > 0) {
                            rxPkt->hopCount--;
                            radio.standby();
                            vTaskDelay((esp_random() % 200 + 50) / portTICK_PERIOD_MS);
                            size_t relaySize = sizeof(LoRaPacket) - MAX_PAYLOAD_LEN + rxPkt->payloadLen;
                            radio.transmit(buf, relaySize);
                            rxFlag = false;
                            radio.startReceive();
                        }
                    }
                }
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
    for (int i = 0; i < menuCount; i++) {
        display.setCursor(0, startY + (i * 8));
        if (i == menuCursor) {
            display.fillRect(0, startY + (i * 8) - 1, 128, 9, SSD1306_WHITE);
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
    drawStatusBar(85, 72, "RX");
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 12);
    display.printf("MsgID:%u Hops:%u", msg.messageID, msg.hopCount);
    display.drawLine(0, 21, 128, 21, SSD1306_WHITE);
    display.setCursor(0, 24);
    display.setTextWrap(true);
    display.print(msg.payload);
    display.display(); 
}

// =============================================================================
// BUTTON HANDLER
// =============================================================================
static void handleButtonEvent(AceButton* button, uint8_t eventType, uint8_t) {
    if (eventType != AceButton::kEventPressed) return;
    uint8_t pin = button->getPin();
    if (currentMenu == MENU_MAIN) {
        if (pin == BTN_UP_PIN) {
            menuCursor = (menuCursor - 1 + menuCount) % menuCount;
            needRedraw = true;
        } else if (pin == BTN_DOWN_PIN) {
            menuCursor = (menuCursor + 1) % menuCount;
            needRedraw = true;
        } else if (pin == BTN_SEL_PIN) {
            if (menuCursor == menuCount - 1) { 
                nextMenu = MENU_INBOX; menuChanged = true;
            } else {
                MessageEvent txMsg;
                if (menuCursor == menuCount - 2) txMsg.messageID = 0xFE; 
                else txMsg.messageID = (uint8_t)(menuCursor + 1);
                
                txMsg.hopCount  = 3;
                strncpy(txMsg.payload, tacMessages[menuCursor], MAX_PAYLOAD_LEN - 1);
                txMsg.payload[MAX_PAYLOAD_LEN - 1] = '\0';
                
                xQueueSend(txQueue, &txMsg, 0);
                nextMenu = MENU_COMPOSE; menuChanged = true;
            }
        }
    } else {
        nextMenu = MENU_MAIN; menuChanged = true;
    }
}

// =============================================================================
// NATIVE CORE 1: SETUP & MAIN UI LOOP
// =============================================================================

static uint32_t composeDoneMs = 0;
static bool     composePending = false;

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
    // THE PROOF OF LIFE SCREEN
    // =========================================================================
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(18, 15);
    display.println("SPECTRE");
    display.setTextSize(1);
    display.setCursor(16, 40);
    display.println("DISPLAY ONLINE");
    display.display();

    DEBUG_PRINTLN("[Setup] Display OK.");
    delay(2500); // Wait 2.5 seconds to admire your fully working display
    // =========================================================================

    currentMenu = MENU_MAIN;
    drawMainMenu();
#endif

    initCryptoAndGenerateKeys();

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
    // Non-blocking UI timer for composition screens
    if (composePending && (millis() - composeDoneMs > 1200)) {
        composePending = false;
        currentMenu = MENU_MAIN;
        drawMainMenu();
    }

    btnUp.check();
    btnDown.check();
    btnSel.check();

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
        }
    }
    
    if (needRedraw) {
        needRedraw = false;
        if (currentMenu == MENU_MAIN) drawMainMenu();
    }

    // Process incoming radio messages
    MessageEvent inMsg;
    if (xQueueReceive(rxQueue, &inMsg, 0) == pdPASS) {
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