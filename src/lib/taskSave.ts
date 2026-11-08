import type { QueryKey } from '@tanstack/react-query'
import type { RecurValue } from '../components/RecurPicker'
import type { Chore, HomeProject } from '../components/operator/types'
import { inputFromLocalDay, localDayFromInput } from './localDay'
import { parseMoney } from './money'
import { BOARD_KEY, CARNETS_KEY, CHORES_KEY, HOME_PROJECTS_KEY, MONTH_KEY, TASKS_KEY, TODOS_KEY } from './queryKeys'
import { anchorSecToDate, dateToAnchorSec, recurOf, todayAnchorDate } from './recurLabel'
import { healingClearBody, healingDeleteBody } from './staleDelete'
import { lookColour, subjectRefOf, type SubjectRef } from './subjects'
import { taskTarget, unheldAxes, type TaskAxis, type TaskTable } from './taskTarget'
import { rotationOf, type TaskItem } from './tasks'

// THE SAVE ADAPTER (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4). The one task form speaks only
// in layers: a title, when, who, « Sur quoi ? », effort, look, notes. WHICH TABLE a row lives
// in, which endpoint it is written to, and how each table spells a field are decided here and
// in `taskTarget` (lib/taskTarget.ts), and nowhere else: `task-form-rule.test.ts` fails a form
// or a row that branches on a task's table. When `tasks` and `todos` merge, this file changes
// and the form does not.
//
// Each table is ONE entry of `TABLES`, so the adapter itself never compares a table name: it
// looks the table up.

/** A task being written: every layer the form shows. Only `title` is required. */
export interface TaskDraft {
  title: string
  /** 'YYYY-MM-DD' or '': a one-off's day, or the day a recurrence counts from. */
  date: string
  recur: RecurValue | null
  recurFrom: 'anchor' | 'done'
  lead: number | null
  announceEvening: boolean
  /** [] anyone · [id] one person · several: « chacun son tour ». */
  rotation: string[]
  subject: SubjectRef | null
  icon: string | null
  /** null = « comme le sujet » (lookOf). */
  colour: string | null
  effort: number | null
  notes: string
  /** As typed (« 15 000 »); parsed on save. */
  budget: string
  /** Only ever from a door (?kind=, a carnet's Entretien) or the row being edited: no picker. */
  kind: 'plan' | 'upkeep' | null
}

export const emptyDraft = (seed: Partial<TaskDraft> = {}): TaskDraft => ({
  title: '',
  date: '',
  recur: null,
  recurFrom: 'anchor',
  lead: null,
  announceEvening: false,
  rotation: [],
  subject: null,
  icon: null,
  colour: null,
  effort: null,
  notes: '',
  budget: '',
  kind: null,
  ...seed,
})

/** A door's `?kind=`: only the two home_projects kinds, anything else is no kind at all. */
export const doorKind = (v: string | null | undefined): TaskDraft['kind'] => (v === 'upkeep' || v === 'plan' ? v : null)

const axes = (d: TaskDraft) => ({ ...d, budgetCents: parseMoney(d.budget) })

/** The table a NEW task with these layers goes to (the one rule, lib/taskTarget). */
export const draftTarget = (d: TaskDraft): TaskTable => taskTarget(axes(d))
/** What `table` cannot keep of this draft: the form says so rather than dropping it unsaid. */
export const draftUnheld = (table: TaskTable, d: TaskDraft): TaskAxis[] => unheldAxes(table, axes(d))

interface Table<Row> {
  endpoint: string
  /** Every surface that shows a row of this table, so a write refreshes them all. */
  keys: QueryKey[]
  /** The edit scene's path. */
  scene: (id: string) => string
  /** The cache the edit scene reads its row from, and how to find it there. */
  read: { key: QueryKey; path: string; find: (frame: unknown, id: string) => Row | undefined }
  toDraft: (row: Row) => TaskDraft
  /** The layers this table stores, spelled its way. Fields it cannot hold are not sent. */
  body: (d: TaskDraft) => Record<string, unknown>
  /** What a NEW row adds to `body`. */
  create?: (d: TaskDraft) => Record<string, unknown>
  tick: (item: TaskItem, on: boolean, doneAt: number | null) => Record<string, unknown>
  remove: (item: TaskRef) => Record<string, unknown>
  /** « Vider les cochés » over this table's ticked rows. */
  clear: (items: readonly TaskItem[]) => Record<string, unknown>
  /** « Reporter »: only the table with a snooze column. */
  snoozes: boolean
}

const recurring = (d: TaskDraft) => d.recur != null
// A recurrence needs a day to count from; the form defaults it to today.
const anchorOf = (d: TaskDraft): number | null => dateToAnchorSec(d.date || (recurring(d) ? todayAnchorDate() : ''))
const common = (d: TaskDraft) => ({ title: d.title.trim(), subject: d.subject, icon: d.icon, color: d.colour, effort: d.effort })

const TODO: Table<TaskItem> = {
  endpoint: 'todos',
  keys: [TODOS_KEY, TASKS_KEY, MONTH_KEY],
  scene: (id) => `/todo/${id}`,
  read: {
    key: TASKS_KEY,
    path: 'tasks',
    find: (frame, id) => (frame as { tasks?: TaskItem[] } | undefined)?.tasks?.find((x) => x.key === `todo:${id}`),
  },
  toDraft: (t) => emptyDraft({ title: t.title, date: inputFromLocalDay(t.day), subject: t.subject, icon: t.icon, colour: t.color, effort: t.effort }),
  // A to-do's day is a household-local midnight (todos.day), not the UTC anchor the two
  // scheduled tables use.
  body: (d) => ({ ...common(d), day: localDayFromInput(d.date) }),
  tick: (item, on, doneAt) => ({ id: item.id, done: on, ...(on ? { doneAt } : {}) }),
  // A to-do mints optimistic tmp- ids, so its DELETE carries what lets the server heal one.
  remove: (item) => healingDeleteBody(item.id, item.title),
  // A to-do goes for good, and a stale id heals (lib/staleDelete).
  clear: (items) => healingClearBody(items.map((x) => ({ id: x.id, text: x.title }))),
  snoozes: false,
}

const CHORE: Table<Chore> = {
  endpoint: 'chores',
  keys: [BOARD_KEY, TASKS_KEY, CHORES_KEY, MONTH_KEY],
  scene: (id) => `/chore/${id}`,
  read: { key: CHORES_KEY, path: 'chores', find: (frame, id) => (frame as { chores?: Chore[] } | undefined)?.chores?.find((c) => c.id === id) },
  toDraft: (c) =>
    emptyDraft({
      title: c.title,
      date: anchorSecToDate(c.recur_start),
      recur: recurOf(c.recur_json),
      lead: c.lead_seconds ?? null,
      announceEvening: !!c.announce_evening,
      rotation: rotationOf(c.rotation_json),
      subject: subjectRefOf(c),
      icon: c.icon ?? null,
      // A stored colour that is the column default was never a pick (lookColour).
      colour: lookColour(c.color),
      effort: c.effort ?? null,
    }),
  // A chore keeps a date only as its recurrence's start, and a lead or the evening line only
  // on a schedule.
  body: (d) => ({
    ...common(d),
    rotation: d.rotation,
    recur: d.recur,
    start: recurring(d) ? anchorOf(d) : null,
    leadSeconds: recurring(d) ? d.lead : null,
    announceEvening: recurring(d) ? d.announceEvening : false,
  }),
  tick: (item, on, doneAt) => (on ? { id: item.id, complete: true, doneAt } : { id: item.id, undo: true }),
  remove: (item) => ({ id: item.id }),
  // A chore or a home row is history: the clear stamps cleared_at and deletes nothing.
  clear: (items) => ({ clearChecked: true, ids: items.map((x) => x.id) }),
  snoozes: false,
}

const HOME: Table<HomeProject> = {
  endpoint: 'home-projects',
  keys: [BOARD_KEY, TASKS_KEY, HOME_PROJECTS_KEY, MONTH_KEY, CARNETS_KEY],
  scene: (id) => `/home-project/${id}`,
  read: {
    key: HOME_PROJECTS_KEY,
    path: 'home-projects',
    find: (frame, id) => (frame as { projects?: HomeProject[] } | undefined)?.projects?.find((p) => p.id === id),
  },
  toDraft: (p) =>
    emptyDraft({
      title: p.title,
      date: anchorSecToDate(p.at),
      recur: recurOf(p.recur_json),
      recurFrom: p.recur_from === 'done' ? 'done' : 'anchor',
      lead: p.lead_seconds ?? null,
      rotation: rotationOf(p.rotation_json),
      subject: subjectRefOf(p),
      icon: p.icon ?? null,
      colour: lookColour(p.color),
      effort: p.effort ?? null,
      notes: p.notes ?? '',
      budget: p.budget_cents != null ? String(p.budget_cents / 100) : '',
      kind: p.kind,
    }),
  body: (d) => {
    const at = anchorOf(d)
    return {
      ...common(d),
      notes: d.notes.trim() || null,
      budgetCents: parseMoney(d.budget),
      at,
      recur: d.recur,
      recurFrom: recurring(d) && d.recurFrom === 'done' ? 'done' : 'anchor',
      leadSeconds: at ? d.lead : null, // no date, no occurrence to remind about
      rotation: d.rotation,
    }
  },
  // The kind is never asked: a door may name it, else a recurring row is upkeep and a one-off
  // is a project (which other tasks can then be filed under).
  create: (d) => ({ kind: d.kind ?? (recurring(d) ? 'upkeep' : 'plan') }),
  tick: (item, on, doneAt) => (on ? { id: item.id, doneAt } : { id: item.id, undo: true }),
  remove: (item) => ({ id: item.id }),
  // A chore or a home row is history: the clear stamps cleared_at and deletes nothing.
  clear: (items) => ({ clearChecked: true, ids: items.map((x) => x.id) }),
  snoozes: true,
}

const TABLES: { todo: Table<TaskItem>; chore: Table<Chore>; home: Table<HomeProject> } = { todo: TODO, chore: CHORE, home: HOME }
const tableOf = (t: TaskTable): Table<never> => TABLES[t] as unknown as Table<never>

type TaskMethod = 'POST' | 'PATCH'
export interface TaskWrite {
  endpoint: string
  method: TaskMethod
  body: Record<string, unknown>
  affectedKeys: QueryKey[]
}

/** The one write a save makes: a NEW task goes where `draftTarget` says, an edit stays put. */
export function taskWrite(draft: TaskDraft, existing?: { table: TaskTable; id: string } | null): TaskWrite {
  const table = existing ? existing.table : draftTarget(draft)
  const t = tableOf(table)
  const method: TaskMethod = existing ? 'PATCH' : 'POST'
  const body = existing ? { id: existing.id, ...t.body(draft) } : { ...t.body(draft), ...t.create?.(draft) }
  // A descriptor, not a write: the form hands it to useWrite (offline outbox, CSRF, undo).
  return { endpoint: t.endpoint, method, body, affectedKeys: t.keys }
}

/** A row its table's GET returned, as the form's draft (a modal that already holds the row). */
export const rowDraft = (table: TaskTable, row: unknown): TaskDraft => (tableOf(table).toDraft as (r: unknown) => TaskDraft)(row)

/** How the edit scene finds a row: the cache, the endpoint, and the row → draft step. */
export function taskRead(table: TaskTable) {
  const t = tableOf(table)
  return { key: t.read.key, path: t.read.path, draftOf: (frame: unknown, id: string): TaskDraft | undefined => {
    const row = t.read.find(frame, id)
    return row ? (t.toDraft as (r: unknown) => TaskDraft)(row) : undefined
  } }
}

// What a ROW of the merged list writes, for useTaskActions: the same lookup, so a tick, a
// delete or a rename never asks which table it is in either.
/** A row named by its table, id and title: enough to delete it, from a row or from its form. */
export type TaskRef = Pick<TaskItem, 'source' | 'id' | 'title'>

export const taskEndpoint = (item: Pick<TaskItem, 'source'>): string => tableOf(item.source).endpoint
export const taskKeys = (item: Pick<TaskItem, 'source'>): QueryKey[] => tableOf(item.source).keys
export const taskScene = (item: Pick<TaskItem, 'source' | 'id'>): string => tableOf(item.source).scene(item.id)
export const tickBody = (item: TaskItem, on: boolean, doneAt: number | null) => tableOf(item.source).tick(item, on, doneAt)
export const removeBody = (item: TaskRef) => tableOf(item.source).remove(item)
export const canPostpone = (item: Pick<TaskItem, 'source'>): boolean => tableOf(item.source).snoozes
/** « Reporter » a row whose table has a snooze: a week, or to its next occurrence. */
export function postponeWrite(item: TaskItem, mode: 'week' | 'cycle'): TaskWrite {
  const t = tableOf(item.source)
  const method: TaskMethod = 'PATCH'
  return { endpoint: t.endpoint, method, body: { id: item.id, snooze: mode }, affectedKeys: t.keys }
}

/** « Vider les cochés » across tables: one write per table that has a ticked row. */
export function clearWrites(items: readonly TaskItem[]): TaskWrite[] {
  const by = new Map<TaskTable, TaskItem[]>()
  for (const x of items) by.set(x.source, [...(by.get(x.source) ?? []), x])
  return [...by].map(([table, rows]) => {
    const t = tableOf(table)
    const method: TaskMethod = 'PATCH'
    return { endpoint: t.endpoint, method, body: t.clear(rows), affectedKeys: t.keys }
  })
}
