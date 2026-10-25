// =============================================================================
// S.P.E.C.T.R.E. TCC — Edge-AI EW Threat Analysis & ML Console
// High-Precision RF Isolation Forest Inference & Live Anomaly Telemetry
// =============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { MlTelemetry, CommandPayload } from '../types';

interface Props {
  ml: MlTelemetry | null;
  anomalyScore: number;
  rssi: number;
  snr: number;
  nodeId: string;
  onSendCommand: (cmd: CommandPayload) => void;
  onClose: () => void;
}

// 8-Feature Vector configuration matching anomaly_engine.h
const FEATURE_SPECS = [
  { key: 'RSSI', label: 'Signal Strength (RSSI)', unit: 'dBm', normalMin: -90, normalMax: -50, dangerMin: -120, dangerMax: -30 },
  { key: 'SNR', label: 'Signal-to-Noise Ratio', unit: 'dB', normalMin: 2, normalMax: 12, dangerMin: -15, dangerMax: 15 },
  { key: 'Noise Floor', label: 'RF Noise Floor', unit: 'dBm', normalMin: -95, normalMax: -75, dangerMin: -120, dangerMax: -40 },
  { key: 'ΔRSSI', label: 'Differential RSSI', unit: 'dB', normalMin: -5, normalMax: 5, dangerMin: -30, dangerMax: 30 },
  { key: 'ΔNoise Floor', label: 'Differential NF', unit: 'dB', normalMin: -5, normalMax: 5, dangerMin: -30, dangerMax: 30 },
  { key: 'Roll Mean₁₀', label: 'Rolling Mean (10-pkt)', unit: 'dBm', normalMin: -90, normalMax: -50, dangerMin: -120, dangerMax: -30 },
  { key: 'Roll σ RSSI', label: 'Rolling RSSI Std Dev', unit: '', normalMin: 0, normalMax: 4, dangerMin: 0, dangerMax: 20 },
  { key: 'Roll σ NF', label: 'Rolling NF Std Dev', unit: '', normalMin: 0, normalMax: 3, dangerMin: 0, dangerMax: 20 },
];

function getThreatClassification(score: number): { level: string; color: string; bg: string; badge: string } {
  if (score >= 0.85) return { level: 'CRITICAL: BARRAGE JAMMING DETECTED', color: '#FF3344', bg: 'rgba(255,51,68,0.12)', badge: 'CRITICAL BARRAGE' };
  if (score >= 0.75) return { level: 'WARNING: SPOT / PULSE JAMMING', color: '#FF9100', bg: 'rgba(255,145,0,0.12)', badge: 'WARNING SPOT/PULSE' };
  if (score >= 0.60) return { level: 'ELEVATED: SUSPICIOUS RF ANOMALY', color: '#FFB300', bg: 'rgba(255,179,0,0.12)', badge: 'ELEVATED ANOMALY' };
  return { level: 'NOMINAL: SPECTRUM CLEAR', color: '#39FF14', bg: 'rgba(57,255,20,0.1)', badge: 'NOMINAL CLEAR' };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// Standardized Feature Gauge Card
function FeatureGaugeCard({
  label,
  value,
  unit,
  normalMin,
  normalMax,
  dangerMin,
  dangerMax,
}: {
  label: string;
  value: number;
  unit: string;
  normalMin: number;
  normalMax: number;
  dangerMin: number;
  dangerMax: number;
}) {
  const range = dangerMax - dangerMin;
  const normalStartPct = ((normalMin - dangerMin) / range) * 100;
  const normalWidthPct = ((normalMax - normalMin) / range) * 100;
  const valuePct = clamp(((value - dangerMin) / range) * 100, 0, 100);
  const isNormal = value >= normalMin && value <= normalMax;

  return (
    <div
      style={{
        background: 'rgba(15, 20, 29, 0.85)',
        borderRadius: '5px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '10px', color: '#9DA7B3', fontWeight: 600 }}>
          {label}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', fontWeight: 700, color: isNormal ? '#EDEDED' : '#FFB300' }}>
          {value.toFixed(2)}{unit ? ` ${unit}` : ''}
        </span>
      </div>

      {/* Visual Normal Range Track & Value Indicator */}
      <div style={{ position: 'relative', height: '6px', background: '#04060A', borderRadius: '3px', overflow: 'hidden' }}>
        {/* Normal operating zone */}
        <div
          style={{
            position: 'absolute',
            left: `${normalStartPct}%`,
            width: `${normalWidthPct}%`,
            height: '100%',
            background: 'rgba(57, 255, 20, 0.15)',
          }}
        />
        {/* Needle Marker */}
        <div
          style={{
            position: 'absolute',
            left: `${Math.max(0, valuePct - 1)}%`,
            width: '3px',
            height: '100%',
            background: isNormal ? '#39FF14' : '#FFB300',
            boxShadow: isNormal ? '0 0 6px rgba(57,255,20,0.8)' : '0 0 6px rgba(255,179,0,0.8)',
            transition: 'left 250ms ease',
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#5D6677', fontFamily: "'JetBrains Mono', monospace" }}>
        <span>{dangerMin}{unit}</span>
        <span style={{ color: 'rgba(57, 255, 20, 0.6)' }}>Nominal: {normalMin}..{normalMax}</span>
        <span>{dangerMax}{unit}</span>
      </div>
    </div>
  );
}

export default function JammingConsole({
  ml,
  anomalyScore,
  rssi,
  snr,
  nodeId,
  onSendCommand,
  onClose,
}: Props) {
  const [scoreHistory, setScoreHistory] = useState<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Maintain rolling 60-packet score history
  useEffect(() => {
    setScoreHistory((prev) => {
      const next = [...prev, anomalyScore];
      if (next.length > 60) next.shift();
      return next;
    });
  }, [anomalyScore]);

  // High-precision timeline chart rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = rect.height;
    const padL = 36, padR = 12, padT = 10, padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Background
    ctx.fillStyle = '#04060A';
    ctx.fillRect(0, 0, w, h);

    // Threat Zone Shading
    const zones = [
      { yStart: 0.00, yEnd: 0.60, color: 'rgba(57, 255, 20, 0.03)' },
      { yStart: 0.60, yEnd: 0.75, color: 'rgba(255, 179, 0, 0.05)' },
      { yStart: 0.75, yEnd: 0.85, color: 'rgba(255, 145, 0, 0.07)' },
      { yStart: 0.85, yEnd: 1.00, color: 'rgba(255, 51, 68, 0.09)' },
    ];
    zones.forEach((z) => {
      const y1 = padT + plotH * (1 - z.yEnd);
      const y2 = padT + plotH * (1 - z.yStart);
      ctx.fillStyle = z.color;
      ctx.fillRect(padL, y1, plotW, y2 - y1);
    });

    // Threshold Reference Lines
    [0.60, 0.75, 0.85].forEach((th) => {
      const y = padT + plotH * (1 - th);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#5D6677';
      ctx.font = '8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(th.toFixed(2), padL - 5, y);
    });

    // Y-Axis Labels
    ctx.fillStyle = '#5D6677';
    ctx.font = '8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('0.00', padL - 5, padT + plotH);
    ctx.fillText('1.00', padL - 5, padT + 2);

    // History curve
    if (scoreHistory.length > 1) {
      ctx.beginPath();
      const stepX = plotW / 59;
      for (let i = 0; i < scoreHistory.length; i++) {
        const x = padL + (60 - scoreHistory.length + i) * stepX;
        const y = padT + plotH * (1 - clamp(scoreHistory[i], 0, 1));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      const lastScore = scoreHistory[scoreHistory.length - 1];
      const threat = getThreatClassification(lastScore);
      ctx.strokeStyle = threat.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Current point dot
      const xLast = padL + plotW;
      const yLast = padT + plotH * (1 - clamp(lastScore, 0, 1));
      ctx.beginPath();
      ctx.arc(xLast, yLast, 4, 0, Math.PI * 2);
      ctx.fillStyle = threat.color;
      ctx.fill();
    }
  }, [scoreHistory]);

  const injectAttack = useCallback((mode: string) => {
    onSendCommand({ type: 'TEST_JAM' as any, nodeId: mode });
  }, [onSendCommand]);

  const threat = getThreatClassification(anomalyScore);
  const features = ml?.f || [rssi, snr, rssi - snr, 0, 0, rssi, 0, 0];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={styles.headerTitle}>📡 EDGE-AI EW THREAT ANALYSIS CONSOLE</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#A78BFA', background: 'rgba(167, 139, 250, 0.1)', padding: '2px 8px', borderRadius: '3px', border: '1px solid rgba(167, 139, 250, 0.25)' }}>
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
                background: threat.bg,
                color: threat.color,
                border: `1px solid ${threat.color}50`,
              }}
            >
              {threat.badge}
            </span>
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Model Execution & Architecture Bar */}
        <div style={styles.modelBar}>
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Model Architecture:</span>
            <span style={{ color: '#A78BFA' }}>Isolation Forest (100 Trees)</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>│</span>
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Path Norm Constant c(n):</span>
            <span>{ml?.cn?.toFixed(2) || '11.45'}</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>│</span>
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Temporal Filter:</span>
            <span>EWMA α=0.30</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>│</span>
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Engine Status:</span>
            <span style={{ color: ml?.ready !== false ? '#39FF14' : '#FFB300' }}>
              {ml?.ready !== false ? 'RING BUFFER READY' : 'WARMING UP (30 PKTS)'}
            </span>
          </div>
        </div>

        {/* Content Scroll Container */}
        <div style={styles.contentScroll}>
          {/* Primary Score & Timeline Panel */}
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {/* Score Dial Box */}
            <div
              style={{
                background: 'rgba(15, 20, 29, 0.85)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '16px',
                minWidth: '220px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '32px', fontWeight: 700, color: threat.color, fontVariantNumeric: 'tabular-nums' }}>
                {anomalyScore.toFixed(4)}
              </div>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 600, color: '#5D6677', letterSpacing: '1.5px', marginTop: '4px' }}>
                EWMA ANOMALY SCORE
              </div>
              <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '10.5px', color: threat.color, fontWeight: 600, marginTop: '4px' }}>
                {threat.level}
              </div>

              {ml && (
                <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '12px', paddingTop: '8px', fontSize: '9.5px', fontFamily: "'JetBrains Mono', monospace", display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5D6677' }}>
                    <span>Raw Isolation Score:</span>
                    <span style={{ color: '#EDEDED' }}>{ml.rawScore.toFixed(4)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5D6677' }}>
                    <span>Average Path E(h):</span>
                    <span style={{ color: '#EDEDED' }}>{ml.avgPath.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Timeline Graph Box */}
            <div style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#5D6677' }}>
                  Anomaly Score Timeline (Last 60 Packets)
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#9DA7B3' }}>
                  BANDS: &gt;0.85 BARRAGE │ 0.75 SPOT │ 0.60 ELEVATED
                </span>
              </div>
              <canvas ref={canvasRef} style={{ width: '100%', height: '140px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.08)' }} />
            </div>
          </div>

          {/* 8-Feature Vector Section */}
          <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '10.5px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#5D6677', marginBottom: '8px' }}>
            8-Feature Real-Time Physical Layer Vector
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: '8px', marginBottom: '16px' }}>
            {FEATURE_SPECS.map((fl, i) => (
              <FeatureGaugeCard
                key={fl.key}
                label={fl.label}
                value={features[i] || 0}
                unit={fl.unit}
                normalMin={fl.normalMin}
                normalMax={fl.normalMax}
                dangerMin={fl.dangerMin}
                dangerMax={fl.dangerMax}
              />
            ))}
          </div>

          {/* EW Attack Injector Test Bench */}
          <div
            style={{
              background: 'rgba(15, 20, 29, 0.85)',
              borderRadius: '6px',
              border: '1px solid rgba(255, 179, 0, 0.3)',
              padding: '12px',
            }}
          >
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.5px', color: '#FFB300', marginBottom: '4px' }}>
              ⚡ EW SCENARIO INJECTION BENCH (HARDWARE INFERENCE VERIFICATION)
            </div>
            <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '11px', color: '#9DA7B3', marginBottom: '10px' }}>
              Inject calibrated RF interference vectors to verify on-chip ESP32 Isolation Forest classification and autonomous EW reaction.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
              <button
                onClick={() => injectAttack('BARRAGE')}
                style={{
                  background: 'rgba(255, 51, 68, 0.1)',
                  border: '1px solid rgba(255, 51, 68, 0.4)',
                  color: '#FF3344',
                  borderRadius: '4px',
                  padding: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', fontWeight: 700 }}>
                  🔴 BARRAGE JAMMING
                </div>
                <div style={{ fontSize: '9px', color: '#9DA7B3' }}>Full-spectrum high-power noise floor elevation</div>
              </button>

              <button
                onClick={() => injectAttack('SPOT')}
                style={{
                  background: 'rgba(255, 145, 0, 0.1)',
                  border: '1px solid rgba(255, 145, 0, 0.4)',
                  color: '#FF9100',
                  borderRadius: '4px',
                  padding: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', fontWeight: 700 }}>
                  🟠 SPOT JAMMING
                </div>
                <div style={{ fontSize: '9px', color: '#9DA7B3' }}>Narrowband carrier suppression on 433 MHz</div>
              </button>

              <button
                onClick={() => injectAttack('PULSE')}
                style={{
                  background: 'rgba(255, 179, 0, 0.1)',
                  border: '1px solid rgba(255, 179, 0, 0.4)',
                  color: '#FFB300',
                  borderRadius: '4px',
                  padding: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', fontWeight: 700 }}>
                  🟡 PULSE JAMMING
                </div>
                <div style={{ fontSize: '9px', color: '#9DA7B3' }}>Intermittent high-energy burst disturbance</div>
              </button>

              <button
                onClick={() => injectAttack('CLEAR')}
                style={{
                  background: 'rgba(57, 255, 20, 0.1)',
                  border: '1px solid rgba(57, 255, 20, 0.4)',
                  color: '#39FF14',
                  borderRadius: '4px',
                  padding: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', fontWeight: 700 }}>
                  🟢 CLEAR SPECTRUM
                </div>
                <div style={{ fontSize: '9px', color: '#9DA7B3' }}>Restore baseline RF parameters</div>
              </button>
            </div>

            <div style={{ marginTop: '10px', fontSize: '9.5px', color: '#5D6677', lineHeight: '1.6', fontFamily: "'Segoe UI', sans-serif" }}>
              Note: Test commands transmit serial frames to the C++ AnomalyEngine running on the physical microcontroller. The 100-tree decision traversal, standard deviation window, and EWMA filters execute natively on embedded hardware, verifying end-to-end telemetry and command loops.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    border: '1px solid rgba(167, 139, 250, 0.25)',
    borderRadius: '8px',
    width: '860px',
    maxWidth: '96vw',
    height: '90vh',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.9), 0 0 24px rgba(167, 139, 250, 0.08)',
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
    color: '#A78BFA',
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
  modelBar: {
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
  contentScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px 20px 24px 20px',
  },
};
