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
  // Open one unconditionally — for the caller that just CREATED the row it is
  // opening (a blank school-year relâche): `toggle` would close it if that id
  // somehow already were the open one, and "open the thing I just made" must not
  // depend on what was open before.
  const open = useCallback((id: T) => setOpenId(id), [])
  const close = useCallback(() => setOpenId(null), [])
  return { openId, isOpen, toggle, open, close }
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
  note,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  className,
  children,
}: {
  label: string
  // Shown as a small badge on the summary so the count stays visible while collapsed.
  count?: number
  // One quiet line on the summary WHILE COLLAPSED — what the fold holds (« 4 portions ·
  // 20 + 50 min »), so folding a filled group never hides that it is filled (LEAN
  // invariant 1). It wraps inside the summary rather than being cut.
  note?: string
  defaultOpen?: boolean
  // Controlled mode, for a fold whose owner must OPEN it after mount — the recipe form's
  // « Détails » opens itself when an import fills one of its fields. Omit for the usual
  // self-contained toggle.
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  children: ReactNode
}) {
  const [inner, setInner] = useState(defaultOpen)
  const open = openProp ?? inner
  const toggle = () => {
    if (openProp === undefined) setInner(!open)
    onOpenChange?.(!open)
  }
  return (
    <div className={'disclosure' + (open ? ' disclosure--open' : '') + (className ? ' ' + className : '')}>
      <button type="button" className="disclosure__summary" onClick={toggle} aria-expanded={open}>
        <span className="disclosure__caret" aria-hidden="true">
          <Icon name="caret-down-bold" size={14} />
        </span>
        <span className="disclosure__label mono">{label}</span>
        {count != null && count > 0 ? <span className="disclosure__count mono">{count}</span> : null}
        {!open && note ? <span className="disclosure__note mono">{note}</span> : null}
      </button>
      {open && <div className="disclosure__body">{children}</div>}
    </div>
  )
}
