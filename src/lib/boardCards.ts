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
  | 'today'
  | 'departure'
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
  /**
   * The card's persona colour, as a CSS custom-property reference — what `CardSlot`
   * publishes as `--wg-tint` on the slot.
   *
   * It is a FALLBACK, not an override: a card that sets its own `--sec-tint` (every
   * `Section` with a `tint`, `.habitudes-card`, `.voyage-card`, `.auto-card`'s live
   * `--car-tint`) still wins. It exists for the two places the card itself can't speak:
   * a card that never set a tint at all (« Les carnets », « Le décompte »), and the
   * EMPTY placeholder the slot draws in the card's stead when the card returned null —
   * which used to render as an anonymous grey box, indistinguishable between "nothing
   * here" and "no colour here".
   *
   * Groups by meaning, never per-card novelty (NFR-CALM): warm marigold = today, cool
   * sky = later, sage/terracotta = the lists, teal = Le cercle's people and things.
   */
  tint: string
  zone: CardZone
  size: CardSize
  mode: CardMode
  /**
   * Can this card render a genuine compact (icon + title + one quiet line) form at
   * span 1? Default `true` — omit the field for every ordinary card. Set `false` only
   * for a card whose content doesn't compress into a summary without hiding real
   * function: a media-only card with no header (`photos`), a multi-item strip rather
   * than one summary (`notes`, `drawings`), or two glued hero tiles (`heroes`). The
   * on-board size chip (`nextSize`) skips the half size for these, and `reconcile`
   * clamps away a stored half that predates the flag.
   */
  halvable?: boolean
  /**
   * Where an EMPTY compact tile taps to. When the slot draws the empty placeholder (an
   * `always` card that has nothing to show), its mini would otherwise grow into a « Rien
   * pour l'instant » shell — a dead expand. If the card has a natural "go add one" page,
   * name it here and the empty mini navigates there instead (CardSlot → `compactTo`).
   * Omit for a card with no such destination (it keeps the plain grow-to-empty-shell).
   * A card that fills itself with a live status (« L'auto » free-all-day) passes its own
   * `compactTo` from the component — this is only the slot-drawn placeholder path.
   */
  emptyTo?: string
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
  // `notes` is not `halvable`: a multi-card strip has no one-summary compact form.
  // `heroes` IS halvable — its mini is a MEDIA tile (the wonder photo + the
  // temperature, nothing else; DayHeroes.tsx), not the generic icon+title.
  { id: 'notes', icon: 'push-pin-bold', tint: 'var(--marigold)', zone: 'band', size: 'full', mode: 'auto', halvable: false },
  { id: 'heroes', icon: 'sun-bold', tint: 'var(--marigold)', zone: 'band', size: 'full', mode: 'auto' },
  { id: 'mots', icon: 'envelope-bold', tint: 'var(--teal)', zone: 'band', size: 1, mode: 'auto' },
  { id: 'aRegler', icon: 'warning-bold', tint: 'var(--marigold-deep)', zone: 'band', size: 1, mode: 'auto' },
  { id: 'moments', icon: 'moon-stars-bold', tint: 'var(--berry-deep)', zone: 'band', size: 1, mode: 'always' },
  // ── the masonry: car → the day → standing lists → upcoming → media ──
  // « Aujourd'hui » owns the whole day: its agenda AND — on a busy day (≥2 timed
  // things) — the day's timeline (the « fil » ribbon, formerly a card of its own).
  { id: 'autoCard', icon: 'car-bold', tint: 'var(--sky-deep)', zone: 'grid', size: 'full', mode: 'auto', emptyTo: '/voiture' },
  { id: 'today', icon: 'sun-bold', tint: 'var(--marigold)', zone: 'grid', size: 1, mode: 'always' },
  // « Avant de partir » — the departure concept's home (mig 0116): today's checklist
  // instances + bring-lists + the door to /board/departure. `always` because the
  // door + weather tip render on every day — leaving the house isn't conditional on
  // the agenda — so the card never sits slot-empty.
  { id: 'departure', icon: 'key-bold', tint: 'var(--marigold-deep)', zone: 'grid', size: 1, mode: 'always', emptyTo: '/board/departure' },
  { id: 'routineNext', icon: 'smiley-bold', tint: 'var(--berry)', zone: 'grid', size: 1, mode: 'auto', emptyTo: '/routines' },
  { id: 'habitudes', icon: 'repeat-bold', tint: 'var(--sage-deep)', zone: 'grid', size: 1, mode: 'auto', emptyTo: '/board/habitudes' },
  { id: 'tomorrow', icon: 'sun-horizon-bold', tint: 'var(--sky)', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'countdown', icon: 'hourglass-high-bold', tint: 'var(--berry-deep)', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'toFinish', icon: 'check-bold', tint: 'var(--sage)', zone: 'grid', size: 1, mode: 'auto', emptyTo: '/kitchen' },
  { id: 'todos', icon: 'check-bold', tint: 'var(--terracotta)', zone: 'grid', size: 1, mode: 'auto' },
  { id: 'upcoming', icon: 'calendar-blank-bold', tint: 'var(--sky)', zone: 'grid', size: 1, mode: 'auto', emptyTo: '/event/new' },
  { id: 'cercleNotes', icon: 'file-text-bold', tint: 'var(--teal-deep)', zone: 'grid', size: 1, mode: 'auto', emptyTo: '/cercle' },
  { id: 'voyage', icon: 'map-pin-bold', tint: 'var(--teal)', zone: 'grid', size: 1, mode: 'auto', emptyTo: '/voyage/new' },
  { id: 'carnets', icon: 'book-open-bold', tint: 'var(--teal-deep)', zone: 'grid', size: 1, mode: 'auto', emptyTo: '/cercle' },
  { id: 'seasonUpkeep', icon: 'broom-bold', tint: 'var(--sage-deep)', zone: 'grid', size: 1, mode: 'auto', emptyTo: '/home-project/new' },
  // `drawings` is not `halvable` for the same reason as `notes`: a gallery door has
  // no one-summary compact form. `photos` IS halvable — its mini is a MEDIA tile
  // (just the current photo; PhotoFrame.tsx).
  { id: 'drawings', icon: 'paint-brush-bold', tint: 'var(--berry)', zone: 'grid', size: 'full', mode: 'always', halvable: false },
  { id: 'photos', icon: 'image-square-bold', tint: 'var(--sky)', zone: 'grid', size: 'full', mode: 'auto' },
]

const META = new Map<BoardCardId, BoardCardMeta>(BOARD_CARDS.map((c) => [c.id, c]))
const ALL_IDS: BoardCardId[] = BOARD_CARDS.map((c) => c.id)
const canonicalZone = (zone: CardZone): BoardCardId[] =>
  BOARD_CARDS.filter((c) => c.zone === zone).map((c) => c.id)

export const cardMeta = (id: BoardCardId): BoardCardMeta | undefined => META.get(id)

/** Can this card render a genuine compact form? See `BoardCardMeta.halvable`. */
export const isHalvable = (id: BoardCardId): boolean => META.get(id)?.halvable ?? true

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
  for (const [k, v] of Object.entries(rawSize)) {
    if (!isId(k) || !isSize(v)) continue
    // A stored half predating the `halvable` flag (or a device that migrated from an
    // older build) is clamped away here, so `cardSize` falls back to the card's
    // canonical (non-half) default instead of persisting a size the card refuses.
    if (v === 1 && !isHalvable(k)) continue
    size[k] = v
  }

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

/**
 * A card's width. `fallback` overrides the CANONICAL default while leaving an explicit
 * choice alone — which is the whole point on a phone: its grid has two columns so a card
 * *can* be a half, but a card nobody has sized stays full width (a 150px column can't
 * hold « Aujourd'hui »'s rows). The presence of `prefs.size[id]` is exactly "the user
 * chose this", so it always wins.
 */
export const cardSize = (prefs: BoardCardPrefs, id: BoardCardId, fallback?: CardSize): CardSize =>
  prefs.size[id] ?? fallback ?? META.get(id)?.size ?? 1

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
// A drag has to say WHERE a card lands, so the target travels with the zone in one string:
// `"grid:today"` = "into the grid, before « Aujourd'hui »"; `"band:end"` = "append to the
// band" (the only way to move a card back into a group you emptied). One drag session can
// therefore serve both zones — parsing the key tells you the card changed group. Shared by
// the board's editor and the Réglages list.
//
// It names the target CARD, never its index. Two bugs died with the index:
//   • an index is read against the VISIBLE cards, while `moveCard` splices into the full
//     array — a single `never` card above the target silently skewed every drop;
//   • "insert at index i" means one thing dragging up and another dragging down, because
//     removing the dragged card first shifts everything after it left by one. Dropping
//     "before this card" is the same instruction in both directions.

/** Build the `data-dnd-zone` key a slot (or a zone's tail target) advertises. */
export const zoneKey = (zone: CardZone, before: BoardCardId | 'end'): string => `${zone}:${before}`

/** Parse a drop-zone key. Returns null for anything that isn't one of ours. */
export function parseZoneKey(key: string): { zone: CardZone; before: BoardCardId | 'end' } | null {
  const [z, b] = key.split(':')
  if (z !== 'band' && z !== 'grid') return null
  if (b === 'end') return { zone: z, before: 'end' }
  return b && isId(b) ? { zone: z, before: b } : null
}

/** A size in actual columns, clamped to what the viewport gives us. `'full'` → all of them. */
export const clampSize = (size: CardSize, cols: number): number =>
  size === 'full' ? Math.max(1, cols) : Math.max(1, Math.min(size, cols))

/**
 * The next size in the cycle — what the on-board size chip advances to.
 *
 * Pass the grid's live column count to cycle only through sizes that LOOK different
 * there. On a two-column phone, 2 / 3 / full all clamp to the same full width, so the
 * chip would sit dead for two taps out of four; it toggles half ↔ full instead.
 *
 * Pass `halvable: false` (see `BoardCardMeta.halvable`) for a card that can't render a
 * genuine compact form — the cycle then skips size 1 entirely, so the chip can never
 * offer a width the card refuses. On a two-column phone that collapses the toggle to a
 * single, unchanging `'full'` (the only width left it can render there), which reads
 * as "no chip" rather than a dead half.
 */
export function nextSize(size: CardSize, cols?: number, halvable = true): CardSize {
  if (cols != null && cols <= 2) {
    if (!halvable) return 'full'
    return size === 1 ? 'full' : 1
  }
  const sizes = halvable ? CARD_SIZES : CARD_SIZES.filter((s) => s !== 1)
  const i = sizes.indexOf(size)
  // `size` may itself be the just-disallowed 1 (a stored pref predating `halvable`,
  // or the flag having just changed); treat "not found" as "before the first" so the
  // cycle still advances sensibly rather than throwing.
  return sizes[i < 0 ? 0 : (i + 1) % sizes.length]!
}

/**
 * Move `id` into `toZone`, immediately BEFORE the card `before` — or to the end when
 * `before` is `'end'` (or names a card that isn't there). Pure.
 *
 * "Before this card" rather than "at this index" is what makes a downward drag behave:
 * the dragged card is removed first, which shifts every later index left by one, so an
 * index means different things depending on the drag direction. A neighbour doesn't move.
 */
export function moveCard(
  prefs: BoardCardPrefs,
  id: BoardCardId,
  toZone: CardZone,
  before: BoardCardId | 'end',
): BoardCardPrefs {
  if (!META.has(id) || id === before) return prefs
  const band = prefs.band.filter((x) => x !== id)
  const grid = prefs.grid.filter((x) => x !== id)
  const next: BoardCardPrefs = { ...prefs, band, grid }
  const target = next[toZone]
  const at = before === 'end' ? -1 : target.indexOf(before)
  target.splice(at < 0 ? target.length : at, 0, id)
  return next
}
