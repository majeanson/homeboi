import { type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { Icon, type IconName } from '../Icon'
import { type HelpMode } from '../../lib/helpMode'
import { useCardLens } from './CardLens'

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

// The COMPACT LENS's generic body: what `Section` / `BoardCard` render instead of the
// full header + children when the card's MEASURED width falls under the compact
// threshold (`lib/widgetGrid.isCompact`, read via `useCardLens`) — icon on top, the
// card's own title, and at most one quiet line (`hint`: a count like '3' or a name
// like 'Spaghetti' — never a score, never per-person). The whole tile IS the tap
// target: a real `<button>` (never nested inside the card's own `<Link>`, which is
// why `BoardCard` swaps its Link/div for this button outright rather than wrapping
// it) that calls `lens.expand()` to grow the card back to the zone's full width in
// place. `body` is a FULL override (a bespoke card's own compact content) — when
// given, it replaces the generic icon/title/hint entirely; the button chrome (and
// tap-to-expand) stays shared.
export function CardMini({
  className,
  style,
  label,
  icon,
  iconNode,
  hint,
  body,
  onExpand,
}: {
  className?: string
  style?: CSSProperties
  label: string
  icon?: IconName
  iconNode?: ReactNode
  hint?: ReactNode
  body?: ReactNode
  onExpand: () => void
}) {
  const t = useT()
  return (
    <button
      type="button"
      className={'cardmini' + (className ? ` ${className}` : '')}
      style={style}
      aria-expanded={false}
      aria-label={t.board.expandCard(label)}
      onClick={onExpand}
    >
      {body ?? (
        <>
          {(icon || iconNode) && (
            <span className="cardmini__ico" aria-hidden="true">
              {icon ? <Icon name={icon} size={22} /> : iconNode}
            </span>
          )}
          <b className="cardmini__title">{label}</b>
          {hint != null && hint !== '' && <span className="cardmini__hint">{hint}</span>}
        </>
      )}
    </button>
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
  // The compact lens (see `CardMini` above): a quiet one-line hint, or a full override
  // of the compact body. Ignored when the card isn't rendered compact (outside a slot,
  // or wide enough not to need it) — the ordinary header + children render untouched.
  compactHint,
  compact,
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
  compactHint?: ReactNode
  compact?: ReactNode
  children: ReactNode
}) {
  const lens = useCardLens()
  const isMini = !!lens && lens.compact && !lens.expanded
  // Compact swaps the Link/div for a plain `<button>` outright — nesting a button
  // inside `to`'s `<Link>` would be invalid HTML (and untappable in most browsers).
  // Tapping the mini tile GROWS the card in place; the ordinary `to` navigation comes
  // back once it's expanded to its full form.
  if (isMini) {
    return (
      <CardMini
        className={className}
        style={style}
        label={label}
        icon={icon}
        iconNode={iconNode}
        hint={compactHint}
        body={compact}
        onExpand={lens.expand}
      />
    )
  }
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
