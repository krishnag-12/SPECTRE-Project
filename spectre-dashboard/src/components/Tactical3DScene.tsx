// =============================================================================
// S.P.E.C.T.R.E. TCC — 3D Tactical Holographic Battlespace
// Engineered with @react-three/fiber & Three.js
// =============================================================================

import React, { useRef, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
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
}

// Coordinate scaling: 500m tactical operational radius mapped to 10.0 Three.js units
const MAX_TACTICAL_RADIUS = 500.0;
const SCENE_RADIUS = 10.0;
const WORLD_SCALE = SCENE_RADIUS / MAX_TACTICAL_RADIUS;
const RING_DISTANCES = [50, 100, 250, 500];

// Node status color mapping
function getNodeColor(status: string, anomalyScore: number, isSelected: boolean): string {
  if (isSelected) return '#FFFFFF';
  if (status === 'COMPROMISED') return '#FF3344';
  if (anomalyScore > 0.6 || status === 'SUSPICIOUS') return '#FFB300';
  if (status === 'ZEROIZED') return '#5D6677';
  return '#00E5FF'; // Active Friendly Tactical Cyan
}

// -----------------------------------------------------------------------------
// Component: Tactical Polar Radar Floor & Range Rings
// -----------------------------------------------------------------------------
function TacticalPolarFloor() {
  // Pre-calculate concentric distance rings
  const ringGeometries = useMemo(() => {
    return RING_DISTANCES.map((dist) => {
      const radius = dist * WORLD_SCALE;
      const segments = 96;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
      }
      return {
        dist,
        radius,
        geometry: new THREE.BufferGeometry().setFromPoints(points),
        isMaxRange: dist === 500,
      };
    });
  }, []);

  // Pre-calculate radial azimuth spokes (every 45 degrees)
  const spokeGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      points.push(new THREE.Vector3(0, 0, 0));
      points.push(
        new THREE.Vector3(
          Math.cos(angle) * SCENE_RADIUS,
          0,
          Math.sin(angle) * SCENE_RADIUS
        )
      );
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  return (
    <group position={[0, -0.01, 0]}>
      {/* Concentric Polar Range Rings */}
      {ringGeometries.map((ring) => (
        <lineLoop key={ring.dist} geometry={ring.geometry}>
          <lineBasicMaterial
            color={ring.isMaxRange ? '#00E5FF' : '#39FF14'}
            opacity={ring.isMaxRange ? 0.35 : 0.18}
            transparent
            linewidth={1}
          />
        </lineLoop>
      ))}

      {/* Radial Cardinal & Ordinal Spokes */}
      <lineSegments geometry={spokeGeometry}>
        <lineBasicMaterial color="#39FF14" opacity={0.12} transparent />
      </lineSegments>

      {/* Subtle fine concentric ticks on tactical floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <ringGeometry args={[0.2, SCENE_RADIUS + 0.1, 48]} />
        <meshBasicMaterial
          color="#0B131C"
          transparent
          opacity={0.65}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Component: Rotating 3D Tactical Radar Sweep Cone
// -----------------------------------------------------------------------------
function RadarSweepSector() {
  const sweepRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (sweepRef.current) {
      sweepRef.current.rotation.y -= delta * (Math.PI / 2); // 4-second full rotation
    }
  });

  const sectorGeometry = useMemo(() => {
    // 38-degree angular radar sweep sector
    const angle = (38 * Math.PI) / 180;
    const geom = new THREE.RingGeometry(0.1, SCENE_RADIUS, 32, 1, 0, angle);
    geom.rotateX(Math.PI / 2);
    return geom;
  }, []);

  const leadingEdgeLine = useMemo(() => {
    const points = [
      new THREE.Vector3(0, 0.01, 0),
      new THREE.Vector3(SCENE_RADIUS, 0.01, 0),
    ];
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: '#39FF14', opacity: 0.7, transparent: true });
    return new THREE.Line(geom, mat);
  }, []);

  return (
    <group ref={sweepRef} position={[0, 0.005, 0]}>
      {/* Phosphor sweep trail volume */}
      <mesh geometry={sectorGeometry}>
        <meshBasicMaterial
          color="#39FF14"
          transparent
          opacity={0.10}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Leading Edge Beam */}
      <primitive object={leadingEdgeLine} />
    </group>
  );
}

// -----------------------------------------------------------------------------
// Component: Central C2 Command Base Station (Datum Origin)
// -----------------------------------------------------------------------------
function C2BaseStation() {
  const coreRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    if (coreRef.current) {
      coreRef.current.rotation.y += delta * 0.6;
      coreRef.current.position.y = 0.55 + Math.sin(t * 1.8) * 0.04;
    }
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z -= delta * 0.9;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x += delta * 0.7;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Dual Octahedral Core */}
      <mesh ref={coreRef}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial
          color="#00E5FF"
          emissive="#00E5FF"
          emissiveIntensity={0.65}
          wireframe
        />
      </mesh>

      {/* Inner Gimbal Ring */}
      <mesh ref={ring1Ref} position={[0, 0.55, 0]}>
        <torusGeometry args={[0.62, 0.012, 8, 36]} />
        <meshBasicMaterial color="#39FF14" opacity={0.6} transparent />
      </mesh>

      {/* Outer Gimbal Ring */}
      <mesh ref={ring2Ref} position={[0, 0.55, 0]}>
        <torusGeometry args={[0.78, 0.012, 8, 36]} />
        <meshBasicMaterial color="#00E5FF" opacity={0.4} transparent />
      </mesh>

      {/* Ground Projection Datum Ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.25, 0.9, 36]} />
        <meshBasicMaterial color="#00E5FF" opacity={0.18} transparent />
      </mesh>

      {/* Base Point Light */}
      <pointLight color="#00E5FF" intensity={1.8} distance={6} position={[0, 0.9, 0]} />
    </group>
  );
}

// -----------------------------------------------------------------------------
// Helper: Create High-Resolution Text Billboard Sprite
// -----------------------------------------------------------------------------
function createTextSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 64);
    // Subtle background capsule
    ctx.fillStyle = 'rgba(7, 10, 15, 0.82)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(10, 10, 236, 44, 6);
    ctx.fill();
    ctx.stroke();

    // Call sign text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.4, 0.35, 1);
  return sprite;
}

// -----------------------------------------------------------------------------
// Component: Single 3D Holographic Field Node Beacon
// -----------------------------------------------------------------------------
function NodeBeacon3D({
  node,
  isSelected,
  onSelect,
}: {
  node: NodePoint;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const beaconRef = useRef<THREE.Mesh>(null);
  const rippleRef = useRef<THREE.Mesh>(null);
  const reticleRef = useRef<THREE.Group>(null);

  // Scaled coordinates
  const x = node.posX * WORLD_SCALE;
  const z = -node.posY * WORLD_SCALE;
  // Tactical elevation based on signal strength
  const altitude = 0.9 + Math.max(0, (node.rssi + 115) / 50);

  const color = getNodeColor(node.status, node.anomalyScore, isSelected);

  // Callsign Sprite
  const sprite = useMemo(() => {
    return createTextSprite(node.nodeId, color);
  }, [node.nodeId, color]);

  // Altitude line
  const tetherLine = useMemo(() => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, altitude, 0),
    ];
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color,
      opacity: isSelected ? 0.9 : hovered ? 0.7 : 0.35,
      transparent: true,
    });
    return new THREE.Line(geom, mat);
  }, [altitude, color, isSelected, hovered]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    if (beaconRef.current) {
      beaconRef.current.rotation.y += delta * 1.4;
      beaconRef.current.rotation.x = Math.sin(t * 1.5) * 0.15;
    }
    if (rippleRef.current) {
      const cycle = ((t * 1.2 + (node.posX % 2)) % 1);
      const scale = 1 + cycle * 1.8;
      rippleRef.current.scale.set(scale, scale, 1);
      (rippleRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - cycle) * 0.5);
    }
    if (reticleRef.current && isSelected) {
      reticleRef.current.rotation.y += delta * 1.2;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Ground ripple ring under node */}
      <mesh ref={rippleRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.25, 0.42, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>

      {/* Altitude tether laser */}
      <primitive object={tetherLine} />

      {/* Floating 3D Geometric Node Core */}
      <mesh
        ref={beaconRef}
        position={[0, altitude, 0]}
        scale={hovered ? [1.3, 1.3, 1.3] : isSelected ? [1.2, 1.2, 1.2] : [1, 1, 1]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.nodeId);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.9 : hovered ? 0.75 : 0.45}
          wireframe={!isSelected && !hovered}
        />
      </mesh>

      {/* Targeting Reticle Brackets (when selected) */}
      {isSelected && (
        <group ref={reticleRef} position={[0, altitude, 0]}>
          <mesh rotation={[Math.PI / 4, 0, 0]}>
            <torusGeometry args={[0.55, 0.015, 8, 24]} />
            <meshBasicMaterial color="#FFFFFF" opacity={0.85} transparent />
          </mesh>
        </group>
      )}

      {/* Floating Callsign Label */}
      <primitive object={sprite} position={[0, altitude + 0.65, 0]} />

      {/* Local Beacon Point Light */}
      <pointLight
        color={color}
        intensity={hovered || isSelected ? 1.6 : 0.7}
        distance={3.5}
        position={[0, altitude, 0]}
      />
    </group>
  );
}

// -----------------------------------------------------------------------------
// Component: Ambient Floating Tactical Dust Particles
// -----------------------------------------------------------------------------
function AmbientTacticalParticles() {
  const count = 120;
  const pointsRef = useRef<THREE.Points>(null);

  const [positions] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * (SCENE_RADIUS * 2);
      pos[i * 3 + 1] = Math.random() * 4.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * (SCENE_RADIUS * 2);
    }
    return [pos];
  }, []);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.015;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#00E5FF"
        transparent
        opacity={0.3}
        sizeAttenuation
      />
    </points>
  );
}

// -----------------------------------------------------------------------------
// Component: Interactive Orbit Camera Rig
// -----------------------------------------------------------------------------
function CameraRig({
  distance,
  rotationX,
  rotationY,
}: {
  distance: number;
  rotationX: number;
  rotationY: number;
}) {
  useFrame(({ camera }) => {
    // Spherical coordinates with clamped horizon
    const x = distance * Math.sin(rotationY) * Math.cos(rotationX);
    const y = distance * Math.sin(rotationX);
    const z = distance * Math.cos(rotationY) * Math.cos(rotationX);

    camera.position.set(x, Math.max(1.8, y), z);
    camera.lookAt(0, 0.6, 0);
  });

  return null;
}

// -----------------------------------------------------------------------------
// Main Tactical 3D Scene Export
// -----------------------------------------------------------------------------
export default function Tactical3DScene({ nodes, selectedNodeId, onSelectNode }: Props) {
  // Orbit camera parameters
  const [rotationX, setRotationX] = useState(0.52); // ~30 degrees above ground plane
  const [rotationY, setRotationY] = useState(0.45); // Azimuth angle
  const [distance, setDistance] = useState(14.5);   // Framed for tight tactical awareness
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - lastMousePosRef.current.x;
    const deltaY = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    setRotationY((prev) => prev - deltaX * 0.005);
    setRotationX((prev) => Math.max(0.12, Math.min(1.35, prev + deltaY * 0.005)));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setDistance((prev) => Math.max(6.0, Math.min(22.0, prev + e.deltaY * 0.012)));
  }, []);

  const resetView = useCallback(() => {
    setRotationX(0.52);
    setRotationY(0.45);
    setDistance(14.5);
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#05070B',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <Canvas
        camera={{ fov: 42, near: 0.1, far: 80 }}
        dpr={[1, Math.min(window.devicePixelRatio || 1, 2)]}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.45} color="#0E1924" />
        <directionalLight position={[8, 16, 8]} intensity={0.65} color="#D0F0FF" />

        <CameraRig distance={distance} rotationX={rotationX} rotationY={rotationY} />

        <TacticalPolarFloor />
        <RadarSweepSector />
        <C2BaseStation />
        <AmbientTacticalParticles />

        {nodes.map((node) => (
          <NodeBeacon3D
            key={node.nodeId}
            node={node}
            isSelected={node.nodeId === selectedNodeId}
            onSelect={onSelectNode}
          />
        ))}
      </Canvas>

      {/* 3D Viewport Controls HUD */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '12px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <button
          onClick={resetView}
          style={{
            background: 'rgba(11, 15, 23, 0.88)',
            border: '1px solid rgba(0, 229, 255, 0.35)',
            color: '#00E5FF',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '1px',
            padding: '5px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            transition: 'all 120ms ease',
          }}
          title="Reset 3D camera to default tactical perspective"
        >
          ⟲ RESET 3D VIEW
        </button>
      </div>

      {/* Operational Orbit Cue */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          color: 'rgba(0, 229, 255, 0.45)',
          letterSpacing: '1px',
          pointerEvents: 'none',
        }}
      >
        ◈ DRAG TO ORBIT 360° │ SCROLL TO ZOOM
      </div>
    </div>
  );
}
