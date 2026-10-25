// =============================================================================
// S.P.E.C.T.R.E. TCC — Tactical ShaderGradient Ambient Background
// Powered by shadergradient & Three.js WebGL procedural shaders
// =============================================================================

import React, { memo } from 'react';
import { ShaderGradientCanvas, ShaderGradient } from 'shadergradient';

interface Props {
  active?: boolean;
  opacity?: number;
  mode?: 'stealth' | 'combat' | 'cyber';
}

const PALETTES = {
  stealth: {
    color1: '#02060D', // Deep obsidian void
    color2: '#042817', // Tactical military emerald
    color3: '#002E3D', // Muted phosphor cyan
    speed: 0.10,
    strength: 1.4,
  },
  combat: {
    color1: '#0B0404', // Dark crimson void
    color2: '#2A0808', // Threat warning amber-red
    color3: '#081824', // Combat night sky
    speed: 0.22,
    strength: 1.8,
  },
  cyber: {
    color1: '#020A14', // Deep cyber midnight
    color2: '#003B46', // Electric tactical cyan
    color3: '#0A2618', // Night vision green
    speed: 0.15,
    strength: 1.6,
  },
};

function TacticalShaderBackground({ active = true, opacity = 0.55, mode = 'stealth' }: Props) {
  if (!active) return null;

  const palette = PALETTES[mode] || PALETTES.stealth;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        opacity,
        overflow: 'hidden',
        transition: 'opacity 500ms ease',
      }}
    >
      <ShaderGradientCanvas
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
        pixelDensity={1}
        fov={45}
      >
        <ShaderGradient
          control="props"
          type="waterPlane"
          animate="on"
          uSpeed={palette.speed}
          uStrength={palette.strength}
          uDensity={1.25}
          uFrequency={0.001}
          color1={palette.color1}
          color2={palette.color2}
          color3={palette.color3}
          grain="on"
          brightness={0.8}
          cDistance={3.4}
          lightType="3d"
        />
      </ShaderGradientCanvas>
      {/* Subtle vignette and scanline blending over the shader */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(5, 7, 10, 0.8) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

export default memo(TacticalShaderBackground);
