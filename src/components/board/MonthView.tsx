import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { CATS } from '../../lib/cats'
import { formatTime, formatMonthYear, formatDayLong, weekdayShort } from '../../lib/format'
import { monthGrid, inMonth } from '../../lib/monthgrid'
import { localYMD } from '../../lib/localDay'
import { SLOT_ICON_NAME, isMealSlot, type MealSlot } from '../../lib/mealSlots'
import { useMealPrefs, type MealPrefs } from '../../lib/mealPrefs'
import { type Lang } from '../../i18n'
import { Icon } from '../Icon'
import { Act } from './Act'
import { DayNote } from './DayNote'
import { colorOf, nameOf, type Dict, type Member } from './types'

const DAY = 86400

// The /api/month payload: every dated thing, already bucketed onto a UTC `day`
// key by the server. Mirrors the families on the bento board so the calendar is a
// faithful "is it all here?" inventory — events, meals, recurring chores, notes.
interface MEvent { id: string; title: string; at: number; all_day: number; member_id: string | null; day: number }
interface MMeal { id: string; slot: string; title: string; cook_member_id: string | null; day: number; position?: number }
interface MChore { id: string; title: string; color: string | null; who: string | null; day: number }
interface MNote { id: string; text: string; member_id: string | null; day: number }
export interface MonthData { events: MEvent[]; meals: MMeal[]; chores: MChore[]; dayNotes: MNote[] }

interface DayBucket { events: MEvent[]; meals: MMeal[]; chores: MChore[]; notes: MNote[] }

// Intl gives a lowercase French month/weekday ("juin", "lun") — calendars want it
// capitalized.
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// A calendar marker: a colour AND a category, so the cell can tell each kind
// apart instead of a wall of identical circles. Events/chores/notes are shape-coded
// dots (circle · diamond · ring); a MEAL shows its slot ICON (egg/fork/cookie/bowl,
// reusing Réglages ▸ Repas) tinted with the slot colour — far more glanceable than
// a square and it carries which meal. Colour still carries who (events) / slot
// (meals) / chore tint.
type DotKind = 'event' | 'meal' | 'chore' | 'note'
interface Dot {
  color: string
  kind: DotKind
  slot?: MealSlot // set for meals → which slot icon to draw
}

// The markers a cell shows: one per dated thing, ordered the same way the detail
// panel lists them (events first, by member colour, then meals, chores, notes).
function dotsFor(b: DayBucket | undefined, members: Member[], meals: MealPrefs): Dot[] {
  if (!b) return []
  const out: Dot[] = []
  for (const e of b.events) out.push({ color: colorOf(members, e.member_id) ?? CATS.event.color, kind: 'event' })
  // Each shown meal gets its slot colour + icon (Réglages ▸ Repas); hidden slots = no marker.
  for (const m of b.meals)
    if (meals.isVisible(m.slot))
      out.push({ color: meals.color(m.slot) ?? CATS.meal.color, kind: 'meal', slot: isMealSlot(m.slot) ? m.slot : undefined })
  for (const c of b.chores) out.push({ color: c.color ?? CATS.chore.color, kind: 'chore' })
  b.notes.forEach(() => out.push({ color: CATS.list.color, kind: 'note' }))
  return out
}

// "Mois" — the fourth board take (after bento · next · lanes): a calm six-week
// calendar of EVERYTHING dated, so a glance answers "what's the month look like?"
// Cells carry colour dots; tapping a day opens its full list below. Its own slow
// read (not the live board poll): browsing the month isn't the glance surface.
export function MonthView({
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
  const nav = useNavigate()
  // Which month is shown, as an offset (in months) from the real current one.
  // Selected day drives the detail panel; it opens on today.
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState(todayDay)

  const grid = useMemo(() => {
    const { year, month } = localYMD(todayDay)
    return monthGrid(year, month + offset)
  }, [todayDay, offset])
  const from = grid.days[0]
  const to = grid.days[grid.days.length - 1] + DAY

  const { data, isLoading } = useQuery({
    queryKey: ['month', from],
    queryFn: () => api<MonthData>(`month?from=${from}&to=${to}`),
    staleTime: 30_000,
  })

  // One pass to bucket everything by day. The cell dots and the detail panel both
  // read this map, so a thing can never show as a dot but go missing in the list.
  const byDay = useMemo(() => {
    const m = new Map<number, DayBucket>()
    const at = (d: number) => {
      let b = m.get(d)
      if (!b) {
        b = { events: [], meals: [], chores: [], notes: [] }
        m.set(d, b)
      }
      return b
    }
    for (const e of data?.events ?? []) at(e.day).events.push(e)
    for (const x of data?.meals ?? []) at(x.day).meals.push(x)
    for (const c of data?.chores ?? []) at(c.day).chores.push(c)
    for (const n of data?.dayNotes ?? []) at(n.day).notes.push(n)
    return m
  }, [data])

  const mealPrefs = useMealPrefs()
  const slotLabel = (slot: string) => t.kitchen.slots[slot as keyof typeof t.kitchen.slots] ?? slot
  const cookLine = (id: string | null) => {
    const who = nameOf(members, id)
    return who ? `${who} ${t.board.cooks}` : undefined
  }

  const sel = byDay.get(selected)
  // Hidden meal slots (Réglages ▸ Repas) drop out of the day's detail list + count.
  const selMeals = sel ? sel.meals.filter((m) => mealPrefs.isVisible(m.slot)) : []
  const selCount = sel ? sel.events.length + selMeals.length + sel.chores.length + sel.notes.length : 0
  const atToday = offset === 0 && selected === todayDay
  // Grid keys are LOCAL midnights now (monthgrid.ts), so labels render in local
  // time — the household's wall month/weekday, no UTC flag.
  const title = cap(formatMonthYear(grid.monthStart, lang))

  return (
    <div className="monthv">
      <div className="monthv__head">
        <button type="button" className="monthv__nav" onClick={() => setOffset((o) => o - 1)} aria-label={t.monthView.prev}>
          <Icon name="caret-left-bold" size={20} />
        </button>
        <h2 className="monthv__title">{title}</h2>
        <button type="button" className="monthv__nav" onClick={() => setOffset((o) => o + 1)} aria-label={t.monthView.next}>
          <Icon name="caret-right-bold" size={20} />
        </button>
        {!atToday && (
          <button
            type="button"
            className="monthv__today"
            onClick={() => {
              setOffset(0)
              setSelected(todayDay)
            }}
          >
            {t.monthView.today}
          </button>
        )}
      </div>

      <div className="monthv__grid" role="grid" aria-label={title}>
        {grid.days.slice(0, 7).map((d) => (
          <div key={`h${d}`} className="monthv__dow mono" role="columnheader">
            {cap(weekdayShort(d, lang))}
          </div>
        ))}
        {grid.days.map((d) => {
          const b = byDay.get(d)
          const dots = dotsFor(b, members, mealPrefs)
          const cls =
            'monthv__cell' +
            (inMonth(d, grid.month) ? '' : ' is-out') +
            (d === todayDay ? ' is-today' : '') +
            (d === selected ? ' is-on' : '')
          return (
            <button key={d} type="button" role="gridcell" aria-selected={d === selected} className={cls} onClick={() => setSelected(d)}>
              <span className="monthv__num">{localYMD(d).day}</span>
              {dots.length > 0 && (
                <span className="monthv__dots" aria-hidden="true">
                  {dots.slice(0, 4).map((dot, i) =>
                    dot.kind === 'meal' && dot.slot ? (
                      // Meal → its slot icon, tinted with the slot colour (Réglages ▸ Repas).
                      <span key={i} className="monthv__dot-icon">
                        <Icon name={SLOT_ICON_NAME[dot.slot]} size={12} color={dot.color} />
                      </span>
                    ) : (
                      <span
                        key={i}
                        className={`monthv__dot monthv__dot--${dot.kind}`}
                        // A ring (note) is drawn from `color`; filled shapes from `background`.
                        style={dot.kind === 'note' ? { color: dot.color } : { background: dot.color }}
                      />
                    ),
                  )}
                  {dots.length > 4 && <span className="monthv__more mono">+{dots.length - 4}</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Shape key: the dots are shape-coded, so a small legend tells a glance which
          shape is a chore vs a meal vs an event. Neutral swatches — it's about the
          SHAPE here, not the colour (colour carries who/which-slot in the cells). */}
      <div className="monthv__legend" aria-hidden="true">
        <span className="monthv__legend-item">
          <span className="monthv__dot monthv__dot--event" style={{ background: 'var(--ink-soft)' }} /> {t.monthView.legendEvents}
        </span>
        <span className="monthv__legend-item">
          <span className="monthv__dot-icon">
            <Icon name={SLOT_ICON_NAME.supper} size={12} color="var(--ink-soft)" />
          </span>{' '}
          {t.monthView.legendMeals}
        </span>
        <span className="monthv__legend-item">
          <span className="monthv__dot monthv__dot--chore" style={{ background: 'var(--ink-soft)' }} /> {t.monthView.legendChores}
        </span>
        <span className="monthv__legend-item">
          <span className="monthv__dot monthv__dot--note" style={{ color: 'var(--ink-soft)' }} /> {t.monthView.legendNotes}
        </span>
      </div>

      <div className="monthv__day">
        <div className="monthv__day-h">
          <b>{cap(formatDayLong(selected, lang))}</b>
          {/* Open the full day page (meals, note, events, chores) for the selected
              date — the calendar's way into planning any day, not just today. */}
          <button
            type="button"
            className="btn btn--ghost btn--sm mono monthv__open-day"
            onClick={() => nav(`/kitchen/day/${selected}`)}
          >
            {t.monthView.openDay} <Icon name="caret-right-bold" size={14} />
          </button>
        </div>
        {isLoading && !data ? (
          <p className="loading mono">{t.common.loading}</p>
        ) : selCount === 0 ? (
          <p className="feed-empty">{t.monthView.empty}</p>
        ) : (
          <>
            {/* Same order, same cards as the bento day: meals, then events, then
                chores, then the day note — so nothing dated is represented here
                differently than on the day view. */}
            {selMeals.map((m) => (
              <Act
                key={m.id}
                cat="meal"
                icon={SLOT_ICON_NAME[m.slot as MealSlot]}
                title={`${slotLabel(m.slot)} · ${m.title}`}
                who={cookLine(m.cook_member_id)}
                color={mealPrefs.color(m.slot)}
              />
            ))}
            {sel!.events.map((e) => (
              <Act
                key={e.id}
                cat="event"
                title={e.title}
                when={e.all_day ? t.board.allDay : formatTime(e.at, lang)}
                who={nameOf(members, e.member_id) ?? undefined}
                color={colorOf(members, e.member_id) ?? undefined}
              />
            ))}
            {sel!.chores.map((c) => (
              <Act key={c.id} cat="chore" title={c.title} who={c.who ?? undefined} color={c.color ?? undefined} />
            ))}
            {sel!.notes.map((n) => (
              <DayNote key={n.id} note={n} members={members} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
