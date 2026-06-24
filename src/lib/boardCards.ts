import { useSyncExternalStore } from 'react'
import { type IconName } from './pipIcons'

// Which Grille cards this DEVICE shows, and in what order — a per-device layout (a
// wall kiosk and a phone keep their own). localStorage-backed, read live via
// useSyncExternalStore so toggling/reordering in Réglages updates the board without a
// reload. NOT a household setting: the meaningful, shared colours (members/meals/
// chores) live server-side; this is just "what do I want on THIS screen". Calm: it
// only hides/reorders existing cards — no counts, no new surfaces.
//
// The ids are the board's grid cards (the top heroes + status band stay fixed). The
// bunched Aujourd'hui+Demain is one card ('today'); « À finir » bundles leftovers +
// à-faire; « À compléter » is the persistent checklist.
export type BoardCardId = 'autoCard' | 'today' | 'toFinish' | 'todos' | 'upcoming' | 'drawings' | 'photos'

export interface BoardCardPrefs {
  order: BoardCardId[]
  hidden: BoardCardId[]
}

// Default order = today's importance: car → the day → standing lists → upcoming →
// media. Everything visible. This is also the canonical id list (read() reconciles a
// saved layout against it, so a NEW card added here auto-appears, visible, at the end).
const DEFAULTS: BoardCardPrefs = {
  order: ['autoCard', 'today', 'toFinish', 'todos', 'upcoming', 'drawings', 'photos'],
  hidden: [],
}

// Static meta for the settings UI (the label comes from i18n `boardCard.<id>`, so this
// lib stays free of i18n imports). Icons mirror each card's own header glyph.
export const BOARD_CARD_META: { id: BoardCardId; icon: IconName }[] = [
  { id: 'autoCard', icon: 'car-bold' },
  { id: 'today', icon: 'sun-bold' },
  { id: 'toFinish', icon: 'check-bold' },
  { id: 'todos', icon: 'check-bold' },
  { id: 'upcoming', icon: 'calendar-blank-bold' },
  { id: 'drawings', icon: 'paint-brush-bold' },
  { id: 'photos', icon: 'image-square-bold' },
]

const KEY = 'babillard-card-prefs'
const listeners = new Set<() => void>()
let cache: BoardCardPrefs | null = null

// Reconcile a saved layout against the canonical id list: keep saved order for known
// ids, drop ids that no longer exist, and APPEND any new default cards at the end
// (visible). So adding a card to DEFAULTS.order never strands it off an old device.
function reconcile(saved: Partial<BoardCardPrefs>): BoardCardPrefs {
  const savedOrder = Array.isArray(saved.order) ? saved.order.filter((id): id is BoardCardId => DEFAULTS.order.includes(id as BoardCardId)) : []
  const missing = DEFAULTS.order.filter((id) => !savedOrder.includes(id))
  const order = [...savedOrder, ...missing]
  const hidden = Array.isArray(saved.hidden) ? saved.hidden.filter((id): id is BoardCardId => DEFAULTS.order.includes(id as BoardCardId)) : []
  return { order, hidden }
}

function read(): BoardCardPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    return reconcile(JSON.parse(raw) as Partial<BoardCardPrefs>)
  } catch {
    return DEFAULTS
  }
}

function snapshot(): BoardCardPrefs {
  if (!cache) cache = read()
  return cache
}

export function setCardPrefs(patch: Partial<BoardCardPrefs>): void {
  cache = reconcile({ ...snapshot(), ...patch })
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* private mode — the change still holds for this session via the cache */
  }
  listeners.forEach((l) => l())
}

// Restore the default layout (everything visible, canonical order).
export function resetCardPrefs(): void {
  cache = DEFAULTS
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useBoardCards(): BoardCardPrefs {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULTS)
}

// The visible cards in order — the one thing the board needs to render.
export function visibleCardOrder(prefs: BoardCardPrefs): BoardCardId[] {
  return prefs.order.filter((id) => !prefs.hidden.includes(id))
}
