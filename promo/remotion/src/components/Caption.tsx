import React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import type { Bi, Lang, Orientation } from '../manifest'
import { DISPLAY, FONT, INK, type Surround } from '../theme'

// Light, cinematic lower caption: small accent kicker over a bold line, left-aligned in
// the letterbox (no panel). Ink adapts to the surround. Slides up in, eases out.
export const Caption: React.FC<{
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
  if (!caption && !kicker) return null

  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.6 } })
  const exit = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const opacity = Math.min(enter, exit)
  const y = interpolate(enter, [0, 1], [28, 0])

  return (
    <div
      style={{
        position: 'absolute',
        left: vertical ? 64 : 150,
        right: vertical ? 64 : 150,
        bottom: vertical ? 90 : 60,
        transform: `translateY(${y}px)`,
        opacity,
      }}
    >
      {kicker ? (
        <div style={{ fontFamily: FONT, fontWeight: 700, color: ink.kicker, fontSize: 24, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 10 }}>
          {kicker[lang]}
        </div>
      ) : null}
      {caption ? (
        <div
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            color: ink.fg,
            fontSize: vertical ? 54 : 60,
            lineHeight: 1.06,
            letterSpacing: -0.5,
            textShadow: ink.shadow,
            maxWidth: vertical ? '100%' : 1200,
          }}
        >
          {caption[lang]}
        </div>
      ) : null}
    </div>
  )
}
