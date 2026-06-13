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
}

// One entry in the "general ideas" pool — a meal idea not yet pinned to a day.
// Free text (title only) or a recipe shortcut (recipe_id set).
export interface MealIdea {
  id: string
  title: string
  recipe_id?: string | null
  suggested_by?: string | null
  created_at: number
}
export type MealIdeasData = { ideas: MealIdea[] }
export interface LowRow {
  id: string
  item: string
  marked_at: number
}

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
// windowDays: how many days the 10-day countdown block currently shows (10 on
// Tuesday, shrinking to 4 by Monday). The client renders this many days from
// weekStart instead of a fixed 7.
export type MealsData = { days: MealRow[]; weekStart: number; windowDays: number }
export type PantryData = { low: LowRow[] }

// One slot of the planning grid: the day plus its planned meal, if any.
export type WeekDay = { date: number; meal: MealRow | undefined }

export const MEALS_KEY = ['meals']
export const DAY_NOTES_KEY = ['day-notes']
export const MEAL_IDEAS_KEY = ['meal-ideas']
export const PANTRY_KEY = ['pantry']
export const USE_SOON_KEY = ['use-soon']
