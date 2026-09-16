import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { MONTH_KEY } from '../../lib/queryKeys'
import { healOnError } from '../../lib/query'
import { useProfile } from '../../lib/profile'
import { useMealPrefs } from '../../lib/mealPrefs'
import { addLocalDays, localDayStart, localYMD } from '../../lib/localDay'
import { formatDayShort, formatDayLong, weekdayShort, dayNum, capitalize as cap } from '../../lib/format'
import { type Lang } from '../../i18n'
import { Icon } from '../Icon'
import { Loading } from '../Fallback'
import { LoadError } from '../LoadError'
import { DayMark } from './DayMark'
import { bucketByDay, markersFor, tripSpansByDay, type MonthData } from './dayLines'
import { type Dict, type Member } from './types'


const SPAN = 7

// « La semaine » — the third calendar face, and the rung the ladder was missing.
//
// The app could show a DAY (/kitchen/day/:date), a MONTH and a YEAR. The week — the
// unit a household actually plans in — had no glance at all. Month is too dense at
// 390px to answer "who's where Thursday"; day is too narrow to answer "is Thursday
// already full". Both questions are the same question, asked at the scale nobody
// could ask it.
//
// NO NEW ENDPOINT. This is `/api/month` over a seven-day window — the same payload,
// the same `bucketByDay`, the same `linesFor`, the same `<DayMark>` glyphs (all four
// extracted from MonthView for this, so the two faces cannot drift about what a day
// holds). What changes is the LAYOUT: seven rows that spell things out, instead of
// forty-two cells that can only afford dots.
//
// Read-only on purpose. A week glance answers "what is coming"; every verb — plan a
// meal, tick a todo, add a rendez-vous — already lives one tap away on the day page,
// and the ONE day door is what every other surface links to (memory: « day scene two
// faces »). Adding a second place to edit a day is how two places disagree.
export function WeekView({
  members,
  lang,
  t,
  todayDay,
}: {
  members: Member[]
  lang: Lang
  t: Dict
  todayDay: number
}) {
  // Whole weeks from TODAY, not from a Monday. A household's "this week" starts now:
  // a Thursday glance that spends three of its seven rows on days already lived is
  // three rows of nothing. `offset` steps by whole weeks from here.
  const [offset, setOffset] = useState(0)
  const from = useMemo(() => addLocalDays(localDayStart(new Date()), offset * SPAN), [offset])
  const to = addLocalDays(from, SPAN)
  const days = useMemo(() => Array.from({ length: SPAN }, (_, i) => addLocalDays(from, i)), [from])

  // The picked face — the same private-ish habit filter the month and « Le point du
  // jour » apply (bucketByDay's `face`).
  const { memberId: face } = useProfile()
  const mealPrefs = useMealPrefs()

  // Keyed on `from`, so stepping a week is a separate cache entry rather than a
  // refetch that blanks the rows underneath. healOnError: like the month, this
  // surface does not poll, so without it a failed window sits blank until a tap.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...MONTH_KEY, 'week', from],
    queryFn: () => api<MonthData>(`month?from=${from}&to=${to}`),
    staleTime: 30_000,
    ...healOnError,
  })

  // « 15 – 21 sept. » — the window this view is showing, so stepping weeks says WHERE
  // you landed instead of only which direction you went.
  //
  // No weekdays, and the month named ONCE when both ends share it. The first version
  // used `formatDay` on both (« mar. 15 sept. – lun. 21 sept. ») and the header
  // ellipsized to « mar. 15 sept.… » at 390px — a range header that had stopped
  // stating its range. The weekday is also the redundant half here: every row below
  // carries its own.
  const lastDay = addLocalDays(to, -1)
  const sameMonth = localYMD(from).month === localYMD(lastDay).month
  const weekLabel = sameMonth
    ? `${dayNum(from, lang)} – ${formatDayShort(lastDay, lang)}`
    : `${formatDayShort(from, lang)} – ${formatDayShort(lastDay, lang)}`

  const byDay = useMemo(() => bucketByDay(data, face), [data, face])
  const tripsByDay = useMemo(() => tripSpansByDay(data?.trips, from, to), [data, from, to])

  if (isLoading && !data) return <Loading />
  if (isError && !data) return <LoadError onRetry={() => void refetch()} />

  return (
    <div className="weekv">
      {/* The month's own head, reused: two round arrows around a centred label, with
          « Cette semaine » holding its slot (visibility, not display) so a rapid
          double-tap on an arrow never shifts the other one out from under the finger.
          The first version put three LABELLED buttons in a <Cluster> and they stacked
          into two full rows at 390px — two rows of chrome above a seven-row view.
          The `.monthv__nav` / `.monthv__today` classes already solve this; the arrows
          say where they go in their aria-label. */}
      <div className="monthv__head">
        <button type="button" className="monthv__nav" onClick={() => setOffset((o) => o - 1)} aria-label={t.week.prev}>
          <Icon name="caret-left-bold" size={18} />
        </button>
        <h2 className="monthv__title">{weekLabel}</h2>
        <button
          type="button"
          className={'monthv__today' + (offset === 0 ? ' is-hidden' : '')}
          onClick={() => setOffset(0)}
          aria-hidden={offset === 0}
          tabIndex={offset === 0 ? -1 : undefined}
        >
          {t.week.thisWeek}
        </button>
        <button type="button" className="monthv__nav" onClick={() => setOffset((o) => o + 1)} aria-label={t.week.next}>
          <Icon name="caret-right-bold" size={18} />
        </button>
      </div>

      <ol className="weekv__days">
        {days.map((d) => {
          // The MARKER walk, not the raw one: a week row is a glance like a month cell,
          // and a daily habit on all seven rows is the noise it must not carry.
          const lines = markersFor(byDay.get(d), members, mealPrefs, t, lang)
          const bands = tripsByDay.get(d) ?? []
          const isToday = d === todayDay
          return (
            <li key={d} className={'weekv__day surface' + (isToday ? ' is-today' : '')}>
              {/* The whole row is the day door. A Link, not a div+onClick: it is a
                  NAVIGATION, so it must be a real link — middle-clickable, focusable,
                  and announced as one (ACTIONS.md's non-touch rule). */}
              <Link
                to={`/kitchen/day/${d}`}
                className="weekv__day-link"
                aria-label={`${formatDayLong(d, lang)}${lines.length ? ` — ${lines.length}` : ''}`}
              >
                <span className="weekv__date">
                  <span className="weekv__dow mono">{cap(weekdayShort(d, lang))}</span>
                  <span className="weekv__num">{dayNum(d, lang)}</span>
                </span>
                <span className="weekv__lines">
                  {lines.length === 0 ? (
                    // Not an EmptyState card per row — seven of those is a wall of
                    // « rien ». One quiet word, and the free day reads as breathing
                    // room rather than a gap to fill (NFR-CALM).
                    <span className="weekv__free mono">{t.week.free}</span>
                  ) : (
                    lines.map((l, i) => (
                      <span key={i} className="weekv__line">
                        <DayMark dot={l} />
                        {l.time && <span className="weekv__time mono">{l.time}</span>}
                        <span className="weekv__label">{l.label}</span>
                      </span>
                    ))
                  )}
                </span>
                <span className="weekv__go" aria-hidden="true">
                  <Icon name="caret-right-bold" size={14} />
                </span>
              </Link>
              {/* « Voyage » bands, as on the month cell: a strip per covering trip. */}
              {bands.length > 0 && (
                <span className="weekv__bands" aria-hidden="true">
                  {bands.slice(0, 3).map((tr) => (
                    <span key={tr.id} className="weekv__band" style={{ background: tr.colour }} />
                  ))}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
