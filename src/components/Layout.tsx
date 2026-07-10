import type { ElementType, ReactNode } from 'react'
import { useHScroll } from '../lib/hscroll'

// Row primitives — the two sanctioned ways to lay out a horizontal row of things
// (buttons, chips, controls) so it NEVER bleeds off the right edge on a narrow phone.
// Reach for one of these before hand-rolling a `display:flex` row: a bespoke row with a
// fixed `flex-basis` is the #1 source of x-overflow here (a basis smaller than the
// item's content makes flexbox keep everything on one line and overflow instead of
// wrapping). CSS lives in the `.cluster` / `.rail` families in styles/core.css.
//
//   • <Cluster> — order-independent row that MAY wrap to more lines when it doesn't fit
//     (action bars, chip rows, filter buttons). The default.
//   • <Rail>    — one continuous sequence that must stay on a single line; when it can't
//     fit it SCROLLS sideways instead of wrapping (segmented control, timeline, filmstrip).

interface RowProps {
  children: ReactNode
  className?: string
  // Render as something other than a <div> (e.g. 'ul', 'nav', 'section').
  as?: ElementType
  // Pass-through for grouping semantics — a button row is often role="group".
  role?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'data-tour'?: string
  style?: React.CSSProperties
}

// Wrap-safe flex row. Children shrink to their content and drop to the next line when
// they run out of room; every child gets min-width:0 (via the .cluster CSS) so a long
// word can shrink instead of forcing the row wider.
export function Cluster({
  children,
  className,
  as: As = 'div',
  fill = false,
  justify,
  ...rest
}: RowProps & {
  // Grow each child to share the row width evenly, still wrapping when they can't fit.
  fill?: boolean
  // 'between' / 'end' align the row; default is start.
  justify?: 'between' | 'end'
}) {
  const cls =
    'cluster' +
    (fill ? ' cluster--fill' : '') +
    (justify ? ' cluster--' + justify : '') +
    (className ? ' ' + className : '')
  return (
    <As className={cls} {...rest}>
      {children}
    </As>
  )
}

// One-line row that scrolls sideways on overflow instead of clipping the last item
// (generalises the .subtabs behaviour). Children keep their size and stay in a row.
//
// The rail hides its scrollbar, so useHScroll maps a vertical mouse wheel onto its
// horizontal scroll — otherwise a desktop mouse has no way at all to reach whatever
// sits past the right edge (no bar to drag, no swipe). Adds no DOM and no layout.
export function Rail({ children, className, as: As = 'div', ...rest }: RowProps) {
  const { ref } = useHScroll<HTMLDivElement>()
  return (
    <As ref={ref} className={'rail' + (className ? ' ' + className : '')} {...rest}>
      {children}
    </As>
  )
}
