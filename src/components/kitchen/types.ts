// Row shapes + query keys shared by the Kitchen page (which owns the queries)
// and the tab components in this folder.
export interface MealRow {
  id: string
  date: number
  title: string
  cook_member_id: string | null
  suggested_by?: string | null
}
export interface LowRow {
  id: string
  item: string
  marked_at: number
}
export type MealsData = { days: MealRow[]; weekStart: number }
export type PantryData = { low: LowRow[] }

// One slot of the 7-day grid: the day plus its planned meal, if any.
export type WeekDay = { date: number; meal: MealRow | undefined }

export const MEALS_KEY = ['meals']
export const PANTRY_KEY = ['pantry']
export const USE_SOON_KEY = ['use-soon']
