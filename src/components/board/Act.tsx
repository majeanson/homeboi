import { CATS, type CatKey } from '../../lib/cats'
import { tintInk } from '../../lib/colors'
import { Icon, type IconName } from '../Icon'

// Pip section header: label + rule + a quiet count (never a score). Each Section
// is a bento tile in the board grid.
export function Section({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bento">
      <div className="sec-label">
        <b>{label}</b>
        <span className="ln" />
        {count ? <span className="ct">{count}</span> : null}
      </div>
      {children}
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
  done,
  onCheck,
  onActivate,
  color,
  mine,
  emoji,
  icon,
  photo,
  badge,
}: {
  cat: CatKey
  title: string
  when?: string
  who?: string // a quiet sub-line under the title
  done?: boolean
  onCheck?: () => void
  onActivate?: () => void // a plain navigation row: makes it a <button>, shows a caret
  color?: string // overrides the category colour (member colour, task colour). Must be hex.
  mine?: boolean // belongs to the device's picked member → a quiet "you" accent
  emoji?: string // glyph override shown in place of the Phosphor icon (legacy)
  icon?: IconName // a specific Phosphor icon (e.g. a meal's slot icon) over the category one
  photo?: string // an image shown IN the tile instead of the glyph (falls back to the icon)
  badge?: React.ReactNode // a small pill/marker at the trailing edge, before any affordance
}) {
  const c = CATS[cat]
  const spine = color ?? c.color
  const tileBg = color ? color + '22' : c.wash
  const glyph = color ?? c.deep
  const cls =
    'act' + (done ? ' done' : '') + (mine ? ' act--mine' : '') + (onActivate ? ' act--nav' : '')
  const body = (
    <>
      <span className="spine" style={{ background: spine }} aria-hidden="true" />
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
      <span className="act__text">
        {when && <span className="when">{when}</span>}
        <span className="title" style={done ? undefined : { color: tintInk(spine) }}>
          {title}
        </span>
        {who && <span className="who">{who}</span>}
      </span>
      {mine && <span className="act__mine" aria-hidden="true">★</span>}
      {badge && <span className="act__badge">{badge}</span>}
      {onCheck ? (
        <span className="check" aria-hidden="true">
          <Icon name="check-bold" size={18} />
        </span>
      ) : onActivate ? (
        <span className="act__caret" aria-hidden="true">
          <Icon name="caret-right-bold" size={16} />
        </span>
      ) : null}
    </>
  )
  if (onCheck || onActivate) {
    return (
      <button
        type="button"
        className={cls}
        onClick={onCheck ?? onActivate}
        aria-pressed={onCheck ? !!done : undefined}
      >
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}
