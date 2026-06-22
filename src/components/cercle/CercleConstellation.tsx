import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { useSpeak, stopSpeaking } from '../../lib/speak'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { EmptyState } from '../EmptyState'
import { PanZoom } from '../PanZoom'
import { type Person, type World, type WorldIsland } from '../../lib/cercle'

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

// Default island tints by kind (a named group's own colour still wins).
const ISLAND_COLOUR: Record<WorldIsland['kind'], string> = {
  household: '#2A8F85', // the cercle teal — home, at the centre
  family: '#C45E86', // the cercle rose — a family
  group: '#6B8A52', // a warm green — a social group
  others: '#8A8780', // muted — people in no cluster
}

interface Placed {
  island: WorldIsland
  cx: number
  cy: number
  outerR: number
  colour: string
  faces: { p: Person; x: number; y: number }[]
}
interface PlacedBridge {
  a: Placed
  b: Placed
  viaKeys: string[]
  key: string
}

// Even ring of `n` offsets at radius `r`, starting from `start` (default top).
function ringOffsets(n: number, r: number, start = -Math.PI / 2): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = start + (2 * Math.PI * i) / n
    out.push({ x: r * Math.cos(a), y: r * Math.sin(a) })
  }
  return out
}

// Face offsets inside an island + the ring radius they sit on. One ring up to 8, then
// an outer + inner ring so a big family doesn't blow the island up.
function faceLayout(n: number, face: number): { offsets: { x: number; y: number }[]; r: number } {
  if (n <= 1) return { offsets: [{ x: 0, y: 0 }], r: face * 0.62 }
  if (n <= 8) {
    const r = Math.max(face * 0.95, (face * 0.62) / Math.sin(Math.PI / n))
    return { offsets: ringOffsets(n, r), r }
  }
  const outerN = Math.ceil(n * 0.6)
  const innerN = n - outerN
  const outerR = Math.max(face * 1.15, (face * 0.62) / Math.sin(Math.PI / outerN))
  const innerR = outerR * 0.5
  return { offsets: [...ringOffsets(outerN, outerR), ...ringOffsets(innerN, innerR, -Math.PI / 2 + Math.PI / Math.max(1, innerN))], r: outerR }
}

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

  // ----- layout (pure geometry off the world structure) -----------------------
  const layout = useMemo(() => {
    const islands = world.islands
    if (islands.length === 0) return null

    // Each island: its faces + outer radius.
    const sized = new Map<string, { faces: { p: Person; x: number; y: number }[]; outerR: number; colour: string }>()
    for (const isl of islands) {
      const ppl = isl.memberKeys.map((k) => byKey.get(k)).filter((p): p is Person => !!p)
      const fl = faceLayout(ppl.length, FACE)
      const faces = ppl.map((p, i) => ({ p, x: fl.offsets[i].x, y: fl.offsets[i].y }))
      sized.set(isl.id, { faces, outerR: fl.r + FACE / 2 + PAD, colour: isl.colour || ISLAND_COLOUR[isl.kind] })
    }
    const outerR = (id: string) => sized.get(id)!.outerR

    // The Maisonnée sits at the centre; everything else orbits it. (No household → the
    // ring just fills the whole circle with no hub.)
    const centre = islands.find((i) => i.kind === 'household') ?? null
    const ring = islands.filter((i) => i !== centre)

    const pos = new Map<string, { x: number; y: number }>()
    if (centre) pos.set(centre.id, { x: 0, y: 0 })

    if (ring.length) {
      const rs = ring.map((i) => outerR(i.id))
      const maxR = Math.max(...rs)
      const centreR = centre ? outerR(centre.id) : 0
      const arc = ring.reduce((s, _i, idx) => s + 2 * rs[idx] + GAP, 0)
      const RR = Math.max(arc / (2 * Math.PI), centreR + maxR + GAP, maxR + GAP)
      // Angular width per island, scaled to fill the full circle (spacing ∝ size).
      const widths = ring.map((_i, idx) => (2 * rs[idx] + GAP) / RR)
      const sumW = widths.reduce((a, b) => a + b, 0) || 1
      const scale = (2 * Math.PI) / sumW
      let ang = -Math.PI / 2
      ring.forEach((isl, idx) => {
        const wid = widths[idx] * scale
        const a = ang + wid / 2
        pos.set(isl.id, { x: RR * Math.cos(a), y: RR * Math.sin(a) })
        ang += wid
      })
    }

    // Bounds → translate into a positive viewBox with a margin (+ room for labels).
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const isl of islands) {
      const c = pos.get(isl.id)!
      const r = outerR(isl.id)
      minX = Math.min(minX, c.x - r)
      maxX = Math.max(maxX, c.x + r)
      minY = Math.min(minY, c.y - r)
      maxY = Math.max(maxY, c.y + r + LABEL_H)
    }
    const M = 40
    const dx = M - minX
    const dy = M - minY
    const placed = new Map<string, Placed>()
    for (const isl of islands) {
      const c = pos.get(isl.id)!
      const s = sized.get(isl.id)!
      placed.set(isl.id, { island: isl, cx: c.x + dx, cy: c.y + dy, outerR: s.outerR, colour: s.colour, faces: s.faces })
    }
    const placedArr = islands.map((i) => placed.get(i.id)!)
    const bridges: PlacedBridge[] = world.bridges
      .map((b) => {
        const a = placed.get(b.aId)
        const bb = placed.get(b.bId)
        return a && bb ? { a, b: bb, viaKeys: b.viaKeys, key: `${b.aId}|${b.bId}` } : null
      })
      .filter((b): b is PlacedBridge => !!b)

    return { placed: placedArr, bridges, width: maxX - minX + M * 2, height: maxY - minY + M * 2 }
  }, [world, byKey, FACE, PAD, GAP, LABEL_H])

  // ----- narration lines ------------------------------------------------------
  const firstNames = (keys: string[], max = 4): string[] =>
    keys.map((k) => byKey.get(k)?.firstName).filter((n): n is string => !!n).slice(0, max)
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

  // Drive the tour: speak the current step, caption it, auto-advance on a timer sized
  // to the line length, until the sequence ends. Cleanup clears the pending advance.
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
    speak(line)
    const dur = Math.min(7000, Math.max(2500, 1400 + line.length * 46))
    const id = setTimeout(() => setTourAt((a) => (a == null ? null : a + 1)), dur)
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
              style={{ '--isl': isl.colour } as React.CSSProperties}
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
