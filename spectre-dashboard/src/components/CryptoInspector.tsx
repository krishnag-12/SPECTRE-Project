// =============================================================================
// S.P.E.C.T.R.E. TCC — Live Cryptographic Pipeline Inspector
// Visualizes OTA LoRa AES-256-GCM Encryption Stages & 1-Bit Tamper Sandbox
// =============================================================================

import React, { useState, useMemo } from 'react';
import type { CryptoTelemetry } from '../types';

interface Props {
  crypto: CryptoTelemetry | null;
  nodeId: string;
  payload: string;
  onClose: () => void;
}

// Hexadecimal formatting with memory offset address prefixes
function formatHexWithOffsets(hex: string, bytesPerLine = 16): string[] {
  const lines: string[] = [];
  const cleanHex = hex.replace(/\s+/g, '');
  for (let i = 0; i < cleanHex.length; i += bytesPerLine * 2) {
    const chunk = cleanHex.slice(i, i + bytesPerLine * 2);
    const offset = (i / 2).toString(16).padStart(4, '0');
    const octets: string[] = [];
    for (let j = 0; j < chunk.length; j += 2) {
      octets.push(chunk.slice(j, j + 2));
    }
    // Group into 8-byte halves for readability
    const half = Math.ceil(octets.length / 2);
    const left = octets.slice(0, half).join(' ');
    const right = octets.slice(half).join(' ');
    lines.push(`${offset}:  ${left}   ${right}`);
  }
  return lines;
}

// 1-Bit Tamper Simulation (XOR flip bit in ciphertext)
function tamperCiphertext(hexStr: string, bytePosition: number): string {
  if (hexStr.length < 2) return hexStr;
  const byteIndex = Math.min(bytePosition, Math.floor(hexStr.length / 2) - 1);
  const hexCharIndex = byteIndex * 2;
  const originalByte = parseInt(hexStr.slice(hexCharIndex, hexCharIndex + 2), 16);
  const flippedByte = originalByte ^ 0x01; // Flip LSB
  const flippedHex = flippedByte.toString(16).padStart(2, '0');
  return hexStr.slice(0, hexCharIndex) + flippedHex + hexStr.slice(hexCharIndex + 2);
}

export default function CryptoInspector({ crypto, nodeId, payload, onClose }: Props) {
  const [tamperActive, setTamperActive] = useState(false);
  const [tamperByte, setTamperByte] = useState(3);

  const tamperedCipher = useMemo(() => {
    if (!crypto) return '';
    return tamperCiphertext(crypto.ciphertext, tamperByte);
  }, [crypto, tamperByte]);

  const hasTamperMismatch = tamperActive && crypto && tamperedCipher !== crypto.ciphertext;

  if (!crypto) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            <span style={styles.headerTitle}>🔐 CRYPTOGRAPHIC PIPELINE INSPECTOR</span>
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
          <div style={styles.emptyState}>
            <div style={{ fontSize: '40px', opacity: 0.2 }}>🔒</div>
            <div style={styles.emptyText}>Waiting for encrypted packet from field node...</div>
            <div style={styles.emptyHint}>Transmit any command or telemetry message to populate pipeline</div>
          </div>
        </div>
      </div>
    );
  }

  const ivLines = formatHexWithOffsets(crypto.iv);
  const tagLines = formatHexWithOffsets(crypto.tag);
  const cipherLines = formatHexWithOffsets(crypto.ciphertext);
  const tamperedLines = formatHexWithOffsets(tamperedCipher);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header Bar */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={styles.headerTitle}>🔐 CRYPTOGRAPHIC PIPELINE INSPECTOR</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#00E5FF', background: 'rgba(0, 229, 255, 0.1)', padding: '2px 8px', borderRadius: '3px', border: '1px solid rgba(0, 229, 255, 0.25)' }}>
              NODE {nodeId}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.8px',
                padding: '3px 10px',
                borderRadius: '3px',
                background: crypto.tagMatch ? 'rgba(57, 255, 20, 0.12)' : 'rgba(255, 51, 68, 0.15)',
                color: crypto.tagMatch ? '#39FF14' : '#FF3344',
                border: `1px solid ${crypto.tagMatch ? 'rgba(57, 255, 20, 0.35)' : 'rgba(255, 51, 68, 0.35)'}`,
              }}
            >
              {crypto.tagMatch ? '✔ GMAC AUTHENTICATED' : '✖ AUTH INTEGRITY FAILURE'}
            </span>
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Security Architecture Parameters Bar */}
        <div style={styles.nodeBar}>
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Cipher Suite:</span>
            <span style={{ color: '#00E5FF' }}>{crypto.algo || 'AES-256-GCM'}</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>│</span>
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Key Space:</span>
            <span>256-bit ECDH Shared Secret</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>│</span>
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Nonce / IV:</span>
            <span>96-bit CSPRNG</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>│</span>
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Auth Tag:</span>
            <span>128-bit GHASH GMAC</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>│</span>
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Acceleration:</span>
            <span style={{ color: '#39FF14' }}>ESP32 mbedTLS DMA</span>
          </div>
        </div>

        {/* 5-Stage Step-by-Step Security Pipeline */}
        <div style={styles.pipelineScroll}>
          {/* Stage 1: RF Frame Ingestion */}
          <div style={styles.stage}>
            <div style={{ ...styles.stageHeader, borderLeftColor: '#00E5FF' }}>
              <span style={styles.stageNum}>STAGE 01</span>
              <span style={styles.stageTitle}>OVER-THE-AIR LORA RF FRAME INGESTION</span>
              <span style={styles.stageBadge}>RADIO LAYER</span>
            </div>
            <div style={styles.stageContent}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={styles.label}>Frame Magic Header</div>
                  <div style={styles.hexValue}>
                    <span style={{ color: '#00E5FF', fontWeight: 700 }}>0xAB</span> — Secure Encrypted Protocol Indicator
                  </div>
                </div>
                <div>
                  <div style={styles.label}>Origin Field Callsign</div>
                  <div style={styles.hexValue}>
                    <span style={{ color: '#39FF14', fontWeight: 700 }}>{nodeId}</span> (Authenticated LoRa Node)
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={styles.connector}>▼</div>

          {/* Stage 2: 96-Bit Nonce / IV */}
          <div style={styles.stage}>
            <div style={{ ...styles.stageHeader, borderLeftColor: '#39FF14' }}>
              <span style={styles.stageNum}>STAGE 02</span>
              <span style={styles.stageTitle}>CSPRNG 96-BIT INITIALIZATION VECTOR (IV)</span>
              <span style={styles.stageBadge}>NONCE EXTRACTION</span>
            </div>
            <div style={styles.stageContent}>
              <div style={styles.label}>Initialization Vector (12 Bytes) — Generated via esp_fill_random()</div>
              <div style={styles.hexBox}>
                {ivLines.map((line, i) => (
                  <div key={i} style={styles.hexLine}>{line}</div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.connector}>▼</div>

          {/* Stage 3: AES-256-GCM Ciphertext */}
          <div style={styles.stage}>
            <div style={{ ...styles.stageHeader, borderLeftColor: '#FFB300' }}>
              <span style={styles.stageNum}>STAGE 03</span>
              <span style={styles.stageTitle}>AES-256 GALOIS COUNTER MODE (GCM) CIPHERTEXT</span>
              <span style={styles.stageBadge}>{crypto.ciphertext.length / 2} BYTES</span>
            </div>
            <div style={styles.stageContent}>
              <div style={styles.label}>Encrypted Payload Stream</div>
              <div style={styles.hexBox}>
                {cipherLines.map((line, i) => (
                  <div key={i} style={styles.hexLine}>{line}</div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.connector}>▼</div>

          {/* Stage 4: GMAC Tag Verification */}
          <div style={styles.stage}>
            <div style={{ ...styles.stageHeader, borderLeftColor: '#FF3344' }}>
              <span style={styles.stageNum}>STAGE 04</span>
              <span style={styles.stageTitle}>GALOIS AUTHENTICATION TAG (GMAC 128-BIT)</span>
              <span style={styles.stageBadge}>INTEGRITY CHECK</span>
            </div>
            <div style={styles.stageContent}>
              <div style={styles.label}>16-Byte Cryptographic Authentication Tag</div>
              <div style={styles.hexBox}>
                {tagLines.map((line, i) => (
                  <div key={i} style={styles.hexLine}>{line}</div>
                ))}
              </div>
              <div
                style={{
                  marginTop: '10px',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: crypto.tagMatch ? 'rgba(57, 255, 20, 0.08)' : 'rgba(255, 51, 68, 0.08)',
                  border: `1px solid ${crypto.tagMatch ? 'rgba(57, 255, 20, 0.3)' : 'rgba(255, 51, 68, 0.3)'}`,
                  color: crypto.tagMatch ? '#39FF14' : '#FF3344',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>{crypto.tagMatch ? '✔' : '✖'}</span>
                <span>
                  {crypto.tagMatch
                    ? 'GMAC INTEGRITY VERIFIED — ZERO BIT FLIPS DETECTED OVER OTA LORA LINK'
                    : 'CRITICAL GMAC TAG MISMATCH — DATA INTEGRITY COMPROMISED OR TAMPERED'}
                </span>
              </div>
            </div>
          </div>

          <div style={styles.connector}>▼</div>

          {/* Stage 5: Hardware Plaintext Recovery */}
          <div style={styles.stage}>
            <div style={{ ...styles.stageHeader, borderLeftColor: '#A78BFA' }}>
              <span style={styles.stageNum}>STAGE 05</span>
              <span style={styles.stageTitle}>MBEDTLS HARDWARE DECRYPTION & RECOVERED PAYLOAD</span>
              <span style={styles.stageBadge}>PLAINTEXT</span>
            </div>
            <div style={styles.stageContent}>
              <div style={styles.label}>Decrypted Payload String</div>
              <div
                style={{
                  padding: '10px 14px',
                  background: '#04060A',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '13px',
                  color: '#39FF14',
                  wordBreak: 'break-word',
                  lineHeight: '1.5',
                }}
              >
                &gt; {payload || '(empty payload)'}
              </div>
            </div>
          </div>

          <div style={{ ...styles.connector, color: '#FFB300' }}>⚠</div>

          {/* Interactive 1-Bit Tamper Sandbox */}
          <div style={{ ...styles.stage, border: '1px solid rgba(255, 179, 0, 0.35)' }}>
            <div style={{ ...styles.stageHeader, borderLeftColor: '#FFB300', background: 'rgba(255, 179, 0, 0.05)' }}>
              <span style={{ ...styles.stageNum, color: '#FFB300' }}>TEST BENCH</span>
              <span style={styles.stageTitle}>1-BIT CIPHERTEXT TAMPER SANDBOX (MITM SIMULATION)</span>
            </div>
            <div style={styles.stageContent}>
              <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '11px', color: '#9DA7B3', marginBottom: '8px' }}>
                Simulate an active over-the-air Man-in-the-Middle (MitM) bit-flip injection attack to observe Galois Field GHASH polynomial failure.
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                <button
                  onClick={() => setTamperActive(!tamperActive)}
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '6px 14px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 120ms ease',
                    background: tamperActive ? 'rgba(255, 51, 68, 0.18)' : 'rgba(255, 179, 0, 0.12)',
                    borderColor: tamperActive ? '#FF3344' : 'rgba(255, 179, 0, 0.4)',
                    color: tamperActive ? '#FF3344' : '#FFB300',
                    border: '1px solid',
                  }}
                >
                  {tamperActive ? '⚡ TAMPER ACTIVE' : '🔧 FLIP 1 BIT IN CIPHERTEXT'}
                </button>

                {tamperActive && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#9DA7B3', fontFamily: "'JetBrains Mono', monospace" }}>
                    Target Byte Index:
                    <input
                      type="number"
                      min={0}
                      max={Math.floor(crypto.ciphertext.length / 2) - 1}
                      value={tamperByte}
                      onChange={(e) => setTamperByte(Number(e.target.value))}
                      style={styles.tamperInput}
                    />
                  </label>
                )}
              </div>

              {tamperActive && (
                <div>
                  <div style={styles.label}>Tampered Ciphertext (Byte #{tamperByte} LSB flipped)</div>
                  <div style={{ ...styles.hexBox, borderColor: 'rgba(255, 51, 68, 0.3)' }}>
                    {tamperedLines.slice(0, 2).map((line, i) => (
                      <div key={i} style={{ ...styles.hexLine, color: '#FF6B6B' }}>{line}</div>
                    ))}
                  </div>

                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: 'rgba(255, 51, 68, 0.1)',
                      border: '1px solid rgba(255, 51, 68, 0.4)',
                      color: '#FF3344',
                    }}
                  >
                    {hasTamperMismatch
                      ? '✖ TAMPER DETECTED: GHASH POLYNOMIAL VERIFICATION FAILED — HARDWARE TAG REJECTED, PACKET DROPPED'
                      : '—'}
                  </div>

                  <div style={{ marginTop: '8px', fontSize: '10.5px', color: '#5D6677', lineHeight: '1.6', fontFamily: "'Segoe UI', sans-serif" }}>
                    AES-256-GCM computes a Galois Hash (GHASH) polynomial over GF(2¹²⁸). Because each bit in the ciphertext affects the GHASH digest, altering even a single bit causes an immediate GMAC authentication tag mismatch, ensuring zero-trust payload integrity against eavesdropping and injection attacks.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Styling definitions
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(3, 5, 8, 0.88)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(8px)',
    padding: '16px',
  },
  modal: {
    background: '#0B0E14',
    border: '1px solid rgba(0, 229, 255, 0.25)',
    borderRadius: '8px',
    width: '840px',
    maxWidth: '96vw',
    height: '92vh',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.9), 0 0 24px rgba(0, 229, 255, 0.08)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 18px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(14, 18, 26, 0.95)',
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '12.5px',
    fontWeight: 700,
    letterSpacing: '1.8px',
    color: '#00E5FF',
  },
  closeBtn: {
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#9DA7B3',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '13px',
    padding: '3px 9px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  nodeBar: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    padding: '8px 18px',
    background: 'rgba(7, 10, 15, 0.9)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#9DA7B3',
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  metaLabel: {
    color: '#5D6677',
    textTransform: 'uppercase',
  },
  pipelineScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px 20px 28px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  stage: {
    background: 'rgba(15, 20, 29, 0.85)',
    borderRadius: '5px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  stageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 14px',
    borderLeft: '4px solid',
    background: 'rgba(18, 24, 34, 0.85)',
  },
  stageNum: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '1.5px',
    color: '#00E5FF',
  },
  stageTitle: {
    fontFamily: "'Segoe UI', sans-serif",
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.8px',
    color: '#EDEDED',
    flex: 1,
  },
  stageBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    color: '#5D6677',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  stageContent: {
    padding: '12px 14px',
  },
  connector: {
    textAlign: 'center',
    color: 'rgba(0, 229, 255, 0.3)',
    fontSize: '13px',
    lineHeight: '18px',
    flexShrink: 0,
  },
  label: {
    fontFamily: "'Segoe UI', sans-serif",
    fontSize: '9.5px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    color: '#5D6677',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  hexValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11.5px',
    color: '#EDEDED',
  },
  hexBox: {
    background: '#04060A',
    borderRadius: '4px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    padding: '8px 12px',
  },
  hexLine: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#A1A7B4',
    letterSpacing: '0.8px',
    lineHeight: '1.6',
    wordBreak: 'break-all',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '40px',
  },
  emptyText: {
    fontFamily: "'Segoe UI', sans-serif",
    fontSize: '12px',
    color: '#9DA7B3',
    fontWeight: 600,
  },
  emptyHint: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#5D6677',
  },
  tamperInput: {
    width: '44px',
    background: '#04060A',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '3px',
    color: '#EDEDED',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10.5px',
    padding: '3px 6px',
    textAlign: 'center',
  },
};
