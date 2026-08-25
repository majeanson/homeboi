import { type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { Icon, type IconName } from '../Icon'
import { type HelpMode } from '../../lib/helpMode'
import { WG_MINI_MAX_ITEMS } from '../../lib/widgetGrid'
import { useCardLens } from './CardLens'

// One row of a compact list face. A bare string names a thing (a leading dot anchors
// it); the object form leads the row with a short fixed token — a time (« 9 h ») or a
// day (« sam ») — so a chronological card SAYS when, not just what, in the same 142px.
// The lead replaces the dot (the token already anchors the row) and is never a count.
export type CompactRow = string | { lead?: string; label: string }

// A small secondary action pinned to a mini tile's bottom-right corner — its own tap
// target, a `<Link>` rendered OUTSIDE the tile's button (never nested-interactive). One
// or two per tile (« Aujourd'hui » carries a pencil → « Planifier » and a key → « Avant
// de partir »); « Demain » just the pencil.
export type CornerAction = { to: string; icon: IconName; label: string }

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
//
// Compact lens, Phase 3 — the way BACK: `SecLabel` reads `useCardLens()` itself (rather
// than needing a prop threaded through every one of its ~15 callers) so that the moment
// a card is `expanded`, its header grows a quiet reduce affordance for free: tapping
// anywhere on the header — or the small ⌃ chip — shrinks the card back to its compact
// form (`CardMini`). Inert everywhere else (`lens` is null outside a slot, or the card
// was never expanded), so this changes nothing for the other ~10 callers that don't sit
// inside a halved `CardSlot`.
export function SecLabel({
  label,
  count,
  icon,
  iconNode,
  action,
  help,
  helpKey,
}: {
  label: string
  count?: number
  icon?: IconName
  iconNode?: ReactNode
  /** One quiet control pinned to the header's trailing edge — a card's own ＋ (the
   *  notes card's quick composer). Sits BEFORE the reduce chip so growing/shrinking a
   *  card never moves it. Keep it to a single icon button: the header is a glance
   *  label, not a toolbar. */
  action?: ReactNode
  help?: HelpMode
  helpKey?: string
}) {
  const t = useT()
  const lens = useCardLens()
  const helpable = !!help && !!helpKey && help.active
  const reducible = !!lens?.expanded
  return (
    <>
      <div
        className={'sec-label' + (reducible ? ' sec-label--reducible' : '')}
        onClick={reducible ? lens!.collapse : undefined}
      >
        {(icon || iconNode) && (
          <span className="sec-label__ico" aria-hidden="true">
            {icon ? <Icon name={icon} size={16} /> : iconNode}
          </span>
        )}
        {helpable ? (
          <button
            type="button"
            className="help-title"
            onClick={(e) => {
              e.stopPropagation()
              help!.pick(helpKey!, () => {})()
            }}
            title={t.help.learnMore}
          >
            <b>{label}</b>
          </button>
        ) : (
          <b>{label}</b>
        )}
        <span className="ln" />
        {count ? <span className="ct">{count}</span> : null}
        {/* Stop the click here: an expanded card's whole header collapses it, and the
            action's own job is not "shrink me". */}
        {action ? (
          <span className="sec-label__act" onClick={(e) => e.stopPropagation()}>
            {action}
          </span>
        ) : null}
        {reducible && (
          <button
            type="button"
            className="sec-label__reduce"
            onClick={(e) => {
              e.stopPropagation()
              lens!.collapse()
            }}
            aria-expanded="true"
            aria-label={t.board.collapseCard(label)}
            title={t.board.collapseCard(label)}
          >
            <Icon name="caret-up-bold" size={14} />
          </button>
        )}
      </div>
      {help && helpKey ? help.bubbleFor(helpKey) : null}
    </>
  )
}

// The COMPACT LENS's generic body: what `Section` / `BoardCard` render instead of the
// full header + children when the card's MEASURED width falls under the compact
// threshold (`lib/widgetGrid.isCompact`, read via `useCardLens`). The whole tile IS the
// tap target: a real `<button>` (never nested inside the card's own `<Link>`, which is
// why `BoardCard` swaps its Link/div for this button outright rather than wrapping it)
// that calls `lens.expand()` to grow the card back to the zone's full width in place.
//
// A mini has THREE faces, in order of how much it manages to say. Every tile is exactly
// `--wg-mini-h` tall whichever it picks (`WG_MINI_ROWS`), so a shelf of minis is a shelf.
// The LIST and the GLANCE share ONE header — a tinted disc pinned top-left beside the
// title, with an optional trailing extra (the weather chip). Only the BODY differs:
//
//  1. `body` — a FULL override, for a card whose compact form isn't text at all (the
//     photo frame's picture, the weather hero's wonder backdrop). Wins outright.
//  2. THE LIST — `items`, when there are few enough of them to name honestly
//     (`WG_MINI_MAX_ITEMS`). The shared header over one line per thing. This is the point
//     of the lens: « À finir » should say *what* is left to finish, not that two are.
//  3. The GLANCE — the shared header (so an empty card's icon still sits top-left, never a
//     lonely centred badge) over at most one quiet line (`hint`: a count like '3' or a name
//     like 'Spaghetti' — never a score, never per-person). What a card falls back to when
//     it holds too much to list, or has nothing listable to give.
//
// A card that can list passes BOTH `items` and a counting `hint`, and this picks: naming
// three things beats counting them; naming three of nine is a lie the count tells better.
export function CardMini({
  className,
  style,
  label,
  compactLabel,
  icon,
  iconNode,
  hint,
  head,
  items,
  body,
  to,
  corner,
  onExpand,
}: {
  className?: string
  style?: CSSProperties
  label: string
  /** A shorter title JUST for the mini — the full `label` ellipsizes in a 142px header
   *  once a weather chip shares it (« Aujourd'hui » → « Auj. »). Falls back to `label`. */
  compactLabel?: string
  icon?: IconName
  iconNode?: ReactNode
  hint?: ReactNode
  /** A small extra pinned to the trailing edge of the header — a weather chip on
   *  « Aujourd'hui » / « Demain ». Shows on both faces (it rides the shared header). */
  head?: ReactNode
  /** One line per thing the card holds. Rendered only when they all fit — see above.
   *  A row may lead with a short time/day token (see `CompactRow`). */
  items?: readonly CompactRow[]
  body?: ReactNode
  /** When set, tapping the mini NAVIGATES here instead of growing the card in place — for
   *  a card whose compact form has nothing worth expanding into (an empty « L'auto » →
   *  « /voiture », an empty placeholder → the page that adds one). Skips tap-to-grow. */
  to?: string
  /** One or two small actions pinned to the tile's bottom-right corner — each its OWN tap
   *  target (« Aujourd'hui » → a pencil to « Planifier » + a key to « Avant de partir »).
   *  Rendered as sibling `<Link>`s outside the tile's button, so they're real controls, not
   *  nested-interactive HTML; tapping one navigates, tapping the rest of the tile grows. */
  corner?: CornerAction | readonly CornerAction[]
  onExpand: () => void
}) {
  const t = useT()
  // Index keys: this is a static, never-reordered projection of the card's rows, rebuilt
  // whole on every data change. A stable id would buy nothing and cost every call site.
  const rows = items && items.length > 0 && items.length <= WG_MINI_MAX_ITEMS ? items : null
  const glyph = icon ? <Icon name={icon} size={15} /> : iconNode
  // BOTH faces share one header — the tinted disc pinned TOP-LEFT beside the title, with an
  // optional trailing extra (the weather chip). The glance face used to centre a big icon
  // over the title, which wasted the tile's height and made an empty card read as a lonely
  // badge; anchoring every mini's icon top-left keeps a shelf of tiles visually aligned and
  // frees the body below to actually say something (a hint, a temp, a count).
  const header = (
    <span className="cardmini__head">
      {glyph && (
        <span className="cardmini__ico" aria-hidden="true">
          {glyph}
        </span>
      )}
      <b className="cardmini__title">{compactLabel ?? label}</b>
      {/* `''` = RESERVE the chip's slot without showing one: the weather query can
          resolve minutes after first paint, and a chip that pops in later used to
          reflow the title. The ghost holds the width; real content replaces it. */}
      {head === '' ? (
        <span className="cardmini__headx cardmini__headx--ghost" aria-hidden="true">
          0°
        </span>
      ) : (
        head != null && <span className="cardmini__headx">{head}</span>
      )}
    </span>
  )
  const inner = body ?? (
    <>
      {header}
      {rows ? (
        <ul className="cardmini__rows">
          {rows.map((row, i) => {
            const lead = typeof row === 'string' ? undefined : row.lead
            const text = typeof row === 'string' ? row : row.label
            return (
              <li key={i} className="cardmini__row">
                {lead ? (
                  <span className="cardmini__lead mono">{lead}</span>
                ) : (
                  <span className="cardmini__dot" aria-hidden="true" />
                )}
                <span className="cardmini__rowlabel">{text}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        hint != null && hint !== '' && <span className="cardmini__hint">{hint}</span>
      )}
    </>
  )
  const cls = 'cardmini' + (rows ? ' cardmini--list' : ' cardmini--glance') + (className ? ` ${className}` : '')
  // A card with nothing worth growing into taps straight through to a useful place (its
  // config / add page) rather than expanding to an empty shell — a `<Link>`, not a
  // grow-`<button>`. Everything else keeps tap-to-grow.
  const tile = to ? (
    <Link to={to} className={cls} style={style} aria-label={label}>
      {inner}
    </Link>
  ) : (
    <button
      type="button"
      className={cls}
      style={style}
      aria-expanded={false}
      aria-label={t.board.expandCard(label)}
      onClick={onExpand}
    >
      {inner}
    </button>
  )
  const corners = corner ? (Array.isArray(corner) ? corner : [corner as CornerAction]) : []
  if (corners.length === 0) return tile
  // The corner actions are SIBLINGS of the tile (not children) so they aren't interactive
  // elements nested inside the tile's button/link. The host span carries the fixed mini
  // height and positions the cluster over the tile's bottom-right; `--corner-n` lets the
  // list face reserve room on its last row so text ellipsizes clear of the discs.
  return (
    <span className="cardmini-host" style={{ ['--corner-n']: corners.length } as CSSProperties}>
      {tile}
      <span className="cardmini__corners">
        {corners.map((c) => (
          <Link key={c.to} className="cardmini__corner" to={c.to} aria-label={c.label} title={c.label}>
            <Icon name={c.icon} size={15} />
          </Link>
        ))}
      </span>
    </span>
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
  action,
  help,
  helpKey,
  // The compact lens (see `CardMini` above): the rows to NAME when they fit, a quiet
  // one-line hint when they don't, or a full override of the compact body. All ignored
  // when the card isn't rendered compact (outside a slot, or wide enough not to need
  // it) — the ordinary header + children render untouched.
  compactItems,
  compactHint,
  compactHead,
  compactLabel,
  compactTo,
  compactCorner,
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
  /** A quiet trailing control in the header (see `SecLabel.action`). */
  action?: ReactNode
  help?: HelpMode
  helpKey?: string
  compactItems?: readonly CompactRow[]
  compactHint?: ReactNode
  compactHead?: ReactNode
  /** A shorter title for the mini face only (see `CardMini.compactLabel`). */
  compactLabel?: string
  /** When set, the mini navigates here instead of growing (see `CardMini.to`). */
  compactTo?: string
  /** One or two small corner actions on the mini (see `CardMini.corner`). */
  compactCorner?: CornerAction | readonly CornerAction[]
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
        compactLabel={compactLabel}
        icon={icon}
        iconNode={iconNode}
        hint={compactHint}
        head={compactHead}
        items={compactItems}
        body={compact}
        to={compactTo}
        corner={compactCorner}
        onExpand={lens.expand}
      />
    )
  }
  const inner = (
    <>
      <SecLabel label={label} count={count} icon={icon} iconNode={iconNode} action={action} help={help} helpKey={helpKey} />
      {children}
    </>
  )
  // `is-expanded` only ever applies on the render right after a compact→full growth
  // (never on an ordinary wide card, since `lens` is null or `lens.expanded` is false
  // there) — see the one-shot grow animation scoped to it in widget-grid.css.
  const grownClass = className + (lens?.expanded ? ' is-expanded' : '')
  if (to) {
    return (
      <Link to={to} className={grownClass} style={style} aria-label={ariaLabel}>
        {inner}
      </Link>
    )
  }
  return (
    <div className={grownClass} style={style} aria-label={ariaLabel}>
      {inner}
    </div>
  )
}
