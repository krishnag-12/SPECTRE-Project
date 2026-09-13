// =============================================================================
// S.P.E.C.T.R.E. Sprint D — Anti-Tamper Zeroization ISR
// GPIO-triggered instant key wipe for physical compromise scenarios
// =============================================================================
#ifndef SPECTRE_ZEROIZE_H
#define SPECTRE_ZEROIZE_H

#include <Arduino.h>
#include "esp_system.h"
#include "mbedtls/ecdh.h"
#include "mbedtls/ctr_drbg.h"
#include "mbedtls/entropy.h"

// ---------------------------------------------------------------------------
// Zeroization Pin Configuration
// Default: GPIO 4 (free on C2 gateway, has interrupt capability)
// Wire a momentary push button between ZEROIZE_PIN and GND.
// The pin uses INPUT_PULLUP (active LOW — press to trigger).
// ---------------------------------------------------------------------------
#ifndef ZEROIZE_PIN
#define ZEROIZE_PIN 4
#endif

// ---------------------------------------------------------------------------
// External references — these are defined in main.cpp globals
// The ISR wipes them directly without going through any abstraction layer.
// ---------------------------------------------------------------------------
extern uint8_t AES_KEY[32];
extern bool keyExchangeComplete;
extern mbedtls_ecdh_context ecdh_ctx;
extern mbedtls_entropy_context entropy;
extern mbedtls_ctr_drbg_context ctr_drbg;

// ---------------------------------------------------------------------------
// Zeroization state flag — set true after ISR fires.
// main loop can check this to display "COMPROMISED" status.
// ---------------------------------------------------------------------------
static volatile bool zeroized = false;

// ---------------------------------------------------------------------------
// Zeroization ISR — IRAM_ATTR ensures it runs from IRAM (not flash cache)
//
// Wipe sequence:
//   1. Overwrite AES_KEY with zeros
//   2. Fill AES_KEY with hardware RNG noise (prevents cold-boot recovery)
//   3. Invalidate key exchange flag (blocks further decryption)
//   4. Free mbedTLS ECDH context (destroys ephemeral keys)
//   5. Free mbedTLS DRBG context (destroys CSPRNG state)
//   6. Free mbedTLS entropy context
//   7. Set zeroized flag for main loop awareness
//
// Total execution: < 1ms. Non-maskable on ESP32 GPIO interrupt.
// ---------------------------------------------------------------------------
static void IRAM_ATTR zeroizeISR() {
    // Step 1: Zero the symmetric key
    memset(AES_KEY, 0, 32);

    // Step 2: Overwrite with hardware random noise (anti-forensic)
    esp_fill_random(AES_KEY, 32);

    // Step 3: Block any further decryption attempts
    keyExchangeComplete = false;

    // Step 4-6: Destroy mbedTLS cryptographic contexts
    // These functions are safe to call from ISR context on ESP32
    // as they only zero memory and free internal buffers.
    mbedtls_ecdh_free(&ecdh_ctx);
    mbedtls_ctr_drbg_free(&ctr_drbg);
    mbedtls_entropy_free(&entropy);

    // Step 7: Signal zeroization complete
    zeroized = true;
}

// ---------------------------------------------------------------------------
// Initialize the zeroization GPIO.
// Call once in setup() after all crypto contexts are initialized.
// ---------------------------------------------------------------------------
static inline void initZeroize(uint8_t pin = ZEROIZE_PIN) {
    pinMode(pin, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(pin), zeroizeISR, FALLING);
}

#endif // SPECTRE_ZEROIZE_H
