import { useMemo } from 'react'
import { useT } from '../../i18n'
import { Avatar } from '../Avatar'
import { type Person, type ContactLink, generationOf, linkEndpoints, isFamilyRel } from '../../lib/cercle'
// (byKey lookups aren't needed here — the layout works off positions + placed[].)

// « Le cercle » — Arbre (family tree). A generation-banded layout: people are
// placed in horizontal bands by generation (oldest at top, via generationOf's BFS
// over parent/child/spouse/sibling edges), and family ties are drawn as connectors.
// Blood relatives only (social ties live in Liste/Liens). Hand-rolled SVG, zero
// deps — couples land on the same band; deep/blended trees stay readable because
// the band model never forces a strict single-parent hierarchy.
const ROW_H = 150
const COL_W = 116
const MIN_W = 600
const NODE = 60

export function CercleTree({ people, links, onOpen }: { people: Person[]; links: ContactLink[]; onOpen: (p: Person) => void }) {
  const t = useT()

  const layout = useMemo(() => {
    const gen = generationOf(people, links)
    const placed = people.filter((p) => gen.has(p.key))
    if (placed.length === 0) return null

    // Normalize generation → band index (0 = oldest at top).
    const minGen = Math.min(...placed.map((p) => gen.get(p.key)!))
    const bands = new Map<number, Person[]>()
    for (const p of placed) {
      const band = gen.get(p.key)! - minGen
      if (!bands.has(band)) bands.set(band, [])
      bands.get(band)!.push(p)
    }
    const bandIdx = [...bands.keys()].sort((a, b) => a - b)
    const maxCount = Math.max(...[...bands.values()].map((b) => b.length))
    const width = Math.max(MIN_W, maxCount * COL_W)
    const height = bandIdx.length * ROW_H

    const pos = new Map<string, { x: number; y: number }>()
    bandIdx.forEach((band, row) => {
      const row3 = [...bands.get(band)!].sort((a, b) => a.name.localeCompare(b.name))
      row3.forEach((p, i) => {
        pos.set(p.key, { x: ((i + 0.5) / row3.length) * width, y: row * ROW_H + ROW_H / 2 })
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
  }, [people, links])

  if (!layout) return <p className="feed-empty cercle-tree__empty">{t.cercle.treeEmpty}</p>

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
                  <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={p.colour} name={p.firstName} size={NODE} />
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
