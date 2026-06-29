import { type IconName } from './pipIcons'
import { createDeviceStore } from './createDeviceStore'

// Which Grille cards this DEVICE shows, and in what order — a per-device layout (a
// wall kiosk and a phone keep their own). localStorage-backed, read live via
// useSyncExternalStore so toggling/reordering in Réglages updates the board without a
// reload. NOT a household setting: the meaningful, shared colours (members/meals/
// chores) live server-side; this is just "what do I want on THIS screen". Calm: it
// only hides/reorders existing cards — no counts, no new surfaces.
//
// Two families of card, so EVERY Grille card has a show/hide setting (Marc: make it
// exhaustive):
//   • BAND cards — the fixed top band: the « Ce soir »/météo heroes, « À régler », and
//     « Moments ». They keep their structural position (the glance band stays on top),
//     so they're show/hide ONLY, not reordered.
//   • GRID cards — the masonry below: car, the day, standing lists, upcoming, media.
//     These show/hide AND reorder.
// The bunched Aujourd'hui+Demain is one card ('today'); « À finir » bundles leftovers +
// à-faire; « À compléter » is the persistent checklist.
export type BandCardId = 'notes' | 'heroes' | 'aRegler' | 'moments'
export type GridCardId = 'autoCard' | 'fil' | 'today' | 'tomorrow' | 'toFinish' | 'todos' | 'upcoming' | 'voyage' | 'carnets' | 'seasonUpkeep' | 'drawings' | 'photos'
export type BoardCardId = BandCardId | GridCardId

export interface BoardCardPrefs {
  // The reorderable GRID cards, in display order. Band cards are never in here (they
  // hold a fixed position) — only their hidden state is tracked.
  order: GridCardId[]
  // Any card (band or grid) the device has hidden.
  hidden: BoardCardId[]
}

// The fixed top band, in render order (fridge notes ride above the heroes). Show/hide
// only.
const BAND_CARD_IDS: BandCardId[] = ['notes', 'heroes', 'aRegler', 'moments']

// Default GRID order = today's importance: car → the day's shape (« Le fil du jour ») →
// the day list → standing lists → upcoming → media. Everything visible. This is also the
// canonical grid-id list (read() reconciles a saved layout against it, so a NEW card
// added here auto-appears, visible, at the end for existing devices).
const DEFAULT_GRID_ORDER: GridCardId[] = ['autoCard', 'fil', 'today', 'tomorrow', 'toFinish', 'todos', 'upcoming', 'voyage', 'carnets', 'seasonUpkeep', 'drawings', 'photos']
// Every known id (band + grid) — used to validate the persisted `hidden` set.
const ALL_IDS: BoardCardId[] = [...BAND_CARD_IDS, ...DEFAULT_GRID_ORDER]

const DEFAULTS: BoardCardPrefs = { order: DEFAULT_GRID_ORDER, hidden: [] }

// Static meta for the settings UI (the label comes from i18n `boardCard.<id>`, so this
// lib stays free of i18n imports). Icons mirror each card's own header glyph. Split so
// the settings panel can group the fixed band apart from the reorderable grid.
export const BAND_CARD_META: { id: BandCardId; icon: IconName }[] = [
  { id: 'notes', icon: 'push-pin-bold' },
  { id: 'heroes', icon: 'sun-bold' },
  { id: 'aRegler', icon: 'warning-bold' },
  { id: 'moments', icon: 'moon-stars-bold' },
]
export const GRID_CARD_META: { id: GridCardId; icon: IconName }[] = [
  { id: 'autoCard', icon: 'car-bold' },
  { id: 'fil', icon: 'clock-bold' },
  { id: 'today', icon: 'sun-bold' },
  { id: 'tomorrow', icon: 'sun-horizon-bold' },
  { id: 'toFinish', icon: 'check-bold' },
  { id: 'todos', icon: 'check-bold' },
  { id: 'upcoming', icon: 'calendar-blank-bold' },
  { id: 'voyage', icon: 'map-pin-bold' },
  { id: 'carnets', icon: 'book-open-bold' },
  { id: 'seasonUpkeep', icon: 'broom-bold' },
  { id: 'drawings', icon: 'paint-brush-bold' },
  { id: 'photos', icon: 'image-square-bold' },
]

// Reconcile a saved layout against the canonical id lists: keep saved GRID order for
// known grid ids, drop ids that no longer exist, and splice any new default grid card in
// at its CANONICAL position (right after its canonical predecessor that the device still
// has) rather than at the very end — so a new card (e.g. 'fil' before 'today') lands where
// it belongs on a device with an existing layout, not stranded last. The `hidden` set may
// name any card (band or grid).
function reconcile(saved: Partial<BoardCardPrefs>): BoardCardPrefs {
  const savedOrder = Array.isArray(saved.order)
    ? saved.order.filter((id): id is GridCardId => DEFAULT_GRID_ORDER.includes(id as GridCardId))
    : []
  const order = [...savedOrder]
  for (const id of DEFAULT_GRID_ORDER) {
    if (order.includes(id)) continue
    const canonIdx = DEFAULT_GRID_ORDER.indexOf(id)
    let insertAt = order.length
    for (let k = canonIdx - 1; k >= 0; k--) {
      const p = order.indexOf(DEFAULT_GRID_ORDER[k]!)
      if (p >= 0) {
        insertAt = p + 1
        break
      }
    }
    order.splice(insertAt, 0, id)
  }
  const hidden = Array.isArray(saved.hidden)
    ? saved.hidden.filter((id): id is BoardCardId => ALL_IDS.includes(id as BoardCardId))
    : []
  return { order, hidden }
}

const store = createDeviceStore<BoardCardPrefs>('babillard-card-prefs', DEFAULTS, {
  read: (raw) => (raw == null ? DEFAULTS : reconcile(JSON.parse(raw) as Partial<BoardCardPrefs>)),
})

export const useBoardCards = store.use

// Partial update: merge over the current layout, reconcile against the canonical ids,
// persist.
export function setCardPrefs(patch: Partial<BoardCardPrefs>): void {
  store.set(reconcile({ ...store.get(), ...patch }))
}

// Restore the default layout (everything visible, canonical order).
export const resetCardPrefs = store.reset

// The visible GRID cards in order — what the masonry needs to render.
export function visibleCardOrder(prefs: BoardCardPrefs): GridCardId[] {
  return prefs.order.filter((id) => !prefs.hidden.includes(id))
}

// Is a single card (band OR grid) visible on this device? Band cards use this to gate
// their fixed-position render; grid cards already go through visibleCardOrder.
export function isCardVisible(prefs: BoardCardPrefs, id: BoardCardId): boolean {
  return !prefs.hidden.includes(id)
}
