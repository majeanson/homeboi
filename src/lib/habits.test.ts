import { describe, it, expect } from 'vitest'
import {
  deriveProgress,
  dueToday,
  habitStatusOn,
  isDayDone,
  isDaySettled,
  isDueOn,
  reminderDue,
  remainingThisWeek,
  visibleHabits,
  weekBounds,
  type Habit,
  type HabitDay,
} from './habits'
import { addLocalDays, localDayStart } from './localDay'

// Pure selectors behind « Mes habitudes ». Days are LOCAL midnights, so the
// fixtures build them through localDayStart/addLocalDays rather than +86400 —
// the same DST-safe stepping the scene and the server use.

const WED = localDayStart(new Date('2026-07-08T12:00:00Z')) // a Wednesday
const day = (n: number) => addLocalDays(WED, n)

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    member_id: null,
    title: 'Marcher',
    icon: '🚶',
    colour: null,
    kind: 'do',
    target: null,
    unit: '',
    cadence: 'recur',
    recur: null,
    week_times: null,
    reminders: [],
    position: 0,
    archived: false,
    due_days: [day(-1), day(0), day(1)],
    ...over,
  }
}

function mark(over: Partial<HabitDay> & { day: number }): HabitDay {
  return { habit_id: 'h1', value: 0, slips: 0, member_id: null, note: '', ...over }
}

describe('isDayDone — the intention was met, per kind', () => {
  it('do: any positive value', () => {
    expect(isDayDone(habit(), undefined)).toBe(false)
    expect(isDayDone(habit(), mark({ day: day(0), value: 1 }))).toBe(true)
  })

  it('count: reaching the target', () => {
    const h = habit({ kind: 'count', target: 8 })
    expect(isDayDone(h, mark({ day: day(0), value: 7 }))).toBe(false)
    expect(isDayDone(h, mark({ day: day(0), value: 8 }))).toBe(true)
    expect(isDayDone(h, mark({ day: day(0), value: 9 }))).toBe(true)
  })

  it('limit: at or under the ceiling — including an untouched day', () => {
    const h = habit({ kind: 'limit', target: 5 })
    expect(isDayDone(h, undefined)).toBe(true) // you smoked none
    expect(isDayDone(h, mark({ day: day(0), value: 5 }))).toBe(true)
    expect(isDayDone(h, mark({ day: day(0), value: 6 }))).toBe(false) // noted, never scolded
  })

  it('avoid: held, and only without a slip', () => {
    const h = habit({ kind: 'avoid' })
    expect(isDayDone(h, mark({ day: day(0), value: 1 }))).toBe(true)
    expect(isDayDone(h, mark({ day: day(0), value: 1, slips: 1 }))).toBe(false)
    expect(isDayDone(h, undefined)).toBe(false)
  })
})

describe('isDaySettled — goal-shaped vs confirmation-shaped', () => {
  it('do/count settle by reaching the goal', () => {
    expect(isDaySettled(habit(), undefined)).toBe(false)
    expect(isDaySettled(habit(), mark({ day: day(0), value: 1 }))).toBe(true)
    const c = habit({ kind: 'count', target: 8 })
    expect(isDaySettled(c, mark({ day: day(0), value: 7 }))).toBe(false)
  })

  // The bug this guards: a "max 5 smokes" habit reads as done at zero, so a
  // done-based filter would never show it in the check-in list. It settles only
  // once you've said something about today — even « aucune » (a value-0 row).
  it('limit settles on ANY mark, including a zero-value confirmation', () => {
    const h = habit({ kind: 'limit', target: 5 })
    expect(isDaySettled(h, undefined)).toBe(false)
    expect(isDaySettled(h, mark({ day: day(0), value: 0 }))).toBe(true)
    expect(isDaySettled(h, mark({ day: day(0), value: 7 }))).toBe(true) // over the ceiling still settles
  })

  it('avoid settles on a held confirm or a logged slip', () => {
    const h = habit({ kind: 'avoid' })
    expect(isDaySettled(h, undefined)).toBe(false)
    expect(isDaySettled(h, mark({ day: day(0), value: 1 }))).toBe(true)
    expect(isDaySettled(h, mark({ day: day(0), value: 0, slips: 1 }))).toBe(true)
  })
})

describe('cadence', () => {
  it('recur: dueness reads the server-expanded due_days', () => {
    const h = habit({ due_days: [day(0), day(2)] })
    expect(isDueOn(h, [], day(0))).toBe(true)
    expect(isDueOn(h, [], day(1))).toBe(false)
    expect(isDueOn(h, [], day(2))).toBe(true)
  })

  // The always-on kiosk flips to a new local day from the CACHED payload: the
  // server's window reaches +2 days, so tomorrow is already in due_days.
  it('recur: tomorrow is due off the cached window (midnight flip, no refetch)', () => {
    expect(isDueOn(habit(), [], day(1))).toBe(true)
  })

  it('an archived habit never comes due', () => {
    expect(isDueOn(habit({ archived: true }), [], day(0))).toBe(false)
  })

  it('week: due until the quota of done days is met, then quiet', () => {
    const h = habit({ cadence: 'week', week_times: 2, due_days: [] })
    expect(remainingThisWeek(h, [], day(0))).toBe(2)
    expect(isDueOn(h, [], day(0))).toBe(true)

    const one = [mark({ day: day(-1), value: 1 })]
    expect(remainingThisWeek(h, one, day(0))).toBe(1)
    expect(isDueOn(h, one, day(0))).toBe(true)

    const two = [...one, mark({ day: day(0), value: 1 })]
    expect(remainingThisWeek(h, two, day(0))).toBe(0)
    expect(isDueOn(h, two, day(0))).toBe(false)
  })

  it('week: a marked-but-not-done day does not fill the quota', () => {
    const h = habit({ kind: 'count', target: 8, cadence: 'week', week_times: 2, due_days: [] })
    const partial = [mark({ day: day(0), value: 3 })]
    expect(remainingThisWeek(h, partial, day(0))).toBe(2)
  })

  // The quota is per LOCAL week (Sunday-start): last week's marks don't carry in.
  it('week: the quota resets at the week boundary', () => {
    const h = habit({ cadence: 'week', week_times: 1, due_days: [] })
    const [start] = weekBounds(WED)
    const lastWeek = [mark({ day: addLocalDays(start, -1), value: 1 })]
    expect(remainingThisWeek(h, lastWeek, WED)).toBe(1)
    expect(isDueOn(h, lastWeek, WED)).toBe(true)
  })

  it('weekBounds spans exactly seven local days from Sunday', () => {
    const [start, end] = weekBounds(WED)
    expect(addLocalDays(start, 7)).toBe(end)
    expect(start).toBeLessThanOrEqual(WED)
    expect(end).toBeGreaterThan(WED)
  })
})

describe('visibleHabits — private-ish by face', () => {
  const household = habit({ id: 'a', member_id: null })
  const mine = habit({ id: 'b', member_id: 'm1', position: 1 })
  const theirs = habit({ id: 'c', member_id: 'm2', position: 2 })
  const all = [household, mine, theirs]

  it('a picked face sees household habits plus their own — never another member’s', () => {
    expect(visibleHabits(all, 'm1').map((h) => h.id)).toEqual(['a', 'b'])
  })

  it('Maisonnée (no face) sees only household-wide habits', () => {
    expect(visibleHabits(all, null).map((h) => h.id)).toEqual(['a'])
  })

  it('archived habits drop out of every face', () => {
    expect(visibleHabits([habit({ id: 'z', archived: true })], null)).toEqual([])
  })
})

describe('dueToday', () => {
  it('drops settled habits and keeps the ones still asking', () => {
    const walk = habit({ id: 'a' })
    const water = habit({ id: 'b', kind: 'count', target: 8, position: 1 })
    const days = [mark({ habit_id: 'a', day: day(0), value: 1 }), mark({ habit_id: 'b', day: day(0), value: 3 })]
    expect(dueToday([walk, water], days, null, day(0)).map((h) => h.id)).toEqual(['b'])
  })

  it('a limit habit stays in the list until it is confirmed today', () => {
    const smoke = habit({ id: 's', kind: 'limit', target: 5 })
    expect(dueToday([smoke], [], null, day(0)).map((h) => h.id)).toEqual(['s'])
    const confirmed = [mark({ habit_id: 's', day: day(0), value: 0 })]
    expect(dueToday([smoke], confirmed, null, day(0))).toEqual([])
  })
})

describe('habitStatusOn', () => {
  it('reports the day’s value, slips, dueness and settledness together', () => {
    const h = habit({ kind: 'count', target: 8 })
    const s = habitStatusOn(h, [mark({ day: day(0), value: 3 })], day(0))
    expect(s).toMatchObject({ due: true, done: false, marked: true, settled: false, value: 3, target: 8 })
  })
})

describe('deriveProgress — gentle, per habit, never a chain', () => {
  it('counts done days in the local week and the last 30 days', () => {
    const h = habit()
    const [start] = weekBounds(WED)
    const days = [
      mark({ day: addLocalDays(start, 1), value: 1 }),
      mark({ day: addLocalDays(start, 2), value: 1 }),
      mark({ day: addLocalDays(WED, -20), value: 1 }),
    ]
    const p = deriveProgress(h, days, WED)
    expect(p.weekDone).toBe(2)
    expect(p.monthDone).toBe(3)
    expect(p.week).toHaveLength(7)
  })

  it('flags days after today as future (not as misses)', () => {
    const p = deriveProgress(habit(), [], WED)
    const future = p.week.filter((w) => w.future)
    expect(future.every((w) => !w.done && !w.marked)).toBe(true)
    expect(p.week.find((w) => w.day === WED)?.future).toBe(false)
  })
})

describe('reminderDue — in-app, read-time, once per day', () => {
  const h = habit({ reminders: [540, 1200] }) // 09:00, 20:00

  it('fires inside the grace window after its minute', () => {
    expect(reminderDue(h, 540, [], false)).toBe(540)
    expect(reminderDue(h, 560, [], false)).toBe(540)
    expect(reminderDue(h, 569, [], false)).toBe(540)
  })

  it('does not resurrect a morning reminder at supper time', () => {
    expect(reminderDue(h, 570, [], false)).toBe(null) // grace expired
    expect(reminderDue(h, 900, [], false)).toBe(null)
  })

  it('never fires before its minute', () => {
    expect(reminderDue(h, 539, [], false)).toBe(null)
  })

  it('fires each configured time at most once per day', () => {
    expect(reminderDue(h, 1205, [540], false)).toBe(1200)
    expect(reminderDue(h, 1205, [540, 1200], false)).toBe(null)
  })

  it('stays quiet once the habit is settled, or when archived', () => {
    expect(reminderDue(h, 540, [], true)).toBe(null)
    expect(reminderDue(habit({ reminders: [540], archived: true }), 540, [], false)).toBe(null)
  })
})
