import { useMemo } from 'react'
import { useT } from '../../i18n'
import { useSurface } from '../../lib/surface'
import { isGuest } from '../../lib/device'
import { bumpFrequent, frequentScores } from '../../lib/frequents'
import { rankJoindre, JOINDRE_SCOPE, type JoindreBusinessInput, type JoindreCandidate } from '../../lib/joindre'
import { Rail } from '../Layout'
import { Avatar } from '../Avatar'
import { InlineIcon } from '../Icon'

// « Joindre » (A-6, bmad/10) — "call the dentist" used to be a 3-tap hunt across
// Famille/Social/Business. This is a one-tap quick-dial rail at the FOOT of each
// people section (Famille/Sociale, scoped to that section's people) and the Business
// tab (scoped to vendors), ranked by lib/joindre (frequents-first, urgence-first cold
// start). MOBILE ONLY (a shared kiosk wall has no business dialing out on its own)
// and hidden for a read-only guest. Self-hides below 2 eligible entries — a single
// tile would just duplicate the row's own quick-link.
export function JoindreRail({
  people,
  businesses,
}: {
  people: JoindreCandidate[]
  businesses: JoindreBusinessInput[]
}) {
  const t = useT()
  const { surface } = useSurface()
  const ro = isGuest()
  // Re-read on mount / when the underlying people-or-businesses set changes —
  // matches the frequents-first EntityCombobox convention (reorders on reload,
  // not live mid-session on every tap).
  const ranked = useMemo(
    () => rankJoindre(people, businesses, frequentScores(JOINDRE_SCOPE)),
    [people, businesses],
  )
  if (surface !== 'mobile' || ro || ranked.length < 2) return null
  return (
    <section className="joindre">
      <h2 className="joindre__title mono">{t.cercle.joindreTitle}</h2>
      <Rail className="joindre__rail" aria-label={t.cercle.joindreTitle}>
        {ranked.map((c) => {
          // A phone always wins the affordance (a `tel:` link + the phone glyph);
          // an email-only entry (still eligible) falls back to `mailto:` + envelope
          // so the icon never lies about what tapping the tile does.
          const href = c.phone ? `tel:${c.phone}` : `mailto:${c.email}`
          return (
            <a
              key={c.key}
              className="joindre__item"
              href={href}
              onClick={() => bumpFrequent(JOINDRE_SCOPE, c.key)}
            >
              {c.kind === 'business' ? (
                <span className="joindre__biz" aria-hidden="true">
                  <InlineIcon name="storefront-bold" size={20} />
                </span>
              ) : (
                <Avatar kind={c.avatarKind} photo={c.avatarRef} colour={c.colour} name={c.firstName} size={44} />
              )}
              <span className="joindre__name">{c.firstName}</span>
              <InlineIcon name={c.phone ? 'phone-bold' : 'envelope-bold'} size={13} />
            </a>
          )
        })}
      </Rail>
    </section>
  )
}
