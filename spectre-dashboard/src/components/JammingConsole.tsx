// =============================================================================
// S.P.E.C.T.R.E. TCC — Sprint H: Edge-AI Jamming Analysis & EW Threat Console
// Live ML feature gauges, anomaly score dial, timeline graph, attack injector
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

// Feature labels matching anomaly_engine.h feature extractor
const FEATURE_LABELS = [
  { key: 'RSSI', unit: 'dBm', normalMin: -90, normalMax: -50, dangerMin: -120, dangerMax: -30 },
  { key: 'SNR', unit: 'dB', normalMin: 2, normalMax: 12, dangerMin: -15, dangerMax: 15 },
  { key: 'Noise Floor', unit: 'dBm', normalMin: -95, normalMax: -75, dangerMin: -120, dangerMax: -40 },
  { key: 'ΔRSSI', unit: 'dB', normalMin: -5, normalMax: 5, dangerMin: -30, dangerMax: 30 },
  { key: 'ΔNoise Floor', unit: 'dB', normalMin: -5, normalMax: 5, dangerMin: -30, dangerMax: 30 },
  { key: 'Roll Mean₁₀', unit: 'dBm', normalMin: -90, normalMax: -50, dangerMin: -120, dangerMax: -30 },
  { key: 'Roll σ RSSI', unit: '', normalMin: 0, normalMax: 4, dangerMin: 0, dangerMax: 20 },
  { key: 'Roll σ NF', unit: '', normalMin: 0, normalMax: 3, dangerMin: 0, dangerMax: 20 },
];

function getThreatLevel(score: number): { level: string; color: string; bg: string } {
  if (score >= 0.85) return { level: 'CRITICAL: BARRAGE JAMMING', color: '#FF0000', bg: 'rgba(255,0,0,0.08)' };
  if (score >= 0.75) return { level: 'WARNING: SPOT/PULSE JAMMING', color: '#FF8C00', bg: 'rgba(255,140,0,0.08)' };
  if (score >= 0.60) return { level: 'ELEVATED: SUSPICIOUS', color: '#FFBF00', bg: 'rgba(255,191,0,0.08)' };
  return { level: 'CLEAR: NOMINAL', color: '#39FF14', bg: 'rgba(57,255,20,0.08)' };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// Mini gauge bar for a single feature
function FeatureGauge({ label, value, unit, normalMin, normalMax, dangerMin, dangerMax }: {
  label: string; value: number; unit: string;
  normalMin: number; normalMax: number; dangerMin: number; dangerMax: number;
}) {
  const range = dangerMax - dangerMin;
  const normalStartPct = ((normalMin - dangerMin) / range) * 100;
  const normalWidthPct = ((normalMax - normalMin) / range) * 100;
  const valuePct = clamp(((value - dangerMin) / range) * 100, 0, 100);
  const isNormal = value >= normalMin && value <= normalMax;

  return (
    <div style={styles.featureCard}>
      <div style={styles.featureHeader}>
        <span style={styles.featureLabel}>{label}</span>
        <span style={{ ...styles.featureValue, color: isNormal ? '#A0A0A0' : '#FFBF00' }}>
          {value.toFixed(2)}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      <div style={styles.gaugeTrack}>
        {/* Normal zone indicator */}
        <div style={{
          position: 'absolute',
          left: `${normalStartPct}%`,
          width: `${normalWidthPct}%`,
          height: '100%',
          background: 'rgba(57,255,20,0.08)',
          borderRadius: '2px',
        }} />
        {/* Value marker */}
        <div style={{
          position: 'absolute',
          left: `${valuePct}%`,
          top: '-1px',
          width: '3px',
          height: 'calc(100% + 2px)',
          background: isNormal ? '#39FF14' : '#FFBF00',
          borderRadius: '1px',
          transition: 'left 300ms ease',
          boxShadow: isNormal ? '0 0 4px rgba(57,255,20,0.5)' : '0 0 4px rgba(255,191,0,0.5)',
        }} />
      </div>
    </div>
  );
}

export default function JammingConsole({ ml, anomalyScore, rssi, snr, nodeId, onSendCommand, onClose }: Props) {
  const [scoreHistory, setScoreHistory] = useState<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Accumulate score history
  useEffect(() => {
    setScoreHistory((prev) => {
      const next = [...prev, anomalyScore];
      if (next.length > 60) next.shift();
      return next;
    });
  }, [anomalyScore]);

  // Draw timeline graph
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
    const padL = 32, padR = 8, padT = 8, padB = 20;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Background
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, w, h);

    // Threat zone fills
    const zones = [
      { yStart: 0, yEnd: 0.60, color: 'rgba(57,255,20,0.04)' },
      { yStart: 0.60, yEnd: 0.75, color: 'rgba(255,191,0,0.04)' },
      { yStart: 0.75, yEnd: 0.85, color: 'rgba(255,140,0,0.06)' },
      { yStart: 0.85, yEnd: 1.0, color: 'rgba(255,0,0,0.06)' },
    ];
    zones.forEach((z) => {
      const y1 = padT + plotH * (1 - z.yEnd);
      const y2 = padT + plotH * (1 - z.yStart);
      ctx.fillStyle = z.color;
      ctx.fillRect(padL, y1, plotW, y2 - y1);
    });

    // Threshold lines
    [0.60, 0.75, 0.85].forEach((threshold) => {
      const y = padT + plotH * (1 - threshold);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = '#3A3A3A';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(threshold.toFixed(2), padL - 4, y + 3);
    });

    // Y-axis labels
    ctx.fillStyle = '#3A3A3A';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('0.0', padL - 4, padT + plotH + 3);
    ctx.fillText('1.0', padL - 4, padT + 3);

    // Plot score line
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
      const threat = getThreatLevel(lastScore);
      ctx.strokeStyle = threat.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Glow effect
      ctx.strokeStyle = threat.color.replace(')', ', 0.3)').replace('rgb', 'rgba');
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    // Current value dot
    if (scoreHistory.length > 0) {
      const lastScore = scoreHistory[scoreHistory.length - 1];
      const x = padL + plotW;
      const y = padT + plotH * (1 - clamp(lastScore, 0, 1));
      const threat = getThreatLevel(lastScore);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = threat.color;
      ctx.fill();
    }
  }, [scoreHistory]);

  const injectAttack = useCallback((mode: string) => {
    onSendCommand({ type: 'TEST_JAM' as any, nodeId: mode });
  }, [onSendCommand]);

  const threat = getThreatLevel(anomalyScore);
  const features = ml?.f || [rssi, snr, rssi - snr, 0, 0, rssi, 0, 0];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerTitle}>📡 EDGE-AI EW THREAT ANALYSIS CONSOLE</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ ...styles.badge, background: threat.bg, color: threat.color }}>
              {threat.level}
            </span>
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ML Model Info Bar */}
        <div style={styles.modelBar}>
          <span style={{ color: '#A78BFA' }}>Isolation Forest</span>
          <span style={{ color: '#6B6B6B' }}>│</span>
          <span style={{ color: '#4A4A4A' }}>Trees: {ml?.trees || 100}</span>
          <span style={{ color: '#6B6B6B' }}>│</span>
          <span style={{ color: '#4A4A4A' }}>c(n): {ml?.cn?.toFixed(2) || '11.45'}</span>
          <span style={{ color: '#6B6B6B' }}>│</span>
          <span style={{ color: '#4A4A4A' }}>EWMA α=0.3</span>
          <span style={{ color: '#6B6B6B' }}>│</span>
          <span style={{ color: ml?.ready ? '#39FF14' : '#FFBF00' }}>
            {ml?.ready ? 'RING BUFFER READY' : 'WARMING UP...'}
          </span>
        </div>

        <div style={styles.contentScroll}>
          {/* Score Overview Panel */}
          <div style={styles.scorePanel}>
            <div style={styles.scoreDialContainer}>
              <div style={styles.scoreDial}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: threat.color, fontVariantNumeric: 'tabular-nums' as const }}>
                  {anomalyScore.toFixed(4)}
                </div>
                <div style={{ fontSize: '8px', color: '#4A4A4A', letterSpacing: '2px', marginTop: '2px' }}>EWMA SCORE</div>
              </div>
              {ml && (
                <div style={styles.scoreMetrics}>
                  <div style={styles.metricRow}>
                    <span style={styles.metricLabel}>Raw Score</span>
                    <span style={styles.metricValue}>{ml.rawScore.toFixed(4)}</span>
                  </div>
                  <div style={styles.metricRow}>
                    <span style={styles.metricLabel}>Avg Path</span>
                    <span style={styles.metricValue}>{ml.avgPath.toFixed(2)}</span>
                  </div>
                  <div style={styles.metricRow}>
                    <span style={styles.metricLabel}>Formula</span>
                    <span style={{ ...styles.metricValue, fontSize: '9px', color: '#6B6B6B' }}>
                      s = 2^(-{ml.avgPath.toFixed(1)}/{ml.cn.toFixed(1)})
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Timeline Graph */}
            <div style={styles.timelineContainer}>
              <div style={{ ...styles.sectionLabel, marginBottom: '4px' }}>ANOMALY SCORE TIMELINE (LAST 60 PACKETS)</div>
              <canvas ref={canvasRef} style={styles.canvas} />
            </div>
          </div>

          {/* 8-Feature Gauges Grid */}
          <div style={{ ...styles.sectionLabel, margin: '12px 0 6px' }}>8-FEATURE RF VECTOR (REAL-TIME)</div>
          <div style={styles.featureGrid}>
            {FEATURE_LABELS.map((fl, i) => (
              <FeatureGauge
                key={fl.key}
                label={fl.key}
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
          <div style={{ ...styles.sectionLabel, margin: '12px 0 6px', color: '#FF6B6B' }}>
            ⚡ EW ATTACK INJECTOR — LIVE DEMO TEST BENCH
          </div>
          <div style={styles.attackGrid}>
            <button style={{ ...styles.attackBtn, borderColor: 'rgba(255,0,0,0.4)', color: '#FF0000' }} onClick={() => injectAttack('BARRAGE')}>
              <span style={styles.attackIcon}>🔴</span>
              <span style={styles.attackLabel}>BARRAGE JAMMING</span>
              <span style={styles.attackDesc}>Full-spectrum noise flood</span>
            </button>
            <button style={{ ...styles.attackBtn, borderColor: 'rgba(255,140,0,0.4)', color: '#FF8C00' }} onClick={() => injectAttack('SPOT')}>
              <span style={styles.attackIcon}>🟠</span>
              <span style={styles.attackLabel}>SPOT JAMMING</span>
              <span style={styles.attackDesc}>Targeted channel denial</span>
            </button>
            <button style={{ ...styles.attackBtn, borderColor: 'rgba(255,191,0,0.4)', color: '#FFBF00' }} onClick={() => injectAttack('PULSE')}>
              <span style={styles.attackIcon}>🟡</span>
              <span style={styles.attackLabel}>PULSE JAMMING</span>
              <span style={styles.attackDesc}>Periodic burst interference</span>
            </button>
            <button style={{ ...styles.attackBtn, borderColor: 'rgba(57,255,20,0.4)', color: '#39FF14' }} onClick={() => injectAttack('CLEAR')}>
              <span style={styles.attackIcon}>🟢</span>
              <span style={styles.attackLabel}>CLEAR SPECTRUM</span>
              <span style={styles.attackDesc}>Restore nominal baseline</span>
            </button>
          </div>
          <div style={{ fontSize: '9px', color: '#3A3A3A', marginTop: '6px', lineHeight: '1.5' }}>
            These buttons send <code style={{ color: '#A78BFA' }}>CMD:TEST_JAM:&lt;MODE&gt;</code> to the ESP32 microcontroller,
            which feeds synthetic RF values into the C++ AnomalyEngine running on the physical chip. The ML inference
            (100-tree Isolation Forest traversal, StandardScaler normalization, EWMA smoothing) executes entirely on the
            ESP32 hardware — not simulated in the browser.
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
    width: '840px',
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
    color: '#A78BFA',
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
  modelBar: {
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
  contentScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: '16px 20px',
    overscrollBehavior: 'contain' as const,
  },
  scorePanel: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  scoreDialContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    minWidth: '180px',
  },
  scoreDial: {
    background: '#0D0D0D',
    border: '1px solid #2A2A2A',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'center' as const,
    fontFamily: "'JetBrains Mono', monospace",
  },
  scoreMetrics: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  metricRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
  },
  metricLabel: {
    color: '#4A4A4A',
    letterSpacing: '0.5px',
  },
  metricValue: {
    color: '#A0A0A0',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  timelineContainer: {
    flex: 1,
    minWidth: '300px',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '140px',
    borderRadius: '4px',
    border: '1px solid #2A2A2A',
  },
  sectionLabel: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '2px',
    color: '#3A3A3A',
    textTransform: 'uppercase' as const,
  },
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '8px',
  },
  featureCard: {
    background: '#1A1A1A',
    borderRadius: '4px',
    border: '1px solid #2A2A2A',
    padding: '8px 10px',
  },
  featureHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  featureLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    color: '#6B6B6B',
    letterSpacing: '0.5px',
  },
  featureValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  gaugeTrack: {
    position: 'relative' as const,
    height: '6px',
    background: '#0D0D0D',
    borderRadius: '3px',
    overflow: 'visible' as const,
  },
  attackGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  attackBtn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    padding: '12px',
    background: '#1A1A1A',
    border: '1px solid',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    fontFamily: "'JetBrains Mono', monospace",
  },
  attackIcon: {
    fontSize: '20px',
  },
  attackLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
  },
  attackDesc: {
    fontSize: '8px',
    color: '#4A4A4A',
    letterSpacing: '0.5px',
  },
};
