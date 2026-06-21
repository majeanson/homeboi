import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { CERCLE_KEY } from '../../lib/queryKeys'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildContact } from '../detail/adapters'
import { Avatar } from '../Avatar'
import { InlineIcon } from '../Icon'
import { type Contact, type ContactLink, daysUntilBirthday } from '../../lib/cercle'

const ACCENT = '#2A8F85' // cercle turquoise
const WINDOW_DAYS = 14 // a near-term, calm heads-up — the cercle tab shows the fuller month

// Upcoming birthdays from « Le cercle », surfaced on the board as a calm strip —
// NO push, no count, no streak (NFR-CALM): just "Maman · dans 3 jours". Computed
// from contacts, never written into the events table. Renders nothing when none
// are near, so it adds no empty section to the glance. Tap a face → the detail
// peek (with Call / Write / Modifier). Parent board only (the toddler lens has its
// own faces view in the cercle tab).
export function CercleBirthdays() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const detail = useEntityDetail()
  const { data } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () => api<{ contacts: Contact[]; links: ContactLink[] }>('cercle'),
    ...live,
  })

  const soon = (data?.contacts ?? [])
    .map((c) => ({ c, days: daysUntilBirthday(c.birthday) }))
    .filter((b): b is { c: Contact; days: number } => b.days != null && b.days <= WINDOW_DAYS)
    .sort((a, b) => a.days - b.days)

  if (soon.length === 0) return null

  const open = (c: Contact) =>
    detail.open(buildContact(c, { t, lang, members: [] }, { accent: ACCENT, onEdit: () => nav(`/cercle/person/${c.id}`) }))

  return (
    <section className="cercle-bdays board-bdays">
      <h2 className="cercle-section__label">
        <InlineIcon name="cake-bold" size={16} color={ACCENT} /> {t.cercle.birthdaysSoon}
      </h2>
      <div className="cercle-bdays__row">
        {soon.map(({ c, days }) => (
          <button type="button" key={c.id} className="cercle-bday" onClick={() => open(c)}>
            <Avatar kind={c.photoKey ? 'photo' : null} photo={c.photoKey} colour={ACCENT} name={c.firstName} size={40} />
            <span className="cercle-bday__name">{c.nickname?.trim() || c.firstName}</span>
            <span className="cercle-bday__when mono">{days === 0 ? t.cercle.birthdayToday : t.cercle.inDaysN(days)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
