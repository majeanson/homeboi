import { useMemo } from 'react'
import { useT } from '../../i18n'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { type Person, type ContactLink, type FamilyGrouping, generationOf, linkEndpoints, isFamilyRel, discColour } from '../../lib/cercle'
// (byKey lookups aren't needed here — the layout works off positions + placed[].)

// « Le cercle » — Arbre (family tree). A generation-banded layout: people are
// placed in horizontal bands by generation (oldest at top, via generationOf's BFS
// over parent/child/spouse/sibling edges), and family ties are drawn as connectors.
// Blood relatives only (social ties live in Liste/Liens). Hand-rolled SVG, zero
// deps — couples land on the same band; deep/blended trees stay readable because
// the band model never forces a strict single-parent hierarchy.
const ROW_H = 168
const COL_W = 128
const MIN_W = 600
const NODE = 64

export function CercleTree({
  people,
  links,
  onOpen,
  grouping,
}: {
  people: Person[]
  links: ContactLink[]
  onOpen: (p: Person) => void
  // Per-person family grouping (shared with Liens) — tints discs with the directory's
  // family colours and keeps a family clustered within a generation band.
  grouping?: FamilyGrouping
}) {
  const t = useT()

  const layout = useMemo(() => {
    const gen = generationOf(people, links)
    const placed = people.filter((p) => gen.has(p.key))
    if (placed.length === 0) return null

    // Bucket people by their TRUE generation (gen - minGen). The band number doubles
    // as the vertical row, so an EMPTY generation leaves a real gap — a grandparent
    // linked straight to a grandchild (no parent placed between) still lands two
    // layers up, not adjacent. 0 = oldest at top.
    const minGen = Math.min(...placed.map((p) => gen.get(p.key)!))
    const bands = new Map<number, Person[]>()
    for (const p of placed) {
      const band = gen.get(p.key)! - minGen
      if (!bands.has(band)) bands.set(band, [])
      bands.get(band)!.push(p)
    }
    const bandIdx = [...bands.keys()].sort((a, b) => a - b)
    const maxBand = bandIdx[bandIdx.length - 1]
    const maxCount = Math.max(...[...bands.values()].map((b) => b.length))
    // Fill the available width: spread the widest band across the full canvas, with a
    // comfortable floor so a small family isn't a lonely speck.
    const width = Math.max(MIN_W, maxCount * COL_W)
    const height = (maxBand + 1) * ROW_H

    // Order within a band: cluster by family group (same `order`, so a family sits
    // together across bands), then alphabetical. Ungrouped people sort last.
    const groupOrder = (p: Person) => grouping?.get(p.key)?.order ?? Number.MAX_SAFE_INTEGER
    const pos = new Map<string, { x: number; y: number }>()
    bandIdx.forEach((band) => {
      const row3 = [...bands.get(band)!].sort((a, b) => groupOrder(a) - groupOrder(b) || a.name.localeCompare(b.name))
      row3.forEach((p, i) => {
        pos.set(p.key, { x: ((i + 0.5) / row3.length) * width, y: band * ROW_H + ROW_H / 2 })
      })
    })

    // Family connectors between placed nodes.
    const edges = links
      .filter((l) => isFamilyRel(l.type))
      .map((l) => {
        const { aKey, bKey } = linkEndpoints(l)
        const a = pos.get(aKey)
        const b = pos.get(bKey)
        return a && b ? { a, b, key: l.id } : null
      })
      .filter((e): e is { a: { x: number; y: number }; b: { x: number; y: number }; key: string } => !!e)

    return { placed, pos, width, height, edges }
  }, [people, links, grouping])

  if (!layout) return <EmptyState className="cercle-tree__empty">{t.cercle.treeEmpty}</EmptyState>

  const { placed, pos, width, height, edges } = layout
  return (
    <div className="cercle-tree">
      <svg className="cercle-tree__svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t.cercle.view.tree}>
        {edges.map((e) => (
          <line key={e.key} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} className="tree-edge" />
        ))}
        {placed.map((p) => {
          const xy = pos.get(p.key)!
          return (
            <g
              key={p.key}
              className="ego-node"
              role="button"
              tabIndex={0}
              onClick={() => onOpen(p)}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), onOpen(p))}
            >
              <foreignObject x={xy.x - NODE / 2} y={xy.y - NODE / 2} width={NODE} height={NODE + 22}>
                <div className="ego-node__inner">
                  {/* Same family colour as Liste/Liens (shared discColour): a named
                      group's colour tints a photoless disc; the person's own
                      photo/colour wins otherwise. */}
                  <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={discColour(grouping, p)} name={p.firstName} size={NODE} />
                  <span className="ego-node__name">{p.firstName}</span>
                </div>
              </foreignObject>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
