// =============================================================================
// S.P.E.C.T.R.E. TCC — Bottom Telemetry & Health Status Bar
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

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function StatusBar({ stats, nodeCount }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '30px',
        minHeight: '30px',
        background: 'rgba(10, 14, 20, 0.94)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(0, 229, 255, 0.16)',
        padding: '0 16px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '10px',
        color: '#9DA7B3',
        letterSpacing: '0.5px',
        zIndex: 20,
        position: 'relative',
      }}
    >
      {/* Left Telemetry Indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: stats.connected ? '#39FF14' : '#FF3344',
              boxShadow: stats.connected ? '0 0 6px rgba(57, 255, 20, 0.6)' : '0 0 6px rgba(255, 51, 68, 0.6)',
            }}
          />
          <span style={{ fontWeight: 600, color: stats.connected ? '#EDEDED' : '#FF3344' }}>
            {stats.connected ? `${stats.mode} TELEMETRY LINK ACTIVE` : 'NO CARRIER LINK'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#5D6677', textTransform: 'uppercase', fontSize: '9px' }}>NODES:</span>
          <span style={{ color: '#00E5FF', fontWeight: 700 }}>{nodeCount} ONLINE</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#5D6677', textTransform: 'uppercase', fontSize: '9px' }}>PACKETS:</span>
          <span style={{ color: '#EDEDED', fontVariantNumeric: 'tabular-nums' }}>
            {stats.packetsReceived.toLocaleString()} RX
          </span>
        </div>
      </div>

      {/* Right System Health Indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#5D6677', textTransform: 'uppercase', fontSize: '9px' }}>UPTIME:</span>
          <span style={{ color: '#EDEDED', fontVariantNumeric: 'tabular-nums' }}>
            {formatUptime(stats.uptime)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#5D6677', textTransform: 'uppercase', fontSize: '9px' }}>DROPPED:</span>
          <span style={{ color: stats.droppedFrames > 0 ? '#FFB300' : '#EDEDED', fontVariantNumeric: 'tabular-nums', fontWeight: stats.droppedFrames > 0 ? 700 : 400 }}>
            {stats.droppedFrames}
          </span>
        </div>

        <span style={{ color: '#5D6677', fontSize: '9px', letterSpacing: '1px' }}>
          S.P.E.C.T.R.E. TCC <strong style={{ color: '#00E5FF' }}>v1.0.0</strong>
        </span>
      </div>
    </div>
  );
}
