// Row shapes + query keys shared by the Kitchen page (which owns the queries)
// and the tab components in this folder.
export interface MealRow {
  id: string
  date: number
  slot: string // breakfast | lunch | supper | snack
  title: string
  cook_member_id: string | null
  suggested_by?: string | null
  recipe_id?: string | null // the saved recipe this slot points at, if any
  position?: number // intra-slot order (migration 0033); a slot can hold several meals
  is_leftover?: number // 1 = a planned leftover ("Restants" badge); migration 0035
}

// One entry in the "Restants" (leftovers) pool — a cooked dish with extra that
// isn't pinned to a day yet. Planning it onto a day consumes it into a real
// (badged) meal; finishing it removes it. Mirrors the meal-ideas pool shape.
export interface Leftover {
  id: string
  title: string
  recipe_id?: string | null
  source_meal_id?: string | null
  created_at: number
}
export type LeftoversData = { leftovers: Leftover[] }

// One entry in the "general ideas" pool — a meal idea not yet pinned to a day.
// Free text (title only) or a recipe shortcut (recipe_id set). `date` (C-14,
// migration 0107) is an optional local-midnight day this idea was SUGGESTED for —
// a soft scope, not a plan: the idea stays reusable in the pool either way. Set by
// the toddler kid-suggest flow so the empty day tile can surface a "Léa propose 🍕"
// chip; a plain pool idea leaves it null/undefined.
export interface MealIdea {
  id: string
  title: string
  recipe_id?: string | null
  suggested_by?: string | null
  date?: number | null
  created_at: number
}
export type MealIdeasData = { ideas: MealIdea[] }
export interface LowRow {
  id: string
  item: string
  marked_at: number
}

// One stashed item in La réserve — a pantry row plus a soft location_id (which
// storage spot it's in; null / unknown groups under "Autres").
export interface ReserveRow {
  id: string
  item: string
  location_id: string | null
  marked_at: number
}
export type ReserveData = { reserve: ReserveRow[] }

// A free-text memo pinned to one day of the meal week (see migration 0028). One
// per day — editing replaces it. Shown under the day in the kitchen grid and, for
// today, on the Aujourd'hui board beside the day's meals.
export interface DayNoteRow {
  id: string
  date: number
  text: string
  member_id: string | null
  updated_at: number
}
export type DayNotesData = { notes: DayNoteRow[] }
// windowDays: how many days the grid shows, counting today — the household's
// « Jours affichés » (Réglages ▸ Cuisine ▸ Repas; 7–14, default 10). A ROLLING
// window: weekStart is always today's local midnight, so the count never decays.
// The client renders this many days from weekStart instead of a fixed 7.
// `recent`: the last few days of planned, non-leftover meals (newest first, deduped
// by title) — the source for the Restants "Suggestions" quick-pick chips.
export type MealsData = { days: MealRow[]; weekStart: number; windowDays: number; recent: MealRow[] }
// One « Historique » page: up to a fortnight of past planned days (newest first,
// meals ordered like the grid within a day) + the cursor for the next older page
// (null = history exhausted). See functions/api/meal-history.ts.
export type MealHistoryPage = { days: MealRow[]; nextBefore: number | null }
// « Déjà mangé » (?summary=1 on the same endpoint): the household's distinct past
// dishes, most-often-planned first — the ORDER is the rank, no count ships (calm).
// `recipe_id`/`title` come from the most recent planning of the dish.
export type PastDish = { title: string; recipe_id: string | null; last_at: number }
export type MealHistorySummary = { dishes: PastDish[] }
export type PantryData = { low: LowRow[] }

// One slot of the planning grid: the day plus its planned meal, if any.
export type WeekDay = { date: number; meal: MealRow | undefined }

export const MEALS_KEY = ['meals']
export const MEAL_HISTORY_KEY = ['meal-history']
// Prefix-invalidated by MEAL_HISTORY_KEY (TanStack fuzzy matching), so every meal
// write that refreshes the Historique tab refreshes the « Déjà mangé » source too.
export const MEAL_HISTORY_SUMMARY_KEY = ['meal-history', 'summary']
export const DAY_NOTES_KEY = ['day-notes']
export const MEAL_IDEAS_KEY = ['meal-ideas']
export const LEFTOVERS_KEY = ['leftovers']
export const PANTRY_KEY = ['pantry']
export const USE_SOON_KEY = ['use-soon']
export const RESERVE_KEY = ['reserve']
