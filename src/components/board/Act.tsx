import { CATS, type CatKey } from '../../lib/cats'
import { tintInk } from '../../lib/colors'
import { isGuest } from '../../lib/device'
import { useT } from '../../i18n'
import { Icon, type IconName } from '../Icon'
import { AvatarStack } from '../AvatarStack'
import { type Face } from '../../lib/eventPeople'
import { type HelpMode } from '../../lib/helpMode'
import { SecLabel, CardMini, type CompactRow, type CornerAction } from './BoardCard'
import { useCardLens } from './CardLens'

// Pip section header: an optional category glyph + label + rule + a quiet count
// (never a score). Each Section is a bento tile in the board grid. `icon` + `tint`
// give the card a SUBTLE category identity (a coloured glyph, a tinted rule, a barely
// -there card wash) so the board reads as a cohesive, colour-coded Pip surface rather
// than a stack of plain white boxes — uniform across every section.
export function Section({
  label,
  count,
  icon,
  tint,
  action,
  help,
  helpKey,
  now,
  // The compact lens (see `CardMini`, BoardCard.tsx): the rows to NAME when they fit, a
  // quiet one-line hint when they don't, or a full override of the compact body. All
  // no-ops unless this Section is actually rendered compact (inside a halved `CardSlot`,
  // below the measured-width threshold).
  compactItems,
  compactHint,
  compactHead,
  compactLabel,
  compactTo,
  compactCorner,
  compact,
  children,
}: {
  label: string
  count?: number
  icon?: IconName
  tint?: string
  /** One quiet control at the header's trailing edge — see `SecLabel.action`
   *  (the « Notes (cercle) » card's ＋ quick composer). Full face only: the compact
   *  mini has its own `compactCorner` affordances. */
  action?: React.ReactNode
  // Time-aware emphasis (lib/momentFocus): a gentle accent on the card that matters at
  // this hour (the day ahead in the morning, tomorrow's prep in the evening). A soft lift
  // — never a reshuffle, never motion. Gated by the ambient toggle on the board side.
  now?: boolean
  // Optional contextual help (lib/helpMode): pass the board's help instance + a key in
  // its content map and, while help mode is armed, the section TITLE becomes tappable →
  // an in-place HelpBubble explaining the section (a "→ Voir le guide" deep-link). Outside
  // help mode it's an ordinary title — identical DOM, no dead tab stops. Lets ANY board
  // section be made explainable without forking a header.
  help?: HelpMode
  helpKey?: string
  compactItems?: readonly CompactRow[]
  compactHint?: React.ReactNode
  // A small extra pinned to the trailing edge of the compact list header (a weather
  // chip). See `CardMini`'s `head`.
  compactHead?: React.ReactNode
  /** A shorter title for the mini face only (see `CardMini.compactLabel`). */
  compactLabel?: string
  /** When set, the mini navigates here instead of growing (see `CardMini.to`). */
  compactTo?: string
  /** One or two small corner actions on the mini (see `CardMini.corner`). */
  compactCorner?: CornerAction | readonly CornerAction[]
  compact?: React.ReactNode
  children: React.ReactNode
}) {
  const style = tint ? ({ '--sec-tint': tint } as React.CSSProperties) : undefined
  const lens = useCardLens()
  const isMini = !!lens && lens.compact && !lens.expanded
  return (
    <div
      className={
        'bento' +
        (tint ? ' bento--tinted' : '') +
        (now ? ' bento--now' : '') +
        (isMini ? ' bento--compact' : '') +
        // Only true on the render right after a compact→full growth — see the one-shot
        // grow animation scoped to it in widget-grid.css.
        (lens?.expanded ? ' is-expanded' : '')
      }
      style={style}
    >
      {isMini ? (
        <CardMini
          label={label}
          compactLabel={compactLabel}
          icon={icon}
          hint={compactHint}
          head={compactHead}
          items={compactItems}
          body={compact}
          to={compactTo}
          corner={compactCorner}
          onExpand={lens!.expand}
        />
      ) : (
        <>
          <SecLabel label={label} count={count} icon={icon} action={action} help={help} helpKey={helpKey} />
          {children}
        </>
      )}
    </div>
  )
}

// A lighter inner divider for a SECOND group bunched inside one bento tile (e.g.
// « Demain » under « Aujourd'hui », or « À compléter » under « Restants »). Same
// colour language as the section header, one notch quieter — so two related groups
// share a card without reading as two separate boxes.
export function SubHead({ label, icon, tint }: { label: string; icon?: IconName; tint?: string }) {
  const style = tint ? ({ '--sec-tint': tint } as React.CSSProperties) : undefined
  return (
    <div className="sec-sublabel" style={style}>
      {icon && (
        <span className="sec-label__ico sec-label__ico--sm" aria-hidden="true">
          <Icon name={icon} size={14} />
        </span>
      )}
      <b>{label}</b>
      <span className="ln" />
    </div>
  )
}

// Pip activity card — the app's one list-row primitive: colour spine + washed
// icon (or photo) tile + title/sub, with an optional trailing affordance. Three
// shapes off the same anatomy:
//   • a tappable check (settles into sage when done)  — `onCheck`
//   • a navigation row (caret, no check)              — `onActivate`
//   • a static informational card                     — neither
// `badge` rides at the right (e.g. a "Prochain" pill); `photo` swaps the glyph
// for an image (a recipe's photo). Used by the board AND the kitchen ＋ pickers.
export function Act({
  cat,
  title,
  when,
  who,
  whoFaces,
  done,
  past,
  onCheck,
  onActivate,
  onOpen,
  color,
  mine,
  emoji,
  icon,
  photo,
  badge,
  soon,
  note,
}: {
  cat: CatKey
  title: string
  when?: string
  who?: string // a quiet sub-line under the title
  whoFaces?: Face[] // several household faces (an event's « Qui ») — a small stack under the title, in place of the `who` text
  done?: boolean
  past?: boolean // meal/event whose time has passed → struck-through, faded
  onCheck?: () => void
  onActivate?: () => void // a plain navigation row: makes it a <button>, shows a caret
  // Tap the row to open the shared entity-detail peek (lib/detail). With NO check
  // the whole row opens it (reads like a nav row); WITH a check the row SPLITS —
  // the body opens the peek, the check disc stays its own tap target.
  onOpen?: () => void
  color?: string // overrides the category colour (member colour, task colour). Must be hex.
  mine?: boolean // belongs to the device's picked member → a quiet "you" accent
  emoji?: string // glyph override shown in place of the Phosphor icon (legacy)
  icon?: IconName // a specific Phosphor icon (e.g. a meal's slot icon) over the category one
  photo?: string // an image shown IN the tile instead of the glyph (falls back to the icon)
  badge?: React.ReactNode // a small pill/marker at the trailing edge, before any affordance
  soon?: boolean // calm "Bientôt" reminder window is open now → a quiet clock chip (migration 0038)
  // A row's own free-text note (a rendez-vous' « apporter la carte… », migration 0121)
  // as a second, quieter sub-line — clamped to two lines so a long one can never turn
  // a glance row into a paragraph; the detail peek carries it in full.
  note?: string
}) {
  const t = useT()
  // Read-only guest: a check fires a write (mark done) — drop it so the row reads as
  // a static informational card. A nav row (onActivate) is a read and stays tappable.
  if (isGuest()) onCheck = undefined
  const c = CATS[cat]
  const spine = color ?? c.color
  const tileBg = color ? color + '22' : c.wash
  const glyph = color ?? c.deep
  // onOpen + a check ⇒ split row (body peeks, check ticks). onOpen alone behaves
  // like a nav row (whole row peeks, trailing caret).
  const split = !!onOpen && !!onCheck
  const activate = onActivate ?? (onOpen && !onCheck ? onOpen : undefined)
  const cls =
    'act' +
    (done ? ' done' : '') +
    (past ? ' act--past' : '') +
    (mine ? ' act--mine' : '') +
    (activate ? ' act--nav' : '') +
    (split ? ' act--split' : '')

  const spineEl = <span className="spine" style={{ background: spine }} aria-hidden="true" />
  const tileEl = (
    <span
      className={'tile' + (photo ? ' tile--photo' : '')}
      style={{ background: tileBg }}
      aria-hidden="true"
      data-icon={photo || icon ? icon : emoji ? undefined : c.icon}
    >
      {photo ? (
        <img src={photo} alt="" loading="lazy" />
      ) : icon ? (
        <Icon name={icon} size={28} color={glyph} />
      ) : emoji ? (
        <span className="act__emoji">{emoji}</span>
      ) : (
        <Icon name={c.icon} size={28} color={glyph} />
      )}
    </span>
  )
  const textEl = (
    <span className="act__text">
      {when && <span className="when">{when}</span>}
      <span className="title" style={(done || past) ? undefined : { color: tintInk(spine) }}>
        {title}
      </span>
      {whoFaces && whoFaces.length > 0 ? (
        <AvatarStack faces={whoFaces} size={18} className="act__pax" />
      ) : (
        who && <span className="who">{who}</span>
      )}
      {note && (
        <span className="act__note">
          <Icon name="pencil-simple-bold" size={12} />
          <span>{note}</span>
        </span>
      )}
      {soon && (
        <span className="act__soon mono">
          <Icon name="clock-bold" size={12} /> {t.board.soon}
        </span>
      )}
    </span>
  )
  const mineEl = mine ? (
    <span className="act__mine" aria-hidden="true">
      <Icon name="star-fill" size={13} />
    </span>
  ) : null
  const badgeEl = badge ? <span className="act__badge">{badge}</span> : null

  // Split: the info area is its own button (peek), the check disc another (tick).
  if (split) {
    return (
      <div className={cls}>
        {spineEl}
        <button type="button" className="act__hit" onClick={onOpen}>
          {tileEl}
          {textEl}
        </button>
        {mineEl}
        {badgeEl}
        <button
          type="button"
          className="check act__checkbtn"
          onClick={onCheck}
          aria-pressed={!!done}
          aria-label={t.detail.markDone}
        >
          <Icon name="check-bold" size={18} />
        </button>
      </div>
    )
  }

  const body = (
    <>
      {spineEl}
      {tileEl}
      {textEl}
      {mineEl}
      {badgeEl}
      {onCheck ? (
        <span className="check" aria-hidden="true">
          <Icon name="check-bold" size={18} />
        </span>
      ) : activate ? (
        <span className="act__caret" aria-hidden="true">
          <Icon name="caret-right-bold" size={16} />
        </span>
      ) : null}
    </>
  )
  if (onCheck || activate) {
    return (
      <button
        type="button"
        className={cls}
        onClick={onCheck ?? activate}
        aria-pressed={onCheck ? !!done : undefined}
      >
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}
