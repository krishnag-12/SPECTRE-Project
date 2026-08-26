# S.P.E.C.T.R.E.
**Secure Portable Encrypted Communication Terminal for Remote Environments**

![Status](https://img.shields.io/badge/Status-Active_R%26D-brightgreen)
![Version](https://img.shields.io/badge/Version-2.0_Prototype-blue)
![Platform](https://img.shields.io/badge/Hardware-ESP32-orange)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

## 📌 Overview
S.P.E.C.T.R.E. is a highly ruggedized, infrastructure-independent, cryptographic tactical terminal engineered to deploy a self-healing, decentralized mesh network. Designed for operations in contested Anti-Access/Area Denial (A2/AD) environments, it bypasses the need for centralized C2 infrastructure (Cellular LTE/5G, SATCOM, VHF/UHF trunked systems) which are highly vulnerable to kinetic strikes and broadband spectrum jamming.

By leveraging Long Range (LoRa) Chirp Spread Spectrum (CSS) modulation and a dual-core FreeRTOS architecture, S.P.E.C.T.R.E. achieves resilient, off-grid communication with military-grade operational security (OPSEC).

## 🛡️ Core Tactical Features
*   **Infrastructure Independence:** 100% off-grid deployment utilizing a deterministic, ad-hoc Store-and-Forward flood routing protocol. Bypasses physical line-of-sight constraints.
*   **Delay-Tolerant Networking (DTN):** A Store-Carry-Forward layer persists encrypted payloads to non-volatile flash (SPIFFS) whenever a destination node is offline or out of range, then autonomously burst-delivers them ("data mule dump") the instant that node re-enters the mesh. This guarantees eventual delivery across intermittently-connected, partitioned tactical networks where no contemporaneous end-to-end path exists.
*   **Zero-Trust Cryptography (COMSEC):** Executes dynamic Elliptic-Curve Diffie-Hellman (ECDH) key exchanges on the SECP256R1 curve. Payloads are authenticated and encrypted via AES-256-GCM to prevent traffic analysis, spoofing, and replay attacks.
*   **Cryptographic FHSS (ECCM):** Frequency-Hopping Spread Spectrum across a 15-channel pool, with the hop schedule derived from the shared AES-256 secret via a CSPRNG. Combined with CSS modulation's processing gain, this resists narrowband jamming and enables successful demodulation below the thermal noise floor.
*   **Low Probability of Detection (LPD):** Mathematical optimization of physical layer parameters (SF7, 250 kHz Bandwidth) compresses fully encrypted tactical payloads into sub-100-millisecond transmission bursts, severely degrading adversary Radio Direction Finding (RDF) capabilities.

## ⚙️ System Architecture

### Hardware Stack
*   **MCU:** Espressif ESP32 (Dual-Core)
*   **RF Transceiver:** Ai-Thinker Ra-02 (Semtech SX1278)
*   **Antenna:** 433 MHz 3dBi SMA Helical
*   **Visual Interface:** 0.96" SSD1306 OLED (I2C)
*   **Power Management:** TP4056 1A Li-Ion Regulator & 18650 3.7V 2600mAh Li-Ion Cell
*   **Tactical Input:** 6x6x5mm Push Button Matrix for rapid C2 payload deployment

### Software Stack & RTOS
S.P.E.C.T.R.E. relies on a highly isolated **FreeRTOS** dual-core environment:
*   **Core 0 (Background):** Dedicated to the radio state machine and the `mbedTLS` crypto library. Handles hardware interrupts (DIO0) and asynchronous AES/ECDH processing without blocking the UI.
*   **Core 1 (Foreground):** Handles operator input matrix, situational awareness displays (OLED), and system telemetry.

### Delay-Tolerant Networking (DTN) Subsystem
In a contested environment, mesh partitions are the norm, not the exception — nodes move out of range, take cover, or go dark. Classic flood routing simply drops a packet when the next hop is unreachable. S.P.E.C.T.R.E.'s DTN layer instead applies a **Store-Carry-Forward** discipline so that a message is never silently lost:

*   **Presence tracking:** Every received frame refreshes a node-presence table (default 8 tracked nodes). A node is considered reachable if heard from within `DTN_NODE_TIMEOUT_MS` (default 30 s); otherwise it is treated as missing.
*   **Store:** When a packet exhausts its hop budget without reaching a reachable destination, the fully-encrypted `LoRaPacket` — ciphertext, IV, and GCM tag intact — is written to non-volatile flash (`SPIFFS`) as `/dtn_XXXX.bin`, preceded by a small header recording the target callsign, timestamp, and length. **Payloads are never decrypted to be stored; COMSEC is preserved end-to-end.** Buffering is bounded by a logical cap (`DTN_MAX_STORED_PACKETS`, default 32) and a raw free-space guard, and the file-ID sequence survives reboots.
*   **Carry & Forward (Data Mule Dump):** The Core 0 radio task periodically (`DTN_DUMP_INTERVAL_MS`, default 5 s) checks whether any buffered packet's target has reappeared in the mesh. When it has, the packet is burst-transmitted and its flash copy deleted. Delivery is throttled to **one packet per cycle** to respect the LoRa duty cycle and interleave cleanly with FHSS channel hopping.

The subsystem is gated by a single compile-time flag, `#define ENABLE_DTN 1` in `spectre-main/src/main.cpp` (set to `0` to revert to drop-on-unreachable behavior). Because Store-Carry-Forward is meaningless without a radio, the DTN code is compiled only when `ENABLE_DTN && !SIMULATOR_MODE`. Filename handling is normalized across arduino-esp32 core 1.0.x and 2.x/3.x, whose `File::name()` semantics differ.

### OLED User Interface & Screensaver
The 0.96" SSD1306 OLED display serves as the field operator's primary situational awareness interface. It features a branded boot sequence and an intelligent idle screensaver:

*   **Boot Splash:** On power-up, a vector-drawn geometric S.P.E.C.T.R.E. logo (the "M" icon) with `SYSTEM ONLINE` and `v2.0 [SECURED]` is displayed for 2.5 seconds before transitioning to the main tactical menu. The logo is rendered via `drawLine()` calls — not a bitmap — ensuring pixel-perfect crispness and zero flash overhead.
*   **Idle Screensaver:** After 30 seconds of no button presses or incoming radio messages (`IDLE_TIMEOUT_MS`), the display transitions to a standby screen showing the logo with `TACTICAL MESH`. This extends OLED panel life and provides an instant visual indication that the terminal is powered and listening but idle.
*   **Instant Wake:** Any button press immediately wakes the display to the last active menu. The first press is consumed for wake only — no menu action is processed — preventing accidental command dispatch. Incoming radio messages also wake the display and are shown immediately in the inbox.

The screensaver logic is defined in `spectre_logo.h` and integrated into the Core 1 UI loop. It respects `C2_BRIDGE_MODE` (no OLED on the headless gateway) and `composePending` state (no screensaver while a TX confirmation is on screen).

## 🚀 Getting Started

### Prerequisites
*   [PlatformIO](https://platformio.org/) or Arduino IDE
*   ESP32 Board Support Package
*   Libraries: `LoRa`, `mbedTLS`, `Adafruit_SSD1306`, `FreeRTOS`

### Installation & Flashing
1. Clone this repository:
   ```bash
   git clone https://github.com/krishnag-12/SPECTRE-Project.git
   ```

2. Open the project in your IDE (VS Code + PlatformIO recommended).
3. Connect the ESP32 to your development machine via USB.
4. Build and flash the firmware:
   ```bash
   pio run --target upload
   ```

## 📈 Future R&D Roadmap

The current prototype is undergoing continuous evaluation to bridge the gap toward defense-readiness. Upcoming features include:

* [ ] **ML-Based Jamming Detection:** Edge-AI integration to detect broadband jamming signatures and autonomously optimize topological routing paths.
* [ ] **Anti-Tamper Security:** Implementation of a Cryptographic Kill Switch (Zeroization protocol) to instantly wipe volatile AES keys and ECC architecture upon physical breach or capture.

## 👥 Core Development Team

This system is an academic engineering project developed at the **Department of Electronics and Communication Engineering, BMS College of Engineering, Bengaluru**.

* **Krishna Gupta** - Hardware Integration & Cryptographic Architecture
* **Kshitij D** - Network Topology & Link Budget Analysis
* **Dhruv Kumar Koshta** - Software Development & RTOS Optimization
## ⚠️ Disclaimer

S.P.E.C.T.R.E. is currently an R&D prototype developed for academic and conceptual evaluation. It is not approved for active tactical deployment or commercial sale without strict compliance with national defense regulations and spectrum authority clearance.
