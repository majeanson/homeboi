import { describe, expect, it } from 'vitest'
import { addLocalDays, localDayStart } from './localDay'
import { boardOrder, findable, groupTasks, horizonOf, HORIZONS, mineTask, personKey, rotates, subjectKey, type TaskItem } from './tasks'

const today = localDayStart(new Date('2026-11-06T17:00:00Z'))
const task = (over: Partial<TaskItem>): TaskItem => ({
  key: 'task:a',
  source: 'task',
  id: 'a',
  title: 'A',
  color: null,
  icon: null,
  effort: null,
  subject: null,
  kind: null,
  recurring: false,
  recurJson: null,
  day: null,
  dueToday: false,
  overdueSince: null,
  snoozedUntil: null,
  soon: false,
  done: 'open',
  doneAt: null,
  who_id: null,
  team: [],
  onBoard: false,
  ...over,
})

describe('horizonOf', () => {
  it.each([
    ['late', { overdueSince: addLocalDays(today, -3), day: addLocalDays(today, 30) }],
    ['today', { dueToday: true, day: today }],
    ['today', { done: 'ticked' as const }],
    ['week', { day: addLocalDays(today, 3) }],
    ['month', { day: addLocalDays(today, 12) }],
    ['later', { day: addLocalDays(today, 200) }],
    ['someday', {}],
  ])('%s', (want, over) => {
    expect(horizonOf(task(over), today)).toBe(want)
  })

  it('every bucket is a real horizon', () => {
    expect(HORIZONS).toContain(horizonOf(task({}), today))
  })
})

describe('boardOrder', () => {
  it('reads what is owed first, oldest first, and leaves the rest in place', () => {
    const rows = [
      task({ key: 'x' }),
      task({ key: 'late-new', overdueSince: 20 }),
      task({ key: 'y', done: 'ticked' }),
      task({ key: 'late-old', overdueSince: 10 }),
      task({ key: 'z' }),
    ]
    expect(boardOrder(rows).map((t) => t.key)).toEqual(['late-old', 'late-new', 'x', 'y', 'z'])
  })
})

describe('the lenses', () => {
  it('a face sees its own, its rotation, and what is nobody’s', () => {
    expect(mineTask(task({ who_id: 'a' }), 'a')).toBe(true)
    expect(mineTask(task({ who_id: 'b', team: ['b', 'a'] }), 'a')).toBe(true)
    expect(mineTask(task({ who_id: null }), 'a')).toBe(true)
    expect(mineTask(task({ who_id: 'b' }), 'a')).toBe(false)
    expect(mineTask(task({ who_id: 'b' }), null)).toBe(true)
  })

  it('groups keep first-seen order, or the order given', () => {
    const rows = [task({ key: '1', who_id: 'b' }), task({ key: '2', who_id: 'a' }), task({ key: '3', who_id: 'b' })]
    expect(groupTasks(rows, personKey).map((g) => [g.key, g.tasks.length])).toEqual([['b', 2], ['a', 1]])
    expect(groupTasks(rows, personKey, ['a', 'zzz', 'b']).map((g) => g.key)).toEqual(['a', 'b'])
  })

  it('a subject and a person each have one key, and none has a name of its own', () => {
    expect(subjectKey(task({ subject: { kind: 'pet', id: 'p' } }))).toBe('pet:p')
    expect(subjectKey(task({}))).toBe('none')
    expect(personKey(task({}))).toBe('all')
  })

  it('only a team of two or more is a rotation', () => {
    expect(rotates(task({ team: ['a'] }))).toBe(false)
    expect(rotates(task({ team: ['a', 'b'] }))).toBe(true)
  })
})

describe('findable — « Trouver quoi faire » (0149)', () => {
  const small = task({ id: 's', effort: 1 })
  const mid = task({ id: 'm', effort: 3 })
  const big = task({ id: 'b', effort: 5 })
  const unsaid = task({ id: 'u', effort: null })
  const ids = (xs: TaskItem[]) => xs.map((x) => x.id)

  it('an effort shows that effort and below', () => {
    expect(ids([small, mid, big].filter((x) => findable(x, 3, null, today)))).toEqual(['s', 'm'])
    expect(ids([small, mid, big].filter((x) => findable(x, 1, null, today)))).toEqual(['s'])
  })

  it('a task whose effort was never said shows under EVERY effort', () => {
    for (const e of [1, 2, 3, 4, 5, null]) expect(findable(unsaid, e, null, today)).toBe(true)
  })

  it('the horizon: the week, the month that holds it, and « un jour » for the long run', () => {
    const late = task({ id: 'late', overdueSince: addLocalDays(today, -2), day: addLocalDays(today, -2) })
    const week = task({ id: 'week', day: addLocalDays(today, 3) })
    const month = task({ id: 'month', day: addLocalDays(today, 20) })
    const later = task({ id: 'later', day: addLocalDays(today, 120) })
    const someday = task({ id: 'someday' })
    const all = [late, week, month, later, someday]
    expect(ids(all.filter((x) => findable(x, null, 'semaine', today)))).toEqual(['late', 'week'])
    expect(ids(all.filter((x) => findable(x, null, 'mois', today)))).toEqual(['late', 'week', 'month'])
    expect(ids(all.filter((x) => findable(x, null, 'unjour', today)))).toEqual(['later', 'someday'])
    expect(ids(all.filter((x) => findable(x, null, null, today)))).toEqual(ids(all))
  })

  it('both narrow together, and an unsaid effort still passes the effort half', () => {
    const quickSomeday = task({ id: 'q', effort: 1 })
    const bigSomeday = task({ id: 'bg', effort: 5 })
    const unsaidWeek = task({ id: 'uw', day: addLocalDays(today, 2) })
    const xs = [quickSomeday, bigSomeday, unsaidWeek, unsaid]
    expect(ids(xs.filter((x) => findable(x, 2, 'unjour', today)))).toEqual(['q', 'u'])
    expect(ids(xs.filter((x) => findable(x, 2, 'semaine', today)))).toEqual(['uw'])
  })
})
