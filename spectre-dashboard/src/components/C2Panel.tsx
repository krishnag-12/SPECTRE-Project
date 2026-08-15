// =============================================================================
// S.P.E.C.T.R.E. TCC — C2 Command & Control Panel (Right Panel)
// =============================================================================

import React, { useMemo } from 'react';
import ZeroizeSwitch from './ZeroizeSwitch';
import type { CommandPayload, TrustState } from '../types';

type SelectedNode = {
  nodeId: string;
  status: string;
  hopCount: number;
  posX: number;
  posY: number;
  rssi: number;
  snr: number;
  anomalyScore: number;
  msgId: number;
  payload: string;
  history: number[];
  trustState: TrustState;
};

interface Props {
  selectedNode: SelectedNode | null;
  onSendCommand: (command: CommandPayload) => void;
  onApproveNode: (nodeId: string) => void;
  onDeselectNode: () => void;
}

const styles: any = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '32px',
  },
  emptyIcon: { fontSize: '48px', opacity: 0.15 },
  emptyText: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#4A4A4A', textAlign: 'center', letterSpacing: '0.5px', lineHeight: '1.6',
  },
  emptyHint: {
    fontFamily: "'Orbitron', sans-serif", fontSize: '9px', color: '#3A3A3A', letterSpacing: '2px', textTransform: 'uppercase',
  },
  detailSection: { flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' },
  card: { background: '#1A1A1A', borderRadius: '4px', border: '1px solid #2A2A2A', padding: '12px' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
  cardNodeId: {
    fontFamily: "'Orbitron', sans-serif", fontSize: '16px', fontWeight: 700, letterSpacing: '2px', color: '#00FFFF',
  },
  deselectBtn: {
    background: 'transparent', border: '1px solid #2A2A2A', color: '#6B6B6B', fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px', padding: '2px 8px', borderRadius: '2px', cursor: 'pointer', transition: 'all 120ms ease',
  },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  detailItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  detailLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', fontWeight: 500, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#4A4A4A',
  },
  detailValue: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 400, color: '#E0E0E0', fontVariantNumeric: 'tabular-nums' },
  payloadCard: {
    background: '#0D0D0D', borderRadius: '3px', border: '1px solid #1E1E1E', padding: '10px', fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px', color: '#39FF14', lineHeight: '1.5', wordBreak: 'break-word',
  },
  payloadLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', fontWeight: 500, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#4A4A4A', marginBottom: '6px',
  },
  sparklineContainer: { marginTop: '4px', height: '32px', background: '#0D0D0D', borderRadius: '3px', border: '1px solid #1E1E1E', padding: '4px', position: 'relative' },
  commandSection: { display: 'flex', flexDirection: 'column', gap: '8px' },
  commandBtn: {
    width: '100%', height: '36px', background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '4px', color: '#A0A0A0',
    fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', fontWeight: 500, letterSpacing: '1.5px',
    textTransform: 'uppercase', cursor: 'pointer', transition: 'all 150ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  },
  commandBtnPing: { borderColor: 'rgba(0, 255, 255, 0.2)', color: '#00FFFF' },
  commandBtnRekey: { borderColor: 'rgba(57, 255, 20, 0.2)', color: '#39FF14' },
  commandBtnDisabled: { opacity: 0.35, cursor: 'not-allowed' },
  divider: { height: '1px', background: '#2A2A2A', margin: '4px 0' },
  sectionLabel: {
    fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: '#3A3A3A', marginBottom: '4px',
  },
  trustRow: { marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' },
  trustBadgePending: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#FFBF00', border: '1px solid rgba(255,191,0,0.4)', padding: '2px 6px', borderRadius: '3px',
  },
  trustBadgeTrusted: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#39FF14', border: '1px solid rgba(57,255,20,0.4)', padding: '2px 6px', borderRadius: '3px',
  },
  approveBtn: {
    border: '1px solid rgba(57,255,20,0.4)', color: '#39FF14', background: '#111', borderRadius: '3px',
    fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', padding: '4px 8px', cursor: 'pointer',
  },
};

function Sparkline({ data, color = '#00FFFF' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;

  const width = 200;
  const height = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  });

  return (
    <div style={styles.sparklineContainer}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} fill="url(#sparkFill)" />
        <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function C2Panel({ selectedNode, onSendCommand, onApproveNode, onDeselectNode }: Props) {
  const statusColor = useMemo(() => {
    if (!selectedNode) return '#6B6B6B';
    switch (selectedNode.status) {
      case 'ACTIVE': return '#00FFFF';
      case 'COMPROMISED': return '#FF0000';
      case 'ZEROIZED': return '#6B6B6B';
      default: return '#FFBF00';
    }
  }, [selectedNode?.status]);

  const commandEnabled = !!selectedNode && selectedNode.trustState === 'trusted' && selectedNode.status !== 'ZEROIZED';

  return (
    <div style={styles.container}>
      <div className="panel-header">
        <span className="panel-header__title">Command & Control</span>
        {selectedNode && <span className="panel-header__badge panel-header__badge--active">LOCKED</span>}
      </div>

      {!selectedNode ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>⊕</div>
          <div style={styles.emptyText}>Select a node from the radar map or telemetry table to access C2 controls.</div>
          <div style={styles.emptyHint}>No Target Selected</div>
        </div>
      ) : (
        <div style={styles.detailSection}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={{ ...styles.cardNodeId, color: statusColor }}>{selectedNode.nodeId}</span>
              <button style={styles.deselectBtn} onClick={onDeselectNode}>✕ RELEASE</button>
            </div>

            <div style={styles.detailGrid}>
              <div style={styles.detailItem}><span style={styles.detailLabel}>Status</span><span style={{ ...styles.detailValue, color: statusColor }}>{selectedNode.status}</span></div>
              <div style={styles.detailItem}><span style={styles.detailLabel}>Hop Count</span><span style={styles.detailValue}>{selectedNode.hopCount}</span></div>
              <div style={styles.detailItem}><span style={styles.detailLabel}>Position</span><span style={styles.detailValue}>({selectedNode.posX}, {selectedNode.posY})</span></div>
              <div style={styles.detailItem}><span style={styles.detailLabel}>RSSI / SNR</span><span style={styles.detailValue}>{selectedNode.rssi} dBm / {selectedNode.snr}</span></div>
              <div style={styles.detailItem}><span style={styles.detailLabel}>Anomaly Score</span><span style={{ ...styles.detailValue, color: selectedNode.anomalyScore > 0.7 ? '#FFBF00' : selectedNode.anomalyScore > 0.4 ? '#A0A0A0' : '#39FF14' }}>{selectedNode.anomalyScore}</span></div>
              <div style={styles.detailItem}><span style={styles.detailLabel}>Msg ID</span><span style={styles.detailValue}>#{selectedNode.msgId}</span></div>
            </div>

            <div style={styles.trustRow}>
              <span style={selectedNode.trustState === 'trusted' ? styles.trustBadgeTrusted : styles.trustBadgePending}>
                {selectedNode.trustState === 'trusted' ? 'TRUSTED' : 'PENDING APPROVAL'}
              </span>
              {selectedNode.trustState !== 'trusted' && (
                <button style={styles.approveBtn} onClick={() => onApproveNode(selectedNode.nodeId)}>
                  APPROVE COMMAND ACCESS
                </button>
              )}
            </div>
          </div>

          <div style={styles.card}>
            <span style={styles.sectionLabel}>Signal History</span>
            <Sparkline data={selectedNode.history} color="#00FFFF" />
          </div>

          <div>
            <span style={styles.payloadLabel}>Last Payload</span>
            <div style={{ ...styles.payloadCard, color: selectedNode.status === 'COMPROMISED' ? '#FF0000' : '#39FF14' }}>
              &gt; {selectedNode.payload}
            </div>
          </div>

          <div style={styles.commandSection}>
            <span style={styles.sectionLabel}>Tactical Commands</span>
            <button
              style={{ ...styles.commandBtn, ...styles.commandBtnPing, ...(commandEnabled ? {} : styles.commandBtnDisabled) }}
              disabled={!commandEnabled}
              onClick={() => onSendCommand({ type: 'PING', nodeId: selectedNode.nodeId })}
            >
              ◉ PING NODE
            </button>
            <button
              style={{ ...styles.commandBtn, ...styles.commandBtnRekey, ...(commandEnabled ? {} : styles.commandBtnDisabled) }}
              disabled={!commandEnabled}
              onClick={() => onSendCommand({ type: 'REKEY', nodeId: selectedNode.nodeId })}
            >
              ◈ ECDH RE-KEY
            </button>
          </div>

          <div style={styles.divider} />

          <ZeroizeSwitch
            nodeId={selectedNode.nodeId}
            onExecute={onSendCommand}
            disabled={!commandEnabled}
          />
        </div>
      )}
    </div>
  );
}
