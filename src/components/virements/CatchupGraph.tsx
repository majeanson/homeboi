import { useT, useLang } from '../../i18n'
import { formatDayMaybeYear } from '../../lib/format'
import type { CatchupSeries } from '../../lib/transfers'

// « A little graph that goes to 0 » (Marc, 2026-09-12).
//
// The gap is the one quantity in this app that is SUPPOSED to disappear, so it is
// drawn disappearing: a line that starts at the amount as first counted and walks
// down to the floor. Everything it draws is already written in words directly above
// it — the drawing adds the shape of the thing, not a new fact.
//
// What keeps it a receipt rather than a scoreboard (NFR-CALM-1):
//   * no percentage, no progress bar, no colour that means good or bad — one ink;
//   * no axis except the zero line, which is the only number that matters;
//   * the measured half is solid and the forecast half is dashed, so a guess never
//     wears the clothes of a fact;
//   * if the arrangement does NOT close the gap, the line stops short of the floor.
//     Drawing it down to zero anyway would be the comfortable lie.
//
// It is an <svg role="img"> with no interactive children, which is exactly the case
// that role is for — nested-interactive.test.ts forbids the other one (an img role
// over interactive children makes that whole subtree presentational).
const W = 100
const H = 40
const TOP = 4
const FLOOR = 34

export function CatchupGraph({ series }: { series: CatchupSeries }) {
  const t = useT()
  const { lang } = useLang()
  const v = t.virements

  const from = series.past[0].at
  const to = series.ahead[series.ahead.length - 1].at
  const span = Math.max(1, to - from)
  const x = (at: number) => ((at - from) / span) * W
  // A zero gap sits ON the floor; the full gap reaches the top. maxCents is the gap
  // as first counted, so the line can never leave the box.
  const y = (cents: number) => FLOOR - (cents / Math.max(1, series.maxCents)) * (FLOOR - TOP)

  const path = (pts: readonly { at: number; cents: number }[]) => pts.map((p) => `${x(p.at)},${y(p.cents)}`).join(' ')

  const now = series.past[series.past.length - 1]

  return (
    <div className="vgraph">
      <svg
        className="vgraph__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={v.graphLabel(formatDayMaybeYear(from, lang), formatDayMaybeYear(to, lang))}
      >
        {/* The floor. The only axis worth drawing, because zero is the whole point. */}
        <line className="vgraph__floor" x1="0" y1={FLOOR} x2={W} y2={FLOOR} vectorEffect="non-scaling-stroke" />
        {/* What actually happened. */}
        <polyline className="vgraph__past" points={path(series.past)} vectorEffect="non-scaling-stroke" />
        {/* What would happen at this rhythm — dashed, because it has not happened. */}
        <polyline className="vgraph__ahead" points={path(series.ahead)} vectorEffect="non-scaling-stroke" />
        {/* Today, the one point on the line that is neither memory nor forecast. */}
        <circle className="vgraph__now" cx={x(now.at)} cy={y(now.cents)} r="2.5" vectorEffect="non-scaling-stroke" />
        {series.zeroAt != null && (
          <circle className="vgraph__zero" cx={x(series.zeroAt)} cy={FLOOR} r="2.5" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* The labels live in HTML, not in the SVG: they inherit the reader's text size
          and theme, and they do not stretch with preserveAspectRatio="none". */}
      <p className="vgraph__axis mono">
        <span>{formatDayMaybeYear(from, lang)}</span>
        <span>{series.zeroAt != null ? v.graphZero : ''}</span>
        <span>{formatDayMaybeYear(to, lang)}</span>
      </p>
    </div>
  )
}
