import { useT, useLang } from '../../i18n'
import { CATS } from '../../lib/cats'
import { formatDayMaybeYear, formatTime } from '../../lib/format'
import { SLOT_ICON_NAME, isMealSlot, slotLabel } from '../../lib/mealSlots'
import { type Member } from '../../lib/members'
import { type DayItems, type MonthEvent, type MonthMeal } from '../../lib/useDayWindow'
import { type DetailModel } from '../../lib/detail'
import { useTagColors } from '../../lib/queryHooks'
import { Act } from './Act'
import { DayNote } from './DayNote'
import { TodoSection } from '../todos/TodoSection'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildEvent, buildMeal, type DetailCtx } from '../detail/adapters'
import { useRecipeForMeal } from '../kitchen/mealLookup'
import { type EventRow } from './types'

// DaySection — THE one rendering of "a day's agenda": meals → events → chores → home
// upkeep as the shared `Act` rows, each tapping into the same entity-detail peek the
// board uses, with (optionally) that day's « À compléter » checklist and fridge note.
// It reads a `DayItems` slice from `useDayWindow` (one `/api/month` window), so every
// surface that shows a day (Moments, Mois, « Avant de partir », « La journée ») renders
// it identically instead of hand-rolling the rows. Adapters absorb the /api/month data
// shapes (event `at` not `start_at`; chore `who` is a name).
export function DaySection({
  day,
  items,
  members,
  eveningOnly = false,
  showTodos = false,
  todosTitle,
  todosHideWhenEmpty = false,
  showNote = false,
}: {
  day: number // local-midnight unix sec
  items: DayItems
  members: Member[]
  // « Ce soir » trim: supper-only meals + still-to-come / all-day / birthday / work events.
  eveningOnly?: boolean
  showTodos?: boolean
  todosTitle?: string
  todosHideWhenEmpty?: boolean
  showNote?: boolean
}) {
  const t = useT()
  const { lang } = useLang()
  const detail = useEntityDetail()
  const recipeFor = useRecipeForMeal()
  const tagColors = useTagColors()
  const detailCtx: DetailCtx = { t, lang, members, recipeFor, tagColors }
  const memberName = (id: string | null | undefined) => (id && members.find((m) => m.id === id)?.display_name) || undefined
  const nowSec = Math.floor(Date.now() / 1000)

  // Tapping a row opens the same detail peek the board uses. Meals map straight onto
  // buildMeal; an event is reshaped to the board EventRow buildEvent expects; a
  // chore/home row carries only a resolved name, so it gets a small inline model.
  const openMeal = (m: MonthMeal) => detail.open(buildMeal(m, detailCtx, { slotLabel: slotLabel(m.slot, t), daySec: day }))
  const openEvent = (e: MonthEvent) => {
    const row: EventRow = {
      id: e.id,
      title: e.work ? e.title || t.auto.work : e.title,
      start_at: e.at,
      all_day: e.all_day,
      member_id: e.member_id,
      contact_name: e.contact_name ?? null,
      business_name: e.business_name ?? null,
      business_colour: e.business_colour ?? null,
      business_id: e.business_name ? e.id : null, // presence flag → bizColour applies
      birthday: e.birthday,
      age: e.age ?? null,
      gift_ideas: null,
    }
    detail.open(buildEvent(row, detailCtx))
  }
  const openChore = (title: string, color: string | null, who?: string | null) =>
    detail.open({
      kind: 'chore',
      title,
      icon: CATS.chore.icon,
      accent: color ?? CATS.chore.color,
      when: formatDayMaybeYear(day, lang),
      who: who ? { role: t.detail.turn, name: who } : null,
      actions: [{ key: 'day', label: t.detail.openDay, icon: 'calendar-blank-bold', href: `/kitchen/day/${day}` }],
    } as DetailModel)

  const meals = items.meals.filter((m) => !eveningOnly || m.slot === 'supper')
  const events = items.events
    .filter((e) => !eveningOnly || e.all_day || e.birthday || e.work || e.at >= nowSec)
    .sort((a, b) => a.at - b.at)

  return (
    <>
      {meals.map((m) => (
        <Act
          key={'m' + m.id}
          cat="meal"
          icon={isMealSlot(m.slot) ? SLOT_ICON_NAME[m.slot] : undefined}
          title={m.title}
          when={slotLabel(m.slot, t)}
          who={memberName(m.cook_member_id)}
          onOpen={() => openMeal(m)}
        />
      ))}
      {events.map((e) => (
        <Act
          key={'e' + e.id}
          cat={e.work ? 'work' : e.birthday ? 'birthday' : 'event'}
          title={e.work ? e.title || t.auto.work : e.title}
          when={
            e.work
              ? t.auto.range(formatTime(e.at, lang), e.end != null ? formatTime(e.end, lang) : '')
              : e.birthday
                ? e.age != null
                  ? t.cercle.turnsN(e.age)
                  : t.board.birthday
                : e.all_day
                  ? t.board.allDay
                  : formatTime(e.at, lang)
          }
          who={e.work ? memberName(e.member_id) : (e.business_name ?? e.contact_name ?? memberName(e.member_id))}
          color={e.work ? (e.color ?? undefined) : (e.business_colour ?? undefined)}
          onOpen={() => openEvent(e)}
        />
      ))}
      {items.chores.map((c) => (
        <Act key={'c' + c.id} cat="chore" title={c.title} who={c.who || undefined} color={c.color || undefined} onOpen={() => openChore(c.title, c.color, c.who)} />
      ))}
      {items.home.map((h) => (
        <Act key={'h' + h.id} cat="chore" title={h.title} color={h.color || undefined} onOpen={() => openChore(h.title, h.color)} />
      ))}
      {showTodos && <TodoSection day={day} title={todosTitle ?? t.todos.title} members={members} bento={false} hideWhenEmpty={todosHideWhenEmpty} />}
      {showNote && items.note && <DayNote note={items.note} members={members} label={t.board.dayNote} />}
    </>
  )
}
