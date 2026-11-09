import { normalizeRecur } from './recur'
import { rotationJson } from './rotation'
import type { SubjectRef } from './subject'
import { emojiIcon, hexColor, hexColorOrNull, taskEffort } from './validate'
import type { Face } from './taskItem'

// A TASK, WRITE SIDE — what each layer of a task is stored as on the spine (0150), shared by
// the three alias endpoints (chores, todos, home-projects) and the one form's door
// (/api/tasks). Before the merge each endpoint spelled these on its own, and two of them had
// drifted copies of the same clamps.

export const DEFAULT_COLOUR = '#88a36f'

export const recurJson = (recur: unknown): string | null => {
  const r = normalizeRecur(recur)
  return r ? JSON.stringify(r) : null
}

// A recurrence always carries its start (0152): every reader reads a NULL `at` as « no date »,
// so a series written without one counts from the moment it is written, which is what a
// NULL used to mean for a chore (« from created_at »). A one-off keeps its own day or none.
export const startSec = (recurring: boolean, v: unknown, writtenAt: number): number | null => dateSec(v) ?? (recurring ? writtenAt : null)

// A date: unix-seconds > 0, else null. A chore's start, a home row's anchor, a to-do's day.
export const dateSec = (v: unknown): number | null => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

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
// reader looks; the two other faces never had that column and keep it in subject_kind/id.
export function subjectCols(face: Face, ref: SubjectRef | null): { carnet_id: string | null; subject_kind: string | null; subject_id: string | null } {
  if (face === 'home' && ref?.kind === 'carnet') return { carnet_id: ref.id, subject_kind: null, subject_id: null }
  return { carnet_id: null, subject_kind: ref?.kind ?? null, subject_id: ref?.id ?? null }
}

/** The one form's body (src/lib/taskSave.ts): every layer, one spelling. */
export interface TaskBody {
  title?: unknown
  /** A one-off's day as a household-local midnight: what a to-do stores. */
  day?: unknown
  /** The same date as the scheduled faces store it (the form's UTC anchor), today for a bare recurrence. */
  at?: unknown
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

/** The layers that pick a face (src/lib/taskTarget.ts), read off a body. */
export function bodyAxes(b: TaskBody) {
  const recur = normalizeRecur(b.recur)
  return {
    title: typeof b.title === 'string' ? b.title : '',
    date: dateSec(b.day) ?? dateSec(b.at),
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

// The columns a face writes for the one form, exactly what that face's alias wrote before the
// merge (todos / chores / home-projects), so a row written here reads as it always did. Every
// column of the form's layers is written, so a face change (an edit that adds a layer) leaves
// no stale value behind.
export function faceColumns(face: Face, b: TaskBody, ref: SubjectRef | null): Record<string, unknown> {
  const recurring = normalizeRecur(b.recur) != null
  const subject = subjectCols(face, ref)
  const look = { icon: emojiIcon(b.icon), effort: taskEffort(b.effort) }
  if (face === 'todo')
    return {
      ...look,
      ...subject,
      // A to-do keeps a day (a local midnight), nothing of a schedule.
      at: dateSec(b.day),
      colour: hexColorOrNull(b.color),
      recur_json: null,
      recur_from: 'anchor',
      lead_seconds: null,
      announce_evening: null,
      rotation_json: '[]',
      notes: null,
      budget_cents: null,
    }
  if (face === 'chore')
    return {
      ...look,
      ...subject,
      // A chore keeps a date only as its recurrence's start, and a lead or the evening line
      // only on a schedule.
      at: recurring ? startSec(true, b.at, Math.floor(Date.now() / 1000)) : null,
      colour: hexColor(b.color, DEFAULT_COLOUR),
      recur_json: recurJson(b.recur),
      recur_from: 'anchor',
      lead_seconds: recurring ? leadSeconds(b.leadSeconds) : null,
      announce_evening: recurring ? announceEvening(b.announceEvening) : null,
      rotation_json: rotationJson(b.rotation),
      notes: null,
      budget_cents: null,
    }
  const at = dateSec(b.at)
  return {
    ...look,
    ...subject,
    at,
    colour: hexColor(b.color, DEFAULT_COLOUR),
    recur_json: recurJson(b.recur),
    recur_from: recurring ? recurFromOf(b.recurFrom) : 'anchor',
    lead_seconds: at ? leadSeconds(b.leadSeconds) : null, // no date, no occurrence to remind about
    // The one layer a home row does not show (the board announces chores only): the form says
    // so (`unheldAxes`), and the row does not pretend to keep it.
    announce_evening: null,
    rotation_json: rotationJson(b.rotation),
    notes: notesOf(b.notes),
    budget_cents: budgetCents(b.budgetCents),
  }
}
