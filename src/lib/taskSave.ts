import type { QueryKey } from '@tanstack/react-query'
import type { RecurValue } from '../components/RecurPicker'
import type { Chore, HomeProject } from '../components/operator/types'
import { inputFromLocalDay, localDayFromInput } from './localDay'
import { parseMoney } from './money'
import { BOARD_KEY, CARNETS_KEY, CHORES_KEY, HOME_PROJECTS_KEY, MONTH_KEY, TASKS_KEY, TODOS_KEY } from './queryKeys'
import { anchorSecToDate, dateToAnchorSec, recurOf, todayAnchorDate } from './recurLabel'
import { healingClearBody, healingDeleteBody } from './staleDelete'
import { lookColour, subjectRefOf, type SubjectRef } from './subjects'
import { faceAfter, taskTarget, unheldAxes, type TaskAxis, type TaskFace } from './taskTarget'
import { rotationOf, type TaskItem } from './tasks'

// THE SAVE ADAPTER (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4). The one task form speaks only
// in layers: a title, when, who, « Sur quoi ? », effort, look, notes. Which endpoint a write
// goes to, and how a row's gestures are spelled, are decided here and nowhere else:
// `task-form-rule.test.ts` fails a form or a row that branches on a task's face.
//
// SINCE 0150 every task lives in one table. The FORM writes ONE endpoint, /api/tasks, in one
// spelling of every layer, and the server picks the face (lib/taskTarget: `taskTarget` for a new
// task, `faceAfter` for an edit, which may move it up). A ROW's gestures (tick, untick, delete,
// « Vider », « Reporter ») still go to its face's endpoint: chores, todos, home-projects are
// aliases that keep the semantics they always had (a chore's tick logs « qui a aidé », a
// to-do's delete heals a stale tmp- id), and a queued offline write from an older bundle calls
// them anyway. Each face is ONE entry of `FACES`, so the adapter never compares a face's name:
// it looks the face up.

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

/** A door's `?kind=`: only the two home kinds, anything else is no kind at all. */
export const doorKind = (v: string | null | undefined): TaskDraft['kind'] => (v === 'upkeep' || v === 'plan' ? v : null)

const axes = (d: TaskDraft) => ({ ...d, budgetCents: parseMoney(d.budget) })

/** The face a NEW task with these layers wears (the one rule, lib/taskTarget). */
export const draftTarget = (d: TaskDraft): TaskFace => taskTarget(axes(d))
/** What this draft will not keep once saved over a row of `face`: an edit moves the row up to
 *  the face that shows every layer, so this is empty but for « annoncer la veille » on a home
 *  row. The form says so rather than dropping it unsaid. */
export const draftUnheld = (face: TaskFace, d: TaskDraft): TaskAxis[] => unheldAxes(faceAfter(face, axes(d)), axes(d))

interface Face<Row> {
  endpoint: string
  /** Every surface that shows a row of this face, so a gesture refreshes them all. */
  keys: QueryKey[]
  /** The edit scene's path. */
  scene: (id: string) => string
  /** The cache the edit scene reads its row from, and how to find it there. */
  read: { key: QueryKey; path: string; find: (frame: unknown, id: string) => Row | undefined }
  toDraft: (row: Row) => TaskDraft
  tick: (item: TaskItem, on: boolean, doneAt: number | null) => Record<string, unknown>
  remove: (item: TaskRef) => Record<string, unknown>
  /** « Vider les cochés » over this face's ticked rows. */
  clear: (items: readonly TaskItem[]) => Record<string, unknown>
  /** « Reporter »: only the face with a snooze. */
  snoozes: boolean
}

const recurring = (d: TaskDraft) => d.recur != null
// A recurrence needs a day to count from; the form defaults it to today.
const anchorOf = (d: TaskDraft): number | null => dateToAnchorSec(d.date || (recurring(d) ? todayAnchorDate() : ''))

const TODO: Face<TaskItem> = {
  endpoint: 'todos',
  keys: [TODOS_KEY, TASKS_KEY, MONTH_KEY],
  scene: (id) => `/todo/${id}`,
  read: {
    key: TASKS_KEY,
    path: 'tasks',
    find: (frame, id) => (frame as { tasks?: TaskItem[] } | undefined)?.tasks?.find((x) => x.key === `todo:${id}`),
  },
  toDraft: (t) => emptyDraft({ title: t.title, date: inputFromLocalDay(t.day), subject: t.subject, icon: t.icon, colour: t.color, effort: t.effort }),
  tick: (item, on, doneAt) => ({ id: item.id, done: on, ...(on ? { doneAt } : {}) }),
  // A to-do mints optimistic tmp- ids, so its DELETE carries what lets the server heal one.
  remove: (item) => healingDeleteBody(item.id, item.title),
  // A to-do goes for good, and a stale id heals (lib/staleDelete).
  clear: (items) => healingClearBody(items.map((x) => ({ id: x.id, text: x.title }))),
  snoozes: false,
}

const CHORE: Face<Chore> = {
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
  tick: (item, on, doneAt) => (on ? { id: item.id, complete: true, doneAt } : { id: item.id, undo: true }),
  remove: (item) => ({ id: item.id }),
  // A chore or a home row is history: the clear stamps cleared_at and deletes nothing.
  clear: (items) => ({ clearChecked: true, ids: items.map((x) => x.id) }),
  snoozes: false,
}

const HOME: Face<HomeProject> = {
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
  tick: (item, on, doneAt) => (on ? { id: item.id, doneAt } : { id: item.id, undo: true }),
  remove: (item) => ({ id: item.id }),
  // A chore or a home row is history: the clear stamps cleared_at and deletes nothing.
  clear: (items) => ({ clearChecked: true, ids: items.map((x) => x.id) }),
  snoozes: true,
}

const FACES: { todo: Face<TaskItem>; chore: Face<Chore>; home: Face<HomeProject> } = { todo: TODO, chore: CHORE, home: HOME }
const faceOf = (f: TaskFace): Face<never> => FACES[f] as unknown as Face<never>

type TaskMethod = 'POST' | 'PATCH'
export interface TaskWrite {
  endpoint: string
  method: TaskMethod
  body: Record<string, unknown>
  affectedKeys: QueryKey[]
}

// Every face's surfaces: a save may land in, or move a row to, any of them.
const ALL_KEYS: QueryKey[] = [BOARD_KEY, TASKS_KEY, CHORES_KEY, TODOS_KEY, HOME_PROJECTS_KEY, MONTH_KEY, CARNETS_KEY]

/** The form's layers in the one spelling /api/tasks reads. The date goes twice, as each face
 *  stores it (a to-do's household-local midnight, the scheduled faces' UTC anchor), because the
 *  face is the server's answer. */
const layers = (d: TaskDraft) => ({
  title: d.title.trim(),
  subject: d.subject,
  icon: d.icon,
  color: d.colour,
  effort: d.effort,
  day: localDayFromInput(d.date),
  at: anchorOf(d),
  recur: d.recur,
  recurFrom: d.recurFrom,
  leadSeconds: d.lead,
  announceEvening: d.announceEvening,
  rotation: d.rotation,
  notes: d.notes.trim() || null,
  budgetCents: parseMoney(d.budget),
  kind: d.kind,
})

/** The one write a save makes: a NEW task (POST) or an edit of the row `existing` names (PATCH),
 *  both to /api/tasks. The server picks the face. */
export function taskWrite(draft: TaskDraft, existing?: { table: TaskFace; id: string } | null): TaskWrite {
  const method: TaskMethod = existing ? 'PATCH' : 'POST'
  const body = existing ? { id: existing.id, ...layers(draft) } : layers(draft)
  // A descriptor, not a write: the form hands it to useWrite (offline outbox, CSRF, undo).
  return { endpoint: 'tasks', method, body, affectedKeys: ALL_KEYS }
}

/** A row its face's GET returned, as the form's draft (a modal that already holds the row). */
export const rowDraft = (face: TaskFace, row: unknown): TaskDraft => (faceOf(face).toDraft as (r: unknown) => TaskDraft)(row)

/** How the edit scene finds a row: the cache, the endpoint, and the row → draft step. */
export function taskRead(face: TaskFace) {
  const t = faceOf(face)
  return { key: t.read.key, path: t.read.path, draftOf: (frame: unknown, id: string): TaskDraft | undefined => {
    const row = t.read.find(frame, id)
    return row ? (t.toDraft as (r: unknown) => TaskDraft)(row) : undefined
  } }
}

// What a ROW of the merged list writes, for useTaskActions: the same lookup, so a tick, a
// delete or a rename never asks which face it is either.
/** A row named by its face, id and title: enough to delete it, from a row or from its form. */
export type TaskRef = Pick<TaskItem, 'source' | 'id' | 'title'>

export const taskEndpoint = (item: Pick<TaskItem, 'source'>): string => faceOf(item.source).endpoint
export const taskKeys = (item: Pick<TaskItem, 'source'>): QueryKey[] => faceOf(item.source).keys
export const taskScene = (item: Pick<TaskItem, 'source' | 'id'>): string => faceOf(item.source).scene(item.id)
export const tickBody = (item: TaskItem, on: boolean, doneAt: number | null) => faceOf(item.source).tick(item, on, doneAt)
export const removeBody = (item: TaskRef) => faceOf(item.source).remove(item)
export const canPostpone = (item: Pick<TaskItem, 'source'>): boolean => faceOf(item.source).snoozes
/** « Reporter » a row whose face has a snooze: a week, or to its next occurrence. */
export function postponeWrite(item: TaskItem, mode: 'week' | 'cycle'): TaskWrite {
  const t = faceOf(item.source)
  const method: TaskMethod = 'PATCH'
  return { endpoint: t.endpoint, method, body: { id: item.id, snooze: mode }, affectedKeys: t.keys }
}

/** « Vider les cochés » across faces: one write per face that has a ticked row. */
export function clearWrites(items: readonly TaskItem[]): TaskWrite[] {
  const by = new Map<TaskFace, TaskItem[]>()
  for (const x of items) by.set(x.source, [...(by.get(x.source) ?? []), x])
  return [...by].map(([face, rows]) => {
    const t = faceOf(face)
    const method: TaskMethod = 'PATCH'
    return { endpoint: t.endpoint, method, body: t.clear(rows), affectedKeys: t.keys }
  })
}
