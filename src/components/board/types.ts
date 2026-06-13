import { FR } from '../../i18n'

// The one-shot /board payload, shared by the Board page and its extracted
// pieces (views, chrome). The list/members slices are also read by Liste and
// Kitchen through the same ['board'] cache.
export interface Member {
  id: string
  display_name: string
  colour: string
  is_child: number
  avatar_kind?: string
  avatar_ref?: string
}
export interface EventRow {
  id: string
  title: string
  start_at: number
  all_day: number
  member_id: string | null
}
export interface ListRow {
  id: string
  text: string
  source: string
}
export interface Helper {
  name: string | null
  role: string
}
export interface ChoreRow {
  id: string
  title: string
  rotation_json: string
  current_idx: number
  last_done_at: number | null
  color?: string
  helpers?: Helper[]
}
export interface MealRow {
  id: string
  title: string
  cook_member_id: string | null
}
// One of today's planned meals, with its slot (déjeuner/dîner/souper/collation)
// so the board can label it. The full day's table, shown beside the supper hero.
export interface DayMealRow {
  id: string
  slot: string
  title: string
  cook_member_id: string | null
}
// Today's day note — the per-day memo set in La cuisine. Read-only on the board.
export interface DayNote {
  id: string
  text: string
  member_id: string | null
}
export interface NoteRow {
  id: string
  text: string
  member_id: string | null
  created_at: number
}
// A recurring chore expanded onto a specific day (today or an upcoming date).
// `who`/`who_id` are whose turn it is (rotation + current_idx); null = unassigned
// (a "Maisonnée" task shown to everyone, surfaced even in a single-member focus).
export interface ChoreInstance {
  id: string
  title: string
  color: string | null
  at: number
  who: string | null
  who_id: string | null
}
export interface BoardData {
  syncedAt: number
  scope: string
  members: Member[]
  today: EventRow[]
  tomorrow: EventRow[]
  upcoming: EventRow[]
  tonight: MealRow | null
  tomorrowMeal: MealRow | null
  todayMeals: DayMealRow[]
  dayNote: DayNote | null
  tomorrowMeals: DayMealRow[]
  tomorrowNote: DayNote | null
  list: ListRow[]
  chores: ChoreRow[]
  choresToday: ChoreInstance[]
  choresUpcoming: ChoreInstance[]
  // One-off to-dos: non-recurring, not-yet-done tasks (captured "corvées" or
  // standing chores with no schedule). Surfaced on Aujourd'hui; checking one
  // marks it done so it drops off. Shares the ChoreInstance shape.
  todos: ChoreInstance[]
  notes: NoteRow[]
}

// The bilingual copy object, passed down so the extracted views don't each
// re-call useT.
export type Dict = typeof FR

// Module helpers so the alternate views don't recreate Board's member lookups.
export const nameOf = (members: Member[], id: string | null) => members.find((m) => m.id === id)?.display_name ?? null
export const colorOf = (members: Member[], id: string | null) => members.find((m) => m.id === id)?.colour
