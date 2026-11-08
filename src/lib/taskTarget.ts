// WHERE A NEW TASK IS WRITTEN — the one rule (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4).
//
// A task is a title plus optional layers. The household never picks a « type »: it fills the
// layers it wants, and this function decides which of today's three tables can hold them. It
// is pure and imports nothing, because the capture spine (functions/api/capture.ts) routes a
// dictated task through it too: a typed « sortir les poubelles chaque mardi » and a spoken one
// land in the same place. When `tasks` and `todos` merge, this file and the save adapter
// (src/lib/taskSave.ts) change, and no form does.
//
// WHAT EACH TABLE HOLDS TODAY, read off the three endpoints (functions/api/{todos,chores,
// home-projects}.ts). Every table holds the title, the subject, the icon, the colour and the
// effort, so those never route. The rest:
//
//   axis        todos   tasks (chores)            home_projects
//   date        day     only as a recurrence's     at
//                       start (recur_start): a
//                       one-off chore has no date
//                       the month view reads
//   who         ✗ (member_id is the acting        rotation_json             rotation_json
//                 profile, set from X-Profile,
//                 never chosen)
//   recur       ✗       recur_json                 recur_json
//   lead        ✗       lead_seconds (recurring)   lead_seconds
//   evening     ✗       announce_evening           ✗
//   fromDone    ✗       ✗                          recur_from = 'done'
//   notes       ✗       ✗                          notes
//   budget      ✗       ✗                          budget_cents
//   kind        ✗       ✗                          kind (plan | upkeep), only ever from a door
//                                                  (?kind=, a carnet's Entretien), never a picker
//
// THE RULE: the first of todos → tasks → home_projects that holds every layer filled. So a
// bare title is a to-do, a date alone is a to-do on that day, a recurrence or a person is a
// chore, and notes, a budget, « à partir de la dernière fois », a door's kind, or a one-off
// date WITH a person or a lead, go to home_projects. One combination fits no table: « annoncer
// la veille » with a home-only layer. It goes to home_projects, the table that holds the most,
// and the form says plainly that the evening line is not kept (`unheldAxes`).
//
// Snooze (« Reporter ») is not a layer of the form: it is a gesture on a row, home rows only.

export type TaskTable = 'todo' | 'chore' | 'home'
export type TaskAxis = 'date' | 'who' | 'recur' | 'lead' | 'evening' | 'fromDone' | 'notes' | 'budget' | 'kind'

/** The layers that decide the table. Everything is optional except the title. */
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

const HOLDS: Record<TaskTable, ReadonlySet<TaskAxis>> = {
  todo: new Set<TaskAxis>(['date']),
  chore: new Set<TaskAxis>(['who', 'recur', 'lead', 'evening']),
  home: new Set<TaskAxis>(['date', 'who', 'recur', 'lead', 'fromDone', 'notes', 'budget', 'kind']),
}
const ORDER: readonly TaskTable[] = ['todo', 'chore', 'home']

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

/** What `table` cannot keep of this draft: empty when it holds it all. */
export function unheldAxes(table: TaskTable, d: TaskAxes): TaskAxis[] {
  return axesOf(d).filter((a) => !HOLDS[table].has(a))
}

/** THE rule: the table a NEW task with these layers is written to. Editing keeps its table. */
export function taskTarget(d: TaskAxes): TaskTable {
  return ORDER.find((table) => unheldAxes(table, d).length === 0) ?? 'home'
}
