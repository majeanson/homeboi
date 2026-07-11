import { isPastSec, mealSlotPast, useNow } from './itemLife'
import { eventMembers } from './eventPeople'
import { localDayStart, addLocalDays, localMinuteOfDay } from './localDay'
import { holidaysOnDay, holidaysInRange, schoolDayKind, type Holiday, type SchoolYear } from './year'
import { pickNextEventToday, BOARD_NEXTUP } from './ambientScene'
import { isMealSlot, type MealSlot } from './mealSlots'
import type { MealPrefs } from './mealPrefs'
import type { Lang } from '../i18n'
import type { BoardData, EventRow, ChoreInstance, MealRow, DayMealRow, WorkRow } from '../components/board/types'

// « Un seul modèle du babillard » (C-12, bmad/10) — the ONE pure view-model behind
// every board lens (parent Grille/Mois, toddler, Simple). Before this each lens
// re-derived the same fête-merge / face-filter / pending-undo-filter / visibility-
// filter / sort / emptiness logic ad hoc, on its own clock — a fix landed in one
// lens (e.g. the toddler « Demain » slot-visibility bug, decided bmad/10) didn't
// silently reach the others. `buildBoardModel` is a PURE function — same input,
// same output — so it's exhaustively testable without React or a DOM.
// `useBoardModel` is the thin hook wrapper that supplies the one shared minute
// clock (lib/itemLife's `useNow`); every OTHER input (the board payload, the
// picked face, meal prefs, the fêtes toggle…) is passed in BY THE CALLER, never
// re-derived here — Board.tsx already holds ONE `useMealPrefs()` instance; a
// second independent call inside the model would be redundant and, on a kiosk
// mid-401, could read a different frame of the same query cache.
//
// Model-side = existence / emptiness / next-ness + past flags (lib/itemLife) + day
// keys derived from `input.nowMs` via `localDayStart` — NEVER a hidden `Date.now()`
// call (a left-on kiosk must re-bucket at ITS minute clock, not whatever instant a
// render happens to run — the previous `nextUpToday` had its OWN `Date.now()` read,
// a second clock out of step with the board's `useNow()`; folded into one here).
// Lens-side (NOT here) = JSX, pictos, greeting, speak, peek wiring, per-device card
// visibility (`lib/boardCards`).
//
// `pickNextEventToday`/`BOARD_NEXTUP` (lib/ambientScene, C-13 bmad/10) are the one
// shared "what's next" selector the screensaver/cast ambient scene also ride —
// `pickNextEventToday` itself is a plain pure function (no React needed to call
// it); `buildBoardModel` stays exhaustively unit-testable without a DOM.

// The « Prochainement » / SimpleBoard "next up" grace window — an event that
// started up to this many seconds ago still counts as "next" (it's happening
// right now). Was the literal `1800` spelled twice (Board.tsx + SimpleBoard.tsx);
// now DERIVED from lib/ambientScene's `BOARD_NEXTUP` preset (C-13, bmad/10) — the
// one place `pickNextEventToday`'s board-flavoured grace window is defined — kept
// exported here unchanged since 53 existing tests + callers already import it
// from this module.
export const NEXT_UP_GRACE_SEC = BOARD_NEXTUP.graceSec

export interface ModelEvent extends EventRow {
  // Only meaningful for TODAY's timed events — an all-day/fête/future item is
  // never past (mirrors `eventAct`'s `past={isPastSec(...)}` in Board.tsx, which
  // is likewise only ever computed for today's list).
  past: boolean
}
export interface ModelMeal extends DayMealRow {
  // Only meaningful for today's non-supper slots — souper is the evening
  // headline and never strikes (lib/itemLife.SLOT_PAST_MIN has no `supper` entry).
  past: boolean
}

export interface BoardModelInput {
  data: BoardData | undefined
  // The shared minute clock (lib/itemLife `useNow`) — every day-key and past-flag
  // in the model derives from THIS, never a fresh `Date.now()`.
  nowMs: number
  lang: Lang
  // The picked face (mobile chip / kiosk switcher); null = Maisonnée (everyone).
  profileId: string | null
  fetesOn: boolean
  // D-21: per-device opt-out (lib/choreAnnounce useChoreAnnounceEnabled()) for the
  // "evening before" flagged-chore announce line — same wiring as fetesOn above.
  binAnnounceOn: boolean
  // lib/mealPrefs.useMealPrefs() — pass the ONE instance through, don't re-derive.
  mealPrefs: MealPrefs
  // D-17: the household's school-year bounds (lib/year useSchoolYear()), null =
  // never configured. Passed through, not re-fetched — same rule as mealPrefs.
  schoolYear?: SchoolYear | null
  // Chores/todos/home rows whose "done" write is DEFERRED behind the undo toast —
  // filtered out at once so a live poll can't resurrect them mid-undo.
  pendingDone?: Set<string>
  // Leftovers marked "Fini", held the same way.
  pendingLeftover?: Set<string>
  // Presence-only externals the emptiness flags need (their own polls, outside the
  // one /api/board read) — the model asks "is there one?", never the payload.
  hasWeather: boolean
  hasTomorrowWx: boolean
  // « À compléter » (todos table) open counts — today's + tomorrow's, each its own
  // poll (lib/todos), outside the /api/board payload.
  openTodosCount: number
  tomorrowTodoCount: number
}

export interface BoardModel {
  today: {
    events: ModelEvent[]
    chores: ChoreInstance[]
    todos: ChoreInstance[]
    home: ChoreInstance[]
    work: WorkRow[]
  }
  tomorrow: {
    events: EventRow[]
  }
  upcoming: {
    events: EventRow[]
    chores: ChoreInstance[]
    home: ChoreInstance[]
  }
  leftovers: BoardData['leftovers']
  meals: {
    /** The slot the payload's hero fields were filtered by — render « Ce soir »'s
     *  icon / label / colour off THIS, never off `useMealPrefs().hero` directly, so
     *  the card and its data always describe the same meal. */
    hero: MealSlot
    tonight: MealRow | null
    tonightAll: DayMealRow[]
    tomorrowSupper: MealRow | null
    otherToday: ModelMeal[]
    otherTomorrow: DayMealRow[]
  }
  nextUp: ModelEvent | null
  fil: {
    timed: ModelEvent[]
    untimed: ModelEvent[]
    work: WorkRow[]
    // Content-only "is there enough to draw a ribbon" gate (≥2 placeable things).
    // The « Aujourd'hui » card renders the ribbon when this is true, its flat agenda
    // otherwise — there's no longer a separate `fil` card to show/hide.
    eligible: boolean
  }
  // A genuinely clear day for the PARENT board: nothing to attend or do today
  // (events/chores/home/meals/leftovers/todos/work all empty). Weather/notes/
  // tomorrow don't count — this is "today's agenda is empty".
  dayClear: boolean
  // A genuinely clear day for the TODDLER lens — intentionally a DIFFERENT (wider)
  // check than dayClear: weather/notes/tomorrow count here too (decided, bmad/10:
  // the kid screen's "truly empty" and the parent's "nothing to attend to" are two
  // distinct, both-correct semantics — not unified).
  kidAllClear: boolean
  // « Demain » only earns its own section/card when tomorrow holds something.
  hasTomorrow: boolean
  // D-17: tomorrow's school qualifier (🎒 school / 🏖️ congé) — null MOST days on
  // purpose (silent except rentrée/dernier jour/relâche edges/in-term fériés, so
  // summer never becomes wallpaper). Every lens renders the SAME value.
  tomorrowSchoolKind: 'school' | 'conge' | null
}

const holidayRow = (h: Holiday, at: number, lang: Lang): EventRow => ({
  id: `fete-${h.id}-${at}`,
  title: h.label[lang],
  start_at: at,
  all_day: 1,
  member_id: null,
  holiday: true,
  ferie: h.kind === 'ferie',
  emoji: h.emoji,
})

// D-21 (bmad/10) « Sortir le bac » — the fête-line's sibling: a flagged recurring
// chore's own title, announced the EVENING before its next occurrence (« c'est le
// soir du bac bleu »). Same announcing-only shape as a fête row (all-day, nobody's,
// not editable) but a GENERIC `announce` tag (not `holiday: true`) so the lens
// reads it as « Ce soir », never « Fête ». `dayNow` (not the occurrence day) is the
// row's own `start_at` — the line lives on TODAY's list, since it's tonight that it
// announces tomorrow's chore.
const choreAnnounceRow = (c: ChoreInstance, dayNow: number): EventRow => ({
  id: `announce-${c.id}-${dayNow}`,
  title: c.title,
  start_at: dayNow,
  all_day: 1,
  member_id: null,
  announce: { tag: 'chore' },
})

export function buildBoardModel(input: BoardModelInput): BoardModel {
  const { data, nowMs, lang, profileId, fetesOn, binAnnounceOn, mealPrefs, hasWeather, hasTomorrowWx, openTodosCount, tomorrowTodoCount } =
    input
  const schoolYear = input.schoolYear ?? null
  const pendingDone = input.pendingDone ?? new Set<string>()
  const pendingLeftover = input.pendingLeftover ?? new Set<string>()
  const nowSec = Math.floor(nowMs / 1000)

  // LOCAL day keys off input.nowMs (never Date.now()) — matches the server's
  // local-day bucketing (functions/_lib/ids.ts), so a left-on kiosk re-buckets
  // fêtes/next-up at the SAME local midnight the board payload refetches on.
  const dayNow = localDayStart(new Date(nowMs))
  const tomorrowDay = addLocalDays(dayNow, 1)

  // Personal focus: when a face is picked, the board narrows to THAT person's
  // things plus shared "Maisonnée" items (no owner) — others' personal
  // events/chores drop away. A shared chore stays visible to any teammate in its
  // rotation even on someone else's turn (the `who` line still says whose turn).
  const focusing = !!profileId
  // « Qui » may name several people now: the event is "mine" if the picked face is
  // among them (or it's a shared, owner-less event). eventMembers folds passengers +
  // the legacy single member_id into one set.
  const mineEvent = (e: EventRow) => {
    if (!focusing) return true
    const ids = eventMembers(e)
    return ids.length === 0 || (!!profileId && ids.includes(profileId))
  }
  const mineChore = (c: ChoreInstance) =>
    !focusing || c.who_id === profileId || c.who_id === null || (!!profileId && !!c.team?.includes(profileId))
  const mineWork = (w: WorkRow) => !focusing || w.member_id === profileId || w.member_id === null

  // D-21: a flagged recurring chore's "evening before" announce — DERIVED off
  // choresUpcoming's next occurrence, never a stored row (the fête pattern above).
  // Window = the EVENING of the day before that occurrence, from 17:00 local
  // through midnight — via `localMinuteOfDay` (Intl/tz-based, like every other
  // day/time boundary here), NOT lib/timeofday's `timeOfDay` (that one reads the
  // RUNTIME's own zone via raw `getHours()`, correct on a kiosk but wrong on a
  // UTC CI runner — see localDay.ts's own comment on the same trap). The
  // occurrence itself must land exactly on `tomorrowDay` (localDayStart/
  // addLocalDays day math, never +86400). A chore due further out (e.g.
  // mid-fortnight for a biweekly rotation) never matches, so the line only ever
  // appears the ONE evening before its own turn. Self-terminating: past midnight
  // `dayNow` rolls forward and the occurrence — now "today" — surfaces via
  // choresToday instead, so the announce naturally disappears with no extra
  // bookkeeping here.
  const EVENING_START_MIN = 17 * 60 // 17:00 local — matches lib/timeofday's own 'evening' cutoff
  const isEvening = localMinuteOfDay(new Date(nowMs)) >= EVENING_START_MIN
  const choreAnnounces: EventRow[] =
    binAnnounceOn && isEvening
      ? (data?.choresUpcoming ?? [])
          .filter((c) => c.announce_evening && localDayStart(new Date(c.at * 1000)) === tomorrowDay)
          .map((c) => choreAnnounceRow(c, dayNow))
      : []

  // Les fêtes QC/CA — DERIVED on-device (lib/year; no rows, no fetch) and merged
  // into the same event arrays every lens reads. Calm zero-impact announce lines:
  // all-day, nobody's, never editable. Computed unconditionally (even before
  // `data` has loaded) since they need no server payload at all.
  const todayEventsRaw: EventRow[] = [
    ...(fetesOn ? holidaysOnDay(dayNow).map((h) => holidayRow(h, dayNow, lang)) : []),
    ...choreAnnounces,
    ...(data?.today ?? []).filter(mineEvent),
  ]
  const evtPast = (e: EventRow) => isPastSec(e.all_day ? null : e.start_at, nowMs)
  const todayEvents: ModelEvent[] = todayEventsRaw.map((e) => ({ ...e, past: evtPast(e) }))

  const tomorrowEvents: EventRow[] = [
    ...(fetesOn ? holidaysOnDay(tomorrowDay).map((h) => holidayRow(h, tomorrowDay, lang)) : []),
    ...(data?.tomorrow ?? []).filter(mineEvent),
  ]

  // « À venir »: the next stretch of fêtes (10 days past demain) rides sorted
  // among the real events — same window feel as the server's upcoming bucket.
  const upcomingEvents: EventRow[] = [
    ...(fetesOn ? holidaysInRange(addLocalDays(dayNow, 2), 10).map((x) => holidayRow(x.holiday, x.at, lang)) : []),
    ...(data?.upcoming ?? []).filter(mineEvent),
  ].sort((a, b) => a.start_at - b.start_at)

  const todayChores = (data?.choresToday ?? []).filter(mineChore).filter((c) => !pendingDone.has(c.id))
  const todayTodos = (data?.todos ?? []).filter(mineChore).filter((c) => !pendingDone.has(c.id))
  // "Projets & Entretien" — family-wide (no rotation), so NOT personal-focus
  // filtered, unlike chores/todos above.
  const todayHome = (data?.homeToday ?? []).filter((c) => !pendingDone.has(c.id))
  const upcomingChores = (data?.choresUpcoming ?? []).filter(mineChore)
  const upcomingHome = data?.homeUpcoming ?? []
  const leftovers = (data?.leftovers ?? []).filter((l) => !pendingLeftover.has(l.id))
  const filWork = (data?.work ?? []).filter(mineWork)

  // Meals — the ONE definition of tonight/tomorrow-hero/other slots every lens
  // reads, gated by the household's per-slot visibility AND its hero pick
  // (Réglages ▸ Repas). Hidden slots drop off the glance; a hidden hero drops the
  // whole headline. `hero` is the souper out of the box, so the board's « Ce soir »
  // is unchanged for a household that never touched the setting. The server already
  // sorted these rows by the household's order — the stable re-sort here keeps that
  // true after the visibility filter, and `position` order holds within a slot.
  //
  // The hero comes from the PAYLOAD (`data.heroSlot`), not from `mealPrefs`: `tonight`
  // was filtered server-side, so splitting `todayMeals` with a client hero the server
  // hasn't seen yet would, for the one poll after a hero change, render the old hero's
  // meal twice and drop the new hero's meal entirely. Fall back to the setting only
  // before the first payload lands (or on a cached pre-upgrade one).
  const hero = isMealSlot(data?.heroSlot) ? data.heroSlot : mealPrefs.hero
  const heroShown = mealPrefs.isVisible(hero)
  const bySlotOrder = (a: { slot: string }, b: { slot: string }) => mealPrefs.rank(a.slot) - mealPrefs.rank(b.slot)
  const tonight = heroShown ? data?.tonight ?? null : null
  const tonightAll = heroShown ? data?.tonightMeals ?? [] : []
  const tomorrowSupper = heroShown ? data?.tomorrowMeal ?? null : null
  // Strike a meal through once its serve window closed — off the household's own hours,
  // never a fixed table. The hero (and anything after it) never strikes.
  const isSlotPast = (slot: string) => mealSlotPast(slot, nowMs, mealPrefs.hours, hero)
  const otherToday: ModelMeal[] = (data?.todayMeals ?? [])
    .filter((m) => m.slot !== hero && mealPrefs.isVisible(m.slot))
    .sort(bySlotOrder)
    .map((m) => ({ ...m, past: isSlotPast(m.slot) }))
  const otherTomorrow: DayMealRow[] = (data?.tomorrowMeals ?? [])
    .filter((m) => m.slot !== hero && mealPrefs.isVisible(m.slot))
    .sort(bySlotOrder)

  // « Prochainement » — the soonest still-to-come timed event today, after the
  // face lens + fête merge, on the SAME clock (nowSec, derived from input.nowMs —
  // not a second, independent Date.now() read). The selector itself is shared with
  // the screensaver/cast ambient scene (C-13, bmad/10) — see lib/ambientScene.
  const nextUp = pickNextEventToday(todayEvents, nowSec, BOARD_NEXTUP)

  // « Le fil du jour » partition — timed events + work windows on the axis;
  // chores + all-day events pool under « À tout moment ».
  const filTimed = todayEvents.filter((e) => !e.all_day)
  const filUntimed = todayEvents.filter((e) => e.all_day)
  const fil = { timed: filTimed, untimed: filUntimed, work: filWork, eligible: filTimed.length + filWork.length >= 2 }

  const dayClear =
    !!data &&
    todayEvents.length === 0 &&
    todayChores.length === 0 &&
    todayHome.length === 0 &&
    otherToday.length === 0 &&
    tonightAll.length === 0 &&
    leftovers.length === 0 &&
    todayTodos.length === 0 &&
    openTodosCount === 0 &&
    filWork.length === 0

  const kidAllClear =
    !!data &&
    !(tonight || tomorrowSupper) &&
    !hasWeather &&
    (data?.notes?.length ?? 0) === 0 &&
    !data?.dayNote &&
    otherToday.length === 0 &&
    leftovers.length === 0 &&
    todayEvents.length === 0 &&
    todayChores.length === 0 &&
    todayTodos.length === 0 &&
    openTodosCount === 0 &&
    !data?.tomorrowNote &&
    tomorrowEvents.length === 0 &&
    (data?.tomorrowMeals?.length ?? 0) === 0

  // D-17: silent (null) on almost every day BY DESIGN — see schoolDayKind. When it
  // DOES fire it's always worth a "Demain" card of its own (a relâche starting
  // tomorrow with nothing else on the calendar is still worth flagging).
  const tomorrowSchoolKind = schoolDayKind(tomorrowDay, schoolYear, fetesOn)

  const hasTomorrow =
    hasTomorrowWx ||
    !!data?.tomorrowNote ||
    !!tomorrowSupper ||
    otherTomorrow.length > 0 ||
    tomorrowEvents.length > 0 ||
    tomorrowTodoCount > 0 ||
    tomorrowSchoolKind !== null

  return {
    today: { events: todayEvents, chores: todayChores, todos: todayTodos, home: todayHome, work: filWork },
    tomorrow: { events: tomorrowEvents },
    upcoming: { events: upcomingEvents, chores: upcomingChores, home: upcomingHome },
    leftovers,
    meals: { hero, tonight, tonightAll, tomorrowSupper, otherToday, otherTomorrow },
    nextUp,
    fil,
    dayClear,
    kidAllClear,
    hasTomorrow,
    tomorrowSchoolKind,
  }
}

// Thin hook wrapper: supplies the ONE shared minute clock (lib/itemLife `useNow`)
// so the model recomputes every 60s like every other time-derived board value.
// No memoization on top (Board rebuilds every minute anyway — memoizing here would
// just add bookkeeping for a value that's about to be thrown away). Every other
// input is the CALLER's job to pass through, not re-derive.
export function useBoardModel(input: Omit<BoardModelInput, 'nowMs'>): BoardModel {
  const nowMs = useNow()
  return buildBoardModel({ ...input, nowMs })
}
