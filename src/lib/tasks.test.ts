import { describe, expect, it } from 'vitest'
import { addLocalDays, localDayStart } from './localDay'
import { boardOrder, groupTasks, horizonOf, HORIZONS, mineTask, personKey, rotates, subjectKey, type TaskItem } from './tasks'

const today = localDayStart(new Date('2026-11-06T17:00:00Z'))
const task = (over: Partial<TaskItem>): TaskItem => ({
  key: 'todo:a',
  source: 'todo',
  id: 'a',
  title: 'A',
  color: null,
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
