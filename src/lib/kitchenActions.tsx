// The kitchen week's actions — shop the week, and the ONE « Idées » drawer (C-14
// folded AI ideas / book ideas / use-it-up / vide-frigo into the drawer's source
// chips, instead of four separate tiles) — used to float as their own rail of
// round buttons above the ＋ FAB. They now live INSIDE the ＋ Add sheet as icon
// tiles, so the parent view has one floating affordance, not four.
//
// The catch: the ＋ Add sheet is rendered by HubLayout, a SIBLING of the routed
// page (the <Outlet/>), while the flows themselves live on the Kitchen page —
// which owns the queries and renders each action's result on the week grid (shop)
// or opens the drawer (idées). So the Kitchen page REGISTERS its live handlers up
// here and AddSheet reads them.
//
// Handlers sit in a ref (always fresh, never a hook dependency); only the small
// set of display flags is React state, and the registrar bails when they're
// unchanged — so Kitchen can re-register every render without a setState loop.
import { createContext, useContext } from 'react'

export type KitchenAction = 'shop' | 'ideas'

export interface KitchenActionFlags {
  // We're the parent view of La cuisine (any sub-tab). The tiles show across every
  // kitchen sub-tab; firing one jumps to Repas, where its result lands. Toddler
  // view / other sections clear this and the Add sheet hides the whole group.
  active: boolean
  canShop: boolean // ≥1 planned meal maps to a recipe worth gathering
}

export const NO_KITCHEN_ACTIONS: KitchenActionFlags = {
  active: false,
  canShop: false,
}

export type KitchenHandlers = Record<KitchenAction, () => void>

export const KitchenActionsContext = createContext<{
  flags: KitchenActionFlags
  register: (handlers: KitchenHandlers | null, flags: KitchenActionFlags) => void
  run: (action: KitchenAction) => void
}>({ flags: NO_KITCHEN_ACTIONS, register: () => {}, run: () => {} })

export const useKitchenActions = () => useContext(KitchenActionsContext)

// True when nothing actionable is available — AddSheet skips the whole subgroup.
// « Idées » has no gating flag of its own (unlike shop, it's always worth opening
// while active — the drawer's own chips degrade individually, e.g. the 🤖 chip
// hides when AI is off), so the group only disappears with the page itself.
export const noKitchenActions = (f: KitchenActionFlags) => !f.active
