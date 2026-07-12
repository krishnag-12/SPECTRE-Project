# S.P.E.C.T.R.E. TCC — Remaining Work for Dhruv (Software Head)

This document outlines the pending engineering tasks required to bring the Tactical Command Center dashboard from its current **MVP frontend** state to a **fully operational, hardware-integrated C2 system**.

> **Current Status:** The React frontend, Canvas radar engine, mock telemetry simulator, and all UI components are complete and verified. The dashboard runs in browser-only mode with simulated data. The items below connect it to real hardware.

---

## 1. Real Serial Bridge — `electron/serial-bridge.js`

**Priority:** 🔴 Critical — this is the primary hardware integration point.

Build the Node.js serial ingestion module that replaces `mock-serial.js` when running in live mode.

### Requirements:
- Use the `serialport` npm package (already in `package.json` as `^13.0.0`)
- Listen on the ESP32's COM port at **115200 baud**
- Read `\n`-delimited JSON lines from the USB serial stream
- Implement a **line buffer** for partial frame recovery (serial can split a JSON line across two read events)
- Validate each parsed JSON object against the expected schema before emitting
- Emit valid packets to the React frontend via **Socket.IO** (`telemetry_matrix` event)
- Expose IPC handlers for port discovery (`serial:list`), connect (`serial:connect`), and disconnect (`serial:disconnect`)
- Maintain a **dropped frame counter** for malformed/unparseable lines

### Expected JSON Schema from C2 Node:
```json
{
  "nodeId": "Alpha-1",
  "msgId": 42,
  "hopCount": 2,
  "status": "ACTIVE",
  "posX": 127.5,
  "posY": -34.2,
  "rssi": -67,
  "snr": 9.5,
  "anomalyScore": 0.12,
  "payload": "Status nominal. Holding position.",
  "timestamp": 1720789200
}
```

### Reference:
- The mock implementation is in [`electron/mock-serial.js`](./electron/mock-serial.js) — mirror its Socket.IO event structure
- The Electron main process in [`electron/main.js`](./electron/main.js) already has a commented-out hook for `startSerialBridge(httpServer)` — uncomment and wire it

---

## 2. C2 Bridge Firmware Mode — `#define C2_BRIDGE_MODE`

**Priority:** 🔴 Critical — the ESP32 currently prints human-readable debug strings, not structured JSON.

Add a compile-time flag to [`spectre-main/src/main.cpp`](../spectre-main/src/main.cpp) that switches the C2 node's serial output from debug log lines to clean, newline-delimited JSON telemetry.

### What to change:
- Add `#define C2_BRIDGE_MODE 1` at the top of `main.cpp` (alongside `SIMULATOR_MODE` and `ENABLE_RADIO_TASK`)
- When `C2_BRIDGE_MODE` is enabled:
  - Suppress all `Serial.println("[Radio] ...")` debug messages
  - On every successful `aes256Decrypt()` of an incoming LoRa packet, print a single JSON line to serial:
    ```
    {"nodeId":"Alpha-1","msgId":1,"hopCount":2,"status":"ACTIVE","posX":0,"posY":0,"rssi":-67,"snr":9.5,"anomalyScore":0.0,"payload":"Status nominal.","timestamp":1720789200}\n
    ```
  - RSSI and SNR should be read from the radio module: `radio.getRSSI()` and `radio.getSNR()`
  - `posX`/`posY` should be `0.0` for now (stubbed until MPU6050 dead reckoning is integrated)
  - `anomalyScore` should be `0.0` for now (stubbed until Isolation Forest ML is integrated)
  - `timestamp` should use `millis() / 1000` (relative uptime)

### Important:
- The C2 node acts as a **bridge only** — it decrypts mesh traffic and prints it for the dashboard. It does NOT display on OLED in bridge mode
- Keep the existing debug output active when `C2_BRIDGE_MODE` is `0`

---

## 3. Static Node ID Macro — `NODE_ID`

**Priority:** 🟡 Medium — required for multi-node identification on the command map.

Each ESP32 in the mesh needs a deterministic callsign burned in at compile time.

### What to change:
- Add `#define NODE_ID "Alpha-1"` to each device's firmware (change per device: `Bravo-3`, `Charlie-2`, etc.)
- Include `NODE_ID` in the `LoRaPacket` struct, or prepend it to the decrypted payload before JSON serialization
- The dashboard expects the `nodeId` field in every telemetry packet

---

## 4. Command Serial Write-Back

**Priority:** 🟡 Medium — enables the dashboard to send commands to field nodes.

### What to implement:

**Dashboard side (`serial-bridge.js`):**
- Listen for `command` events from Socket.IO (React sends these when the user clicks PING, RE-KEY, or ZEROIZE)
- Write the command as a formatted string to the serial port:
  - `CMD:PING:Alpha-1\n`
  - `CMD:REKEY:Bravo-3\n`
  - `CMD:ZERO:Charlie-2\n`

**Firmware side (`main.cpp`):**
- In the `loop()` or a dedicated RTOS task, read incoming serial data
- Parse `CMD:TYPE:NODE_ID` format
- For `CMD:ZERO`, construct and broadcast an AES-encrypted kill packet over LoRa targeting the specified node
- For `CMD:PING`, broadcast a lightweight heartbeat request
- For `CMD:REKEY`, initiate a fresh ECDH key exchange sequence

---

## 5. Electron Packaging

**Priority:** 🟢 Low — needed for final deployment but not for development.

Configure `electron-builder` to produce a standalone `.exe` installer that runs on ruggedized Windows command laptops without requiring Node.js or npm to be installed.

### Steps:
- Add `electron-builder` to devDependencies
- Add a `build` config in `package.json`:
  ```json
  "build": {
    "appId": "in.spectre.tcc",
    "productName": "SPECTRE TCC",
    "win": {
      "target": "nsis"
    },
    "files": [
      "dist/**/*",
      "electron/**/*",
      "package.json"
    ]
  }
  ```
- Add a `"dist:electron": "vite build && electron-builder"` script
- Test that `serialport` native bindings are correctly packaged (may need `electron-rebuild`)

---

## Quick Reference: File Map

| File | Status | Owner |
|---|---|---|
| `electron/mock-serial.js` | ✅ Complete | Krishna |
| `electron/serial-bridge.js` | ❌ Not started | **Dhruv** |
| `electron/main.js` | ✅ Complete (has hook for serial bridge) | Krishna |
| `src/components/RadarMap.jsx` | ✅ Complete | Krishna |
| `src/components/C2Panel.jsx` | ✅ Complete (sends commands via Socket.IO) | Krishna |
| `spectre-main/src/main.cpp` | ⚠️ Needs `C2_BRIDGE_MODE` + `NODE_ID` | **Dhruv** |
| Electron packaging config | ❌ Not started | **Dhruv** |

---

> **Questions?** Ping Krishna on the repo or check the commit message on `479ef65` for full architectural context.
