import { useNavigate } from 'react-router-dom'
import { timeOfDay } from '../../lib/timeofday'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { useCardLens } from './CardLens'
import { CardMini } from './BoardCard'

type Scope = 'tonight' | 'tomorrow' | 'date' | 'week'

// The board's entry into « Moments » (the /moment recap + handoff scene), as a
// hero-style card in the status band beside « À régler » — same card look + height as
// the supper/weather heroes. « Moments » is a SCENE you zoom into, so the card lists
// its four windows as DIRECT tap targets: each chip deep-links straight to that scope
// (« ce soir » · « demain » · « une date » · « la semaine ») instead of one button you
// then re-pick inside. The contextually-relevant window — tonight by day, tomorrow in
// the evening — is emphasized so the glance still suggests "what to look at now".
// Parent-only (rendered in the parent board body).
export function MomentPeek() {
  const t = useT()
  const nav = useNavigate()
  const evening = timeOfDay(Date.now()) === 'evening'
  const lead: Scope = evening ? 'tomorrow' : 'tonight'
  const icon = evening ? 'moon-stars-bold' : 'sun-horizon-bold'
  const windows: { k: Scope; label: string }[] = [
    { k: 'tonight', label: t.moment.scope.tonight },
    { k: 'tomorrow', label: t.moment.scope.tomorrow },
    { k: 'date', label: t.moment.scope.date },
    { k: 'week', label: t.moment.scope.week },
  ]
  // The compact lens (see CardLens.tsx): `null` outside a CardSlot (DevKit/MomentsView).
  // The four windows are direct nav chips — that IS the card's whole function, so a
  // genuinely compact width shows just the lead window's name as a quiet hint and taps
  // to GROW back to the full chooser in place, rather than hiding the other three.
  const lens = useCardLens()
  if (lens && lens.compact && !lens.expanded) {
    return (
      <CardMini
        className="now-card now-card--moment"
        label={t.moment.title}
        icon={icon}
        hint={windows.find((w) => w.k === lead)?.label}
        onExpand={lens.expand}
      />
    )
  }
  return (
    <div className="now-card now-card--moment">
      <div className="blob" />
      <div className="label">
        <Icon name={icon} size={13} /> {t.moment.title}
      </div>
      {/* The way back once grown to full width — mirrors `SecLabel`'s reduce chip
          (BoardCard.tsx) for the cards that DO use that shared header; « Moments »'s
          full form is a hero tile with no `.sec-label`, so it grows its own. */}
      {lens?.expanded && (
        <button
          type="button"
          className="sec-label__reduce now-card__reduce"
          onClick={(e) => {
            e.stopPropagation()
            lens.collapse()
          }}
          aria-expanded="true"
          aria-label={t.board.collapseCard(t.moment.title)}
          title={t.board.collapseCard(t.moment.title)}
        >
          <Icon name="caret-up-bold" size={14} />
        </button>
      )}
      <div className="now-card--moment__windows" role="group" aria-label={t.moment.title}>
        {windows.map((w) => (
          <button
            key={w.k}
            type="button"
            className={'moment-chip' + (w.k === lead ? ' is-lead' : '')}
            onClick={() => nav(`/moment?scope=${w.k}`)}
            aria-label={`${t.moment.title} · ${w.label}`}
          >
            {w.label}
          </button>
        ))}
      </div>
      <div className="icn" aria-hidden="true">
        <Icon name={icon} size={30} />
      </div>
    </div>
  )
}
