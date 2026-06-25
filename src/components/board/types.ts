import { FR } from '../../i18n'
import type { Member } from '../../lib/members'

// The one-shot /board payload, shared by the Board page and its extracted
// pieces (views, chrome). The list/members slices are also read by Liste and
// Kitchen through the same ['board'] cache. The member shape is the canonical
// snake_case row (lib/members) — the lighter board projection is exactly its base.
export type { Member }
export interface EventRow {
  id: string
  title: string
  start_at: number
  all_day: number
  member_id: string | null
  contact_id?: string | null // #21: assigned to a « Le cercle » contact instead of a member
  contact_name?: string | null // the contact's first name, joined server-side, for the label
  business_id?: string | null // a « Le cercle » Business (vet, plumber…) — a rendez-vous
  business_name?: string | null // the business name, joined server-side, for the label
  business_colour?: string | null // the business's own tint — colours the rendez-vous
  soon?: boolean // within its calm "Bientôt" lead window now (migration 0038)
  birthday?: boolean // a DERIVED birthday occurrence (from a person's birthday), not a stored event
  age?: number | null // the age turned, when the birth year is known
  gift_ideas?: string | null // #20: gift notes shown in the birthday's detail peek
}
interface ListRow {
  id: string
  text: string
  source: string
}
interface Helper {
  name: string | null
  role: string
}
interface ChoreRow {
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
  is_leftover?: number // 1 = a planned leftover ("Restants" badge); migration 0035
}
// One undated leftover in the "Restants à finir" pool — a calm board reminder to
// eat it before cooking the rest. Marking it "Fini" removes it.
interface LeftoverRow {
  id: string
  title: string
}
// One of today's planned meals, with its slot (déjeuner/dîner/souper/collation)
// so the board can label it. The full day's table, shown beside the supper hero.
export interface DayMealRow {
  id: string
  slot: string
  title: string
  cook_member_id: string | null
  position?: number
  is_leftover?: number // 1 = a planned leftover ("Restants" badge); migration 0035
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
  // Optional R2 attachment (#38 audio memo / #14 drawn note / #13 shared photo);
  // served via /api/img.
  media_kind?: 'audio' | 'drawing' | 'image' | null
  media_key?: string | null
  // The editable drawing SCENE (#1) — JSON in R2; lets a drawing be re-opened and
  // added to losslessly. Only present on 'drawing' notes saved by the newer pad.
  scene_key?: string | null
}
// A recurring chore expanded onto a specific day (today or an upcoming date).
// `who`/`who_id` are whose turn it is (rotation + current_idx); null = unassigned
// (a "Maisonnée" task shown to everyone, surfaced even in a single-member focus).
// `team` is everyone in the rotation — a shared chore stays visible (and doable)
// to any teammate in personal focus, even when it's not their turn.
export interface ChoreInstance {
  id: string
  title: string
  color: string | null
  at: number
  who: string | null
  who_id: string | null
  team?: string[]
  soon?: boolean // within its calm "Bientôt" lead window now (migration 0038)
  carnet_id?: string | null // « Les carnets » link (mig 0082) — set only on home-project rows
}
export interface BoardData {
  syncedAt: number
  scope: string
  members: Member[]
  today: EventRow[]
  tomorrow: EventRow[]
  upcoming: EventRow[]
  tonight: MealRow | null // the first supper — the headline hero / toddler hero
  tonightMeals: DayMealRow[] // ALL of today's suppers — "Ce soir" lists every one
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
  // "Projets & Entretien" (home_projects) — DATED home work surfaced like chores:
  // an occurrence today is checkable on Aujourd'hui (homeToday), the next one this
  // week shows on À venir (homeUpcoming). Undated plans stay quiet (Réglages only).
  // Shares the ChoreInstance shape; no rotation (who/who_id null).
  homeToday?: ChoreInstance[]
  homeUpcoming?: ChoreInstance[]
  notes: NoteRow[]
  // Undated leftovers to finish — the "Restants à finir" reminder card.
  leftovers: LeftoverRow[]
  // « L'auto » work-schedule windows landing TODAY (#28) — DERIVED from the
  // recurring schedule blocks (never event rows), read-only. `member_id` attributes
  // each window to a face/lane; `holds_car` flags the ones that tie up the shared
  // car. Only today's: the forward rota lives on the calendar, not the glance.
  work?: WorkRow[]
}
export interface WorkRow {
  id: string
  label: string | null // the block's free-text label ("Travail", "Garderie…"), or null
  at: number // window start (unix seconds)
  endAt: number // window end
  member_id: string | null
  color: string | null // the block's tint; the member colour falls back
  holds_car: number // 1 = this window takes the shared car
}

// The bilingual copy object, passed down so the extracted views don't each
// re-call useT.
export type Dict = typeof FR

// Module helpers so the alternate views don't recreate Board's member lookups.
export const nameOf = (members: Member[], id: string | null) => members.find((m) => m.id === id)?.display_name ?? null
export const colorOf = (members: Member[], id: string | null) => members.find((m) => m.id === id)?.colour
