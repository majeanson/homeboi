import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { Icon, InlineIcon, type IconName } from './Icon'
import { useModal } from '../lib/useModal'

// The shared overflow menu — a "⋯" button that folds a surface's SECONDARY
// actions into one compact dropdown, so the surface itself keeps at most its one
// or two primary buttons (the recipe view's footer went from seven buttons to
// Cuisiner + Planifier this way). Sits in a scene head's `action` slot next to
// the "?" and ✕, in a `Sheet`'s head corner, in a section heading, or at the end
// of a row's control cluster. Renders nothing with no items, so callers can build
// the item list from their own gating (guest / toddler / signed-in) and let an
// empty menu disappear on its own.
//
// The panel is PORTALED to <body> and positioned `fixed` from the trigger's
// measured rect — not absolutely inside the button. Two things forced that: a
// scene/sheet scroller CLIPS an absolute panel (a peek only ~100px tall can't
// show a 5-row drop), and an ancestor stacking context TRAPS it underneath the
// page (the day scene swallowed the clicks on a meal row's menu). Fixed +
// portal also lets it flip ABOVE the trigger near the bottom edge, which is what
// a footer-anchored menu needs. It follows the anchor while the page scrolls and
// lets go once the trigger itself has scrolled out of view.
//
// Dismissal reuses `useModal` (Esc joins the shared esc-stack, so Esc closes
// the MENU, not the scene underneath; focus is handed back to the ⋯ on close)
// plus an outside-tap listener. Focus goes onto the first item HERE, not in
// useModal — its trap runs while the panel is still hidden for the measure pass. ↑/↓ move
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

const GAP = 6 // px between the trigger and the panel
const EDGE = 8 // px the panel keeps off the viewport edges

export function ActionMenu({ items, label }: { items: ActionMenuItem[]; label?: string }) {
  const t = useT()
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  // null while measuring: the panel renders invisible for one layout pass so we
  // know its real size before placing it (labels vary; no magic width).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useModal(panelRef, () => setOpen(false), { open })

  // Measure the trigger + the panel, then place the panel: right-aligned to the
  // trigger, clamped inside the viewport, flipped above when the drop wouldn't
  // fit below (a footer- or bottom-row-anchored menu).
  const place = useRef(() => {})
  place.current = () => {
    const anchor = btnRef.current?.getBoundingClientRect()
    const panel = panelRef.current?.getBoundingClientRect()
    if (!anchor || !panel) return
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const left = Math.max(EDGE, Math.min(anchor.right - panel.width, vw - panel.width - EDGE))
    const below = anchor.bottom + GAP
    const top =
      below + panel.height > vh - EDGE && anchor.top - GAP - panel.height >= EDGE
        ? anchor.top - GAP - panel.height
        : Math.min(below, Math.max(EDGE, vh - panel.height - EDGE))
    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }))
  }

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    place.current()
  }, [open, items.length])

  // Pull focus into the panel once it is PLACED. useModal's focus trap fires a
  // pass too early: the panel is still `visibility:hidden` while it's measured
  // (see place()), and a visibility:hidden element cannot take focus — so that
  // pull silently no-ops and the ⋯ keeps focus. Since the panel is portaled to the
  // END of <body>, Tab from the trigger then walks the whole PAGE instead of the
  // menu, and ↑/↓ never reach the panel's handler: the long-tail actions that only
  // live behind a ⋯ become mouse-and-touch-only (e2e/action-menu-keys.spec.ts).
  // Re-placement on scroll also lands here, so only pull when focus is elsewhere —
  // otherwise following the anchor would yank focus back to the first row.
  useEffect(() => {
    if (!open || !pos) return
    const el = panelRef.current
    if (!el || el.contains(document.activeElement)) return
    el.querySelector<HTMLButtonElement>('.action-menu__item:not(:disabled)')?.focus({ preventScroll: true })
  }, [open, pos])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!btnRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false)
    }
    // A `fixed` panel doesn't ride its anchor's scroller, so follow it: re-place
    // on any scroll/resize (rAF-coalesced), and let go once the trigger has left
    // the viewport. Closing outright instead would fight the browser — focusing
    // the first item, or a smooth scroll settling, still emits scroll events
    // right after the menu opens.
    let raf = 0
    const follow = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const b = btnRef.current?.getBoundingClientRect()
        if (!b) return
        const vh = document.documentElement.clientHeight
        if (b.bottom < 0 || b.top > vh) setOpen(false)
        else place.current()
      })
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
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
    <div className="action-menu">
      <button
        ref={btnRef}
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
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="action-menu__panel"
            role="menu"
            aria-label={name}
            onKeyDown={onKey}
            style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
          >
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
          </div>,
          document.body,
        )}
    </div>
  )
}
