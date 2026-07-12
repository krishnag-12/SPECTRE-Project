// =============================================================================
// S.P.E.C.T.R.E. TCC — HTML5 Canvas Tactical Radar Map
// Military CRT-style radar with sweep animation, phosphor decay, and node plot
// =============================================================================

import React, { useRef, useEffect, useCallback, useState } from 'react';

// ---- Configuration ----
const SWEEP_PERIOD = 4000;        // Full rotation period in ms
const RING_DISTANCES = [50, 100, 250, 500]; // Distance ring markers in meters
const MAX_RANGE = 500;            // Maximum display range in meters
const SWEEP_TRAIL_LENGTH = 45;    // Degrees of sweep trail

// ---- Colors ----
const COLORS = {
  background: '#0A0A0A',
  grid: 'rgba(75, 83, 32, 0.4)',
  gridLabel: 'rgba(75, 83, 32, 0.8)',
  sweepBright: 'rgba(57, 255, 20, 0.6)',
  sweepTrail: 'rgba(57, 255, 20, 0.03)',
  crosshair: '#39FF14',
  crosshairDim: 'rgba(57, 255, 20, 0.3)',
  nodeFriendly: '#00FFFF',
  nodeFriendlyDim: 'rgba(0, 255, 255, 0.15)',
  nodeAnomaly: '#FFBF00',
  nodeAnomalyDim: 'rgba(255, 191, 0, 0.15)',
  nodeCompromised: '#FF0000',
  nodeSelected: '#FFFFFF',
  cardinal: 'rgba(75, 83, 32, 0.7)',
  tooltip: 'rgba(26, 26, 26, 0.95)',
  tooltipBorder: 'rgba(57, 255, 20, 0.4)',
};

const styles = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    background: COLORS.background,
    overflow: 'hidden',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  tooltip: {
    position: 'absolute',
    background: COLORS.tooltip,
    border: `1px solid ${COLORS.tooltipBorder}`,
    borderRadius: '3px',
    padding: '8px 12px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#E0E0E0',
    pointerEvents: 'none',
    zIndex: 10,
    minWidth: '180px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
  },
  tooltipRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '2px',
  },
  tooltipLabel: {
    color: '#6B6B6B',
    textTransform: 'uppercase',
    fontSize: '9px',
    letterSpacing: '1px',
  },
  tooltipNodeId: {
    color: '#00FFFF',
    fontWeight: 600,
    fontSize: '11px',
    marginBottom: '6px',
    letterSpacing: '1px',
  },
};

// ---- Helper: world coords to screen pixel ----
function worldToScreen(posX, posY, cx, cy, scale) {
  return {
    x: cx + posX * scale,
    y: cy - posY * scale, // Y-axis inverted (screen coords)
  };
}

// ---- Helper: draw triangle marker ----
function drawTriangle(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(-size * 0.7, size * 0.6);
  ctx.lineTo(size * 0.7, size * 0.6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export default function RadarMap({ nodes, selectedNodeId, onSelectNode }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animFrameRef = useRef(null);
  const startTimeRef = useRef(performance.now()); // Persistent — never resets

  // Store latest props in refs so the animation loop always reads fresh data
  // without needing to restart the animation
  const nodesRef = useRef(nodes);
  const selectedNodeIdRef = useRef(selectedNodeId);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { selectedNodeIdRef.current = selectedNodeId; }, [selectedNodeId]);

  const [tooltip, setTooltip] = useState(null);

  // ---- Single animation loop — runs once, never restarts ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');

    const render = (timestamp) => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(cx, cy) - 40;
      const scale = radius / MAX_RANGE;

      // Sweep angle — uses persistent startTimeRef so it never resets
      const elapsed = timestamp - startTimeRef.current;
      const sweepAngle = ((elapsed % SWEEP_PERIOD) / SWEEP_PERIOD) * Math.PI * 2;

      // Read latest node data from refs
      const currentNodes = nodesRef.current;
      const currentSelectedId = selectedNodeIdRef.current;

      // ---- Clear ----
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, w, h);

      // ---- Draw Distance Rings ----
      ctx.lineWidth = 1;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';

      RING_DISTANCES.forEach((dist) => {
        const r = dist * scale;
        if (r > radius + 10) return;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.grid;
        ctx.stroke();

        // Distance label
        ctx.fillStyle = COLORS.gridLabel;
        ctx.fillText(`${dist}m`, cx + r + 2, cy - 4);
      });

      // ---- Draw Crosshair Lines ----
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 0.5;

      // Horizontal
      ctx.beginPath();
      ctx.moveTo(cx - radius - 10, cy);
      ctx.lineTo(cx + radius + 10, cy);
      ctx.stroke();

      // Vertical
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius - 10);
      ctx.lineTo(cx, cy + radius + 10);
      ctx.stroke();

      // Diagonal lines
      for (let i = 1; i < 4; i++) {
        const angle = (Math.PI / 4) * i;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * (radius + 10), cy + Math.sin(angle) * (radius + 10));
        ctx.lineTo(cx - Math.cos(angle) * (radius + 10), cy - Math.sin(angle) * (radius + 10));
        ctx.stroke();
      }

      // ---- Cardinal Markers ----
      ctx.fillStyle = COLORS.cardinal;
      ctx.font = '12px "Orbitron", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', cx, cy - radius - 22);
      ctx.fillText('S', cx, cy + radius + 22);
      ctx.fillText('E', cx + radius + 22, cy);
      ctx.fillText('W', cx - radius - 22, cy);

      // ---- Radar Sweep ----
      // Trail gradient using conic gradient
      const sweepGradient = ctx.createConicGradient(
        sweepAngle - Math.PI / 2,
        cx,
        cy
      );

      const trailFraction = SWEEP_TRAIL_LENGTH / 360;
      sweepGradient.addColorStop(0, COLORS.sweepBright);
      sweepGradient.addColorStop(trailFraction, COLORS.sweepTrail);
      sweepGradient.addColorStop(trailFraction + 0.001, 'transparent');
      sweepGradient.addColorStop(1, 'transparent');

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = sweepGradient;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // Sweep line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(sweepAngle - Math.PI / 2) * radius,
        cy + Math.sin(sweepAngle - Math.PI / 2) * radius
      );
      ctx.strokeStyle = COLORS.sweepBright;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ---- Center Command Station ----
      const pulseAlpha = 0.5 + 0.5 * Math.sin(elapsed / 500);

      ctx.strokeStyle = `rgba(57, 255, 20, ${0.3 + pulseAlpha * 0.4})`;
      ctx.lineWidth = 1;

      // Inner crosshair
      const chSize = 8;
      ctx.beginPath();
      ctx.moveTo(cx - chSize, cy); ctx.lineTo(cx - 3, cy);
      ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + chSize, cy);
      ctx.moveTo(cx, cy - chSize); ctx.lineTo(cx, cy - 3);
      ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + chSize);
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.crosshair;
      ctx.fill();

      // ---- Render Nodes ----
      currentNodes.forEach((node) => {
        const screenPos = worldToScreen(node.posX, node.posY, cx, cy, scale);
        const { x, y } = screenPos;

        // Clamp to radar boundary
        const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (distFromCenter > radius + 5) return;

        const isSelected = node.nodeId === currentSelectedId;
        const isAnomaly = node.anomalyScore > 0.7;
        const isCompromised = node.status === 'COMPROMISED';
        const isZeroized = node.status === 'ZEROIZED';

        // Calculate afterglow: brighter when sweep just passed
        const nodeAngle = Math.atan2(y - cy, x - cx) + Math.PI / 2;
        const normalizedNodeAngle = ((nodeAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const normalizedSweepAngle = ((sweepAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        let angleDiff = normalizedSweepAngle - normalizedNodeAngle;
        if (angleDiff < 0) angleDiff += Math.PI * 2;

        const glowFactor = angleDiff < Math.PI / 4
          ? 1.0
          : Math.max(0.25, 1.0 - angleDiff / (Math.PI * 2));

        // Determine color
        let nodeColor, glowColor;
        if (isZeroized) {
          nodeColor = `rgba(100, 100, 100, ${glowFactor * 0.5})`;
          glowColor = 'rgba(100, 100, 100, 0.1)';
        } else if (isCompromised || isAnomaly) {
          const flashIntensity = isCompromised
            ? 0.7 + 0.3 * Math.sin(elapsed / 150)
            : 0.6 + 0.4 * Math.sin(elapsed / 300);
          nodeColor = isCompromised
            ? `rgba(255, 0, 0, ${glowFactor * flashIntensity})`
            : `rgba(255, 191, 0, ${glowFactor * flashIntensity})`;
          glowColor = isCompromised ? COLORS.nodeCompromised : COLORS.nodeAnomalyDim;
        } else {
          nodeColor = `rgba(0, 255, 255, ${glowFactor})`;
          glowColor = COLORS.nodeFriendlyDim;
        }

        // Node glow ring
        if (glowFactor > 0.3) {
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.fillStyle = glowColor;
          ctx.fill();
        }

        // Anomaly pulsing outer ring
        if (isAnomaly && !isZeroized) {
          const ringRadius = 16 + 4 * Math.sin(elapsed / 200);
          ctx.beginPath();
          ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 191, 0, ${0.3 + 0.3 * Math.sin(elapsed / 200)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Draw triangle marker
        const triSize = Math.max(5, 8 - (Math.abs(node.rssi) - 60) * 0.05);
        drawTriangle(ctx, x, y, triSize, nodeColor);

        // Node ID label
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(224, 224, 224, ${Math.max(0.3, glowFactor * 0.8)})`;
        ctx.fillText(node.nodeId, x, y + triSize + 12);

        // Selected targeting reticle
        if (isSelected) {
          const reticleSize = 20 + 2 * Math.sin(elapsed / 400);
          const reticleAngle = elapsed / 2000;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(reticleAngle);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;

          // Corner brackets
          const s = reticleSize;
          const cornerLen = 6;
          [
            [-s, -s, cornerLen, 0, 0, cornerLen],
            [s, -s, -cornerLen, 0, 0, cornerLen],
            [-s, s, cornerLen, 0, 0, -cornerLen],
            [s, s, -cornerLen, 0, 0, -cornerLen],
          ].forEach(([bx, by, dx1, dy1, dx2, dy2]) => {
            ctx.beginPath();
            ctx.moveTo(bx + dx1, by + dy1);
            ctx.lineTo(bx, by);
            ctx.lineTo(bx + dx2, by + dy2);
            ctx.stroke();
          });

          ctx.restore();
        }
      });

      // ---- Outer ring border ----
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(75, 83, 32, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []); // Empty deps — animation runs once, reads data from refs

  // ---- Mouse Interaction ----
  const handleMouseMove = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const radius = Math.min(cx, cy) - 40;
      const scale = radius / MAX_RANGE;

      let found = null;
      for (const node of nodes) {
        const sp = worldToScreen(node.posX, node.posY, cx, cy, scale);
        const dist = Math.sqrt((mouseX - sp.x) ** 2 + (mouseY - sp.y) ** 2);
        if (dist < 20) {
          found = { node, x: e.clientX - rect.left, y: e.clientY - rect.top };
          break;
        }
      }

      setTooltip(found);
      canvas.style.cursor = found ? 'pointer' : 'crosshair';
    },
    [nodes]
  );

  const handleClick = useCallback(
    (e) => {
      if (tooltip?.node) {
        onSelectNode(tooltip.node.nodeId);
      }
    },
    [tooltip, onSelectNode]
  );

  return (
    <div ref={containerRef} style={styles.container}>
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={() => setTooltip(null)}
      />

      {/* Tooltip overlay */}
      {tooltip && (
        <div
          style={{
            ...styles.tooltip,
            left: tooltip.x + 16,
            top: tooltip.y - 10,
          }}
        >
          <div style={styles.tooltipNodeId}>{tooltip.node.nodeId}</div>
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Status</span>
            <span style={{
              color: tooltip.node.status === 'ACTIVE' ? '#00FFFF'
                : tooltip.node.status === 'COMPROMISED' ? '#FF0000'
                : '#6B6B6B'
            }}>
              {tooltip.node.status}
            </span>
          </div>
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Position</span>
            <span>({tooltip.node.posX}, {tooltip.node.posY})</span>
          </div>
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>RSSI</span>
            <span>{tooltip.node.rssi} dBm</span>
          </div>
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Anomaly</span>
            <span style={{ color: tooltip.node.anomalyScore > 0.7 ? '#FFBF00' : '#A0A0A0' }}>
              {tooltip.node.anomalyScore}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
