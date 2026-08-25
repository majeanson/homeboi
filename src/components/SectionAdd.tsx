import { useState } from 'react'
import { isGuest } from '../lib/device'
import { Icon } from './Icon'

// SectionAdd — THE "open this section's composer" affordance: a small round ＋ in a
// section's header that flips to ✕ while its add box is open.
//
// The pattern shipped three times by hand first (the board's « Notes (cercle) » card,
// then « À faire », then the garde-manger's three lists), always for the same reason:
// a permanently-open add field is the one thing on a glance surface you can't scan
// past. Three stacked composers cost more vertical room than the items they were
// there to add — the page read as a form with a list attached, instead of a list.
// Behind the ＋ the section leads with its CONTENT and the field is still one tap away.
//
// Self-hides for a read-only guest, exactly like EditField (a guest's write would 403
// anyway, and the empty header shell it would leave behind is the bug that guard is
// for). Pair with `useSectionAdd()` below, which owns the open/close state and gives
// the composer the "close me once something was written" callback.

export function SectionAdd({
  open,
  onToggle,
  label,
  readOnly,
  className,
}: {
  open: boolean
  onToggle: () => void
  /** Accessible name + tooltip — say what gets added ("Ajouter un aliment"). */
  label: string
  /** Defaults to the read-only guest session; pass false to force-show. */
  readOnly?: boolean
  className?: string
}) {
  if (readOnly ?? isGuest()) return null
  return (
    <button
      type="button"
      className={'sec-label__actbtn' + (open ? ' is-on' : '') + (className ? ' ' + className : '')}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      title={label}
    >
      <Icon name={open ? 'x-bold' : 'plus-bold'} size={14} />
    </button>
  )
}

// The state half lives HERE beside the component, the way useSingleOpen lives beside
// <Disclosure> — one import for the pair, and the two are useless apart.
// The state half: `open`/`toggle` for the button, `autoFocus` so the field lands the
// caret the moment it appears (an expand that costs a second tap is worse than the
// always-open box it replaced), and `close` for the composer's onSubmitted — written,
// folded away, the section is a list again.
export function useSectionAdd(initial = false) {
  const [open, setOpen] = useState(initial)
  return {
    open,
    toggle: () => setOpen((v) => !v),
    close: () => setOpen(false),
    autoFocus: open,
  }
}
