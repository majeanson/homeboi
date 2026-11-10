import { describe, expect, it } from 'vitest'
import { localDayStart, todayLocalDay } from './localDay'
import { canPostpone, clearWrites, draftUnheld, emptyDraft, postponeWrite, removeBody, taskEndpoint, taskRead, taskScene, taskWrite, tickBody } from './taskSave'
import type { TaskItem } from './tasks'

// THE SAVE ADAPTER: the bodies the one form sends. Every save goes to /api/tasks in one
// spelling, and the SERVER picks the face. worker/taskForm.d1.test.ts sends these same
// literals to the real endpoint (it cannot import this module: workerd has no DOM), so a change
// here that is not mirrored there fails one of the two.
const WEEKLY = { freq: 'weekly' as const, interval: 1, weekdays: [2] }
const BARE = {
  subject: null,
  icon: null,
  color: null,
  effort: null,
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
  it('a date is ONE value: the household-local midnight of that day, for every task', () => {
    expect(taskWrite(emptyDraft({ title: 'Formulaire', date: '2030-03-14' })).body).toEqual({
      title: 'Formulaire',
      ...BARE,
      at: localDayStart(new Date(Date.UTC(2030, 2, 14, 12))),
    })
  })
  it('a recurrence with no date counts from today, a local midnight', () => {
    const w = taskWrite(emptyDraft({ title: 'Bac', recur: WEEKLY }))
    expect(w.body).toMatchObject({ recur: WEEKLY, at: todayLocalDay() })
  })
  it('notes, a budget and a door’s kind ride along as typed; the server decides what they mean', () => {
    expect(taskWrite(emptyDraft({ title: 'Cuisine', notes: ' trois devis ', budget: '15 000', kind: 'plan' })).body).toMatchObject({ notes: 'trois devis', budgetCents: 1_500_000, kind: 'plan' })
  })
  it('an edit PATCHes the same body with its id, whatever face the row wears', () => {
    const w = taskWrite(emptyDraft({ title: 'Toit', subject: { kind: 'carnet', id: 'k1' } }), { table: 'task', id: 't1' })
    expect(w).toMatchObject({ endpoint: 'tasks', method: 'PATCH', body: { id: 't1', title: 'Toit', subject: { kind: 'carnet', id: 'k1' } } })
    // Every surface hears it: an edit can move a row from one face to another.
    expect(w.affectedKeys.length).toBe(7)
  })
})

describe('draftUnheld: an edit moves up instead of dropping a layer', () => {
  it('a task that gains a recurrence and notes keeps both (it becomes a home row)', () => {
    expect(draftUnheld('task', emptyDraft({ title: 'Toit', recur: WEEKLY, notes: 'x' }))).toEqual([])
  })
  it('the one combination no face shows: the evening line with a home-only layer', () => {
    expect(draftUnheld('task', emptyDraft({ title: 'Bac', recur: WEEKLY, announceEvening: true, notes: 'x' }))).toEqual(['evening'])
  })
})

const item = (over: Partial<TaskItem>): TaskItem => ({
  key: 'task:a', source: 'task', id: 'a', title: 'A', color: null, icon: null, effort: null, subject: null, kind: null, recurring: false, recurJson: null,
  day: null, dueToday: false, overdueSince: null, snoozedUntil: null, soon: false, done: 'open', doneAt: null, who_id: null, team: [], onBoard: false, ...over,
})

describe('what a row writes: one door, one spelling, whatever the row is', () => {
  it('ticks and unticks, the same body for every task', () => {
    expect(tickBody(item({}), true, 5)).toEqual({ id: 'a', done: true, doneAt: 5 })
    expect(tickBody(item({ source: 'home', kind: 'upkeep' }), true, 5)).toEqual({ id: 'a', done: true, doneAt: 5 })
    expect(tickBody(item({ source: 'home' }), false, null)).toEqual({ id: 'a', done: false })
    expect([taskEndpoint(item({})), taskEndpoint(item({ source: 'home' }))]).toEqual(['tasks', 'tasks'])
  })
  it('a delete always says what it was and when, so a stale id heals or answers 404', () => {
    expect(removeBody(item({}))).toMatchObject({ id: 'a', text: 'A' })
    expect(removeBody(item({ source: 'home' }))).toMatchObject({ id: 'a', text: 'A' })
  })
  it('scenes: a task, or a home row', () => {
    expect([taskScene(item({})), taskScene(item({ source: 'home' }))]).toEqual(['/todo/a', '/home-project/a'])
  })
  it('a frame persisted before 0153 still names a face that is gone: it is a task', () => {
    const old = item({ source: 'chore' as unknown as TaskItem['source'] })
    expect(taskScene(old)).toBe('/todo/a')
    expect(canPostpone(old)).toBe(false)
  })
  it('« Reporter » is a home row’s gesture, through the same door', () => {
    expect([canPostpone(item({})), canPostpone(item({ source: 'home' }))]).toEqual([false, true])
    expect(postponeWrite(item({ source: 'home' }), 'week')).toMatchObject({ endpoint: 'tasks', method: 'PATCH', body: { id: 'a', snooze: 'week' } })
  })
  it('« Vider les cochés » is ONE write, with what heals a stale id', () => {
    const w = clearWrites([item({ id: 't', title: 'T' }), item({ id: 'c', title: 'C' }), item({ source: 'home', id: 'h', title: 'H' })])
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ endpoint: 'tasks', method: 'PATCH', body: { clearChecked: true, ids: ['t', 'c', 'h'], items: [{ id: 't', text: 'T' }, { id: 'c', text: 'C' }, { id: 'h', text: 'H' }] } })
    expect(clearWrites([])).toEqual([])
  })
  it('the edit scene reads a task from the alias that serves every task with its schedule', () => {
    const r = taskRead('task')
    expect(r.path).toBe('chores')
    const day = localDayStart(new Date(Date.UTC(2030, 2, 14, 12)))
    expect(r.draftOf({ chores: [{ id: 'a', title: 'Toit', recur_start: day, subject_kind: 'pet', subject_id: 'p' }] }, 'a')).toMatchObject({ title: 'Toit', subject: { kind: 'pet', id: 'p' }, date: '2030-03-14' })
    expect(r.draftOf({ chores: [] }, 'a')).toBeUndefined()
  })
})
