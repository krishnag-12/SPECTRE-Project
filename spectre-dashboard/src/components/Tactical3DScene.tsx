// =============================================================================
// S.P.E.C.T.R.E. TCC — 3D Tactical Holographic Battlespace
// Powered by @react-three/fiber & Three.js
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

// Coordinate scaling: 500m tactical radius mapped to 12.0 Three.js units
const WORLD_SCALE = 12.0 / 500.0;
const RING_DISTANCES = [50, 100, 250, 500];

// Node status colors
function getNodeColor(status: string, anomalyScore: number, isSelected: boolean): string {
  if (isSelected) return '#FFFFFF';
  if (status === 'COMPROMISED') return '#FF0000';
  if (anomalyScore > 0.6 || status === 'SUSPICIOUS') return '#FFBF00';
  if (status === 'ZEROIZED') return '#6B6B6B';
  return '#00FFFF'; // Active / Friendly Tactical Cyan
}

// -----------------------------------------------------------------------------
// Component: 3D Tactical Concentric Distance Rings & Ground Grid
// -----------------------------------------------------------------------------
function TacticalGridAndRings() {
  const rings = useMemo(() => {
    return RING_DISTANCES.map((dist) => {
      const radius = dist * WORLD_SCALE;
      const points: THREE.Vector3[] = [];
      const segments = 64;
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      return { dist, radius, geometry };
    });
  }, []);

  return (
    <group>
      {/* 3D Polar/Concentric Range Rings */}
      {rings.map((ring) => (
        <group key={ring.dist}>
          <lineLoop geometry={ring.geometry}>
            <lineBasicMaterial
              color="#39FF14"
              opacity={ring.dist === 500 ? 0.35 : 0.2}
              transparent
              linewidth={1}
            />
          </lineLoop>
        </group>
      ))}

      {/* Axis Crosshairs */}
      <line>
        <bufferGeometry
          attach="geometry"
          onUpdate={(geom) => {
            geom.setFromPoints([
              new THREE.Vector3(-13, 0, 0),
              new THREE.Vector3(13, 0, 0),
            ]);
          }}
        />
        <lineBasicMaterial color="#39FF14" opacity={0.25} transparent />
      </line>
      <line>
        <bufferGeometry
          attach="geometry"
          onUpdate={(geom) => {
            geom.setFromPoints([
              new THREE.Vector3(0, 0, -13),
              new THREE.Vector3(0, 0, 13),
            ]);
          }}
        />
        <lineBasicMaterial color="#39FF14" opacity={0.25} transparent />
      </line>

      {/* Hexagonal Tactical Grid Floor */}
      <gridHelper args={[26, 26, '#39FF14', '#1A3320']} position={[0, -0.02, 0]} />
    </group>
  );
}

// -----------------------------------------------------------------------------
// Component: 3D Rotating Radar Sweep Cone
// -----------------------------------------------------------------------------
function RadarSweepSector() {
  const sweepRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (sweepRef.current) {
      sweepRef.current.rotation.y -= delta * (Math.PI / 2); // 4-second full rotation
    }
  });

  const sectorGeometry = useMemo(() => {
    // 45-degree tactical radar sweep wedge
    const geom = new THREE.RingGeometry(0.1, 12.0, 32, 1, 0, Math.PI / 4);
    geom.rotateX(Math.PI / 2); // Lay flat on XZ plane
    return geom;
  }, []);

  return (
    <group ref={sweepRef} position={[0, 0.01, 0]}>
      <mesh geometry={sectorGeometry}>
        <meshBasicMaterial
          color="#39FF14"
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Leading edge line */}
      <line>
        <bufferGeometry
          attach="geometry"
          onUpdate={(geom) => {
            geom.setFromPoints([
              new THREE.Vector3(0, 0.02, 0),
              new THREE.Vector3(12.0, 0.02, 0),
            ]);
          }}
        />
        <lineBasicMaterial color="#39FF14" opacity={0.7} transparent />
      </line>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Component: Central C2 Base Station (Origin)
// -----------------------------------------------------------------------------
function C2BaseStation() {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.8;
      meshRef.current.position.y = 0.6 + Math.sin(t * 2) * 0.08;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = -t * 1.2;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Glowing C2 Dual Pyramid Core */}
      <mesh ref={meshRef}>
        <octahedronGeometry args={[0.45, 0]} />
        <meshStandardMaterial
          color="#39FF14"
          emissive="#39FF14"
          emissiveIntensity={0.8}
          wireframe
        />
      </mesh>

      {/* Orbiting Halo Ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.6, 0]}>
        <ringGeometry args={[0.65, 0.72, 32]} />
        <meshBasicMaterial color="#39FF14" opacity={0.5} transparent side={THREE.DoubleSide} />
      </mesh>

      {/* Ground Projection Circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.2, 0.8, 32]} />
        <meshBasicMaterial color="#39FF14" opacity={0.3} transparent />
      </mesh>

      <pointLight color="#39FF14" intensity={2} distance={5} position={[0, 1, 0]} />
    </group>
  );
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

  // Map world position: X -> East/West, Y -> signal height, Z -> North/South (inverted)
  const x = node.posX * WORLD_SCALE;
  const z = -node.posY * WORLD_SCALE;
  // Tactical elevation: higher RSSI / lower noise elevates node slightly
  const altitude = 1.0 + Math.max(0, (node.rssi + 110) / 40);

  const color = getNodeColor(node.status, node.anomalyScore, isSelected);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (beaconRef.current) {
      beaconRef.current.rotation.y = t * 1.5;
      beaconRef.current.rotation.x = Math.sin(t * 2) * 0.2;
    }
    if (rippleRef.current) {
      const scale = 1 + ((t * 1.5 + (node.posX % 3)) % 1) * 2;
      const opacity = Math.max(0, 1 - ((t * 1.5 + (node.posX % 3)) % 1));
      rippleRef.current.scale.set(scale, scale, 1);
      (rippleRef.current.material as THREE.MeshBasicMaterial).opacity = opacity * 0.6;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Ground ripple ring under node */}
      <mesh ref={rippleRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.2, 0.35, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>

      {/* Vertical Laser Beacon Beam from ground to floating node */}
      <line>
        <bufferGeometry
          attach="geometry"
          onUpdate={(geom) => {
            geom.setFromPoints([
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(0, altitude, 0),
            ]);
          }}
        />
        <lineBasicMaterial color={color} opacity={hovered || isSelected ? 0.9 : 0.4} transparent />
      </line>

      {/* Floating 3D Geometric Node Core */}
      <mesh
        ref={beaconRef}
        position={[0, altitude, 0]}
        scale={hovered ? [1.35, 1.35, 1.35] : isSelected ? [1.2, 1.2, 1.2] : [1, 1, 1]}
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
        <octahedronGeometry args={[0.35, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 1.0 : hovered ? 0.8 : 0.5}
          wireframe={!isSelected && !hovered}
        />
      </mesh>

      {/* Selected Halo Ring */}
      {isSelected && (
        <mesh position={[0, altitude, 0]} rotation={[Math.PI / 4, 0, 0]}>
          <ringGeometry args={[0.55, 0.62, 32]} />
          <meshBasicMaterial color="#FFFFFF" opacity={0.8} transparent side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Local Beacon Glow Point Light */}
      <pointLight color={color} intensity={hovered ? 1.5 : 0.8} distance={3} position={[0, altitude, 0]} />
    </group>
  );
}

// -----------------------------------------------------------------------------
// Component: Ambient Floating Tactical Particle Dust
// -----------------------------------------------------------------------------
function AmbientTacticalParticles() {
  const count = 180;
  const pointsRef = useRef<THREE.Points>(null);

  const [positions] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = Math.random() * 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 26;
    }
    return [pos];
  }, []);

  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.getElapsedTime() * 0.02;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color="#39FF14"
        transparent
        opacity={0.35}
        sizeAttenuation
      />
    </points>
  );
}

// -----------------------------------------------------------------------------
// Component: Interactive Orbit Camera Rig (Mouse Drag + Zoom)
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
    // Spherical coordinates
    const x = distance * Math.sin(rotationY) * Math.cos(rotationX);
    const y = distance * Math.sin(rotationX);
    const z = distance * Math.cos(rotationY) * Math.cos(rotationX);

    camera.position.set(x, Math.max(1.5, y), z);
    camera.lookAt(0, 0.8, 0);
  });

  return null;
}

// -----------------------------------------------------------------------------
// Main Tactical 3D Scene Export
// -----------------------------------------------------------------------------
export default function Tactical3DScene({ nodes, selectedNodeId, onSelectNode }: Props) {
  // Orbit camera state
  const [rotationX, setRotationX] = useState(0.55); // Vertical angle (~32 degrees above horizon)
  const [rotationY, setRotationY] = useState(0.4);  // Horizontal azimuth
  const [distance, setDistance] = useState(17.0);   // Camera distance
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

    setRotationY((prev) => prev - deltaX * 0.006);
    setRotationX((prev) => Math.max(0.12, Math.min(1.4, prev + deltaY * 0.006)));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setDistance((prev) => Math.max(7.0, Math.min(28.0, prev + e.deltaY * 0.015)));
  }, []);

  const resetView = useCallback(() => {
    setRotationX(0.55);
    setRotationY(0.4);
    setDistance(17.0);
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#070A0E',
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
        camera={{ fov: 45, near: 0.1, far: 100 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.4} color="#1A2D3A" />
        <directionalLight position={[10, 20, 10]} intensity={0.6} color="#B8F4FF" />

        <CameraRig distance={distance} rotationX={rotationX} rotationY={rotationY} />

        <TacticalGridAndRings />
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

      {/* 3D Viewport Controls & HUD Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '12px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          pointerEvents: 'auto',
          zIndex: 10,
        }}
      >
        <button
          onClick={resetView}
          style={{
            background: 'rgba(10, 20, 15, 0.85)',
            border: '1px solid rgba(57, 255, 20, 0.4)',
            color: '#39FF14',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '1px',
            padding: '4px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
            boxShadow: '0 0 10px rgba(57, 255, 20, 0.15)',
            backdropFilter: 'blur(4px)',
          }}
          title="Reset 3D camera to default tactical azimuth"
        >
          ⟲ RESET 3D VIEW
        </button>
      </div>

      {/* Orbit Tip */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          color: 'rgba(57, 255, 20, 0.5)',
          letterSpacing: '1px',
          pointerEvents: 'none',
        }}
      >
        ◈ DRAG TO ORBIT 360° | SCROLL TO ZOOM
      </div>
    </div>
  );
}
