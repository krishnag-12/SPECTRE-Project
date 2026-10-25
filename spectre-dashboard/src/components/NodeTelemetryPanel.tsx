// =============================================================================
// S.P.E.C.T.R.E. TCC — Node Telemetry Panel (Left Panel)
// Real-Time Field Node Roster & Live Tactical Event Stream
// =============================================================================

import React, { useState } from 'react';
import type { TrustState } from '../types';
import type { CommandPayload } from '../types';

interface NodeRow {
  nodeId: string;
  status: string;
  posX: number;
  posY: number;
  rssi: number;
  anomalyScore: number;
  lastSeen: number;
  trustState: TrustState;
}

interface EventEntry {
  id: string;
  time: string;
  severity: 'normal' | 'warning' | 'critical';
  message: string;
}

interface Props {
  nodes: NodeRow[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSendCommand: (command: CommandPayload) => void;
  onApproveAll?: () => void;
  eventLog: EventEntry[];
}

function getTimeSince(lastSeen: number) {
  if (!lastSeen) return null;
  const seconds = Math.floor((Date.now() - lastSeen) / 1000);
  if (seconds > 45) return 'LOST';
  return null;
}

function getJammingLevel(anomalyScore: number) {
  if (anomalyScore > 0.85) return { level: 'BARRAGE', color: '#FF3344' };
  if (anomalyScore > 0.70) return { level: 'SPOT/PULSE', color: '#FF9100' };
  if (anomalyScore > 0.60) return { level: 'ANOMALY', color: '#FFB300' };
  return { level: 'CLEAR', color: '#39FF14' };
}

export default function NodeTelemetryPanel({
  nodes,
  selectedNodeId,
  onSelectNode,
  onSendCommand,
  onApproveAll,
  eventLog,
}: Props) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [logExpanded, setLogExpanded] = useState(true);
  const [confirmKill, setConfirmKill] = useState<string | null>(null);

  const hasPending = nodes.some((n) => n.trustState !== 'trusted');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-header">
        <span className="panel-header__title">
          <span>⊞</span> Node Telemetry Roster
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {hasPending && onApproveAll && (
            <button
              onClick={onApproveAll}
              style={{
                background: 'rgba(57, 255, 20, 0.12)',
                border: '1px solid rgba(57, 255, 20, 0.45)',
                color: '#39FF14',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.8px',
                padding: '2px 7px',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
              title="Approve command trust for all pending nodes"
            >
              ✓ APPROVE ALL
            </button>
          )}
          <span className="panel-header__badge panel-header__badge--active">
            {nodes.length} CONTACTS
          </span>
        </div>
      </div>

      {/* Main Table View */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '430px', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px' }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: 'rgba(14, 18, 26, 0.96)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <th style={thStyle}>Node ID</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Pos (X,Y)</th>
              <th style={thStyle}>RSSI</th>
              <th style={thStyle}>EW Threat</th>
              <th style={thStyle}>Trust</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => {
              const isSelected = node.nodeId === selectedNodeId;
              const isCompromised = node.status === 'COMPROMISED';
              const isZeroized = node.status === 'ZEROIZED';
              const isAnomaly = node.anomalyScore > 0.6;
              const contactLost = getTimeSince(node.lastSeen) === 'LOST';
              const jamming = getJammingLevel(node.anomalyScore);

              let rowBg = 'transparent';
              if (isSelected) rowBg = 'rgba(0, 229, 255, 0.08)';
              else if (hoveredRow === node.nodeId) rowBg = 'rgba(255, 255, 255, 0.03)';
              else if (isCompromised) rowBg = 'rgba(255, 51, 68, 0.08)';
              else if (isAnomaly) rowBg = 'rgba(255, 179, 0, 0.05)';

              return (
                <tr
                  key={node.nodeId}
                  onClick={() => onSelectNode(node.nodeId)}
                  onMouseEnter={() => setHoveredRow(node.nodeId)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    cursor: 'pointer',
                    background: rowBg,
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    borderLeft: isSelected ? '3px solid #00E5FF' : '3px solid transparent',
                    transition: 'background 120ms ease',
                  }}
                >
                  {/* Node ID */}
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 700, color: isZeroized ? '#5D6677' : isCompromised ? '#FF3344' : '#00E5FF' }}>
                      {node.nodeId}
                    </span>
                  </td>

                  {/* Status */}
                  <td style={tdStyle}>
                    {contactLost ? (
                      <span style={{ ...statusBadgeStyle, color: '#FFB300', background: 'rgba(255,179,0,0.1)', border: '1px solid rgba(255,179,0,0.3)' }}>
                        ⊘ LOST
                      </span>
                    ) : isZeroized ? (
                      <span style={{ ...statusBadgeStyle, color: '#5D6677', background: 'rgba(93,102,119,0.1)', border: '1px solid rgba(93,102,119,0.3)', textDecoration: 'line-through' }}>
                        ✕ ZEROIZED
                      </span>
                    ) : isCompromised ? (
                      <span style={{ ...statusBadgeStyle, color: '#FF3344', background: 'rgba(255,51,68,0.12)', border: '1px solid rgba(255,51,68,0.35)' }}>
                        ◉ COMPROMISED
                      </span>
                    ) : (
                      <span style={{ ...statusBadgeStyle, color: '#00E5FF', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)' }}>
                        ● ACTIVE
                      </span>
                    )}
                  </td>

                  {/* Coordinates */}
                  <td style={{ ...tdStyle, color: '#9DA7B3', fontVariantNumeric: 'tabular-nums' }}>
                    ({node.posX}, {node.posY})
                  </td>

                  {/* RSSI */}
                  <td style={{ ...tdStyle, color: node.rssi > -75 ? '#39FF14' : node.rssi > -90 ? '#FFB300' : '#FF3344', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {node.rssi} dBm
                  </td>

                  {/* EW Threat */}
                  <td style={tdStyle}>
                    {jamming.level === 'CLEAR' ? (
                      <span style={{ color: 'rgba(57, 255, 20, 0.7)', fontSize: '9px' }}>NOMINAL</span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '8.5px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '2px',
                          color: jamming.color,
                          background: `${jamming.color}15`,
                          border: `1px solid ${jamming.color}40`,
                        }}
                      >
                        ⚠ {jamming.level}
                      </span>
                    )}
                  </td>

                  {/* Trust */}
                  <td style={tdStyle}>
                    <span style={{ color: node.trustState === 'trusted' ? '#39FF14' : '#FFB300', fontSize: '9px', fontWeight: 600 }}>
                      {node.trustState === 'trusted' ? 'TRUSTED' : 'PENDING'}
                    </span>
                  </td>

                  {/* Action / Zeroize */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {(() => {
                      const isKillDisabled = isZeroized || isCompromised || contactLost;
                      const isConfirming = confirmKill === node.nodeId;
                      if (isKillDisabled) {
                        return <span style={{ color: '#3E4654', fontSize: '8.5px' }}>—</span>;
                      }
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isConfirming) {
                              onSendCommand({ type: 'ZERO', nodeId: node.nodeId });
                              setConfirmKill(null);
                            } else {
                              setConfirmKill(node.nodeId);
                              setTimeout(() => setConfirmKill((prev) => prev === node.nodeId ? null : prev), 3000);
                            }
                          }}
                          style={{
                            background: isConfirming ? 'rgba(255, 51, 68, 0.2)' : 'transparent',
                            border: `1px solid ${isConfirming ? '#FF3344' : 'rgba(255, 51, 68, 0.35)'}`,
                            color: '#FF3344',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '8.5px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '2px',
                            cursor: 'pointer',
                          }}
                          title={isConfirming ? 'Click to confirm immediate zeroization' : 'Zeroize node'}
                        >
                          {isConfirming ? 'CONFIRM' : 'KILL'}
                        </button>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {nodes.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#5D6677', fontFamily: "'Segoe UI', sans-serif", fontSize: '11px' }}>
            No active LoRa field nodes registered. Awaiting telemetry frames...
          </div>
        )}
      </div>

      {/* Live Event Stream Section */}
      <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', maxHeight: '200px', display: 'flex', flexDirection: 'column', background: 'rgba(7, 10, 15, 0.95)' }}>
        <div
          onClick={() => setLogExpanded(!logExpanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            background: 'rgba(11, 15, 23, 0.9)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', color: '#9DA7B3', textTransform: 'uppercase' }}>
            Live Event Stream {logExpanded ? '▾' : '▸'}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#5D6677' }}>
            {eventLog.length} EVENTS
          </span>
        </div>

        {logExpanded && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {eventLog.slice(0, 30).map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '3px 12px',
                  fontSize: '9.5px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                <span style={{ color: '#5D6677', flexShrink: 0, fontSize: '8.5px' }}>{entry.time}</span>
                <span
                  style={{
                    color:
                      entry.severity === 'critical'
                        ? '#FF3344'
                        : entry.severity === 'warning'
                        ? '#FFB300'
                        : '#39FF14',
                    wordBreak: 'break-word',
                  }}
                >
                  {entry.message}
                </span>
              </div>
            ))}
            {eventLog.length === 0 && (
              <div style={{ padding: '8px 12px', color: '#5D6677', fontSize: '9.5px', fontFamily: "'JetBrains Mono', monospace" }}>
                Awaiting telemetry frame updates...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '7px 8px',
  textAlign: 'left',
  fontWeight: 700,
  fontSize: '9px',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: '#5D6677',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
};

const statusBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '8.5px',
  fontWeight: 600,
  padding: '1px 5px',
  borderRadius: '2px',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
};
