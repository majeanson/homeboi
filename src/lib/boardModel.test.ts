import { describe, it, expect } from 'vitest'
import { buildBoardModel, NEXT_UP_GRACE_SEC, type BoardModelInput } from './boardModel'
import {
  DEFAULT_HERO,
  DEFAULT_SLOT_HOURS,
  DEFAULT_SLOT_ORDER,
  clockOrder,
  rankFrom,
  slotAtMinute,
  type MealSlot,
} from './mealSlots'
import { localDayStart, addLocalDays } from './localDay'
import type { MealPrefs } from './mealPrefs'
import type { BoardData, EventRow, ChoreInstance, WorkRow, DayMealRow } from '../components/board/types'

// buildBoardModel is the ONE pure view-model behind every board lens (C-12,
// bmad/10) — these tests exercise it directly, no React/DOM. A fixed `nowMs` far
// from the real test-run clock proves the model never falls back to a hidden
// `Date.now()` (the plan's binding gotcha): if it did, these would flake/fail.
const NOW = Date.UTC(2026, 6, 8, 15, 0, 0) // Wed Jul 8 2026, 11:00 EDT — no DST edge, no fête

// The household's meal settings as the board reads them (Réglages ▸ Repas). Defaults
// to the built-in order + souper hero; `order`/`hero` let a test prove the board
// follows a household that reordered its day or promoted another meal.
function prefs(hidden: string[] = [], order: MealSlot[] = DEFAULT_SLOT_ORDER, hero: MealSlot = DEFAULT_HERO): MealPrefs {
  const h = new Set(hidden)
  return {
    color: () => undefined,
    isVisible: (slot) => !h.has(slot),
    order,
    visibleSlots: order.filter((s) => !h.has(s)),
    sideSlots: order.filter((s) => s !== hero),
    hero,
    rank: rankFrom(order),
    hours: DEFAULT_SLOT_HOURS,
    clock: clockOrder(DEFAULT_SLOT_HOURS),
    slotAt: (minute) => slotAtMinute(DEFAULT_SLOT_HOURS, minute),
  }
}

function mkData(overrides: Partial<BoardData> = {}): BoardData {
  return {
    syncedAt: 0,
    scope: 'household',
    members: [],
    today: [],
    tomorrow: [],
    upcoming: [],
    tonight: null,
    tonightMeals: [],
    tomorrowMeal: null,
    todayMeals: [],
    dayNote: null,
    tomorrowMeals: [],
    tomorrowNote: null,
    list: [],
    chores: [],
    choresToday: [],
    choresUpcoming: [],
    todos: [],
    notes: [],
    leftovers: [],
    homeToday: [],
    homeUpcoming: [],
    work: [],
    ...overrides,
  }
}

function baseInput(overrides: Partial<BoardModelInput> = {}): BoardModelInput {
  return {
    data: mkData(),
    nowMs: NOW,
    lang: 'fr',
    profileId: null,
    fetesOn: false,
    binAnnounceOn: true,
    mealPrefs: prefs(),
    hasWeather: false,
    hasTomorrowWx: false,
    openTodosCount: 0,
    tomorrowTodoCount: 0,
    ...overrides,
  }
}

const ev = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: 'e1',
  title: 'Rendez-vous',
  start_at: Math.floor(NOW / 1000) + 3600,
  all_day: 0,
  member_id: null,
  ...overrides,
})

const chore = (overrides: Partial<ChoreInstance> = {}): ChoreInstance => ({
  id: 'c1',
  title: 'Corvée',
  color: null,
  at: Math.floor(NOW / 1000),
  who: null,
  who_id: null,
  ...overrides,
})

const work = (overrides: Partial<WorkRow> = {}): WorkRow => ({
  id: 'w1',
  label: 'Travail',
  at: Math.floor(NOW / 1000),
  endAt: Math.floor(NOW / 1000) + 3600,
  member_id: null,
  color: null,
  holds_car: 0,
  ...overrides,
})

const meal = (overrides: Partial<DayMealRow> = {}): DayMealRow => ({
  id: 'm1',
  slot: 'breakfast',
  title: 'Gruau',
  cook_member_id: null,
  ...overrides,
})

// The hero split must follow the SLOT THE SERVER FILTERED BY (`data.heroSlot`), not the
// client's household setting. Réglages ▸ Repas invalidates the household cache the
// instant the operator picks a new hero, but the board payload only catches up on its
// next poll — and in that window the two disagree. Using the client's hero there would
// render the OLD hero's meal twice (headline + "also planned") and drop the NEW hero's
// meal entirely, since `tonight` is server-filtered but `todayMeals` is not.
describe('hero split follows the payload, not the setting', () => {
  const supper = meal({ id: 's1', slot: 'supper', title: 'Pâté chinois' })
  const lunch = meal({ id: 'l1', slot: 'lunch', title: 'Sandwich' })
  const data = mkData({
    heroSlot: 'supper', // what the server used
    tonight: { id: 's1', title: 'Pâté chinois', cook_member_id: null },
    tonightMeals: [supper],
    todayMeals: [lunch, supper],
  })
  // The operator just promoted the dîner: the client setting says 'lunch' already.
  const model = buildBoardModel(baseInput({ data, mealPrefs: prefs([], DEFAULT_SLOT_ORDER, 'lunch') }))

  it('exposes the payload’s hero, not the freshly-picked one', () => {
    expect(model.meals.hero).toBe('supper')
  })
  it('never renders the payload’s hero meal twice', () => {
    expect(model.meals.tonight?.id).toBe('s1')
    expect(model.meals.otherToday.map((m) => m.id)).not.toContain('s1')
  })
  it('never drops a meal from the day', () => {
    expect(model.meals.otherToday.map((m) => m.id)).toEqual(['l1'])
  })
  it('falls back to the household setting before any payload has landed', () => {
    const loading = buildBoardModel(baseInput({ data: undefined, mealPrefs: prefs([], DEFAULT_SLOT_ORDER, 'lunch') }))
    expect(loading.meals.hero).toBe('lunch')
  })
})

describe('boardModel', () => {
  describe('dayClear', () => {
    it('is true on a genuinely empty day', () => {
      expect(buildBoardModel(baseInput()).dayClear).toBe(true)
    })
    it('is false while data has not loaded', () => {
      expect(buildBoardModel(baseInput({ data: undefined })).dayClear).toBe(false)
    })
    // Each category independently flips dayClear false — the "condition loop".
    const dayClearCases: [string, Partial<BoardData>][] = [
      ['an event', { today: [ev()] }],
      ['a chore', { choresToday: [chore()] }],
      ['home upkeep', { homeToday: [chore({ id: 'h1' })] }],
      ['a non-supper meal', { todayMeals: [meal()] }],
      ['a supper', { tonightMeals: [meal({ slot: 'supper' })] }],
      ['a leftover', { leftovers: [{ id: 'l1', title: 'Restants' }] }],
      ['a loose todo', { todos: [chore({ id: 't1' })] }],
    ]
    it.each(dayClearCases)('flips false when there is %s', (_label, dataOverride) => {
      const model = buildBoardModel(baseInput({ data: mkData(dataOverride) }))
      expect(model.dayClear).toBe(false)
    })
    it('flips false on a work window today', () => {
      const model = buildBoardModel(baseInput({ data: mkData({ work: [work()] }) }))
      expect(model.dayClear).toBe(false)
    })
    it('flips false on an open "À compléter" todo (external count)', () => {
      const model = buildBoardModel(baseInput({ openTodosCount: 1 }))
      expect(model.dayClear).toBe(false)
    })
    it('does NOT count weather or notes (parent semantics)', () => {
      const model = buildBoardModel(
        baseInput({ hasWeather: true, data: mkData({ notes: [{ id: 'n1', text: 'Hi', member_id: null, created_at: 0 }] }) }),
      )
      expect(model.dayClear).toBe(true)
    })
  })

  describe('kidAllClear', () => {
    it('is true on a genuinely empty day', () => {
      expect(buildBoardModel(baseInput()).kidAllClear).toBe(true)
    })
    it('is false while data has not loaded', () => {
      expect(buildBoardModel(baseInput({ data: undefined })).kidAllClear).toBe(false)
    })
    it('DOES count weather, unlike dayClear', () => {
      expect(buildBoardModel(baseInput({ hasWeather: true })).kidAllClear).toBe(false)
    })
    it('DOES count a fridge note', () => {
      const model = buildBoardModel(
        baseInput({ data: mkData({ notes: [{ id: 'n1', text: 'Hi', member_id: null, created_at: 0 }] }) }),
      )
      expect(model.kidAllClear).toBe(false)
    })
    it('DOES count a day note / tomorrow note', () => {
      expect(
        buildBoardModel(baseInput({ data: mkData({ dayNote: { id: 'd1', text: 'x', member_id: null } }) })).kidAllClear,
      ).toBe(false)
      expect(
        buildBoardModel(baseInput({ data: mkData({ tomorrowNote: { id: 'd2', text: 'x', member_id: null } }) })).kidAllClear,
      ).toBe(false)
    })
    it('DOES count tonight/tomorrow supper, gated by slot visibility', () => {
      const withSupper = buildBoardModel(baseInput({ data: mkData({ tonight: { id: 'm1', title: 'Pâtes', cook_member_id: null } }) }))
      expect(withSupper.kidAllClear).toBe(false)
      // Hidden souper → the hero disappears, so it no longer counts against "clear".
      const hiddenSupper = buildBoardModel(
        baseInput({ mealPrefs: prefs(['supper']), data: mkData({ tonight: { id: 'm1', title: 'Pâtes', cook_member_id: null } }) }),
      )
      expect(hiddenSupper.kidAllClear).toBe(true)
    })
    it('DOES count raw tomorrow meal presence (any slot, unfiltered)', () => {
      const model = buildBoardModel(baseInput({ data: mkData({ tomorrowMeals: [meal({ slot: 'snack' })] }) }))
      expect(model.kidAllClear).toBe(false)
    })
  })

  describe('meal visibility rules', () => {
    it('hides a slot the household turned off, for both today and tomorrow', () => {
      const data = mkData({
        todayMeals: [meal({ id: 'a', slot: 'breakfast' }), meal({ id: 'b', slot: 'snack' })],
        tomorrowMeals: [meal({ id: 'c', slot: 'snack' })],
      })
      const model = buildBoardModel(baseInput({ data, mealPrefs: prefs(['snack']) }))
      expect(model.meals.otherToday.map((m) => m.id)).toEqual(['a'])
      expect(model.meals.otherTomorrow.map((m) => m.id)).toEqual([])
    })
    it('excludes supper from otherToday/otherTomorrow (it has its own hero line)', () => {
      const data = mkData({
        todayMeals: [meal({ id: 'a', slot: 'supper' }), meal({ id: 'b', slot: 'breakfast' })],
      })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.meals.otherToday.map((m) => m.id)).toEqual(['b'])
    })
    it('sorts other-slot meals by time-of-day rank regardless of input order', () => {
      const data = mkData({
        todayMeals: [meal({ id: 'snack', slot: 'snack' }), meal({ id: 'bfast', slot: 'breakfast' }), meal({ id: 'lunch', slot: 'lunch' })],
      })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.meals.otherToday.map((m) => m.id)).toEqual(['bfast', 'lunch', 'snack'])
    })
    it('gates tonight/tonightAll/tomorrowSupper on the supper slot toggle', () => {
      const data = mkData({
        tonight: { id: 't', title: 'Pâtes', cook_member_id: null },
        tonightMeals: [meal({ id: 't', slot: 'supper' })],
        tomorrowMeal: { id: 'tm', title: 'Pizza', cook_member_id: null },
      })
      const shown = buildBoardModel(baseInput({ data }))
      expect(shown.meals.tonight?.id).toBe('t')
      expect(shown.meals.tonightAll).toHaveLength(1)
      expect(shown.meals.tomorrowSupper?.id).toBe('tm')
      const hidden = buildBoardModel(baseInput({ data, mealPrefs: prefs(['supper']) }))
      expect(hidden.meals.tonight).toBeNull()
      expect(hidden.meals.tonightAll).toEqual([])
      expect(hidden.meals.tomorrowSupper).toBeNull()
    })
    // C-12 (5/6), bmad/10 decided bug-fix: the toddler « Demain » section reads
    // otherTomorrow + tomorrowSupper off THIS model instead of raw data.tomorrowMeals,
    // so a household-hidden slot no longer leaks and the souper (already its own hero
    // line) no longer repeats in the list below it.
    it('otherTomorrow excludes a hidden slot AND the souper, while tomorrowSupper carries the souper exactly once', () => {
      const data = mkData({
        tomorrowMeal: { id: 'tm-supper', title: 'Pizza', cook_member_id: null },
        tomorrowMeals: [
          meal({ id: 'tm-supper', slot: 'supper', title: 'Pizza' }),
          meal({ id: 'tm-snack', slot: 'snack', title: 'Fruits' }),
          meal({ id: 'tm-lunch', slot: 'lunch', title: 'Soupe' }),
        ],
      })
      const model = buildBoardModel(baseInput({ data, mealPrefs: prefs(['snack']) }))
      expect(model.meals.otherTomorrow.map((m) => m.id)).toEqual(['tm-lunch'])
      expect(model.meals.tomorrowSupper?.id).toBe('tm-supper')
    })
  })

  describe('face lens (personal focus), incl. team rotation', () => {
    it('Maisonnée (no pick) sees everything', () => {
      const data = mkData({ today: [ev({ member_id: 'alice' })], choresToday: [chore({ who_id: 'bob' })] })
      const model = buildBoardModel(baseInput({ data, profileId: null }))
      expect(model.today.events).toHaveLength(1)
      expect(model.today.chores).toHaveLength(1)
    })
    it('a picked face drops another member\'s personal event, keeps shared (null owner)', () => {
      const data = mkData({
        today: [ev({ id: 'mine', member_id: 'alice' }), ev({ id: 'theirs', member_id: 'bob' }), ev({ id: 'shared', member_id: null })],
      })
      const model = buildBoardModel(baseInput({ data, profileId: 'alice' }))
      expect(model.today.events.map((e) => e.id).sort()).toEqual(['mine', 'shared'])
    })
    it('a shared chore stays visible+doable for any teammate even off their turn', () => {
      const data = mkData({
        choresToday: [chore({ id: 'shared', who_id: 'bob', team: ['alice', 'bob'] })],
      })
      const mine = buildBoardModel(baseInput({ data, profileId: 'alice' }))
      expect(mine.today.chores.map((c) => c.id)).toEqual(['shared'])
    })
    it('a chore with no team and not my turn drops out of my personal focus', () => {
      const data = mkData({ choresToday: [chore({ id: 'not-mine', who_id: 'bob' })] })
      const mine = buildBoardModel(baseInput({ data, profileId: 'alice' }))
      expect(mine.today.chores).toEqual([])
    })
    it('an unassigned (Maisonnée) chore always shows, even focused', () => {
      const data = mkData({ choresToday: [chore({ id: 'shared', who_id: null })] })
      const mine = buildBoardModel(baseInput({ data, profileId: 'alice' }))
      expect(mine.today.chores.map((c) => c.id)).toEqual(['shared'])
    })
    it('applies the same face lens to L\'auto work windows', () => {
      const data = mkData({ work: [work({ id: 'mine', member_id: 'alice' }), work({ id: 'theirs', member_id: 'bob' })] })
      const model = buildBoardModel(baseInput({ data, profileId: 'alice' }))
      expect(model.today.work.map((w) => w.id)).toEqual(['mine'])
    })
    it('"Projets & Entretien" is family-wide — never face-filtered', () => {
      const data = mkData({ homeToday: [chore({ id: 'h1', who_id: 'bob' })] })
      const model = buildBoardModel(baseInput({ data, profileId: 'alice' }))
      expect(model.today.home.map((c) => c.id)).toEqual(['h1'])
    })
  })

  describe('fêtes merge + sort', () => {
    it('merges a derived fête into today\'s events, announcing-only shape', () => {
      // Jul 8 has no fête in the curated list; use Halloween instead, same-day nowMs.
      const halloweenNoon = Date.UTC(2026, 9, 31, 16, 0) // Oct 31 2026, noon EDT
      const expectedDay = localDayStart(new Date(halloweenNoon))
      const model = buildBoardModel(baseInput({ nowMs: halloweenNoon, fetesOn: true }))
      expect(model.today.events.map((e) => e.id)).toEqual([`fete-halloween-${expectedDay}`])
      expect(model.today.events[0]).toMatchObject({ holiday: true, ferie: false, emoji: '🎃' })
    })
    it('never merges fêtes when the household toggle is off', () => {
      const halloweenNoon = Date.UTC(2026, 9, 31, 16, 0)
      const model = buildBoardModel(baseInput({ nowMs: halloweenNoon, fetesOn: false }))
      expect(model.today.events).toEqual([])
    })
    it('merges upcoming fêtes into the À-venir window, sorted with real events', () => {
      const data = mkData({ upcoming: [ev({ id: 'real', start_at: Math.floor(NOW / 1000) + 5 * 86400, member_id: null })] })
      const model = buildBoardModel(baseInput({ data, fetesOn: true }))
      const ids = model.upcoming.events.map((e) => e.id)
      // sorted by start_at ascending
      const starts = model.upcoming.events.map((e) => e.start_at)
      expect(starts).toEqual([...starts].sort((a, b) => a - b))
      expect(ids).toContain('real')
    })
  })

  describe('nextUp grace boundary', () => {
    const nowSec = Math.floor(NOW / 1000)
    it('includes an event exactly at the grace boundary', () => {
      const data = mkData({ today: [ev({ id: 'edge', start_at: nowSec - NEXT_UP_GRACE_SEC })] })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.nextUp?.id).toBe('edge')
    })
    it('excludes an event one second past the grace boundary', () => {
      const data = mkData({ today: [ev({ id: 'too-old', start_at: nowSec - NEXT_UP_GRACE_SEC - 1 })] })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.nextUp).toBeNull()
    })
    it('never picks an all-day event as next-up', () => {
      const data = mkData({ today: [ev({ id: 'allday', all_day: 1, start_at: nowSec })] })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.nextUp).toBeNull()
    })
    it('picks the SOONEST upcoming event among several', () => {
      const data = mkData({
        today: [ev({ id: 'later', start_at: nowSec + 7200 }), ev({ id: 'soonest', start_at: nowSec + 600 })],
      })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.nextUp?.id).toBe('soonest')
    })
  })

  describe('past thresholds (lib/itemLife)', () => {
    it('flags a timed event past once its moment has gone', () => {
      const nowSec = Math.floor(NOW / 1000)
      const data = mkData({ today: [ev({ id: 'gone', start_at: nowSec - 1 }), ev({ id: 'soon', start_at: nowSec + 1 })] })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.today.events.find((e) => e.id === 'gone')?.past).toBe(true)
      expect(model.today.events.find((e) => e.id === 'soon')?.past).toBe(false)
    })
    it('never flags an all-day event as past', () => {
      const nowSec = Math.floor(NOW / 1000)
      const data = mkData({ today: [ev({ id: 'allday', all_day: 1, start_at: nowSec - 100000 })] })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.today.events[0]!.past).toBe(false)
    })
    it('strikes a past-cutoff meal slot but never souper/dessert', () => {
      // 11:00 EDT local (see NOW) — breakfast's 10:30 cutoff has passed, lunch's hasn't.
      const data = mkData({
        todayMeals: [meal({ id: 'bf', slot: 'breakfast' }), meal({ id: 'lu', slot: 'lunch' }), meal({ id: 'de', slot: 'dessert' })],
      })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.meals.otherToday.find((m) => m.id === 'bf')?.past).toBe(true)
      expect(model.meals.otherToday.find((m) => m.id === 'lu')?.past).toBe(false)
      expect(model.meals.otherToday.find((m) => m.id === 'de')?.past).toBe(false)
    })
  })

  describe('pending-undo removal', () => {
    it('filters a chore/todo/home row held behind the undo toast', () => {
      const data = mkData({
        choresToday: [chore({ id: 'ch1' })],
        todos: [chore({ id: 'td1' })],
        homeToday: [chore({ id: 'ho1' })],
      })
      const model = buildBoardModel(baseInput({ data, pendingDone: new Set(['ch1', 'td1', 'ho1']) }))
      expect(model.today.chores).toEqual([])
      expect(model.today.todos).toEqual([])
      expect(model.today.home).toEqual([])
    })
    it('filters a leftover held behind its own undo toast', () => {
      const data = mkData({ leftovers: [{ id: 'lf1', title: 'Restants' }] })
      const model = buildBoardModel(baseInput({ data, pendingLeftover: new Set(['lf1']) }))
      expect(model.leftovers).toEqual([])
    })
    it('a pending set that does not match a row changes nothing', () => {
      const data = mkData({ choresToday: [chore({ id: 'ch1' })] })
      const model = buildBoardModel(baseInput({ data, pendingDone: new Set(['other']) }))
      expect(model.today.chores.map((c) => c.id)).toEqual(['ch1'])
    })
  })

  describe('midnight / local-day re-bucket (never a hidden Date.now())', () => {
    it('stays on the LOCAL day even after UTC has already rolled to tomorrow (the classic ~8pm-Eastern bug)', () => {
      // Dec 24 2026, 20:30 EST — already Dec 25 in UTC, still Dec 24 on the wall.
      const eightPmEastern = Date.UTC(2026, 11, 25, 1, 30)
      const model = buildBoardModel(baseInput({ nowMs: eightPmEastern, fetesOn: true }))
      expect(model.today.events.some((e) => e.id.startsWith('fete-veille-de-noel-'))).toBe(true)
      expect(model.today.events.some((e) => e.id.startsWith('fete-noel-'))).toBe(false) // not yet "Noël" itself
    })
    it('flips to the next local day exactly at local midnight, not UTC midnight', () => {
      const justBefore = Date.UTC(2026, 11, 25, 4, 59) // 23:59 EST Dec 24
      const justAfter = Date.UTC(2026, 11, 25, 5, 1) // 00:01 EST Dec 25
      const before = buildBoardModel(baseInput({ nowMs: justBefore, fetesOn: true }))
      const after = buildBoardModel(baseInput({ nowMs: justAfter, fetesOn: true }))
      expect(before.today.events.some((e) => e.id.startsWith('fete-veille-de-noel-'))).toBe(true)
      expect(before.today.events.some((e) => e.id.startsWith('fete-noel-'))).toBe(false)
      expect(after.today.events.some((e) => e.id.startsWith('fete-noel-'))).toBe(true)
      expect(after.today.events.some((e) => e.id.startsWith('fete-veille-de-noel-'))).toBe(false)
    })
  })

  describe('hasTomorrow', () => {
    it('is false when tomorrow is genuinely empty', () => {
      expect(buildBoardModel(baseInput()).hasTomorrow).toBe(false)
    })
    const hasTomorrowCases: [string, Partial<BoardModelInput>][] = [
      ['a tomorrow-weather forecast', { hasTomorrowWx: true }],
      ['an open tomorrow "À compléter" todo', { tomorrowTodoCount: 1 }],
    ]
    it.each(hasTomorrowCases)('flips true on %s (external input)', (_label, override) => {
      expect(buildBoardModel(baseInput(override)).hasTomorrow).toBe(true)
    })
    it('flips true on a tomorrow note, a tomorrow supper, a non-supper tomorrow meal, or a tomorrow event', () => {
      expect(buildBoardModel(baseInput({ data: mkData({ tomorrowNote: { id: 'n', text: 'x', member_id: null } }) })).hasTomorrow).toBe(
        true,
      )
      expect(
        buildBoardModel(baseInput({ data: mkData({ tomorrowMeal: { id: 'm', title: 'Pizza', cook_member_id: null } }) })).hasTomorrow,
      ).toBe(true)
      expect(buildBoardModel(baseInput({ data: mkData({ tomorrowMeals: [meal({ slot: 'lunch' })] }) })).hasTomorrow).toBe(true)
      expect(buildBoardModel(baseInput({ data: mkData({ tomorrow: [ev()] }) })).hasTomorrow).toBe(true)
    })
    it('a hidden-supper tomorrow meal does not count on its own', () => {
      const data = mkData({ tomorrowMeal: { id: 'm', title: 'Pizza', cook_member_id: null } })
      const model = buildBoardModel(baseInput({ data, mealPrefs: prefs(['supper']) }))
      expect(model.hasTomorrow).toBe(false)
    })
  })

  describe('fil partition', () => {
    it('is not eligible with fewer than two placeable things', () => {
      const data = mkData({ today: [ev({ start_at: Math.floor(NOW / 1000) + 60 })] })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.fil.eligible).toBe(false)
    })
    it('is eligible with two timed events', () => {
      const data = mkData({
        today: [ev({ id: 'a', start_at: Math.floor(NOW / 1000) + 60 }), ev({ id: 'b', start_at: Math.floor(NOW / 1000) + 120 })],
      })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.fil.eligible).toBe(true)
      expect(model.fil.timed).toHaveLength(2)
    })
    it('counts a work window toward eligibility, and splits all-day into untimed', () => {
      const data = mkData({
        today: [ev({ id: 'allday', all_day: 1 })],
        work: [work({ id: 'w1' })],
      })
      const model = buildBoardModel(baseInput({ data }))
      expect(model.fil.untimed.map((e) => e.id)).toEqual(['allday'])
      expect(model.fil.work).toHaveLength(1)
      // 1 all-day (untimed, not counted) + 1 work (counted) = 1 < 2 → not eligible
      expect(model.fil.eligible).toBe(false)
    })
  })

  describe('D-21 « Sortir le bac » — evening-before chore announce', () => {
    // The announce is DERIVED (never a stored row, the fête pattern): a chore
    // flagged `announce_evening` whose next occurrence (choresUpcoming's `at`)
    // lands exactly on tomorrow's local midnight, surfaced only during the
    // EVENING (17:00 local onward) of the day before. `tomorrowOf` computes that
    // target the SAME way the model does (localDayStart/addLocalDays), so every
    // case below stays correct regardless of the runner's own timezone.
    const tomorrowOf = (nowMs: number) => addLocalDays(localDayStart(new Date(nowMs)), 1)
    const bac = (overrides: Partial<ChoreInstance> = {}) =>
      chore({ id: 'bac1', title: 'Sortir le bac bleu', announce_evening: true, ...overrides })
    const hasAnnounce = (nowMs: number, choresUpcoming: ChoreInstance[], overrides: Partial<BoardModelInput> = {}) =>
      buildBoardModel(baseInput({ nowMs, data: mkData({ choresUpcoming }), ...overrides })).today.events.some(
        (e) => e.announce?.tag === 'chore',
      )

    // Jul 8 2026 is DST-edge-free (same anchor date as the top-of-file NOW), so
    // these two instants differ ONLY by the evening-start boundary.
    const EVENING_1700 = Date.UTC(2026, 6, 8, 21, 0, 0) // 17:00 EDT
    const AFTERNOON_1659 = Date.UTC(2026, 6, 8, 20, 59, 0) // 16:59 EDT

    it('is silent one minute before evening starts, present exactly at 17:00 local', () => {
      const at = tomorrowOf(EVENING_1700) // same calendar day both instants
      expect(hasAnnounce(AFTERNOON_1659, [bac({ at })])).toBe(false)
      expect(hasAnnounce(EVENING_1700, [bac({ at })])).toBe(true)
    })

    it('carries a GENERIC `announce` tag (not `holiday`), all-day, nobody\'s', () => {
      const at = tomorrowOf(EVENING_1700)
      const model = buildBoardModel(baseInput({ nowMs: EVENING_1700, data: mkData({ choresUpcoming: [bac({ at })] }) }))
      const row = model.today.events.find((e) => e.announce?.tag === 'chore')
      expect(row).toMatchObject({ title: 'Sortir le bac bleu', all_day: 1, member_id: null })
      expect(row?.holiday).toBeUndefined()
    })

    it('is silent when the occurrence is NOT tomorrow (e.g. the other week of a biweekly rotation)', () => {
      const farOut = addLocalDays(tomorrowOf(EVENING_1700), 7)
      expect(hasAnnounce(EVENING_1700, [bac({ at: farOut })])).toBe(false)
    })

    it('is silent for an UNFLAGGED chore due tomorrow, even in the evening', () => {
      const at = tomorrowOf(EVENING_1700)
      expect(hasAnnounce(EVENING_1700, [bac({ at, announce_evening: false })])).toBe(false)
    })

    it('is silent when this device opted out (binAnnounceOn: false)', () => {
      const at = tomorrowOf(EVENING_1700)
      expect(hasAnnounce(EVENING_1700, [bac({ at })], { binAnnounceOn: false })).toBe(false)
    })

    it('midnight rollover: present right before midnight, gone right after — the occurrence became "today"', () => {
      const justBefore = Date.UTC(2026, 6, 9, 3, 59, 0) // Jul 8 23:59 EDT
      const justAfter = Date.UTC(2026, 6, 9, 4, 1, 0) // Jul 9 00:01 EDT
      const at = tomorrowOf(justBefore) // Jul 9 local midnight, fixed
      expect(hasAnnounce(justBefore, [bac({ at })])).toBe(true)
      // Same fixed `at`, but "tomorrow" has now rolled to Jul 10 — no longer a match
      // (in real usage the server would have moved this row to choresToday by now).
      expect(hasAnnounce(justAfter, [bac({ at })])).toBe(false)
    })

    it('DST transition (spring-forward, Mar 8 2026): still announces exactly the evening before', () => {
      // 20:00 EDT on the transition day itself (clocks jumped 2:00→3:00 EST→EDT
      // at 02:00 local, hours before this evening instant).
      const eveningOfTransitionDay = Date.UTC(2026, 2, 9, 0, 0, 0) // Mar 8 20:00 EDT
      const at = tomorrowOf(eveningOfTransitionDay) // Mar 9 local midnight
      expect(hasAnnounce(eveningOfTransitionDay, [bac({ at })])).toBe(true)
      // Two days out (Mar 10) must NOT announce, proving the day window stayed
      // exact across the transition instead of drifting on the shortened (23 h) day.
      const twoDaysOut = addLocalDays(at, 1)
      expect(hasAnnounce(eveningOfTransitionDay, [bac({ at: twoDaysOut })])).toBe(false)
    })
  })
})
