// IS A TASK A HOME ROW? — the one rule (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4, then 0153).
//
// A task is a title plus optional layers. The household never picks a « type »: it fills the
// layers it wants. Every task lives in ONE table (`home_projects`, the spine, 0150), and since
// 0153 a row is one of two things: a TASK (no kind) or a HOME row (`kind` 'plan' or 'upkeep', a
// behaviour some surfaces still ask about: the season card, a project's notes and budget,
// « Sur quoi ? », « Reporter »). What used to be a chore and what used to be a to-do are one
// thing, and nothing here tells them apart. It is pure and imports nothing, because the server
// runs it too: /api/tasks (the one form's door) and the capture spine
// (functions/api/capture.ts), so a typed « sortir les poubelles chaque mardi » and a spoken
// one are the same thing.
//
// WHAT A TASK HOLDS without becoming a home row is exactly what it held before 0153, so the
// same layers land in the same place as yesterday: either a dated ONE-OFF (a day, nothing else
// of a schedule), or a SERIES with its people (who, recurrence, lead, the evening line). A home
// row holds everything but the evening line. So a bare title is a task, a date alone is a task
// on that day, a recurrence or a person is a task, and notes, a budget, « à partir de la
// dernière fois », a door's kind, or a one-off date WITH a person or a lead, are a home row.
//
//   axis        task (a dated one-off,   home
//                or a series)
//   date        ✓ (one-off)              at
//   who         ✓ (series or undated)    rotation_json
//   recur       ✓                        recur_json
//   lead        ✓ (series)               lead_seconds
//   evening     ✓ (series)               ✗ (the board announces tasks only)
//   fromDone    ✗                        recur_from = 'done'
//   notes       ✗                        notes
//   budget      ✗                        budget_cents
//   kind        ✗                        kind (plan | upkeep), only ever from a door
//                                        (?kind=, a carnet's Entretien), never a picker
//
// AN EDIT MOVES UP, never down (`faceAfter`): a task that gains notes becomes a home row, on
// the same row and id. The one combination no face shows is « annoncer la veille » with a
// home-only layer: the row becomes a home row (the face that shows the most), and the form says
// plainly that the evening line is not kept (`unheldAxes`). Moving down would hide a layer the
// row still holds, so it never happens.
//
// Snooze (« Reporter ») is not a layer of the form: it is a gesture on a row, home rows only.

export type TaskFace = 'task' | 'home'
export type TaskAxis = 'date' | 'who' | 'recur' | 'lead' | 'evening' | 'fromDone' | 'notes' | 'budget' | 'kind'

/** The layers that decide the face. Everything is optional except the title. */
export interface TaskAxes {
  title: string
  /** A one-off's day, or a recurrence's start. Any truthy value means « dated ». */
  date?: string | number | null | undefined
  recur?: object | null | undefined
  recurFrom?: 'anchor' | 'done' | null | undefined
  lead?: number | null | undefined
  announceEvening?: boolean | null | undefined
  /** [] anyone · [id] one person · several: « chacun son tour ». */
  rotation?: readonly string[] | null | undefined
  notes?: string | null | undefined
  budgetCents?: number | null | undefined
  kind?: 'plan' | 'upkeep' | null | undefined
}

// The two shapes a task holds (a dated one-off; a series with its people), and a home row's.
const ONE_OFF = new Set<TaskAxis>(['date'])
const SERIES = new Set<TaskAxis>(['who', 'recur', 'lead', 'evening'])
const HOME = new Set<TaskAxis>(['date', 'who', 'recur', 'lead', 'fromDone', 'notes', 'budget', 'kind'])
const ORDER: readonly TaskFace[] = ['task', 'home']

/** The layers a draft fills. A sub-layer of the schedule only counts where it means something. */
export function axesOf(d: TaskAxes): TaskAxis[] {
  const recurring = d.recur != null
  const dated = !!d.date
  const out: TaskAxis[] = []
  // A recurrence's start is part of the recurrence: only a ONE-OFF's date is its own layer.
  if (dated && !recurring) out.push('date')
  if (d.rotation && d.rotation.length > 0) out.push('who')
  if (recurring) out.push('recur')
  if (d.lead != null && (recurring || dated)) out.push('lead')
  if (d.announceEvening && recurring) out.push('evening')
  if (d.recurFrom === 'done' && recurring) out.push('fromDone')
  if (d.notes != null && d.notes.trim() !== '') out.push('notes')
  if (d.budgetCents != null) out.push('budget')
  if (d.kind != null) out.push('kind')
  return out
}

const within = (axes: readonly TaskAxis[], shape: ReadonlySet<TaskAxis>) => axes.filter((a) => !shape.has(a))

/** What `face` does not show of this draft: empty when it shows it all. */
export function unheldAxes(face: TaskFace, d: TaskAxes): TaskAxis[] {
  const axes = axesOf(d)
  if (face === 'home') return within(axes, HOME)
  // A task holds either shape: what neither holds is what it does not show.
  const a = within(axes, ONE_OFF)
  const b = within(axes, SERIES)
  return a.length <= b.length ? a : b
}

/** THE rule: a NEW task with these layers is a task, or a home row. */
export function taskTarget(d: TaskAxes): TaskFace {
  return ORDER.find((face) => unheldAxes(face, d).length === 0) ?? 'home'
}

/** The face an EDIT leaves the row in: its own while it shows every layer, else home. Never
 *  down: a home row stays one. */
export function faceAfter(current: TaskFace, d: TaskAxes): TaskFace {
  const from = ORDER.indexOf(current)
  return ORDER.slice(from).find((face) => unheldAxes(face, d).length === 0) ?? 'home'
}
