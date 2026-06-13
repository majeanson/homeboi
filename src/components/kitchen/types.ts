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
// windowDays: how many days the 10-day countdown block currently shows (10 on
// Tuesday, shrinking to 4 by Monday). The client renders this many days from
// weekStart instead of a fixed 7.
export type MealsData = { days: MealRow[]; weekStart: number; windowDays: number }
export type PantryData = { low: LowRow[] }

// One slot of the planning grid: the day plus its planned meal, if any.
export type WeekDay = { date: number; meal: MealRow | undefined }

export const MEALS_KEY = ['meals']
export const MEAL_IDEAS_KEY = ['meal-ideas']
export const PANTRY_KEY = ['pantry']
export const USE_SOON_KEY = ['use-soon']
