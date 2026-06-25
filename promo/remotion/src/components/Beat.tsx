import React from 'react'
import { AbsoluteFill, Audio, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
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
    const startFrame = (p.start ?? 0.12) * durationInFrames
    // Spring-driven zoom that SNAPS in over ~0.8s then holds — punchier, reel-like,
    // instead of creeping across the whole clip. High damping + low mass = fast but
    // WITHOUT overshoot (the calm tenet forbids bounce/jitter).
    const prog = spring({ frame: frame - startFrame, fps, config: { damping: 200, mass: 0.6, stiffness: 110 }, durationInFrames: Math.round(fps * 0.8) })
    scale = interpolate(prog, [0, 1], [1, p.to ?? 1.5])
    originX = (p.rect.x + p.rect.w / 2) * 100
    originY = (p.rect.y + p.rect.h / 2) * 100
  } else {
    // No punch → a calm Ken-Burns so a held clip still breathes instead of sitting
    // dead-still: a gentle push-in toward the upper content across the (now shorter) clip.
    scale = interpolate(frame, [0, durationInFrames], [1.0, 1.07], { extrapolateRight: 'clamp' })
    originY = 40
  }

  return (
    <AbsoluteFill style={{ background: SURROUND[beat.surround], justifyContent: 'center', alignItems: 'center' }}>
      {/* A soft transition whoosh as this beat cuts in. */}
      <Audio src={staticFile('music/sfx-whoosh.wav')} volume={0.15} />
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
