# S.P.E.C.T.R.E. — Field Operator's User Manual

**Secure Portable Encrypted Communication Terminal for Remote Environments**
**Version 2.0 | Firmware Build: Sprint C**

---

## 1. Device Overview

S.P.E.C.T.R.E. is a tactical encrypted communication terminal that provides infrastructure-independent, encrypted mesh communication over LoRa radio. Each terminal consists of:

- **ESP32 Dual-Core MCU** — runs the FreeRTOS operating system
- **SX1278 LoRa Transceiver** — 433 MHz ISM band, up to 10 km line-of-sight range
- **0.96" SSD1306 OLED Display** — 128×64 monochrome situational awareness screen
- **3-Button Navigation Matrix** — UP, DOWN, SELECT
- **18650 Li-Ion Battery** — 3.7V, ~2600 mAh capacity

---

## 2. Power On & Boot Sequence

1. **Connect power** to the terminal via USB or battery.
2. The S.P.E.C.T.R.E. **boot logo** appears on the OLED display:
   - The geometric "M" icon on the left
   - `S.P.E.C.T.R.E.` label
   - `SYSTEM ONLINE` and `v2.0 [SECURED]` status text
3. The logo is displayed for **2.5 seconds** while the cryptographic engine initializes (ECDH key generation, SPIFFS mount for DTN store).
4. The display transitions to the **Main Menu**.

---

## 3. Main Menu

After boot, the main tactical menu is displayed. Use the buttons to navigate:

| Button | Action |
|--------|--------|
| **UP** | Move cursor up in the menu |
| **DOWN** | Move cursor down in the menu |
| **SELECT** | Execute the highlighted command |

### Menu Options

| # | Menu Item | Function |
|---|-----------|----------|
| 1 | `MAYDAY TX` | Transmit emergency distress signal: *"MAYDAY! Sector 4. Immediate assistance required."* |
| 2 | `EXTRACT TX` | Request extraction: *"Extraction requested at primary LZ. Awaiting confirmation."* |
| 3 | `REGROUP TX` | Regroup order: *"All units regroup at Checkpoint Bravo."* |
| 4 | `SITREP TX` | Status report: *"Status nominal. Holding position. No enemy contact."* |
| 5 | `KEY EXCH TX` | Broadcast ECDH public key for secure key exchange with nearby nodes |
| 6 | `INBOX` | View the most recently received message |

---

## 4. Sending a Message

1. Navigate to the desired tactical message (e.g., `SITREP TX`) using UP/DOWN buttons.
2. Press **SELECT**.
3. The display shows `[ TRANSMITTING ]` with the message text.
4. The message is:
   - Encrypted with **AES-256-GCM** (if key exchange is complete)
   - Transmitted over **LoRa** on the current FHSS channel
   - Relayed by intermediate mesh nodes (hop count = 3)
5. The screen returns to the Main Menu after ~1.2 seconds.

> **⚠️ Important:** Messages cannot be sent until a **Key Exchange** has been completed. If attempted, the display shows `ERR: Run Key Exchange.`

---

## 5. Receiving a Message

When an encrypted message arrives over the LoRa mesh:

1. The display **automatically switches to the Inbox** view.
2. The inbox shows:
   - `MsgID`: Message identifier
   - `Hops`: Number of relay hops remaining
   - The **decrypted payload text**
3. Press any button to return to the Main Menu.

If the device is in **screensaver mode** (see Section 8), the display wakes instantly and shows the received message.

---

## 6. Key Exchange Protocol (ECDH)

Before any encrypted communication is possible, both nodes must exchange public keys:

1. On **Node A**: Select `KEY EXCH TX` → press **SELECT**.
2. Node A broadcasts its ECDH public key (SECP256R1 curve) over LoRa.
3. **Node B** automatically receives the key, derives the shared AES-256 secret via SHA-256 hashing, and displays `SYS: Secure Key Exchanged!`.
4. Repeat from Node B to Node A for bidirectional secure communication.
5. After key exchange:
   - **FHSS** is activated (if enabled): both nodes begin synchronized channel hopping
   - **DTN** presence tracking begins

> **🔒 Security Note:** The shared AES-256 key is never transmitted. Only ephemeral public keys are exchanged. The shared secret is derived independently on each device.

---

## 7. Frequency-Hopping Spread Spectrum (FHSS)

After a successful key exchange, the terminal activates **FHSS**:

- **15 non-overlapping channels** across 433.050 – 437.250 MHz
- Channel hopping schedule is **derived from the shared AES-256 key** — both nodes hop in lockstep
- Hop interval: **50 ms dwell time** per channel
- The system is resistant to narrowband jamming and spectrum surveillance

**No operator action is required.** FHSS activates automatically after key exchange.

---

## 8. Idle Screensaver & Boot Logo

### Boot Logo
On every power-up, the S.P.E.C.T.R.E. logo is displayed for 2.5 seconds. This confirms the display, crypto engine, and SPIFFS are all operational.

### Idle Screensaver
If the device is left unattended for **30 seconds** with no button presses and no incoming messages:

- The OLED switches to the **S.P.E.C.T.R.E. logo screensaver**
- Shows the geometric "M" icon + `S.P.E.C.T.R.E.` + `TACTICAL MESH`
- The radio remains **fully operational** in the background — FHSS hopping, DTN dump checks, and message reception continue normally

### Waking the Display
| Event | Behavior |
|-------|----------|
| **Button press** | First press wakes the display (no menu action). Second press operates normally. |
| **Incoming message** | Display wakes immediately and shows the message in the Inbox. |

> **💡 Tip:** The screensaver also extends the lifespan of the OLED panel by preventing static burn-in during long deployments.

---

## 9. Delay-Tolerant Networking (DTN)

S.P.E.C.T.R.E. implements a **Store-Carry-Forward** protocol that guarantees eventual message delivery even when the destination node is temporarily out of range:

### How It Works

1. **Node A** sends a message to **Node B**.
2. If Node B has **not been heard from in the last 30 seconds**, it is considered unreachable.
3. The encrypted packet is **stored to flash memory** (SPIFFS) as `/dtn_XXXX.bin`.
4. The radio continues listening. When Node B **re-enters the mesh** (i.e., a packet from Node B is received), the stored packet is automatically **burst-transmitted** and the flash copy is deleted.

### Key Specifications

| Parameter | Value |
|-----------|-------|
| Max stored packets | 32 |
| Node timeout | 30 seconds |
| Dump check interval | 5 seconds |
| Packets per dump cycle | 1 (duty-cycle safe) |
| Reboot persistence | ✅ Stored packets survive power cycles |
| COMSEC preservation | ✅ Payloads are never decrypted while stored |

**No operator action is required.** DTN operates autonomously in the background.

---

## 10. Device Modes & Compile-Time Configuration

The firmware behavior is controlled by `#define` flags at the top of `spectre-main/src/main.cpp`:

| Flag | Default | Description |
|------|---------|-------------|
| `NODE_ID` | `"Alpha-1"` | Callsign broadcast in every packet header. Change per device (e.g., `"Bravo-2"`, `"Charlie-3"`). |
| `C2_BRIDGE_MODE` | `0` | Set to `1` for the C2 Gateway / base station node (disables OLED, enables JSON serial bridge). |
| `ENABLE_FHSS` | `1` | Set to `0` to disable frequency hopping and use a single static channel. |
| `ENABLE_DTN` | `1` | Set to `0` to disable store-carry-forward (packets are dropped when unreachable). |
| `ENABLE_RADIO_TASK` | `1` | Set to `0` to disable the radio entirely (display-only mode for UI testing). |

---

## 11. Hardware Pin Wiring Reference

### Field Node (spectre-main)

| ESP32 GPIO | Connected To | Function |
|------------|-------------|----------|
| GPIO 5 | SX1278 NSS (CS) | SPI Chip Select |
| GPIO 14 | SX1278 RST | LoRa Hardware Reset |
| GPIO 26 | SX1278 DIO0 | RXDone / CADDone IRQ |
| GPIO 35 | SX1278 DIO1 | CADDetected IRQ (FHSS) |
| GPIO 18 | SX1278 SCK | SPI Clock (VSPI default) |
| GPIO 23 | SX1278 MOSI | SPI Master Out |
| GPIO 19 | SX1278 MISO | SPI Master In |
| GPIO 21 | SSD1306 SDA | I2C Data |
| GPIO 22 | SSD1306 SCL | I2C Clock |
| GPIO 32 | Button (UP) | Pull-up, active LOW |
| GPIO 33 | Button (DOWN) | Pull-up, active LOW |
| GPIO 25 | Button (SELECT) | Pull-up, active LOW |
| 3V3 | SX1278 VCC, SSD1306 VCC | Power rail |
| GND | All GND pins | Common ground |

### C2 Gateway (spectre-c2-gateway)

| ESP32 GPIO | Connected To | Function |
|------------|-------------|----------|
| GPIO 5 | SX1278 NSS (CS) | SPI Chip Select |
| GPIO 14 | SX1278 RST | LoRa Hardware Reset |
| GPIO 26 | SX1278 DIO0 | RXDone IRQ |
| GPIO 18 | SX1278 SCK | SPI Clock (VSPI default) |
| GPIO 23 | SX1278 MOSI | SPI Master Out |
| GPIO 19 | SX1278 MISO | SPI Master In |
| USB | Host PC | Serial 115200 (JSON stream) |
| 3V3 | SX1278 VCC | Power rail |
| GND | All GND pins | Common ground |

> **Note:** The C2 Gateway has **no OLED or buttons**. It is a headless bridge between the LoRa mesh and the SPECTRE TCC Dashboard (Electron app).

---

## 12. Status Bar Reference

The top bar of the OLED display shows system status:

| Field | Meaning |
|-------|---------|
| `B:85%` | Battery level (placeholder — hardware ADC integration pending) |
| `S:72` | Signal quality (placeholder — RSSI integration pending) |
| `STBY` | Standby mode (main menu) |
| `TX` | Currently transmitting |
| `RX` | Inbox / receiving mode |

---

## 13. Troubleshooting

| Issue | Solution |
|-------|----------|
| Display shows nothing | Check I2C wiring (GPIO 21 SDA, GPIO 22 SCL). Verify SSD1306 address is `0x3C`. |
| `LoRa INIT FAIL! Code: X` | Check SPI wiring (GPIO 5/14/26). Verify SX1278 module is powered (3.3V, **not** 5V). |
| `ERR: Run Key Exchange.` | Execute `KEY EXCH TX` on both nodes before sending tactical messages. |
| Messages not received | Ensure both nodes have completed key exchange. Check that antennas are connected. |
| FHSS not activating | FHSS requires a completed key exchange. Verify `ENABLE_FHSS 1` in firmware. |
| DTN packets not stored | Verify `ENABLE_DTN 1` in firmware. Check serial monitor for `[DTN]` log messages. |
| Screensaver won't activate | Wait 30 seconds with no input. Only active when `C2_BRIDGE_MODE 0`. |

---

## 14. Safety & Legal Notice

- S.P.E.C.T.R.E. operates on the **433 MHz ISM band** which is subject to local spectrum regulations.
- **1% duty cycle** restrictions apply in civilian deployments. The FHSS implementation distributes transmissions across 15 channels to maximize legal throughput.
- This device is an **R&D prototype** developed for academic evaluation. It is not approved for active tactical deployment without compliance with national defense regulations and spectrum authority clearance.
- **Do not transmit without an antenna connected** — this can damage the SX1278 PA stage.

---

*S.P.E.C.T.R.E. — Department of Electronics & Communication Engineering, BMS College of Engineering, Bengaluru*
