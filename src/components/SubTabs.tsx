import { useRef, type CSSProperties, type ReactNode } from 'react'
import { InlineIcon, type IconName } from './Icon'

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

  // WAI-ARIA tablist keyboard nav (a11y): the tablist is ONE tab stop (roving
  // tabindex — only the selected tab is tabbable), and ←/→/Home/End move + select
  // (automatic activation, fine here — the panels are cheap in-page switches). This
  // matches the Réglages nav; without it a keyboard/AT user couldn't move between
  // tabs. Help-mode taps still explain (via `pick`) on click; arrows just navigate.
  const tablistRef = useRef<HTMLDivElement>(null)
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
    tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div
      className={'subtabs-row' + (armed ? ' help-armed' : '')}
      style={tint ? ({ '--accent': tint } as CSSProperties) : undefined}
    >
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
      {trailing}
    </div>
  )
}
