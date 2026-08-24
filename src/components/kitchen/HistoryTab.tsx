import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang, useT } from '../../i18n'
import { formatDay, formatMonthYear, weekdayShort, dayNum } from '../../lib/format'
import { todayLocalDay } from '../../lib/localDay'
import { useMealPrefs } from '../../lib/mealPrefs'
import { tintInk, faint, hairline } from '../../lib/colors'
import { SLOT_ICON_NAME, type MealSlot } from '../../lib/mealSlots'
import { Icon, InlineIcon } from '../Icon'
import { SectionHeader } from '../SectionHeader'
import { EmptyState } from '../EmptyState'
import { Loading } from '../Fallback'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildDay } from '../detail/adapters'
import { MEAL_HISTORY_KEY, type MealHistoryPage, type MealRow } from './types'

// « Historique » — every planned meal since the household began, newest day at
// the top, grouped by month. A calm, read-only record: the row's tap INFORMS
// (the same day peek the week grid opens), the pencil edits (the same
// /kitchen/day/:date scene — it takes any date, past included). Reuses the week
// grid's whole `.kitchen__day` row family so the past reads exactly like the
// plan, minus the drag/plan affordances.
//
// Cold-path read (like « L'année », D-18): fetched when the tab opens, paged a
// fortnight of planned days at a time (« Voir plus » walks older), never
// polled. Meal writes invalidate ['meal-history'] (mealMutations +
// functions/_lib/realtime PATH_KEYS), so an edit made from the pencil lands
// here on return.

export function HistoryTab({
  members,
}: {
  // For the day peek's "who cooks" line — the board payload's member list the
  // Kitchen page already holds (no extra query).
  members: { id: string; display_name: string }[]
}) {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const detail = useEntityDetail()
  const mealPrefs = useMealPrefs()
  const today = todayLocalDay()

  const historyQ = useInfiniteQuery({
    queryKey: MEAL_HISTORY_KEY,
    queryFn: ({ pageParam }) =>
      api<MealHistoryPage>(pageParam ? `meal-history?before=${pageParam}` : 'meal-history'),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  })

  // Pages → one flat newest-first row list → grouped by day, then by month.
  // Server order is authoritative (newest day first; the household's slot order
  // within a day), so grouping just walks the list in order.
  const months = useMemo(() => {
    const rows = (historyQ.data?.pages ?? []).flatMap((p) => p.days)
    const out: { key: string; label: string; days: { date: number; meals: MealRow[] }[] }[] = []
    for (const m of rows) {
      const d = new Date(m.date * 1000)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      let month = out[out.length - 1]
      if (!month || month.key !== key) {
        const label = formatMonthYear(m.date, lang)
        month = { key, label: label.charAt(0).toUpperCase() + label.slice(1), days: [] }
        out.push(month)
      }
      let day = month.days[month.days.length - 1]
      if (!day || day.date !== m.date) {
        day = { date: m.date, meals: [] }
        month.days.push(day)
      }
      day.meals.push(m)
    }
    return out
  }, [historyQ.data, lang])

  // The same informative day peek the week grid opens — built from the rows on
  // hand (past day-notes aren't loaded; the peek just shows the meals).
  const openDayPeek = (date: number, meals: MealRow[]) => {
    const nameById = (id: string | null) => (id ? members.find((mb) => mb.id === id)?.display_name ?? null : null)
    const label = formatDay(date, lang).replace(/^./, (c) => c.toUpperCase())
    detail.open(
      buildDay(
        { t, lang, members: [] },
        {
          label,
          accent: mealPrefs.color(mealPrefs.hero),
          meals: meals.map((m) => ({
            slot: t.kitchen.slots[m.slot as MealSlot] ?? m.slot,
            title: m.title,
            cook: nameById(m.cook_member_id),
          })),
        },
      ),
    )
  }

  if (historyQ.isLoading) return <Loading />

  if (months.length === 0)
    return (
      <EmptyState tone="calm" guide={{ card: 'kitchen', point: 10 }}>
        {t.kitchen.historyEmpty}
      </EmptyState>
    )

  return (
    <section className="kitchen__history">
      {months.map((month) => (
        <div key={month.key}>
          <SectionHeader title={month.label} />
          <ul className="kitchen__week">
            {month.days.map(({ date, meals }) => {
              const dow = new Date(date * 1000).getDay()
              const isToday = date === today
              return (
                <li
                  key={date}
                  className={
                    'surface kitchen__day' + (isToday ? ' is-today' : '') + (dow === 0 || dow === 6 ? ' is-weekend' : '')
                  }
                >
                  <span className="kitchen__day-date" aria-label={formatDay(date, lang)}>
                    {isToday && <span className="kitchen__day-rel mono">{t.kitchen.todayShort}</span>}
                    <span className="kitchen__day-dow mono" aria-hidden="true">{weekdayShort(date, lang)}</span>
                    <span className="kitchen__day-num" aria-hidden="true">{dayNum(date, lang)}</span>
                  </span>
                  <div className="kitchen__day-body">
                    <div className="kitchen__day-top">
                      {/* Tap informs (the day peek), the pencil edits — the week
                          grid's rule, kept identical here. */}
                      <span
                        className="kitchen__day-sum-main kitchen__day-sum-tap"
                        onClick={() => openDayPeek(date, meals)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openDayPeek(date, meals)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${t.detail.openDay} · ${formatDay(date, lang)}`}
                      >
                        <span className="kitchen__day-slots">
                          {meals.map((m) => {
                            const c = mealPrefs.color(m.slot as MealSlot) ?? 'var(--terracotta-deep)'
                            return (
                              <span
                                key={m.id}
                                className="meal-chip"
                                style={{ color: tintInk(c), background: faint(c), borderColor: hairline(c) }}
                              >
                                <InlineIcon name={SLOT_ICON_NAME[m.slot as MealSlot] ?? 'bowl-food-bold'} /> {m.title}
                                {m.is_leftover ? (
                                  <InlineIcon name="arrow-counter-clockwise-bold" size={12} />
                                ) : null}
                              </span>
                            )
                          })}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="kitchen__day-manage"
                        onClick={() => nav(`/kitchen/day/${date}`)}
                        aria-label={`${t.kitchen.manage} · ${formatDay(date, lang)}`}
                        title={`${t.kitchen.manage} · ${formatDay(date, lang)}`}
                      >
                        <Icon name="pencil-simple-bold" size={16} />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {historyQ.hasNextPage ? (
        <button
          type="button"
          className="btn btn--ghost mono kitchen__history-more"
          onClick={() => historyQ.fetchNextPage()}
          disabled={historyQ.isFetchingNextPage}
        >
          {historyQ.isFetchingNextPage ? '…' : t.kitchen.historyMore}
        </button>
      ) : (
        <EmptyState>{t.kitchen.historyEnd}</EmptyState>
      )}
    </section>
  )
}
