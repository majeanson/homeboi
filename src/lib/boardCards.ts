import { type IconName } from './pipIcons'
import { createDeviceStore } from './createDeviceStore'

// Which board cards this DEVICE shows, where, how wide, and whether an EMPTY one still
// takes up space — a per-device layout (a wall kiosk and a phone keep their own).
// localStorage-backed, read live via useSyncExternalStore so a change (in Réglages OR in
// the board's own long-press edit mode) applies without a reload. NOT a household
// setting: the meaningful, shared colours (members/meals/chores) live server-side; this
// is just "what do I want on THIS screen".
//
// ONE kind of card. There used to be two — a fixed `BandCardId` top band that could only
// be shown/hidden, and a reorderable `GridCardId` masonry — and the split was baked into
// the types. Now every card is a `BoardCardId` that lives in a ZONE, and both zones are
// ordered and reorderable; a card can be dragged from one to the other. The band survives
// only as a zone (a pinned glance strip above the masonry), not as a class of card.
//
// Three per-card knobs:
//   • ZONE   — which of the two grids holds it (`band` on top, `grid` = the masonry).
//   • SIZE   — how many columns it spans: 1 | 2 | 3 | 'full'. Clamped to the grid's live
//              column count, so a size-3 card on a one-column phone renders span-1.
//   • MODE   — what an EMPTY card does:
//                'always' — keep its place, show an empty state
//                'auto'   — collapse when it has nothing to say (what most cards did by
//                           hand, via `return null`)
//                'never'  — not on this board at all (the old `hidden` set)
//              `never` is also the only mode that skips MOUNTING the card, so hiding one
//              still spares its fetch — exactly as `hidden` did.
//
// Calm: this only places, sizes and hides cards that already exist. No counts, no ranks,
// no new surface. Sizes and modes are display preferences, never data.

export type BoardCardId =
  | 'notes'
  | 'heroes'
  | 'mots'
  | 'aRegler'
  | 'moments'
  | 'autoCard'
  | 'fil'
  | 'today'
  | 'routineNext'
  | 'habitudes'
  | 'tomorrow'
  | 'countdown'
  | 'toFinish'
  | 'todos'
  | 'upcoming'
  | 'cercleNotes'
  | 'voyage'
  | 'carnets'
  | 'seasonUpkeep'
  | 'drawings'
  | 'photos'

/** The two ordered grids. `band` is the pinned glance strip; `grid` is the masonry. */
export type CardZone = 'band' | 'grid'
export const CARD_ZONES: readonly CardZone[] = ['band', 'grid'] as const

/** Columns a card spans. `'full'` = every column, whatever the viewport gives us. */
export type CardSize = 1 | 2 | 3 | 'full'
/** The order the on-board size chip cycles through. */
export const CARD_SIZES: readonly CardSize[] = [1, 2, 3, 'full'] as const

/** What an empty card does. See the header. */
export type CardMode = 'always' | 'auto' | 'never'
export const CARD_MODES: readonly CardMode[] = ['always', 'auto', 'never'] as const

export interface BoardCardPrefs {
  // Zone membership IS array membership — there's no separate `zone` field that could
  // contradict the arrays. Each array is that zone's display order.
  band: BoardCardId[]
  grid: BoardCardId[]
  // Sparse overrides; an id absent here uses its `BOARD_CARDS` default.
  size: Partial<Record<BoardCardId, CardSize>>
  mode: Partial<Record<BoardCardId, CardMode>>
}

export interface BoardCardMeta {
  id: BoardCardId
  /** Mirrors the card's own header glyph. Labels come from i18n `boardCard.<id>`, so
   *  this lib stays free of i18n imports. */
  icon: IconName
  zone: CardZone
  size: CardSize
  mode: CardMode
}

// THE canonical card list: identity, default placement, default size, default emptiness
// behaviour. Array order is the canonical order — `reconcile` splices a newly-added card
// in at its position here rather than stranding it last, so a card added in a future
// release lands where it belongs on a device that already has a saved layout.
//
// The defaults are chosen to REPRODUCE today's board: the band renders notes and the
// heroes full-width, then « Mots » / « À régler » / « Moments » three-across (the band
// grid caps at 3 columns, which is what the old `.board-status` flex row did); the
// masonry keeps its importance order with « L'auto », « Dessins » and « Photo du jour »
// as full-width strips (they were the three `column-span: all` cards).
//
// `mode: 'always'` marks the three cards that deliberately do NOT self-hide: « Moments »
// is a static launcher (never empty), « Dessins » keeps its gallery door open even with
// zero drawings, and « Aujourd'hui » always holds the day. Everything else already
// collapsed itself with `return null`, which is exactly `'auto'`.
//
// « À faire » is `auto` with a subtler emptiness than "no rows": it stays on a busy day
// even with an empty list (to offer the add button) and disappears only on a genuinely
// clear day — so its empty signal is `dayClear`, passed by the lens. Same knob, different
// question.
export const BOARD_CARDS: readonly BoardCardMeta[] = [
  // ── the pinned band (fridge notes ride above the heroes) ──
  { id: 'notes', icon: 'push-pin-bold', zone: 'band', size: 'full', mode: 'auto' },
  { id: 'heroes', icon: 'sun-bold', zone: 'band', size: 'full', mode: 'auto' },
  { id: 'mots', icon: 'envelope-bold', zone: 'band', size: 1, mode: 'auto' },
  { id: 'aRegler', icon: 'warning-bold', zone: 'band', size: 1, mode: 'auto' },
  { id: 'moments', icon: 'moon-stars-bold', zone: 'band', size: 1, mode: 'always' },
  // ── the masonry: car → the day's shape → the day → standing lists → upcoming → media ──
  { id: 'autoCard', icon: 'car-bold', zone: 'grid', size: 'full', mode: 'auto' },
  { id: 'fil', icon: 'clock-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'today', icon: 'sun-bold', zone: 'grid', size: 1, mode: 'always' },
  { id: 'routineNext', icon: 'smiley-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'habitudes', icon: 'repeat-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'tomorrow', icon: 'sun-horizon-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'countdown', icon: 'hourglass-high-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'toFinish', icon: 'check-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'todos', icon: 'check-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'upcoming', icon: 'calendar-blank-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'cercleNotes', icon: 'file-text-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'voyage', icon: 'map-pin-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'carnets', icon: 'book-open-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'seasonUpkeep', icon: 'broom-bold', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'drawings', icon: 'paint-brush-bold', zone: 'grid', size: 'full', mode: 'always' },
  { id: 'photos', icon: 'image-square-bold', zone: 'grid', size: 'full', mode: 'auto' },
]

const META = new Map<BoardCardId, BoardCardMeta>(BOARD_CARDS.map((c) => [c.id, c]))
const ALL_IDS: BoardCardId[] = BOARD_CARDS.map((c) => c.id)
const canonicalZone = (zone: CardZone): BoardCardId[] =>
  BOARD_CARDS.filter((c) => c.zone === zone).map((c) => c.id)

export const cardMeta = (id: BoardCardId): BoardCardMeta | undefined => META.get(id)

export const DEFAULT_CARD_PREFS: BoardCardPrefs = {
  band: canonicalZone('band'),
  grid: canonicalZone('grid'),
  size: {},
  mode: {},
}

const isId = (v: unknown): v is BoardCardId => typeof v === 'string' && META.has(v as BoardCardId)
const isSize = (v: unknown): v is CardSize => v === 'full' || v === 1 || v === 2 || v === 3
const isMode = (v: unknown): v is CardMode => v === 'always' || v === 'auto' || v === 'never'

// ── the persisted shapes ─────────────────────────────────────────────────────────────
// v1 (shipped): { order: GridCardId[]; hidden: BoardCardId[] } — band ids never appeared
// in `order`, only in `hidden`. v2 (now): { band, grid, size, mode }. Same localStorage
// key, so `reconcile` has to read both. Existing wall tablets carry v1.
interface PrefsV1 {
  order?: unknown
  hidden?: unknown
}

/**
 * Insert `id` into `zone` at its canonical position: right after the nearest canonical
 * predecessor (within that zone) the device still has, rather than stranded at the end.
 */
function spliceCanonical(zone: BoardCardId[], id: BoardCardId, canon: BoardCardId[]): void {
  const canonIdx = canon.indexOf(id)
  let insertAt = zone.length
  for (let k = canonIdx - 1; k >= 0; k--) {
    const p = zone.indexOf(canon[k]!)
    if (p >= 0) {
      insertAt = p + 1
      break
    }
  }
  zone.splice(insertAt, 0, id)
}

/**
 * Reconcile any persisted shape (v1 or v2, whole or partial) against the canonical card
 * list. Drops unknown ids, de-dupes an id that somehow lands in both zones, and splices
 * every canonical card the device is missing into its DEFAULT zone at its canonical
 * position — so a card added in a later release just appears.
 */
export function reconcile(saved: Partial<BoardCardPrefs> & PrefsV1): BoardCardPrefs {
  // v1 → v2. `order` is v1's only ordered list, and it held grid ids exclusively.
  const v1 = Array.isArray(saved.order)
  const rawBand = v1 ? [] : saved.band
  const rawGrid = v1 ? (saved.order as unknown[]) : saved.grid

  const seen = new Set<BoardCardId>()
  const take = (raw: unknown): BoardCardId[] => {
    if (!Array.isArray(raw)) return []
    const out: BoardCardId[] = []
    for (const v of raw) {
      // First occurrence wins, so an id present in both zones can't render twice.
      if (isId(v) && !seen.has(v)) {
        seen.add(v)
        out.push(v)
      }
    }
    return out
  }
  // A v1 device stored no band order at all, so `band` starts empty — the missing-id
  // pass below then splices every band card in at its canonical position, which is
  // precisely the canonical band order. No v1 special case needed.
  const band = take(rawBand)
  const grid = take(rawGrid)

  const zones: Record<CardZone, BoardCardId[]> = { band, grid }
  for (const id of ALL_IDS) {
    if (seen.has(id)) continue
    const meta = META.get(id)!
    spliceCanonical(zones[meta.zone], id, canonicalZone(meta.zone))
    seen.add(id)
  }

  const size: BoardCardPrefs['size'] = {}
  const rawSize = (saved.size ?? {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(rawSize)) if (isId(k) && isSize(v)) size[k] = v

  const mode: BoardCardPrefs['mode'] = {}
  const rawMode = (saved.mode ?? {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(rawMode)) if (isId(k) && isMode(v)) mode[k] = v
  // v1's `hidden` set is exactly v2's `never` mode.
  if (Array.isArray(saved.hidden)) for (const id of saved.hidden) if (isId(id)) mode[id] = 'never'

  return { band, grid, size, mode }
}

const store = createDeviceStore<BoardCardPrefs>('babillard-card-prefs', DEFAULT_CARD_PREFS, {
  read: (raw) =>
    raw == null ? DEFAULT_CARD_PREFS : reconcile(JSON.parse(raw) as Partial<BoardCardPrefs> & PrefsV1),
})

export const useBoardCards = store.use

/** Partial update: merge over the current layout, reconcile against the canonical ids, persist. */
export function setCardPrefs(patch: Partial<BoardCardPrefs>): void {
  store.set(reconcile({ ...store.get(), ...patch }))
}

/** Restore the default layout (canonical zones + order, default sizes and modes). */
export const resetCardPrefs = store.reset

// ── pure selectors + transforms (unit-tested; no React, no DOM) ──────────────────────

export const cardMode = (prefs: BoardCardPrefs, id: BoardCardId): CardMode =>
  prefs.mode[id] ?? META.get(id)?.mode ?? 'auto'

export const cardSize = (prefs: BoardCardPrefs, id: BoardCardId): CardSize =>
  prefs.size[id] ?? META.get(id)?.size ?? 1

/** Which zone currently holds this card (canonical default if it somehow holds none). */
export const cardZone = (prefs: BoardCardPrefs, id: BoardCardId): CardZone =>
  prefs.band.includes(id) ? 'band' : prefs.grid.includes(id) ? 'grid' : (META.get(id)?.zone ?? 'grid')

/**
 * The cards a zone should MOUNT, in order. `never` cards are dropped here — that's what
 * spares their fetch. An `auto` card is still mounted; it can only know it's empty after
 * it renders (see lib/useReportEmpty), and the slot collapses it then.
 */
export const visibleCards = (prefs: BoardCardPrefs, zone: CardZone): BoardCardId[] =>
  prefs[zone].filter((id) => cardMode(prefs, id) !== 'never')

/** Is this card on the board at all? The one question the toddler lens + `fil` ask. */
export const isCardVisible = (prefs: BoardCardPrefs, id: BoardCardId): boolean =>
  cardMode(prefs, id) !== 'never'

// ── drop-zone keys ───────────────────────────────────────────────────────────────────
// A drag has to say WHERE a card lands, and "where" is a zone plus an index — so the two
// travel together in one string, `"grid:3"` / `"band:end"` (the itinerary's `"{day}:{i}"`
// precedent). This is what lets a single drag session serve both zones: parsing the drop
// key tells you the card changed group. `'end'` appends, which is the only way to move a
// card back into a group you emptied. Shared by the board's editor and the Réglages list.

/** Build the `data-dnd-zone` key a slot (or a zone's tail target) advertises. */
export const zoneKey = (zone: CardZone, index: number | 'end'): string => `${zone}:${index}`

/** Parse a drop-zone key. Returns null for anything that isn't one of ours. */
export function parseZoneKey(key: string): { zone: CardZone; index: number | 'end' } | null {
  const [z, i] = key.split(':')
  if (z !== 'band' && z !== 'grid') return null
  if (i === 'end') return { zone: z, index: 'end' }
  const n = Number(i)
  return Number.isInteger(n) && n >= 0 ? { zone: z, index: n } : null
}

/** A size in actual columns, clamped to what the viewport gives us. `'full'` → all of them. */
export const clampSize = (size: CardSize, cols: number): number =>
  size === 'full' ? Math.max(1, cols) : Math.max(1, Math.min(size, cols))

/** The next size in the cycle — what the on-board size chip advances to. */
export function nextSize(size: CardSize): CardSize {
  const i = CARD_SIZES.indexOf(size)
  return CARD_SIZES[(i + 1) % CARD_SIZES.length]!
}

/**
 * Move `id` to `toIndex` within `toZone` (pure). Handles the cross-zone case: the card is
 * removed from wherever it was first, so the insert index is always read against the
 * already-spliced target array. Out-of-range indexes clamp to the ends.
 */
export function moveCard(
  prefs: BoardCardPrefs,
  id: BoardCardId,
  toZone: CardZone,
  toIndex: number,
): BoardCardPrefs {
  if (!META.has(id)) return prefs
  const band = prefs.band.filter((x) => x !== id)
  const grid = prefs.grid.filter((x) => x !== id)
  const next: BoardCardPrefs = { ...prefs, band, grid }
  const target = next[toZone]
  const at = Math.max(0, Math.min(toIndex, target.length))
  target.splice(at, 0, id)
  return next
}
