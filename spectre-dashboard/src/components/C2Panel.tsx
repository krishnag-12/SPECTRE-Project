// =============================================================================
// S.P.E.C.T.R.E. TCC — Command & Control Panel (Right Panel)
// Engineered for Precision Mission-Critical Node Operations
// =============================================================================

import React, { useMemo } from 'react';
import ZeroizeSwitch from './ZeroizeSwitch';
import type { CommandPayload, TrustState, CryptoTelemetry, MlTelemetry } from '../types';

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
  crypto?: CryptoTelemetry;
  ml?: MlTelemetry;
};

interface Props {
  selectedNode: SelectedNode | null;
  onSendCommand: (command: CommandPayload) => void;
  onApproveNode: (nodeId: string) => void;
  onApproveAll?: () => void;
  onDeselectNode: () => void;
  onOpenCrypto?: () => void;
  onOpenJamming?: () => void;
}

// Sparkline component with SVG gradient
function Sparkline({ data, color = '#00E5FF' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;

  const width = 240;
  const height = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <div
      style={{
        marginTop: '6px',
        height: '32px',
        background: 'rgba(5, 8, 12, 0.7)',
        borderRadius: '3px',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        padding: '2px',
        position: 'relative',
      }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} fill="url(#sparkFill)" />
        <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function C2Panel({
  selectedNode,
  onSendCommand,
  onApproveNode,
  onApproveAll,
  onDeselectNode,
  onOpenCrypto,
  onOpenJamming,
}: Props) {
  const statusColor = useMemo(() => {
    if (!selectedNode) return '#5D6677';
    switch (selectedNode.status) {
      case 'ACTIVE': return '#00E5FF';
      case 'COMPROMISED': return '#FF3344';
      case 'ZEROIZED': return '#5D6677';
      default: return '#FFB300';
    }
  }, [selectedNode?.status]);

  const commandEnabled = !!selectedNode && selectedNode.trustState === 'trusted' && selectedNode.status !== 'ZEROIZED';
  const distanceMeters = selectedNode ? Math.round(Math.hypot(selectedNode.posX, selectedNode.posY)) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-header">
        <span className="panel-header__title">
          <span>◈</span> Command & Control
        </span>
        {selectedNode ? (
          <span className="panel-header__badge panel-header__badge--active">TARGET LOCKED</span>
        ) : (
          <span className="panel-header__badge" style={{ background: 'rgba(255,255,255,0.04)', color: '#5D6677', border: '1px solid rgba(255,255,255,0.08)' }}>
            STANDBY
          </span>
        )}
      </div>

      {!selectedNode ? (
        /* Elevated Understated Empty State */
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 20px',
            gap: '14px',
            textAlign: 'center',
          }}
        >
          {/* Tactical Targeting Crosshair Graphic */}
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              border: '1px dashed rgba(0, 229, 255, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(0, 229, 255, 0.4)',
              fontSize: '20px',
              position: 'relative',
            }}
          >
            ⊕
            <div style={{ position: 'absolute', width: '8px', height: '8px', borderTop: '2px solid #00E5FF', borderLeft: '2px solid #00E5FF', top: '-1px', left: '-1px' }} />
            <div style={{ position: 'absolute', width: '8px', height: '8px', borderTop: '2px solid #00E5FF', borderRight: '2px solid #00E5FF', top: '-1px', right: '-1px' }} />
            <div style={{ position: 'absolute', width: '8px', height: '8px', borderBottom: '2px solid #00E5FF', borderLeft: '2px solid #00E5FF', bottom: '-1px', left: '-1px' }} />
            <div style={{ position: 'absolute', width: '8px', height: '8px', borderBottom: '2px solid #00E5FF', borderRight: '2px solid #00E5FF', bottom: '-1px', right: '-1px' }} />
          </div>

          <div>
            <div
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '11px',
                fontWeight: 700,
                color: '#9DA7B3',
                letterSpacing: '1.5px',
                marginBottom: '6px',
              }}
            >
              STANDBY FOR TARGET ACQUISITION
            </div>
            <div
              style={{
                fontFamily: "'Segoe UI', sans-serif",
                fontSize: '11px',
                color: '#5D6677',
                lineHeight: '1.5',
                maxWidth: '240px',
              }}
            >
              Select any contact from the tactical radar or telemetry roster to engage command operations.
            </div>
          </div>

          {/* System Readiness Checklist */}
          <div
            style={{
              width: '100%',
              background: 'rgba(11, 15, 23, 0.6)',
              borderRadius: '5px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              textAlign: 'left',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9.5px',
            }}
          >
            <div style={{ color: '#39FF14', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>●</span> C2 Command Bus: Armed & Ready
            </div>
            <div style={{ color: '#00E5FF', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>●</span> Crypto Engine: AES-256-GCM
            </div>
            <div style={{ color: '#A78BFA', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>●</span> Edge-AI EW Monitor: Active
            </div>
          </div>
        </div>
      ) : (
        /* Selected Node Detail & Action Roster */
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Node Identity Card */}
          <div
            style={{
              background: 'rgba(15, 20, 29, 0.85)',
              borderRadius: '5px',
              border: '1px solid rgba(0, 229, 255, 0.2)',
              padding: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '16px', fontWeight: 700, letterSpacing: '1.5px', color: statusColor }}>
                  {selectedNode.nodeId}
                </span>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#5D6677', marginTop: '2px' }}>
                  TARGET ID #{selectedNode.msgId}
                </div>
              </div>
              <button
                onClick={onDeselectNode}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#9DA7B3',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9px',
                  padding: '3px 8px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  transition: 'all 120ms ease',
                }}
              >
                ✕ RELEASE
              </button>
            </div>

            {/* Structured Telemetry Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <div>
                <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '9px', textTransform: 'uppercase', color: '#5D6677', fontWeight: 600 }}>Status</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', fontWeight: 600, color: statusColor }}>{selectedNode.status}</div>
              </div>
              <div>
                <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '9px', textTransform: 'uppercase', color: '#5D6677', fontWeight: 600 }}>Distance</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#EDEDED' }}>{distanceMeters}m</div>
              </div>
              <div>
                <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '9px', textTransform: 'uppercase', color: '#5D6677', fontWeight: 600 }}>Position</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#EDEDED' }}>({selectedNode.posX}, {selectedNode.posY})</div>
              </div>
              <div>
                <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '9px', textTransform: 'uppercase', color: '#5D6677', fontWeight: 600 }}>Hop Count</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#EDEDED' }}>{selectedNode.hopCount} Hops</div>
              </div>
              <div>
                <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '9px', textTransform: 'uppercase', color: '#5D6677', fontWeight: 600 }}>RSSI / SNR</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: selectedNode.rssi > -80 ? '#39FF14' : '#FFB300' }}>
                  {selectedNode.rssi} dBm / {selectedNode.snr}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '9px', textTransform: 'uppercase', color: '#5D6677', fontWeight: 600 }}>Anomaly Index</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', fontWeight: 700, color: selectedNode.anomalyScore > 0.7 ? '#FF3344' : selectedNode.anomalyScore > 0.4 ? '#FFB300' : '#39FF14' }}>
                  {selectedNode.anomalyScore.toFixed(3)}
                </div>
              </div>
            </div>

            {/* Trust State Row & Command Authorization */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9.5px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '3px',
                  color: selectedNode.trustState === 'trusted' ? '#39FF14' : '#FFB300',
                  background: selectedNode.trustState === 'trusted' ? 'rgba(57, 255, 20, 0.08)' : 'rgba(255, 179, 0, 0.08)',
                  border: `1px solid ${selectedNode.trustState === 'trusted' ? 'rgba(57,255,20,0.3)' : 'rgba(255,179,0,0.3)'}`,
                }}
              >
                {selectedNode.trustState === 'trusted' ? 'TRUSTED COMMAND CHANNEL' : 'PENDING APPROVAL'}
              </span>

              {selectedNode.trustState !== 'trusted' && (
                <button
                  onClick={() => onApproveNode(selectedNode.nodeId)}
                  style={{
                    background: 'rgba(57, 255, 20, 0.12)',
                    border: '1px solid rgba(57, 255, 20, 0.5)',
                    color: '#39FF14',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '9.5px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  ✓ APPROVE
                </button>
              )}

              {onApproveAll && (
                <button
                  onClick={onApproveAll}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#9DA7B3',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '9px',
                    padding: '3px 6px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                  title="Approve trust for all pending nodes"
                >
                  ALL
                </button>
              )}
            </div>
          </div>

          {/* Signal History Card */}
          <div
            style={{
              background: 'rgba(15, 20, 29, 0.75)',
              borderRadius: '5px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              padding: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#5D6677' }}>
                Signal History (RSSI dBm)
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#00E5FF' }}>
                {selectedNode.history.length > 0 ? `${selectedNode.history[selectedNode.history.length - 1]} dBm` : '—'}
              </span>
            </div>
            <Sparkline data={selectedNode.history} color="#00E5FF" />
          </div>

          {/* Decrypted Payload Card */}
          <div>
            <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#5D6677', marginBottom: '4px' }}>
              Decrypted Payload Stream
            </div>
            <div
              style={{
                background: '#040609',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '8px 10px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10.5px',
                color: selectedNode.status === 'COMPROMISED' ? '#FF3344' : '#39FF14',
                lineHeight: '1.5',
                wordBreak: 'break-word',
              }}
            >
              &gt; {selectedNode.payload || '(no recent payload)'}
            </div>
          </div>

          {/* Tactical Command Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#5D6677' }}>
              Tactical Operational Commands
            </div>
            <button
              disabled={!commandEnabled}
              onClick={() => onSendCommand({ type: 'PING', nodeId: selectedNode.nodeId })}
              style={{
                height: '34px',
                background: commandEnabled ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${commandEnabled ? 'rgba(0, 229, 255, 0.35)' : 'rgba(255,255,255,0.05)'}`,
                color: commandEnabled ? '#00E5FF' : '#3E4654',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '1px',
                borderRadius: '4px',
                cursor: commandEnabled ? 'pointer' : 'not-allowed',
                transition: 'all 120ms ease',
              }}
              title={commandEnabled ? 'Send low-latency echo ping' : 'Requires approved command trust'}
            >
              ◉ PING NODE
            </button>

            <button
              disabled={!commandEnabled}
              onClick={() => onSendCommand({ type: 'REKEY', nodeId: selectedNode.nodeId })}
              style={{
                height: '34px',
                background: commandEnabled ? 'rgba(57, 255, 20, 0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${commandEnabled ? 'rgba(57, 255, 20, 0.35)' : 'rgba(255,255,255,0.05)'}`,
                color: commandEnabled ? '#39FF14' : '#3E4654',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '1px',
                borderRadius: '4px',
                cursor: commandEnabled ? 'pointer' : 'not-allowed',
                transition: 'all 120ms ease',
              }}
              title={commandEnabled ? 'Trigger over-the-air ECDH ephemeral re-keying' : 'Requires approved command trust'}
            >
              ◈ ECDH RE-KEY
            </button>
          </div>

          {/* Deep Inspectors Launchers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontFamily: "'Segoe UI', sans-serif", fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#5D6677' }}>
              Deep Diagnostics
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                onClick={onOpenCrypto}
                style={{
                  height: '32px',
                  background: 'rgba(0, 229, 255, 0.06)',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  color: '#00E5FF',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9px',
                  fontWeight: 600,
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
                title="Inspect live AES-256-GCM pipeline & 1-bit tamper test bench"
              >
                🔐 CRYPTO PIPELINE
              </button>
              <button
                onClick={onOpenJamming}
                style={{
                  height: '32px',
                  background: 'rgba(167, 139, 250, 0.06)',
                  border: '1px solid rgba(167, 139, 250, 0.3)',
                  color: '#A78BFA',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9px',
                  fontWeight: 600,
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
                title="Inspect Edge-AI 8-feature gauges & EW attack injection console"
              >
                📡 EW / ML CONSOLE
              </button>
            </div>
          </div>

          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '4px 0' }} />

          {/* Hardware Armed Zeroize Switch */}
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
