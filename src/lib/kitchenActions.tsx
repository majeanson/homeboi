// The kitchen week's three actions — shop the week, AI supper ideas, ideas from
// your own recipes — used to float as their own rail of round buttons above the
// ＋ FAB. They now live INSIDE the ＋ Add sheet as icon tiles, so the parent view
// has one floating affordance, not four.
//
// The catch: the ＋ Add sheet is rendered by HubLayout, a SIBLING of the routed
// page (the <Outlet/>), while the flows themselves live on the Kitchen page —
// which owns the queries and renders each action's result on the week grid. So
// the Kitchen page REGISTERS its live handlers up here and AddSheet reads them.
//
// Handlers sit in a ref (always fresh, never a hook dependency); only the small
// set of display flags is React state, and the registrar bails when they're
// unchanged — so Kitchen can re-register every render without a setState loop.
import { createContext, useContext } from 'react'

export type KitchenAction = 'shop' | 'ai' | 'book'

export interface KitchenActionFlags {
  // The kitchen "Repas" (meals) sub-tab is showing AND we're the parent view.
  // The tiles only make sense there — that's where their results land. Else the
  // Add sheet hides them.
  active: boolean
  canShop: boolean // ≥1 planned meal maps to a recipe worth gathering
  canAiSuggest: boolean // AI is reachable (else the tile disables)
  aiBusy: boolean
  hasRecipes: boolean // the book has something to suggest from
}

export const NO_KITCHEN_ACTIONS: KitchenActionFlags = {
  active: false,
  canShop: false,
  canAiSuggest: false,
  aiBusy: false,
  hasRecipes: false,
}

export type KitchenHandlers = Record<KitchenAction, () => void>

export const KitchenActionsContext = createContext<{
  flags: KitchenActionFlags
  register: (handlers: KitchenHandlers | null, flags: KitchenActionFlags) => void
  run: (action: KitchenAction) => void
}>({ flags: NO_KITCHEN_ACTIONS, register: () => {}, run: () => {} })

export const useKitchenActions = () => useContext(KitchenActionsContext)

// True when nothing actionable is available — AddSheet skips the whole subgroup.
export const noKitchenActions = (f: KitchenActionFlags) =>
  !f.active || (!f.canShop && !f.canAiSuggest && !f.hasRecipes)
