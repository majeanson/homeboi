import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useEntityDetail } from '../components/detail/DetailProvider'
import { buildContact } from '../components/detail/adapters'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { CERCLE_KEY } from '../lib/queryKeys'
import { Loading, PairPrompt } from '../components/Fallback'
import { HubHead } from '../components/HubHead'
import { SectionIntro } from '../components/SectionIntro'
import { Avatar } from '../components/Avatar'
import { Icon, InlineIcon } from '../components/Icon'
import { useSpeak } from '../lib/speak'
import {
  type Contact,
  type ContactLink,
  type RelationshipType,
  detectFamilyGroups,
  daysUntilBirthday,
  fullName,
  formatBirthday,
  relLabel,
} from '../lib/cercle'

const ACCENT = '#C45E86' // the cercle tab's rose

interface CercleData {
  contacts: Contact[]
  links: ContactLink[]
}

// « Le cercle » — the household people directory. Parent: a searchable directory
// grouped by auto-detected family, with upcoming birthdays surfaced calmly. Toddler:
// a faces grid, tap to hear the name ("Qui est-ce ? — Grand-maman !").
export function Cercle() {
  const { audience } = useAudience()
  if (audience === 'toddler') return <CircleKidView />
  return <CercleParent />
}

// Resolve a contact's relationships from THEIR perspective → display strings.
function relationsOf(person: Contact, links: ContactLink[], byId: Map<string, Contact>, lang: 'fr' | 'en'): string[] {
  return links
    .filter((l) => l.personAId === person.id || l.personBId === person.id)
    .map((l) => {
      const isA = l.personAId === person.id
      const relType = (isA ? l.type : l.reverseType) as RelationshipType
      const other = byId.get(isA ? l.personBId : l.personAId)
      return `${relLabel(relType, lang)} · ${other ? fullName(other) : '—'}`
    })
}

function CercleParent() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const detail = useEntityDetail()
  const [query, setQuery] = useState('')

  const { data, error } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () => api<CercleData>('cercle'),
    ...live,
  })

  const contacts = useMemo(() => data?.contacts ?? [], [data])
  const links = useMemo(() => data?.links ?? [], [data])
  const byId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])

  // Auto-detected families (Union-Find over family edges); everyone else falls
  // into "Autres personnes".
  const groups = useMemo(
    () => detectFamilyGroups(contacts, links, (name) => (name ? t.cercle.familyOf(name) : t.cercle.familyGeneric)),
    [contacts, links, t],
  )

  // Birthdays within the next month, soonest first (calm: a gentle heads-up, no
  // counts, no push).
  const birthdays = useMemo(
    () =>
      contacts
        .map((c) => ({ c, days: daysUntilBirthday(c.birthday) }))
        .filter((b): b is { c: Contact; days: number } => b.days != null && b.days <= 31)
        .sort((a, b) => a.days - b.days),
    [contacts],
  )

  if (isUnauthorized(error)) return <PairPrompt />
  if (!data && !error) return <Loading />

  const openContact = (c: Contact) =>
    detail.open(
      buildContact(c, { t, lang, members: [] }, { accent: ACCENT, relations: relationsOf(c, links, byId, lang), onEdit: () => nav(`/cercle/person/${c.id}`) }),
    )

  const Row = ({ c }: { c: Contact }) => {
    const rels = relationsOf(c, links, byId, lang)
    const bday = formatBirthday(c.birthday, lang)
    const sub = rels[0] ?? (c.phone || c.email || bday || null)
    return (
      <button type="button" className="cercle-row" onClick={() => openContact(c)}>
        <Avatar kind={c.photoKey ? 'photo' : null} photo={c.photoKey} colour={ACCENT} name={c.firstName} size={48} />
        <span className="cercle-row__main">
          <span className="cercle-row__name">{fullName(c)}</span>
          {sub && <span className="cercle-row__sub mono">{sub}</span>}
        </span>
      </button>
    )
  }

  // Search collapses the grouping into one flat, filtered list.
  const q = query.trim().toLowerCase()
  const filtered = q
    ? contacts.filter((c) =>
        [fullName(c), c.nickname ?? '', ...(c.tags ?? [])].join(' ').toLowerCase().includes(q),
      )
    : null

  const groupedIds = new Set(groups.flatMap((g) => [...g.memberIds]))
  const others = [...contacts]
    .filter((c) => !groupedIds.has(c.id))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), lang))

  return (
    <main className="today-feed cercle">
      <HubHead title={t.nav.cercle} subtitle={t.cercle.tag} icon="users-three-bold" iconColor={ACCENT} background="var(--berry-wash)" card="cercle" />
      <SectionIntro card="cercle" />

      {contacts.length === 0 ? (
        <div className="feed-empty cercle-empty">
          <p>{t.cercle.empty}</p>
          <p className="mono">{t.cercle.emptyHint}</p>
        </div>
      ) : (
        <>
          <label className="cercle-search">
            <InlineIcon name="magnifying-glass-bold" size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.cercle.search} aria-label={t.cercle.search} />
          </label>

          {/* Upcoming birthdays — calm heads-up, hidden during a search. */}
          {!q && birthdays.length > 0 && (
            <section className="cercle-bdays">
              <h2 className="cercle-section__label">
                <InlineIcon name="cake-bold" size={16} color={ACCENT} /> {t.cercle.birthdaysSoon}
              </h2>
              <div className="cercle-bdays__row">
                {birthdays.map(({ c, days }) => (
                  <button type="button" key={c.id} className="cercle-bday" onClick={() => openContact(c)}>
                    <Avatar kind={c.photoKey ? 'photo' : null} photo={c.photoKey} colour={ACCENT} name={c.firstName} size={40} />
                    <span className="cercle-bday__name">{c.nickname?.trim() || c.firstName}</span>
                    <span className="cercle-bday__when mono">{days === 0 ? t.cercle.birthdayToday : t.cercle.inDaysN(days)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {filtered ? (
            <section className="cercle-group">
              {filtered.length === 0 ? (
                <p className="feed-empty">{t.cercle.empty}</p>
              ) : (
                filtered.map((c) => <Row key={c.id} c={c} />)
              )}
            </section>
          ) : (
            <>
              {groups.map((g) => (
                <section key={g.id} className="cercle-group">
                  <h2 className="cercle-section__label">
                    <InlineIcon name="users-three-bold" size={16} color={ACCENT} /> {g.name}
                  </h2>
                  {[...g.memberIds]
                    .map((id) => byId.get(id))
                    .filter((c): c is Contact => !!c)
                    .sort((a, b) => fullName(a).localeCompare(fullName(b), lang))
                    .map((c) => (
                      <Row key={c.id} c={c} />
                    ))}
                </section>
              ))}
              {others.length > 0 && (
                <section className="cercle-group">
                  {groups.length > 0 && <h2 className="cercle-section__label">{t.cercle.others}</h2>}
                  {others.map((c) => (
                    <Row key={c.id} c={c} />
                  ))}
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}

// Toddler lens: a faces grid. Tap a face → hear the name read aloud on-device.
// No add/edit/settings — the one-way door holds (KidExitGate lives in the shell).
function CircleKidView() {
  const t = useT()
  const speak = useSpeak()
  const { data } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () => api<CercleData>('cercle'),
    ...live,
  })
  const contacts = data?.contacts ?? []

  return (
    <main className="cercle-kid">
      <h1 className="cercle-kid__title">{t.cercle.whoIsThis}</h1>
      {contacts.length === 0 ? (
        <p className="feed-empty">{t.cercle.empty}</p>
      ) : (
        <>
          <p className="cercle-kid__hint mono">{t.cercle.tapToHear}</p>
          <div className="cercle-kid__grid">
            {contacts.map((c) => {
              const name = c.nickname?.trim() || c.firstName
              return (
                <button type="button" key={c.id} className="cercle-kid__card" onClick={() => speak(name)}>
                  <Avatar kind={c.photoKey ? 'photo' : null} photo={c.photoKey} colour={ACCENT} name={c.firstName} size={120} />
                  <span className="cercle-kid__name">{name}</span>
                  <Icon name="speaker-high-bold" size={20} color={ACCENT} />
                </button>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
