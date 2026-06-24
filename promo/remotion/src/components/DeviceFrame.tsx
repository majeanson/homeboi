import React from 'react'
import type { Orientation, SurfaceName } from '../manifest'
import { COLORS, screenSize } from '../theme'

// A thin, premium device bezel. wall → tablet (landscape); phone → handset with a notch.
export const DeviceFrame: React.FC<{
  surface: SurfaceName
  orientation: Orientation
  children: React.ReactNode
}> = ({ surface, orientation, children }) => {
  const { w, h } = screenSize(orientation)
  const bezel = surface === 'wall' ? 16 : 14
  const radius = surface === 'wall' ? 26 : 48

  return (
    <div
      style={{
        position: 'relative',
        padding: bezel,
        background: 'linear-gradient(150deg, #2c2620, #0a0806)',
        borderRadius: radius + bezel,
        boxShadow: '0 60px 130px rgba(0,0,0,0.55), 0 14px 40px rgba(0,0,0,0.4), inset 0 0 0 1.5px rgba(255,255,255,0.05)',
      }}
    >
      <div style={{ width: w, height: h, borderRadius: radius, overflow: 'hidden', position: 'relative', background: COLORS.screen }}>
        {children}
      </div>
      {surface === 'phone' ? (
        <div
          style={{
            position: 'absolute',
            top: bezel + 9,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 112,
            height: 20,
            borderRadius: 12,
            background: '#070605',
          }}
        />
      ) : null}
    </div>
  )
}
