// =============================================================================
// S.P.E.C.T.R.E. TCC — Custom Frameless Titlebar
// =============================================================================

import React, { useState, useEffect } from 'react';

const styles = {
  titleBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '38px',
    minHeight: '38px',
    background: 'linear-gradient(180deg, #1A1A1A 0%, #121212 100%)',
    borderBottom: '1px solid #2A2A2A',
    WebkitAppRegion: 'drag',
    padding: '0 12px',
    zIndex: 1000,
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoIcon: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#39FF14',
    boxShadow: '0 0 6px rgba(57, 255, 20, 0.6), 0 0 12px rgba(57, 255, 20, 0.3)',
  },
  logoIconDisconnected: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#FF0000',
    boxShadow: '0 0 6px rgba(255, 0, 0, 0.6)',
    animation: 'pulse 1.5s ease infinite',
  },
  title: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '3px',
    color: '#E0E0E0',
    textTransform: 'uppercase',
  },
  titleAccent: {
    color: '#39FF14',
  },
  centerSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  statusTag: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '1.5px',
    padding: '2px 10px',
    borderRadius: '2px',
    textTransform: 'uppercase',
  },
  statusConnected: {
    background: 'rgba(57, 255, 20, 0.1)',
    color: '#39FF14',
    border: '1px solid rgba(57, 255, 20, 0.3)',
  },
  statusDisconnected: {
    background: 'rgba(255, 0, 0, 0.1)',
    color: '#FF0000',
    border: '1px solid rgba(255, 0, 0, 0.3)',
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  clock: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: 400,
    color: '#A0A0A0',
    letterSpacing: '1px',
    marginRight: '12px',
  },
  windowBtn: {
    WebkitAppRegion: 'no-drag',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    transition: 'transform 120ms ease, opacity 120ms ease',
    opacity: 0.7,
  },
  windowBtnHover: {
    opacity: 1,
    transform: 'scale(1.15)',
  },
  minimizeBtn: { background: '#FFBF00' },
  maximizeBtn: { background: '#39FF14' },
  closeBtn: { background: '#FF0000' },
};

export default function TitleBar({ connected }) {
  const [time, setTime] = useState('');
  const [hoveredBtn, setHoveredBtn] = useState(null);

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

  const handleWindowAction = (action) => {
    if (window.spectre?.window) {
      window.spectre.window[action]();
    }
  };

  return (
    <div style={styles.titleBar}>
      <div style={styles.leftSection}>
        <div style={styles.logo}>
          <div style={connected ? styles.logoIcon : styles.logoIconDisconnected} />
          <span style={styles.title}>
            <span style={styles.titleAccent}>S.P.E.C.T.R.E.</span> Tactical Command Center
          </span>
        </div>
      </div>

      <div style={styles.centerSection}>
        <span
          style={{
            ...styles.statusTag,
            ...(connected ? styles.statusConnected : styles.statusDisconnected),
          }}
        >
          {connected ? '● LINK ACTIVE' : '○ NO LINK'}
        </span>
      </div>

      <div style={styles.rightSection}>
        <span style={styles.clock}>{time}</span>
        {['minimize', 'maximize', 'close'].map((action) => {
          const btnStyles = {
            minimize: styles.minimizeBtn,
            maximize: styles.maximizeBtn,
            close: styles.closeBtn,
          };
          return (
            <button
              key={action}
              id={`titlebar-btn-${action}`}
              style={{
                ...styles.windowBtn,
                ...btnStyles[action],
                ...(hoveredBtn === action ? styles.windowBtnHover : {}),
              }}
              onClick={() => handleWindowAction(action)}
              onMouseEnter={() => setHoveredBtn(action)}
              onMouseLeave={() => setHoveredBtn(null)}
              title={action.charAt(0).toUpperCase() + action.slice(1)}
            />
          );
        })}
      </div>
    </div>
  );
}
