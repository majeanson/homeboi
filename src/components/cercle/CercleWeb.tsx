import { useMemo } from 'react'
import { useT } from '../../i18n'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { PanZoom } from '../PanZoom'
import { type Person, type ContactLink, type FamilyGrouping, linkEndpoints, discColour, UnionFind } from '../../lib/cercle'

// « Le cercle » — the WHOLE social web at once (used for the Social section, where the
// single-focus ego view would only show one person's circle and the generational
// Arbre is meaningless for friends). All people + EVERY tie between them are drawn —
// no focus, no relationship type filter — so you see all the circles, not just one.
//
// Two layouts off the same graph:
//   • 'clusters' (Liens): each connected component — a "circle of friends" — is laid
//     out as its own ring inside a faint halo, and the rings tile in a grid. People
//     with no ties yet collect into a compact strip below. Reads as distinct circles.
//   • 'blob' (Arbre): everyone in ONE phyllotaxis cloud (component-mates kept near),
//     every tie drawn across it — the loose "blob" of the whole social network.
//
// Hand-rolled SVG (zero deps), reusing the shared <Avatar> / .ego-node / .tree-edge
// look and the PanZoom surface so a big web still pinches / drags / +−'s on a wall
// or a phone — same primitives as the Arbre.
const NODE = 56
const CELL = 280 // a cluster's tile in the grid (clusters mode)
const SCELL = 92 // a loose person's tile in the trailing strip
const MIN_W = 600
const STRIP_GAP = 56

export function CercleWeb({
  people,
  links,
  onOpen,
  grouping,
  mode,
}: {
  people: Person[]
  links: ContactLink[]
  onOpen: (p: Person) => void
  // Per-person family grouping (shared with Liens/Arbre) — tints discs with the
  // directory's colours via discColour so a group reads as one block here too.
  grouping?: FamilyGrouping
  mode: 'clusters' | 'blob'
}) {
  const t = useT()

  const layout = useMemo(() => {
    if (people.length === 0) return null
    const keys = new Set(people.map((p) => p.key))

    // One connector per unordered pair — the closure + group-implied friend links can
    // emit several rows between the same two people; we only want a single line.
    const seen = new Set<string>()
    const edges: { a: string; b: string }[] = []
    for (const l of links) {
      const { aKey, bKey } = linkEndpoints(l)
      if (aKey === bKey || !keys.has(aKey) || !keys.has(bKey)) continue
      const id = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`
      if (seen.has(id)) continue
      seen.add(id)
      edges.push({ a: aKey, b: bKey })
    }

    // Connected components over those ties — each is one "circle of friends".
    const uf = new UnionFind()
    people.forEach((p) => uf.add(p.key))
    for (const e of edges) uf.union(e.a, e.b)
    const comps = new Map<string, Person[]>()
    for (const p of people) {
      const root = uf.find(p.key)
      if (!comps.has(root)) comps.set(root, [])
      comps.get(root)!.push(p)
    }
    const components = [...comps.values()].sort((a, b) => b.length - a.length)
    const byName = (a: Person, b: Person) => a.name.localeCompare(b.name)

    const pos = new Map<string, { x: number; y: number }>()
    const halos: { x: number; y: number; r: number }[] = []
    let width = MIN_W
    let height = MIN_W
    let sepY: number | null = null

    if (mode === 'blob') {
      // Phyllotaxis (sunflower) spiral — even, overlap-light, deterministic. Order by
      // component then name so a circle's members land near one another in the cloud.
      const ordered = components.flatMap((c) => [...c].sort(byName))
      const GOLDEN = Math.PI * (3 - Math.sqrt(5))
      const SPACING = 66
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      ordered.forEach((p, i) => {
        const r = SPACING * Math.sqrt(i)
        const th = i * GOLDEN
        const x = r * Math.cos(th)
        const y = r * Math.sin(th)
        pos.set(p.key, { x, y })
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      })
      const PAD = NODE
      const dx = PAD - minX
      const dy = PAD - minY
      for (const [k, xy] of pos) pos.set(k, { x: xy.x + dx, y: xy.y + dy })
      width = Math.max(MIN_W, maxX - minX + PAD * 2)
      height = Math.max(MIN_W * 0.7, maxY - minY + PAD * 2)
    } else {
      // Clusters: real circles (2+) tile in a grid; loose people sit in a strip below.
      const clusters = components.filter((c) => c.length > 1)
      const singles = components.filter((c) => c.length === 1).map((c) => c[0]).sort(byName)
      const cols = Math.max(1, Math.ceil(Math.sqrt(clusters.length)))
      clusters.forEach((members, ci) => {
        const cx = (ci % cols) * CELL + CELL / 2
        const cy = Math.floor(ci / cols) * CELL + CELL / 2
        const r = Math.min(CELL / 2 - NODE, Math.max(58, members.length * 15))
        halos.push({ x: cx, y: cy, r: r + NODE / 2 + 6 })
        const ring = [...members].sort(byName)
        ring.forEach((p, i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / ring.length
          pos.set(p.key, { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) })
        })
      })
      const gridRows = Math.ceil(clusters.length / cols)
      const gridW = clusters.length ? cols * CELL : 0
      const gridH = gridRows * CELL
      width = Math.max(MIN_W, gridW)
      let y = gridH
      if (singles.length) {
        if (clusters.length) {
          sepY = y + STRIP_GAP / 2
          y += STRIP_GAP
        }
        const sCols = Math.max(1, Math.floor(width / SCELL))
        singles.forEach((p, i) => {
          pos.set(p.key, { x: ((i % sCols) + 0.5) * SCELL, y: y + (Math.floor(i / sCols) + 0.5) * SCELL })
        })
        y += Math.ceil(singles.length / sCols) * SCELL
      }
      height = Math.max(MIN_W * 0.6, y)
    }

    const placedEdges = edges
      .map((e) => {
        const a = pos.get(e.a)
        const b = pos.get(e.b)
        return a && b ? { a, b, key: `${e.a}|${e.b}` } : null
      })
      .filter((e): e is { a: { x: number; y: number }; b: { x: number; y: number }; key: string } => !!e)

    return { people, pos, edges: placedEdges, halos, width, height, sepY }
  }, [people, links, mode])

  if (!layout) return <EmptyState>{t.cercle.empty}</EmptyState>
  const { pos, edges, halos, width, height, sepY } = layout

  return (
    <div className="cercle-tree cercle-web">
      <p className="cercle-ego__hint mono">{mode === 'clusters' ? t.cercle.webHint : t.cercle.blobHint}</p>
      <PanZoom className="cercle-tree__zoom" ariaLabel={t.cercle.view[mode === 'clusters' ? 'links' : 'tree']}>
        <svg className="cercle-tree__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t.nav.cercle}>
          {halos.map((h, i) => (
            <circle key={`halo-${i}`} cx={h.x} cy={h.y} r={h.r} className="web-cluster" />
          ))}
          {sepY != null && <line x1={0} y1={sepY} x2={width} y2={sepY} className="tree-sep" />}
          {edges.map((e) => (
            <line key={e.key} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} className="tree-edge" />
          ))}
          {layout.people.map((p) => {
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
                <foreignObject x={xy.x - NODE / 2} y={xy.y - NODE / 2} width={NODE} height={NODE + 20}>
                  <div className="ego-node__inner">
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
