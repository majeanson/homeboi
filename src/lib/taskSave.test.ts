import { describe, expect, it } from 'vitest'
import { localDayStart } from './localDay'
import { clearWrites, draftUnheld, emptyDraft, removeBody, taskRead, taskScene, taskWrite, tickBody } from './taskSave'
import type { TaskItem } from './tasks'

// THE SAVE ADAPTER: the bodies the one form sends. Since 0150 every save goes to /api/tasks in
// one spelling, and the SERVER picks the face. worker/taskForm.d1.test.ts sends these same
// literals to the real endpoint (it cannot import this module: workerd has no DOM), so a change
// here that is not mirrored there fails one of the two.
const UTC = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 1000)
const WEEKLY = { freq: 'weekly' as const, interval: 1, weekdays: [2] }
const BARE = {
  subject: null,
  icon: null,
  color: null,
  effort: null,
  day: null,
  at: null,
  recur: null,
  recurFrom: 'anchor',
  leadSeconds: null,
  announceEvening: false,
  rotation: [],
  notes: null,
  budgetCents: null,
  kind: null,
}

describe('taskWrite: one endpoint, one spelling of every layer', () => {
  it('a bare title: every layer empty', () => {
    expect(taskWrite(emptyDraft({ title: '  Appeler la garderie ' }))).toMatchObject({ endpoint: 'tasks', method: 'POST', body: { title: 'Appeler la garderie', ...BARE } })
  })
  it('a date goes twice: a household-local midnight (a to-do’s) and a UTC anchor (the scheduled faces’)', () => {
    expect(taskWrite(emptyDraft({ title: 'Formulaire', date: '2030-03-14' })).body).toEqual({
      title: 'Formulaire',
      ...BARE,
      day: localDayStart(new Date(Date.UTC(2030, 2, 14, 12))),
      at: UTC(2030, 3, 14),
    })
  })
  it('a recurrence with no date counts from today', () => {
    const w = taskWrite(emptyDraft({ title: 'Bac', recur: WEEKLY }))
    expect(w.body).toMatchObject({ recur: WEEKLY, day: null })
    expect(typeof w.body.at).toBe('number')
  })
  it('notes, a budget and a door’s kind ride along as typed; the server decides what they mean', () => {
    expect(taskWrite(emptyDraft({ title: 'Cuisine', notes: ' trois devis ', budget: '15 000', kind: 'plan' })).body).toMatchObject({ notes: 'trois devis', budgetCents: 1_500_000, kind: 'plan' })
  })
  it('an edit PATCHes the same body with its id, whatever face the row wears', () => {
    const w = taskWrite(emptyDraft({ title: 'Toit', subject: { kind: 'carnet', id: 'k1' } }), { table: 'todo', id: 't1' })
    expect(w).toMatchObject({ endpoint: 'tasks', method: 'PATCH', body: { id: 't1', title: 'Toit', subject: { kind: 'carnet', id: 'k1' } } })
    // Every face's surfaces hear it: an edit can move a row from one face to another.
    expect(w.affectedKeys.length).toBe(7)
  })
})

describe('draftUnheld: an edit moves up instead of dropping a layer', () => {
  it('a to-do that gains a recurrence and notes keeps both (it becomes a home row)', () => {
    expect(draftUnheld('todo', emptyDraft({ title: 'Toit', recur: WEEKLY, notes: 'x' }))).toEqual([])
  })
  it('the one combination no face shows: the evening line with a home-only layer', () => {
    expect(draftUnheld('chore', emptyDraft({ title: 'Bac', recur: WEEKLY, announceEvening: true, notes: 'x' }))).toEqual(['evening'])
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
