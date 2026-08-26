# S.P.E.C.T.R.E. Full Project Implementation Plan

This document outlines the current state of the S.P.E.C.T.R.E. repository and the definitive roadmap for implementing the advanced Phase 2 deliverables before the final pitch on August 14th. 

## 1. Current Completion Status

Based on an architectural review of the `spectre-main` and `spectre-dashboard` directories, the following foundation is verified as **COMPLETE**:

### Firmware (`spectre-main`)
- **Hardware Integration:** ESP32 and SX1278 LoRa SPI routines are wired.
- **Cryptographic Engine:** `mbedTLS` library is successfully linked. ECDH public/private key generation, AES-256-GCM encryption/decryption, and SHA256 hashing are functional in `main.cpp`.
- **RTOS Architecture:** Core FreeRTOS structures exist (Task queues, `ENABLE_RADIO_TASK`).
- **Physical Layer Parameters:** LPD constraints (SF7, 250 kHz Bandwidth) are hardcoded.
- **Node Identity:** `NODE_ID` macro provides static compile-time callsigns embedded in LoRaPacket headers.

### Command & Control (C2) Dashboard (`spectre-dashboard`)
- **Frontend UI:** The React-based user interface (TypeScript), Canvas radar map, and command panels are fully built.
- **Mock Telemetry:** The Electron app successfully runs in simulated mode via `mock-serial.ts`, validating the Socket.IO data flow.
- **Live Serial Bridge:** `serial-bridge.ts` implements line-buffered JSON ingestion from USB serial, Socket.IO telemetry emission, IPC port management, command write-back, and command acknowledgment protocol.
- **Electron Packaging:** `electron-builder` configuration with `dist:electron` script for standalone `.exe`/`.AppImage` builds.

---

## 2. Implementation Roadmap

### Sprint A: C2 Gateway Live Hardware Integration — ✅ COMPLETE

*(All Sprint A deliverables verified and integrated.)*

#### [MODIFY] `spectre-dashboard/electron/serial-bridge.ts` — ✅ COMPLETE
- [x] Build the Node.js serial module using the `serialport` package (115200 baud).
- [x] Ingest real telemetry from the USB stream, parse the JSON, and bridge it to React via Socket.IO.
- [x] Implement command write-back logic (e.g., `CMD:ZERO:Alpha-1\n`).

#### [MODIFY] `spectre-main/src/main.cpp` (Soldier Terminal Firmware) — ✅ COMPLETE
- [x] Implement static `#define NODE_ID "Alpha-1"` callsigns for the field nodes to transmit.

#### [MODIFY] `spectre-c2-gateway/src/main.cpp` (Dedicated C2 Gateway Firmware) — ✅ COMPLETE
- [x] Convert the testbench project into the dedicated firmware for the Commander's dashboard ESP32.
- [x] Strip out any UI/OLED rendering logic to save resources, as the Electron app handles the UI.
- [x] Program it to decrypt incoming AES LoRa payloads and print them to the USB serial port as clean, newline-delimited JSON strings.
- [x] Add a serial RX task to ingest commands from the Electron dashboard and broadcast them out over the LoRa mesh.
- [x] There should be an option to connect the hardware (esp32) on the dashboard (Dashboard UI for connection is complete, waiting for the hardware firmware).

### Sprint B: Cryptographic FHSS & The Rendezvous Problem — ✅ COMPLETE

#### [MODIFY] `spectre-main/src/main.cpp`
- [x] **Dynamic DIO Mapping:** Refactored LoRa interrupt handlers with `RadioState` enum to dynamically switch between `RXDone` (DIO0 in RX mode) and `CADDone/CADDetected` (DIO0/DIO1 in CAD mode). DIO1 wired to GPIO 35.
- [x] **The CAD Sweep State Machine:** Implemented `fhssCadSweep()` — an asynchronous LoRa CAD sweep across 15 channels in the Core 0 FreeRTOS task. Each channel scan completes in ~1.174ms at SF7.
- [x] **The Sync Strobe:** Implemented `fhssTransmitSyncStrobe()` with 37-symbol extended preamble for mesh-join key exchange broadcasts, guaranteeing intersection with a scanning receiver (37 > 15 × 2.4 = 36 symbols).
- [x] **CSPRNG Hopping:** Implemented `fhssSeedFromAESKey()` + `fhssGenerateHopSequence()` using Fisher-Yates shuffle seeded by `mbedtls_ctr_drbg` from the derived AES-256 shared secret. Both nodes sharing the same key produce identical, synchronized hop schedules.
- [x] **Channel Pool:** 15 non-overlapping channels (433.050–437.250 MHz, 300 kHz spacing) with rendezvous channel (Ch 0) for pre-key-exchange operation.
- [x] **Compile-time toggle:** `#define ENABLE_FHSS 1` — set to 0 to disable FHSS and revert to static single-channel operation.

### Sprint C: Delay-Tolerant Networking (DTN) — ✅ COMPLETE

#### [MODIFY] `spectre-main/src/main.cpp`
- [x] **Non-Volatile Storage:** Initialize `SPIFFS` on the ESP32 via `dtnInitStorage()` (format-on-first-mount). On boot it rescans the flash root for existing `dtn_XXXX.bin` files and resumes the auto-incrementing file-ID sequence so buffered packets survive a reboot.
- [x] **Store-Carry-Forward:** When a packet exhausts its hop budget without reaching a reachable destination, `dtnStorePacket()` writes a `DtnStoredHeader` (target node ID, `millis()` timestamp, length) followed by the raw encrypted `LoRaPacket` blob to `/dtn_XXXX.bin`. Node reachability is tracked in an 8-slot presence table (`dtnUpdateNodePresence`/`dtnIsNodeReachable`) with a 30 s timeout (`DTN_NODE_TIMEOUT_MS`) and oldest-node eviction. Storage is bounded by a 32-packet logical cap (`DTN_MAX_STORED_PACKETS`) plus a raw SPIFFS free-space guard.
- [x] **Data Mule Dump:** The Core 0 radio task calls `dtnDumpOnePacket()` every `DTN_DUMP_INTERVAL_MS` (5 s). When a stored packet's target reappears in the mesh, it is burst-transmitted (one packet per call, to respect channel fairness / duty cycle and FHSS hopping) and the file is deleted. Corrupt/oversized headers are dropped safely rather than read into the stack buffer.
- [x] **Cross-core-version portability:** `dtnBaseName`/`dtnIsStoredFile`/`dtnFullPath`/`dtnParseFileId` normalize the differing `File::name()` semantics between arduino-esp32 core 1.0.x (full path) and 2.x/3.x (basename), so the store works regardless of the installed core.
- [x] **Compile-time toggle:** `#define ENABLE_DTN 1` — set to 0 to disable DTN and revert to drop-on-unreachable. DTN code is guarded `#if ENABLE_DTN && !SIMULATOR_MODE` since store-carry-forward requires the radio.
### OLED Logo & Idle Screensaver — ✅ COMPLETE

#### [NEW] `spectre-main/src/spectre_logo.h`
- [x] **Vector Logo Renderer:** The geometric S.P.E.C.T.R.E. "M" icon is drawn via `drawLine()` calls for pixel-perfect crispness on the monochrome SSD1306 (no bitmap blob, zero flash overhead for image data).
- [x] **Boot Splash:** `drawSpectreBootScreen()` displays the logo + `SYSTEM ONLINE` + `v2.0 [SECURED]` for 2.5 seconds at power-on.
- [x] **Standby Screensaver:** `drawSpectreLogo()` displays the logo + `TACTICAL MESH` after `IDLE_TIMEOUT_MS` (30 s) of no button presses or incoming messages.

#### [MODIFY] `spectre-main/src/main.cpp`
- [x] **Idle Timer:** `lastActivityMs` tracks the last user/RX event. `resetIdleTimer()` is called on every button press and incoming radio message.
- [x] **Wake Logic:** First button press during screensaver wakes the display (no menu action processed). Incoming RX messages during screensaver are displayed immediately.
- [x] **Seamless Integration:** Screensaver respects `C2_BRIDGE_MODE` (no OLED on gateway) and `composePending` state (no screensaver while TX confirmation is showing).

### Sprint D: Edge-AI Jamming Detection & Anti-Tamper

#### [NEW] `spectre-main/src/ml_anomaly.cpp`
- Train a lightweight Isolation Forest model (e.g., via Edge Impulse) using nominal RSSI and SNR data.
- Deploy the C++ inference engine to the ESP32 to flag anomalous RF noise floors indicative of broadband jamming.

#### [MODIFY] `spectre-main/src/main.cpp`
- **Zeroization Interrupt:** Wire the "panic switch" GPIO pin to an NMI (Non-Maskable Interrupt).
- The ISR must instantly overwrite the `AES_KEY` array and `mbedtls` contexts with random noise, effectively bricking the device's COMSEC capabilities upon physical compromise.

---

## 3. Implementation Feasibility: Overcoming the 1% Duty Cycle

**Is there any issue with the 1% Duty Cycle of LoRa in our project?**

To give you a candid, defense-grade evaluation: Yes, the 1% duty cycle is a massive bottleneck for standard civilian mesh networks, but your specific architecture provides two major loopholes that neutralize the issue.

Here is the technical breakdown of how the 1% duty cycle impacts S.P.E.C.T.R.E., and how your design already defeats it.

### The Mathematics of the 1% Duty Cycle
The 1% duty cycle is a civilian telecommunications law (enforced by the WPC in India and ETSI in Europe for ISM bands). It mandates that if a device transmits for $X$ milliseconds, it must remain silent for $99X$ milliseconds before transmitting again.
- **Your Time-on-Air (ToA):** 88 milliseconds.
- **The Legal Silence Penalty:** $88 \text{ ms} \times 99 = 8.7 \text{ seconds}$.

### 1. Where the 1% Rule Hurts You: The Mesh Bottleneck
If S.P.E.C.T.R.E. were a static, single-channel network, the 8.7-second silence penalty would be tactically fatal for your Store-and-Forward Mesh. If an intermediate relay node receives three distinct messages from three different squads that it needs to forward over the mountain, it would have to wait 8.7 seconds between rebroadcasting each packet. Clearing a 3-packet queue would take nearly 30 seconds. That introduces unacceptable latency for a "real-time" Command & Control (C2) link.

### 2. How You Defeat It (The Engineering Loophole)
**You implemented Cryptographic Frequency Hopping Spread Spectrum (FHSS).**
Spectrum regulations generally apply the 1% duty cycle limit *per channel* or *per sub-band*, not globally across the entire RF transceiver. Because your nodes are dynamically hopping across a pool of 15 different channels based on the AES-seeded CSPRNG, a relay node does not have to wait 8.7 seconds. It transmits Packet 1 on Channel A, instantly hops to Channel B to transmit Packet 2, and hops to Channel C for Packet 3. By distributing your transmission energy across a wide frequency pool, your effective duty cycle capacity scales linearly, entirely eliminating the mesh bottleneck.

### 3. The Tactical Reality (The Defense Loophole)
When you pitch this to DRDO or present it at your Synopsis Review, you must address the context of the deployment. The 1% duty cycle is a civilian commercial regulation designed to prevent smart meters and consumer IoT devices from crowding the public ISM spectrum. Military hardware operating in contested A2/AD combat zones does not adhere to civilian spectrum regulations. When a defense organization like DRDO deploys a system like S.P.E.C.T.R.E., they do not use the unlicensed 433 MHz ISM band. They operate on dedicated, classified, military-allocated UHF spectrums where civilian duty-cycle laws simply do not exist. Your hardware is physically capable of transmitting continuously; the 1% limit is merely a software/legal restriction.
