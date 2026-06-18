import { useSyncExternalStore } from 'react'

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
const DKEY = 'babillard-cook-density'
const DENSITIES: CookDensity[] = ['compact', 'normal', 'large']
const listeners = new Set<() => void>()
let cache: CookDensity | null = null

function readDensity(): CookDensity {
  try {
    const raw = localStorage.getItem(DKEY) as CookDensity | null
    return raw && DENSITIES.includes(raw) ? raw : 'normal'
  } catch {
    return 'normal'
  }
}

function densitySnapshot(): CookDensity {
  if (!cache) cache = readDensity()
  return cache
}

export function setCookDensity(d: CookDensity): void {
  cache = d
  try {
    localStorage.setItem(DKEY, d)
  } catch {
    /* private mode — holds for the session via the cache */
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useCookDensity(): CookDensity {
  return useSyncExternalStore(subscribe, densitySnapshot, () => 'normal')
}

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
