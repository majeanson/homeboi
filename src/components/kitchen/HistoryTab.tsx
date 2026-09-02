import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang, useT } from '../../i18n'
import { isGuest } from '../../lib/device'
import { formatDay, formatMonthYear, weekdayShort, dayNum } from '../../lib/format'
import { todayLocalDay } from '../../lib/localDay'
import { useMealPrefs } from '../../lib/mealPrefs'
import { tintInk, faint, hairline } from '../../lib/colors'
import { SLOT_ICON_NAME, type MealSlot } from '../../lib/mealSlots'
import { Icon, InlineIcon } from '../Icon'
import { SectionHeader } from '../SectionHeader'
import { EmptyState } from '../EmptyState'
import { Loading, LoadError } from '../Fallback'
import { useSingleOpen } from '../Disclosure'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildDay } from '../detail/adapters'
import { MealPlanPicker } from './MealPlanPicker'
import { usePlanIdea } from './MealIdeas'
import { MEAL_HISTORY_KEY, type MealHistoryPage, type MealRow } from './types'

// « Historique » — every planned meal since the household began, newest day at
// the top, grouped by month. Reuses the week grid's whole `.kitchen__day` row
// family so the past reads exactly like the plan, minus the drag affordances.
// Three doors per row, echoing the grid's "tap informs, pencil edits" rule:
//   · the DATE BADGE opens the informative day peek (who cooked, the whole day),
//   · a MEAL CHIP is « Encore ? » — it reveals the shared MealPlanPicker and puts
//     that dish (recipe link included) back onto an upcoming day, the same
//     reusable plan flow every IdeasDrawer source uses (usePlanIdea),
//   · the PENCIL edits (the /kitchen/day/:date scene takes any date, past too).
//
// Cold-path read (like « L'année », D-18): fetched when the tab opens, paged a
// fortnight of planned days at a time (« Voir plus » walks older), never
// polled. Meal writes invalidate ['meal-history'] (mealMutations +
// functions/_lib/realtime PATH_KEYS), so an edit made from the pencil lands
// here on return.

export function HistoryTab({
  members,
  week,
}: {
  // For the day peek's "who cooks" line — the board payload's member list the
  // Kitchen page already holds (no extra query).
  members: { id: string; display_name: string }[]
  // The upcoming countdown window « Encore ? » plans onto — the same labeled
  // days the grid and the IdeasDrawer use (useWeekLabeled in Kitchen).
  week: { date: number; label: string }[]
}) {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const detail = useEntityDetail()
  const mealPrefs = useMealPrefs()
  const today = todayLocalDay()
  const ro = isGuest()

  const historyQ = useInfiniteQuery({
    queryKey: MEAL_HISTORY_KEY,
    queryFn: ({ pageParam }) =>
      api<MealHistoryPage>(pageParam ? `meal-history?before=${pageParam}` : 'meal-history'),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  })

  // « Encore ? » — one open picker at a time across the whole tab (calm), keyed
  // by the meal row id. Planning reuses the drawer's reusable plan flow: the
  // dish (title + its recipe link) lands on the picked upcoming day + slot.
  const { isOpen, toggle, close } = useSingleOpen()
  const planIdea = usePlanIdea()
  // null = "not picked yet" → follow the household's hero meal (Réglages ▸ Repas).
  const heroSlot = mealPrefs.hero
  const [planSlotPick, setPlanSlot] = useState<MealSlot | null>(null)
  const planSlot = planSlotPick ?? heroSlot

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
  // A failed read is NOT an empty history: without this, a household with years of
  // suppers is told « Aucun repas passé » AND « Le tout début de vos repas » (the
  // exhausted-pages foot), with nothing to retry. Same split every other cold-path
  // surface makes (Notes/Maison: error && !data → LoadError).
  if (historyQ.error && !historyQ.data) return <LoadError />

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
              const openMeal = meals.find((m) => isOpen(m.id))
              return (
                <li
                  key={date}
                  className={
                    'surface kitchen__day' + (isToday ? ' is-today' : '') + (dow === 0 || dow === 6 ? ' is-weekend' : '')
                  }
                >
                  {/* The date badge IS the peek door here (the chips took the
                      "tap the meal" gesture for « Encore ? »). */}
                  <button
                    type="button"
                    className="kitchen__day-date kitchen__day-datebtn"
                    onClick={() => openDayPeek(date, meals)}
                    aria-label={`${t.detail.openDay} · ${formatDay(date, lang)}`}
                    title={`${t.detail.openDay} · ${formatDay(date, lang)}`}
                  >
                    {isToday && <span className="kitchen__day-rel mono">{t.kitchen.todayShort}</span>}
                    <span className="kitchen__day-dow mono" aria-hidden="true">{weekdayShort(date, lang)}</span>
                    <span className="kitchen__day-num" aria-hidden="true">{dayNum(date, lang)}</span>
                  </button>
                  <div className="kitchen__day-body">
                    <div className="kitchen__day-top">
                      <div className="kitchen__day-sum-main">
                        <span className="kitchen__day-slots">
                          {meals.map((m) => {
                            const c = mealPrefs.color(m.slot as MealSlot) ?? 'var(--terracotta-deep)'
                            const inner = (
                              <>
                                <InlineIcon name={SLOT_ICON_NAME[m.slot as MealSlot] ?? 'bowl-food-bold'} /> {m.title}
                                {m.is_leftover ? (
                                  <InlineIcon name="arrow-counter-clockwise-bold" size={12} />
                                ) : null}
                              </>
                            )
                            const tint = { color: tintInk(c), background: faint(c), borderColor: hairline(c) }
                            // « Encore ? » — the chip reveals the plan picker; a
                            // read-only guest keeps the plain display chip.
                            return ro ? (
                              <span key={m.id} className="meal-chip" style={tint}>
                                {inner}
                              </span>
                            ) : (
                              <button
                                key={m.id}
                                type="button"
                                className="meal-chip kitchen__hist-chip"
                                style={tint}
                                onClick={() => toggle(m.id)}
                                aria-expanded={isOpen(m.id)}
                                title={`${t.kitchen.planAgain} · ${m.title}`}
                              >
                                {inner}
                                <InlineIcon name="caret-down-bold" size={10} />
                              </button>
                            )
                          })}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="kitchen__day-manage"
                        onClick={() => nav(`/kitchen/day/${date}?vue=repas`)}
                        aria-label={`${t.kitchen.manage} · ${formatDay(date, lang)}`}
                        title={`${t.kitchen.manage} · ${formatDay(date, lang)}`}
                      >
                        <Icon name="pencil-simple-bold" size={16} />
                      </button>
                    </div>
                    {openMeal && (
                      <MealPlanPicker
                        slot={planSlot}
                        onSlot={setPlanSlot}
                        week={week}
                        onPickDay={(pickDate) => {
                          close()
                          planIdea({ title: openMeal.title, recipe_id: openMeal.recipe_id ?? null }, pickDate, planSlot)
                        }}
                      />
                    )}
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
