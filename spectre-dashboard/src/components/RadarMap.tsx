// =============================================================================
// S.P.E.C.T.R.E. TCC — Tactical Radar & 3D Holographic Battlespace
// Multi-Mode Tactical Viewer:
//   1. [ 3D HOLO ] — Interactive 3D Battlespace powered by @react-three/fiber
//   2. [ 2D CRT ] — High-Precision CRT Phosphor Sweep Radar
//   3. [ HYBRID FX ] — 2D CRT with procedural GLSL ShaderGradient ambient backdrop
// =============================================================================

import React, { useRef, useEffect, useCallback, useState } from 'react';
import Tactical3DScene from './Tactical3DScene';
import TacticalShaderBackground from './TacticalShaderBackground';
import type { TrustState } from '../types';

interface NodePoint {
  nodeId: string;
  posX: number;
  posY: number;
  status: string;
  anomalyScore: number;
  rssi: number;
  snr?: number;
  trustState: TrustState;
}

interface Props {
  nodes: NodePoint[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  defaultMode?: '2d' | '3d' | 'hybrid';
}

// ---- Tactical Constants ----
const SWEEP_PERIOD_MS = 4000;         // 4.0s full 360° sweep rotation
const RING_DISTANCES = [50, 100, 250, 500]; // Metric range rings (meters)
const MAX_RANGE = 500;                // Maximum radar display radius (meters)
const SWEEP_TRAIL_DEGREES = 45;       // Fading phosphor sector arc (degrees)

// ---- Palette ----
const RADAR_COLORS = {
  background: '#05070B',
  gridRing: 'rgba(57, 255, 20, 0.18)',
  gridRingOuter: 'rgba(0, 229, 255, 0.35)',
  gridSpoke: 'rgba(57, 255, 20, 0.12)',
  gridLabel: 'rgba(57, 255, 20, 0.65)',
  sweepBeam: 'rgba(57, 255, 20, 0.85)',
  centerDatum: '#00E5FF',
  nodeFriendly: '#00E5FF',
  nodeFriendlyDim: 'rgba(0, 229, 255, 0.2)',
  nodeAnomaly: '#FFB300',
  nodeAnomalyDim: 'rgba(255, 179, 0, 0.2)',
  nodeCompromised: '#FF3344',
  nodeCompromisedDim: 'rgba(255, 51, 68, 0.25)',
  nodeZeroized: '#5D6677',
  nodeSelected: '#FFFFFF',
  cardinalText: 'rgba(57, 255, 20, 0.8)',
};

// Coordinate translation: World meters to Screen canvas pixels
function worldToScreen(posX: number, posY: number, cx: number, cy: number, scale: number) {
  return {
    x: cx + posX * scale,
    y: cy - posY * scale, // Inverted Y-axis
  };
}

// Distinct Tactical Node Glyphs (so markers are distinguishable by status, not color alone)
function drawTacticalGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  status: string,
  color: string,
  size = 6
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  if (status === 'COMPROMISED') {
    // Square with inner cross (threat)
    const s = size * 1.1;
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.beginPath();
    ctx.moveTo(-s, -s);
    ctx.lineTo(s, s);
    ctx.moveTo(s, -s);
    ctx.lineTo(-s, s);
    ctx.stroke();
  } else if (status === 'SUSPICIOUS' || status === 'ANOMALY') {
    // Upright Diamond (anomaly)
    const s = size * 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s, 0);
    ctx.closePath();
    ctx.fill();
  } else if (status === 'ZEROIZED') {
    // Muted circle with slash
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.7, -size * 0.7);
    ctx.lineTo(size * 0.7, size * 0.7);
    ctx.stroke();
  } else {
    // Active Friendly: Solid forward-facing tactical chevron/triangle
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.3);
    ctx.lineTo(-size * 0.9, size * 0.8);
    ctx.lineTo(0, size * 0.4);
    ctx.lineTo(size * 0.9, size * 0.8);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

export default function RadarMap({
  nodes,
  selectedNodeId,
  onSelectNode,
  defaultMode = '3d',
}: Props) {
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'hybrid'>(defaultMode);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef(performance.now());

  // Store latest props in refs for animation loop
  const nodesRef = useRef(nodes);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const viewModeRef = useRef(viewMode);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { selectedNodeIdRef.current = selectedNodeId; }, [selectedNodeId]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  const [tooltip, setTooltip] = useState<{ node: NodePoint; x: number; y: number } | null>(null);

  // ---- 2D CRT / Hybrid Rendering Loop ----
  useEffect(() => {
    if (viewMode === '3d') {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = (timestamp: number) => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Adjust buffer size to match DPR
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;
      const topOffset = 42; // HUD bar height
      const usableHeight = h - topOffset;

      // Usable center
      const cx = w / 2;
      const cy = topOffset + usableHeight / 2;
      const radius = Math.min(w / 2 - 40, usableHeight / 2 - 40);
      const scale = radius / MAX_RANGE;

      const elapsed = timestamp - startTimeRef.current;
      const sweepAngle = ((elapsed % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * Math.PI * 2;

      const currentNodes = nodesRef.current;
      const currentSelectedId = selectedNodeIdRef.current;
      const currentMode = viewModeRef.current;

      // ---- Clear background ----
      if (currentMode === 'hybrid') {
        // Semi-transparent overlay so ShaderGradient shows through cleanly
        ctx.fillStyle = 'rgba(5, 7, 11, 0.50)';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = RADAR_COLORS.background;
        ctx.fillRect(0, 0, w, h);
      }

      // ---- Concentric Distance Rings ----
      ctx.lineWidth = 1;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      RING_DISTANCES.forEach((dist) => {
        const r = dist * scale;
        if (r > radius + 5) return;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = dist === 500 ? RADAR_COLORS.gridRingOuter : RADAR_COLORS.gridRing;
        ctx.stroke();

        // Range Label
        ctx.fillStyle = RADAR_COLORS.gridLabel;
        ctx.fillText(`${dist}m`, cx + r + 4, cy);
      });

      // ---- Crosshair & Diagonal Azimuth Spokes ----
      ctx.strokeStyle = RADAR_COLORS.gridSpoke;
      ctx.lineWidth = 0.75;

      // Cardinal Axes
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      // Ordinal 45° Axes
      for (let i = 1; i < 4; i++) {
        const angle = (Math.PI / 4) * i;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        ctx.lineTo(cx - Math.cos(angle) * radius, cy - Math.sin(angle) * radius);
        ctx.stroke();
      }

      // ---- Cardinal Markers (N, S, E, W) ----
      ctx.fillStyle = RADAR_COLORS.cardinalText;
      ctx.font = 'bold 11px "Orbitron", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N (000°)', cx, cy - radius - 16);
      ctx.fillText('S (180°)', cx, cy + radius + 16);
      ctx.fillText('E (090°)', cx + radius + 30, cy);
      ctx.fillText('W (270°)', cx - radius - 30, cy);

      // ---- Radar Sweep Cone with Phosphor Trail ----
      const trailAngle = (SWEEP_TRAIL_DEGREES * Math.PI) / 180;
      const startAngle = sweepAngle - trailAngle;

      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      sweepGrad.addColorStop(0, 'rgba(57, 255, 20, 0.16)');
      sweepGrad.addColorStop(1, 'rgba(57, 255, 20, 0.01)');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, sweepAngle, false);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      // Sharp Leading Beam
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAngle) * radius, cy + Math.sin(sweepAngle) * radius);
      ctx.strokeStyle = RADAR_COLORS.sweepBeam;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = '#39FF14';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.restore();

      // ---- Center Command Station Datum ----
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = RADAR_COLORS.centerDatum;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ---- Field Nodes ----
      currentNodes.forEach((node) => {
        const { x, y } = worldToScreen(node.posX, node.posY, cx, cy, scale);
        const isSelected = node.nodeId === currentSelectedId;

        let nodeColor = RADAR_COLORS.nodeFriendly;
        let dimColor = RADAR_COLORS.nodeFriendlyDim;
        if (isSelected) {
          nodeColor = RADAR_COLORS.nodeSelected;
          dimColor = 'rgba(255, 255, 255, 0.25)';
        } else if (node.status === 'COMPROMISED') {
          nodeColor = RADAR_COLORS.nodeCompromised;
          dimColor = RADAR_COLORS.nodeCompromisedDim;
        } else if (node.anomalyScore > 0.6 || node.status === 'SUSPICIOUS') {
          nodeColor = RADAR_COLORS.nodeAnomaly;
          dimColor = RADAR_COLORS.nodeAnomalyDim;
        } else if (node.status === 'ZEROIZED') {
          nodeColor = RADAR_COLORS.nodeZeroized;
          dimColor = 'rgba(93, 102, 119, 0.2)';
        }

        // Pulse beacon ring
        const pulseRadius = 8 + 3 * Math.sin(elapsed / 250);
        ctx.beginPath();
        ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = dimColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw distinctive tactical glyph
        drawTacticalGlyph(ctx, x, y, node.status, nodeColor, 6);

        // Callsign Label
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillStyle = nodeColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.nodeId, x + 10, y);

        // Selected Reticle Brackets
        if (isSelected) {
          const s = 14 + Math.sin(elapsed / 300) * 1.5;
          const corner = 4;
          ctx.save();
          ctx.translate(x, y);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;

          [
            [-s, -s, corner, 0, 0, corner],
            [s, -s, -corner, 0, 0, corner],
            [-s, s, corner, 0, 0, -corner],
            [s, s, -corner, 0, 0, -corner],
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

      // ---- Empty State Watermark ----
      if (currentNodes.length === 0) {
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
        ctx.textAlign = 'center';
        ctx.fillText('TACTICAL RADAR ACTIVE // STANDBY FOR BEACON TELEMETRY', cx, cy + radius - 20);
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [viewMode]);

  // ---- Mouse Interaction for 2D Mode ----
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const topOffset = 42;
      const cx = rect.width / 2;
      const cy = topOffset + (rect.height - topOffset) / 2;
      const radius = Math.min(rect.width / 2 - 40, (rect.height - topOffset) / 2 - 40);
      const scale = radius / MAX_RANGE;

      let found: { node: NodePoint; x: number; y: number } | null = null;
      for (const node of nodes) {
        const sp = worldToScreen(node.posX, node.posY, cx, cy, scale);
        const dist = Math.sqrt((mouseX - sp.x) ** 2 + (mouseY - sp.y) ** 2);
        if (dist < 18) {
          found = { node, x: mouseX, y: mouseY };
          break;
        }
      }

      setTooltip(found);
      canvas.style.cursor = found ? 'pointer' : 'crosshair';
    },
    [nodes]
  );

  const handleClick = useCallback(() => {
    if (tooltip?.node) {
      onSelectNode(tooltip.node.nodeId);
    }
  }, [tooltip, onSelectNode]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#05070B',
        overflow: 'hidden',
      }}
    >
      {/* Top HUD Bar: Tactical Mode Switcher & RF Parameters */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '42px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          background: 'rgba(11, 15, 23, 0.90)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(0, 229, 255, 0.16)',
          zIndex: 20,
        }}
      >
        {/* Left: Tactical Mode Toggle Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '9px',
              fontWeight: 700,
              color: '#00E5FF',
              letterSpacing: '1.5px',
              marginRight: '6px',
            }}
          >
            VIEW:
          </span>

          <button
            onClick={() => setViewMode('3d')}
            style={{
              padding: '4px 11px',
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: '1px',
              borderRadius: '3px',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              border: viewMode === '3d' ? '1px solid #00E5FF' : '1px solid rgba(255,255,255,0.1)',
              background: viewMode === '3d' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
              color: viewMode === '3d' ? '#00E5FF' : '#5D6677',
              boxShadow: viewMode === '3d' ? '0 0 10px rgba(0,229,255,0.3)' : 'none',
            }}
            title="3D Holographic Battlespace powered by @react-three/fiber"
          >
            ◬ 3D HOLO
          </button>

          <button
            onClick={() => setViewMode('2d')}
            style={{
              padding: '4px 11px',
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: '1px',
              borderRadius: '3px',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              border: viewMode === '2d' ? '1px solid #39FF14' : '1px solid rgba(255,255,255,0.1)',
              background: viewMode === '2d' ? 'rgba(57, 255, 20, 0.15)' : 'transparent',
              color: viewMode === '2d' ? '#39FF14' : '#5D6677',
              boxShadow: viewMode === '2d' ? '0 0 10px rgba(57,255,20,0.3)' : 'none',
            }}
            title="High-Precision CRT Phosphor Sweep Radar"
          >
            ◵ 2D CRT
          </button>

          <button
            onClick={() => setViewMode('hybrid')}
            style={{
              padding: '4px 11px',
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: '1px',
              borderRadius: '3px',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              border: viewMode === 'hybrid' ? '1px solid #A78BFA' : '1px solid rgba(255,255,255,0.1)',
              background: viewMode === 'hybrid' ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
              color: viewMode === 'hybrid' ? '#A78BFA' : '#5D6677',
              boxShadow: viewMode === 'hybrid' ? '0 0 10px rgba(167,139,250,0.3)' : 'none',
            }}
            title="Hybrid: 2D Radar with animated 3D ShaderGradient spectrum backdrop"
          >
            ∿ HYBRID FX
          </button>
        </div>

        {/* Right: Military Sector Telemetry HUD */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9.5px',
            color: '#5D6677',
          }}
        >
          <span>GRID <strong style={{ color: '#00E5FF' }}>43Q EF 4921 8492</strong></span>
          <span>FREQ <strong style={{ color: '#39FF14' }}>433.050 MHz</strong></span>
          <span>PHY <strong style={{ color: '#EDEDED' }}>SF7/BW250</strong></span>
          <span>RANGE <strong style={{ color: '#EDEDED' }}>500m</strong></span>
        </div>
      </div>

      {/* Render Mode 1: 3D Holographic Battlespace via React-Three-Fiber */}
      {viewMode === '3d' && (
        <div style={{ width: '100%', height: '100%', paddingTop: '42px' }}>
          <Tactical3DScene
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
        </div>
      )}

      {/* Render Mode 2 & 3: 2D CRT and Hybrid Mode */}
      {(viewMode === '2d' || viewMode === 'hybrid') && (
        <>
          {viewMode === 'hybrid' && (
            <TacticalShaderBackground active={true} opacity={0.65} mode="cyber" />
          )}
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              position: 'relative',
              zIndex: 5,
            }}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
            onMouseLeave={() => setTooltip(null)}
          />
        </>
      )}

      {/* Tooltip Overlay */}
      {tooltip && (viewMode === '2d' || viewMode === 'hybrid') && (
        <div
          style={{
            position: 'absolute',
            background: 'rgba(11, 15, 23, 0.95)',
            border: '1px solid rgba(0, 229, 255, 0.4)',
            borderRadius: '4px',
            padding: '8px 12px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            color: '#EDEDED',
            pointerEvents: 'none',
            zIndex: 30,
            minWidth: '180px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.8), 0 0 12px rgba(0,229,255,0.2)',
            left: tooltip.x + 16,
            top: tooltip.y - 10,
          }}
        >
          <div style={{ color: '#00E5FF', fontWeight: 700, fontSize: '11px', marginBottom: '6px' }}>
            {tooltip.node.nodeId}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', marginBottom: '2px' }}>
            <span style={{ color: '#5D6677', textTransform: 'uppercase', fontSize: '9px' }}>Status</span>
            <span style={{
              color: tooltip.node.status === 'ACTIVE' ? '#00E5FF'
                : tooltip.node.status === 'COMPROMISED' ? '#FF3344'
                : tooltip.node.status === 'ZEROIZED' ? '#5D6677'
                : '#FFB300',
              fontWeight: 600,
            }}>
              {tooltip.node.status}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', marginBottom: '2px' }}>
            <span style={{ color: '#5D6677', textTransform: 'uppercase', fontSize: '9px' }}>Position</span>
            <span>({tooltip.node.posX}, {tooltip.node.posY})</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', marginBottom: '2px' }}>
            <span style={{ color: '#5D6677', textTransform: 'uppercase', fontSize: '9px' }}>RSSI / SNR</span>
            <span>{tooltip.node.rssi} dBm / {tooltip.node.snr ?? 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
            <span style={{ color: '#5D6677', textTransform: 'uppercase', fontSize: '9px' }}>Anomaly</span>
            <span style={{ color: tooltip.node.anomalyScore > 0.6 ? '#FFB300' : '#39FF14', fontWeight: 600 }}>
              {tooltip.node.anomalyScore.toFixed(3)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
