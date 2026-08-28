import { useMemo } from 'react'
import { useT } from '../../i18n'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { PanZoom } from '../PanZoom'
import { layoutFamilyForest, type Person, type ContactLink, type FamilyGrouping, discColour } from '../../lib/cercle'

// « Le cercle » — Arbre. People are placed in horizontal bands by generation (oldest at
// top, via generationOf's BFS over parent/child/spouse/sibling edges) and family ties
// are drawn as connectors. Couples land on the same band; deep/blended trees stay
// readable because the band model never forces a strict single-parent hierarchy.
// Hand-rolled SVG, zero deps; the geometry is pure and lives in lib/cercle
// (layoutFamilyForest), where it's tested.
//
// Two flows off the same layout:
//   • Famille (default) — blood relatives only. DISCONNECTED FAMILIES are each laid out
//     as their own tree and STACKED vertically with a faint divider, so two unrelated
//     families never get jumbled into shared, generation-misaligned bands.
//   • Social (`social`) — one forest: each friend's family is its own framed, named
//     tree, the trees sit SIDE BY SIDE, and the FRIENDSHIPS between them are drawn as
//     dashed connectors. Those friendships also align the trees, so a tie between two
//     parents reads as a level line. A friend with no family of their own is a tree of
//     one, rather than being dropped.
//
// The whole forest lives inside a PanZoom so a big or deep tree can be pinched /
// dragged / +−'d to read on a wall tablet or a phone.
const ROW_H = 168
const COL_W = 128
const MIN_W = 600
const NODE = 64
const COMP_GAP = 72 // breathing room between two trees
const FRAME_PAD_X = 14
const FRAME_PAD_Y = 58 // clears a NODE-tall disc (32) plus its name (22)
const FRAME_LABEL_H = 34

// A friendship is drawn as an ARC, not a straight line. Two friends usually sit on the
// SAME band (two parents who know each other), and a straight line between them runs
// dead through whoever else stands on that band — three families read as one chain.
// The arc bows away from the band, so a tie stays a tie. Bowed left→right (always
// "upward") and capped, so it never wanders off into the next row.
function arcPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const [p, q] = a.x <= b.x ? [a, b] : [b, a]
  const dx = q.x - p.x
  const dy = q.y - p.y
  const len = Math.hypot(dx, dy) || 1
  const bow = Math.min(ROW_H * 0.55, Math.max(24, len * 0.18))
  // Perpendicular, rotated so a left→right edge bows up and away from the faces.
  const cx = (p.x + q.x) / 2 + (dy / len) * bow
  const cy = (p.y + q.y) / 2 - (dx / len) * bow
  return `M${p.x} ${p.y} Q${cx} ${cy} ${q.x} ${q.y}`
}

export function CercleTree({
  people,
  links,
  onOpen,
  grouping,
  social = false,
  clusterNames,
}: {
  people: Person[]
  links: ContactLink[]
  onOpen: (p: Person) => void
  // Per-person family grouping (shared with Liens) — tints discs with the directory's
  // family colours and keeps a family clustered within a generation band.
  grouping?: FamilyGrouping
  /** Social ▸ Arbre: side-by-side families joined by their friendships. */
  social?: boolean
  /** Names + tints each tree's frame (Social only). Keyed by Person.key. */
  clusterNames?: Map<string, { name: string; colour: string | null }>
}) {
  const t = useT()

  const layout = useMemo(
    () =>
      layoutFamilyForest(people, links, {
        rowH: ROW_H,
        colW: COL_W,
        compGap: COMP_GAP,
        flow: social ? 'row' : 'stack',
        socialTies: social,
        includeIsolated: social,
        compMinW: social ? 0 : MIN_W,
        labelH: social ? FRAME_LABEL_H : 0,
        framePadX: social ? FRAME_PAD_X : 0,
        framePadY: social ? FRAME_PAD_Y : 0,
        orderOf: (key) => grouping?.get(key)?.order ?? Number.MAX_SAFE_INTEGER,
        clusterOf: social && clusterNames ? (key) => clusterNames.get(key) ?? null : undefined,
      }),
    [people, links, grouping, social, clusterNames],
  )

  if (!layout) return <EmptyState className="cercle-tree__empty">{social ? t.cercle.socialTreeEmpty : t.cercle.treeEmpty}</EmptyState>

  const { nodes, familyEdges, socialEdges, frames, seps, width, height } = layout
  return (
    <div className="cercle-tree">
      {social && <p className="cercle-ego__hint mono">{t.cercle.forestHint}</p>}
      {/* The SVG fills the PanZoom surface (viewBox + meet) so the whole forest fits at
          rest, then pinch / drag / +− scales it up. */}
      <PanZoom className="cercle-tree__zoom" ariaLabel={t.cercle.view.tree}>
        <svg className="cercle-tree__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label={t.cercle.view.tree}>
          {/* A named, tinted frame around each family — so a side-by-side forest reads
              as « la famille de Francis, la famille de Michelle », not one big blur. */}
          {frames.map((f) => (
            <g key={`frame-${f.key}`} className="tree-frame" style={{ '--isl': f.colour ?? undefined } as React.CSSProperties}>
              <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={22} className="tree-frame__box" />
              <text x={f.x + f.w / 2} y={f.y - 12} className="tree-frame__label" textAnchor="middle">
                {f.name}
              </text>
            </g>
          ))}
          {seps.map((sy, i) => (
            <line key={`sep-${i}`} x1={0} y1={sy} x2={width} y2={sy} className="tree-sep" />
          ))}
          {/* Friendships first, under the blood ties they connect. */}
          {socialEdges.map((e) => (
            <path key={`soc-${e.key}`} d={arcPath(e.a, e.b)} className="tree-edge tree-edge--social" />
          ))}
          {familyEdges.map((e) => (
            <line key={e.key} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} className="tree-edge" />
          ))}
          {nodes.map(({ p, x, y }) => (
            <g
              key={p.key}
              className="ego-node"
              role="button"
              tabIndex={0}
              aria-label={p.name}
              onClick={() => onOpen(p)}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), onOpen(p))}
            >
              <foreignObject x={x - NODE / 2} y={y - NODE / 2} width={NODE} height={NODE + 22}>
                <div className="ego-node__inner">
                  {/* Same family colour as Liste/Liens (shared discColour): a named
                      group's colour tints a photoless disc; the person's own
                      photo/colour wins otherwise. */}
                  <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={discColour(grouping, p)} name={p.firstName} size={NODE} />
                  <span className="ego-node__name">{p.firstName}</span>
                </div>
              </foreignObject>
            </g>
          ))}
        </svg>
      </PanZoom>
    </div>
  )
}
