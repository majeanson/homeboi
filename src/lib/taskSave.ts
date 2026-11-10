import type { QueryKey } from '@tanstack/react-query'
import type { RecurValue } from '../components/RecurPicker'
import type { Chore, HomeProject } from '../components/operator/types'
import { inputFromLocalDay, localDayFromInput, todayLocalDay } from './localDay'
import { parseMoney } from './money'
import { BOARD_KEY, CARNETS_KEY, CHORES_KEY, HOME_PROJECTS_KEY, MONTH_KEY, TASKS_KEY, TODOS_KEY } from './queryKeys'
import { recurOf } from './recurLabel'
import { healingClearBody, healingDeleteBody } from './staleDelete'
import { lookColour, subjectRefOf, type SubjectRef } from './subjects'
import { faceAfter, taskTarget, unheldAxes, type TaskAxis, type TaskFace } from './taskTarget'
import { rotationOf, type TaskItem } from './tasks'

// THE SAVE ADAPTER (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4). The one task form speaks only
// in layers: a title, when, who, « Sur quoi ? », effort, look, notes. Which endpoint a write
// goes to, and how a row's gestures are spelled, are decided here and nowhere else:
// `task-form-rule.test.ts` fails a form or a row that branches on a task's face.
//
// ONE DOOR. Since 0153 every write goes to /api/tasks: the form's create and edit, and every
// row's tick, untick, delete, « Vider » and « Reporter », the same for every task
// (functions/_lib/taskGestures.ts). The aliases (chores, todos, home-projects) stay on the
// server for a queued offline write from an older bundle; nothing here calls them.
//
// TWO FACES, neither a type: a TASK, or a HOME row (a project or an entretien). They differ in
// where the edit scene reads its row and in one gesture, « Reporter », which only a home row
// has. Each face is ONE entry of `FACES`, so the adapter never compares a face's name.
//
// THE DAY is a household-local midnight, written and read through one pair
// (`localDayFromInput` / `inputFromLocalDay`), the same the server stores (functions/_lib/taskDay).

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
  /** The edit scene's path. */
  scene: (id: string) => string
  /** The cache the edit scene reads its row from, and how to find it there. */
  read: { key: QueryKey; path: string; find: (frame: unknown, id: string) => Row | undefined }
  toDraft: (row: Row) => TaskDraft
  /** « Reporter »: only the face with a snooze. */
  snoozes: boolean
}

const recurring = (d: TaskDraft) => d.recur != null
// The task's day: a household-local midnight. A recurrence needs one to count from: today.
const dayOf = (d: TaskDraft): number | null => localDayFromInput(d.date) ?? (recurring(d) ? todayLocalDay() : null)

// A task, read from the alias that serves every task with its whole schedule (its start, its
// lead), which the Tâches frame does not carry.
const TASK: Face<Chore> = {
  scene: (id) => `/todo/${id}`,
  read: { key: CHORES_KEY, path: 'chores', find: (frame, id) => (frame as { chores?: Chore[] } | undefined)?.chores?.find((c) => c.id === id) },
  toDraft: (c) =>
    emptyDraft({
      title: c.title,
      date: inputFromLocalDay(c.recur_start ?? null),
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
  snoozes: false,
}

const HOME: Face<HomeProject> = {
  scene: (id) => `/home-project/${id}`,
  read: {
    key: HOME_PROJECTS_KEY,
    path: 'home-projects',
    find: (frame, id) => (frame as { projects?: HomeProject[] } | undefined)?.projects?.find((p) => p.id === id),
  },
  toDraft: (p) =>
    emptyDraft({
      title: p.title,
      date: inputFromLocalDay(p.at ?? null),
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
  snoozes: true,
}

const FACES: { task: Face<Chore>; home: Face<HomeProject> } = { task: TASK, home: HOME }
// A frame persisted before 0153 (the offline cache restores it at boot) can still name a face
// that no longer exists: anything that is not a home row is a task.
const faceOf = (f: TaskFace): Face<never> => (FACES[f] ?? FACES.task) as unknown as Face<never>

type TaskMethod = 'POST' | 'PATCH'
export interface TaskWrite {
  endpoint: string
  method: TaskMethod
  body: Record<string, unknown>
  affectedKeys: QueryKey[]
}

// Every surface that shows a task: a write may land in, or move a row to, any of them.
const ALL_KEYS: QueryKey[] = [BOARD_KEY, TASKS_KEY, CHORES_KEY, TODOS_KEY, HOME_PROJECTS_KEY, MONTH_KEY, CARNETS_KEY]

/** The form's layers in the one spelling /api/tasks reads. */
const layers = (d: TaskDraft) => ({
  title: d.title.trim(),
  subject: d.subject,
  icon: d.icon,
  color: d.colour,
  effort: d.effort,
  at: dayOf(d),
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

// What a ROW of the merged list writes, for useTaskActions: one door, one spelling, whatever
// the row is.
/** A row named by its face, id and title: enough to delete it, from a row or from its form. */
export type TaskRef = Pick<TaskItem, 'source' | 'id' | 'title'>

export const taskEndpoint = (_item?: unknown): string => 'tasks'
export const taskKeys = (_item?: unknown): QueryKey[] => ALL_KEYS
export const taskScene = (item: Pick<TaskItem, 'source' | 'id'>): string => faceOf(item.source).scene(item.id)
/** A tick, or its untick, at the moment it was made (an offline one keeps its real day). */
export const tickBody = (item: Pick<TaskItem, 'id'>, on: boolean, doneAt: number | null) => ({ id: item.id, done: on, ...(on ? { doneAt } : {}) })
/** A delete says what it was and when, so the server heals a stale tmp- id or answers 404. */
export const removeBody = (item: TaskRef) => healingDeleteBody(item.id, item.title)
export const canPostpone = (item: Pick<TaskItem, 'source'>): boolean => faceOf(item.source).snoozes
/** « Reporter » a row whose face has a snooze: a week, or to its next occurrence. */
export function postponeWrite(item: TaskItem, mode: 'week' | 'cycle'): TaskWrite {
  const method: TaskMethod = 'PATCH'
  return { endpoint: 'tasks', method, body: { id: item.id, snooze: mode }, affectedKeys: ALL_KEYS }
}

/** « Vider les cochés »: ONE write for every ticked task, history kept, a stale id healed. */
export function clearWrites(items: readonly TaskItem[]): TaskWrite[] {
  if (items.length === 0) return []
  const method: TaskMethod = 'PATCH'
  return [{ endpoint: 'tasks', method, body: healingClearBody(items.map((x) => ({ id: x.id, text: x.title }))), affectedKeys: ALL_KEYS }]
}
