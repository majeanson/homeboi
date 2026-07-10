import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Icon, InlineIcon, type IconName } from './Icon'
import { useHScroll } from '../lib/hscroll'
import { useT } from '../i18n'

// SubTabs — the app-wide segmented "one job at a time" sub-tab control (the
// `.subtabs` family in styles/core.css). It's the in-page section switch used by
// La cuisine (Repas · Garde-manger · Recettes), Le cercle (Liste · Liens · Arbre),
// the flyer/deal browsers, etc. — one calm pill row, the active tab filled with the
// surface accent. Reuse this rather than re-hand-rolling the .subtabs markup.
//
// Help-mode aware: pass a `useHelpMode().pick` as `pick` and, while help is armed,
// tapping a tab EXPLAINS it (a HelpBubble) instead of switching — the caller renders
// the matching `help.bubbleFor(key)` wherever it wants the bubble to appear, and
// passes `armed={help.active}` so the row gets La cuisine's armed look.

interface SubTabOption<K extends string> {
  key: K
  label: ReactNode
  // Optional leading glyph (Phosphor, via the shared <Icon> set — never an emoji).
  icon?: IconName
}

export function SubTabs<K extends string>({
  options,
  value,
  onSelect,
  ariaLabel,
  pick,
  armed = false,
  trailing,
  tour,
  size,
  className,
  tint,
}: {
  options: ReadonlyArray<SubTabOption<K>>
  value: K
  onSelect: (key: K) => void
  ariaLabel: string
  // Optional help-mode integration (useHelpMode().pick). When armed, a tap explains
  // the tab instead of selecting it.
  pick?: (k: string, run: () => void) => () => void
  // Adds `.help-armed` to the row so armed tabs read as "tap to learn".
  armed?: boolean
  // A trailing control on the row, e.g. the help "?" <HelpToggle/>.
  trailing?: ReactNode
  // `data-tour` anchor id placed on the tablist (for the guided tour).
  tour?: string
  // 'mini' = the compact variant (`.subtabs--mini`), e.g. the recipe-book Aa/Collections toggle.
  size?: 'mini'
  // Extra class on the `.subtabs` group (e.g. `deal-tabs`, `flyer-tabs`).
  className?: string
  // A section colour (e.g. SECTION_TINT[...].ink) applied as a local `--accent`
  // override on the row, so the active pill + focus ring wear that section's hue
  // (the themed Réglages tabs). Undefined keeps the ambient surface accent.
  tint?: string
}) {
  const group =
    'subtabs' + (size === 'mini' ? ' subtabs--mini' : '') + (className ? ' ' + className : '')

  const t = useT()

  // The row hides its scrollbar (calm), so when the segments outgrow the width a
  // MOUSE has no way to reach the tabs past the right edge — no bar to drag, and a
  // vertical wheel doesn't scroll sideways. That's how Réglages ▸ Système's nine
  // subs went unclickable on desktop. useHScroll maps the wheel; the ‹ › chevrons
  // below are the visible affordance (CSS shows them on a fine pointer only — a
  // touch surface swipes the row and doesn't need them eating the pill's width).
  const hs = useHScroll<HTMLDivElement>()
  const { ref: tablistRef, toView, overflowing } = hs

  // Keep the selected tab in view — after a deep link (?sub=diagnostics) it can sit
  // well off the right edge, leaving the row looking like nothing is selected. Jump
  // without animating on the first paint; glide on later changes. Deps are the STABLE
  // pieces of `hs` (it's a fresh object each render): re-scrolling on every render
  // would fight the user's own scrolling.
  const settled = useRef(false)
  useEffect(() => {
    const active = tablistRef.current?.querySelector('[role="tab"][aria-selected="true"]') ?? null
    toView(active, !settled.current)
    settled.current = true
    // `overflowing` gates toView, so re-run once the row has measured itself.
  }, [value, overflowing, toView, tablistRef])

  // WAI-ARIA tablist keyboard nav (a11y): the tablist is ONE tab stop (roving
  // tabindex — only the selected tab is tabbable), and ←/→/Home/End move + select
  // (automatic activation, fine here — the panels are cheap in-page switches). This
  // matches the Réglages nav; without it a keyboard/AT user couldn't move between
  // tabs. Help-mode taps still explain (via `pick`) on click; arrows just navigate.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = options.findIndex((o) => o.key === value)
    if (idx < 0) return
    let next = idx
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    else return
    e.preventDefault()
    if (next !== idx) onSelect(options[next].key)
    // Move focus to the target tab (stable, keyed by o.key — safe to focus at once).
    // preventScroll + toView: a bare .focus() would scroll the whole PAGE to the row.
    const target = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]
    target?.focus({ preventScroll: true })
    hs.toView(target ?? null)
  }

  // Redundant with the tablist's own ←/→ keys, so they take no tab stop — they exist
  // purely to give a mouse a target. Disabled (not hidden) at an end, so the row
  // doesn't jump as you page along it.
  //
  // Never on a `mini` toggle: those are 2–3 segments that don't need paging, and
  // `.recipe-view-toggle` flattens `.subtabs-row` with `display:contents`, which would
  // turn a chevron into a stray segment of that pill. The wheel still works there.
  const arrow = (dir: -1 | 1) =>
    hs.overflowing && size !== 'mini' ? (
      <button
        type="button"
        className="subtabs-row__arrow"
        tabIndex={-1}
        disabled={dir < 0 ? hs.atStart : hs.atEnd}
        aria-label={dir < 0 ? t.subtabs.prev : t.subtabs.next}
        onClick={() => hs.page(dir)}
      >
        <Icon name={dir < 0 ? 'caret-left-bold' : 'caret-right-bold'} size={14} />
      </button>
    ) : null

  return (
    <div
      className={'subtabs-row' + (armed ? ' help-armed' : '')}
      style={tint ? ({ '--accent': tint } as CSSProperties) : undefined}
    >
      {arrow(-1)}
      <div
        ref={tablistRef}
        className={group}
        role="tablist"
        aria-label={ariaLabel}
        data-tour={tour}
        onKeyDown={onKeyDown}
      >
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={value === o.key}
            tabIndex={value === o.key ? 0 : -1}
            className={'subtabs__opt' + (value === o.key ? ' is-on' : '')}
            onClick={pick ? pick(o.key, () => onSelect(o.key)) : () => onSelect(o.key)}
          >
            {o.icon && <InlineIcon name={o.icon} size={15} />}
            {o.label}
          </button>
        ))}
      </div>
      {arrow(1)}
      {trailing}
    </div>
  )
}
