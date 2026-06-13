import { CATS, type CatKey } from '../../lib/cats'
import { tintInk } from '../../lib/colors'
import { Icon } from '../Icon'

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

// Pip activity card: colour spine + washed icon tile + title, optional tappable
// check (settles into sage when done). Interactive variant is a <button>;
// informational rows (events) render as a static card.
export function Act({
  cat,
  title,
  when,
  who,
  done,
  onCheck,
  color,
  mine,
  emoji,
}: {
  cat: CatKey
  title: string
  when?: string
  who?: string
  done?: boolean
  onCheck?: () => void
  color?: string // overrides the category colour (member colour, task colour)
  mine?: boolean // belongs to the device's picked member → a quiet "you" accent
  emoji?: string // glyph override (e.g. the meal-slot icon) shown in place of the Phosphor icon
}) {
  const c = CATS[cat]
  const spine = color ?? c.color
  const tileBg = color ? color + '22' : c.wash
  const glyph = color ?? c.deep
  const cls = 'act' + (done ? ' done' : '') + (mine ? ' act--mine' : '')
  const body = (
    <>
      <span className="spine" style={{ background: spine }} aria-hidden="true" />
      <span className="tile" style={{ background: tileBg }} aria-hidden="true">
        {emoji ? <span className="act__emoji">{emoji}</span> : <Icon name={c.icon} size={28} color={glyph} />}
      </span>
      <span className="act__text">
        {when && <span className="when">{when}</span>}
        <span className="title" style={done ? undefined : { color: tintInk(spine) }}>
          {title}
        </span>
        {who && <span className="who">{who}</span>}
      </span>
      {mine && <span className="act__mine" aria-hidden="true">★</span>}
      {onCheck && (
        <span className="check" aria-hidden="true">
          <Icon name="check-bold" size={18} />
        </span>
      )}
    </>
  )
  if (onCheck) {
    return (
      <button type="button" className={cls} onClick={onCheck} aria-pressed={!!done}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}
