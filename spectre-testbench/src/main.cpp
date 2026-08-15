// =============================================================================
// S.P.E.C.T.R.E. - DIAGNOSTIC TESTBENCH RECEIVER (FINAL RELEASE)
// Fully autonomous headless node for Mesh Network Validation.
// Features: ECDH Auto-Handshake, AES-256 GCM Decryption, RF Energy Detection.
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

// =============================================================================
// PIN & RADIO HARDWARE DEFINITIONS 
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

#define MAX_PAYLOAD_LEN  128
#define NODE_ID_MAX_LEN  16

// =============================================================================
// PACKET STRUCTURES
// =============================================================================
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
SX1278 radio = new Module(LORA_NSS_PIN, LORA_DIO0_PIN, LORA_RESET_PIN, LORA_DIO1_PIN);
volatile bool rxFlag = false;

static uint8_t AES_KEY[32] = {0}; 
static bool keyExchangeComplete = false;

mbedtls_ecdh_context ecdh_ctx;
mbedtls_entropy_context entropy;
mbedtls_ctr_drbg_context ctr_drbg;
static uint8_t myPublicKey[65]; 
size_t pubKeyLen;

// =============================================================================
// CRYPTOGRAPHIC ENGINES
// =============================================================================
void initCryptoAndGenerateKeys() {
    Serial.println("[Crypto] Initializing RNG and generating Testbench ECDH Keys...");
    mbedtls_ecdh_init(&ecdh_ctx);
    mbedtls_ctr_drbg_init(&ctr_drbg);
    mbedtls_entropy_init(&entropy);
    
    const char *pers = "spectre_testbench";
    mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy, (const unsigned char *)pers, strlen(pers));
    
    mbedtls_ecdh_setup(&ecdh_ctx, MBEDTLS_ECP_DP_SECP256R1);
    mbedtls_ecdh_make_public(&ecdh_ctx, &pubKeyLen, myPublicKey, sizeof(myPublicKey), mbedtls_ctr_drbg_random, &ctr_drbg);
    
    Serial.println("[Crypto] Testbench Keys generated successfully.");
}

bool deriveSharedAESKey(const uint8_t* peerPublicKey, size_t peerKeyLen) {
    Serial.println("\n[Crypto] Main Device Public Key received! Deriving shared secret...");
    mbedtls_ecdh_read_public(&ecdh_ctx, peerPublicKey, peerKeyLen);
    
    uint8_t sharedSecret[32];
    size_t secretLen = 0;
    mbedtls_ecdh_calc_secret(&ecdh_ctx, &secretLen, sharedSecret, sizeof(sharedSecret), mbedtls_ctr_drbg_random, &ctr_drbg);
    
    // Hash the derived secret to create a robust 256-bit AES key
    mbedtls_sha256(sharedSecret, secretLen, AES_KEY, 0);
    keyExchangeComplete = true;
    
    Serial.println("[Crypto] -> AES-256 KEY LOCKED. SECURE LINK ESTABLISHED <-");
    return true;
}

static bool aes256Decrypt(const uint8_t* ciphertext, int len, const uint8_t* iv, const uint8_t* tag, char* plaintext) {
    mbedtls_gcm_context ctx;
    mbedtls_gcm_init(&ctx);
    mbedtls_gcm_setkey(&ctx, MBEDTLS_CIPHER_ID_AES, AES_KEY, 256);
    
    int ret = mbedtls_gcm_auth_decrypt(&ctx, len, iv, 12, NULL, 0, tag, 16, ciphertext, (unsigned char*)plaintext);
    mbedtls_gcm_free(&ctx);
    
    if (ret == 0) {
        plaintext[len] = '\0'; // Null-terminate string on success
        return true;
    }
    return false; // Authentication tag mismatch or bad key
}

// =============================================================================
// RADIO ISR & RTOS TASK
// =============================================================================

// Hardware Interrupt: Fires precisely when the LoRa chip detects a full packet
void IRAM_ATTR onDio0Rise() { rxFlag = true; }

void taskTestbenchRadio(void* pvParameters) {
    Serial.println("\n[Radio] Booting LoRa Module...");
    int state = radio.begin(LORA_FREQUENCY, LORA_BANDWIDTH, LORA_SF, LORA_CR, LORA_SYNC_WORD, LORA_TX_POWER);
    
    if (state != RADIOLIB_ERR_NONE) {
        Serial.printf("[FATAL] LoRa INIT FAIL! SPI Hardware Error Code: %d\n", state);
        vTaskSuspend(NULL);
    }
    
    // Bind the hardware interrupt pin
    radio.setDio0Action(onDio0Rise, RISING);
    radio.startReceive();
    Serial.println("[Radio] Listening for Main Device transmissions...");

    uint32_t lastHeartbeat = millis();

    for (;;) {
        // 5-Second System Heartbeat (Proves RTOS stack stability)
        if (millis() - lastHeartbeat > 5000) {
            Serial.println("[System] Testbench active and scanning airwaves...");
            lastHeartbeat = millis();
        }

        // Triggered by onDio0Rise hardware interrupt
        if (rxFlag) {
            rxFlag = false; 
            size_t rxLen = radio.getPacketLength(); 
            
            Serial.printf("\n[Radio] >>> SIGNAL DETECTED <<< (Length: %u bytes)\n", rxLen);
            
            uint8_t buf[sizeof(LoRaPacket)] = {0}; 
            int readState = radio.readData(buf, rxLen);
            
            if (readState == RADIOLIB_ERR_NONE) {
                Serial.printf("[Radio] Packet Read Success! Magic Byte: 0x%02X\n", buf[0]);
                
                // -------------------------------------------------------------
                // 1. ECDH KEY EXCHANGE PROTOCOL (Magic Byte: 0xAC)
                // -------------------------------------------------------------
                if (buf[0] == 0xAC) {
                    LoRaKeyExchangePacket* rxKeyPkt = (LoRaKeyExchangePacket*)buf;
                    deriveSharedAESKey(rxKeyPkt->publicKey, rxKeyPkt->pubKeyLen);
                    
                    Serial.println("[Radio] Auto-replying with Testbench Public Key...");
                    LoRaKeyExchangePacket replyPkt;
                    replyPkt.magicByte = 0xAC;
                    replyPkt.pubKeyLen = pubKeyLen;
                    memcpy(replyPkt.publicKey, myPublicKey, pubKeyLen);
                    
                    radio.standby();
                    delay(300); // 300ms buffer to ensure Main Device has switched back to RX
                    radio.transmit((uint8_t*)&replyPkt, sizeof(LoRaKeyExchangePacket));
                    
                    Serial.println("[Radio] Auto-reply sent. Ready for encrypted traffic.");
                } 
                
                // -------------------------------------------------------------
                // 2. ENCRYPTED TACTICAL MESSAGES (Magic Byte: 0xAB)
                // -------------------------------------------------------------
                else if (buf[0] == 0xAB) {
                    if (!keyExchangeComplete) {
                        Serial.println("[WARNING] Encrypted message received, but no key exchanged yet!");
                    } else {
                        LoRaPacket* rxPkt = (LoRaPacket*)buf;
                        char plaintext[MAX_PAYLOAD_LEN];
                        const char* senderNodeId = rxPkt->nodeId[0] != '\0' ? rxPkt->nodeId : "Unknown-0";
                        
                        Serial.printf("[Crypto] >>> ENCRYPTED PACKET INCOMING (ID: %u | Sender: %s) <<<\n", rxPkt->messageID, senderNodeId);
                        
                        // Pass cipher, initialization vector, and auth tag into mbedTLS
                        bool authOk = aes256Decrypt(rxPkt->encrypted, rxPkt->payloadLen, rxPkt->iv, rxPkt->tag, plaintext);
                        
                        if (authOk) {
                            Serial.println("==================================================");
                            Serial.println(" [ DECRYPTION SUCCESSFUL - AUTHENTICATION VALID ]");
                            Serial.printf(" Node Callsign: %s\n", senderNodeId);
                            Serial.printf(" Message Payload: \"%s\"\n", plaintext);
                            Serial.println("==================================================");
                        } else {
                            Serial.println("[ERROR] Decryption/Auth failed! Bad key or tampered packet.");
                        }
                    }
                } else {
                    Serial.println("[WARNING] Unknown packet format detected. Dropping.");
                }
            } else {
                Serial.printf("[ERROR] Failed to read packet from LoRa FIFO. Code: %d\n", readState);
            }

            // Cleanly reset the radio state to prevent ghost packet loops
            radio.standby();
            radio.startReceive();
            rxFlag = false; 
        }
        
        // Yield to FreeRTOS scheduler
        vTaskDelay(20 / portTICK_PERIOD_MS);
    }
}

// =============================================================================
// SYSTEM BOOTSTRAP
// =============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n\n==========================================");
    Serial.println("  S.P.E.C.T.R.E. - DIAGNOSTIC TESTBENCH");
    Serial.println("==========================================");

    initCryptoAndGenerateKeys();

    // Spawn massive 49,152-byte RTOS task to safely buffer mbedTLS memory demands
    xTaskCreatePinnedToCore(taskTestbenchRadio, "TestbenchRadio", 49152, NULL, 3, NULL, 0);
}

void loop() {
    // Non-blocking yield to keep Core 1 active
    taskYIELD(); 
}