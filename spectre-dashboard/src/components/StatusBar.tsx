// =============================================================================
// S.P.E.C.T.R.E. TCC — Bottom Status Bar
// =============================================================================

import React from 'react';

interface Props {
  stats: {
    connected: boolean;
    packetsReceived: number;
    droppedFrames: number;
    uptime: number;
    mode: 'MOCK' | 'LIVE';
    portPath: string | null;
  };
  nodeCount: number;
}

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '28px',
    minHeight: '28px',
    background: '#0D0D0D',
    borderTop: '1px solid #2A2A2A',
    padding: '0 16px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#6B6B6B',
    letterSpacing: '0.5px',
  },
  section: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  dot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
  },
  dotGreen: {
    background: '#39FF14',
    boxShadow: '0 0 4px rgba(57, 255, 20, 0.5)',
  },
  dotRed: {
    background: '#FF0000',
    boxShadow: '0 0 4px rgba(255, 0, 0, 0.5)',
  },
  label: {
    color: '#4A4A4A',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    fontSize: '9px',
  },
  value: {
    color: '#A0A0A0',
  },
  valueCyan: {
    color: '#00FFFF',
  },
};

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function StatusBar({ stats, nodeCount }: Props) {
  return (
    <div style={styles.bar}>
      <div style={styles.section}>
        <div style={styles.item}>
          <div style={{ ...styles.dot, ...(stats.connected ? styles.dotGreen : styles.dotRed) }} />
          <span style={styles.value}>
            {stats.connected ? `${stats.mode} LINK` : 'DISCONNECTED'}
          </span>
        </div>

        <div style={styles.item}>
          <span style={styles.label}>Nodes</span>
          <span style={styles.valueCyan}>{nodeCount}</span>
        </div>

        <div style={styles.item}>
          <span style={styles.label}>Packets</span>
          <span style={styles.value}>{stats.packetsReceived.toLocaleString()}</span>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.item}>
          <span style={styles.label}>Uptime</span>
          <span style={styles.value}>{formatUptime(stats.uptime)}</span>
        </div>

        <div style={styles.item}>
          <span style={styles.label}>Dropped</span>
          <span style={{ ...styles.value, color: stats.droppedFrames > 0 ? '#FFBF00' : '#A0A0A0' }}>
            {stats.droppedFrames}
          </span>
        </div>

        <span style={{ color: '#3A3A3A', fontSize: '9px' }}>S.P.E.C.T.R.E. TCC v1.0.0</span>
      </div>
    </div>
  );
}
