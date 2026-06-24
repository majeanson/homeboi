import { useEffect, useState, Fragment, type ReactNode } from 'react'
import { placeFil } from '../../lib/dayRibbon'
import { formatTime } from '../../lib/format'
import type { Lang } from '../../i18n'
import { SubHead } from './Act'
import type { EventRow } from './types'

// « Le fil du jour » — the day-ribbon. The same timed events the day list carries, but
// read as a SHAPE: in time order, spaced by how far apart they are (a soft time axis),
// past ones gently dimmed, with a calm « maintenant » marker dropped in between what's
// behind us and what's still to come. It answers *when* at a glance — the flat list
// answers *what* (and stays the place you tap to check things off). Rows reuse the
// board's own `eventAct` (so a tap still opens the same detail peek); this file only
// does the layout + the now-marker. Untimed/all-day items pool under a quiet foot.
//
// Calm: no counts, no "you're late" — just position. The marker shows the current time,
// never an alarm. Rendered only when there are ≥2 timed events (Board's guard); a single
// next-up is already covered by the « Prochainement » headline on the day card.
export function Fil({
  timed,
  untimed,
  renderEvent,
  anytimeLabel,
  nowLabel,
  lang,
}: {
  timed: EventRow[]
  untimed: EventRow[]
  renderEvent: (e: EventRow) => ReactNode
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
              {renderEvent(r.item)}
            </li>
          </Fragment>
        ))}
        {nowIndex === rows.length && marker}
      </ol>
      {untimed.length > 0 && (
        <>
          <SubHead label={anytimeLabel} icon="clock-bold" />
          {untimed.map(renderEvent)}
        </>
      )}
    </div>
  )
}
