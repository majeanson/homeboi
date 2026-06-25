import React from 'react'
import { Audio, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { type ClipInfo, type Orientation, TRIM_SAFETY_FRAMES } from '../manifest'
import { COLORS as C, FONT as F } from '../theme'

// The "kid mode" inset — the SAME moment in the toddler lens — framed as a small DEVICE
// (the child's own screen) tucked in a corner. Reading it as a little phone/tablet beside
// the parent's big surface tells the dual-audience story at a glance. Springs in, then
// breathes with a tiny float. Sized ~2× the first pass so it's clearly legible.
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

  // Screen box mirrors the toddler surface aspect (wall 1.6, phone ≈ 0.462).
  const sw = vertical ? 560 : 700
  const sh = vertical ? sw * (844 / 390) : sw * (800 / 1280)
  const bezel = vertical ? 15 : 13
  const radius = vertical ? 40 : 22

  // Spring in from the corner with a hint of overshoot, then a slow breathing float.
  const enter = spring({ frame, fps, config: { damping: 15, mass: 0.7 }, delay: 6 })
  const scale = interpolate(enter, [0, 1], [0.72, 1])
  const bob = Math.sin((frame / fps) * 1.5) * 4

  return (
    <div
      style={{
        position: 'absolute',
        right: vertical ? 32 : 70,
        bottom: vertical ? 215 : 132,
        transform: `translateY(${bob}px) scale(${scale})`,
        transformOrigin: 'bottom right',
        opacity: enter,
      }}
    >
      {/* A gentle pop the moment the kid-view springs in (delayed to match the spring). */}
      <Sequence from={6} name="pip-pop">
        <Audio src={staticFile('music/sfx-pop.wav')} volume={0.22} />
      </Sequence>
      {/* The device bezel — matches the main DeviceFrame's premium dark shell, scaled down. */}
      <div
        style={{
          position: 'relative',
          padding: bezel,
          background: 'linear-gradient(150deg, #2c2620, #0a0806)',
          borderRadius: radius + bezel,
          boxShadow: '0 34px 80px rgba(0,0,0,0.5), 0 10px 26px rgba(0,0,0,0.4), inset 0 0 0 1.5px rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ width: sw, height: sh, borderRadius: radius, overflow: 'hidden', position: 'relative', background: C.screen }}>
          <OffthreadVideo
            src={staticFile(`captures/${scriptId}/${clip.file}`)}
            trimBefore={trimBefore}
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
          />
          {/* A handset notch sells the "phone" read in the vertical (kid-phone) inset. */}
          {vertical ? (
            <div
              style={{ position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)', width: 86, height: 16, borderRadius: 10, background: '#070605' }}
            />
          ) : null}
        </div>
      </div>
      {/* Floating "Vue enfant" tag, lifted onto the bezel's top edge so it never covers the view. */}
      {label ? (
        <div
          style={{
            position: 'absolute',
            top: -20,
            left: vertical ? 8 : 14,
            background: C.warm,
            color: '#fff',
            fontFamily: F,
            fontWeight: 800,
            fontSize: 25,
            letterSpacing: 0.4,
            padding: '8px 17px',
            borderRadius: 999,
            boxShadow: '0 10px 22px rgba(0,0,0,0.34)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* a tiny child glyph reinforces the label */}
          <span style={{ fontSize: 22 }} aria-hidden>
            🧒
          </span>
          {label}
        </div>
      ) : null}
    </div>
  )
}
