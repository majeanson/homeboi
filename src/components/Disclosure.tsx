import { useCallback, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

// The per-item sibling of <Disclosure>: a list where tapping one row reveals its
// detail (a picker, a body) and only ONE is open at a time. Both kitchen pools
// (MealIdeas, Leftovers) expand a MealPlanPicker this way; their trigger is a chip
// sitting inline with RowActions and the body is a sibling row, so the section
// Disclosure doesn't fit — but the toggle behaviour is identical, so it lives here
// beside it. Pair with the `.is-open` caret affordance for a matching visual cue.
export function useSingleOpen<T extends string = string>() {
  const [openId, setOpenId] = useState<T | null>(null)
  const isOpen = useCallback((id: T) => openId === id, [openId])
  const toggle = useCallback((id: T) => setOpenId((cur) => (cur === id ? null : id)), [])
  const close = useCallback(() => setOpenId(null), [])
  return { openId, isOpen, toggle, close }
}

// A calm, collapsed-by-default expand/toggle. A single summary row (caret + label
// + optional count) reveals its children only when tapped, so a secondary,
// space-hungry group — a stack of suggestion chips, a long aside — never fills the
// surface unasked (NFR-CALM-1: finite glance, nothing populates the page until you
// ask). This is the Leftovers per-row expand pattern lifted into a shared primitive
// so every view collapses suggestions the same way. `aria-expanded` keeps it
// accessible; the caret rotates via CSS off `.disclosure--open`.
export function Disclosure({
  label,
  count,
  defaultOpen = false,
  className,
  children,
}: {
  label: string
  // Shown as a small badge on the summary so the count stays visible while collapsed.
  count?: number
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={'disclosure' + (open ? ' disclosure--open' : '') + (className ? ' ' + className : '')}>
      <button
        type="button"
        className="disclosure__summary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="disclosure__caret" aria-hidden="true">
          <Icon name="caret-down-bold" size={14} />
        </span>
        <span className="disclosure__label mono">{label}</span>
        {count != null && count > 0 ? <span className="disclosure__count mono">{count}</span> : null}
      </button>
      {open && <div className="disclosure__body">{children}</div>}
    </div>
  )
}
