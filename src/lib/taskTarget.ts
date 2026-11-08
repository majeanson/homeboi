// WHICH FACE A TASK WEARS — the one rule (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4).
//
// A task is a title plus optional layers. The household never picks a « type »: it fills the
// layers it wants. Since migration 0150 every task lives in ONE table (`home_projects`, the
// spine), so this no longer picks a table. It picks the FACE the row wears in the payloads that
// predate the merge (`kind`: 'todo', 'chore', or a home row), because the board, the calendar,
// the day page and the three alias endpoints still read those three shapes, and each shape
// renders only some layers. It is pure and imports nothing, because the server runs it too:
// /api/tasks (the one form's door) and the capture spine (functions/api/capture.ts), so a typed
// « sortir les poubelles chaque mardi » and a spoken one wear the same face.
//
// WHAT EACH FACE SHOWS, read off the readers that still speak it (functions/api/{todos,chores,
// home-projects,board,month}.ts). Every face shows the title, the subject, the icon, the colour
// and the effort, so those never decide. The rest:
//
//   axis        todo    chore                      home
//   date        day     only as a recurrence's     at
//                       start: a dated one-off
//                       chore has no cell on the
//                       month view
//   who         ✗       rotation_json              rotation_json
//   recur       ✗       recur_json                 recur_json
//   lead        ✗       lead_seconds (recurring)   lead_seconds
//   evening     ✗       announce_evening           ✗ (the board announces chores only)
//   fromDone    ✗       ✗                          recur_from = 'done'
//   notes       ✗       ✗                          notes
//   budget      ✗       ✗                          budget_cents
//   kind        ✗       ✗                          kind (plan | upkeep), only ever from a door
//                                                  (?kind=, a carnet's Entretien), never a picker
//
// THE RULE for a new task: the first of todo → chore → home that shows every layer filled. So
// a bare title is a to-do, a date alone is a to-do on that day, a recurrence or a person is a
// chore, and notes, a budget, « à partir de la dernière fois », a door's kind, or a one-off
// date WITH a person or a lead, are a home row.
//
// AN EDIT MOVES UP, never down (`faceAfter`): a to-do that gains a person becomes a chore, a
// chore that gains notes becomes a home row, on the same row and id. Before the merge an edit
// kept its table and said, in one line, which layers that table could not keep; with one table
// that line is gone, but for ONE combination: « annoncer la veille » with a home-only layer. No
// face shows both, the row becomes a home row (the face that shows the most), and the form
// says plainly that the evening line is not kept (`unheldAxes`). Moving down would hide a
// layer the row still holds, so it never happens: a chore that loses its rotation stays one.
//
// Snooze (« Reporter ») is not a layer of the form: it is a gesture on a row, home rows only.

export type TaskFace = 'todo' | 'chore' | 'home'
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

const SHOWS: Record<TaskFace, ReadonlySet<TaskAxis>> = {
  todo: new Set<TaskAxis>(['date']),
  chore: new Set<TaskAxis>(['who', 'recur', 'lead', 'evening']),
  home: new Set<TaskAxis>(['date', 'who', 'recur', 'lead', 'fromDone', 'notes', 'budget', 'kind']),
}
const ORDER: readonly TaskFace[] = ['todo', 'chore', 'home']

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

/** What `face` does not show of this draft: empty when it shows it all. */
export function unheldAxes(face: TaskFace, d: TaskAxes): TaskAxis[] {
  return axesOf(d).filter((a) => !SHOWS[face].has(a))
}

/** THE rule: the face a NEW task with these layers wears. */
export function taskTarget(d: TaskAxes): TaskFace {
  return ORDER.find((face) => unheldAxes(face, d).length === 0) ?? 'home'
}

/** The face an EDIT leaves the row in: its own while it shows every layer, else the first face
 *  above it that does (home when none does). Never a face below `current`. */
export function faceAfter(current: TaskFace, d: TaskAxes): TaskFace {
  const from = ORDER.indexOf(current)
  return ORDER.slice(from).find((face) => unheldAxes(face, d).length === 0) ?? 'home'
}
