import { useMemo } from 'react'
import { useT } from '../../i18n'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { PanZoom } from '../PanZoom'
import { islandColour } from './CercleConstellation'
import { buildWorld, layoutIslands, type ContactGroup, type ContactLink, type Person, type WorldClusterInput } from '../../lib/cercle'

// « Le cercle » — Social ▸ Liens: your circles, each one named.
//
// This used to draw every person as a node and every tie as a line, clustered by
// connected component. It was unreadable, for a structural reason: the group→friend
// closure makes each social group a clique, so the whole social web collapsed into ONE
// component, and the ring it was dealt onto had a constant radius cap — eighteen faces
// on a circle with room for nine. You saw a hairball, not your circles.
//
// So we draw the circles you actually have. Each named group and each detected family
// is one ISLAND — a labelled halo, its ring sized from its member count — and a person
// who belongs to two of them draws a BRIDGE between the two. Anyone in no circle
// gathers into « Autres personnes ». Tap a face to open them.
//
// The islands + bridges come from buildWorld() and the geometry from layoutIslands(),
// both shared with « Notre monde » (which draws the same map for the WHOLE circle,
// household included, and narrates it). Hand-rolled SVG on the shared PanZoom surface,
// reusing <Avatar> / .ego-node / .world-island — so a big web still pinches, drags
// and +−'s on a wall or a phone.
const FACE = 52
const SLOT = 72 // each face reserves room for the name drawn under its disc
const PAD = 24 // the halo has to clear that name too
const GAP = 80
const LABEL_H = 40 // the island's own name + count, under the halo

export function CercleWeb({
  people,
  links,
  groups,
  familyClusters,
  onOpen,
}: {
  people: Person[]
  links: ContactLink[]
  /** The section's named groups, in the order the directory lists them. */
  groups: ContactGroup[]
  /** The section's auto-detected families (« Famille de Francis »). */
  familyClusters: { id: string; name: string; memberKeys: Set<string> }[]
  onOpen: (p: Person) => void
}) {
  const t = useT()
  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people])

  // Clusters in PRIORITY order — a person lands in the first that holds them, so a
  // friend who is both « Famille de Francis » and « Le hockey » shows once, in his
  // family, and a bridge records the other tie. Named families, then the families we
  // detected from the links, then the social groups. (No household island: in Social
  // you are, deliberately, not one of the circles.)
  const world = useMemo(() => {
    const clusters: WorldClusterInput[] = []
    for (const g of groups)
      if (g.kind === 'family' && g.memberKeys.size)
        clusters.push({ id: `group:${g.id}`, name: g.name, kind: 'family', groupKind: 'family', colour: g.colour, memberKeys: [...g.memberKeys] })
    for (const f of familyClusters)
      if (f.memberKeys.size) clusters.push({ id: `auto:${f.id}`, name: f.name, kind: 'family', groupKind: null, colour: null, memberKeys: [...f.memberKeys] })
    for (const g of groups)
      if (g.kind !== 'family' && g.memberKeys.size)
        clusters.push({ id: `group:${g.id}`, name: g.name, kind: 'group', groupKind: g.kind, colour: g.colour, memberKeys: [...g.memberKeys] })
    return buildWorld(people, links, clusters, t.cercle.others)
  }, [people, links, groups, familyClusters, t])

  const layout = useMemo(() => layoutIslands(world, byKey, { face: FACE, slot: SLOT, pad: PAD, gap: GAP, labelH: LABEL_H }), [world, byKey])

  if (!layout) return <EmptyState>{t.cercle.empty}</EmptyState>
  const { placed, bridges, width, height } = layout

  // « Maxime relie Le hockey et Le travail. » — the same sentence the world map speaks.
  const bridgeLabel = (viaKeys: string[], a: string, b: string) =>
    t.cercle.world.sayBridge(byKey.get(viaKeys[0])?.firstName ?? '', a, b)

  // Stop each bridge at the two halos rather than running centre-to-centre, so a
  // connector never crosses the faces of the circles it joins.
  const span = (b: (typeof bridges)[number]) => {
    const dx = b.b.cx - b.a.cx
    const dy = b.b.cy - b.a.cy
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    return { x1: b.a.cx + ux * b.a.outerR, y1: b.a.cy + uy * b.a.outerR, x2: b.b.cx - ux * b.b.outerR, y2: b.b.cy - uy * b.b.outerR }
  }

  return (
    <div className="cercle-tree cercle-web">
      <p className="cercle-ego__hint mono">{t.cercle.webHint}</p>
      <PanZoom className="cercle-tree__zoom" ariaLabel={t.cercle.view.links}>
        <svg className="cercle-tree__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label={t.nav.cercle}>
          {/* Bridges under the islands — the person who ties two circles together. */}
          {bridges.map((b) => (
            <g key={b.key} className="world-bridge">
              <title>{bridgeLabel(b.viaKeys, b.a.island.name, b.b.island.name)}</title>
              <line {...span(b)} className="world-bridge__line" />
            </g>
          ))}

          {placed.map((isl) => (
            <g key={isl.island.id} className={'world-island world-island--' + isl.island.kind} style={{ '--isl': islandColour(isl.island) } as React.CSSProperties}>
              <circle cx={isl.cx} cy={isl.cy} r={isl.outerR} className="world-island__halo" />
              <text x={isl.cx} y={isl.cy + isl.outerR + 21} className="world-island__label" textAnchor="middle">
                {isl.island.name}
              </text>
              <text x={isl.cx} y={isl.cy + isl.outerR + 36} className="world-island__count" textAnchor="middle">
                {t.cercle.world.peopleN(isl.island.memberKeys.length)}
              </text>

              {isl.faces.map(({ p, x, y }) => (
                <g
                  key={p.key}
                  className="ego-node world-face"
                  role="button"
                  tabIndex={0}
                  aria-label={p.name}
                  onClick={() => onOpen(p)}
                  onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), onOpen(p))}
                >
                  <foreignObject x={isl.cx + x - FACE / 2} y={isl.cy + y - FACE / 2} width={FACE} height={FACE + 20}>
                    <div className="ego-node__inner">
                      {/* The island's colour tints a photoless disc, so a circle reads
                          as one block — same rule discColour applies in Liste/Arbre. */}
                      <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={isl.island.colour || p.colour} name={p.firstName} size={FACE} />
                      <span className="ego-node__name">{p.firstName}</span>
                    </div>
                  </foreignObject>
                </g>
              ))}
            </g>
          ))}
        </svg>
      </PanZoom>
    </div>
  )
}
