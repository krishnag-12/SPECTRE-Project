# S.P.E.C.T.R.E. Tactical Command Center — Operational Setup & Flashing Guide

This guide provides step-by-step instructions for flashing firmware to ESP32 hardware nodes, running the C2 Gateway, and connecting the Tactical Command Center (TCC) dashboard to real hardware over USB serial.

---

## 1. System Architecture Overview

```
 +------------------------+        LoRa Mesh        +------------------------+
 |   ESP32 Field Node     | <---------------------> |   ESP32 Field Node     |
 | (spectre-main, C2=0)   |    AES-256 GCM SF7      | (spectre-main, C2=0)   |
 +------------------------+    FHSS 15-Channel       +------------------------+
             ^
             | LoRa Mesh (433 MHz, SF7, BW 250kHz, FHSS)
             v
 +------------------------+      USB Serial         +------------------------+
 |  ESP32 C2 Gateway      | ----------------------> |  SPECTRE TCC Dashboard |
 | (spectre-c2-gateway)   |   115200 Baud JSON      |  (spectre-dashboard)   |
 +------------------------+ <---------------------- +------------------------+
                                Command Write-Back
```

---

## 2. Prerequisites & Environment Setup

### Required Tools:
1. **Node.js** (v18 or v20+) and **npm**
2. **PlatformIO CLI** (`pio`) or **PlatformIO IDE extension** for VS Code
3. **USB-to-UART Drivers**: CP210x or CH340 drivers (depending on your ESP32 board)
4. **Hardware**:
   - 2x or 3x ESP32 Development Boards
   - SX1278 / SX1276 LoRa Transceiver Modules (SPI wiring: NSS=5, DIO0=26, RST=14, DIO1=35 for FHSS)
   - Micro-USB / USB-C Cables

---

## 3. Firmware Flashing Instructions

### Device 1: C2 Base Station Node (Connected to Dashboard Laptop)

The C2 Base Station acts as a serial gateway. It decrypts incoming LoRa packets from field nodes and emits clean, newline-delimited JSON telemetry to the TCC dashboard over USB.

1. Open [`spectre-main/src/main.cpp`](./spectre-main/src/main.cpp).
2. Ensure compiler flags at the top are set as follows:
   ```cpp
   #define SIMULATOR_MODE 0
   #define ENABLE_RADIO_TASK 1
   #define C2_BRIDGE_MODE 1          // Enables JSON serial bridge output
   #define NODE_ID "C2-Base"         // Callsign for base station
   ```
3. Connect the Base Station ESP32 to your PC via USB.
4. Flash using PlatformIO:
   ```bash
   cd spectre-main
   pio run --target upload
   ```

---

### Device 2: Field Nodes (Deployed Mesh Operators)

Field nodes run full UI menu state machines, send tactical alerts, and communicate over the encrypted LoRa mesh.

1. Open [`spectre-main/src/main.cpp`](./spectre-main/src/main.cpp).
2. Set compiler flags:
   ```cpp
   #define SIMULATOR_MODE 0
   #define ENABLE_RADIO_TASK 1
   #define C2_BRIDGE_MODE 0          // Standard mode with OLED display enabled
   #define NODE_ID "Alpha-1"         // Change callsign per device (e.g. Bravo-2, Charlie-3)
   ```
3. Connect the Field Node ESP32 to your PC via USB.
4. Flash using PlatformIO:
   ```bash
   cd spectre-main
   pio run --target upload
   ```
5. **4x4 Button Matrix Wiring** (see `keypad_matrix.h` for full key mapping):

   | Matrix Pin | ESP32 GPIO | Direction | Notes |
   |------------|-----------|-----------|-------|
   | R1 (Row 1) | GPIO 32 | OUTPUT | Active LOW scan |
   | R2 (Row 2) | GPIO 33 | OUTPUT | Active LOW scan |
   | R3 (Row 3) | GPIO 25 | OUTPUT | Active LOW scan |
   | R4 (Row 4) | GPIO 4 | OUTPUT | Active LOW scan |
   | C1 (Col 1) | GPIO 16 | INPUT_PULLUP | Internal pull-up |
   | C2 (Col 2) | GPIO 17 | INPUT_PULLUP | Internal pull-up |
   | C3 (Col 3) | GPIO 13 | INPUT_PULLUP | Internal pull-up |
   | C4 (Col 4) | GPIO 27 | INPUT_PULLUP | Internal pull-up |

   The matrix replaces the 3 individual navigation buttons and the 9 individual tactical buttons with a single 16-key layout. Keys S1-S3 are for Navigation, S4-S12 for Tactical Quick Messages, and S13-S16 are reserved.

---

### Device 3: Diagnostic Testbench (Mesh Receiver & Validator)

The diagnostic testbench node monitors airwaves, handles automatic ECDH key exchanges, decrypts traffic, and logs signal telemetry (RSSI/SNR).

1. Open [`spectre-testbench/src/main.cpp`](./spectre-testbench/src/main.cpp).
2. Connect the Testbench ESP32 to your PC via USB.
3. Flash using PlatformIO:
   ```bash
   cd spectre-testbench
   pio run --target upload
   ```
4. Monitor testbench serial logs:
   ```bash
   pio device monitor --baud 115200
   ```

---

### Device 4: Dedicated C2 Gateway (spectre-c2-gateway)

The dedicated C2 gateway firmware runs a headless (no OLED, no buttons) ESP32 that bridges the LoRa mesh to the TCC dashboard over USB serial. It includes the **Edge-AI jamming detection engine** and relays **remote anti-tamper zeroization** commands from the TCC dashboard to individual field nodes.

1. Connect the gateway ESP32 to your PC via USB.
2. Flash using PlatformIO:
   ```bash
   cd spectre-c2-gateway
   pio run --target upload
   ```
3. **Remote Anti-Tamper Zeroization:**
   No physical panic button is required on the C2 gateway. Zeroization is executed remotely from the TCC dashboard on a per-node basis (via the Node Telemetry table or C2 Panel). When triggered by the commander, the gateway transmits the encrypted `CMD:ZERO` command over LoRa to selectively wipe cryptographic keys on the targeted field node.

---

## 4. Running the SPECTRE TCC Dashboard

### Step 1: Install Dependencies
```bash
cd spectre-dashboard
npm install
```

### Step 2: Running the Dashboard

```bash
cd spectre-dashboard
npm run dev
```

Open `http://localhost:5173/` in **Google Chrome** or **Microsoft Edge**.

- **Simulated Hardware (Mock Mode):**
  The dashboard automatically starts with simulated data if no hardware is connected, allowing you to test UI components and radar rendering.

- **Live Serial Bridge Mode (Connected ESP32 Hardware):**
  1. Click **⚡ CONNECT** in the title bar.
  2. Select your ESP32's COM port from the browser's native serial port chooser.
  3. The status will change to **● LINK ACTIVE** and live telemetry will stream from the C2 Gateway.

*(Note: The legacy Electron app can still be launched via `npm run electron:dev` if a standalone desktop app is preferred).*

---

## 5. End-to-End Operational Verification Checklist

1. **Plug in C2 Base Station**: Connect the C2 ESP32 (`C2_BRIDGE_MODE=1`) to USB port on command laptop.
2. **Power on Field Node**: Power on Field ESP32 (`Alpha-1`).
3. **Key Exchange Protocol**:
   - On Field Node OLED menu, select `KEY EXCH TX`.
   - C2 Base Station and Testbench receive public key over `0xAC` frame and derive shared AES-256 secret key.
4. **Send Telemetry / Tactical Message**:
   - On Field Node, select `SITREP TX` or `MAYDAY TX`.
   - Packet is encrypted with AES-GCM and transmitted over LoRa (433 MHz).
5. **Verify Dashboard Ingestion**:
   - Base Station decrypts packet and outputs JSON:
     `{"nodeId":"Alpha-1","msgId":1,"hopCount":2,"status":"ACTIVE","posX":0,"posY":0,"rssi":-67,"snr":9.5,"anomalyScore":0.0,"payload":"Status nominal. Holding position.","timestamp":1720789200}`
   - `spectre-dashboard` serial bridge parses line and emits `telemetry_matrix` over Socket.IO.
   - Node `Alpha-1` appears on Radar Map and Telemetry Panel as `[PENDING APPROVAL]`.
6. **Command Authorization & Write-Back**:
   - Click `Alpha-1` on Radar Map or Roster List.
   - In `C2Panel`, click **APPROVE NODE FOR COMMAND CHANNEL**.
   - Trust state upgrades to `trusted`.
   - Click **PING** or **REKEY**.
   - Dashboard sends `CMD:PING:Alpha-1:<commandId>\n` over USB serial.
   - Base Station queues packet and returns ACK JSON:
     `{"kind":"ack","commandId":"...","nodeId":"Alpha-1","type":"PING","success":true,"outcomeCode":"ACKED","timestamp":...}`
   - Dashboard displays **COMMAND SUCCESS: ACKED**.
7. **Delay-Tolerant Networking (DTN) — Store-Carry-Forward** (requires `#define ENABLE_DTN 1`, the default, on two field nodes, e.g. `Alpha-1` and `Bravo-2`):
   - Confirm both field nodes have exchanged keys and can pass a normal message (steps 3–4).
   - **Induce a partition**: Power off (or carry out of range) the destination node `Bravo-2`.
   - **Transmit while unreachable**: On `Alpha-1`, address a `SITREP TX` to `Bravo-2`. Because `Bravo-2` has not been heard within `DTN_NODE_TIMEOUT_MS` (30 s), `Alpha-1` writes the *encrypted* packet to flash as `/dtn_XXXX.bin` rather than dropping it. The serial monitor shows a store log and the buffered count increments (bounded at `DTN_MAX_STORED_PACKETS` = 32).
   - **Verify persistence (optional)**: Reboot `Alpha-1`. On boot, `dtnInitStorage()` rescans SPIFFS, so the buffered packet and its auto-incrementing file-ID sequence survive the power cycle.
   - **Reconnect / data-mule dump**: Power `Bravo-2` back on (or bring it into range). Within `DTN_DUMP_INTERVAL_MS` (5 s) of `Alpha-1` next hearing a frame from `Bravo-2`, `Alpha-1` burst-transmits the buffered packet (one per dump cycle, to respect duty cycle and FHSS hopping) and deletes the flash copy.
   - **Confirm delivery**: `Bravo-2` receives, decrypts, and displays the delayed SITREP; the buffered count on `Alpha-1` returns to zero. The payload was never decrypted while stored — COMSEC is preserved end-to-end.
8. **9 Tactical Quick Messages Transmission** (requires 9 Tactical Quick Messages buttons wired on field nodes):
   - Default mode is **BROADCAST**. Press any Tactical Quick Message button (L1–L9) to immediately transmit that Tactical Quick Message line.
   - OLED shows `Tactical Quick Message LINE <N> / <LABEL> / TX BROADCAST / SENT` confirmation for 1.2s.
   - **Verify on C2 Gateway**: The Base Station outputs Tactical Quick Message-enriched JSON:
     `{"kind":"tactical","nodeId":"Alpha-1","msgId":209,"hopCount":3,"tacticalLine":1,"tacticalMode":"B","tacticalTarget":"*","status":"ACTIVE","rssi":-65,"snr":9.5,"payload":"Tactical Quick Message:L1:B:*:GRID TBD","timestamp":...}`
   - **Individual mode**: Navigate to `Tactical Quick Message CFG` on the main menu, select `INDIVIDUAL`, choose a target node. Subsequent Tactical Quick Message button presses address that specific node while the C2 gateway still receives the message.

---

## 6. Standalone Desktop Installer Build

To build a production `.exe` / `.AppImage` installer for field laptops:
```bash
cd spectre-dashboard
npm run dist:electron
```
The output installer artifacts will be stored in `spectre-dashboard/dist-electron/`.
