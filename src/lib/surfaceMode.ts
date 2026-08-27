import { createDeviceStore } from './createDeviceStore'

// THE factory behind every ⚙ SIMPLE ↔ AVANCÉ face flag (ACTIONS.md, door #13).
//
// A two-faces surface leans one way: the DEFAULT face is for reading/doing (a row
// is its content plus one action), and AVANCÉ puts the explicit ✏️/🗑/⠿ furniture
// back. The toggle is not decoration — on a surface whose simple face has no row
// furniture, flipping to Avancé IS the non-touch, non-gesture door to managing
// (CLAUDE.md: never leave a touch gesture — or nothing at all — as the only path).
//
// Every flag this mints is DEVICE-LOCAL (localStorage via createDeviceStore, so
// cross-tab synced): a guest may flip it, a wall kiosk and a phone each keep their
// own answer, and it must never be gated on isGuest(). Render the flag through the
// shared <ModeToggle> (components/ModeToggle.tsx) — it encodes the accessible-name
// and guest rules a hand-rolled chip gets wrong.
//
// notesMode.ts and listeMode.ts are the founding twins (they keep their own files
// for their surface-specific documentation); new surfaces mint their flag HERE and
// record the face split in ACTIONS.md Part 2. NOT every row list qualifies: a
// surface whose furniture already lives behind a door (Habitudes' peek, the board
// todos' tap-to-edit) or that is inherently managing (Réglages) stays single-faced.
export function createModeStore(key: string) {
  return createDeviceStore<boolean>(key, false, {
    read: (raw) => raw === '1',
    write: (v) => (v ? '1' : '0'),
  })
}

/** Le garde-manger (À utiliser / Il en manque / La réserve — one flag for the tab):
 *  simple = the check-and-go face (check + the réserve's 🛍 restock stay — they're
 *  DO actions, not furniture); Avancé restores ✏️ rename (+ the low list's 🗑
 *  discard-without-buying). */
const pantry = createModeStore('babillard-pantry-advanced')
export const usePantryAdvanced = pantry.use
export const getPantryAdvanced = pantry.get
export const setPantryAdvanced = pantry.set

/** The meal pools (Idées / Restants — MealPool, wherever it renders): simple =
 *  tap-a-chip-to-plan; Avancé restores ✏️ rename + 🗑 remove per row. */
const mealPool = createModeStore('babillard-repas-advanced')
export const useMealPoolAdvanced = mealPool.use
export const getMealPoolAdvanced = mealPool.get
export const setMealPoolAdvanced = mealPool.set
