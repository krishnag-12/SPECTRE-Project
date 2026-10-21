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

### 9 Tactical Quick Messages — ✅ COMPLETE

#### [NEW] `spectre-main/src/spectre_tactical.h`
- [x] **9 Tactical Data Model:** Indian military tactical standard commands (CONTACT, SATHI GHAYAL, MAYDAY, LZ CLEAR, LZ HOT, TGT SPOTTED, SITREP, WILCO, OUT).
- [x] **GPIO Pin Mapping:** 9 dedicated physical buttons on GPIOs 4, 16, 17, 13, 12, 27, 2, 15, 34. GPIO 34 is input-only (external pull-up). All others use `INPUT_PULLUP`.
- [x] **Payload Format:** `TAC:L<n>:<B|I>:<target>:<data>` — structured, parseable, fits within `MAX_PAYLOAD_LEN`.
- [x] **Message ID Range:** `0xD1–0xD9` (no collision with existing IDs).
- [x] **Parser Helpers:** `tacParseLineNumber()`, `tacParseMode()`, `tacParseTarget()`.

#### [MODIFY] `spectre-main/src/main.cpp`
- [x] **Tactical Button Handler:** Separate `handleTacButtonEvent()` with AceButton debouncing on a dedicated `ButtonConfig`. Press → build payload → queue `MessageEvent` → show OLED confirmation → auto-return to main menu after 1.2s.
- [x] **TX Mode State:** `tacTxMode` (BROADCAST/INDIVIDUAL), `tacTargetNode`. Default: BROADCAST.
- [x] **Menu Integration:** `TAC MSG CFG` entry in main menu → BROADCAST/INDIVIDUAL selection → target node picker (7 known nodes). Existing menu patterns reused.
- [x] **RX Tactical Display:** `drawInbox()` detects Tactical payloads and shows structured `TAC MSG L<n>` header with line label and data.
- [x] **Main Menu Scrolling:** Menu now scrolls (7 items, 6 visible lines) to accommodate the new `TAC MSG CFG` entry.

#### [MODIFY] `spectre-c2-gateway/src/main.cpp`
- [x] **Tactical-Aware JSON:** Gateway detects Tactical payloads and emits enriched JSON with `kind:"tactical"`, `tacLine`, `tacMode`, `tacTarget` fields. Non-tactical messages unchanged.

### Sprint D: Edge-AI Jamming Detection & Anti-Tamper — ✅ COMPLETE

#### [NEW] `rf-jamming-detection/export_esp32_model.py`
- [x] **Model Export Pipeline:** Generates synthetic RF telemetry (108k samples, 3 nodes), injects barrage/spot/pulse jamming attacks, engineers 8 reduced features, trains Isolation Forest (100 trees, max_samples=256), exports as C header arrays.
- [x] **8 Reduced Features:** rssi, snr, noise_floor, rssi_delta, noise_floor_delta, rssi_roll_mean_10, rssi_roll_std_10, noise_floor_roll_std_10.
- [x] **Model Performance:** Accuracy 0.9012, Precision 0.6257, Recall 0.9074, F1 0.7407, ROC AUC 0.9585.
- [x] **Validation:** Exported C model verified against Python inference (0 out-of-range scores).

#### [NEW] `spectre-c2-gateway/src/if_model_data.h`
- [x] **Auto-generated model data:** 100 IF trees (max 259 nodes/tree), scaler mean/std arrays, IFNode struct, c(n) normalization constant. ~827 KB header.

#### [NEW] `spectre-c2-gateway/src/anomaly_engine.h`
- [x] **RingBuffer<float, 10>:** Fixed-size circular buffer for rolling statistics.
- [x] **FeatureExtractor:** Maintains ring buffers for RSSI and noise_floor, computes 8-feature vector.
- [x] **StandardScaler:** Normalizes features using embedded mean/std from model export.
- [x] **IsolationForest:** Iterative tree traversal (no recursion), averages path length, outputs anomaly score 0.0–1.0.
- [x] **EWMA Smoothing:** α=0.3 exponential smoothing to reduce score jitter.
- [x] **Cold-start guard:** Returns 0.0 until ring buffer has ≥10 samples.

#### [NEW] `spectre-c2-gateway/src/zeroize.h`
- [x] **Panic GPIO ISR:** GPIO 4, INPUT_PULLUP, FALLING edge interrupt.
- [x] **Wipe sequence:** memset AES_KEY → esp_fill_random overwrite → keyExchangeComplete=false → mbedtls_ecdh_free → mbedtls_ctr_drbg_free → mbedtls_entropy_free.
- [x] **IRAM_ATTR:** ISR runs from IRAM, not flash cache. < 1ms execution.

#### [MODIFY] `spectre-c2-gateway/src/main.cpp`
- [x] **Includes:** Added `anomaly_engine.h` and `zeroize.h`.
- [x] **AnomalyEngine global:** Instantiated as `static AnomalyEngine anomalyEngine`.
- [x] **Live anomalyScore:** All 3 JSON emission paths (key-exchange, tactical, regular) now call `anomalyEngine.computeScore(rssi, snr)` instead of hardcoded 0.0.
- [x] **Tactical JSON fix:** Added missing `anomalyScore`, `posX`, `posY` fields for schema consistency.
- [x] **Zeroization init:** `initZeroize(ZEROIZE_PIN)` called in `setup()` after crypto init.
- [x] **AES_KEY/keyExchangeComplete:** Removed `static` qualifier for `extern` access from zeroize.h.

---

### Sprint E: GPS-Denied RF Path-Loss Distance & Sector Tracking — ✅ COMPLETE

#### Overview
Replaces vulnerable, foreign-controlled, and easily jammed/spoofed satellite GPS with passive, sovereign RF physics derived directly from the SX1278 hardware layer.

#### 1. Mathematical Path-Loss Model (LoRa Signal Physics)
Signal attenuation over tactical terrain is computed via the Log-Distance Path Loss Model:
$$\text{RSSI}(d) = \text{RSSI}_0 - 10 \cdot n \cdot \log_{10}\left(\frac{d}{d_0}\right)$$
Solving for distance $d$:
$$d = d_0 \cdot 10^{\frac{\text{RSSI}_0 - \text{RSSI}}{10 \cdot n}}$$
- $\text{RSSI}_0 \approx -42\text{ dBm}$: Calibrated reference signal at $d_0 = 1\text{ m}$ for SX1278 at $+17\text{ dBm}$ TX power.
- $n \approx 2.4$: Empirical tactical path loss exponent (suburban/rural foliage & terrain).
- **Distance Bands**:
  - $-45$ to $-55\text{ dBm} \rightarrow 15 - 35\text{ m}$ (Inner 50m radar ring)
  - $-60$ to $-75\text{ dBm} \rightarrow 50 - 90\text{ m}$ (50m–100m radar ring)
  - $-80$ to $-95\text{ dBm} \rightarrow 120 - 240\text{ m}$ (100m–250m radar ring)
  - $-100$ to $-115\text{ dBm} \rightarrow 280 - 460\text{ m}$ (250m–500m outer radar ring)

#### 2. Tactical Squad Sector Bearings (SOP Fireteam Radials)
Field fireteams operate along pre-assigned tactical vectors relative to Command Base (C2):
- `Alpha-1`: Point / Lead Scout $\rightarrow$ Bearing $045^\circ$ (North-East)
- `Bravo-2`: Rear Guard / Flank $\rightarrow$ Bearing $225^\circ$ (South-West)
- `Charlie-3`: Left Flank $\rightarrow$ Bearing $315^\circ$ (North-West)
- Relative Cartesian Coordinates:
  $$posX = d \cdot \sin(\theta), \quad posY = d \cdot \cos(\theta)$$

#### 3. Gateway Firmware & Dashboard Integration
- [x] In `spectre-c2-gateway/src/main.cpp`: Implement `calculateRfDistance(float rssi)` and sector bearing table.
- [x] Replace hardcoded `posX: 0.0, posY: 0.0` with calculated $(posX, posY)$ in all outgoing serial JSON streams.
- [x] In `spectre-dashboard/src/components/RadarMap.tsx`: Nodes dynamically move along their assigned radials across distance rings in real-time as physical distance changes.

---

### Sprint F: MPU-6050 Ballistic Shock & Casualty Detection (Automated Dead Man's Switch) — ⏸️ ON HOLD (Deferred Future Scope)

#### Tactical Problem
If a soldier is shot dead or incapacitated:
1. They cannot manually send a Mayday (`TAC MSG 1`) or press a panic zeroize button.
2. The terminal risks enemy capture, giving adversaries access to cryptographic key material, stored DTN messages, and tactical mesh traffic.
3. The C2 Command Unit has no immediate automated notification of casualty status to authorize remote zeroization (`CMD:ZERO:<nodeId>`) or dispatch a Quick Reaction Force (QRF).

#### False-Positive Discrimination Challenge
The sensor must reliably separate lethal ballistic impacts from normal tactical combat dynamics:
- **Friendly Weapon Recoil**: High momentary acceleration spike ($> 8-16g$), but immediate continuous voluntary soldier movement (aiming, stance retention, posture variance).
- **Taking Cover / Diving Prone**: Deceleration shock ($3-6g$), but followed by active breathing, crawling, posture adjustments, or weapon tracking.
- **Close Quarters Combat (CQC)**: Violent multi-axis movement, but continuous high gyroscope/accelerometer variance.
- **Ballistic Incapacitation Signature**: High-transient kinetic shock $\rightarrow$ uncoordinated collapse trajectory $\rightarrow$ **Prolonged Flaccid Immobility (Atonia)**.

#### 1. Three-Phase State Machine Architecture
```
 [ State 0: ACTIVE ]
         │
         ▼ (Kinetic Shock: |a| > 12g && da/dt > threshold)
 [ State 1: BALLISTIC_SHOCK_DETECTED ]
         │
         ▼ (Posture Collapse: Gyro delta > 90° pitch/roll change)
 [ State 2: COLLAPSE_VERIFIED ]
         │
         ▼ (Start 12-second Atonia Monitoring Window)
 [ State 3: MONITORING_ATONIA ] ──────(Motion detected: Var(a) > ε)──────► [ State 0: ACTIVE ] (False Alarm)
         │
         ▼ (Zero motion for 12 seconds: Var(a) < ε)
 [ State 4: CASUALTY_CONFIRMED ]
         │
         ├──► Local 5s Haptic/Buzzer Grace Window (Soldier can cancel by pressing any matrix key)
         │
         ▼ (Grace window expires)
 [ State 5: TRANSMIT_KIA_ALERT ]
         │
         ├──► Broadcasts encrypted emergency packet: TAC:INCAPACITATED:<NODE_ID>
         ├──► C2 Dashboard triggers critical alarm + immediate ONE-CLICK ZEROIZE prompt
         └──► Starts local 45s fail-safe countdown to autonomous hardware self-zeroization
```

#### 2. Advanced Multi-Sensor Fusion Roadmap
To achieve defense-grade $>99.9\%$ classification accuracy without false zeroization:
1. **MPU-6050 6-Axis Motion Engine**:
   - Accelerometer: $\pm 16g$ dynamic range (I2C address `0x68`, shared with SSD1306 on Wire `GPIO 21/22`).
   - Digital Low Pass Filter (DLPF) set to 44 Hz to isolate sharp ballistic impulses from human tremors.
   - Computes rolling variance $\text{Var}(a) = \frac{1}{N} \sum (a_i - \bar{a})^2$ over a 12-second window to detect true post-impact flaccid immobility (atonia).
2. **Optical PPG Pulse / SpO2 Sensor (MAX30102)**:
   - Mounted in tactical wrist strap or glove.
   - Cross-verifies ballistic shock against real-time physiological vitals: sudden pulse cessation / severe arrhythmia confirms immediate casualty.
3. **Conductive Armor Plate Penetration Mesh**:
   - Thin conductive trace woven into the soldier's body armor plate carrier connected to a dedicated ESP32 interrupt pin (`GPIO`).
   - Bullet or shrapnel physically severs the trace $\rightarrow$ instant hardware-level ballistic penetration trigger.
4. **Body Proximity & Skin Temperature Thermistor**:
   - Detects if the device has been stripped off the soldier's body (cold drop detection).
5. **Two-Stage Autonomous Self-Zeroization Protocol**:
   - If radio is jammed or out-of-range of C2, the terminal enters a local 45-second countdown.
   - If the soldier does not enter a tactical PIN on the 4x4 matrix before the countdown reaches zero, the ESP32 automatically wipes RAM keys, clears flash preferences, formats SPIFFS, and permanently bricks itself.

---

### Sprint G: Live Cryptographic Pipeline Inspector & Anti-Tamper Test Bench (AES-256-GCM) — ✅ COMPLETE

#### Academic & Reviewer Requirement
Project guides and academic evaluators require visible, mathematical proof that communications over the tactical mesh are not plain text strings, but hardware-accelerated **AES-256-GCM** ciphertext protected by a 128-bit authentication tag. Furthermore, evaluators expect an interactive demonstration of **Man-in-the-Middle (MitM) Tamper Detection** to verify that unauthorized bit-flipping over the air is instantly rejected.

#### 1. Architectural Pipeline & Data Flow
1. **ESP32 Gateway Firmware (`spectre-c2-gateway/src/main.cpp`)**:
   - Extract and hex-encode raw cryptographic artifacts directly from incoming `LoRaPacket`:
     - `iv` (12-byte CSPRNG Nonce / Initialization Vector) $\rightarrow$ 24 hex characters.
     - `tag` (16-byte Galois GMAC Authentication Tag) $\rightarrow$ 32 hex characters.
     - `encrypted` (Raw ciphertext payload bytes) $\rightarrow$ hex dump string.
     - `authOk` (mbedTLS GCM verification status: `true` / `false`).
     - `rawFrameHex` (Complete physical RF frame: `0xAB` Magic Byte, Header, IV, Tag, Ciphertext).
   - Emit an enriched `crypto` sub-object inside the serial JSON stream.
2. **Dashboard Bridge & Types (`types.ts`, `webSerialBridge.ts`, `serial-bridge.ts`)**:
   - Extend `TelemetryPacket` interface with optional `crypto: CryptoTelemetry` block:
     ```typescript
     export interface CryptoTelemetry {
       algo: 'AES-256-GCM';
       iv: string;
       tag: string;
       ciphertext: string;
       tagMatch: boolean;
       rawFrameHex?: string;
     }
     ```
   - Retain backward compatibility with existing telemetry streams while parsing extended crypto blocks.
3. **Dashboard UI: Live Cryptographic Pipeline Inspector Modal / Panel**:
   - **6-Stage Visual Pipeline**:
     - *Stage 1:* Over-the-Air LoRa RF Frame Ingestion (`0xAB` Magic Byte, Message ID, Node ID).
     - *Stage 2:* CSPRNG 96-bit Nonce / IV Extraction (`esp_fill_random` output).
     - *Stage 3:* AES-256 Galois Counter Mode (GCM) Ciphertext Stream (Hex Dump).
     - *Stage 4:* Galois Authentication Tag (128-bit GMAC) Integrity Verification (`AUTHENTICATED ✓`).
     - *Stage 5:* Hardware Decryption & Plaintext Recovery (`mbedtls` hardware engine on ESP32).
   - **Interactive 1-Bit Ciphertext Tamper Sandbox**:
     - Allows evaluator or student to type arbitrary plaintext and encrypt it in real time.
     - One-click **"Flip 1 Bit in Ciphertext"** button (e.g., `0x9C` $\rightarrow$ `0x9D`).
     - Live Galois Hash (GHASH) verification failure: `[ ❌ CRITICAL: GMAC AUTHENTICATION TAG MISMATCH // TAMPER DETECTED ]`.
     - Packet dropped immediately without processing, proving defense against replay and MitM modifications.

---

### Sprint H: Live Edge-AI Jamming Analysis & EW Threat Simulation Console (Isolation Forest) — ✅ COMPLETE

#### Evaluator Problem in Benign Laboratory Environments
In a standard college laboratory, the ambient RF spectrum is quiet and unjammed (ambient $\text{RSSI} \approx -70\text{ dBm}, \text{SNR} \approx +8.5\text{ dB}$), resulting in a low nominal anomaly score ($0.30 - 0.38$, `CLEAR`). Without high-power RF jammers (which are illegal and restricted in civilian environments), evaluators cannot see the ML model detecting attacks live.

#### 1. Architectural Pipeline & Diagnostics
1. **ESP32 Gateway Firmware (`spectre-c2-gateway/src/main.cpp` & `anomaly_engine.h`)**:
   - Expose the 8 engineered RF features extracted from SX1278 hardware registers in serial JSON:
     - $f_0$: `rssi` (dBm)
     - $f_1$: `snr` (dB)
     - $f_2$: `noise_floor` ($\text{RSSI} - \text{SNR}$)
     - $f_3$: `rssi_delta` ($\Delta\text{RSSI}$)
     - $f_4$: `noise_floor_delta` ($\Delta\text{NF}$)
     - $f_5$: `rssi_roll_mean_10` (10-packet rolling mean)
     - $f_6$: `rssi_roll_std_10` (10-packet rolling standard deviation)
     - $f_7$: `nf_roll_std_10` (10-packet noise floor rolling standard deviation)
   - Expose tree traversal metrics:
     - 100-tree Average Path Length $E(h(x))$, normalization constant $c(n) = 11.45$, raw anomaly score, and EWMA smoothed score ($\alpha = 0.3$).
   - Implement serial command `CMD:TEST_JAM:<MODE>`: Ingests synthetic RF values directly into the ESP32 microcontroller's C++ `AnomalyEngine`, proving execution happens on the physical chip.
2. **Dashboard UI: Edge-AI EW Threat Console Modal / Panel**:
   - **Live 8-Feature Vector Cards & Gauges**: Dynamic visualization of all 8 features with normal vs anomalous thresholds.
   - **Isolation Forest Tree Metrics & Score Dial**:
     - Visual dial gauge ($0.0 \rightarrow 1.0$) with 4-tier tactical threat classification:
       - $s < 0.60$: 🟢 **CLEAR / NOMINAL**
       - $0.60 \le s < 0.75$: 🟡 **ELEVATED / SUSPICIOUS**
       - $0.75 \le s < 0.85$: 🟠 **SPOT / PULSE JAMMING PROBABLE**
       - $s \ge 0.85$: 🔴 **BARRAGE JAMMING ACTIVE (CRITICAL EW THREAT)**
   - **Real-Time Moving Anomaly Timeline Graph**: Visualizing score trends with color-coded threat zones.
   - **Interactive EW Attack Injector / Test Bench (Live Demo Mode)**:
     - Button 1: **[Inject Barrage Jamming]** — High noise floor ($>-50\text{ dBm}$), SNR crashes ($<-10\text{ dB}$) $\rightarrow$ score spikes to $0.93$ $\rightarrow$ flashes red alarm and sounds tactical warning.
     - Button 2: **[Inject Spot Jamming]** — Targeted channel degradation, sudden $\Delta\text{RSSI} > 25\text{ dBm}$ $\rightarrow$ score climbs to $0.82$.
     - Button 3: **[Inject Pulse Jamming]** — Intermittent power bursts, high $\sigma_{\text{NF}}$ $\rightarrow$ score oscillates around $0.78$.
     - Button 4: **[Clear Spectrum / Restore Nominal]** — Returns to ambient baseline $\rightarrow$ EWMA smoothing filter smoothly decays score back to green ($< 0.40$).
   - **Physical Hardware Demonstration Guide**:
     - Faraday attenuation test (wrapping transmitter antenna in aluminum foil to induce sharp RSSI drops and variance spikes).
     - Channel contention test (rapid concurrent key exchange broadcasts to induce packet collisions and SNR collapse).

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
