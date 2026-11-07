import { describe, expect, it } from 'vitest'
import { addLocalDays, localDayStart } from './ids'
import { choreTask, homeTask, isLooseTodo, todoTask, type ChoreTaskRow, type HomeTaskRow, type TodoTaskRow } from './taskItem'

// « Done means three things today » was the plan's first risk. It means one thing per case
// now, and these are the cases, one per row, against the real scheduler.

const today = localDayStart(new Date('2026-11-06T17:00:00Z'))
const yesterday = addLocalDays(today, -1)
const noon = today + 12 * 3600

const chore = (over: Partial<ChoreTaskRow>): ChoreTaskRow => ({
  id: 'c',
  title: 'Sortir le bac',
  color: null,
  rotation_json: '[]',
  current_idx: 0,
  last_done_at: null,
  cleared_at: null,
  recur_json: null,
  recur_start: null,
  lead_seconds: null,
  subject_kind: null,
  subject_id: null,
  created_at: addLocalDays(today, -30),
  ...over,
})
const home = (over: Partial<HomeTaskRow>): HomeTaskRow => ({
  id: 'h',
  kind: 'upkeep',
  title: 'Gouttières',
  color: null,
  at: null,
  recur_json: null,
  recur_from: 'anchor',
  lead_seconds: null,
  last_done_at: null,
  snoozed_until: null,
  cleared_at: null,
  rotation_json: '[]',
  current_idx: 0,
  carnet_id: null,
  subject_kind: null,
  subject_id: null,
  ...over,
})
const todo = (over: Partial<TodoTaskRow>): TodoTaskRow => ({
  id: 't',
  title: 'Appeler',
  day: null,
  member_id: null,
  done_at: null,
  section: null,
  source_template_id: null,
  ...over,
})
const weekly = JSON.stringify({ freq: 'weekly', interval: 1, weekdays: [] })

describe('a task, read side', () => {
  it('a one-off with no date is someday: not on the board, not overdue', () => {
    expect(todoTask(todo({}), today)).toMatchObject({ day: null, done: 'open', onBoard: false, overdueSince: null })
  })

  // choreSchedule falls back to created_at, a RECURRENCE anchor. Read as a due date it
  // would make every undated chore overdue since the day it was typed.
  it('an undated one-off chore is someday too, whatever its created_at', () => {
    expect(choreTask(chore({}), today, noon)).toMatchObject({ day: null, overdueSince: null, onBoard: false })
  })

  it('a dated one-off is due on its day and owed after it', () => {
    expect(todoTask(todo({ day: today }), today)).toMatchObject({ dueToday: true, onBoard: true })
    expect(todoTask(todo({ day: yesterday }), today)).toMatchObject({ dueToday: false, overdueSince: yesterday, onBoard: true })
    expect(homeTask(home({ at: yesterday }), today, noon)).toMatchObject({ overdueSince: yesterday, onBoard: true })
  })

  it('a checked one-off stays ticked for the day, on all three tables', () => {
    expect(todoTask(todo({ done_at: noon }), today)).toMatchObject({ done: 'ticked', doneAt: noon, onBoard: true })
    expect(choreTask(chore({ last_done_at: noon }), today, noon)).toMatchObject({ done: 'ticked', onBoard: true })
    expect(homeTask(home({ last_done_at: noon }), today, noon)).toMatchObject({ done: 'ticked', onBoard: true })
  })

  it('…then clears by itself when the day ends, with nothing rewritten', () => {
    const lastNight = today - 60
    expect(todoTask(todo({ done_at: lastNight }), today)).toBeNull()
    expect(choreTask(chore({ last_done_at: lastNight }), today, noon)).toBeNull()
    expect(homeTask(home({ last_done_at: lastNight, at: yesterday }), today, noon)).toBeNull()
  })

  // The tick carries its real moment, so replaying it at 00:10 asks the same question.
  it('an offline tick replayed after midnight keeps its real day: already cleared', () => {
    expect(todoTask(todo({ done_at: yesterday + 23 * 3600 }), today)).toBeNull()
  })

  it('« Effacer les cochées » clears sooner, and a fresh tick reads ticked again', () => {
    expect(choreTask(chore({ last_done_at: noon, cleared_at: noon + 60 }), today, noon)).toBeNull()
    expect(homeTask(home({ last_done_at: noon + 120, cleared_at: noon + 60 }), today, noon)).toMatchObject({ done: 'ticked' })
  })

  it('a recurring task is never done: a check moves it to its next date', () => {
    const anchor = addLocalDays(today, -7)
    const due = choreTask(chore({ recur_json: weekly, recur_start: anchor }), today, noon)!
    expect(due).toMatchObject({ dueToday: true, done: 'open', onBoard: true, recurring: true })
    const moved = choreTask(chore({ recur_json: weekly, recur_start: anchor, last_done_at: noon }), today, noon)!
    expect(moved).toMatchObject({ dueToday: false, done: 'open', doneAt: noon, onBoard: false, day: addLocalDays(today, 7) })
  })

  it('one scheduler for a missed cycle, on chores as on upkeep', () => {
    const anchor = addLocalDays(today, -9)
    expect(choreTask(chore({ recur_json: weekly, recur_start: anchor }), today, noon)).toMatchObject({ overdueSince: addLocalDays(today, -2), onBoard: true })
    expect(homeTask(home({ recur_json: weekly, at: anchor }), today, noon)).toMatchObject({ overdueSince: addLocalDays(today, -2), onBoard: true })
  })

  it('a snoozed task is quiet, and off the board', () => {
    const until = addLocalDays(today, 3)
    expect(homeTask(home({ at: yesterday, snoozed_until: until }), today, noon)).toMatchObject({ overdueSince: null, snoozedUntil: until, day: until, onBoard: false })
  })

  it('a rotation says whose turn it is, a todo says its one person', () => {
    expect(choreTask(chore({ rotation_json: '["a","b"]', current_idx: 3 }), today, noon)).toMatchObject({ who_id: 'b', team: ['a', 'b'] })
    expect(homeTask(home({ rotation_json: '["a","b"]', current_idx: 2 }), today, noon)).toMatchObject({ who_id: 'a' })
    expect(todoTask(todo({ member_id: 'a' }), today)).toMatchObject({ who_id: 'a', team: [] })
  })

  it('a home row reads its carnet as a subject, like any other kind', () => {
    expect(homeTask(home({ carnet_id: 'c1' }), today, noon)?.subject).toEqual({ kind: 'carnet', id: 'c1' })
    expect(todoTask(todo({ subject_kind: 'pet', subject_id: 'p1' }), today)?.subject).toEqual({ kind: 'pet', id: 'p1' })
    expect(todoTask(todo({ subject_kind: 'moon', subject_id: 'p1' }), today)?.subject).toBeNull()
  })

  it('a departure checklist instance is not a task', () => {
    expect(todoTask(todo({ source_template_id: 'tpl', section: 'Avant de partir', day: today }), today)).toBeNull()
    expect(todoTask(todo({ source_template_id: 'departure-adhoc', day: today }), today)).toBeNull()
    expect(todoTask(todo({ section: 'Vieille liste' }), today)).toBeNull()
    expect(isLooseTodo({ source_template_id: null, section: null })).toBe(true)
  })
})
