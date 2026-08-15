// =============================================================================
// S.P.E.C.T.R.E. TCC — Zeroize Kill Switch Component
// Two-stage safety: Slide-to-arm → Countdown → Execute
// =============================================================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { CommandPayload } from '../types';

const SLIDE_THRESHOLD = 0.85;    // Must drag 85% of track width to arm
const COUNTDOWN_SECONDS = 3;     // Countdown before execution

const styles: any = {
  container: {
    padding: '12px',
    background: '#1A1A1A',
    borderRadius: '4px',
    border: '1px solid #2A2A2A',
  },
  label: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    color: '#FF0000',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  warning: {
    fontSize: '9px',
    color: '#6B6B6B',
    marginBottom: '12px',
    lineHeight: '1.4',
    fontFamily: "'JetBrains Mono', monospace",
  },
  // ---- Slide Track ----
  slideTrack: {
    position: 'relative',
    height: '44px',
    background: '#0D0D0D',
    borderRadius: '4px',
    border: '1px solid #2A2A2A',
    overflow: 'hidden',
    cursor: 'grab',
    userSelect: 'none',
  },
  slideTrackArmed: {
    border: '1px solid rgba(255, 0, 0, 0.5)',
    boxShadow: '0 0 12px rgba(255, 0, 0, 0.15), inset 0 0 12px rgba(255, 0, 0, 0.05)',
  },
  slideTrackLabel: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    color: 'rgba(255, 0, 0, 0.3)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  slideHandle: {
    position: 'absolute',
    top: '3px',
    left: '3px',
    width: '56px',
    height: '36px',
    background: 'linear-gradient(180deg, #3A0000, #1A0000)',
    border: '1px solid rgba(255, 0, 0, 0.4)',
    borderRadius: '3px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    transition: 'none',
    zIndex: 1,
  },
  slideHandleText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    color: '#FF0000',
    fontWeight: 700,
  },
  slideHandleReleased: {
    transition: 'left 300ms cubic-bezier(0.25, 0.8, 0.25, 1)',
  },
  // ---- Execute Button ----
  executeBtn: {
    width: '100%',
    height: '48px',
    marginTop: '12px',
    background: 'linear-gradient(180deg, #8B0000, #4A0000)',
    border: '2px solid #FF0000',
    borderRadius: '4px',
    color: '#FF0000',
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '3px',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'all 200ms ease',
    boxShadow: '0 0 20px rgba(255, 0, 0, 0.2), inset 0 0 20px rgba(255, 0, 0, 0.1)',
    animation: 'pulse 1.5s ease infinite',
  },
  executeBtnDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
    boxShadow: 'none',
    animation: 'none',
  },
  executeBtnCountdown: {
    background: 'linear-gradient(180deg, #CC0000, #660000)',
    borderColor: '#FF3333',
    color: '#FFFFFF',
  },
  // ---- Abort ----
  abortBtn: {
    width: '100%',
    height: '32px',
    marginTop: '8px',
    background: 'transparent',
    border: '1px solid #3A3A3A',
    borderRadius: '4px',
    color: '#6B6B6B',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'all 120ms ease',
  },
};

interface Props {
  nodeId: string;
  onExecute: (command: CommandPayload) => void;
  disabled: boolean;
}

export default function ZeroizeSwitch({ nodeId, onExecute, disabled }: Props) {
  const [slidePos, setSlidePos] = useState(0);
  const [isArmed, setIsArmed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [isReleasing, setIsReleasing] = useState(false);

  const trackRef = useRef(null);
  const countdownRef = useRef(null);

  // ---- Slide Logic ----
  const handleMouseDown = useCallback((e) => {
    if (disabled || isArmed) return;
    e.preventDefault();
    setIsDragging(true);
    setIsReleasing(false);
  }, [disabled, isArmed]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const maxSlide = rect.width - 62; // handle width + padding
    const rawPos = e.clientX - rect.left - 30; // offset for handle center
    const clampedPos = Math.max(0, Math.min(rawPos, maxSlide));
    const normalizedPos = clampedPos / maxSlide;
    setSlidePos(clampedPos);

    if (normalizedPos >= SLIDE_THRESHOLD) {
      setIsDragging(false);
      setIsArmed(true);
      setSlidePos(maxSlide);
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (!isArmed) {
      setIsReleasing(true);
      setSlidePos(0);
      setTimeout(() => setIsReleasing(false), 300);
    }
  }, [isDragging, isArmed]);

  // Attach global listeners for drag
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // ---- Execute with Countdown ----
  const initiateZeroize = useCallback(() => {
    if (!isArmed || countdown !== null) return;
    setCountdown(COUNTDOWN_SECONDS);
  }, [isArmed, countdown]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      onExecute({ type: 'ZERO', nodeId });
      setCountdown(null);
      setIsArmed(false);
      setSlidePos(0);
      return;
    }

    countdownRef.current = setTimeout(() => {
      setCountdown((c) => c - 1);
    }, 1000);

    return () => clearTimeout(countdownRef.current);
  }, [countdown, nodeId, onExecute]);

  // ---- Abort ----
  const abort = useCallback(() => {
    setCountdown(null);
    setIsArmed(false);
    setSlidePos(0);
  }, []);

  // Reset when node changes
  useEffect(() => {
    setIsArmed(false);
    setCountdown(null);
    setSlidePos(0);
  }, [nodeId]);

  return (
    <div style={styles.container}>
      <div style={styles.label}>
        ◆ CRYPTOGRAPHIC ZEROIZE
      </div>
      <div style={styles.warning}>
        Irreversibly wipe encryption keys and destroy all stored data on the selected terminal.
      </div>

      {/* Slide-to-Arm Track */}
      <div
        ref={trackRef}
        style={{
          ...styles.slideTrack,
          ...(isArmed ? styles.slideTrackArmed : {}),
        }}
        onMouseDown={handleMouseDown}
      >
        <span style={styles.slideTrackLabel}>
          {isArmed ? '◆ ARMED ◆' : '▸▸ SLIDE TO ARM ▸▸'}
        </span>
        <div
          style={{
            ...styles.slideHandle,
            ...(isReleasing ? styles.slideHandleReleased : {}),
            left: `${3 + slidePos}px`,
            background: isArmed
              ? 'linear-gradient(180deg, #8B0000, #4A0000)'
              : 'linear-gradient(180deg, #3A0000, #1A0000)',
          }}
        >
          <span style={styles.slideHandleText}>
            {isArmed ? '◆' : '▸▸'}
          </span>
        </div>
      </div>

      {/* Execute Button */}
      <button
        style={{
          ...styles.executeBtn,
          ...(!isArmed ? styles.executeBtnDisabled : {}),
          ...(countdown !== null ? styles.executeBtnCountdown : {}),
        }}
        onClick={initiateZeroize}
        disabled={!isArmed || disabled}
      >
        {countdown !== null
          ? `EXECUTING IN ${countdown}...`
          : `INITIATE ZEROIZE — ${nodeId || '---'}`
        }
      </button>

      {/* Abort Button */}
      {(isArmed || countdown !== null) && (
        <button style={styles.abortBtn} onClick={abort}>
          ✕ ABORT / DISARM
        </button>
      )}
    </div>
  );
}
