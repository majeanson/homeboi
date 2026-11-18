import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { useARegler, frictionRow, withoutTonightMeal } from '../../lib/aRegler'
import { Icon } from '../Icon'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { useCardLens } from './CardLens'
import { CardMini } from './BoardCard'

// « À régler » — a quiet board card surfacing the cross-domain heads-up scan: a short
// list of frictions worth sorting (a ride with no driver, an empty supper, a birthday
// with no gift idea…), each tappable through to its fix (or « Cette semaine » for the
// full list). Renders NOTHING when there's nothing to sort — a calm, finite card that
// empties and stays empty (NFR-CALM), never a nagging badge.
//
// Parent audience only (gated by the caller): a locked kiosk / toddler / read-only
// guest never sees it. A parent DOES see it on the kiosk — the fixes it links to are
// navigations (/kitchen/day, /liste, /cercle, /settings), not writes the wall tablet
// can't do; the endpoint itself short-circuits to an empty scan for a guest actor.
//
// Two looks: `chip` (a compact one-liner — used inline, e.g. « Cette semaine ») and
// `card` (a hero-style tile that sits in the board status band, matching the
// supper/weather heroes' card look + height).
export function ARegler({
  enabled,
  variant = 'chip',
  tonightShown = false,
}: {
  enabled: boolean
  variant?: 'chip' | 'card'
  /** « Ce soir » is on this board: it already says tonight's meal is unplanned. */
  tonightShown?: boolean
}) {
  const t = useT()
  const { data } = useARegler(enabled)
  const all = data?.signals ?? []
  const signals = tonightShown ? withoutTonightMeal(all) : all
  const empty = !enabled || signals.length === 0
  // No-op for the inline `chip` variant, which renders outside a CardSlot.
  useReportEmpty(empty)
  // The compact lens (see CardLens.tsx): `null` for the `chip` variant (it renders
  // outside a CardSlot) and for the `card` variant when it isn't rendered halved.
  const lens = useCardLens()
  const [lead] = signals
  if (empty || !lead) return null
  // The first friction is the headline, and a tap goes straight to its one-tap fix.
  // SEVERAL used to show « +2 » — a number nobody could read — and send the tap into
  // Réglages ▸ Cette semaine, which is settings, not the problems (review #24,
  // 2026-11-17). Now each one is NAMED, with its own fix, up to three; never a count.
  const first = frictionRow(lead, t)
  const to = lead.href
  const aria = t.aRegler.title
  const shown = signals.slice(0, 3)
  const several = shown.length > 1

  // Card: a hero-style tile (marigold = a warm heads-up), label + the lead friction as
  // the headline + a « +N » when there are more, the friction's glyph bottom-right.
  if (variant === 'card') {
    const isMini = !!lens && lens.compact && !lens.expanded
    if (isMini) {
      return (
        <CardMini
          className="now-card now-card--regler"
          label={t.aRegler.title}
          icon="warning-bold"
          // Name every friction when they fit; otherwise the lead one, as before.
          items={signals.map((s) => frictionRow(s, t).text)}
          hint={first.text}
          onExpand={lens.expand}
        />
      )
    }
    // Several: the card is a plain tile and each friction its own link (a link cannot
    // hold links). One: the whole tile is the door, as before.
    const Tile = several ? 'section' : Link
    const tileProps = several ? { 'aria-label': aria } : { to, 'aria-label': aria }
    return (
      <Tile {...(tileProps as { to: string })} className="now-card now-card--regler">
        <div className="blob" />
        <div className="label">
          <Icon name="warning-bold" size={13} /> {t.aRegler.title}
        </div>
        {several ? (
          <ul className="now-card__frictions">
            {shown.map((s) => {
              const r = frictionRow(s, t)
              return (
                <li key={s.href + r.text}>
                  <Link to={s.href}>
                    <Icon name={r.icon} size={16} /> {r.text}
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="what">{first.text}</div>
        )}
        <div className="icn" aria-hidden="true">
          <Icon name={first.icon} size={34} />
        </div>
        {/* The way back once grown to full width — mirrors `SecLabel`'s reduce chip
            (BoardCard.tsx) for the cards that DO use that shared header; ARegler's
            full form is a hero tile with no `.sec-label`, so it grows its own. */}
        {lens?.expanded && (
          <button
            type="button"
            className="sec-label__reduce now-card__reduce"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              lens.collapse()
            }}
            aria-expanded="true"
            aria-label={t.board.collapseCard(t.aRegler.title)}
            title={t.board.collapseCard(t.aRegler.title)}
          >
            <Icon name="caret-up-bold" size={14} />
          </button>
        )}
      </Tile>
    )
  }

  // Chip: one quiet line — the label + the first friction, its own door. No count (#24).
  return (
    <Link to={to} className="a-regler" aria-label={aria}>
      <Icon name="warning-bold" size={14} />
      <span className="a-regler__title mono">{t.aRegler.title}</span>
      <span className="a-regler__lead">
        <Icon name={first.icon} size={14} /> {first.text}
      </span>
      <Icon name="caret-right-bold" size={13} />
    </Link>
  )
}
