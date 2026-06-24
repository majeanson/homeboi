import { useEffect, useState, Fragment, type ReactNode } from 'react'
import { placeFil } from '../../lib/dayRibbon'
import { formatTime } from '../../lib/format'
import { SubHead } from './Act'
import type { Lang } from '../../i18n'

// One thing on the ribbon: a pre-rendered row (the host builds it with its own
// `eventAct`/`choreAct`/`workAct`, so taps + checks keep working) plus the times the
// layout needs. `until` lets a job window count as "past" only once it has ended.
export interface FilTimed {
  id: string
  start_at: number
  until?: number
  node: ReactNode
}
export interface FilUntimed {
  id: string
  node: ReactNode
}

// « Le fil du jour » — the day-ribbon. The day read as a SHAPE: timed things (events +
// L'auto rides + work/job windows) placed in time order, spaced by how far apart they
// are (a soft time axis), past ones dimmed, with a calm « maintenant » marker dropped in
// between what's behind us and what's ahead. Untimed things (chores, all-day events) pool
// under a quiet « À tout moment » foot. Rows are built by the host (reusing the board's
// own row renderers), so a tap still opens the same peek and a chore's check still ticks;
// this file only does the layout + the now-marker.
//
// Calm: no counts, no "you're late" — just position; the marker shows the time, never an
// alarm. Rendered only when there are ≥2 timed items (Board's guard).
export function Fil({
  timed,
  untimed,
  anytimeLabel,
  nowLabel,
  lang,
}: {
  timed: FilTimed[]
  untimed: FilUntimed[]
  anytimeLabel: string
  nowLabel: string
  lang: Lang
}) {
  // A gentle minute tick so the « maintenant » marker drifts with the clock between
  // board polls (calm: minute granularity, no second hand).
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 60_000)
    return () => clearInterval(id)
  }, [])

  const { rows, nowIndex } = placeFil(timed, nowSec)

  const marker = (
    <li className="fil__now" aria-hidden="true">
      <span className="fil__now-label">
        {nowLabel} · {formatTime(nowSec, lang)}
      </span>
    </li>
  )

  return (
    <div className="fil">
      <ol className="fil__list">
        {rows.map((r, i) => (
          <Fragment key={r.item.id}>
            {i === nowIndex && marker}
            <li className={'fil__row' + (r.past ? ' fil__row--past' : '')} style={{ marginTop: `${r.gapBefore}rem` }}>
              {r.item.node}
            </li>
          </Fragment>
        ))}
        {nowIndex === rows.length && marker}
      </ol>
      {untimed.length > 0 && (
        <>
          <SubHead label={anytimeLabel} icon="clock-bold" />
          {untimed.map((u) => (
            <Fragment key={u.id}>{u.node}</Fragment>
          ))}
        </>
      )}
    </div>
  )
}
