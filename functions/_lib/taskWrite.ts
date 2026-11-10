import { normalizeRecur } from './recur'
import { rotationJson } from './rotation'
import { validSubject, type SubjectRef } from './subject'
import { emojiIcon, hexColor, hexColorOrNull, taskEffort } from './validate'
import { newId, nowSec } from './ids'
import { taskDay, taskDayOf } from './taskDay'
import type { Face } from './taskItem'
import { taskTarget } from '../../src/lib/taskTarget'

// A TASK, WRITE SIDE — what each layer of a task is stored as on the spine (0150), shared by
// the three alias endpoints (chores, todos, home-projects), the one form's door (/api/tasks)
// and the capture spine. Before the merge each endpoint spelled these on its own, and two of
// them had drifted copies of the same clamps.
//
// THE DAY. Every date a task stores (a one-off's day, a series' start) is a household-local
// midnight, written through ONE encoder, `taskDayOf` (_lib/taskDay.ts), whatever a body sent.

export const DEFAULT_COLOUR = '#88a36f'

export const recurJson = (recur: unknown): string | null => {
  const r = normalizeRecur(recur)
  return r ? JSON.stringify(r) : null
}

// A recurrence always carries its start (0152): every reader reads a NULL `at` as « no date »,
// so a series written without one counts from the day it is written. A one-off keeps its own
// day or none.
export const taskStart = (recurring: boolean, v: unknown): number | null => taskDayOf(v) ?? (recurring ? taskDay(nowSec()) : null)

// Calm « Bientôt » lead window (never a push, NFR-CALM-1): null or [1 s .. 7 days].
const MAX_LEAD = 7 * 86400
export const leadSeconds = (v: unknown): number | null => {
  const n = Number(v)
  return v != null && Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_LEAD) : null
}

// D-21: « annoncer la veille », stored 1 or NULL, never a bare 0 (unset and off read alike).
export const announceEvening = (v: unknown): number | null => (v ? 1 : null)

// Optional TARGET amount in cents (no progress-to-goal, NFR-CALM-1). null clears it.
export const budgetCents = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

export const notesOf = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

// What a recurrence counts from (0119): the fixed grid, or « à partir de la dernière fois ».
export const recurFromOf = (v: unknown): 'anchor' | 'done' => (v === 'done' ? 'done' : 'anchor')

// The two kinds a home row may be. A door names one; nothing else ever asks.
export const homeKind = (v: unknown): 'plan' | 'upkeep' => (v === 'upkeep' ? 'upkeep' : 'plan')

// One subject, two storages (0146): on a home row a carnet stays in carnet_id, where every older
// reader looks; a task keeps it in subject_kind/id.
export function subjectCols(face: Face, ref: SubjectRef | null): { carnet_id: string | null; subject_kind: string | null; subject_id: string | null } {
  if (face === 'home' && ref?.kind === 'carnet') return { carnet_id: ref.id, subject_kind: null, subject_id: null }
  return { carnet_id: null, subject_kind: ref?.kind ?? null, subject_id: ref?.id ?? null }
}

/** The one form's body (src/lib/taskSave.ts): every layer, one spelling. */
export interface TaskBody {
  title?: unknown
  /** The task's day: a one-off's date, or the day a recurrence counts from. */
  at?: unknown
  /** The same day as a bundle from before 0153 also sent it (a local midnight); it wins over
   *  that bundle's `at`, which was a UTC midnight. */
  day?: unknown
  recur?: unknown
  recurFrom?: unknown
  leadSeconds?: unknown
  announceEvening?: unknown
  rotation?: unknown
  subject?: unknown
  icon?: unknown
  color?: unknown
  effort?: unknown
  notes?: unknown
  budgetCents?: unknown
  kind?: unknown
}

/** The day a body names, through the one encoder. */
export const bodyDay = (b: Pick<TaskBody, 'at' | 'day'>): number | null => taskDayOf(b.day) ?? taskDayOf(b.at)

/** The layers that pick a face (src/lib/taskTarget.ts), read off a body. */
export function bodyAxes(b: TaskBody) {
  const recur = normalizeRecur(b.recur)
  return {
    title: typeof b.title === 'string' ? b.title : '',
    date: bodyDay(b),
    recur,
    recurFrom: recurFromOf(b.recurFrom),
    lead: leadSeconds(b.leadSeconds),
    announceEvening: !!b.announceEvening,
    rotation: Array.isArray(b.rotation) ? b.rotation.filter((x): x is string => typeof x === 'string') : [],
    notes: notesOf(b.notes),
    budgetCents: budgetCents(b.budgetCents),
    kind: b.kind === 'plan' || b.kind === 'upkeep' ? (b.kind as 'plan' | 'upkeep') : null,
  }
}

// The columns a face writes for the one form. Every column of the form's layers is written, so
// a face change (an edit that adds a layer) leaves no stale value behind.
export function faceColumns(face: Face, b: TaskBody, ref: SubjectRef | null): Record<string, unknown> {
  const recurring = normalizeRecur(b.recur) != null
  const subject = subjectCols(face, ref)
  const look = { icon: emojiIcon(b.icon), effort: taskEffort(b.effort) }
  if (face === 'task')
    return {
      ...look,
      ...subject,
      // A day: a one-off's own, or the day a series counts from (today when none was given).
      at: taskStart(recurring, b.day ?? b.at),
      // NULL = « comme le sujet » (lookOf); the old chores' sage default read the same.
      colour: hexColorOrNull(b.color),
      recur_json: recurJson(b.recur),
      recur_from: 'anchor',
      // A lead and the evening line only on a schedule (a dated one-off with a lead is a home
      // row: the one rule, src/lib/taskTarget.ts).
      lead_seconds: recurring ? leadSeconds(b.leadSeconds) : null,
      announce_evening: recurring ? announceEvening(b.announceEvening) : null,
      rotation_json: rotationJson(b.rotation),
      notes: null,
      budget_cents: null,
    }
  const at = bodyDay(b)
  return {
    ...look,
    ...subject,
    at,
    colour: hexColor(b.color, DEFAULT_COLOUR),
    recur_json: recurJson(b.recur),
    recur_from: recurring ? recurFromOf(b.recurFrom) : 'anchor',
    lead_seconds: at ? leadSeconds(b.leadSeconds) : null, // no date, no occurrence to remind about
    // The one layer a home row does not show (the board announces tasks only): the form says
    // so (`unheldAxes`), and the row does not pretend to keep it.
    announce_evening: null,
    rotation_json: rotationJson(b.rotation),
    notes: notesOf(b.notes),
    budget_cents: budgetCents(b.budgetCents),
  }
}

// The `kind` a face is stored as. A task has none (0153). A home row's kind comes from a door,
// else from its schedule (a recurrence is upkeep, a one-off is a project), the rule the form
// always had.
export const kindFor = (face: Face, b: Pick<TaskBody, 'kind'>, recurring: boolean): 'plan' | 'upkeep' | null =>
  face === 'home' ? homeKind(b.kind ?? (recurring ? 'upkeep' : 'plan')) : null

/** A NEW task, from any door: the face the one rule answers, its columns, its author (the
 *  profile the device acts as), on the spine. */
export async function insertTask(db: D1Database, hh: string, b: TaskBody, author: string | null, opts: { id?: string; at?: number; title: string; ref?: SubjectRef | null }): Promise<{ id: string; face: Face }> {
  const id = opts.id ?? newId()
  const ts = opts.at ?? nowSec()
  const axes = bodyAxes(b)
  const face = taskTarget(axes)
  const ref = opts.ref !== undefined ? opts.ref : await validSubject(db, hh, b.subject, id)
  const cols: Record<string, unknown> = {
    id,
    household_id: hh,
    kind: kindFor(face, b, axes.recur != null),
    title: opts.title,
    ...faceColumns(face, b, ref),
    // Who wrote a task tints it while nobody is named (0150); a home row never carried one.
    member_id: face === 'task' ? author : null,
    created_at: ts,
    updated_at: ts,
  }
  const names = Object.keys(cols)
  await db
    .prepare(`INSERT INTO home_projects (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
    .bind(...names.map((n) => cols[n]))
    .run()
  return { id, face }
}
