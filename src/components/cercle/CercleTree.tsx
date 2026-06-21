import { useMemo } from 'react'
import { useT } from '../../i18n'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { PanZoom } from '../PanZoom'
import { type Person, type ContactLink, type FamilyGrouping, generationOf, linkEndpoints, isFamilyRel, discColour } from '../../lib/cercle'
// (byKey lookups aren't needed here — the layout works off positions + placed[].)

// « Le cercle » — Arbre (family tree). A generation-banded layout: people are
// placed in horizontal bands by generation (oldest at top, via generationOf's BFS
// over parent/child/spouse/sibling edges), and family ties are drawn as connectors.
// Blood relatives only (social ties live in Liste/Liens). Hand-rolled SVG, zero
// deps — couples land on the same band; deep/blended trees stay readable because
// the band model never forces a strict single-parent hierarchy.
//
// DISCONNECTED FAMILIES are each laid out as their OWN tree and stacked vertically
// (a faint divider between them), so two unrelated families never get jumbled into
// shared, generation-misaligned bands — every tree shows, each on its own terms.
// The whole stack lives inside a PanZoom so a big or deep tree can be pinched /
// dragged / +−'d to read on a wall tablet or a phone.
const ROW_H = 168
const COL_W = 128
const MIN_W = 600
const NODE = 64
const COMP_GAP = 72 // vertical breathing room between stacked, disconnected trees

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
    const placedKeys = new Set(placed.map((p) => p.key))

    // Split the placed people into connected components over the family edges (the
    // same edge set generationOf walked) — Union-Find. Each component is one
    // disconnected family that gets its own independent band layout.
    const parent = new Map<string, string>()
    const find = (x: string): string => {
      const p = parent.get(x)
      if (p === undefined || p === x) return x
      const r = find(p)
      parent.set(x, r)
      return r
    }
    const union = (a: string, b: string) => {
      parent.set(find(a), find(b))
    }
    placed.forEach((p) => parent.set(p.key, p.key))
    for (const l of links) {
      if (!isFamilyRel(l.type)) continue
      const { aKey, bKey } = linkEndpoints(l)
      if (placedKeys.has(aKey) && placedKeys.has(bKey)) union(aKey, bKey)
    }
    const comps = new Map<string, Person[]>()
    for (const p of placed) {
      const root = find(p.key)
      if (!comps.has(root)) comps.set(root, [])
      comps.get(root)!.push(p)
    }

    // Order within a band: cluster by family group (same `order`, so a family sits
    // together across bands), then alphabetical. Ungrouped people sort last.
    const groupOrder = (p: Person) => grouping?.get(p.key)?.order ?? Number.MAX_SAFE_INTEGER

    // Lay out ONE component into a local [0..width] × [0..height] box. The band
    // number doubles as the row, so an EMPTY generation leaves a real gap (a
    // grandparent linked straight to a grandchild still lands two layers up).
    const layoutComp = (members: Person[]) => {
      const minGen = Math.min(...members.map((p) => gen.get(p.key)!))
      const bands = new Map<number, Person[]>()
      for (const p of members) {
        const band = gen.get(p.key)! - minGen
        if (!bands.has(band)) bands.set(band, [])
        bands.get(band)!.push(p)
      }
      const bandIdx = [...bands.keys()].sort((a, b) => a - b)
      const maxBand = bandIdx[bandIdx.length - 1]
      const maxCount = Math.max(...[...bands.values()].map((b) => b.length))
      const width = Math.max(MIN_W, maxCount * COL_W)
      const height = (maxBand + 1) * ROW_H
      const pos = new Map<string, { x: number; y: number }>()
      bandIdx.forEach((band) => {
        const row = [...bands.get(band)!].sort((a, b) => groupOrder(a) - groupOrder(b) || a.name.localeCompare(b.name))
        row.forEach((p, i) => {
          pos.set(p.key, { x: ((i + 0.5) / row.length) * width, y: band * ROW_H + ROW_H / 2 })
        })
      })
      return { members, pos, width, height }
    }

    // Biggest family first; stack the rest below it, each centred on the widest tree.
    const compLayouts = [...comps.values()].map(layoutComp).sort((a, b) => b.members.length - a.members.length)
    const totalWidth = Math.max(...compLayouts.map((c) => c.width))

    const pos = new Map<string, { x: number; y: number }>()
    const seps: number[] = []
    let y = 0
    compLayouts.forEach((c, i) => {
      if (i > 0) {
        seps.push(y + COMP_GAP / 2) // a divider sits in the gap between two trees
        y += COMP_GAP
      }
      const xOff = (totalWidth - c.width) / 2
      for (const p of c.members) {
        const xy = c.pos.get(p.key)!
        pos.set(p.key, { x: xOff + xy.x, y: y + xy.y })
      }
      y += c.height
    })
    const height = y

    // Family connectors between placed nodes (every family edge joins two nodes in
    // the SAME component, so both endpoints are always positioned).
    const edges = links
      .filter((l) => isFamilyRel(l.type))
      .map((l) => {
        const { aKey, bKey } = linkEndpoints(l)
        const a = pos.get(aKey)
        const b = pos.get(bKey)
        return a && b ? { a, b, key: l.id } : null
      })
      .filter((e): e is { a: { x: number; y: number }; b: { x: number; y: number }; key: string } => !!e)

    return { placed, pos, width: totalWidth, height, edges, seps }
  }, [people, links, grouping])

  if (!layout) return <EmptyState className="cercle-tree__empty">{t.cercle.treeEmpty}</EmptyState>

  const { placed, pos, width, height, edges, seps } = layout
  return (
    <div className="cercle-tree">
      {/* The SVG fills the PanZoom surface (viewBox + meet) so the whole stack fits at
          rest, then pinch / drag / +− scales it up. Disconnected families stack
          vertically, separated by a faint divider. */}
      <PanZoom className="cercle-tree__zoom" ariaLabel={t.cercle.view.tree}>
        <svg className="cercle-tree__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t.cercle.view.tree}>
          {seps.map((sy, i) => (
            <line key={`sep-${i}`} x1={0} y1={sy} x2={width} y2={sy} className="tree-sep" />
          ))}
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
      </PanZoom>
    </div>
  )
}
