import { useSyncExternalStore } from 'react'
import { DEFAULT_CARD_PREFS, type BoardCardId, type BoardCardPrefs } from './boardCards'

// The trial board on a PHONE: a short, curated glance instead of the whole masonry.
//
// A seeded trial household fills every card, and on a 390px screen that is a very long
// scroll — the opposite of « d'un coup d'œil » on the one surface the visitor is most
// likely holding (stranger review 2026-10-23). So a sandbox visitor on a phone-width
// screen who has NOT arranged their own board sees five cards, with « Tout voir » for the
// rest. It reuses the layout store's own knob: a card the device does not show is mode
// `never`, and `never` is also the only mode that skips MOUNTING the card — so the
// curation spares those cards' fetches too, not just their pixels.
//
// Nothing here is saved. It is a lens over `useBoardCards()`, applied at render by the
// Board; the stored layout (and Réglages ▸ Disposition, and the edit mode) never see it.
// Calm: fewer cards, no counts.

/** The five cards a stranger needs to understand the product: the fridge notes, tonight's
 *  supper + weather, the day, the next kid routine, and the to-do list. */
export const CURATED_PHONE_CARDS: readonly BoardCardId[] = ['notes', 'heroes', 'today', 'routineNext', 'todos']

/** Phone-width, in CSS px — the same breakpoint the landing page's phone/tablet shot uses. */
export const PHONE_MAX_WIDTH = 699

/**
 * The layout the trial phone renders: the stored prefs with every card outside the
 * curated set switched to `never`. Pure. A device that has arranged its own board
 * (anything but the untouched default store) is left exactly as it chose.
 */
export function curateForTrial(prefs: BoardCardPrefs): BoardCardPrefs {
  if (prefs !== DEFAULT_CARD_PREFS) return prefs
  const mode: BoardCardPrefs['mode'] = { ...prefs.mode }
  for (const id of [...prefs.band, ...prefs.grid]) if (!CURATED_PHONE_CARDS.includes(id)) mode[id] = 'never'
  return { ...prefs, mode }
}

const QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`
function subscribe(cb: () => void): () => void {
  try {
    const mq = window.matchMedia(QUERY)
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
  } catch {
    return () => {}
  }
}
function snapshot(): boolean {
  try {
    return window.matchMedia(QUERY).matches
  } catch {
    return false
  }
}

/** Is this window phone-width? Live, so rotating a tablet or resizing a desktop window flips it. */
export function usePhoneWidth(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
