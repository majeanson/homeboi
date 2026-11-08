import { describe, expect, it } from 'vitest'
import { axesOf, taskTarget, unheldAxes, type TaskAxes, type TaskAxis, type TaskTable } from './taskTarget'

const WEEKLY = { freq: 'weekly', interval: 1, weekdays: [2] }

describe('taskTarget: the one rule, by example', () => {
  it.each<[string, TaskAxes, TaskTable]>([
    ['a bare title is a to-do', { title: 'Appeler la garderie' }, 'todo'],
    ['a date alone is a to-do on that day', { title: 'Formulaire', date: '2026-11-12' }, 'todo'],
    ['a subject, a look and an effort never route', { title: 'Vérifier le toit' }, 'todo'],
    ['a recurrence is a chore', { title: 'Sortir le bac', recur: WEEKLY }, 'chore'],
    ['a recurrence with its start is a chore', { title: 'Sortir le bac', recur: WEEKLY, date: '2026-11-10' }, 'chore'],
    ['a person is a chore', { title: 'Ranger', rotation: ['m1'] }, 'chore'],
    ['« chacun son tour » is a chore', { title: 'Vaisselle', recur: WEEKLY, rotation: ['m1', 'm2'] }, 'chore'],
    ['a recurring lead is a chore', { title: 'Bac', recur: WEEKLY, lead: 86400 }, 'chore'],
    ['the evening before is a chore', { title: 'Bac', recur: WEEKLY, announceEvening: true }, 'chore'],
    ['notes go home', { title: 'Cuisine', notes: 'trois devis' }, 'home'],
    ['a budget goes home', { title: 'Cuisine', budgetCents: 1_500_000 }, 'home'],
    ['« à partir de la dernière fois » goes home', { title: 'Filtre', recur: WEEKLY, recurFrom: 'done' }, 'home'],
    ['a door’s kind goes home', { title: 'Gouttières', kind: 'upkeep' }, 'home'],
    ['a dated one-off with a person goes home (a chore keeps no one-off date)', { title: 'Peinturer', date: '2026-11-12', rotation: ['m1'] }, 'home'],
    ['a dated one-off with a lead goes home (a to-do keeps no lead)', { title: 'Vaccin', date: '2026-11-12', lead: 86400 }, 'home'],
    ['the evening before with notes fits no table: home, which holds the most', { title: 'Bac', recur: WEEKLY, announceEvening: true, notes: 'bleu' }, 'home'],
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

// Every combination of the nine layers: the answer is always the FIRST table that holds them
// all, and when none does it is home_projects, losing only the evening line.
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
  const order: TaskTable[] = ['todo', 'chore', 'home']
  it('all 512: the first table that holds them all, else home losing only the evening', () => {
    const seen = new Set<TaskTable>()
    for (let mask = 0; mask < 1 << flags.length; mask++) {
      const d = build(new Set(flags.filter((_, i) => mask & (1 << i))))
      const got = taskTarget(d)
      seen.add(got)
      const holding = order.filter((t) => unheldAxes(t, d).length === 0)
      if (holding.length > 0) expect(got).toBe(holding[0])
      else {
        expect(got).toBe('home')
        expect(unheldAxes('home', d)).toEqual(['evening'])
      }
    }
    expect([...seen].sort()).toEqual(['chore', 'home', 'todo'])
  })
})

describe('unheldAxes: what an edit cannot keep, by table', () => {
  it('a to-do keeps a date and nothing that needs a schedule or a person', () => {
    expect(unheldAxes('todo', { title: 'x', date: '2026-11-12', rotation: ['m1'], recur: WEEKLY, notes: 'n' })).toEqual(['who', 'recur', 'notes'])
  })
  it('a chore keeps no one-off date, notes, budget, « dernière fois » or kind', () => {
    expect(unheldAxes('chore', { title: 'x', date: '2026-11-12', notes: 'n', budgetCents: 1, kind: 'plan' })).toEqual(['date', 'notes', 'budget', 'kind'])
    expect(unheldAxes('chore', { title: 'x', recur: WEEKLY, recurFrom: 'done' })).toEqual(['fromDone'])
  })
  it('a home row keeps everything but the evening line', () => {
    expect(unheldAxes('home', { title: 'x', recur: WEEKLY, announceEvening: true, rotation: ['a', 'b'], notes: 'n' })).toEqual(['evening'])
  })
})
