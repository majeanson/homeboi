import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { useSpeak } from '../../lib/speak'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { CERCLE_KEY } from '../../lib/queryKeys'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import {
  type Contact,
  type Member,
  type ContactLink,
  type ContactGroupRaw,
  type Pet,
  type Person,
  unifyCircle,
  daysUntilBirthday,
} from '../../lib/cercle'

// « Les fêtes » — a calm birthday countdown for a pre-reader. Upcoming birthdays
// (members, contacts, pets) as big cake cards: a face, the name, and "dans 3 dodos"
// (sleeps — a toddler's unit of time). Tap one → hears it aloud. Pure read of the
// derived-birthday data; no reminders, no notification (NFR-CALM) — just the joy of
// counting down to someone's day.
const SOON_DAYS = 60

interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
  groups: ContactGroupRaw[]
  pets: Pet[]
}

export function BirthdayCountdown() {
  const t = useT()
  const speak = useSpeak()
  const p = t.play.fete
  const { data } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle'), ...live })

  const people = useMemo(
    () => (data ? unifyCircle(data.contacts, data.members, data.links ?? [], [], data.pets).people : []),
    [data],
  )
  const items = useMemo(
    () =>
      people
        .map((pp) => ({ pp, days: daysUntilBirthday(pp.birthday) }))
        .filter((x): x is { pp: Person; days: number } => x.days != null && x.days <= SOON_DAYS)
        .sort((a, b) => a.days - b.days),
    [people],
  )

  const phrase = (firstName: string, days: number) => (days === 0 ? p.today(firstName) : p.inDodos(firstName, days))

  if (!data) return <p className="loading mono">{t.common.loading}</p>
  if (items.length === 0)
    return (
      <button type="button" className="bigtiles__empty" onClick={() => speak(p.none)}>
        <span className="bigtiles__empty-mark" aria-hidden="true">🎂</span>
        <span className="mono">{p.none}</span>
      </button>
    )

  return (
    <div className="fete">
      <button type="button" className="sayable fete__intro" onClick={() => speak(p.intro)}>
        {p.intro}
      </button>
      <div className="fete__grid">
        {items.map(({ pp, days }) => (
          <button
            key={pp.key}
            type="button"
            className={'fete-card' + (days === 0 ? ' is-today' : '')}
            onClick={() => speak(phrase(pp.firstName, days), undefined)}
            aria-label={phrase(pp.firstName, days)}
          >
            <span className="fete-card__cake" aria-hidden="true">🎂</span>
            <Avatar kind={pp.avatarKind} photo={pp.avatarRef} colour={pp.colour} name={pp.firstName} size={84} />
            <span className="fete-card__name">{pp.firstName}</span>
            <span className="fete-card__when mono">{days === 0 ? p.todayShort : p.dodosShort(days)}</span>
            <Icon name="speaker-high-bold" size={16} />
          </button>
        ))}
      </div>
    </div>
  )
}
