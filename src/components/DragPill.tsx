import { type CSSProperties, type ElementType, type ReactNode, type Ref } from 'react'
import { useT } from '../i18n'
import { type usePointerDnd } from '../lib/dnd'

// The shared "draggable pill/row" shell over usePointerDnd (lib/dnd). The tag-pill
// reorder strip and the recipe-pill list both hand-rolled the same three things on
// every item — the data-dnd-zone wrapper, the is-dragging/dnd-over state classes,
// and the ⠿ grip handle wired to dnd.start — differing only in tag name and class.
// DragPill folds that into one place; the caller passes the dnd handle, the index,
// the ghost label, and renders the pill's own contents as children. Pair it with a
// single <DragGhost ghost={dnd.ghost} /> on the page, as before.
//
// `as` picks the element (a 'span' chip vs an 'li' row); `showGrip` lets a
// read-only guest render the same pill without the drag handle.
//
// `onMove` is the keyboard/mouse-only door onto the same reorder (ACTIONS.md's
// desktop-reachability rule): Tab to the grip, ↑/↓ moves the row one slot, exactly
// the pattern La liste's own hand-rolled grip already used (pages/Liste.tsx) —
// moved in here 2026-09-03 so every DragPill caller gets it by passing one prop
// instead of re-deriving the same tabIndex+onKeyDown by hand. Omit it and the grip
// stays drag-only, same as before (a caller not yet wired for it, or one where
// reordering is genuinely unreachable off-touch for some other reason).

type Dnd = ReturnType<typeof usePointerDnd>

interface DragPillProps {
  dnd: Dnd
  /** This pill's position — both the drop zone id and the dnd.start id. */
  index: number
  /** Override the zone/drag id (default String(index)). Needed when SEVERAL
   *  reorderable lists share one page + dnd instance (e.g. the itinerary's
   *  day sections use "«day»:«index»") — bare indexes would collide across lists. */
  zone?: string
  /** Text shown in the floating drag ghost (the pill's label). */
  label: string
  /** Element to render — 'span' for an inline chip, 'li' for a list row. Default 'li'. */
  as?: ElementType
  /** Classes for the zone element; the is-dragging/dnd-over state classes append to these. */
  className?: string
  /** Extra class on the grip handle (it always also carries `dnd-grip`). */
  gripClassName?: string
  style?: CSSProperties
  /** Render the grip handle. Pass false for a read-only guest. Default true. */
  showGrip?: boolean
  /** Keyboard/mouse mirror for the same reorder — pass to make the grip a real
   *  Tab stop with ↑/↓ support. Omit to leave the grip drag-only. */
  onMove?: (dir: 'up' | 'down') => void
  /** Ref to the rendered zone element — for a caller that scrolls a row into view
   *  (e.g. the notes list's deep-link focus). */
  nodeRef?: Ref<HTMLElement>
  children?: ReactNode
}

export function DragPill({
  dnd,
  index,
  zone,
  label,
  as,
  className,
  gripClassName,
  style,
  showGrip = true,
  onMove,
  nodeRef,
  children,
}: DragPillProps) {
  const t = useT()
  const Tag = (as ?? 'li') as ElementType
  const id = zone ?? String(index)
  const zoneClass =
    (className ?? '') +
    (dnd.activeId === id ? ' is-dragging' : '') +
    (dnd.over === id ? ' dnd-over' : '')

  return (
    <Tag ref={nodeRef} data-dnd-zone={id} className={zoneClass} style={style}>
      {showGrip && (
        <span
          className={'dnd-grip' + (gripClassName ? ` ${gripClassName}` : '')}
          data-dnd-grip=""
          role="button"
          // Focusable only when a keyboard door is actually wired — an unwired grip
          // stays drag-only exactly as before, rather than a dead Tab stop.
          tabIndex={onMove ? 0 : undefined}
          aria-label={`${t.operator.dragHint} — ${label}`}
          title={t.operator.dragHint}
          onPointerDown={(e) => dnd.start(id, label, e)}
          onKeyDown={
            onMove
              ? (e) => {
                  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                  e.preventDefault() // move the row, not the page scroll
                  onMove(e.key === 'ArrowUp' ? 'up' : 'down')
                }
              : undefined
          }
        >
          ⠿
        </span>
      )}
      {children}
    </Tag>
  )
}
