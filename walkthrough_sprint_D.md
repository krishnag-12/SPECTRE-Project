# Walkthrough: Targeted Remote Zeroization Implementation

## Overview
Replaced the physical GPIO panic button on the C2 Gateway with a **targeted, remote zeroization kill switch** issued directly from the Tactical Command Center (TCC) dashboard.

---

## Changes Made

### 1. Field Node Firmware (`spectre-main`)
- Added remote zeroize command parser in [main.cpp](file:///e:/Academics/6th%20Sem/Major%20Project/SPECTRE/spectre-main/src/main.cpp#L1030-L1068).
- When a decrypted payload contains `CMD:ZERO:<nodeId>` matching `NODE_ID`:
  1. Overwrites AES-256 symmetric key with hardware CSPRNG random noise (`esp_fill_random`).
  2. Sets `keyExchangeComplete = false` to permanently prevent further decryption.
  3. Frees `ecdh_ctx`, `ctr_drbg`, and `entropy` contexts.
  4. Renders full-screen black-on-white warning on OLED: **ZEROIZED / KEYS DESTROYED / REFLASH REQUIRED**.
  5. Permanently halts execution loop (`while (true)`).
- If the target node ID does not match, the packet is forwarded through mesh flood-routing normally.
- Fixed `AceButton` array initialization and forward declaration scoping in `main.cpp`.

### 2. C2 Gateway Firmware (`spectre-c2-gateway`)
- Removed physical GPIO 4 interrupt and `zeroize.h` dependency from [main.cpp](file:///e:/Academics/6th%20Sem/Major%20Project/SPECTRE/spectre-c2-gateway/src/main.cpp).
- Deleted [zeroize.h](file:///e:/Academics/6th%20Sem/Major%20Project/SPECTRE/spectre-c2-gateway/src/zeroize.h).
- The gateway acts exclusively as the secure RF bridge, relaying encrypted `CMD:ZERO` commands over LoRa to the targeted node.

### 3. TCC Dashboard (`spectre-dashboard`)
- Updated [NodeTelemetryPanel.tsx](file:///e:/Academics/6th%20Sem/Major%20Project/SPECTRE/spectre-dashboard/src/components/NodeTelemetryPanel.tsx):
  - Added **ACT** column to the Node Telemetry table.
  - Added dedicated per-node red **KILL** button.
  - Implemented 2-click safety confirmation: first click transforms the button into a pulsing **⚠ CONFIRM** with a 3-second auto-cancel timer.
  - Added disabled state for nodes that are already zeroized, compromised, or contact lost.
- Updated [App.tsx](file:///e:/Academics/6th%20Sem/Major%20Project/SPECTRE/spectre-dashboard/src/App.tsx) to pass `sendCommand` as `onSendCommand` prop to `NodeTelemetryPanel`.

### 4. Documentation
- Updated [User_Manual.md](file:///e:/Academics/6th%20Sem/Major%20Project/SPECTRE/User_Manual.md): Section 12 rewritten to detail the remote zeroization workflow and two-click safety.
- Updated [HARDWARE_SETUP_AND_FLASHING.md](file:///e:/Academics/6th%20Sem/Major%20Project/SPECTRE/HARDWARE_SETUP_AND_FLASHING.md): Removed physical GPIO 4 panic button wiring table.
- Updated [README.md](file:///e:/Academics/6th%20Sem/Major%20Project/SPECTRE/README.md) & [Jamming_Detection_&_Anti-Tamper.md](file:///e:/Academics/6th%20Sem/Major%20Project/SPECTRE/Jamming_Detection_&_Anti-Tamper.md): Documented targeted remote kill architecture.

---

## Verification Results

### Firmware Builds
- **`spectre-c2-gateway`**: PlatformIO build succeeded (`[SUCCESS] Took 75.20s`, RAM: 7.3%, Flash: 50.3%).
- **`spectre-main`**: PlatformIO build succeeded (`[SUCCESS] Took 31.05s`, RAM: 7.8%, Flash: 32.2%).

### Dashboard Build
- **`spectre-dashboard`**: Full build passed (`npm run build`):
  - `tsc --noEmit` (0 errors)
  - `vite build` (64 modules transformed, bundled cleanly)
  - `tsc -p tsconfig.electron.json` (0 errors)
