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
5. **9 Tactical Quick Messages Button Wiring** (see `spectre_tactical.h` for pin definitions):

   | Button | Line | ESP32 GPIO | Notes |
   |--------|------|-----------|-------|
   | L1 | Location | GPIO 4 | `INPUT_PULLUP`, active LOW |
   | L2 | Comms | GPIO 16 | `INPUT_PULLUP`, active LOW |
   | L3 | Patients | GPIO 17 | `INPUT_PULLUP`, active LOW |
   | L4 | Special Equip | GPIO 13 | `INPUT_PULLUP`, active LOW |
   | L5 | Patient Type | GPIO 12 | `INPUT_PULLUP`, active LOW (boot strapping pin) |
   | L6 | Security | GPIO 27 | `INPUT_PULLUP`, active LOW |
   | L7 | Marking | GPIO 2 | `INPUT_PULLUP`, active LOW (onboard LED) |
   | L8 | Nationality | GPIO 15 | `INPUT_PULLUP`, active LOW |
   | L9 | CBRN/Terrain | GPIO 34 | **Input-only, requires external 10kΩ pull-up to 3.3V** |

   Wire each button between the GPIO pin and GND. All GPIOs except GPIO 34 use internal pull-ups.

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

## 4. Running the SPECTRE TCC Dashboard

### Step 1: Install Dependencies
```bash
cd spectre-dashboard
npm install
```

### Step 2: Running in Development Mode

#### Option A: Simulated Hardware (Mock Mode)
To test UI components, radar rendering, and simulated mesh traffic without physical ESP32 boards attached:
```bash
cd spectre-dashboard
npm run dev
```

#### Option B: Live Serial Bridge Mode (Connected ESP32 Hardware)
To connect to the physical C2 Base Station plugged into USB:
```bash
cd spectre-dashboard
SPECTRE_MOCK=false npm run electron:dev
```

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
