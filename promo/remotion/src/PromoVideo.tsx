import React from 'react'
import { AbsoluteFill, Audio, staticFile, useVideoConfig } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import type { Cut, Lang, Manifest, Orientation } from './manifest'
import { TRANSITION_FRAMES, beatDurationFrames, beatsForCut, surfaceFor } from './manifest'
import { SURROUND } from './theme'
import { Beat } from './components/Beat'

export interface PromoVideoProps {
  scriptId: string
  orientation: Orientation
  lang: Lang
  cut: Cut
  manifest?: Manifest | null
}

export const PromoVideo: React.FC<PromoVideoProps> = ({ scriptId, orientation, lang, cut, manifest }) => {
  const { fps } = useVideoConfig()
  const surface = surfaceFor(orientation)

  if (!manifest) return <AbsoluteFill style={{ background: SURROUND.dark }} />
  const beats = beatsForCut(manifest, cut)

  return (
    <AbsoluteFill style={{ background: SURROUND.dark }}>
      <TransitionSeries>
        {beats.flatMap((beat, i) => {
          const dur = beatDurationFrames(beat, surface, lang, fps)
          const seq = (
            <TransitionSeries.Sequence key={beat.id} durationInFrames={dur}>
              <Beat beat={beat} lang={lang} orientation={orientation} surface={surface} scriptId={scriptId} />
            </TransitionSeries.Sequence>
          )
          if (i === 0) return [seq]
          const presentation = beat.transition === 'slide' ? slide() : fade()
          const trans = (
            <TransitionSeries.Transition
              key={`t-${beat.id}`}
              presentation={presentation}
              timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
            />
          )
          return [trans, seq]
        })}
      </TransitionSeries>

      {manifest.music ? <Audio src={staticFile(`music/${manifest.music}`)} volume={0.22} /> : null}
    </AbsoluteFill>
  )
}
