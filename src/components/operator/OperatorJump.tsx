import type { ReactNode } from 'react'

// A quiet within-tab jump-nav for the fat Réglages tabs (display holds 6 sections,
// ai holds 7…). A wrapping row of chips that scroll to anchored sections — the
// sections stay STACKED and all rendered (calm: everything in view, no hide/seek,
// so it deliberately does NOT use SubTabs, which hides non-active panels). Pure
// DOM scroll: no URL/hash change, so useTabParam's ?tab= ownership + the retired
// TAB_ALIAS deep-links are untouched. Calm: section names only — never a count.
export function OperatorJump({
  items,
  ariaLabel,
}: {
  items: ReadonlyArray<{ id: string; label: ReactNode }>
  ariaLabel: string
}) {
  // Nothing to jump between with one section — render nothing.
  if (items.length < 2) return null
  const jump = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    // Smooth, but instant for a reduced-motion device (the app sets no global
    // scroll-behavior, so gate it here rather than in CSS).
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <nav className="operator__jump mono" aria-label={ariaLabel}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="chip operator__jump-chip"
          onClick={() => jump(it.id)}
        >
          {it.label}
        </button>
      ))}
    </nav>
  )
}
