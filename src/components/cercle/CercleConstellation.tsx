import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { useSpeak, stopSpeaking } from '../../lib/speak'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { EmptyState } from '../EmptyState'
import { PanZoom } from '../PanZoom'
import { layoutIslands, type PlacedBridge, type Person, type World, type WorldIsland } from '../../lib/cercle'

// « Notre monde » — the BIG-PICTURE map of the whole circle. Where Liens shows one
// person's ties and Arbre one family's generations, this zooms OUT: each cluster (the
// Maisonnée, your families, your groups) is a soft coloured ISLAND, member faces sit
// inside it, and a gentle BRIDGE arc joins two islands wherever a person ties them
// together. Everything is tappable + read aloud, and « Raconte-moi » narrates the
// whole map island by island then the bridges — a spoken story of "our world" that
// works on a wall, a phone, and for a pre-reader. Hand-rolled SVG on the shared
// PanZoom surface, reusing <Avatar> and the .ego-node look (same primitives as the
// Arbre / Liens), so a big world still pinches / drags / +−'s.
//
// Read-only by design: this is a place to UNDERSTAND the structure, not edit it — a
// tap speaks a name and captions it; the full person card lives in the normal cercle.

// Default island tints by kind (a named group's own colour still wins). Shared with
// Social ▸ Liens, which draws the same islands for the social slice of the circle.
const ISLAND_COLOUR: Record<WorldIsland['kind'], string> = {
  household: '#2A8F85', // the cercle teal — home, at the centre
  family: '#C45E86', // the cercle rose — a family
  group: '#6B8A52', // a warm green — a social group
  others: '#8A8780', // muted — people in no cluster
}
export const islandColour = (isl: WorldIsland): string => isl.colour || ISLAND_COLOUR[isl.kind]

export function CercleConstellation({ world, byKey, toddler = false }: { world: World; byKey: Map<string, Person>; toddler?: boolean }) {
  const t = useT()
  const speak = useSpeak()
  const w = t.cercle.world
  const FACE = toddler ? 56 : 42
  const PAD = toddler ? 20 : 13
  const GAP = toddler ? 88 : 70
  const LABEL_H = toddler ? 40 : 30

  // Stop any narration when the map unmounts (leaving the scene mid-tour).
  useEffect(() => () => stopSpeaking(), [])

  // ----- layout (pure geometry off the world structure — see lib/cercle) -------
  const layout = useMemo(
    () => layoutIslands(world, byKey, { face: FACE, pad: PAD, gap: GAP, labelH: LABEL_H }),
    [world, byKey, FACE, PAD, GAP, LABEL_H],
  )

  // ----- narration lines ------------------------------------------------------
  // Name EVERYONE on the island — people AND pets (#pets-in-story). No cap: dropping
  // the tail used to silently leave out whoever sorted last, often the pets.
  const firstNames = (keys: string[]): string[] =>
    keys.map((k) => byKey.get(k)?.firstName).filter((n): n is string => !!n)
  const islandLine = (isl: WorldIsland): string => {
    const names = firstNames(isl.memberKeys)
    return w.sayIsland(isl.name, names.join(', '))
  }
  const bridgeLine = (b: PlacedBridge): string => {
    const via = byKey.get(b.viaKeys[0])?.firstName ?? ''
    return w.sayBridge(via, b.a.island.name, b.b.island.name)
  }

  // ----- the « Raconte-moi » guided tour --------------------------------------
  type Step = { kind: 'intro' } | { kind: 'island'; id: string } | { kind: 'bridge'; key: string }
  const sequence = useMemo<Step[]>(() => {
    if (!layout) return []
    return [
      { kind: 'intro' },
      ...layout.placed.map((p): Step => ({ kind: 'island', id: p.island.id })),
      ...layout.bridges.map((b): Step => ({ kind: 'bridge', key: b.key })),
    ]
  }, [layout])
  const [tourAt, setTourAt] = useState<number | null>(null)
  const [caption, setCaption] = useState<string | null>(null)
  const touring = tourAt != null
  const active = touring && sequence[tourAt] ? sequence[tourAt] : null
  const activeIslandId = active?.kind === 'island' ? active.id : null
  const activeBridgeKey = active?.kind === 'bridge' ? active.key : null

  const lineForStep = (s: Step): string => {
    if (s.kind === 'intro') return w.tourIntro
    if (s.kind === 'island') {
      const isl = layout?.placed.find((p) => p.island.id === s.id)?.island
      return isl ? islandLine(isl) : ''
    }
    const b = layout?.bridges.find((x) => x.key === s.key)
    return b ? bridgeLine(b) : ''
  }

  // Drive the tour: speak the current step, caption it, and advance to the next only
  // when the VOICE has finished this line (speak's onEnd) — not on a length-guess that
  // cut off the last name. A generous timer is just a fallback so the tour never
  // stalls if TTS is off / interrupted / never fires onend. Cleanup cancels it.
  const lineRef = useRef(lineForStep)
  lineRef.current = lineForStep
  useEffect(() => {
    if (tourAt == null) return
    if (tourAt >= sequence.length) {
      setTourAt(null)
      setCaption(null)
      return
    }
    const line = lineRef.current(sequence[tourAt])
    setCaption(line)
    let advanced = false
    const next = () => {
      if (advanced) return
      advanced = true
      setTourAt((a) => (a == null ? null : a + 1))
    }
    speak(line, undefined, { onEnd: next })
    // Fallback ceiling: long enough to never clip the spoken line, but the tour still
    // moves on if no voice is installed or onend is swallowed after a cancel().
    const dur = Math.min(15000, Math.max(3500, 1400 + line.length * 80))
    const id = setTimeout(next, dur)
    return () => clearTimeout(id)
  }, [tourAt, sequence, speak])

  const startTour = () => {
    stopSpeaking()
    setTourAt(0)
  }
  const stopTour = () => {
    stopSpeaking()
    setTourAt(null)
    setCaption(null)
  }

  // A manual tap stops the tour and speaks/ captions what was tapped.
  const tapSpeak = (line: string) => {
    if (touring) stopTour()
    setCaption(line)
    speak(line)
  }

  if (!layout) return <EmptyState className="cercle-world__empty">{t.cercle.empty}</EmptyState>
  const { placed, bridges, width, height } = layout

  return (
    <div className={'cercle-world' + (toddler ? ' cercle-world--kid' : '') + (touring ? ' is-touring' : '')}>
      <div className="cercle-world__bar">
        <button type="button" className={'btn cercle-world__tour' + (touring ? ' is-on' : '')} onClick={touring ? stopTour : startTour}>
          <Icon name={touring ? 'x-bold' : 'play-bold'} size={toddler ? 22 : 18} />
          {touring ? w.tourStop : w.tourPlay}
        </button>
        <p className="cercle-world__hint mono">{w.hint}</p>
      </div>

      <PanZoom className="cercle-world__zoom" ariaLabel={w.title}>
        <svg className="cercle-tree__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={w.title}>
          {/* Bridges first, behind the islands — a wide invisible stroke is the tap
              target, a thin visible line the connection. */}
          {bridges.map((b) => (
            <g
              key={b.key}
              className={'world-bridge' + (activeBridgeKey === b.key ? ' is-active' : '')}
              role="button"
              tabIndex={0}
              aria-label={bridgeLine(b)}
              onClick={() => tapSpeak(bridgeLine(b))}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), tapSpeak(bridgeLine(b)))}
            >
              <line x1={b.a.cx} y1={b.a.cy} x2={b.b.cx} y2={b.b.cy} className="world-bridge__hit" />
              <line x1={b.a.cx} y1={b.a.cy} x2={b.b.cx} y2={b.b.cy} className="world-bridge__line" />
            </g>
          ))}

          {placed.map((isl) => (
            <g
              key={isl.island.id}
              className={
                'world-island world-island--' + isl.island.kind +
                (activeIslandId === isl.island.id ? ' is-active' : '')
              }
              style={{ '--isl': islandColour(isl.island) } as React.CSSProperties}
            >
              {/* The halo + its tappable name speak the island. */}
              <circle cx={isl.cx} cy={isl.cy} r={isl.outerR} className="world-island__halo" />
              <g
                role="button"
                tabIndex={0}
                aria-label={islandLine(isl.island)}
                onClick={() => tapSpeak(islandLine(isl.island))}
                onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), tapSpeak(islandLine(isl.island)))}
              >
                <text x={isl.cx} y={isl.cy + isl.outerR + (toddler ? 26 : 19)} className="world-island__label" textAnchor="middle">
                  {isl.island.name}
                </text>
                <text x={isl.cx} y={isl.cy + isl.outerR + (toddler ? 26 : 19) + (toddler ? 16 : 13)} className="world-island__count" textAnchor="middle">
                  {w.peopleN(isl.island.memberKeys.length)}
                </text>
              </g>

              {/* Faces — tap to hear the name. */}
              {isl.faces.map(({ p, x, y }) => (
                <g
                  key={p.key}
                  className="ego-node world-face"
                  role="button"
                  tabIndex={0}
                  aria-label={p.firstName}
                  onClick={() => tapSpeak(p.firstName)}
                  onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), tapSpeak(p.firstName))}
                >
                  <foreignObject x={isl.cx + x - FACE / 2} y={isl.cy + y - FACE / 2} width={FACE} height={FACE + 16}>
                    <div className="ego-node__inner">
                      <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={isl.island.colour || p.colour} name={p.firstName} size={FACE} />
                    </div>
                  </foreignObject>
                </g>
              ))}
            </g>
          ))}
        </svg>
      </PanZoom>

      {/* What you last tapped / the tour is saying — a calm caption, read aloud too. */}
      {caption && (
        <div className="cercle-world__caption" role="status" aria-live="polite">
          <Icon name="speaker-high-bold" size={toddler ? 20 : 16} />
          <span>{caption}</span>
        </div>
      )}
    </div>
  )
}
