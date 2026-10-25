// =============================================================================
// S.P.E.C.T.R.E. TCC — Custom Frameless Operational Titlebar
// High-Precision Mission-Critical Header
// =============================================================================

import React, { useState, useEffect } from 'react';
import type { SerialConnectionState } from '../webSerialBridge';

interface Props {
  connected: boolean;
  serialState: SerialConnectionState;
  serialPort: string | null;
  onSerialConnect: () => void;
  onSerialDisconnect: () => void;
  onOpenCrypto?: () => void;
  onOpenJamming?: () => void;
  shaderActive?: boolean;
  onToggleShader?: () => void;
}

export default function TitleBar({
  connected,
  serialState,
  serialPort,
  onSerialConnect,
  onSerialDisconnect,
  onOpenCrypto,
  onOpenJamming,
  shaderActive = true,
  onToggleShader,
}: Props) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('en-IN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Kolkata',
        }) + ' IST'
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const isConnected = connected || serialState === 'connected';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '40px',
        minHeight: '40px',
        background: 'rgba(10, 14, 20, 0.94)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(0, 229, 255, 0.18)',
        padding: '0 14px',
        zIndex: 1000,
        WebkitAppRegion: 'drag',
      } as any}
    >
      {/* Left: SPECTRE Mission Branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isConnected ? '#39FF14' : '#FF3344',
              boxShadow: isConnected
                ? '0 0 8px rgba(57, 255, 20, 0.7)'
                : '0 0 8px rgba(255, 51, 68, 0.7)',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '13px',
                fontWeight: 800,
                letterSpacing: '2.5px',
                color: '#EDEDED',
              }}
            >
              <strong style={{ color: '#00E5FF', fontWeight: 900 }}>S.P.E.C.T.R.E.</strong> TCC
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                color: '#5D6677',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              C2 CONSOLE
            </span>
          </div>
        </div>
      </div>

      {/* Center: Real Connection Status & Tactical Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', WebkitAppRegion: 'no-drag' } as any}>
        {/* Real Status Badge */}
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9.5px',
            fontWeight: 700,
            letterSpacing: '1px',
            padding: '3px 10px',
            borderRadius: '3px',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background:
              serialState === 'connecting'
                ? 'rgba(255, 179, 0, 0.12)'
                : serialState === 'error'
                ? 'rgba(255, 51, 68, 0.15)'
                : isConnected
                ? 'rgba(57, 255, 20, 0.12)'
                : 'rgba(255, 51, 68, 0.12)',
            color:
              serialState === 'connecting'
                ? '#FFB300'
                : serialState === 'error'
                ? '#FF3344'
                : isConnected
                ? '#39FF14'
                : '#FF3344',
            border: `1px solid ${
              serialState === 'connecting'
                ? 'rgba(255, 179, 0, 0.35)'
                : serialState === 'error'
                ? 'rgba(255, 51, 68, 0.35)'
                : isConnected
                ? 'rgba(57, 255, 20, 0.35)'
                : 'rgba(255, 51, 68, 0.35)'
            }`,
          }}
        >
          {serialState === 'connecting'
            ? '◌ CONNECTING...'
            : serialState === 'error'
            ? '✖ LINK ERROR'
            : isConnected
            ? '● LINK ACTIVE'
            : '○ NO CARRIER'}
        </span>

        {/* Serial Connect / Disconnect Action */}
        {serialState === 'connected' ? (
          <button
            onClick={onSerialDisconnect}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9.5px',
              fontWeight: 700,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              padding: '4px 12px',
              borderRadius: '3px',
              border: '1px solid rgba(255, 51, 68, 0.45)',
              background: 'rgba(255, 51, 68, 0.1)',
              color: '#FF3344',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            DISCONNECT {serialPort ? `[${serialPort}]` : ''}
          </button>
        ) : serialState === 'connecting' ? (
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9.5px',
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: '3px',
              border: '1px solid rgba(255, 179, 0, 0.3)',
              background: 'rgba(255, 179, 0, 0.08)',
              color: '#FFB300',
              cursor: 'wait',
            }}
          >
            CONNECTING...
          </span>
        ) : (
          <button
            onClick={onSerialConnect}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9.5px',
              fontWeight: 700,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              padding: '4px 12px',
              borderRadius: '3px',
              border: '1px solid rgba(57, 255, 20, 0.45)',
              background: 'rgba(57, 255, 20, 0.1)',
              color: '#39FF14',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            ⚡ CONNECT HARDWARE
          </button>
        )}

        <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.12)', margin: '0 4px' }} />

        {/* Crypto Pipeline Inspector Trigger */}
        <button
          onClick={onOpenCrypto}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9.5px',
            fontWeight: 700,
            letterSpacing: '0.8px',
            padding: '4px 11px',
            borderRadius: '3px',
            border: '1px solid rgba(0, 229, 255, 0.4)',
            background: 'rgba(0, 229, 255, 0.08)',
            color: '#00E5FF',
            cursor: 'pointer',
            transition: 'all 120ms ease',
          }}
          title="Inspect live AES-256-GCM pipeline & 1-bit tamper test bench"
        >
          🔐 CRYPTO PIPELINE
        </button>

        {/* EW / ML Threat Console Trigger */}
        <button
          onClick={onOpenJamming}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9.5px',
            fontWeight: 700,
            letterSpacing: '0.8px',
            padding: '4px 11px',
            borderRadius: '3px',
            border: '1px solid rgba(167, 139, 250, 0.4)',
            background: 'rgba(167, 139, 250, 0.08)',
            color: '#A78BFA',
            cursor: 'pointer',
            transition: 'all 120ms ease',
          }}
          title="Open live ML RF anomaly gauges & EW attack injection console"
        >
          📡 EW / ML CONSOLE
        </button>

        {/* Spectrum FX Toggle */}
        {onToggleShader && (
          <button
            onClick={onToggleShader}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9.5px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              padding: '4px 11px',
              borderRadius: '3px',
              border: `1px solid ${shaderActive ? 'rgba(57, 255, 20, 0.5)' : 'rgba(255, 255, 255, 0.12)'}`,
              background: shaderActive ? 'rgba(57, 255, 20, 0.12)' : 'transparent',
              color: shaderActive ? '#39FF14' : '#5D6677',
              boxShadow: shaderActive ? '0 0 10px rgba(57, 255, 20, 0.25)' : 'none',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            title="Toggle procedural 3D ShaderGradient ambient spectrum backdrop"
          >
            ∿ SPECTRUM FX {shaderActive ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      {/* Right: Live UTC / IST Clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            fontWeight: 600,
            color: '#9DA7B3',
            letterSpacing: '0.8px',
          }}
        >
          {time}
        </span>
      </div>
    </div>
  );
}
