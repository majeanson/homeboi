import { useEffect, useMemo, useState } from 'react'
import { useLang, useT } from '../../i18n'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { type Person, type ContactLink, type FamilyGrouping, personKey, genderedRelLabel, discColour } from '../../lib/cercle'

// « Le cercle » — Liens (ego view). The chosen person sits at the centre; everyone
// DIRECTLY linked to them fans out on a ring, each connector LABELLED with the
// relationship (so "who's who" reads at a glance). Tap a face → it becomes the new
// centre (re-focus). Hand-rolled SVG (zero deps, themeable, calm) — research said a
// force-directed graph is the wrong tool here; this stays a small, readable, local
// view. foreignObject hosts the shared <Avatar> so faces match the rest of the app.
const VW = 640
const VH = 540
const CX = VW / 2
const CY = VH / 2 + 10
const RING = 195

export function CercleEgo({
  people,
  links,
  onOpen,
  focusKey: focusKeyProp,
  grouping,
}: {
  people: Person[]
  links: ContactLink[]
  onOpen: (p: Person) => void
  // Optional external focus (the page's member "focus lens"): seeds + drives the
  // centre. Tapping a neighbour still re-centres locally on top of it.
  focusKey?: string | null
  // Per-person family grouping (shared with the Arbre) — tints each disc with the
  // directory's family colours via discColour, so a family reads as one block here too.
  grouping?: FamilyGrouping
}) {
  const t = useT()
  const { lang } = useLang()
  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people])

  // Default focus: the page's focus lens if set, else the first household member (the
  // family's own anchor), else the first person. Kept in state so tapping a neighbour
  // re-centres; the lens (focusKeyProp) updates it when the picked member changes.
  const initial = useMemo(() => people.find((p) => p.kind === 'member')?.key ?? people[0]?.key ?? null, [people])
  const [focusKey, setFocusKey] = useState<string | null>(focusKeyProp ?? initial)
  useEffect(() => {
    if (focusKeyProp) setFocusKey(focusKeyProp)
  }, [focusKeyProp])
  const focus = (focusKey && byKey.get(focusKey)) || (initial && byKey.get(initial)) || people[0]

  // Direct neighbours of the focus, with the relation read from the focus's side.
  // One row per linked person (labels merged if several links connect the pair).
  const neighbours = useMemo(() => {
    if (!focus) return []
    const acc = new Map<string, { person: Person; labels: string[] }>()
    for (const l of links) {
      const aKey = personKey(l.personAKind, l.personAId)
      const bKey = personKey(l.personBKind, l.personBId)
      let otherKey: string | null = null
      let rel = l.type
      if (aKey === focus.key) {
        otherKey = bKey
        rel = l.type
      } else if (bKey === focus.key) {
        otherKey = aKey
        rel = l.reverseType
      }
      if (!otherKey) continue
      const other = byKey.get(otherKey)
      if (!other) continue
      const entry = acc.get(otherKey) ?? { person: other, labels: [] }
      // `rel` is the relation read from the FOCUS's side ("focus est [rel] de other"),
      // so the label describes the focus and is gendered by THEIR gender.
      const label = genderedRelLabel(rel, focus.gender, lang)
      if (!entry.labels.includes(label)) entry.labels.push(label)
      acc.set(otherKey, entry)
    }
    return [...acc.values()]
  }, [focus, links, byKey, lang])

  if (!focus) return <EmptyState>{t.cercle.empty}</EmptyState>

  const positions = neighbours.map((n, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, neighbours.length)
    return { ...n, x: CX + RING * Math.cos(angle), y: CY + RING * Math.sin(angle) }
  })

  const Node = ({ person, x, y, size, onClick }: { person: Person; x: number; y: number; size: number; onClick: () => void }) => {
    const half = size / 2
    return (
      <g className="ego-node" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}>
        <foreignObject x={x - half} y={y - half} width={size} height={size + 22}>
          <div className="ego-node__inner">
            {/* Same family colour as Liste/Arbre (shared discColour). */}
            <Avatar kind={person.avatarKind} photo={person.avatarRef} colour={discColour(grouping, person)} name={person.firstName} size={size} />
            <span className="ego-node__name">{person.firstName}</span>
          </div>
        </foreignObject>
      </g>
    )
  }

  return (
    <div className="cercle-ego">
      <p className="cercle-ego__hint mono">{t.cercle.egoHint}</p>
      {neighbours.length === 0 && <EmptyState>{t.cercle.linksEmpty}</EmptyState>}
      {/* Intrinsic width/height so CSS fits the whole ring within the area below the
          controls rather than stretching to the wall width (which pushed the lower
          ring off a kiosk glance). max-width/max-height in cercle.css scale to fit. */}
      <svg className="cercle-ego__svg" width={VW} height={VH} viewBox={`0 0 ${VW} ${VH}`} role="group" aria-label={focus.name}>
        {/* Connectors first (under the nodes), each labelled with the relation. */}
        {positions.map((n) => {
          const mx = (CX + n.x) / 2
          const my = (CY + n.y) / 2
          return (
            <g key={`edge-${n.person.key}`}>
              <line x1={CX} y1={CY} x2={n.x} y2={n.y} className="ego-edge" />
              <text x={mx} y={my} className="ego-edge__label" textAnchor="middle">
                {n.labels.join(' / ')}
              </text>
            </g>
          )
        })}
        {/* Neighbours: tap = re-centre on them. */}
        {positions.map((n) => (
          <Node key={n.person.key} person={n.person} x={n.x} y={n.y} size={64} onClick={() => setFocusKey(n.person.key)} />
        ))}
        {/* The focus: tap = open the detail peek. */}
        <Node person={focus} x={CX} y={CY} size={92} onClick={() => onOpen(focus)} />
      </svg>
    </div>
  )
}
