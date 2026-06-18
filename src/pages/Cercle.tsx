import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useTabParam } from '../lib/tabParam'
import { useEntityDetail } from '../components/detail/DetailProvider'
import { buildContact, buildMemberPerson } from '../components/detail/adapters'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { CERCLE_KEY } from '../lib/queryKeys'
import { Loading, PairPrompt } from '../components/Fallback'
import { HubHead } from '../components/HubHead'
import { SectionIntro } from '../components/SectionIntro'
import { Avatar } from '../components/Avatar'
import { Icon, InlineIcon, type IconName } from '../components/Icon'
import { useSpeak } from '../lib/speak'
import { CercleEgo } from '../components/cercle/CercleEgo'
import { CercleTree } from '../components/cercle/CercleTree'
import {
  type Contact,
  type ContactLink,
  type Member,
  type Person,
  buildPeople,
  personKey,
  detectFamilyGroups,
  daysUntilBirthday,
  formatBirthday,
  relLabel,
} from '../lib/cercle'

const ACCENT = '#C45E86' // the cercle tab's rose

interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
}

type View = 'list' | 'links' | 'tree'
const VIEW_ICON: Record<View, IconName> = { list: 'user-bold', links: 'users-three-bold', tree: 'tree-bold' }

// « Le cercle » — the household people directory + relationship views. Parent:
// Liste (calm grouped directory, the default + accessible), Liens (tap-to-focus ego
// view) and Arbre (generational family tree). Toddler: a faces grid, tap to hear
// the name. Members (the household faces) AND contacts are unified "people".
export function Cercle() {
  const { audience } = useAudience()
  if (audience === 'toddler') return <CircleKidView />
  return <CercleParent />
}

// A person's relationships, resolved FROM THEIR perspective → display strings
// ("Grand-parent · Léa"). Works over composite person keys (contacts + members).
function relationsOf(key: string, links: ContactLink[], byKey: Map<string, Person>, lang: 'fr' | 'en'): string[] {
  return links
    .map((l) => {
      const aKey = personKey(l.personAKind, l.personAId)
      const bKey = personKey(l.personBKind, l.personBId)
      if (aKey === key) return { rel: l.type, other: bKey }
      if (bKey === key) return { rel: l.reverseType, other: aKey }
      return null
    })
    .filter((x): x is { rel: ContactLink['type']; other: string } => !!x)
    .map((r) => `${relLabel(r.rel, lang)} · ${byKey.get(r.other)?.name ?? '—'}`)
}

function CercleParent() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const detail = useEntityDetail()
  const [view, setView] = useTabParam<View>('view', 'list', ['list', 'links', 'tree'])
  const [query, setQuery] = useState('')

  const { data, error } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle'), ...live })

  const contacts = useMemo(() => data?.contacts ?? [], [data])
  const members = useMemo(() => data?.members ?? [], [data])
  const links = useMemo(() => data?.links ?? [], [data])
  const people = useMemo(() => buildPeople(contacts, members), [contacts, members])
  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people])
  const contactsById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])

  const groups = useMemo(
    () => detectFamilyGroups(people, links, (name) => (name ? t.cercle.familyOf(name) : t.cercle.familyGeneric)),
    [people, links, t],
  )

  // Upcoming birthdays (contacts carry a birthday; members don't here).
  const birthdays = useMemo(
    () =>
      people
        .map((p) => ({ p, days: daysUntilBirthday(p.birthday) }))
        .filter((b): b is { p: Person; days: number } => b.days != null && b.days <= 31)
        .sort((a, b) => a.days - b.days),
    [people],
  )

  if (isUnauthorized(error)) return <PairPrompt />
  if (!data && !error) return <Loading />

  const openPerson = (p: Person) => {
    const relations = relationsOf(p.key, links, byKey, lang)
    if (p.kind === 'contact') {
      const c = contactsById.get(p.id)
      if (!c) return
      detail.open(buildContact(c, { t, lang, members: [] }, { accent: ACCENT, relations, onEdit: () => nav(`/cercle/person/${c.id}`) }))
    } else {
      detail.open(buildMemberPerson(p, { t, lang, members: [] }, { relations }))
    }
  }

  const Row = ({ p }: { p: Person }) => {
    const rels = relationsOf(p.key, links, byKey, lang)
    const bday = p.kind === 'contact' ? formatBirthday(p.birthday, lang) : null
    const sub = rels[0] ?? bday ?? null
    return (
      <button type="button" className="cercle-row" onClick={() => openPerson(p)}>
        <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={p.colour} name={p.firstName} size={48} />
        <span className="cercle-row__main">
          <span className="cercle-row__name">{p.name}</span>
          {sub && <span className="cercle-row__sub mono">{sub}</span>}
        </span>
        {p.kind === 'member' && <span className="cercle-row__badge mono">{t.cercle.memberBadge}</span>}
      </button>
    )
  }

  const q = query.trim().toLowerCase()
  const filtered = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : null
  const groupedKeys = new Set(groups.flatMap((g) => [...g.memberKeys]))
  const others = people.filter((p) => !groupedKeys.has(p.key)).sort((a, b) => a.name.localeCompare(b.name, lang))

  const viewSwitch = (
    <div className="cercle-viewswitch" role="tablist" aria-label={t.nav.cercle}>
      {(['list', 'links', 'tree'] as View[]).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          className={'cercle-viewswitch__btn' + (view === v ? ' is-active' : '')}
          onClick={() => setView(v)}
        >
          <InlineIcon name={VIEW_ICON[v]} size={15} /> {t.cercle.view[v]}
        </button>
      ))}
    </div>
  )

  return (
    <main className="today-feed cercle">
      <HubHead title={t.nav.cercle} subtitle={t.cercle.tag} icon="users-three-bold" iconColor={ACCENT} background="var(--berry-wash)" card="cercle" />

      {people.length === 0 ? (
        <>
          <SectionIntro card="cercle" />
          <div className="feed-empty cercle-empty">
            <p>{t.cercle.empty}</p>
            <p className="mono">{t.cercle.emptyHint}</p>
          </div>
        </>
      ) : (
        <>
          {viewSwitch}

          {view === 'links' ? (
            <CercleEgo people={people} links={links} onOpen={openPerson} />
          ) : view === 'tree' ? (
            <CercleTree people={people} links={links} onOpen={openPerson} />
          ) : (
            <>
              <SectionIntro card="cercle" />
              <label className="cercle-search">
                <InlineIcon name="magnifying-glass-bold" size={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.cercle.search} aria-label={t.cercle.search} />
              </label>

              {!q && birthdays.length > 0 && (
                <section className="cercle-bdays">
                  <h2 className="cercle-section__label">
                    <InlineIcon name="cake-bold" size={16} color={ACCENT} /> {t.cercle.birthdaysSoon}
                  </h2>
                  <div className="cercle-bdays__row">
                    {birthdays.map(({ p, days }) => (
                      <button type="button" key={p.key} className="cercle-bday" onClick={() => openPerson(p)}>
                        <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={p.colour} name={p.firstName} size={40} />
                        <span className="cercle-bday__name">{p.firstName}</span>
                        <span className="cercle-bday__when mono">{days === 0 ? t.cercle.birthdayToday : t.cercle.inDaysN(days)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {filtered ? (
                <section className="cercle-group">
                  {filtered.length === 0 ? <p className="feed-empty">{t.cercle.empty}</p> : filtered.map((p) => <Row key={p.key} p={p} />)}
                </section>
              ) : (
                <>
                  {groups.map((g) => (
                    <section key={g.id} className="cercle-group">
                      <h2 className="cercle-section__label">
                        <InlineIcon name="users-three-bold" size={16} color={ACCENT} /> {g.name}
                      </h2>
                      {[...g.memberKeys]
                        .map((k) => byKey.get(k))
                        .filter((p): p is Person => !!p)
                        .sort((a, b) => a.name.localeCompare(b.name, lang))
                        .map((p) => (
                          <Row key={p.key} p={p} />
                        ))}
                    </section>
                  ))}
                  {others.length > 0 && (
                    <section className="cercle-group">
                      {groups.length > 0 && <h2 className="cercle-section__label">{t.cercle.others}</h2>}
                      {others.map((p) => (
                        <Row key={p.key} p={p} />
                      ))}
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}

// Toddler lens: a faces grid of EVERYONE (members + contacts). Tap a face → hear
// the name read aloud on-device. No view switch, no add/edit (one-way door).
function CircleKidView() {
  const t = useT()
  const speak = useSpeak()
  const { data } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle'), ...live })
  const people = buildPeople(data?.contacts ?? [], data?.members ?? [])

  return (
    <main className="cercle-kid">
      <h1 className="cercle-kid__title">{t.cercle.whoIsThis}</h1>
      {people.length === 0 ? (
        <p className="feed-empty">{t.cercle.empty}</p>
      ) : (
        <>
          <p className="cercle-kid__hint mono">{t.cercle.tapToHear}</p>
          <div className="cercle-kid__grid">
            {people.map((p) => (
              <button type="button" key={p.key} className="cercle-kid__card" onClick={() => speak(p.firstName)}>
                <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={p.colour} name={p.firstName} size={120} />
                <span className="cercle-kid__name">{p.firstName}</span>
                <Icon name="speaker-high-bold" size={20} color={ACCENT} />
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
