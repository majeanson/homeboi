import { addLocalDays } from './localDay'
import type { SubjectRef } from './subjects'

// A TASK ON THE CLIENT: the one shape the merged board section, the Tâches view and a subject's
// page all read. The server builds it (functions/_lib/taskItem.ts is where « done » is decided);
// this file only sorts and groups what arrived. It never re-derives a date or a done state,
// because a second opinion is how the three old lists came to disagree.
export interface TaskItem {
  key: string
  source: 'chore' | 'todo' | 'home'
  id: string
  title: string
  /** The raw stored colour. A row never paints it directly: `lookOf` (lib/subjects) decides. */
  color: string | null
  /** The raw stored icon (0148), an emoji, or null = « comme le sujet ». */
  icon: string | null
  subject: SubjectRef | null
  kind: 'plan' | 'upkeep' | null
  recurring: boolean
  recurJson: string | null
  /** The next date it is due, as a local midnight. Null = un jour. */
  day: number | null
  dueToday: boolean
  overdueSince: number | null
  snoozedUntil: number | null
  soon: boolean
  done: 'open' | 'ticked'
  doneAt: number | null
  who_id: string | null
  team: string[]
  /** Due, owed or ticked today: what the bento board shows. */
  onBoard: boolean
}


export interface TaskHistoryLine {
  key: string
  title: string
  at: number
  who_id: string | null
}

export const isTicked = (t: Pick<TaskItem, 'done'>): boolean => t.done === 'ticked'

// A form's starting value: the ordered ids of a stored rotation.
export function rotationOf(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v: unknown = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// A task follows the board's face lens the way a chore always has: mine, my rotation, or
// nobody's. Same rule as boardModel's `mineChore`, for the same reason.
export const mineTask = (t: Pick<TaskItem, 'who_id' | 'team'>, profileId: string | null | undefined): boolean =>
  !profileId || t.who_id === null || t.who_id === profileId || t.team.includes(profileId)

// Board order: what is owed reads first, oldest debt on top. Everything else keeps the order
// it arrived in, and a tick leaves the row where it is: a row that jumps under a thumb is
// how the wrong thing gets tapped next. La liste ticks in place for the same reason.
export function boardOrder(items: readonly TaskItem[]): TaskItem[] {
  const late = items.filter((t) => t.overdueSince != null).sort((a, b) => (a.overdueSince ?? 0) - (b.overdueSince ?? 0))
  return [...late, ...items.filter((t) => t.overdueSince == null)]
}

// « Par horizon ». Each task sits in exactly one bucket; a ticked one-off stays with what it
// was until the day clears it, so a tick never moves a row between groups either.
export const HORIZONS = ['late', 'today', 'week', 'month', 'later', 'someday'] as const
export type Horizon = (typeof HORIZONS)[number]

export function horizonOf(t: TaskItem, today: number): Horizon {
  if (t.overdueSince != null) return 'late'
  if (t.dueToday || t.done === 'ticked') return 'today'
  if (t.day == null) return 'someday'
  if (t.day <= today) return 'today'
  if (t.day < addLocalDays(today, 7)) return 'week'
  if (t.day < addLocalDays(today, 31)) return 'month'
  return 'later'
}

export interface TaskGroup<K> {
  key: K
  tasks: TaskItem[]
}

// Bucket `items` by `keyOf`, keeping first-seen order unless `order` says otherwise.
export function groupTasks<K extends string>(items: readonly TaskItem[], keyOf: (t: TaskItem) => K, order?: readonly K[]): TaskGroup<K>[] {
  const groups = new Map<K, TaskItem[]>()
  for (const t of items) {
    const k = keyOf(t)
    const rows = groups.get(k)
    if (rows) rows.push(t)
    else groups.set(k, [t])
  }
  const keys = order ? order.filter((k) => groups.has(k)) : [...groups.keys()]
  return keys.map((key) => ({ key, tasks: groups.get(key)! }))
}

export const NO_SUBJECT = 'none'
export const subjectKey = (t: Pick<TaskItem, 'subject'>): string => (t.subject ? `${t.subject.kind}:${t.subject.id}` : NO_SUBJECT)

// « Par personne »: a rotation sits under whoever's turn it is, because that is the question
// a person's list answers. Anyone's task reads under the household.
export const NOBODY = 'all'
export const personKey = (t: Pick<TaskItem, 'who_id'>): string => t.who_id ?? NOBODY

// A rotating task names whose turn it is on its row. A single owner does not: the title tint
// says who, and a second line would be furniture (the compact-rows rule).
export const rotates = (t: Pick<TaskItem, 'team'>): boolean => t.team.length > 1
