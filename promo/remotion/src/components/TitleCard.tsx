import React from 'react'
import { AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import type { Bi, Lang, Orientation } from '../manifest'
import { COLORS, DISPLAY, FONT, INK, SURROUND, type Surround } from '../theme'

// Full-bleed branded card (dark bookends). Kicker rises, wordmark punches in with a
// slight overshoot, an accent rule wipes out. "Vibrant punch" per the brief.
export const TitleCard: React.FC<{
  caption: Bi | null
  kicker: Bi | null
  lang: Lang
  orientation: Orientation
  surround: Surround
}> = ({ caption, kicker, lang, orientation, surround }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const vertical = orientation === 'vertical'
  const ink = INK[surround]

  const punch = spring({ frame, fps, config: { damping: 11, mass: 0.8, stiffness: 120 } })
  const enter = spring({ frame, fps, config: { damping: 200 } })
  const exit = interpolate(frame, [durationInFrames - 16, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const scale = interpolate(punch, [0, 1], [0.86, 1])
  const ky = interpolate(enter, [0, 1], [20, 0])
  const rule = interpolate(frame, [8, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ background: SURROUND[surround], justifyContent: 'center', alignItems: 'center', opacity: Math.min(enter, exit) }}>
      {/* A soft transition whoosh as the card lands. */}
      <Audio src={staticFile('music/sfx-whoosh.wav')} volume={0.16} />
      {/* subtle vignette for depth */}
      <AbsoluteFill style={{ background: 'radial-gradient(70% 70% at 50% 45%, transparent 55%, rgba(0,0,0,0.35) 100%)' }} />
      <div style={{ textAlign: 'center', padding: '0 8%' }}>
        {kicker ? (
          <div style={{ fontFamily: FONT, fontWeight: 700, color: ink.kicker, fontSize: vertical ? 28 : 30, letterSpacing: 3, textTransform: 'uppercase', transform: `translateY(${ky}px)`, opacity: enter, marginBottom: 22 }}>
            {kicker[lang]}
          </div>
        ) : null}
        {caption ? (
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, color: ink.fg, fontSize: vertical ? 100 : 138, letterSpacing: -1, lineHeight: 1.0, transform: `scale(${scale})` }}>
            {caption[lang]}
          </div>
        ) : null}
        <div style={{ width: 120, height: 5, background: COLORS.accentVivid, borderRadius: 3, margin: '34px auto 0', transform: `scaleX(${rule})`, transformOrigin: 'center' }} />
      </div>
    </AbsoluteFill>
  )
}
