// =============================================================================
// S.P.E.C.T.R.E. TCC — Node Telemetry Panel (Left Panel)
// Scrollable tactical data table with EW threat detection
// =============================================================================

import React, { useState } from 'react';
import type { TrustState } from '../types';

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

const styles: any = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  tableSection: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
  },
  thead: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
  },
  th: {
    padding: '6px 8px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: '9px',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: '#6B6B6B',
    background: '#151515',
    borderBottom: '1px solid #2A2A2A',
    whiteSpace: 'nowrap',
  },
  tr: {
    cursor: 'pointer',
    transition: 'background 120ms ease',
    borderBottom: '1px solid #1E1E1E',
  },
  trHover: {
    background: '#1E1E1E',
  },
  trSelected: {
    background: 'rgba(0, 255, 255, 0.06)',
    borderLeft: '2px solid #00FFFF',
  },
  trAnomaly: {
    animation: 'flashAmber 1.2s ease infinite',
  },
  trCompromised: {
    animation: 'flashCritical 0.8s ease infinite',
  },
  td: {
    padding: '6px 8px',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
  },
  nodeId: {
    fontWeight: 600,
    letterSpacing: '0.5px',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '9px',
    fontWeight: 500,
    padding: '1px 6px',
    borderRadius: '2px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
  },
  statusActive: {
    color: '#00FFFF',
    background: 'rgba(0, 255, 255, 0.08)',
    border: '1px solid rgba(0, 255, 255, 0.2)',
  },
  statusCompromised: {
    color: '#FF0000',
    background: 'rgba(255, 0, 0, 0.08)',
    border: '1px solid rgba(255, 0, 0, 0.3)',
  },
  statusZeroized: {
    color: '#6B6B6B',
    background: 'rgba(100, 100, 100, 0.08)',
    border: '1px solid rgba(100, 100, 100, 0.2)',
    textDecoration: 'line-through',
  },
  statusLost: {
    color: '#FFBF00',
    background: 'rgba(255, 191, 0, 0.08)',
    border: '1px solid rgba(255, 191, 0, 0.2)',
  },
  ewBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '9px',
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: '2px',
    letterSpacing: '0.5px',
    color: '#FFBF00',
    background: 'rgba(255, 191, 0, 0.1)',
    border: '1px solid rgba(255, 191, 0, 0.3)',
    animation: 'pulse 1s ease infinite',
  },
  ewClear: {
    color: '#4B5320',
    fontSize: '9px',
  },
  // ---- Event Log Section ----
  logSection: {
    borderTop: '1px solid #2A2A2A',
    maxHeight: '200px',
    overflowY: 'auto',
    background: '#0D0D0D',
  },
  logHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    background: '#111111',
    borderBottom: '1px solid #1E1E1E',
    cursor: 'pointer',
  },
  logHeaderTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '2px',
    color: '#6B6B6B',
    textTransform: 'uppercase',
  },
  logEntry: {
    display: 'flex',
    gap: '8px',
    padding: '3px 8px',
    fontSize: '10px',
    borderBottom: '1px solid #141414',
    fontFamily: "'JetBrains Mono', monospace",
    animation: 'fadeIn 300ms ease',
  },
  logTime: {
    color: '#4A4A4A',
    flexShrink: 0,
    fontSize: '9px',
    minWidth: '65px',
  },
  logMsg: {
    wordBreak: 'break-word',
  },
  logNormal: { color: '#39FF14' },
  logWarning: { color: '#FFBF00' },
  logCritical: { color: '#FF0000' },
};

function getTimeSince(lastSeen) {
  if (!lastSeen) return null;
  const seconds = Math.floor((Date.now() - lastSeen) / 1000);
  if (seconds > 30) return 'LOST';
  return null;
}

function getJammingLevel(anomalyScore, rssi) {
  if (anomalyScore > 0.85) return { level: 'HIGH', color: '#FF0000' };
  if (anomalyScore > 0.7) return { level: 'MEDIUM', color: '#FFBF00' };
  if (anomalyScore > 0.4) return { level: 'LOW', color: '#4B5320' };
  return { level: 'CLEAR', color: '#4B5320' };
}

interface Props {
  nodes: NodeRow[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  eventLog: EventEntry[];
}

export default function NodeTelemetryPanel({ nodes, selectedNodeId, onSelectNode, eventLog }: Props) {
  const [hoveredRow, setHoveredRow] = useState(null);
  const [logExpanded, setLogExpanded] = useState(true);

  return (
    <div style={styles.container}>
      {/* Panel Header */}
      <div className="panel-header">
        <span className="panel-header__title">Node Telemetry</span>
        <span className={`panel-header__badge panel-header__badge--active`}>
          {nodes.length} NODES
        </span>
      </div>

      {/* Data Table */}
      <div style={styles.tableSection}>
        <table style={styles.table}>
          <thead style={styles.thead}>
            <tr>
              <th style={styles.th}>Node ID</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Pos (X,Y)</th>
              <th style={styles.th}>RSSI</th>
              <th style={styles.th}>EW Threat</th>
              <th style={styles.th}>Trust</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => {
              const isSelected = node.nodeId === selectedNodeId;
              const isAnomaly = node.anomalyScore > 0.7;
              const isCompromised = node.status === 'COMPROMISED';
              const isZeroized = node.status === 'ZEROIZED';
              const contactLost = getTimeSince(node.lastSeen) === 'LOST';
              const jamming = getJammingLevel(node.anomalyScore, node.rssi);

              let rowStyle = { ...styles.tr };
              if (isSelected) rowStyle = { ...rowStyle, ...styles.trSelected };
              if (hoveredRow === node.nodeId && !isSelected) rowStyle = { ...rowStyle, ...styles.trHover };

              // Determine CSS animation class
              let rowClassName = '';
              if (isCompromised) rowClassName = 'row-compromised';
              else if (isAnomaly) rowClassName = 'row-anomaly';

              return (
                <tr
                  key={node.nodeId}
                  style={rowStyle}
                  className={rowClassName}
                  onClick={() => onSelectNode(node.nodeId)}
                  onMouseEnter={() => setHoveredRow(node.nodeId)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td style={styles.td}>
                    <span style={{
                      ...styles.nodeId,
                      color: isZeroized ? '#6B6B6B'
                        : isCompromised ? '#FF0000'
                        : '#00FFFF',
                    }}>
                      {node.nodeId}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {contactLost ? (
                      <span style={{ ...styles.statusBadge, ...styles.statusLost }}>
                        ⊘ LOST
                      </span>
                    ) : isZeroized ? (
                      <span style={{ ...styles.statusBadge, ...styles.statusZeroized }}>
                        ✕ ZEROIZED
                      </span>
                    ) : isCompromised ? (
                      <span style={{ ...styles.statusBadge, ...styles.statusCompromised }}>
                        ◉ COMPROMISED
                      </span>
                    ) : (
                      <span style={{ ...styles.statusBadge, ...styles.statusActive }}>
                        ● ACTIVE
                      </span>
                    )}
                  </td>
                  <td style={{ ...styles.td, color: '#A0A0A0', fontVariantNumeric: 'tabular-nums' }}>
                    ({node.posX}, {node.posY})
                  </td>
                  <td style={{
                    ...styles.td,
                    color: node.rssi > -70 ? '#39FF14'
                      : node.rssi > -85 ? '#FFBF00'
                      : '#FF0000',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {node.rssi} dBm
                  </td>
                  <td style={styles.td}>
                    {jamming.level === 'CLEAR' ? (
                      <span style={styles.ewClear}>CLEAR</span>
                    ) : (
                      <span style={styles.ewBadge}>
                        ⚠ {jamming.level}
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      color: node.trustState === 'trusted' ? '#39FF14' : '#FFBF00',
                      fontSize: '9px',
                      letterSpacing: '0.8px',
                    }}>
                      {node.trustState === 'trusted' ? 'TRUSTED' : 'PENDING'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Event Log */}
      <div style={styles.logSection}>
        <div style={styles.logHeader} onClick={() => setLogExpanded(!logExpanded)}>
          <span style={styles.logHeaderTitle}>
            Event Log {logExpanded ? '▾' : '▸'}
          </span>
          <span style={{ fontSize: '9px', color: '#4A4A4A' }}>
            {eventLog.length} events
          </span>
        </div>
        {logExpanded && (
          <div>
            {eventLog.slice(0, 30).map((entry) => (
              <div key={entry.id} style={styles.logEntry}>
                <span style={styles.logTime}>{entry.time}</span>
                <span
                  style={{
                    ...styles.logMsg,
                    ...(entry.severity === 'critical' ? styles.logCritical
                      : entry.severity === 'warning' ? styles.logWarning
                      : styles.logNormal),
                  }}
                >
                  {entry.message}
                </span>
              </div>
            ))}
            {eventLog.length === 0 && (
              <div style={{ ...styles.logEntry, color: '#4A4A4A' }}>
                Awaiting telemetry stream...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
