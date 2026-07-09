import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { CardEmptyContext, type EmptyReporter } from '../../lib/useReportEmpty'
import {
  clampSize,
  cardSize,
  cardMode,
  cardMeta,
  useBoardCards,
  type BoardCardId,
  type CardZone,
} from '../../lib/boardCards'
import { rowSpan } from '../../lib/widgetGrid'
import { EmptyState } from '../EmptyState'
import { BoardCard } from './BoardCard'
import { useWidgetGrid } from './WidgetGrid'

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
  index,
  empty,
  children,
}: {
  id: BoardCardId
  zone: CardZone
  /** Position within the zone — half of this slot's drop-zone key (`"{zone}:{index}"`). */
  index: number
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
  const span = clampSize(cardSize(prefs, id), cols)

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

  return (
    <section
      className="wg-slot"
      style={style}
      data-card={id}
      // Drop targets exist only while editing. Always-on would also opt every board card
      // out of tap-to-hear, which excludes `[data-dnd-zone]` by design.
      data-dnd-zone={grid?.editing ? `${zone}:${index}` : undefined}
      data-empty={isEmpty ? '' : undefined}
      hidden={collapsed}
    >
      <CardEmptyContext.Provider value={report}>
        <div className="wg-slot__inner" ref={innerRef}>
          {children}
          {placeholder && meta && (
            <BoardCard className="bento wg-slot__placeholder" label={t.boardCard[id]} icon={meta.icon}>
              <EmptyState>{t.board.cardEmpty}</EmptyState>
            </BoardCard>
          )}
        </div>
      </CardEmptyContext.Provider>
    </section>
  )
}
