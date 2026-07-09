import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useT } from '../../i18n'
import { CardEmptyContext, type EmptyReporter } from '../../lib/useReportEmpty'
import {
  clampSize,
  cardSize,
  cardMode,
  cardMeta,
  nextSize,
  setCardPrefs,
  useBoardCards,
  zoneKey,
  type BoardCardId,
  type CardZone,
} from '../../lib/boardCards'
import { colWidth, isCompact, rowSpan } from '../../lib/widgetGrid'
import { EmptyState } from '../EmptyState'
import { InlineIcon } from '../Icon'
import { BoardCard } from './BoardCard'
import { CardLensProvider, type CardLens } from './CardLens'
import { useWidgetGrid } from './WidgetGrid'

// A stable no-op pair so `expand`/`collapse` don't churn the lens value's identity
// every render while Phase 1 leaves them unwired (see CardLens.tsx).
const NOOP = () => {}

// The slot a board card sits in: it owns PLACEMENT (row/column span), the drop target,
// and the empty gate. It owns NO visual chrome — each card still draws its own look
// (`.bento`, `.now-card`, `.photo-frame`, `.notes`). That separation is the whole point:
// a card that carries its own chrome can be moved between zones without changing
// appearance, which is why `.bento`'s fill/shadow moved off `.board-grid > .bento`.
//
// Not to be confused with `BoardCard` (BoardCard.tsx), which is the shared HEADER +
// container anatomy a card renders INSIDE this slot. Slot = where; BoardCard = what.
//
// SPAN. The slot is the grid item, so its own height is dictated by the row span — which
// makes measuring it circular. We measure the inner wrapper's natural height instead and
// derive the span from that (see `rowSpan`). Re-measured on any content change via a
// ResizeObserver, coalesced to one write per frame.
//
// EMPTY. `mode` decides what an empty card does (lib/boardCards):
//   • 'never'  — never reaches a slot at all; `visibleCards` drops it, so its fetch is
//                spared. That is exactly what the old `hidden` set bought.
//   • 'auto'   — collapse when empty. The card STAYS MOUNTED (`display:none`), because a
//                self-fetching card can only discover it's empty after it has fetched —
//                which is precisely what it used to do before returning `null`.
//   • 'always' — hold its place. A card that reports empty renders nothing of its own, so
//                the slot supplies a uniform placeholder (the shared `BoardCard` header +
//                a calm empty line). That is why « Toujours afficher » works for every
//                card without nine bespoke empty states.
// Emptiness arrives through one of two channels, both resolved here:
//   • the `empty` prop, when the lens already holds the rows (Board.tsx), or
//   • `useReportEmpty` from inside the card, when only the card knows.
// The prop wins if given; otherwise the reported value; otherwise "not empty".
export function CardSlot({
  id,
  zone,
  empty,
  children,
}: {
  id: BoardCardId
  zone: CardZone
  /** Lens-computed emptiness. Omit to let the card report its own. */
  empty?: boolean
  children: ReactNode
}) {
  const t = useT()
  const prefs = useBoardCards()
  const grid = useWidgetGrid()
  const innerRef = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState(1)

  // The child→shell registration channel. Idempotent by construction: a report whose
  // value already matches is dropped, so an unstable caller is a harmless no-op rather
  // than a render loop (see lib/useReportEmpty, and the Kitchen→HubLayout freeze).
  const [reported, setReported] = useState(false)
  const report = useCallback<EmptyReporter>((v) => setReported((prev) => (prev === v ? prev : v)), [])

  const isEmpty = empty ?? reported
  const mode = cardMode(prefs, id)
  const collapsed = mode === 'auto' && isEmpty
  // An `always` card that has nothing to draw still holds its place — the slot fills it
  // rather than leaving an 8px stub where a card used to be.
  const placeholder = mode === 'always' && isEmpty
  const meta = cardMeta(id)
  const cols = grid?.cols ?? 1
  // On a phone the grid has two columns so a card CAN be a half — but one nobody sized
  // stays full width (a 150px column can't hold « Aujourd'hui »'s rows), so the default
  // board is unchanged. An explicit choice always wins over this fallback.
  const size = cardSize(prefs, id, grid?.narrow ? 'full' : undefined)
  const span = clampSize(size, cols)

  // The compact lens (see CardLens.tsx): keys on the MEASURED rendered width (span ×
  // the grid's measured column width), never on `size` alone or on `surface`. Phase 1
  // only computes `compact` for real — nothing reads it yet, so this changes no pixel.
  const compact = isCompact(colWidth(grid?.width ?? 0, cols), span)
  const lens = useMemo<CardLens>(
    () => ({ compact, expanded: false, expand: NOOP, collapse: NOOP }),
    [compact],
  )

  useEffect(() => {
    const el = innerRef.current
    // A collapsed slot is `display:none`: it measures 0 and would thrash the span back to
    // 1. Leave the last good span alone; it is recomputed the moment it un-collapses.
    if (!el || collapsed) return
    let raf = 0
    const measure = () =>
      setRows((prev) => {
        const next = rowSpan(el.getBoundingClientRect().height)
        return prev === next ? prev : next
      })
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    ro.observe(el)
    measure()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [collapsed, span])

  const style = useMemo(
    () => ({ ['--wg-span-rows' as string]: rows, ['--wg-span-cols' as string]: span }),
    [rows, span],
  )

  const editing = !!grid?.editing
  const dnd = grid?.dnd ?? null
  // "Drop here" means "insert before THIS card" — never "at index N". See `zoneKey`.
  const key = zoneKey(zone, id)
  const label = t.boardCard[id]

  // A MOUSE may grab the card body: it never scrolls by dragging, so there's no gesture
  // to lose. A FINGER must use the ⠿ grip, which is the only element carrying
  // `touch-action: none` — putting that on the whole card would make the board
  // unscrollable for as long as edit mode is armed. Same split `.dnd-grip` uses app-wide.
  const grabBody = (e: ReactPointerEvent) => {
    if (!editing || !dnd || e.pointerType !== 'mouse') return
    // …except on the controls, which own their own taps.
    if ((e.target as Element).closest('.wg-slot__ctl')) return
    dnd.start(id, label, e)
  }

  const hide = () => setCardPrefs({ mode: { ...prefs.mode, [id]: 'never' } })
  // Cycle from the EFFECTIVE size, not the stored one: on a phone an un-sized card reads
  // « Max », so the first tap takes it to 1 (a half) — which is what the eye expects.
  // Cycling from the stored default (1) would instead jump it to 2, and 2 clamps back to
  // full on two columns: the chip would appear to do nothing.
  const resize = () =>
    setCardPrefs({ size: { ...prefs.size, [id]: nextSize(size, cols, meta?.halvable ?? true) } })

  return (
    <section
      className={
        'wg-slot' +
        (editing ? ' wg-slot--editing' : '') +
        (dnd?.activeId === id ? ' is-dragging' : '') +
        (dnd?.over === key ? ' dnd-over' : '')
      }
      style={style}
      data-card={id}
      // Drop targets exist only while editing. Always-on would also opt every board card
      // out of tap-to-hear, which excludes `[data-dnd-zone]` by design.
      data-dnd-zone={editing ? key : undefined}
      data-empty={isEmpty ? '' : undefined}
      hidden={collapsed}
      onPointerDown={grabBody}
    >
      <CardEmptyContext.Provider value={report}>
        <CardLensProvider value={lens}>
          <div className="wg-slot__inner" ref={innerRef}>
            {children}
            {placeholder && meta && (
              <BoardCard className="bento wg-slot__placeholder" label={label} icon={meta.icon}>
                <EmptyState>{t.board.cardEmpty}</EmptyState>
              </BoardCard>
            )}
          </div>
        </CardLensProvider>
      </CardEmptyContext.Provider>

      {editing && (
        <>
          {/* The touch drag handle. `role="button"` + the drag label, mirroring DragPill. */}
          <span
            className="wg-slot__ctl wg-slot__grip"
            data-dnd-grip=""
            role="button"
            aria-label={t.operator.dragHint}
            title={t.operator.dragHint}
            onPointerDown={(e) => dnd?.start(id, label, e)}
          >
            ⠿
          </span>
          {/* ✕ removes the card from THIS device's board (mode 'never'). It stays listed,
              and restorable, in Réglages ▸ Le babillard ▸ Disposition. */}
          <button
            type="button"
            className="wg-slot__ctl wg-slot__hide"
            onClick={hide}
            aria-label={t.board.editHide(label)}
            title={t.board.editHide(label)}
          >
            <InlineIcon name="x-bold" size={14} />
          </button>
          {/* The size chip cycles 1 → 2 → 3 → full, showing the size this grid will
              actually render (so on a phone it reads « Max » before you touch it, and
              « 1 » once the card is a half). */}
          <button
            type="button"
            className="wg-slot__ctl wg-slot__size"
            onClick={resize}
            aria-label={t.board.editResize(label)}
            title={t.board.editResize(label)}
          >
            {size === 'full' ? t.board.editSizeFull : size}
          </button>
        </>
      )}
    </section>
  )
}
