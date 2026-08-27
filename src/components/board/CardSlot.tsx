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
import { colWidth, isCompact, rowIndexAt, rowSpan, WG_MINI_ROWS } from '../../lib/widgetGrid'
import { EmptyState } from '../EmptyState'
import { InlineIcon } from '../Icon'
import { BoardCard } from './BoardCard'
import { CardLensProvider, type CardLens } from './CardLens'
import { useWidgetGrid } from './WidgetGrid'

// The slot a board card sits in: it owns PLACEMENT (row/column span), the drop target,
// and the empty gate. It owns NO visual chrome — each card still draws its own look
// (`.bento`, `.now-card`, `.photo-frame`, `.notes`). That separation is the whole point:
// a card that carries its own chrome can be moved between zones without changing
// appearance, which is why `.bento`'s fill/shadow moved off `.board-grid > .bento`.
//
// The few board cards whose full title ellipsizes in a 142px mini header wear a short form
// there (mirrors the live cards' own `compactLabel`). Keyed by id; an absent id falls back
// to the plain label. Kept here (not in boardCards meta) because the strings are i18n.
const SHORT_LABEL: Partial<Record<BoardCardId, (t: ReturnType<typeof useT>) => string>> = {
  today: (t) => t.board.todayShort,
  voyage: (t) => t.voyage.nextTripShort,
}

// Not to be confused with `BoardCard` (BoardCard.tsx), which is the shared HEADER +
// container anatomy a card renders INSIDE this slot. Slot = where; BoardCard = what.
//
// SPAN. The slot is the grid item, so its own height is dictated by the row span — which
// makes measuring it circular. We measure the inner wrapper's natural height instead and
// derive the span from that (see `rowSpan`). Re-measured on any content change via a
// ResizeObserver, coalesced to one write per frame. A card in its COMPACT form is the one
// exception: it claims a constant `WG_MINI_ROWS` and isn't measured at all (see below).
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
  const slotRef = useRef<HTMLElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState(1)
  // The row this slot occupied at the instant it was tapped open — see `pin` below.
  const [pinRow, setPinRow] = useState<number | null>(null)

  // The child→shell registration channel. Idempotent by construction: a report whose
  // value already matches is dropped, so an unstable caller is a harmless no-op rather
  // than a render loop (see lib/useReportEmpty, and the Kitchen→HubLayout freeze).
  // `null` = the card hasn't reported YET — a self-fetching card renders nothing while
  // its query is in flight, and the slot uses that to hold its place (see below).
  const [reported, setReported] = useState<boolean | null>(null)
  const report = useCallback<EmptyReporter>((v) => setReported((prev) => (prev === v ? prev : v)), [])

  const isEmpty = empty ?? reported ?? false
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
  const sizedSpan = clampSize(size, cols)

  // The compact lens (see CardLens.tsx): keys on the MEASURED rendered width the card
  // occupies at its CHOSEN size (span × the grid's measured column width) — never on
  // `size` alone, `surface`, or the temporarily-expanded span below (expanding a card
  // must not make it read as "no longer compact", or it would lose its own way back).
  const compact = isCompact(colWidth(grid?.width ?? 0, cols), sizedSpan)

  const editing = !!grid?.editing
  const onExpandGrid = grid?.onExpand
  const onCollapseGrid = grid?.onCollapse
  // Phase 3: tapping a compact tile grows THIS card to the zone's full column count, in
  // place. `expandedId` is lifted to Board.tsx and threaded into BOTH zone mounts the
  // same way `dnd` is, so single-open holds across the band AND the grid, not just
  // within one. `.wg--editing .wg-slot__inner` already blocks the tap via CSS the
  // instant edit mode arms; the `!editing` check here is the belt-and-suspenders JS
  // guard the brief asks for (and covers a stray call from outside a pointer tap).
  const expanded = grid?.expandedId === id
  const span = expanded ? cols : sizedSpan
  // A tile in its compact form. Its ROW span is a constant, never measured — see below.
  const isMini = compact && !expanded

  // KEEP YOUR EYES ON THE CARD YOU OPENED.
  // Growing to `cols` makes this slot full-width, and a full-width item cannot share a
  // row: `grid-auto-flow: dense` re-places it at the first row where EVERY column is
  // free — which is *below every card already laid out*. So a tile opened beside a tall
  // card leapt hundreds of pixels down the page and the expansion happened off screen:
  // you never saw the thing you tapped.
  // So we PIN it. Read the row it is on RIGHT NOW (the ruler is uniform, so the row index
  // is pure arithmetic on its offset — `rowIndexAt`) and hand that to `grid-row-start`
  // for as long as it stays open. Explicitly-placed items are laid out BEFORE auto-placed
  // ones, so the rest of the masonry flows around and beneath the open card instead of
  // shoving it aside — and the open card itself never moves while it is open, which is
  // what makes opening and closing readable.
  // Measured in the tap handler, BEFORE the state change: the compact layout is still on
  // screen at that moment, and its position is exactly the one we want to hold.
  const pin = useCallback(() => {
    const el = slotRef.current
    const gridEl = el?.parentElement
    if (!el || !gridEl) return
    // `.wg` carries no padding or border today, so its border-box top IS the first row
    // line — but read them live rather than assume, in case that ever changes.
    const cs = getComputedStyle(gridEl)
    const top =
      gridEl.getBoundingClientRect().top +
      (parseFloat(cs.borderTopWidth) || 0) +
      (parseFloat(cs.paddingTop) || 0)
    setPinRow(rowIndexAt(el.getBoundingClientRect().top - top))
  }, [])

  // Release the pin the moment this card is no longer the open one — and whenever the
  // column count changes underneath it (a rotation re-lays the whole grid, so the row we
  // captured means nothing any more; auto placement is the honest fallback).
  useEffect(() => {
    if (!expanded) setPinRow(null)
  }, [expanded])
  useEffect(() => {
    setPinRow(null)
  }, [cols])

  const lens = useMemo<CardLens>(
    () => ({
      compact,
      expanded,
      expand: () => {
        if (editing) return
        pin()
        onExpandGrid?.(id)
      },
      collapse: () => onCollapseGrid?.(),
    }),
    [compact, expanded, editing, onExpandGrid, onCollapseGrid, id, pin],
  )

  useEffect(() => {
    const el = innerRef.current
    // A collapsed slot is `display:none`: it measures 0 and would thrash the span back to
    // 1. Leave the last good span alone; it is recomputed the moment it un-collapses.
    // A MINI isn't measured at all (its span is the constant below), so don't observe one:
    // the measurement is not merely unused, it is the thing that used to stagger the board.
    if (!el || collapsed || isMini) return
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
  }, [collapsed, isMini, span])

  // WHY A COMPACT TILE'S SPAN IS A CONSTANT.
  // Measuring it is what made a shelf of half-width cards read as a ragged, staggered
  // skyline. The row ruler steps in 24px (an 8px row plus the 16px gap that follows it),
  // so two tiles whose natural heights differ by ONE pixel across that boundary claim a
  // different number of rows — and once two columns disagree by a row, every card below
  // them is offset. The heights differed for reasons no one chose: a hint line here, a
  // two-line title there, a border on the card that matters this hour.
  // So the lens stops asking. Every mini claims `WG_MINI_ROWS`, and `--wg-mini-h`
  // (widget-grid.css) sizes the tile to fill exactly that. Uniform by construction, which
  // is also what lets a mini spend its fixed height NAMING its rows (`CardMini`).
  // LATE-RESOLVE HOLD. A self-fetching card (L'auto, Les carnets, Photo du jour…)
  // renders NOTHING while its query is in flight, so its slot measured ~0 and the
  // dense grid packed as if it weren't there — then its resolution (content OR an
  // empty report → collapse) re-packed the whole masonry, minutes into the glance.
  // Until the card resolves (an `empty` prop, a report, or real measured content),
  // the slot claims the constant mini height instead of the ~0 measurement, so a
  // late empty just fades a mini-sized hole closed rather than reshuffling rows.
  const unresolved = empty === undefined && reported === null
  const heldRows = unresolved && rows <= 1 ? WG_MINI_ROWS : rows

  const style = useMemo(
    () => ({
      ['--wg-span-rows' as string]: isMini ? WG_MINI_ROWS : heldRows,
      ['--wg-span-cols' as string]: span,
      // Only ever set while THIS card is the open one (see `pin`); unset otherwise, so an
      // ordinary card is placed by the flow exactly as it was before.
      ['--wg-row-start' as string]: expanded && pinRow ? pinRow : undefined,
      // The card's persona, for a card that never set `--sec-tint` itself — and for the
      // empty placeholder below, which has no card to ask. Never overrides one that did.
      ['--wg-tint' as string]: meta?.tint,
    }),
    [isMini, heldRows, span, expanded, pinRow, meta],
  )

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
      ref={slotRef}
      style={style}
      data-card={id}
      // Name the section so it is exposed as a REGION landmark. A bare <section> has
      // no accessible name and so is not a landmark at all — the board reached AT as
      // one long undifferentiated run of controls. Naming it gives a screen-reader
      // user the board's card list to jump between, which is the practical answer to
      // the masonry's focus-order problem (AUJOURDHUI §7): `grid-auto-flow: dense`
      // can pull a later card up into an earlier hole, so VISUAL order may depart
      // from DOM order. DOM order stays the household's own stored layout order — a
      // meaningful sequence — and landmarks mean nobody has to tab through the whole
      // wall to reach the card they want.
      aria-label={label}
      // Drop targets exist only while editing. Always-on would also opt every board card
      // out of tap-to-hear, which excludes `[data-dnd-zone]` by design.
      data-dnd-zone={editing ? key : undefined}
      data-empty={isEmpty ? '' : undefined}
      data-expanded={expanded ? '' : undefined}
      hidden={collapsed}
      onPointerDown={grabBody}
    >
      <CardEmptyContext.Provider value={report}>
        <CardLensProvider value={lens}>
          <div className="wg-slot__inner" ref={innerRef}>
            {children}
            {/* An `always` card with nothing to say. It keeps its colour (`--wg-tint`,
                mapped onto `--sec-tint` in widget-grid.css) and SAYS it is empty — a
                dashed edge plus one quiet word — rather than rendering as an anonymous
                grey box the eye can't tell from a card that simply has no tint. */}
            {placeholder && meta && (
              <BoardCard
                className="bento wg-slot__placeholder"
                label={label}
                // The tiny placeholder tile wears the same short title the live card would
                // (« Prochain voyage » → « Voyage ») so it doesn't wrap to two lines. Only
                // the few long-titled cards have one; the rest fall back to their label.
                compactLabel={SHORT_LABEL[id]?.(t)}
                icon={meta.icon}
                compactHint={t.board.cardEmptyMini}
                // An empty pinned card taps straight to where you'd add one (if it has such
                // a page) rather than growing into a « Rien pour l'instant » shell.
                compactTo={meta.emptyTo}
              >
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
