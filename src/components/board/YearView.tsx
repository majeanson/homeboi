import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { monthGrid, inMonth } from '../../lib/monthgrid'
import { localYMD, addLocalDays } from '../../lib/localDay'
import { useHolidaysEnabled, useSchoolYear, yearPoints, groupByMonth, type YearData, type YearPointKind } from '../../lib/year'
import { Disclosure } from '../Disclosure'
import { EmptyState } from '../EmptyState'
import { Cluster } from '../Layout'
import { type Dict } from './types'
import { type Lang } from '../../i18n'

// « L'année » (A-1, bmad/09) — the board's third glance beside Grille and Mois:
// a HORIZON, not a planner. Twelve mini-months paint only the year's fixed
// points — the derived fêtes (client-side, per-device opt-out), birthdays,
// yearly-recurring events, upkeep cadences, trip bands, and each thing's
// long-jeu replacement day — as calm colour dots; underneath, the same points
// read as month sections (this month open, the rest folded — the diary's
// pattern). Its own cold read (/api/year, D-18 — fetched when the view opens,
// never polled); tapping a mini-month drills into the Mois view at that month.
const KIND_COLOR: Record<YearPointKind | 'trip', string> = {
  fete: '#c9a227', // gold — the fêtes' celebratory tint
  birthday: '#B06A93', // pink — matches the cake rows elsewhere
  event: '#5891AC', // blue — a plain (yearly) rendez-vous
  upkeep: '#88a36f', // sage — the chore/upkeep family colour
  life: '#6b7a8f', // slate — the long-jeu horizon
  trip: '#2a8f85', // teal — the voyage family colour
  ecole: '#D9842A', // marigold — D-17, matches the board's tomorrow-school accent
}

const LEGEND: (YearPointKind | 'trip')[] = ['fete', 'birthday', 'trip', 'event', 'upkeep', 'life', 'ecole']

// Page-local query key: the year read lives only here (queryKeys.ts is for
// cross-page keys). Keyed on the window start so the year rolls at month turn.
export function YearView({
  lang,
  t,
  todayDay,
  onOpenMonth,
}: {
  lang: Lang
  t: Dict
  todayDay: number
  // Tap a mini-month → the Mois view at that month offset (0 = this month).
  onOpenMonth: (offset: number) => void
}) {
  const loc = lang === 'fr' ? 'fr-CA' : 'en-CA'
  const { year: y0, month: m0 } = localYMD(todayDay)
  // A rolling year from the first of THIS month — the horizon ahead, not a
  // calendar-year sheet (in February you care about next January, not last).
  const from = monthGrid(y0, m0).monthStart
  const to = monthGrid(y0, m0 + 12).monthStart
  const holidays = useHolidaysEnabled()
  // D-17: the school-year bounds ride the SAME client-derived pattern as the
  // fêtes (no /api/year import needed) — points added inside yearPoints().
  const schoolYear = useSchoolYear()

  const { data, isLoading } = useQuery({
    queryKey: ['year', from],
    queryFn: () => api<YearData>(`year?from=${from}&to=${to}`),
    staleTime: 5 * 60_000,
  })

  const points = useMemo(
    () => (data ? yearPoints(data, { lang, holidays, from, to, schoolYear }) : []),
    [data, lang, holidays, from, to, schoolYear],
  )
  const trips = data?.trips ?? []

  // One colour per day for the mini-grids: the day's first point wins; trip
  // days fill in around them so a fête inside a trip keeps its own tint.
  const dayColor = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of points) if (!map.has(p.day)) map.set(p.day, p.color ?? KIND_COLOR[p.kind])
    for (const tr of trips) {
      for (let d = Math.max(tr.start_at, from); d <= tr.end_at && d < to; d = addLocalDays(d, 1)) {
        if (!map.has(d)) map.set(d, tr.colour || KIND_COLOR.trip)
      }
    }
    return map
  }, [points, trips, from, to])

  // The readable half: every fixed point (+ each trip at its departure day) as
  // month sections, oldest first — the year ahead in words, not just dots.
  const rows = useMemo(() => {
    const out = points.map((p) => ({
      key: `${p.kind}-${p.day}-${p.label}`,
      day: p.day,
      color: p.color ?? KIND_COLOR[p.kind],
      emoji: p.emoji,
      label: p.label + (p.kind === 'birthday' && p.age != null ? ` · ${t.memo.ageN(p.age)}` : ''),
    }))
    for (const tr of trips) {
      out.push({ key: `trip-${tr.id}`, day: tr.start_at, color: tr.colour || KIND_COLOR.trip, emoji: '🧳', label: tr.title })
    }
    return out.sort((a, b) => a.day - b.day)
  }, [points, trips, t])
  // groupByMonth is newest-first (built for the diary); the horizon reads forward.
  const months = useMemo(() => groupByMonth(rows, (r) => r.day).reverse(), [rows])

  const monthLabel = (sec: number, withYear: boolean) =>
    new Date(sec * 1000).toLocaleDateString(loc, withYear ? { month: 'long', year: 'numeric' } : { month: 'long' })
  const dayLabel = (sec: number) =>
    new Date(sec * 1000).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="yearv">
      {/* Twelve mini-months — the dot texture of the year. Tap one to plan it. */}
      <div className="yearv__months">
        {Array.from({ length: 12 }, (_, i) => {
          const g = monthGrid(y0, m0 + i)
          const label = monthLabel(g.monthStart, i === 0 || g.month === 0)
          return (
            <button
              key={g.monthStart}
              type="button"
              className="yearv__month"
              onClick={() => onOpenMonth(i)}
              aria-label={t.yearView.openMonth(label)}
            >
              <span className="yearv__mtitle mono">{label}</span>
              <span className="yearv__mgrid" aria-hidden="true">
                {g.days.map((d) => {
                  const inM = inMonth(d, g.month)
                  const c = inM ? dayColor.get(d) : undefined
                  return (
                    <span
                      key={d}
                      className={'yearv__cell' + (inM ? '' : ' is-out') + (d === todayDay ? ' is-today' : '')}
                      style={c ? { background: c } : undefined}
                    />
                  )
                })}
              </span>
            </button>
          )
        })}
      </div>

      <Cluster className="yearv__legend" role="group" aria-label={t.yearView.legendLabel}>
        {LEGEND.map((k) => (
          <span key={k} className="yearv__legend-item mono">
            <span className="yearv__dot" style={{ background: KIND_COLOR[k] }} aria-hidden="true" /> {t.yearView.legend[k]}
          </span>
        ))}
      </Cluster>

      {/* The year in words: month sections, this month open, the rest folded. */}
      {isLoading ? null : months.length === 0 ? (
        <EmptyState tone="calm">{t.yearView.empty}</EmptyState>
      ) : (
        <div className="yearv__list">
          {months.map(([monthSec, monthRows], i) => {
            const body = (
              <ul className="yearv__rows">
                {monthRows.map((r) => (
                  <li key={r.key} className="yearv__row">
                    <span className="yearv__dot" style={{ background: r.color }} aria-hidden="true" />
                    <span className="yearv__label">
                      {r.emoji ? `${r.emoji} ` : ''}
                      {r.label}
                    </span>
                    <span className="yearv__date mono">{dayLabel(r.day)}</span>
                  </li>
                ))}
              </ul>
            )
            return i === 0 ? (
              <div key={monthSec}>
                <h3 className="yearv__mhead mono">{monthLabel(monthSec, false)}</h3>
                {body}
              </div>
            ) : (
              <Disclosure key={monthSec} label={monthLabel(monthSec, new Date(monthSec * 1000).getMonth() === 0)}>
                {body}
              </Disclosure>
            )
          })}
        </div>
      )}
    </div>
  )
}
