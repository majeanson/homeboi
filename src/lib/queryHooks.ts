import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { live } from './query'
import { BOARD_KEY } from './queryKeys'
import { RECIPES_KEY, type Recipe } from './recipes'
import {
  MEALS_KEY,
  DAY_NOTES_KEY,
  PANTRY_KEY,
  LEFTOVERS_KEY,
  type MealsData,
  type DayNotesData,
  type PantryData,
  type LeftoversData,
} from '../components/kitchen/types'
import type { BoardData } from '../components/board/types'

// Shared server-state hooks: ONE definition of (query key + endpoint + payload
// type + the `live` poll policy) for each cache that several pages read. Before
// this the same useQuery block was spelled out per page, so the key/endpoint/type
// could drift apart silently — and a key typo would split one cache into two.
// Use these for any page-level read of these caches; `opts` overrides the defaults
// (e.g. `{ enabled: !!id }` to gate the fetch, `{ retry: false }` on the board).
//
// NOTE: these POLL (…live). The board peek's recipe resolver (kitchen/mealLookup)
// and the ＋-sheet's useNextMeal deliberately read RECIPES without polling, so they
// keep their own queries — don't route them through useRecipes.
type ReadOpts = { enabled?: boolean; retry?: boolean | number }

export function useBoardData(opts?: ReadOpts) {
  return useQuery({ queryKey: BOARD_KEY, queryFn: () => api<BoardData>('board'), ...live, ...opts })
}

export function useRecipes(opts?: ReadOpts) {
  return useQuery({ queryKey: RECIPES_KEY, queryFn: () => api<{ recipes: Recipe[] }>('recipes'), ...live, ...opts })
}

export function useMeals(opts?: ReadOpts) {
  return useQuery({ queryKey: MEALS_KEY, queryFn: () => api<MealsData>('meals'), ...live, ...opts })
}

export function useDayNotes(opts?: ReadOpts) {
  return useQuery({ queryKey: DAY_NOTES_KEY, queryFn: () => api<DayNotesData>('day-notes'), ...live, ...opts })
}

export function usePantry(opts?: ReadOpts) {
  return useQuery({ queryKey: PANTRY_KEY, queryFn: () => api<PantryData>('pantry'), ...live, ...opts })
}

// LEFTOVERS_KEY is ['leftovers']; the endpoint is /api/meal-leftovers.
export function useLeftovers(opts?: ReadOpts) {
  return useQuery({ queryKey: LEFTOVERS_KEY, queryFn: () => api<LeftoversData>('meal-leftovers'), ...live, ...opts })
}
