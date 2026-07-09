import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, isUnauthorized } from '../../lib/api'
import { useLang, useT } from '../../i18n'
import { useAudience } from '../../lib/audience'
import { useSpeak } from '../../lib/speak'
import { moonPhase } from '../../lib/moonPhase'
import { live } from '../../lib/query'
import { formatDayLong, formatDayMaybeYear, formatTime, capitalize } from '../../lib/format'
import { addLocalDays, todayLocalDay, localDayStart, localYMD } from '../../lib/localDay'
import { CATS } from '../../lib/cats'
import { PairPrompt } from '../Fallback'
import { Icon } from '../Icon'
import { SubTabs } from '../SubTabs'
import { EmptyState } from '../EmptyState'
import { Act, Section } from './Act'
import { TodoSection } from '../todos/TodoSection'
import { SLOT_ICON_NAME, isMealSlot, slotLabel } from '../../lib/mealSlots'
import { useMealPrefs } from '../../lib/mealPrefs'
import { MONTH_KEY } from '../../lib/queryKeys'
import { useBoardData } from '../../lib/queryHooks'
import { useRecipeForMeal } from '../kitchen/mealLookup'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildEvent, type DetailCtx } from '../detail/adapters'
import { useOpenMeal } from '../detail/useOpenMeal'
import { useEventPeekActions } from '../detail/EventPeekActions'
import { isGuest } from '../../lib/device'
import type { EventRow } from './types'
import type { DetailModel } from '../../lib/detail'

// « Moments » — a read-only glance at everything happening in a chosen time
// WINDOW (tonight / tomorrow / a picked date / this week), so the nightly "what
// does tomorrow look like" scan lives in one place instead of scattered across the
// board's agenda, supper hero, chores and L'auto. It composes nothing new: it
// reads the SAME /api/month window the calendar + day page already use (events +
// meals + recurring chores + home projects, DST-safe, expanded server-side), and
// renders it with the board's own Act/Section primitives. Each day's « À
// compléter » checklist (the shared TodoSection) rides INSIDE the day too, so the
// recap doubles as the quick-handoff surface (drop a ready list, tick it off).
//
// Used in TWO places off ONE component: as the **board's fifth view** (the
// Aujourd'hui view switcher — the always-available daytime home) and as the
// standalone **/moment scene** (deep-linkable, the evening board nudge). `urlSync`
// mirrors the scope into ?scope= (scene only); the board view keeps it local.
export type MomentScope = 'tonight' | 'tomorrow' | 'date' | 'week'
const SCOPES: MomentScope[] = ['tonight', 'tomorrow', 'date', 'week']

// The slice of /api/month this view renders (mirrors month.ts's payload).
interface MomentData {
  events: {
    id: string
    title: string
    at: number
    all_day: number
    member_id: string | null
    contact_name?: string | null
    business_name?: string | null
    business_colour?: string | null
    birthday?: boolean
    age?: number | null
    work?: boolean
    end?: number
    color?: string | null
    day: number
  }[]
  meals: { id: string; slot: string; title: string; cook_member_id: string | null; day: number; is_leftover?: number }[]
  chores: { id: string; title: string; color: string | null; who: string | null; day: number }[]
  homeProjects?: { id: string; kind: string; title: string; color: string | null; day: number }[]
  // Dated, still-open « À compléter » todos — used here only to decide which days
  // are worth showing in the week recap; the interactive rows come from the shared
  // TodoSection (its own per-day cache).
  todos?: { id: string; title: string; member_id: string | null; day: number; section: string | null }[]
}

// Intl lowercases the French weekday; day labels want it capitalized (matches
// DayPlanPage).
const ymdInput = (daySec: number) => {
  const { year, month, day } = localYMD(daySec)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function MomentsView({
  urlSync = false,
  defaultScope = 'tomorrow',
}: {
  // Mirror the scope into the ?scope= URL param. The /moment scene passes true so
  // the dusk board card can deep-link a preset; the in-board view keeps it false
  // (it lives on /board, which shouldn't grow a ?scope query).
  urlSync?: boolean
  defaultScope?: MomentScope
}) {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  // « Ce soir » trims the day to the HERO meal (Réglages ▸ Repas), not always the souper.
  const heroSlot = useMealPrefs().hero

  const [params, setParams] = useSearchParams()
  const fromParam = params.get('scope')
  const dateParam = params.get('date')
  const [scope, setScope] = useState<MomentScope>(() =>
    urlSync && SCOPES.includes(fromParam as MomentScope) ? (fromParam as MomentScope) : defaultScope,
  )
  const today = todayLocalDay()
  // A deep link from the calendar (/moment?scope=date&date=<local-midnight>) pre-selects
  // that day; a junk param falls back to today. So « voir ce moment » on a calendar day
  // lands straight on that date's recap + handoff list.
  const [pickDate, setPickDate] = useState<number>(() => {
    if (urlSync && dateParam) {
      const d = Number(dateParam)
      if (Number.isFinite(d) && d > 0) return d
    }
    return today
  })

  // Resolve the scope → a [from, to) LOCAL-midnight window.
  let from: number
  let to: number
  if (scope === 'tonight') {
    from = today
    to = addLocalDays(today, 1)
  } else if (scope === 'tomorrow') {
    from = addLocalDays(today, 1)
    to = addLocalDays(today, 2)
  } else if (scope === 'week') {
    from = today
    to = addLocalDays(today, 7)
  } else {
    from = pickDate
    to = addLocalDays(pickDate, 1)
  }

  // One narrow /api/month window — keyed by [from, to] so a return from the day
  // page (which invalidates ['month']) refetches. Polled like every glance.
  const q = useQuery({
    queryKey: [...MONTH_KEY, from, to],
    queryFn: () => api<MomentData>(`month?from=${from}&to=${to}`),
    ...live,
  })
  // Member faces (cook on a meal, who on an event) — the board payload already
  // carries them; reuse its shared cache (same ['board'] key) rather than a second
  // read. The full Member shape also feeds the detail peek's <Avatar>.
  const boardQ = useBoardData()
  const formMembers = boardQ.data?.members ?? []
  const memberName = (id: string | null | undefined) =>
    (id && formMembers.find((m) => m.id === id)?.display_name) || undefined

  // Tap a row → the shared entity-detail peek, exactly like the board's own rows.
  // The provider is HubLayout's for the in-board view and MomentScene's for the
  // standalone /moment scene. recipeFor sends a recipe-linked meal to its view.
  const detail = useEntityDetail()
  const recipeFor = useRecipeForMeal()
  const detailCtx: DetailCtx = { t, lang, members: formMembers, recipeFor }
  const openMeal = useOpenMeal(detailCtx)
  // Modify / Delete / Share on an event peek (gating + modals owned by the hook).
  const eventActions = useEventPeekActions()

  // « Avant de partir » — open the same calm "before you go" SCREEN the board's
  // quick-add ＋ tile opens (/board/departure): the household's real « À compléter »
  // list + today's events + the weather dressing tip. It does NOT write todos (the
  // old confirm-and-POST behaviour polluted the day's list) — it's a navigate-only
  // handoff, exactly like clicking the ＋ « Avant de partir » tile. Hidden for a
  // read-only guest.
  const canDeparture = !isGuest()

  if (isUnauthorized(q.error)) return <PairPrompt />

  const data = q.data
  const events = data?.events ?? []
  const meals = data?.meals ?? []
  const chores = data?.chores ?? []
  const home = data?.homeProjects ?? []
  const todos = data?.todos ?? []
  const single = scope !== 'week'
  const isTonight = scope === 'tonight'
  const nowSec = Math.floor(Date.now() / 1000)

  const days: number[] = []
  for (let d = from; d < to; d = addLocalDays(d, 1)) days.push(d)

  // Tapping a row behaves exactly as it does on the board. A meal with a recipe goes
  // straight to that recipe (useOpenMeal); an event is reshaped to the board EventRow
  // buildEvent expects; a chore/home row only carries a resolved name here, so it gets
  // a small inline model (title + day + whose turn + "open the day").
  const openMealRow = (m: MomentData['meals'][number]) => openMeal(m, { slotLabel: slotLabel(m.slot, t), daySec: m.day })
  const openEvent = (e: MomentData['events'][number]) => {
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
    detail.open(buildEvent(row, detailCtx, eventActions.optsFor({ id: row.id, title: row.title, birthday: row.birthday })))
  }
  const openChore = (title: string, color: string | null, day: number, who?: string | null) => {
    const model: DetailModel = {
      kind: 'chore',
      title,
      icon: CATS.chore.icon,
      accent: color ?? CATS.chore.color,
      when: formatDayMaybeYear(day, lang),
      who: who ? { role: t.detail.turn, name: who } : null,
      actions: [{ key: 'day', label: t.detail.openDay, icon: 'calendar-blank-bold', href: `/kitchen/day/${day}` }],
    }
    detail.open(model)
  }

  // One day's agenda rows, in reading order: meals (by the month query's slot
  // order — the household's), then events (by time), then chores + home upkeep.
  // « Ce soir » trims the day to its evening tail — the hero meal + still-to-come events.
  function dayRows(d: number): React.ReactNode[] {
    const rows: React.ReactNode[] = []
    for (const m of meals.filter((m) => m.day === d && (!isTonight || m.slot === heroSlot))) {
      rows.push(
        <Act
          key={'m' + m.id}
          cat="meal"
          icon={isMealSlot(m.slot) ? SLOT_ICON_NAME[m.slot] : undefined}
          title={m.title}
          when={slotLabel(m.slot, t)}
          who={memberName(m.cook_member_id)}
          onOpen={() => openMealRow(m)}
        />,
      )
    }
    const dayEvents = events
      .filter((e) => e.day === d && (!isTonight || e.all_day || e.birthday || e.work || e.at >= nowSec))
      .sort((a, b) => a.at - b.at)
    for (const e of dayEvents) {
      rows.push(
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
        />,
      )
    }
    for (const c of chores.filter((c) => c.day === d)) {
      rows.push(
        <Act
          key={'c' + c.id}
          cat="chore"
          title={c.title}
          who={c.who || undefined}
          color={c.color || undefined}
          onOpen={() => openChore(c.title, c.color, c.day, c.who)}
        />,
      )
    }
    for (const h of home.filter((h) => h.day === d)) {
      rows.push(
        <Act
          key={'h' + h.id}
          cat="chore"
          title={h.title}
          color={h.color || undefined}
          onOpen={() => openChore(h.title, h.color, h.day)}
        />,
      )
    }
    return rows
  }

  const openDayBtn = (d: number) => (
    <button type="button" className="btn btn--ghost mono day-plan__add" onClick={() => nav(`/kitchen/day/${d}`)}>
      <Icon name="caret-right-bold" size={16} /> {t.monthView.openDay}
    </button>
  )

  // Open the read-only « Avant de partir » screen. The key icon mirrors the board's
  // ＋ departure tile (and that tile navigates to the same /board/departure scene).
  const departureBtn = (d: number) =>
    canDeparture ? (
      <button type="button" className="btn btn--ghost mono day-plan__add" onClick={() => nav(`/board/departure?day=${d}`)}>
        <Icon name="key-bold" size={16} /> {t.departure.title}
      </button>
    ) : null

  // Each day = its agenda rows + that day's « À compléter » checklist. The week
  // recap shows only days that carry SOMETHING (agenda or a todo) to stay calm; a
  // single-day scope always shows its one day, so the handoff checklist is there
  // to add to even on an otherwise-empty tomorrow.
  const blocks = days.map((d) => ({ d, rows: dayRows(d), hasTodo: todos.some((td) => td.day === d) }))
  const shown = single ? blocks : blocks.filter((b) => b.rows.length > 0 || b.hasTodo)

  return (
    <div className="moments">
      <SubTabs
        options={[
          { key: 'tonight', label: t.moment.scope.tonight, icon: 'moon-stars-bold' },
          { key: 'tomorrow', label: t.moment.scope.tomorrow, icon: 'sun-bold' },
          { key: 'date', label: t.moment.scope.date, icon: 'calendar-blank-bold' },
          { key: 'week', label: t.moment.scope.week, icon: 'calendar-blank-bold' },
        ]}
        value={scope}
        onSelect={(k) => {
          setScope(k)
          if (urlSync) setParams(k === 'tomorrow' ? {} : { scope: k }, { replace: true })
        }}
        ariaLabel={t.moment.title}
      />

      {scope === 'date' && (
        <label className="moment-datepick mono">
          {t.moment.pickDate}{' '}
          <input
            type="date"
            className="input"
            value={ymdInput(pickDate)}
            onChange={(e) => {
              if (e.target.value) setPickDate(localDayStart(new Date(`${e.target.value}T12:00:00`)))
            }}
          />
        </label>
      )}

      {/* « Ce soir dans le ciel » — tonight's moon phase, on the evening-relevant
          scopes only (tonight / tomorrow), so the week/date recaps stay calm. */}
      {(scope === 'tonight' || scope === 'tomorrow') && <SkyTonight />}

      {!data ? (
        <p className="loading mono">{t.common.loading}</p>
      ) : shown.length === 0 ? (
        <EmptyState tone="calm">{t.moment.empty}</EmptyState>
      ) : (
        shown.map((b) => (
          <Section key={b.d} label={capitalize(formatDayLong(b.d, lang))}>
            {b.rows}
            {/* The day's quick-handoff checklist, inline (add a ready list, check
                in place). Hidden on empty days only in the week recap. */}
            <TodoSection day={b.d} title={t.todos.title} members={formMembers} bento={false} hideWhenEmpty={!single} />
            <div className="moments__actions">
              {departureBtn(b.d)}
              {openDayBtn(b.d)}
            </div>
          </Section>
        ))
      )}
      {eventActions.node}
    </div>
  )
}

// « Ce soir dans le ciel » — tonight's moon phase, computed locally (lib/moonPhase,
// no network). One calm tap-to-hear line. Audience-aware: a parent gets a quiet row
// (emoji + phase name); a pre-reader gets a big centered emoji tile that speaks a
// full sentence, matching the board's hear-first toddler pattern. No counts, no
// data — additive and calm (NFR-CALM).
function SkyTonight() {
  const t = useT()
  const speak = useSpeak()
  const { audience } = useAudience()
  const moon = moonPhase(Date.now())
  const phase = t.moment.sky.phase[moon.name]
  const heard = t.moment.sky.heard[moon.name]
  const kid = audience === 'toddler'
  const inner = (
    <>
      <span className="sky-tonight__emoji" aria-hidden="true">
        {moon.emoji}
      </span>
      <span className="sky-tonight__text">
        <span className="sky-tonight__kicker mono">{t.moment.sky.title}</span>
        <span className="sky-tonight__phase">{phase}</span>
      </span>
    </>
  )
  // Read-aloud is a toddler-only affordance: a pre-reader gets a big tap-to-hear
  // tile; a parent gets the same calm line as plain, non-speaking info.
  if (!kid)
    return (
      <div className="sky-tonight" aria-label={`${t.moment.sky.title}: ${phase}`}>
        {inner}
      </div>
    )
  return (
    <button
      type="button"
      className="sky-tonight sky-tonight--kid"
      onClick={() => speak(heard)}
      aria-label={`${t.moment.sky.title}: ${phase}`}
    >
      {inner}
    </button>
  )
}
