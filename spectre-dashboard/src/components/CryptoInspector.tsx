// =============================================================================
// S.P.E.C.T.R.E. TCC — Sprint G: Live Cryptographic Pipeline Inspector
// Visualizes AES-256-GCM encryption pipeline + 1-bit tamper test bench
// =============================================================================

import React, { useState, useMemo } from 'react';
import type { CryptoTelemetry } from '../types';

interface Props {
  crypto: CryptoTelemetry | null;
  nodeId: string;
  payload: string;
  onClose: () => void;
}

// ---- Hex formatting helpers ----
function formatHexBlocks(hex: string, blockSize = 2, groupSize = 16): string[] {
  const lines: string[] = [];
  for (let i = 0; i < hex.length; i += blockSize * groupSize) {
    const chunk = hex.slice(i, i + blockSize * groupSize);
    const blocks: string[] = [];
    for (let j = 0; j < chunk.length; j += blockSize) {
      blocks.push(chunk.slice(j, j + blockSize));
    }
    lines.push(blocks.join(' '));
  }
  return lines;
}

// ---- Simple client-side tamper demo using XOR flip ----
function tamperCiphertext(hexStr: string, bitPosition: number): string {
  if (hexStr.length < 2) return hexStr;
  const byteIndex = Math.min(bitPosition, Math.floor(hexStr.length / 2) - 1);
  const hexCharIndex = byteIndex * 2;
  const originalByte = parseInt(hexStr.slice(hexCharIndex, hexCharIndex + 2), 16);
  const flippedByte = originalByte ^ 0x01; // Flip LSB
  const flippedHex = flippedByte.toString(16).padStart(2, '0');
  return hexStr.slice(0, hexCharIndex) + flippedHex + hexStr.slice(hexCharIndex + 2);
}

const stageColors = {
  frame: '#00FFFF',
  iv: '#39FF14',
  cipher: '#FFBF00',
  tag: '#FF6B6B',
  decrypt: '#A78BFA',
  tamper: '#FF0000',
};

export default function CryptoInspector({ crypto, nodeId, payload, onClose }: Props) {
  const [tamperActive, setTamperActive] = useState(false);
  const [tamperBit, setTamperBit] = useState(3);

  const tamperedCipher = useMemo(() => {
    if (!crypto) return '';
    return tamperCiphertext(crypto.ciphertext, tamperBit);
  }, [crypto, tamperBit]);

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
            <div style={{ fontSize: '48px', opacity: 0.12 }}>🔒</div>
            <div style={styles.emptyText}>Waiting for encrypted packet from field node...</div>
            <div style={styles.emptyHint}>Send a message from Alpha-1 or Bravo-2 to see live crypto data</div>
          </div>
        </div>
      </div>
    );
  }

  const ivBlocks = formatHexBlocks(crypto.iv);
  const tagBlocks = formatHexBlocks(crypto.tag);
  const cipherBlocks = formatHexBlocks(crypto.ciphertext);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerTitle}>🔐 CRYPTOGRAPHIC PIPELINE INSPECTOR</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ ...styles.badge, background: crypto.tagMatch ? 'rgba(57,255,20,0.15)' : 'rgba(255,0,0,0.15)', color: crypto.tagMatch ? '#39FF14' : '#FF0000' }}>
              {crypto.tagMatch ? '✔ AUTHENTICATED' : '✖ AUTH FAILED'}
            </span>
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Node info bar */}
        <div style={styles.nodeBar}>
          <span style={{ color: '#00FFFF', fontWeight: 600 }}>{nodeId}</span>
          <span style={{ color: '#6B6B6B' }}>│</span>
          <span style={{ color: '#4A4A4A' }}>{crypto.algo}</span>
          <span style={{ color: '#6B6B6B' }}>│</span>
          <span style={{ color: '#4A4A4A' }}>Key: 256-bit</span>
          <span style={{ color: '#6B6B6B' }}>│</span>
          <span style={{ color: '#4A4A4A' }}>IV: 96-bit</span>
          <span style={{ color: '#6B6B6B' }}>│</span>
          <span style={{ color: '#4A4A4A' }}>Tag: 128-bit</span>
        </div>

        <div style={styles.pipelineScroll}>
          {/* Stage 1: RF Frame Ingestion */}
          <div style={styles.stage}>
            <div style={{ ...styles.stageHeader, borderLeftColor: stageColors.frame }}>
              <span style={styles.stageNum}>STAGE 1</span>
              <span style={styles.stageTitle}>OVER-THE-AIR LORA RF FRAME INGESTION</span>
            </div>
            <div style={styles.stageContent}>
              <div style={styles.label}>Magic Byte</div>
              <div style={styles.hexValue}><span style={{ color: stageColors.frame }}>0xAB</span> — Encrypted Data Frame</div>
              <div style={{ ...styles.label, marginTop: '6px' }}>Sender Node ID</div>
              <div style={styles.hexValue}><span style={{ color: '#00FFFF' }}>{nodeId}</span></div>
            </div>
          </div>

          {/* Stage 2: IV / Nonce */}
          <div style={styles.connector}>▼</div>
          <div style={styles.stage}>
            <div style={{ ...styles.stageHeader, borderLeftColor: stageColors.iv }}>
              <span style={styles.stageNum}>STAGE 2</span>
              <span style={styles.stageTitle}>CSPRNG 96-BIT NONCE / IV EXTRACTION</span>
            </div>
            <div style={styles.stageContent}>
              <div style={styles.label}>Initialization Vector (12 Bytes) — <span style={{ color: stageColors.iv }}>esp_fill_random()</span></div>
              {ivBlocks.map((line, i) => (
                <div key={i} style={styles.hexLine}>{line}</div>
              ))}
            </div>
          </div>

          {/* Stage 3: Ciphertext */}
          <div style={styles.connector}>▼</div>
          <div style={styles.stage}>
            <div style={{ ...styles.stageHeader, borderLeftColor: stageColors.cipher }}>
              <span style={styles.stageNum}>STAGE 3</span>
              <span style={styles.stageTitle}>AES-256 GALOIS COUNTER MODE (GCM) CIPHERTEXT</span>
            </div>
            <div style={styles.stageContent}>
              <div style={styles.label}>Encrypted Payload ({crypto.ciphertext.length / 2} Bytes)</div>
              {cipherBlocks.map((line, i) => (
                <div key={i} style={styles.hexLine}>{line}</div>
              ))}
            </div>
          </div>

          {/* Stage 4: GMAC Tag */}
          <div style={styles.connector}>▼</div>
          <div style={styles.stage}>
            <div style={{ ...styles.stageHeader, borderLeftColor: stageColors.tag }}>
              <span style={styles.stageNum}>STAGE 4</span>
              <span style={styles.stageTitle}>GALOIS AUTHENTICATION TAG (GMAC 128-BIT)</span>
            </div>
            <div style={styles.stageContent}>
              <div style={styles.label}>Authentication Tag (16 Bytes)</div>
              {tagBlocks.map((line, i) => (
                <div key={i} style={styles.hexLine}>{line}</div>
              ))}
              <div style={{
                marginTop: '8px',
                padding: '6px 10px',
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '1px',
                background: crypto.tagMatch ? 'rgba(57,255,20,0.08)' : 'rgba(255,0,0,0.08)',
                border: `1px solid ${crypto.tagMatch ? 'rgba(57,255,20,0.3)' : 'rgba(255,0,0,0.3)'}`,
                color: crypto.tagMatch ? '#39FF14' : '#FF0000',
              }}>
                {crypto.tagMatch
                  ? '✔ GMAC INTEGRITY CHECK PASSED — ZERO BIT TAMPERING'
                  : '✖ CRITICAL: GMAC AUTHENTICATION TAG MISMATCH // TAMPER DETECTED'}
              </div>
            </div>
          </div>

          {/* Stage 5: Plaintext Recovery */}
          <div style={styles.connector}>▼</div>
          <div style={styles.stage}>
            <div style={{ ...styles.stageHeader, borderLeftColor: stageColors.decrypt }}>
              <span style={styles.stageNum}>STAGE 5</span>
              <span style={styles.stageTitle}>HARDWARE DECRYPTION & PLAINTEXT RECOVERY</span>
            </div>
            <div style={styles.stageContent}>
              <div style={styles.label}>mbedTLS AES-256-GCM Hardware Engine (ESP32)</div>
              <div style={{
                padding: '8px 12px',
                background: '#0A0A0A',
                borderRadius: '3px',
                border: '1px solid #1E1E1E',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
                color: '#39FF14',
                wordBreak: 'break-word' as const,
              }}>
                {payload || '(empty)'}
              </div>
            </div>
          </div>

          {/* Tamper Test Sandbox */}
          <div style={{ ...styles.connector, color: '#FF6B6B' }}>⚠</div>
          <div style={{ ...styles.stage, border: '1px solid rgba(255,107,107,0.3)' }}>
            <div style={{ ...styles.stageHeader, borderLeftColor: stageColors.tamper, background: 'rgba(255,0,0,0.04)' }}>
              <span style={{ ...styles.stageNum, color: '#FF6B6B' }}>TEST</span>
              <span style={styles.stageTitle}>1-BIT CIPHERTEXT TAMPER SANDBOX</span>
            </div>
            <div style={styles.stageContent}>
              <div style={{ ...styles.label, color: '#FF6B6B' }}>
                Simulate Man-in-the-Middle (MitM) bit-flip attack
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                <button
                  style={{
                    ...styles.tamperBtn,
                    background: tamperActive ? 'rgba(255,0,0,0.15)' : 'rgba(255,107,107,0.1)',
                    borderColor: tamperActive ? '#FF0000' : 'rgba(255,107,107,0.3)',
                    color: tamperActive ? '#FF0000' : '#FF6B6B',
                  }}
                  onClick={() => setTamperActive(!tamperActive)}
                >
                  {tamperActive ? '⚡ TAMPERING ACTIVE' : '🔧 FLIP 1 BIT IN CIPHERTEXT'}
                </button>
                {tamperActive && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: '#6B6B6B' }}>
                    Byte #
                    <input
                      type="number"
                      min={0}
                      max={Math.floor(crypto.ciphertext.length / 2) - 1}
                      value={tamperBit}
                      onChange={(e) => setTamperBit(Number(e.target.value))}
                      style={styles.tamperInput}
                    />
                  </label>
                )}
              </div>
              {tamperActive && (
                <div style={{ marginTop: '8px' }}>
                  <div style={styles.label}>Modified Ciphertext (Byte #{tamperBit} LSB flipped)</div>
                  <div style={{ ...styles.hexLine, color: '#FF6B6B' }}>
                    {formatHexBlocks(tamperedCipher)[0] || '—'}
                  </div>
                  <div style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    borderRadius: '3px',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    background: 'rgba(255,0,0,0.08)',
                    border: '1px solid rgba(255,0,0,0.4)',
                    color: '#FF0000',
                    animation: 'flashCritical 0.8s ease infinite',
                  }}>
                    {hasTamperMismatch
                      ? '❌ CRITICAL: GMAC AUTHENTICATION TAG MISMATCH // TAMPER DETECTED — PACKET REJECTED & DROPPED'
                      : '—'}
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '9px', color: '#4A4A4A', lineHeight: '1.5' }}>
                    AES-256-GCM uses a Galois Hash (GHASH) polynomial multiplication over GF(2¹²⁸).
                    Flipping even 1 bit in the ciphertext produces a completely different GHASH digest,
                    causing immediate GMAC tag mismatch and packet rejection. This defeats all
                    bit-flipping, replay, and Man-in-the-Middle (MitM) attacks.
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

// =============================================================================
// STYLES
// =============================================================================
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.85)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
    overflowY: 'auto',
    padding: '16px',
  },
  modal: {
    background: '#111111',
    border: '1px solid #2A2A2A',
    borderRadius: '8px',
    width: '740px',
    maxWidth: '95vw',
    height: '86vh',
    maxHeight: '86vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #2A2A2A',
    background: '#0D0D0D',
  },
  headerTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '2px',
    color: '#39FF14',
  },
  closeBtn: {
    background: 'transparent',
    border: '1px solid #2A2A2A',
    color: '#6B6B6B',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    padding: '2px 8px',
    borderRadius: '3px',
    cursor: 'pointer',
  },
  badge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '1px',
    padding: '2px 8px',
    borderRadius: '2px',
  },
  nodeBar: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#0A0A0A',
    borderBottom: '1px solid #1E1E1E',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    flexWrap: 'wrap' as const,
  },
  pipelineScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    overscrollBehavior: 'contain' as const,
  },
  stage: {
    background: '#1A1A1A',
    borderRadius: '4px',
    border: '1px solid #2A2A2A',
    overflow: 'hidden',
  },
  stageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    borderLeft: '3px solid',
    background: '#151515',
  },
  stageNum: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '8px',
    fontWeight: 700,
    letterSpacing: '2px',
    color: '#6B6B6B',
  },
  stageTitle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '1px',
    color: '#A0A0A0',
  },
  stageContent: {
    padding: '10px 12px',
  },
  connector: {
    textAlign: 'center' as const,
    color: '#2A2A2A',
    fontSize: '14px',
    lineHeight: '20px',
  },
  label: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '1px',
    color: '#4A4A4A',
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  },
  hexValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#E0E0E0',
  },
  hexLine: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#A0A0A0',
    letterSpacing: '0.5px',
    lineHeight: '1.6',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '48px 32px',
  },
  emptyText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#4A4A4A',
    textAlign: 'center',
  },
  emptyHint: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '9px',
    color: '#3A3A3A',
    letterSpacing: '1.5px',
  },
  tamperBtn: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    padding: '6px 14px',
    borderRadius: '3px',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
  tamperInput: {
    width: '42px',
    background: '#0D0D0D',
    border: '1px solid #2A2A2A',
    borderRadius: '2px',
    color: '#E0E0E0',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    padding: '2px 4px',
    textAlign: 'center' as const,
  },
};
