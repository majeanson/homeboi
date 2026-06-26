import { type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { Icon, type IconName } from '../Icon'
import { type HelpMode } from '../../lib/helpMode'

// The ONE board-card header — a category glyph disc + bold label + rule + an optional
// quiet count (never a score), with optional contextual help. This is the `.sec-label`
// anatomy that every board glance card shares; extracted so the four cards that hand
// -rolled it (Section/AutoCard/CarnetsCard/SeasonUpkeepCard) can't drift apart.
//
// `icon` draws a Phosphor glyph; `iconNode` lets a card pass an emoji/arbitrary node
// (the season card's 🍂) into the same tinted disc. The disc + rule pick up the
// card's `--sec-tint` (set on the wrapper), so a tint flows through automatically.
//
// When `help` is armed (lib/helpMode), the TITLE becomes a tappable button → an
// in-place HelpBubble (rendered right below the header). Outside help mode it's a plain
// title — identical DOM, no dead tab stops. The bubble is part of this fragment so the
// whole "explainable header" contract lives in one place.
export function SecLabel({
  label,
  count,
  icon,
  iconNode,
  help,
  helpKey,
}: {
  label: string
  count?: number
  icon?: IconName
  iconNode?: ReactNode
  help?: HelpMode
  helpKey?: string
}) {
  const t = useT()
  const helpable = !!help && !!helpKey && help.active
  return (
    <>
      <div className="sec-label">
        {(icon || iconNode) && (
          <span className="sec-label__ico" aria-hidden="true">
            {icon ? <Icon name={icon} size={16} /> : iconNode}
          </span>
        )}
        {helpable ? (
          <button type="button" className="help-title" onClick={help!.pick(helpKey!, () => {})} title={t.help.learnMore}>
            <b>{label}</b>
          </button>
        ) : (
          <b>{label}</b>
        )}
        <span className="ln" />
        {count ? <span className="ct">{count}</span> : null}
      </div>
      {help && helpKey ? help.bubbleFor(helpKey) : null}
    </>
  )
}

// A board glance card SHELL — the standalone (non-bento-grid) cards that sit in the
// board's status band or full-width strips (« L'auto », « Les carnets », « Cette
// saison »). It wraps the shared `SecLabel` header + arbitrary content in a card
// container, optionally a navigating `<Link>` (pass `to`) instead of a plain `<div>`.
// The wrapper `className` (`auto-card`/`carnets-card`/…) + `style` (a `--sec-tint`/
// `--car-tint`) stay the caller's, since each band card keeps its own deliberate
// layout CSS — only the header anatomy is shared. Empty-hiding stays at the call site
// (each card's "nothing to show" rule differs and reads clearer inline).
//
// Bento grid sections use `Section` (Act.tsx) instead — same header, different shell.
export function BoardCard({
  to,
  className,
  style,
  ariaLabel,
  label,
  count,
  icon,
  iconNode,
  help,
  helpKey,
  children,
}: {
  to?: string
  className: string
  style?: CSSProperties
  ariaLabel?: string
  label: string
  count?: number
  icon?: IconName
  iconNode?: ReactNode
  help?: HelpMode
  helpKey?: string
  children: ReactNode
}) {
  const inner = (
    <>
      <SecLabel label={label} count={count} icon={icon} iconNode={iconNode} help={help} helpKey={helpKey} />
      {children}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={className} style={style} aria-label={ariaLabel}>
        {inner}
      </Link>
    )
  }
  return (
    <div className={className} style={style} aria-label={ariaLabel}>
      {inner}
    </div>
  )
}
