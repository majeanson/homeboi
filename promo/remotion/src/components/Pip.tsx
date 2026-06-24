import React from 'react'
import { OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { type ClipInfo, type Orientation, TRIM_SAFETY_FRAMES } from '../manifest'
import { COLORS as C, FONT as F } from '../theme'

// A small "kid mode" inset window — the same view in the toddler lens — that springs in
// at a corner. Reinforces the dual-audience story without leaving the section.
export const Pip: React.FC<{
  clip: ClipInfo
  scriptId: string
  orientation: Orientation
  label?: string
}> = ({ clip, scriptId, orientation, label }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const vertical = orientation === 'vertical'
  const trimBefore = Math.max(0, Math.round((clip.leadMs / 1000) * fps) - TRIM_SAFETY_FRAMES)

  const w = vertical ? 300 : 360
  const h = vertical ? 300 * (844 / 390) : 360 * (800 / 1280) // mirror the toddler surface aspect

  const enter = spring({ frame, fps, config: { damping: 16, mass: 0.7 }, delay: 8 })
  const scale = interpolate(enter, [0, 1], [0.7, 1])
  const op = enter

  return (
    <div
      style={{
        position: 'absolute',
        right: vertical ? 28 : 60,
        bottom: vertical ? 230 : 150,
        width: w,
        height: h,
        transform: `scale(${scale})`,
        transformOrigin: 'bottom right',
        opacity: op,
        borderRadius: 22,
        overflow: 'hidden',
        background: C.screen,
        boxShadow: '0 24px 60px rgba(0,0,0,0.4), 0 0 0 4px rgba(255,255,255,0.9)',
      }}
    >
      <OffthreadVideo
        src={staticFile(`captures/${scriptId}/${clip.file}`)}
        trimBefore={trimBefore}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
      />
      {label ? (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            background: C.warm,
            color: '#fff',
            fontFamily: F,
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: 0.5,
            padding: '5px 11px',
            borderRadius: 999,
            boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  )
}
