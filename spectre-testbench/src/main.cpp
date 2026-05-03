// =============================================================================
// S.P.E.C.T.R.E. - TESTBENCH RECEIVER NODE
// Autonomously listens, negotiates ECDH keys, and decrypts messages to Serial.
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
// PIN & RADIO DEFINITIONS (Must match Main Device)
// =============================================================================
#define LORA_FREQUENCY   433.0
#define LORA_BANDWIDTH   125.0
#define LORA_SF          10
#define LORA_CR          6
#define LORA_SYNC_WORD   0x34
#define LORA_TX_POWER    17

#define LORA_NSS_PIN     5
#define LORA_DIO0_PIN    26
#define LORA_RESET_PIN   14
#define LORA_DIO1_PIN    RADIOLIB_NC

#define MAX_PAYLOAD_LEN  128

// =============================================================================
// DATA STRUCTURES
// =============================================================================
struct __attribute__((packed)) LoRaPacket {
    uint8_t  magicByte;                         
    uint8_t  messageID;
    uint8_t  hopCount;
    uint8_t  payloadLen;                        
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
// CRYPTOGRAPHY
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
        plaintext[len] = '\0';
        return true;
    }
    return false;
}

// =============================================================================
// RADIO ISR & TASK
// =============================================================================
void IRAM_ATTR onDio0Rise() { rxFlag = true; }

void taskTestbenchRadio(void* pvParameters) {
    Serial.println("\n[Radio] Booting LoRa Module...");
    int state = radio.begin(LORA_FREQUENCY, LORA_BANDWIDTH, LORA_SF, LORA_CR, LORA_SYNC_WORD, LORA_TX_POWER);
    if (state != RADIOLIB_ERR_NONE) {
        Serial.printf("[FATAL] LoRa INIT FAIL! Code: %d\n", state);
        vTaskSuspend(NULL);
    }
    
    radio.setDio0Action(onDio0Rise, RISING);
    radio.startReceive();
    Serial.println("[Radio] Listening for Main Device transmissions...");

    for (;;) {
        if (rxFlag) {
            rxFlag = false;
            size_t rxLen = radio.getPacketLength(); 
            uint8_t buf[sizeof(LoRaPacket)] = {0}; 
            
            if (radio.readData(buf, rxLen) == RADIOLIB_ERR_NONE) {
                
                // 1. Handle incoming Key Exchange (0xAC)
                if (buf[0] == 0xAC) {
                    LoRaKeyExchangePacket* rxKeyPkt = (LoRaKeyExchangePacket*)buf;
                    deriveSharedAESKey(rxKeyPkt->publicKey, rxKeyPkt->pubKeyLen);
                    
                    // Auto-Reply with Testbench Public Key so Main Device unlocks
                    Serial.println("[Radio] Auto-replying with Testbench Public Key...");
                    LoRaKeyExchangePacket replyPkt;
                    replyPkt.magicByte = 0xAC;
                    replyPkt.pubKeyLen = pubKeyLen;
                    memcpy(replyPkt.publicKey, myPublicKey, pubKeyLen);
                    
                    radio.standby();
                    delay(200); // Give main device time to switch back to RX
                    radio.transmit((uint8_t*)&replyPkt, sizeof(LoRaKeyExchangePacket));
                    radio.startReceive();
                    Serial.println("[Radio] Auto-reply sent. Ready for encrypted traffic.");
                } 
                
                // 2. Handle Encrypted Tactical Messages (0xAB)
                else if (buf[0] == 0xAB) {
                    if (!keyExchangeComplete) {
                        Serial.println("[WARNING] Encrypted message received, but no key exchanged yet!");
                        continue; 
                    }

                    LoRaPacket* rxPkt = (LoRaPacket*)buf;
                    char plaintext[MAX_PAYLOAD_LEN];
                    
                    Serial.printf("\n>>> ENCRYPTED PACKET INCOMING (ID: %u) <<<\n", rxPkt->messageID);
                    
                    bool authOk = aes256Decrypt(rxPkt->encrypted, rxPkt->payloadLen, rxPkt->iv, rxPkt->tag, plaintext);
                    
                    if (authOk) {
                        Serial.println("==================================================");
                        Serial.println(" [ DECRYPTION SUCCESSFUL - AUTHENTICATION VALID ]");
                        Serial.printf(" Message Payload: \"%s\"\n", plaintext);
                        Serial.println("==================================================");
                    } else {
                        Serial.println("[ERROR] Decryption/Auth failed! Bad key or tampered packet.");
                    }
                }
            }
        }
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

// =============================================================================
// SETUP & LOOP
// =============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n\n==========================================");
    Serial.println("  S.P.E.C.T.R.E. - TESTBENCH TERMINAL");
    Serial.println("==========================================");

    initCryptoAndGenerateKeys();

    // Spawn massive RTOS task to handle mbedTLS overhead safely
    xTaskCreatePinnedToCore(taskTestbenchRadio, "TestbenchRadio", 49152, NULL, 3, NULL, 0);
}

void loop() {
    taskYIELD(); 
}