# Remote Zeroization — Redesign Plan

## Goal

Replace the physical GPIO panic button on the C2 gateway with a **remote, per-node zeroization command** sent from the dashboard. The commander selects a specific field node and issues a Kill/Zeroize command that travels: **Dashboard → C2 Gateway (LoRa TX) → Target Field Node (wipes its own keys)**.

---

## Existing Infrastructure (Already Working)

| Layer | Status | Detail |
|-------|--------|--------|
| Serial bridge | ✅ Ready | `COMMAND_TYPES = ['PING', 'REKEY', 'ZERO']` — already supports `ZERO` |
| Socket.IO `command` event | ✅ Ready | `socket.emit('command', { type: 'ZERO', nodeId, commandId })` |
| Gateway `handleBridgeSerialLine` | ✅ Ready | Parses `CMD:ZERO:nodeId:commandId`, builds encrypted LoRa packet (ID `0x92`), queues TX |
| Gateway `queueBridgeCommand` | ✅ Ready | `0x92` message ID, payload `CMD:ZERO:nodeId` |
| App.tsx `sendCommand` | ✅ Ready | Validates trusted node, emits via socket, tracks ACK timeout |
| Field node RX handler | ❌ Missing | Decrypts packet but does NOT check for `CMD:ZERO` payload |

> [!IMPORTANT]
> **90% of the plumbing already exists.** The only missing pieces are: (1) field node handler for the ZERO command, (2) Kill button in the dashboard UI, and (3) removal of the local GPIO ISR.

---

## Proposed Changes

### 1. Field Node — Add ZERO command handler

#### [MODIFY] `spectre-main/src/main.cpp`
- After successful decryption (line ~1014), add check for `CMD:ZERO:NODE_ID` payload
- If the payload targets THIS node (matches `NODE_ID`), execute zeroization:
  - `memset(AES_KEY, 0, 32)` → wipe symmetric key
  - `esp_fill_random(AES_KEY, 32)` → anti-forensic overwrite
  - `keyExchangeComplete = false` → block decryption
  - `mbedtls_ecdh_free(&ecdh_ctx)` → destroy ECDH context
  - `mbedtls_ctr_drbg_free(&ctr_drbg)` → destroy CSPRNG
  - `mbedtls_entropy_free(&entropy)` → destroy entropy
  - Display "ZEROIZED" on OLED
  - Enter infinite loop (device is bricked until reflash)
- If the payload targets a DIFFERENT node, relay normally (existing mesh relay logic)

---

### 2. Dashboard — Add Kill/Zeroize button per node

#### [MODIFY] `spectre-dashboard/src/components/NodeTelemetryPanel.tsx`
- Add a new "ACT" (Actions) column header to the table
- For each node row, render a small red "KILL" button
- Button requires a confirmation dialog (prevent accidental zeroization)
- On confirm, calls `onSendCommand({ type: 'ZERO', nodeId })` 
- Button is disabled for nodes with status `ZEROIZED` or `COMPROMISED`

#### [MODIFY] `spectre-dashboard/src/App.tsx`
- Pass `sendCommand` callback to `NodeTelemetryPanel` as new `onSendCommand` prop

---

### 3. Gateway — Remove physical GPIO zeroization

#### [MODIFY] `spectre-c2-gateway/src/zeroize.h`
- Remove ISR, `initZeroize()`, and GPIO setup entirely
- Repurpose file as documentation-only header (or delete)

#### [MODIFY] `spectre-c2-gateway/src/main.cpp`
- Remove `#include "zeroize.h"`
- Remove `initZeroize(ZEROIZE_PIN)` from `setup()`
- Keep `AES_KEY` and `keyExchangeComplete` as non-static (no harm)

---

### 4. Documentation Updates

#### [MODIFY] `User_Manual.md`
- Rewrite Section 12 (Anti-Tamper Zeroization) to describe remote command flow
- Remove physical panic button wiring references

#### [MODIFY] `HARDWARE_SETUP_AND_FLASHING.md`
- Remove Device 4 zeroization button wiring section

---

## Verification

- Field node receives `CMD:ZERO:Alpha-1` → wipes keys → shows ZEROIZED on OLED → enters dead loop
- Field node receives `CMD:ZERO:Bravo-2` (not its ID) → relays normally, no self-zeroize
- Dashboard KILL button → confirmation → ACK received → node status changes to ZEROIZED
- Gateway has no physical panic button, acts only as relay
