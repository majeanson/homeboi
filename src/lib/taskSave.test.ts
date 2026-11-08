import { describe, expect, it } from 'vitest'
import { localDayStart } from './localDay'
import { clearWrites, draftUnheld, emptyDraft, removeBody, taskRead, taskScene, taskWrite, tickBody } from './taskSave'
import type { TaskItem } from './tasks'

// THE SAVE ADAPTER: the bodies the one form sends. worker/taskForm.d1.test.ts sends these same
// literals to the real endpoints (it cannot import this module: workerd has no DOM), so a change
// here that is not mirrored there fails one of the two.
const NONE = { subject: null, icon: null, color: null, effort: null }
const UTC = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 1000)
const WEEKLY = { freq: 'weekly' as const, interval: 1, weekdays: [2] }

describe('taskWrite: a new task goes where the rule says, spelled its table’s way', () => {
  it('a bare title is a to-do with no day', () => {
    expect(taskWrite(emptyDraft({ title: '  Appeler la garderie ' }))).toMatchObject({
      endpoint: 'todos',
      method: 'POST',
      body: { title: 'Appeler la garderie', ...NONE, day: null },
    })
  })
  it('a to-do’s date is a household-local midnight', () => {
    expect(taskWrite(emptyDraft({ title: 'Formulaire', date: '2030-03-14' })).body).toEqual({ title: 'Formulaire', ...NONE, day: localDayStart(new Date(Date.UTC(2030, 2, 14, 12))) })
  })
  it('a recurrence is a chore, anchored on its UTC start; lead and evening ride along', () => {
    expect(taskWrite(emptyDraft({ title: 'Sortir le bac', recur: WEEKLY, date: '2030-03-12', lead: 3600, announceEvening: true }))).toMatchObject({
      endpoint: 'chores',
      body: { title: 'Sortir le bac', ...NONE, rotation: [], recur: WEEKLY, start: UTC(2030, 3, 12), leadSeconds: 3600, announceEvening: true },
    })
  })
  it('notes and a budget go home; a one-off is a project', () => {
    expect(taskWrite(emptyDraft({ title: 'Cuisine', notes: ' trois devis ', budget: '15 000' }))).toMatchObject({
      endpoint: 'home-projects',
      body: { title: 'Cuisine', ...NONE, notes: 'trois devis', budgetCents: 1_500_000, at: null, recur: null, recurFrom: 'anchor', leadSeconds: null, rotation: [], kind: 'plan' },
    })
  })
  it('a person on a dated one-off goes home, with its date', () => {
    expect(taskWrite(emptyDraft({ title: 'Peinturer', date: '2030-03-14', rotation: ['m1'] })).body).toMatchObject({ at: UTC(2030, 3, 14), rotation: ['m1'], kind: 'plan' })
  })
  it('a recurring home row is upkeep unless the door said otherwise', () => {
    expect(taskWrite(emptyDraft({ title: 'Filtre', recur: WEEKLY, recurFrom: 'done' })).body).toMatchObject({ kind: 'upkeep', recurFrom: 'done' })
    expect(taskWrite(emptyDraft({ title: 'Cuisine', kind: 'plan', recur: WEEKLY })).body).toMatchObject({ kind: 'plan' })
  })
})

describe('taskWrite: an edit keeps its table and sends only what it holds', () => {
  it('a to-do edit PATCHes the day and the subject, and drops what it cannot hold', () => {
    const w = taskWrite(emptyDraft({ title: 'Toit', date: '2030-05-02', subject: { kind: 'carnet', id: 'k1' }, recur: WEEKLY, notes: 'x' }), { table: 'todo', id: 't1' })
    expect(w).toMatchObject({ endpoint: 'todos', method: 'PATCH' })
    expect(w.body).toEqual({ id: 't1', title: 'Toit', subject: { kind: 'carnet', id: 'k1' }, icon: null, color: null, effort: null, day: localDayStart(new Date(Date.UTC(2030, 4, 2, 12))) })
    expect(draftUnheld('todo', emptyDraft({ title: 'Toit', recur: WEEKLY, notes: 'x' }))).toEqual(['recur', 'notes'])
  })
  it('a home edit never sends a kind (the column is not editable)', () => {
    expect(taskWrite(emptyDraft({ title: 'X', kind: 'upkeep' }), { table: 'home', id: 'h1' }).body).not.toHaveProperty('kind')
  })
})

const item = (over: Partial<TaskItem>): TaskItem => ({
  key: 'todo:a', source: 'todo', id: 'a', title: 'A', color: null, icon: null, effort: null, subject: null, kind: null, recurring: false, recurJson: null,
  day: null, dueToday: false, overdueSince: null, snoozedUntil: null, soon: false, done: 'open', doneAt: null, who_id: null, team: [], onBoard: false, ...over,
})

describe('what a row writes, looked up by its table', () => {
  it('ticks, deletes and scenes', () => {
    expect(tickBody(item({}), true, 5)).toEqual({ id: 'a', done: true, doneAt: 5 })
    expect(tickBody(item({ source: 'chore' }), true, 5)).toEqual({ id: 'a', complete: true, doneAt: 5 })
    expect(tickBody(item({ source: 'home' }), false, null)).toEqual({ id: 'a', undo: true })
    expect(removeBody(item({ source: 'chore' }))).toEqual({ id: 'a' })
    expect(removeBody(item({}))).toMatchObject({ id: 'a', text: 'A' })
    expect([taskScene(item({})), taskScene(item({ source: 'chore' })), taskScene(item({ source: 'home' }))]).toEqual(['/todo/a', '/chore/a', '/home-project/a'])
  })
  it('« Vider les cochés » is one write per table that has a ticked row', () => {
    const w = clearWrites([item({ id: 't' }), item({ source: 'chore', id: 'c' }), item({ source: 'chore', id: 'd' })])
    expect(w.map((x) => [x.endpoint, x.body.ids])).toEqual([
      ['todos', ['t']],
      ['chores', ['c', 'd']],
    ])
  })
  it('the edit scene reads a to-do from the Tâches frame', () => {
    const r = taskRead('todo')
    expect(r.path).toBe('tasks')
    expect(r.draftOf({ tasks: [item({ title: 'Toit', subject: { kind: 'pet', id: 'p' } })] }, 'a')).toMatchObject({ title: 'Toit', subject: { kind: 'pet', id: 'p' }, date: '' })
    expect(r.draftOf({ tasks: [] }, 'a')).toBeUndefined()
  })
})
