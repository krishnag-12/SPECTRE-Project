# S.P.E.C.T.R.E.
**Secure Portable Encrypted Communication Terminal for Remote Environments**

![Status](https://img.shields.io/badge/Status-Active_R%26D-brightgreen)
![Version](https://img.shields.io/badge/Version-1.0_Prototype-blue)
![Platform](https://img.shields.io/badge/Hardware-ESP32-orange)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

## 📌 Overview
S.P.E.C.T.R.E. is a highly ruggedized, infrastructure-independent, cryptographic tactical terminal engineered to deploy a self-healing, decentralized mesh network. Designed for operations in contested Anti-Access/Area Denial (A2/AD) environments, it bypasses the need for centralized C2 infrastructure (Cellular LTE/5G, SATCOM, VHF/UHF trunked systems) which are highly vulnerable to kinetic strikes and broadband spectrum jamming.

By leveraging Long Range (LoRa) Chirp Spread Spectrum (CSS) modulation and a dual-core FreeRTOS architecture, S.P.E.C.T.R.E. achieves resilient, off-grid communication with military-grade operational security (OPSEC).

## 🛡️ Core Tactical Features
*   **Infrastructure Independence:** 100% off-grid deployment utilizing a deterministic, ad-hoc Store-and-Forward flood routing protocol. Bypasses physical line-of-sight constraints.
*   **Zero-Trust Cryptography (COMSEC):** Executes dynamic Elliptic-Curve Diffie-Hellman (ECDH) key exchanges on the SECP256R1 curve. Payloads are authenticated and encrypted via AES-256-GCM to prevent traffic analysis, spoofing, and replay attacks.
*   **Low Probability of Detection (LPD):** Mathematical optimization of physical layer parameters (SF7, 250 kHz Bandwidth) compresses fully encrypted tactical payloads into sub-100-millisecond transmission bursts, severely degrading adversary Radio Direction Finding (RDF) capabilities.
*   **Electronic Counter-Countermeasures (ECCM):** CSS modulation provides extreme processing gain, allowing successful payload demodulation even when signal strength drops below the thermal noise floor.

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
* [ ] **C2 Gateway Integration:** A centralized gateway node featuring Blue Force Tracking (BFT) for real-time situational awareness and unit deployment visualization.
* [ ] **Anti-Tamper Security:** Implementation of a Cryptographic Kill Switch (Zeroization protocol) to instantly wipe volatile AES keys and ECC architecture upon physical breach or capture.

## 👥 Core Development Team

This system is an academic engineering project developed at the **Department of Electronics and Communication Engineering, BMS College of Engineering, Bengaluru**.

* **Krishna Gupta** - Hardware Integration & Cryptographic Architecture
* **Kshitij D** - Network Topology & Link Budget Analysis
* **Dhruv Kumar Koshta** - Software Development & RTOS Optimization
## ⚠️ Disclaimer

S.P.E.C.T.R.E. is currently an R&D prototype developed for academic and conceptual evaluation. It is not approved for active tactical deployment or commercial sale without strict compliance with national defense regulations and spectrum authority clearance.
