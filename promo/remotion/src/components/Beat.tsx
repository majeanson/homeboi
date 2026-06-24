import React from 'react'
import { AbsoluteFill, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import type { Lang, ManifestBeat, Orientation, SurfaceName } from '../manifest'
import { TRIM_SAFETY_FRAMES } from '../manifest'
import { COLORS, SURROUND, screenSize } from '../theme'
import { DeviceFrame } from './DeviceFrame'
import { Caption } from './Caption'
import { TitleCard } from './TitleCard'
import { Pip } from './Pip'

// One beat: a branded title card, or live footage framed in a device on a dark/cream
// surround, with optional punch-in, a kid-mode PiP inset, and a light caption.
export const Beat: React.FC<{
  beat: ManifestBeat
  lang: Lang
  orientation: Orientation
  surface: SurfaceName
  scriptId: string
}> = ({ beat, lang, orientation, surface, scriptId }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const clip = beat.clips?.[surface]?.[lang]
  if (beat.kind === 'title' || !clip) {
    return <TitleCard caption={beat.caption} kicker={beat.kicker} lang={lang} orientation={orientation} surround={beat.surround} />
  }

  const src = staticFile(`captures/${scriptId}/${clip.file}`)
  const vertical = orientation === 'vertical'
  const trimBefore = Math.max(0, Math.round((clip.leadMs / 1000) * fps) - TRIM_SAFETY_FRAMES)
  const pipClip = beat.pip?.[surface]?.[lang]

  const p = beat.punch
  let scale = 1
  let originX = 50
  let originY = 50
  if (p) {
    const startFrame = (p.start ?? 0.15) * durationInFrames
    const span = Math.max(1, ((p.end ?? 1) - (p.start ?? 0.15)) * durationInFrames)
    // Spring-driven zoom: a snappier acceleration that settles WITHOUT overshoot
    // (high damping — the calm tenet forbids bounce/jitter), more alive than a flat
    // cubic ease. Holds at full scale once settled.
    const prog = spring({ frame: frame - startFrame, fps, config: { damping: 200, mass: 0.9, stiffness: 95 }, durationInFrames: span })
    scale = interpolate(prog, [0, 1], [1, p.to ?? 1.5])
    originX = (p.rect.x + p.rect.w / 2) * 100
    originY = (p.rect.y + p.rect.h / 2) * 100
  } else {
    // No punch → a slow, calm Ken-Burns so a held clip still breathes instead of
    // sitting dead-still: a barely-there push-in toward the upper content.
    scale = interpolate(frame, [0, durationInFrames], [1.0, 1.05], { extrapolateRight: 'clamp' })
    originY = 40
  }

  return (
    <AbsoluteFill style={{ background: SURROUND[beat.surround], justifyContent: 'center', alignItems: 'center' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(75% 75% at 50% 42%, transparent 60%, rgba(0,0,0,0.22) 100%)' }} />
      <div style={{ transform: vertical ? 'translateY(-44px)' : 'translateY(-30px)' }}>
        <DeviceFrame surface={surface} orientation={orientation}>
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${scale})`, transformOrigin: `${originX}% ${originY}%` }}>
            <OffthreadVideo
              src={src}
              trimBefore={trimBefore}
              muted
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', background: COLORS.screen }}
            />
          </div>
        </DeviceFrame>
      </div>
      {pipClip ? <Pip clip={pipClip} scriptId={scriptId} orientation={orientation} label={lang === 'fr' ? 'Vue enfant' : 'Kid view'} /> : null}
      <Caption caption={beat.caption} kicker={beat.kicker} lang={lang} orientation={orientation} surround={beat.surround} />
    </AbsoluteFill>
  )
}
