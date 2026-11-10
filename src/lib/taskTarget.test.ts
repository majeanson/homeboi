import { describe, expect, it } from 'vitest'
import { axesOf, faceAfter, taskTarget, unheldAxes, type TaskAxes, type TaskAxis, type TaskFace } from './taskTarget'

const WEEKLY = { freq: 'weekly', interval: 1, weekdays: [2] }

describe('taskTarget: the one rule, by example', () => {
  it.each<[string, TaskAxes, TaskFace]>([
    ['a bare title is a task', { title: 'Appeler la garderie' }, 'task'],
    ['a date alone is a task on that day', { title: 'Formulaire', date: '2026-11-12' }, 'task'],
    ['a subject, a look and an effort never route', { title: 'Vérifier le toit' }, 'task'],
    ['a recurrence is a task', { title: 'Sortir le bac', recur: WEEKLY }, 'task'],
    ['a recurrence with its start is a task', { title: 'Sortir le bac', recur: WEEKLY, date: '2026-11-10' }, 'task'],
    ['a person is a task', { title: 'Ranger', rotation: ['m1'] }, 'task'],
    ['« chacun son tour » is a task', { title: 'Vaisselle', recur: WEEKLY, rotation: ['m1', 'm2'] }, 'task'],
    ['a recurring lead is a task', { title: 'Bac', recur: WEEKLY, lead: 86400 }, 'task'],
    ['the evening before is a task', { title: 'Bac', recur: WEEKLY, announceEvening: true }, 'task'],
    ['notes go home', { title: 'Cuisine', notes: 'trois devis' }, 'home'],
    ['a budget goes home', { title: 'Cuisine', budgetCents: 1_500_000 }, 'home'],
    ['« à partir de la dernière fois » goes home', { title: 'Filtre', recur: WEEKLY, recurFrom: 'done' }, 'home'],
    ['a door’s kind goes home', { title: 'Gouttières', kind: 'upkeep' }, 'home'],
    ['a dated one-off with a person goes home, as it did before 0153', { title: 'Peinturer', date: '2026-11-12', rotation: ['m1'] }, 'home'],
    ['a dated one-off with a lead goes home, as it did before 0153', { title: 'Vaccin', date: '2026-11-12', lead: 86400 }, 'home'],
    ['the evening before with notes fits no face: home, which holds the most', { title: 'Bac', recur: WEEKLY, announceEvening: true, notes: 'bleu' }, 'home'],
  ])('%s', (_, draft, want) => {
    expect(taskTarget(draft)).toBe(want)
  })
})

describe('the sub-layers count only where they mean something', () => {
  it('a lead with no date and no recurrence is no layer', () => {
    expect(axesOf({ title: 'x', lead: 3600 })).toEqual([])
  })
  it('the evening before and « dernière fois » need a recurrence', () => {
    expect(axesOf({ title: 'x', announceEvening: true, recurFrom: 'done' })).toEqual([])
  })
  it('blank notes are no notes', () => {
    expect(axesOf({ title: 'x', notes: '   ' })).toEqual([])
  })
  it('a recurrence’s start is not a one-off date', () => {
    expect(axesOf({ title: 'x', date: '2026-11-10', recur: WEEKLY })).toEqual(['recur'])
  })
})

// Every combination of the nine layers. A task holds exactly what the two old faces held
// between them (a dated one-off, OR a series with its people), so nothing lands somewhere
// new because the faces merged; everything else is a home row, losing only the evening line.
describe('taskTarget: every combination', () => {
  const flags: TaskAxis[] = ['date', 'who', 'recur', 'lead', 'evening', 'fromDone', 'notes', 'budget', 'kind']
  const build = (on: Set<TaskAxis>): TaskAxes => ({
    title: 't',
    date: on.has('date') ? '2026-11-12' : null,
    rotation: on.has('who') ? ['m1'] : [],
    recur: on.has('recur') ? WEEKLY : null,
    lead: on.has('lead') ? 3600 : null,
    announceEvening: on.has('evening'),
    recurFrom: on.has('fromDone') ? 'done' : 'anchor',
    notes: on.has('notes') ? 'n' : '',
    budgetCents: on.has('budget') ? 100 : null,
    kind: on.has('kind') ? 'plan' : null,
  })
  const ONE_OFF = new Set<TaskAxis>(['date'])
  const SERIES = new Set<TaskAxis>(['who', 'recur', 'lead', 'evening'])
  it('all 512: a task iff a dated one-off or a series, else home losing only the evening', () => {
    const seen = new Set<TaskFace>()
    for (let mask = 0; mask < 1 << flags.length; mask++) {
      const d = build(new Set(flags.filter((_, i) => mask & (1 << i))))
      const got = taskTarget(d)
      seen.add(got)
      const axes = axesOf(d)
      const plain = axes.every((a) => ONE_OFF.has(a)) || axes.every((a) => SERIES.has(a))
      if (plain) expect(got).toBe('task')
      else {
        expect(got).toBe('home')
        expect(unheldAxes('home', d).filter((a) => a !== 'evening')).toEqual([])
      }
    }
    expect([...seen].sort()).toEqual(['home', 'task'])
  })
})

describe('unheldAxes: what an edit cannot keep, by face', () => {
  it('a task keeps one of its two shapes: what neither holds is named', () => {
    expect(unheldAxes('task', { title: 'x', date: '2026-11-12' })).toEqual([])
    expect(unheldAxes('task', { title: 'x', recur: WEEKLY, rotation: ['a', 'b'], announceEvening: true })).toEqual([])
    expect(unheldAxes('task', { title: 'x', recur: WEEKLY, notes: 'n' })).toEqual(['notes'])
  })
  it('a home row keeps everything but the evening line', () => {
    expect(unheldAxes('home', { title: 'x', recur: WEEKLY, announceEvening: true, rotation: ['a', 'b'], notes: 'n' })).toEqual(['evening'])
  })
})

describe('faceAfter: an edit keeps its face while it shows every layer, and only ever moves up', () => {
  it('stays put when its face shows everything', () => {
    expect(faceAfter('task', { title: 'x', date: '2026-11-12' })).toBe('task')
    expect(faceAfter('task', { title: 'x', recur: WEEKLY, rotation: ['a'] })).toBe('task')
  })
  it('a task that gains notes becomes a home row', () => {
    expect(faceAfter('task', { title: 'x', notes: 'n' })).toBe('home')
  })
  it('never moves down: a home row stays home', () => {
    expect(faceAfter('home', { title: 'x' })).toBe('home')
  })
  it('the one combination no face shows: the evening line with a home-only layer goes home', () => {
    expect(faceAfter('task', { title: 'x', recur: WEEKLY, announceEvening: true, notes: 'n' })).toBe('home')
  })
})
