import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { Icon, InlineIcon, type IconName } from './Icon'
import { useModal } from '../lib/useModal'

// The shared header overflow menu — a "⋯" button that folds a surface's
// SECONDARY actions into one compact dropdown, so the surface itself keeps at
// most its one or two primary buttons (the recipe view's footer went from seven
// buttons to Cuisiner + Planifier this way). Sits in a scene head's `action`
// slot next to the "?" and ✕. Renders nothing with no items, so callers can
// build the item list from their own gating (guest / toddler / signed-in) and
// let an empty menu disappear on its own.
//
// Dismissal reuses `useModal` (Esc joins the shared esc-stack, so Esc closes
// the MENU, not the scene underneath; focus is pulled onto the first item and
// handed back to the ⋯ on close) plus an outside-tap listener. ↑/↓ move
// between items; every item is a real button, so mouse + keyboard both work
// (desktop-reachability rule).
export type ActionMenuItem = {
  icon?: IconName
  label: string
  onSelect: () => void
  // 'danger' paints the row warn-red (a destructive delete).
  tone?: 'danger'
  disabled?: boolean
  // Draws a quiet divider above this row — separates the "manage" rows
  // (Modifier / Supprimer) from the do-actions.
  separated?: boolean
}

export function ActionMenu({ items, label }: { items: ActionMenuItem[]; label?: string }) {
  const t = useT()
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  useModal(panelRef, () => setOpen(false), { open })
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])
  if (items.length === 0) return null
  const name = label ?? t.common.moreActions
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const btns = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>('.action-menu__item:not(:disabled)') ?? [],
    )
    if (!btns.length) return
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    btns[e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length]?.focus()
  }
  return (
    <div className="action-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn--ghost mono action-menu__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name}
        title={name}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="dots-three-bold" size={18} />
      </button>
      {open && (
        <div ref={panelRef} className="action-menu__panel" role="menu" aria-label={name} onKeyDown={onKey}>
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={
                'action-menu__item mono' +
                (it.tone === 'danger' ? ' action-menu__item--danger' : '') +
                (it.separated ? ' action-menu__item--separated' : '')
              }
              disabled={it.disabled}
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
            >
              {it.icon && <InlineIcon name={it.icon} />} {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
