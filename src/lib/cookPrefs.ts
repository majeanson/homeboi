import { createDeviceStore } from './createDeviceStore'

// Cook-mode viewer preferences.
//
//   • DENSITY — the text size of every Cook-mode view, device-wide: 'compact'
//     (small, no fluff), 'normal', or 'large' (big + higher contrast, to read the
//     tablet from across the kitchen). Read live via useSyncExternalStore so the
//     bar control repaints the open recipe at once. Same store shape as lib/ambient.
//
//   • VIEW — which layout the PARENT audience last chose for a given recipe
//     ('full' scroll page, 'split' ingredients|steps, or 'step' focus stepper),
//     remembered PER RECIPE so reopening a dish restores how you cooked it last.
//     Plain localStorage (the component holds it in state) — no global store
//     needed, it's read once on open. Toddler is always locked to 'step', so this
//     never applies to the toddler lens.

export type CookView = 'step' | 'full' | 'split'
export type CookDensity = 'compact' | 'normal' | 'large'

// — density (device-wide, live) —
const DENSITIES: CookDensity[] = ['compact', 'normal', 'large']
const densityStore = createDeviceStore<CookDensity>('babillard-cook-density', 'normal', {
  read: (raw) => (raw && DENSITIES.includes(raw as CookDensity) ? (raw as CookDensity) : 'normal'),
  write: (d) => d,
})

export const setCookDensity = densityStore.set
export const useCookDensity = densityStore.use

// — per-step ingredients (device-wide, live) —
// Whether each step shows the ingredients it uses ("what you need right now",
// with scaled quantities + colour pills). Default ON. Device-wide + live (same
// store shape as density) so the bar toggle repaints every open cook view at once,
// and the choice carries to the next recipe. The toddler stepper ignores this and
// always shows them (its gather-then-cook flow needs them, and it has no toggle).
const stepIngsStore = createDeviceStore<boolean>('babillard-cook-step-ings', true, {
  read: (raw) => raw !== 'off', // unset / anything-but-"off" = ON
  write: (on) => (on ? 'on' : 'off'),
})

export const setShowStepIngredients = stepIngsStore.set
export const useShowStepIngredients = stepIngsStore.use

// — per-recipe view (read once on open, saved on change) —
const VIEWS: CookView[] = ['step', 'full', 'split']
const vkey = (recipeId: string) => `babillard-cook-view:${recipeId}`

export function loadCookView(recipeId: string): CookView {
  try {
    const raw = localStorage.getItem(vkey(recipeId)) as CookView | null
    return raw && VIEWS.includes(raw) ? raw : 'full'
  } catch {
    return 'full'
  }
}

export function saveCookView(recipeId: string, view: CookView): void {
  try {
    localStorage.setItem(vkey(recipeId), view)
  } catch {
    /* private mode — fine, the in-session choice still holds in component state */
  }
}
