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
export interface NoteRow {
  id: string
  text: string
  member_id: string | null
  created_at: number
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
  list: ListRow[]
  chores: ChoreRow[]
  notes: NoteRow[]
}

// The bilingual copy object, passed down so the extracted views don't each
// re-call useT.
export type Dict = typeof FR

// Module helpers so the alternate views don't recreate Board's member lookups.
export const nameOf = (members: Member[], id: string | null) => members.find((m) => m.id === id)?.display_name ?? null
export const colorOf = (members: Member[], id: string | null) => members.find((m) => m.id === id)?.colour
