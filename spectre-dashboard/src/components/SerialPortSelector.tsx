// =============================================================================
// S.P.E.C.T.R.E. TCC — Serial Port Selector (Electron IPC)
// =============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

interface Props {
  onConnectionChange?: (connected: boolean, portPath: string | null) => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  label: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: '#6B6B6B',
  },
  select: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.5px',
    color: '#E0E0E0',
    background: '#1A1A1A',
    border: '1px solid #2A2A2A',
    borderRadius: '3px',
    padding: '3px 8px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '100px',
    maxWidth: '180px',
  },
  btn: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    padding: '3px 10px',
    borderRadius: '3px',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap',
  },
  connectBtn: {
    color: '#39FF14',
    borderColor: 'rgba(57, 255, 20, 0.3)',
    background: 'rgba(57, 255, 20, 0.08)',
  },
  disconnectBtn: {
    color: '#FF0000',
    borderColor: 'rgba(255, 0, 0, 0.3)',
    background: 'rgba(255, 0, 0, 0.08)',
  },
  refreshBtn: {
    color: '#A0A0A0',
    borderColor: '#2A2A2A',
    background: 'transparent',
    padding: '3px 6px',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  statusDotConnected: {
    background: '#39FF14',
    boxShadow: '0 0 6px rgba(57, 255, 20, 0.6)',
  },
  statusDotDisconnected: {
    background: '#FF0000',
    boxShadow: '0 0 4px rgba(255, 0, 0, 0.4)',
  },
  portLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    color: '#39FF14',
    letterSpacing: '0.5px',
  },
};

export default function SerialPortSelector({ onConnectionChange }: Props) {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [connectedPort, setConnectedPort] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Check if Electron serial API is available
  const hasSerialAPI = !!window.spectre?.serial;

  const refreshPorts = useCallback(async () => {
    if (!hasSerialAPI) return;
    try {
      const portList = await window.spectre!.serial!.listPorts();
      setPorts(portList);
      // Auto-select first port if none selected
      if (!selectedPort && portList.length > 0) {
        setSelectedPort(portList[0].path);
      }
    } catch {
      setPorts([]);
    }
  }, [hasSerialAPI, selectedPort]);

  const checkStatus = useCallback(async () => {
    if (!hasSerialAPI) return;
    try {
      const status = await window.spectre!.serial!.getStatus() as any;
      const wasConnected = isConnected;
      setIsConnected(status.connected);
      setConnectedPort(status.portPath);
      if (status.connected !== wasConnected) {
        onConnectionChange?.(status.connected, status.portPath);
      }
    } catch {
      // ignore
    }
  }, [hasSerialAPI, isConnected, onConnectionChange]);

  // Initial port scan + periodic status polling
  useEffect(() => {
    if (!hasSerialAPI) return;
    refreshPorts();
    checkStatus();

    pollRef.current = window.setInterval(() => {
      checkStatus();
    }, 2000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [hasSerialAPI]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    if (!hasSerialAPI || !selectedPort) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.spectre!.serial!.connect(selectedPort);
      if (!result.ok) {
        setError(result.error || 'Connection failed');
      } else {
        setIsConnected(true);
        setConnectedPort(selectedPort);
        onConnectionChange?.(true, selectedPort);
      }
    } catch (e: any) {
      setError(e?.message || 'Connection failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!hasSerialAPI) return;
    setIsLoading(true);
    try {
      await window.spectre!.serial!.disconnect();
      setIsConnected(false);
      setConnectedPort(null);
      onConnectionChange?.(false, null);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  // In browser-only mode (npm run dev), don't render anything
  if (!hasSerialAPI) {
    return null;
  }

  return (
    <div style={styles.container}>
      <span style={styles.label}>PORT</span>

      {isConnected ? (
        <>
          <div style={{ ...styles.statusDot, ...styles.statusDotConnected }} />
          <span style={styles.portLabel}>{connectedPort}</span>
          <button
            style={{ ...styles.btn, ...styles.disconnectBtn }}
            onClick={handleDisconnect}
            disabled={isLoading}
          >
            {isLoading ? '...' : 'DISCONNECT'}
          </button>
        </>
      ) : (
        <>
          <div style={{ ...styles.statusDot, ...styles.statusDotDisconnected }} />
          <select
            style={styles.select}
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={isLoading}
          >
            {ports.length === 0 ? (
              <option value="">No ports found</option>
            ) : (
              ports.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.path}{p.manufacturer ? ` — ${p.manufacturer}` : ''}
                </option>
              ))
            )}
          </select>
          <button
            style={{ ...styles.btn, ...styles.refreshBtn }}
            onClick={refreshPorts}
            disabled={isLoading}
            title="Rescan COM ports"
          >
            ⟳
          </button>
          <button
            style={{ ...styles.btn, ...styles.connectBtn }}
            onClick={handleConnect}
            disabled={isLoading || !selectedPort}
          >
            {isLoading ? '...' : 'CONNECT'}
          </button>
          {error && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#FF4444' }}>
              {error}
            </span>
          )}
        </>
      )}
    </div>
  );
}
