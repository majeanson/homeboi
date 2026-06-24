import React from 'react'
import { Composition, staticFile } from 'remotion'
import { PromoVideo } from './PromoVideo'
import type { Manifest } from './manifest'
import { beatsForCut, surfaceFor, totalDurationInFrames } from './manifest'
import { CUTS, LANGS, ORIENTATIONS, SCRIPT_IDS } from './scripts'

// One composition per script × orientation × language × cut, e.g.
// `tour-landscape-fr-full` / `tour-vertical-en-short`. Duration + fps are read from the
// captured manifest.json via calculateMetadata, so editing a script (more beats / longer
// holds) + re-capturing is all it takes.
async function loadManifest(scriptId: string): Promise<Manifest> {
  try {
    const res = await fetch(staticFile(`captures/${scriptId}/manifest.json`))
    if (!res.ok) return placeholder(scriptId)
    return (await res.json()) as Manifest
  } catch {
    return placeholder(scriptId)
  }
}

// A clear placeholder so a not-yet-captured script doesn't crash the studio /
// compositions listing — it shows a single title card telling you to capture it.
function placeholder(scriptId: string): Manifest {
  return {
    id: scriptId,
    kind: 'placeholder',
    title: { fr: scriptId, en: scriptId },
    fps: 30,
    music: null,
    cuts: ['full'],
    beats: [
      {
        id: 'missing',
        kind: 'title',
        short: true,
        caption: { fr: 'Pas encore capturé', en: 'Not captured yet' },
        kicker: { fr: 'npm run promo:capture', en: 'npm run promo:capture' },
        hold: 3,
        transition: 'fade',
        punch: null,
        surround: 'dark',
        clips: {},
        pip: null,
      },
    ],
  }
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {SCRIPT_IDS.flatMap((scriptId) =>
        ORIENTATIONS.flatMap((o) =>
          LANGS.flatMap((lang) =>
            CUTS.map((cut) => (
              <Composition
                key={`${scriptId}-${o.name}-${lang}-${cut}`}
                id={`${scriptId}-${o.name}-${lang}-${cut}`}
                component={PromoVideo}
                width={o.width}
                height={o.height}
                fps={30}
                durationInFrames={300}
                defaultProps={{ scriptId, orientation: o.name, lang, cut, manifest: null }}
                calculateMetadata={async ({ props }) => {
                  const manifest = await loadManifest(props.scriptId)
                  const surface = surfaceFor(props.orientation)
                  return {
                    durationInFrames: totalDurationInFrames(beatsForCut(manifest, props.cut), surface, props.lang, manifest.fps),
                    fps: manifest.fps,
                    props: { ...props, manifest },
                  }
                }}
              />
            )),
          ),
        ),
      )}
    </>
  )
}
