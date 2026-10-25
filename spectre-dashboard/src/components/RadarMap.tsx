// =============================================================================
// S.P.E.C.T.R.E. TCC — Tactical Radar & 3D Holographic Battlespace
// Multi-Mode Tactical Viewer:
//   1. [ 2D CRT ] — Authentic Phosphor Sweep Radar
//   2. [ 3D HOLO ] — Interactive 3D Battlespace powered by @react-three/fiber
//   3. [ HYBRID ] — 2D CRT with procedural GLSL ShaderGradient ambient backdrop
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

// ---- Configuration ----
const SWEEP_PERIOD = 4000;        // Full rotation period in ms
const RING_DISTANCES = [50, 100, 250, 500]; // Distance ring markers in meters
const MAX_RANGE = 500;            // Maximum display range in meters
const SWEEP_TRAIL_LENGTH = 45;    // Degrees of sweep trail

// ---- Colors ----
const COLORS = {
  background: '#070A0E',
  grid: 'rgba(57, 255, 20, 0.25)',
  gridLabel: 'rgba(57, 255, 20, 0.75)',
  sweepBright: 'rgba(57, 255, 20, 0.7)',
  sweepTrail: 'rgba(57, 255, 20, 0.04)',
  crosshair: '#39FF14',
  crosshairDim: 'rgba(57, 255, 20, 0.3)',
  nodeFriendly: '#00FFFF',
  nodeFriendlyDim: 'rgba(0, 255, 255, 0.18)',
  nodeAnomaly: '#FFBF00',
  nodeAnomalyDim: 'rgba(255, 191, 0, 0.18)',
  nodeCompromised: '#FF0000',
  nodeSelected: '#FFFFFF',
  cardinal: 'rgba(57, 255, 20, 0.8)',
  tooltip: 'rgba(12, 16, 22, 0.95)',
  tooltipBorder: 'rgba(0, 255, 255, 0.4)',
};

// ---- Helper: world coords to screen pixel ----
function worldToScreen(posX: number, posY: number, cx: number, cy: number, scale: number) {
  return {
    x: cx + posX * scale,
    y: cy - posY * scale, // Y-axis inverted (screen coords)
  };
}

// ---- Helper: draw triangle marker ----
function drawTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
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

  // Store latest props in refs so the animation loop always reads fresh data
  const nodesRef = useRef(nodes);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const viewModeRef = useRef(viewMode);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { selectedNodeIdRef.current = selectedNodeId; }, [selectedNodeId]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  const [tooltip, setTooltip] = useState<{ node: NodePoint; x: number; y: number } | null>(null);

  // ---- Single animation loop for 2D / Hybrid canvas ----
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

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(cx, cy) - 40;
      const scale = radius / MAX_RANGE;

      const elapsed = timestamp - startTimeRef.current;
      const sweepAngle = ((elapsed % SWEEP_PERIOD) / SWEEP_PERIOD) * Math.PI * 2;

      const currentNodes = nodesRef.current;
      const currentSelectedId = selectedNodeIdRef.current;
      const currentMode = viewModeRef.current;

      // ---- Clear canvas ----
      if (currentMode === 'hybrid') {
        // Semi-transparent wash so shader gradient is visible underneath
        ctx.fillStyle = 'rgba(7, 10, 15, 0.45)';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(0, 0, w, h);
      }

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

        // Distance label with subtle glow
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

      // Diagonals
      for (let i = 1; i < 4; i++) {
        const angle = (Math.PI / 4) * i;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * (radius + 10), cy + Math.sin(angle) * (radius + 10));
        ctx.lineTo(cx - Math.cos(angle) * (radius + 10), cy - Math.sin(angle) * (radius + 10));
        ctx.stroke();
      }

      // ---- Cardinal Markers ----
      ctx.fillStyle = COLORS.cardinal;
      ctx.font = '11px "Orbitron", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N (000°)', cx, cy - radius - 20);
      ctx.fillText('S (180°)', cx, cy + radius + 20);
      ctx.fillText('E (090°)', cx + radius + 28, cy);
      ctx.fillText('W (270°)', cx - radius - 28, cy);

      // ---- Radar Sweep Beam & Phosphor Decay Trail ----
      const trailAngle = (SWEEP_TRAIL_LENGTH * Math.PI) / 180;
      const startAngle = sweepAngle - trailAngle;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, 'rgba(57, 255, 20, 0.15)');
      gradient.addColorStop(1, 'rgba(57, 255, 20, 0.01)');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, sweepAngle, false);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Leading sweep line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAngle) * radius, cy + Math.sin(sweepAngle) * radius);
      ctx.strokeStyle = COLORS.sweepBright;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#39FF14';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();

      // ---- Center Command Post Marker ----
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.crosshair;
      ctx.fill();
      ctx.strokeStyle = COLORS.crosshairDim;
      ctx.lineWidth = 1;
      ctx.stroke();

      // ---- Draw Field Nodes ----
      currentNodes.forEach((node) => {
        const { x, y } = worldToScreen(node.posX, node.posY, cx, cy, scale);
        const isSelected = node.nodeId === currentSelectedId;

        let nodeColor = COLORS.nodeFriendly;
        let dimColor = COLORS.nodeFriendlyDim;
        if (isSelected) {
          nodeColor = COLORS.nodeSelected;
          dimColor = 'rgba(255, 255, 255, 0.2)';
        } else if (node.status === 'COMPROMISED') {
          nodeColor = COLORS.nodeCompromised;
          dimColor = 'rgba(255, 0, 0, 0.2)';
        } else if (node.anomalyScore > 0.6) {
          nodeColor = COLORS.nodeAnomaly;
          dimColor = COLORS.nodeAnomalyDim;
        }

        // Pulse ring around node
        const pulseR = 8 + 4 * Math.sin(elapsed / 300);
        ctx.beginPath();
        ctx.arc(x, y, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = dimColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Node glyph
        drawTriangle(ctx, x, y, 7, nodeColor);

        // Callsign label
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = nodeColor;
        ctx.textAlign = 'left';
        ctx.fillText(node.nodeId, x + 10, y + 3);

        // Selected targeting reticle
        if (isSelected) {
          const reticleSize = 18 + 2 * Math.sin(elapsed / 400);
          const reticleAngle = elapsed / 2000;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(reticleAngle);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;

          const s = reticleSize;
          const cornerLen = 5;
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

      // Outer ring border
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(57, 255, 20, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

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

      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const radius = Math.min(cx, cy) - 40;
      const scale = radius / MAX_RANGE;

      let found: { node: NodePoint; x: number; y: number } | null = null;
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
        background: '#070A0E',
        overflow: 'hidden',
      }}
    >
      {/* Top HUD Bar: Tactical Mode Switcher & RF Telemetry */}
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
          background: 'rgba(9, 12, 17, 0.85)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(0, 255, 255, 0.15)',
          zIndex: 20,
        }}
      >
        {/* Left: View Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '9px',
              fontWeight: 700,
              color: '#39FF14',
              letterSpacing: '1.5px',
              marginRight: '6px',
            }}
          >
            TACTICAL VIEW:
          </span>

          <button
            onClick={() => setViewMode('3d')}
            style={{
              padding: '3px 10px',
              fontSize: '9px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: '1px',
              borderRadius: '3px',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              border: viewMode === '3d' ? '1px solid #00FFFF' : '1px solid rgba(255,255,255,0.1)',
              background: viewMode === '3d' ? 'rgba(0, 255, 255, 0.15)' : 'transparent',
              color: viewMode === '3d' ? '#00FFFF' : '#6B6B6B',
              boxShadow: viewMode === '3d' ? '0 0 10px rgba(0,255,255,0.3)' : 'none',
            }}
            title="3D Holographic Battlespace powered by @react-three/fiber"
          >
            ◬ 3D HOLO
          </button>

          <button
            onClick={() => setViewMode('2d')}
            style={{
              padding: '3px 10px',
              fontSize: '9px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: '1px',
              borderRadius: '3px',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              border: viewMode === '2d' ? '1px solid #39FF14' : '1px solid rgba(255,255,255,0.1)',
              background: viewMode === '2d' ? 'rgba(57, 255, 20, 0.15)' : 'transparent',
              color: viewMode === '2d' ? '#39FF14' : '#6B6B6B',
              boxShadow: viewMode === '2d' ? '0 0 10px rgba(57,255,20,0.3)' : 'none',
            }}
            title="Classic CRT Phosphor Sweep Radar"
          >
            ◵ 2D CRT
          </button>

          <button
            onClick={() => setViewMode('hybrid')}
            style={{
              padding: '3px 10px',
              fontSize: '9px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: '1px',
              borderRadius: '3px',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              border: viewMode === 'hybrid' ? '1px solid #A78BFA' : '1px solid rgba(255,255,255,0.1)',
              background: viewMode === 'hybrid' ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
              color: viewMode === 'hybrid' ? '#A78BFA' : '#6B6B6B',
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
            fontSize: '9px',
            color: '#6B6B6B',
          }}
        >
          <span>GRID <strong style={{ color: '#00FFFF' }}>43Q EF 4921 8492</strong></span>
          <span>FREQ <strong style={{ color: '#39FF14' }}>433.050 MHz</strong></span>
          <span>PHY <strong style={{ color: '#E0E0E0' }}>SF7/BW250</strong></span>
          <span>RANGE <strong style={{ color: '#E0E0E0' }}>500m</strong></span>
        </div>
      </div>

      {/* Cyber Corner HUD Notches */}
      <div style={{ position: 'absolute', top: '48px', left: '8px', color: 'rgba(0,255,255,0.4)', fontFamily: 'monospace', fontSize: '12px', pointerEvents: 'none' }}>┌</div>
      <div style={{ position: 'absolute', top: '48px', right: '8px', color: 'rgba(0,255,255,0.4)', fontFamily: 'monospace', fontSize: '12px', pointerEvents: 'none' }}>┐</div>
      <div style={{ position: 'absolute', bottom: '8px', left: '8px', color: 'rgba(0,255,255,0.4)', fontFamily: 'monospace', fontSize: '12px', pointerEvents: 'none' }}>└</div>
      <div style={{ position: 'absolute', bottom: '8px', right: '8px', color: 'rgba(0,255,255,0.4)', fontFamily: 'monospace', fontSize: '12px', pointerEvents: 'none' }}>┘</div>

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

      {/* Render Mode 2 & 3: 2D Canvas and Hybrid Mode with ShaderGradient backdrop */}
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

      {/* Tooltip overlay in 2D / Hybrid modes */}
      {tooltip && (viewMode === '2d' || viewMode === 'hybrid') && (
        <div
          style={{
            position: 'absolute',
            background: COLORS.tooltip,
            border: `1px solid ${COLORS.tooltipBorder}`,
            borderRadius: '4px',
            padding: '8px 12px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            color: '#E0E0E0',
            pointerEvents: 'none',
            zIndex: 30,
            minWidth: '180px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.8), 0 0 12px rgba(0,255,255,0.2)',
            left: tooltip.x + 16,
            top: tooltip.y - 10,
          }}
        >
          <div style={{ color: '#00FFFF', fontWeight: 700, fontSize: '11px', marginBottom: '6px', letterSpacing: '1px' }}>
            {tooltip.node.nodeId}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '2px' }}>
            <span style={{ color: '#6B6B6B', textTransform: 'uppercase', fontSize: '9px' }}>Status</span>
            <span style={{
              color: tooltip.node.status === 'ACTIVE' ? '#00FFFF'
                : tooltip.node.status === 'COMPROMISED' ? '#FF0000'
                : '#6B6B6B',
              fontWeight: 600,
            }}>
              {tooltip.node.status}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '2px' }}>
            <span style={{ color: '#6B6B6B', textTransform: 'uppercase', fontSize: '9px' }}>Position</span>
            <span>({tooltip.node.posX}, {tooltip.node.posY})</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '2px' }}>
            <span style={{ color: '#6B6B6B', textTransform: 'uppercase', fontSize: '9px' }}>RSSI / SNR</span>
            <span>{tooltip.node.rssi} dBm / {tooltip.node.snr ?? 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ color: '#6B6B6B', textTransform: 'uppercase', fontSize: '9px' }}>Anomaly</span>
            <span style={{ color: tooltip.node.anomalyScore > 0.6 ? '#FFBF00' : '#39FF14', fontWeight: 600 }}>
              {tooltip.node.anomalyScore}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
