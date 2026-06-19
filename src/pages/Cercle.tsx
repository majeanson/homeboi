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
import { useWrite } from '../lib/write'
import { useConfirm } from '../lib/confirm'
import { useOpenPersonSheet } from '../lib/personSheet'
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
  type RelationshipType,
  type ContactGroupRaw,
  type ContactGroup,
  type GroupKind,
  buildGroups,
  unifyCircle,
  personKey,
  detectFamilyGroups,
  daysUntilBirthday,
  formatBirthday,
  genderedRelLabel,
} from '../lib/cercle'

const ACCENT = '#C45E86' // the cercle tab's rose

interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
  groups: ContactGroupRaw[]
}

type View = 'list' | 'links' | 'tree'
const VIEW_ICON: Record<View, IconName> = { list: 'user-bold', links: 'users-three-bold', tree: 'tree-bold' }

// « Le cercle » — the household people directory + relationship views. Parent:
// Liste (calm grouped directory, the default + accessible), Liens (tap-to-focus ego
// view) and Arbre (generational family tree). Toddler: a faces grid, tap to hear
// the name and see relationships. Members (the household faces) AND contacts are
// unified "people".
export function Cercle() {
  const { audience } = useAudience()
  if (audience === 'toddler') return <CircleKidView />
  return <CercleParent />
}

// A person's relationships, resolved FROM THEIR perspective → display strings
// ("Mère · Léa" = "[this person] est la mère de Léa"). Works over composite person
// keys (contacts + members). The relation type describes the SUBJECT (the person
// whose list this is), so it's gendered by the SUBJECT's gender — NOT the other
// person's (a female subject who is a parent is "Mère", regardless of the child's sex).
function relationsOf(key: string, links: ContactLink[], byKey: Map<string, Person>, lang: 'fr' | 'en'): string[] {
  const subjectGender = byKey.get(key)?.gender ?? null
  return links
    .map((l) => {
      const aKey = personKey(l.personAKind, l.personAId)
      const bKey = personKey(l.personBKind, l.personBId)
      if (aKey === key) return { rel: l.type, other: bKey }
      if (bKey === key) return { rel: l.reverseType, other: aKey }
      return null
    })
    .filter((x): x is { rel: ContactLink['type']; other: string } => !!x)
    .map((r) => `${genderedRelLabel(r.rel, subjectGender, lang)} · ${byKey.get(r.other)?.name ?? '—'}`)
}

function CercleParent() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const detail = useEntityDetail()
  const write = useWrite()
  const confirm = useConfirm()
  const openSheet = useOpenPersonSheet()
  const [view, setView] = useTabParam<View>('view', 'list', ['list', 'links', 'tree'])
  const [query, setQuery] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupKind, setNewGroupKind] = useState<GroupKind>('other')

  const { data, error } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle'), ...live })

  const contacts = useMemo(() => data?.contacts ?? [], [data])
  const members = useMemo(() => data?.members ?? [], [data])
  const rawLinks = useMemo(() => data?.links ?? [], [data])
  const rawGroups = useMemo(() => data?.groups ?? [], [data])
  // Collapse each member + its hard-linked contact into ONE person (and remap that
  // contact's links/groups onto the member) so nobody shows up twice.
  const unified = useMemo(
    () => unifyCircle(contacts, members, rawLinks, rawGroups),
    [contacts, members, rawLinks, rawGroups],
  )
  const people = unified.people
  const links = unified.links
  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people])
  const contactsById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])

  // Named explicit groups (phase 3)
  const namedGroups = useMemo(() => buildGroups(unified.groups), [unified])

  // Auto-detected family groups (Union-Find over family edges)
  const familyGroups = useMemo(
    () => detectFamilyGroups(people, links, (name) => (name ? t.cercle.familyOf(name) : t.cercle.familyGeneric)),
    [people, links, t],
  )

  // Upcoming birthdays — contacts AND members (now members carry birthday too)
  const birthdays = useMemo(
    () =>
      people
        .map((p) => ({ p, days: daysUntilBirthday(p.birthday) }))
        .filter((b): b is { p: Person; days: number } => b.days != null && b.days <= 31)
        .sort((a, b) => a.days - b.days),
    [people],
  )

  // Keys that belong to at least one named group or auto-detected family group
  const namedGroupedKeys = useMemo(() => new Set(namedGroups.flatMap((g) => [...g.memberKeys])), [namedGroups])
  const familyGroupedKeys = useMemo(() => new Set(familyGroups.flatMap((g) => [...g.memberKeys])), [familyGroups])
  const others = useMemo(
    () =>
      people
        .filter((p) => !namedGroupedKeys.has(p.key) && !familyGroupedKeys.has(p.key))
        .sort((a, b) => a.name.localeCompare(b.name, lang)),
    [people, namedGroupedKeys, familyGroupedKeys, lang],
  )

  if (isUnauthorized(error)) return <PairPrompt />
  if (!data && !error) return <Loading />

  const openPerson = (p: Person) => {
    const relations = relationsOf(p.key, links, byKey, lang)
    const groupNames = namedGroups.filter((g) => g.memberKeys.has(p.key)).map((g) => g.name)
    if (p.kind === 'contact') {
      const c = contactsById.get(p.id)
      if (!c) return
      detail.open(buildContact(c, { t, lang, members: [] }, { accent: ACCENT, relations, groups: groupNames, onEdit: () => nav(`/cercle/person/${c.id}`) }))
    } else {
      detail.open(buildMemberPerson(p, { t, lang, members: [] }, { relations, onDetail: () => openSheet({ id: p.id, name: p.name }) }))
    }
  }

  async function createGroup() {
    if (!newGroupName.trim()) return
    await write('cercle-groups', {
      method: 'POST',
      body: { name: newGroupName.trim(), kind: newGroupKind },
      affectedKeys: [CERCLE_KEY],
    })
    setNewGroupName('')
    setAddingGroup(false)
  }

  async function deleteGroup(g: ContactGroup) {
    if (!(await confirm({ message: t.cercle.deleteGroupConfirm, tone: 'danger' }))) return
    await write('cercle-groups', { method: 'DELETE', body: { id: g.id }, affectedKeys: [CERCLE_KEY] })
  }

  const Row = ({ p }: { p: Person }) => {
    const rels = relationsOf(p.key, links, byKey, lang)
    const bday = p.birthday ? formatBirthday(p.birthday, lang) : null
    const myGroups = namedGroups.filter((g) => g.memberKeys.has(p.key))
    const groupNames = myGroups.map((g) => g.name).join(', ')
    const sub = rels[0] ?? bday ?? (groupNames || null)
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
      <HubHead title={t.nav.cercle} icon="users-three-bold" iconColor={ACCENT} background="var(--berry-wash)" card="cercle" />

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
                  {/* Named explicit groups */}
                  {namedGroups.map((g) => (
                    <section key={g.id} className="cercle-group cercle-group--named">
                      <h2 className="cercle-section__label">
                        <span className="cercle-group__dot" style={{ background: g.colour ?? ACCENT }} />
                        {g.name}
                        <span className="mono cercle-group__kind">{t.cercle.groupKinds[g.kind]}</span>
                        {g.kind === 'family' && (
                          <button
                            type="button"
                            className="row-actions__btn"
                            aria-label={t.cercle.familyEditBuilder}
                            onClick={() => nav(`/cercle/family/${g.id}`)}
                          >
                            <InlineIcon name="tree-bold" size={12} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="row-actions__btn cercle-group__delete"
                          aria-label={t.cercle.deleteGroup}
                          onClick={() => deleteGroup(g)}
                        >
                          <InlineIcon name="x-bold" size={12} />
                        </button>
                      </h2>
                      {[...g.memberKeys]
                        .map((k) => byKey.get(k))
                        .filter((p): p is Person => !!p)
                        .sort((a, b) => a.name.localeCompare(b.name, lang))
                        .map((p) => <Row key={p.key} p={p} />)}
                      {g.memberKeys.size === 0 && (
                        <p className="feed-empty mono cercle-group__empty">{t.cercle.groupEmpty}</p>
                      )}
                    </section>
                  ))}

                  {/* Auto-detected family groups */}
                  {familyGroups.map((g) => (
                    <section key={g.id} className="cercle-group">
                      <h2 className="cercle-section__label">
                        <InlineIcon name="users-three-bold" size={16} color={ACCENT} /> {g.name}
                      </h2>
                      {[...g.memberKeys]
                        .map((k) => byKey.get(k))
                        .filter((p): p is Person => !!p)
                        .sort((a, b) => a.name.localeCompare(b.name, lang))
                        .map((p) => <Row key={p.key} p={p} />)}
                    </section>
                  ))}

                  {/* People in no group */}
                  {others.length > 0 && (
                    <section className="cercle-group">
                      {(namedGroups.length > 0 || familyGroups.length > 0) && (
                        <h2 className="cercle-section__label">{t.cercle.others}</h2>
                      )}
                      {others.map((p) => <Row key={p.key} p={p} />)}
                    </section>
                  )}

                  {/* Build a whole family's relationships at once */}
                  <button type="button" className="btn cercle-build-family" onClick={() => nav('/cercle/family/new')}>
                    <InlineIcon name="tree-bold" size={15} /> {t.cercle.familyBuild}
                  </button>

                  {/* Create new named group */}
                  <div className="cercle-add-group">
                    {addingGroup ? (
                      <div className="cercle-new-group">
                        <input
                          className="input"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder={t.cercle.groupName}
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && createGroup()}
                        />
                        <select
                          className="cf__input"
                          value={newGroupKind}
                          onChange={(e) => setNewGroupKind(e.target.value as GroupKind)}
                        >
                          {(['family', 'friends', 'work', 'other'] as GroupKind[]).map((k) => (
                            <option key={k} value={k}>
                              {t.cercle.groupKinds[k]}
                            </option>
                          ))}
                        </select>
                        <div className="lc__actions">
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            disabled={!newGroupName.trim()}
                            onClick={createGroup}
                          >
                            <InlineIcon name="check-bold" size={13} /> {t.cercle.addGroup}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setAddingGroup(false)}
                          >
                            {t.common.cancel}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
                        onClick={() => setAddingGroup(true)}
                      >
                        <InlineIcon name="plus-bold" size={14} /> {t.cercle.addGroup}
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}

// Toddler lens: a faces grid of EVERYONE (members + contacts). Tap a face →
// hear the name AND flip to a relationship panel showing their direct connections.
// No view switch, no add/edit (one-way door).
function CircleKidView() {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  const [focused, setFocused] = useState<Person | null>(null)
  const { data } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle'), ...live })

  const contacts = data?.contacts ?? []
  const members = data?.members ?? []
  const rawLinks = data?.links ?? []
  // Same dedup as the parent view: a member + its linked contact are one face.
  const unified = useMemo(() => unifyCircle(contacts, members, rawLinks, []), [contacts, members, rawLinks])
  const people = unified.people
  const links = unified.links
  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people])

  function tap(p: Person) {
    speak(p.firstName)
    setFocused(p)
  }

  function speakRel(rel: RelationshipType, other: Person) {
    // Each card shows the OTHER person; the label is THEIR role toward the focused
    // child ("Papa" → Père), so it's gendered by that other person.
    speak(t.cercle.kidRelSpeak(genderedRelLabel(rel, other.gender, lang), other.firstName))
  }

  const kidRels = useMemo(() => {
    if (!focused) return []
    // Each entry is a card for the OTHER person, labelled with how THEY relate to the
    // focused child — i.e. the link read from the other person's side (the inverse of
    // the focused child's own role), so a tapped "Papa" reads as "Père", not "Fils".
    return links
      .map((l) => {
        const aKey = personKey(l.personAKind, l.personAId)
        const bKey = personKey(l.personBKind, l.personBId)
        if (aKey === focused.key) return { rel: l.reverseType as RelationshipType, other: byKey.get(bKey) }
        if (bKey === focused.key) return { rel: l.type as RelationshipType, other: byKey.get(aKey) }
        return null
      })
      .filter((x): x is { rel: RelationshipType; other: Person } => !!x && !!x.other)
  }, [focused, links, byKey])

  if (focused) {
    return (
      <main className="cercle-kid cercle-kid--focused">
        <button type="button" className="cercle-kid__back mono" onClick={() => setFocused(null)}>
          ← {t.cercle.kidRelBack}
        </button>
        <div className="cercle-kid__hero">
          <Avatar kind={focused.avatarKind} photo={focused.avatarRef} colour={focused.colour} name={focused.firstName} size={140} />
          <span className="cercle-kid__name">{focused.firstName}</span>
        </div>
        {kidRels.length > 0 ? (
          <>
            <p className="cercle-kid__hint mono">{t.cercle.kidRelWith(focused.firstName)}</p>
            <div className="cercle-kid__rels">
              {kidRels.map(({ rel, other }, i) => (
                <button type="button" key={i} className="cercle-kid__rel-card" onClick={() => speakRel(rel, other)}>
                  <Avatar kind={other.avatarKind} photo={other.avatarRef} colour={other.colour} name={other.firstName} size={80} />
                  <span className="cercle-kid__rel-name">{other.firstName}</span>
                  <span className="cercle-kid__rel-label mono">{genderedRelLabel(rel, other.gender, lang)}</span>
                  <Icon name="speaker-high-bold" size={16} color={ACCENT} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="cercle-kid__hint mono">{t.cercle.noRelationships}</p>
        )}
      </main>
    )
  }

  return (
    <main className="cercle-kid">
      <h1 className="cercle-kid__title">{t.cercle.whoIsThis}</h1>
      {people.length === 0 ? (
        <p className="feed-empty">{t.cercle.empty}</p>
      ) : (
        <>
          <p className="cercle-kid__hint mono">{t.cercle.tapForFamily}</p>
          <div className="cercle-kid__grid">
            {people.map((p) => (
              <button type="button" key={p.key} className="cercle-kid__card" onClick={() => tap(p)}>
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
