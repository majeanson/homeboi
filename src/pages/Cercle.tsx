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
import { CERCLE_KEY, HOUSEHOLD_KEY } from '../lib/queryKeys'
import { Loading, PairPrompt } from '../components/Fallback'
import { EmptyState } from '../components/EmptyState'
import { HubHead } from '../components/HubHead'
import { SectionIntro } from '../components/SectionIntro'
import { Avatar } from '../components/Avatar'
import { Icon, InlineIcon, type IconName } from '../components/Icon'
import { useSpeak } from '../lib/speak'
import { fold } from '../lib/normalize'
import { downloadVCard } from '../lib/vcard'
import { CercleEgo } from '../components/cercle/CercleEgo'
import { CercleTree } from '../components/cercle/CercleTree'
import { GroupForm, type GroupFormValue } from '../components/cercle/GroupForm'
import {
  type Contact,
  type ContactLink,
  type Member,
  type Person,
  type RelationshipType,
  type ContactGroupRaw,
  type ContactGroup,
  buildGroups,
  unifyCircle,
  personKey,
  detectFamilyGroups,
  closedLinks,
  relPriority,
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
    // Most salient tie first (immediate family → extended → social), so a one-line
    // row surfaces "Enfant · Jérémie" over a derived cousin.
    .sort((a, b) => relPriority(a.rel) - relPriority(b.rel))
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
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)

  const { data, error } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle'), ...live })
  // The household name (set in Réglages) titles the Maisonnée family card below. Same
  // query key as HouseholdNameField, so a rename there refreshes here reactively.
  const { data: household } = useQuery({ queryKey: HOUSEHOLD_KEY, queryFn: () => api<{ name: string }>('household') })

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
  // Relationship CLOSURE: derive implied family ties (siblings share parents +
  // grandparents, parent-of-parent = grandparent, aunt/uncle, cousins) so a tie
  // added at one point propagates to the whole family. Display + tree + ego read
  // this richer set; grouping keeps raw links (the closure doesn't change connectivity).
  const links = useMemo(() => closedLinks(unified.people, unified.links), [unified])
  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people])
  const contactsById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])

  // The Maisonnée IS your one family: every household member, in a single card
  // titled with the household name from Réglages (auto-synced). It supersedes both
  // the auto-detected family clone and any hand-built group that's just the
  // household, so the same faces never scatter across two cards.
  const householdName = household?.name?.trim() || t.cercle.memberBadge
  const householdPeople = useMemo(
    () => people.filter((p) => p.kind === 'member').sort((a, b) => a.name.localeCompare(b.name, lang)),
    [people, lang],
  )
  const householdKeys = useMemo(() => new Set(householdPeople.map((p) => p.key)), [householdPeople])

  // Named explicit groups (phase 3) — but hide any FAMILY group whose every member
  // is a household member: it's redundant with the Maisonnée card above (a group
  // that also includes outsiders, e.g. an extended family, still shows).
  const allNamedGroups = useMemo(() => buildGroups(unified.groups), [unified])
  const namedGroups = useMemo(
    () =>
      allNamedGroups.filter(
        (g) => g.memberKeys.size === 0 || g.kind !== 'family' || ![...g.memberKeys].every((k) => householdKeys.has(k)),
      ),
    [allNamedGroups, householdKeys],
  )

  // Auto-detected family groups (Union-Find over family edges), over people NOT
  // already shown in a card: not the Maisonnée, and not a named FAMILY group you
  // built by hand — otherwise the one big transitive "Famille X" clone duplicates
  // every face you've already organised into a group.
  const namedFamilyKeys = useMemo(
    () => new Set(namedGroups.filter((g) => g.kind === 'family').flatMap((g) => [...g.memberKeys])),
    [namedGroups],
  )
  const familyPeople = useMemo(
    () => people.filter((p) => !householdKeys.has(p.key) && !namedFamilyKeys.has(p.key)),
    [people, householdKeys, namedFamilyKeys],
  )
  const familyGroups = useMemo(
    () => detectFamilyGroups(familyPeople, links, (name) => (name ? t.cercle.familyOf(name) : t.cercle.familyGeneric)),
    [familyPeople, links, t],
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

  // Keys already shown: the Maisonnée, a named group, or an auto-detected family.
  const namedGroupedKeys = useMemo(() => new Set(namedGroups.flatMap((g) => [...g.memberKeys])), [namedGroups])
  const familyGroupedKeys = useMemo(() => new Set(familyGroups.flatMap((g) => [...g.memberKeys])), [familyGroups])
  const others = useMemo(
    () =>
      people
        .filter((p) => !householdKeys.has(p.key) && !namedGroupedKeys.has(p.key) && !familyGroupedKeys.has(p.key))
        .sort((a, b) => a.name.localeCompare(b.name, lang)),
    [people, householdKeys, namedGroupedKeys, familyGroupedKeys, lang],
  )

  if (isUnauthorized(error)) return <PairPrompt />
  if (!data && !error) return <Loading />

  const openPerson = (p: Person) => {
    const relations = relationsOf(p.key, links, byKey, lang)
    // Seed a brand-new family with THIS person, so a family can grow out of anyone.
    const buildFamilyHref = `/cercle/family/new?seed=${encodeURIComponent(p.key)}`
    // Tappable group chips: every named group + whether this person is in it. Toggle
    // adds/removes membership inline (POST/DELETE the pivot), scoped to this person.
    const groupToggle = namedGroups.length
      ? {
          options: namedGroups.map((g) => ({ id: g.id, label: g.name, on: g.memberKeys.has(p.key) })),
          onToggle: (groupId: string, on: boolean) => {
            void write('cercle-groups', {
              method: on ? 'POST' : 'DELETE',
              body: { groupId, personId: p.id, personKind: p.kind },
              affectedKeys: [CERCLE_KEY],
            }).catch(() => {})
          },
        }
      : undefined
    if (p.kind === 'contact') {
      const c = contactsById.get(p.id)
      if (!c) return
      detail.open(buildContact(c, { t, lang, members: [] }, { accent: ACCENT, relations, groupToggle, onEdit: () => nav(`/cercle/person/${c.id}`), onExport: () => downloadVCard(c), buildFamilyHref }))
    } else {
      detail.open(buildMemberPerson(p, { t, lang, members: [] }, { relations, groupToggle, onDetail: () => openSheet({ id: p.id, name: p.name }), buildFamilyHref }))
    }
  }

  async function createGroup(v: GroupFormValue) {
    await write('cercle-groups', {
      method: 'POST',
      body: { name: v.name, kind: v.kind, colour: v.colour },
      affectedKeys: [CERCLE_KEY],
    })
    setAddingGroup(false)
  }

  async function saveGroupEdit(id: string, v: GroupFormValue) {
    await write('cercle-groups', {
      method: 'PATCH',
      body: { id, name: v.name, kind: v.kind, colour: v.colour },
      affectedKeys: [CERCLE_KEY],
    })
    setEditingGroupId(null)
  }

  async function deleteGroup(g: ContactGroup) {
    if (!(await confirm({ message: t.cercle.deleteGroupConfirm, tone: 'danger' }))) return
    await write('cercle-groups', { method: 'DELETE', body: { id: g.id }, affectedKeys: [CERCLE_KEY] })
  }

  const Row = ({ p, hideBadge }: { p: Person; hideBadge?: boolean }) => {
    const rels = relationsOf(p.key, links, byKey, lang)
    const bday = p.birthday ? formatBirthday(p.birthday, lang) : null
    const myGroups = namedGroups.filter((g) => g.memberKeys.has(p.key))
    const groupNames = myGroups.map((g) => g.name).join(', ')
    const sub = rels[0] ?? bday ?? (groupNames || null)
    return (
      <div className="cercle-row">
        <button type="button" className="cercle-row__open" onClick={() => openPerson(p)}>
          <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={p.colour} name={p.firstName} size={48} />
          <span className="cercle-row__main">
            <span className="cercle-row__name">{p.name}</span>
            {sub && <span className="cercle-row__sub mono">{sub}</span>}
          </span>
        </button>
        {/* Quick reach — call / write without opening the peek (only when known). */}
        {p.phone && (
          <a className="cercle-row__quick" href={`tel:${p.phone}`} aria-label={t.cercle.call} title={t.cercle.call}>
            <InlineIcon name="phone-bold" size={16} />
          </a>
        )}
        {p.email && (
          <a className="cercle-row__quick" href={`mailto:${p.email}`} aria-label={t.cercle.write} title={t.cercle.write}>
            <InlineIcon name="envelope-bold" size={16} />
          </a>
        )}
        {p.kind === 'member' && !hideBadge && <span className="cercle-row__badge mono">{t.cercle.memberBadge}</span>}
      </div>
    )
  }

  // Accent-insensitive search over name AND first/last name — so a contact saved
  // under a nickname still surfaces by their real name (and "Lea" finds "Léa").
  const needle = fold(query.trim())
  const filtered = needle
    ? people.filter((p) => fold(`${p.name} ${p.firstName} ${p.lastName}`).includes(needle))
    : null

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

              {!needle && birthdays.length > 0 && (
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
                  {filtered.length === 0 ? <EmptyState>{t.cercle.empty}</EmptyState> : filtered.map((p) => <Row key={p.key} p={p} />)}
                </section>
              ) : (
                <>
                  {/* The Maisonnée — your one family, titled from Réglages. Always at
                      the top; badge is dropped per-row since the whole card IS it. */}
                  {householdPeople.length > 0 && (
                    <section className="cercle-group cercle-group--named cercle-group--household">
                      <h2 className="cercle-section__label">
                        <span className="cercle-group__dot" style={{ background: ACCENT }} />
                        {householdName}
                        <span className="mono cercle-group__kind">{t.cercle.memberBadge}</span>
                        {/* Wire up who's whose parent/sibling/spouse — links only,
                            no redundant group (the household already IS this card). */}
                        <button
                          type="button"
                          className="row-actions__btn"
                          aria-label={t.cercle.familyDefineLinks}
                          title={t.cercle.familyDefineLinks}
                          onClick={() =>
                            nav(`/cercle/family/new?linksOnly=1&seed=${encodeURIComponent(householdPeople.map((p) => p.key).join(','))}`)
                          }
                        >
                          <InlineIcon name="tree-bold" size={12} />
                        </button>
                      </h2>
                      {householdPeople.map((p) => (
                        <Row key={p.key} p={p} hideBadge />
                      ))}
                    </section>
                  )}

                  {/* Named explicit groups */}
                  {namedGroups.map((g) => (
                    <section key={g.id} className="cercle-group cercle-group--named">
                      {editingGroupId === g.id ? (
                        <GroupForm
                          initial={{ name: g.name, kind: g.kind, colour: g.colour ?? '' }}
                          submitLabel={t.common.save}
                          onSubmit={(v) => saveGroupEdit(g.id, v)}
                          onCancel={() => setEditingGroupId(null)}
                        />
                      ) : (
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
                            className="row-actions__btn"
                            aria-label={t.cercle.editGroup}
                            onClick={() => setEditingGroupId(g.id)}
                          >
                            <InlineIcon name="pencil-simple-bold" size={12} />
                          </button>
                          <button
                            type="button"
                            className="row-actions__btn cercle-group__delete"
                            aria-label={t.cercle.deleteGroup}
                            onClick={() => deleteGroup(g)}
                          >
                            <InlineIcon name="x-bold" size={12} />
                          </button>
                        </h2>
                      )}
                      {[...g.memberKeys]
                        .map((k) => byKey.get(k))
                        .filter((p): p is Person => !!p)
                        .sort((a, b) => a.name.localeCompare(b.name, lang))
                        .map((p) => <Row key={p.key} p={p} />)}
                      {g.memberKeys.size === 0 && (
                        <EmptyState className="cercle-group__empty">{t.cercle.groupEmpty}</EmptyState>
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
                      {(householdPeople.length > 0 || namedGroups.length > 0 || familyGroups.length > 0) && (
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
                      <GroupForm submitLabel={t.cercle.addGroup} onSubmit={createGroup} onCancel={() => setAddingGroup(false)} />
                    ) : (
                      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAddingGroup(true)}>
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
  // Same relationship closure as the parent view, so a toddler tapping a face sees
  // ALL their family (a grandparent linked once shows for every grandchild).
  const links = useMemo(() => closedLinks(unified.people, unified.links), [unified])
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
        <EmptyState>{t.cercle.empty}</EmptyState>
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
