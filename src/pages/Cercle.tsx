import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useSurface } from '../lib/surface'
import { useTabParam } from '../lib/tabParam'
import { useEntityDetail } from '../components/detail/DetailProvider'
import { buildContact, buildMemberPerson } from '../components/detail/adapters'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { useWrite } from '../lib/write'
import { useConfirm } from '../lib/confirm'
import { useRecordUndo } from '../lib/toast'
import { usePointerDnd, DragGhost } from '../lib/dnd'
import { isGuest } from '../lib/device'
import { useOpenPersonSheet } from '../lib/personSheet'
import { CERCLE_KEY, HOUSEHOLD_KEY } from '../lib/queryKeys'
import { Loading, PairPrompt } from '../components/Fallback'
import { EmptyState } from '../components/EmptyState'
import { HubHead } from '../components/HubHead'
import { SectionIntro } from '../components/SectionIntro'
import { Avatar } from '../components/Avatar'
import { Icon, InlineIcon, type IconName } from '../components/Icon'
import { useSpeak } from '../lib/speak'
import { downloadVCard } from '../lib/vcard'
import { CercleEgo } from '../components/cercle/CercleEgo'
import { CercleTree } from '../components/cercle/CercleTree'
import { CercleWeb } from '../components/cercle/CercleWeb'
import { GroupForm, type GroupFormValue } from '../components/cercle/GroupForm'
import { ConnectPeople } from '../components/cercle/ConnectPeople'
import { CercleNotes } from '../components/cercle/CercleNotes'
import { BusinessesTab } from '../components/cercle/BusinessesTab'
import { SubTabs } from '../components/SubTabs'
import { MemberSwitcher } from '../components/MemberSwitcher'
import { FaceSelect } from '../components/FaceSelect'
import { Modal } from '../components/Modal'
import { imgUrl } from '../lib/image'
import { useHelpMode, HelpToggle, HelpHint, HelpTitle } from '../lib/helpMode'
import { CERCLE_HELP } from '../lib/cercleHelp'
import {
  type Contact,
  type ContactLink,
  type Member,
  type Person,
  type RelationshipType,
  type ContactGroupRaw,
  type ContactGroup,
  buildGroups,
  friendLinksFromGroups,
  buildFamilyGrouping,
  unifyCircle,
  personKey,
  detectFamilyGroups,
  closedLinks,
  relPriority,
  daysUntilBirthday,
  formatBirthday,
  genderedRelLabel,
} from '../lib/cercle'

const ACCENT = '#2A8F85' // the cercle tab's turquoise (matches CATS.cercle.deep + the nav)

interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
  groups: ContactGroupRaw[]
}

type View = 'list' | 'links' | 'tree'
const VIEW_ICON: Record<View, IconName> = { list: 'user-bold', links: 'users-three-bold', tree: 'tree-bold' }
// The primary split: Famille (Maisonnée + families) vs Social (friends/work/other
// groups + ungrouped people) vs Notes (the durable quick-notes board, CercleNotes).
// The list body partitions People by the first two; Notes owns its whole body; the
// relationship views (Liens/Arbre) follow the same split — Famille shows the family
// set, Social shows everyone outside it (see `sectionPeople`).
type Section = 'social' | 'family' | 'notes' | 'business'
const SECTION_ICON: Record<Section, IconName> = {
  family: 'users-three-bold',
  social: 'user-bold',
  notes: 'file-text-bold',
  business: 'storefront-bold',
}

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

// `fromKey`'s role TOWARD `toKey`, as ONE gendered label ("Fille", "Cousin", …) —
// i.e. how the row person (from) relates to the focused person (to), gendered by the
// row person. Used by the focus lens: with Marc focused, Léa's row reads "Fille"
// (Léa is Marc's daughter). Reads the same closed link set as relationsOf, so derived
// ties (grandparent, cousin…) resolve too. The most salient tie wins if several.
function relationTo(
  fromKey: string,
  toKey: string,
  links: ContactLink[],
  byKey: Map<string, Person>,
  lang: 'fr' | 'en',
): string | null {
  const fromGender = byKey.get(fromKey)?.gender ?? null
  let best: RelationshipType | null = null
  for (const l of links) {
    const aKey = personKey(l.personAKind, l.personAId)
    const bKey = personKey(l.personBKind, l.personBId)
    let rel: RelationshipType | null = null
    if (aKey === fromKey && bKey === toKey) rel = l.type
    else if (bKey === fromKey && aKey === toKey) rel = l.reverseType
    if (rel && (best === null || relPriority(rel) < relPriority(best))) best = rel
  }
  return best ? genderedRelLabel(best, fromGender, lang) : null
}

function CercleParent() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const detail = useEntityDetail()
  const write = useWrite()
  const confirm = useConfirm()
  const recordUndo = useRecordUndo()
  const openSheet = useOpenPersonSheet()
  const { surface } = useSurface()
  // A guest is read-only: no drag-to-group affordance (every drop is a write).
  const ro = isGuest()
  const [view, setView] = useTabParam<View>('view', 'list', ['list', 'links', 'tree'])
  // Distinct URL key so it composes with `view` (?section=family&view=list). Famille
  // is the default — the Maisonnée is the heart of the cercle.
  const [section, setSection] = useTabParam<Section>('section', 'family', ['social', 'family', 'notes', 'business'])
  // The "focus lens": pick a household member (the same MemberSwitcher as the board /
  // Notes) to re-read every relationship FROM their perspective — Léa's row becomes
  // "Fille" when Marc is focused. null = Maisonnée (each person's own relations, the
  // default). Drives both the Liste subtitles and the Liens (ego) centre.
  const [focusId, setFocusId] = useState<string | null>(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  // The "Relier deux personnes" connector, opened (optionally seeded with one side)
  // from the ＋ chooser, a person's peek, or a family group header.
  const [connect, setConnect] = useState<{ seedAKey?: string } | null>(null)

  // Contextual help (shared engine): arm the "?" then tap a button/title to learn
  // what it does in place, with a deep-link into the `cercle` guide card.
  const helpLabel = (k: string): string =>
    ({
      social: t.cercle.section.social,
      family: t.cercle.section.family,
      notes: t.cercle.familyNotes.title,
      business: t.cercle.business.title,
      list: t.cercle.view.list,
      links: t.cercle.view.links,
      tree: t.cercle.view.tree,
      search: t.cercle.search,
      birthdays: t.cercle.birthdaysSoon,
      household: t.cercle.memberBadge,
      householdLinks: t.cercle.familyDefineLinks,
      namedGroup: t.cercle.groups,
      familyAuto: t.cercle.familyGeneric,
      groupBuilder: t.cercle.familyEditBuilder,
      groupConnect: t.cercle.connectTwo,
      editGroup: t.cercle.editGroup,
      deleteGroup: t.cercle.deleteGroup,
      others: t.cercle.others,
    })[k] ?? k
  const help = useHelpMode(CERCLE_HELP, helpLabel)

  // The ＋ chooser opens the connect / new-group flows by navigating to /cercle with
  // a ?param (connect/group can't be routes — they're page-local). Read + strip it.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('connect') === '1') setConnect({})
    else if (params.get('add') === 'group') setAddingGroup(true)
    else return
    const next = new URLSearchParams(params)
    next.delete('connect')
    next.delete('add')
    setParams(next, { replace: true })
  }, [params, setParams])

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
  // Co-membership in a « friends »-kind group also implies a friend tie, so people you
  // grouped together surface as friends in Liens without drawing each edge by hand.
  const links = useMemo(() => {
    const groupFriends = friendLinksFromGroups(buildGroups(unified.groups), unified.links)
    return closedLinks(unified.people, [...unified.links, ...groupFriends])
  }, [unified])
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

  // The set of people that read as "family" in Liste — the Maisonnée, any named
  // FAMILY group, and the auto-detected families. The relationship views honour the
  // Famille / Social split off this: Famille shows these, Social shows everyone else
  // (so the social graph isn't drowned out by the family).
  const familyKeySet = useMemo(() => {
    const s = new Set<string>(householdKeys)
    for (const g of namedGroups) if (g.kind === 'family') for (const k of g.memberKeys) s.add(k)
    for (const g of familyGroups) for (const k of g.memberKeys) s.add(k)
    return s
  }, [householdKeys, namedGroups, familyGroups])

  // People for the active section's Liens/Arbre: Famille → the family set, Social →
  // the rest. The views (CercleEgo/CercleTree) build their own byKey off this list,
  // so any link to a filtered-out person is simply dropped — no separate link filter.
  const sectionPeople = useMemo(
    () => (section === 'family' ? people.filter((p) => familyKeySet.has(p.key)) : people.filter((p) => !familyKeySet.has(p.key))),
    [people, familyKeySet, section],
  )

  // Per-person family grouping shared by BOTH relationship views (Liens + Arbre):
  // the cluster a person sits in + the disc colour (reusing the directory's family
  // colours). One helper so the two views never drift. See buildFamilyGrouping.
  const grouping = useMemo(
    () => buildFamilyGrouping(householdKeys, namedGroups, familyGroups),
    [householdKeys, namedGroups, familyGroups],
  )

  // The focus lens, resolved: the focused member's person key + display name. A
  // member deleted while focused silently falls back to Maisonnée (no match).
  const focusMember = focusId ? members.find((m) => m.id === focusId) ?? null : null
  const focusKey = focusMember ? personKey('member', focusMember.id) : null
  const focusName = focusMember?.displayName ?? null

  // Drag a person row (the ⠿ grip) onto a named-group section to add them to it.
  // The drag id is the person key; the drop zone is `group:<id>`. On drop the row
  // takes the group's colour automatically (see `groupColour` on Row), and an undo
  // toast offers the inverse. canDrop greys out a group the person is already in.
  const groupForZone = (zone: string) =>
    zone.startsWith('group:') ? namedGroups.find((g) => g.id === zone.slice('group:'.length)) : undefined
  const dnd = usePointerDnd({
    onDrop: (pkey, zone) => {
      const g = groupForZone(zone)
      const p = byKey.get(pkey)
      if (!g || !p || g.memberKeys.has(pkey)) return
      const body = { groupId: g.id, personId: p.id, personKind: p.kind }
      void write('cercle-groups', { method: 'POST', body, affectedKeys: [CERCLE_KEY] }).catch(() => {})
      recordUndo({
        message: t.cercle.droppedInGroup(p.firstName, g.name),
        onUndo: () => {
          void write('cercle-groups', { method: 'DELETE', body, affectedKeys: [CERCLE_KEY] }).catch(() => {})
        },
      })
    },
    canDrop: (pkey, zone) => {
      const g = groupForZone(zone)
      return !!g && !g.memberKeys.has(pkey)
    },
  })

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
    // "Relier à quelqu'un" — open the connector seeded with this person as side A.
    const onConnect = () => setConnect({ seedAKey: p.key })
    if (p.kind === 'contact') {
      const c = contactsById.get(p.id)
      if (!c) return
      detail.open(buildContact(c, { t, lang, members: [] }, { accent: ACCENT, relations, groupToggle, onEdit: () => nav(`/cercle/person/${c.id}`), onExport: () => downloadVCard(c), onConnect, buildFamilyHref }))
    } else {
      detail.open(buildMemberPerson(p, { t, lang, members: [] }, { relations, groupToggle, onDetail: () => openSheet({ id: p.id, name: p.name }), onConnect, buildFamilyHref }))
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

  // `groupColour` tints the initials-disc of any member WITHOUT a photo with the
  // group's colour, so a coloured family reads as one block even before everyone
  // has a face. A member's own photo always wins; their own colour falls back when
  // the group has none.
  const Row = ({ p, hideBadge, groupColour }: { p: Person; hideBadge?: boolean; groupColour?: string | null }) => {
    const rels = relationsOf(p.key, links, byKey, lang)
    const bday = p.birthday ? formatBirthday(p.birthday, lang) : null
    const myGroups = namedGroups.filter((g) => g.memberKeys.has(p.key))
    const groupNames = myGroups.map((g) => g.name).join(', ')
    // Focus lens: when a member is picked, the subtitle reads this person's relation
    // TO the focused member ("Fille", "Cousin"), gendered by this person — the focused
    // member's own row says so, an unrelated person shows "no known link". Maisonnée
    // (no focus) keeps the default (their own most-salient relation / birthday / group).
    const sub = focusKey
      ? p.key === focusKey
        ? t.cercle.focusSelf
        : relationTo(p.key, focusKey, links, byKey, lang) ?? t.cercle.focusNone
      : rels[0] ?? bday ?? (groupNames || null)
    return (
      <div className={'cercle-row' + (dnd.activeId === p.key ? ' is-dragging' : '')}>
        {/* Drag this person into a named group — the row then takes the group's
            colour. Touch-friendly grip (touch-action:none) so a tap still opens the
            peek; hidden for a read-only guest. */}
        {!ro && (
          <span
            className="dnd-grip cercle-row__grip"
            data-dnd-grip=""
            role="button"
            aria-label={t.cercle.dragToGroup}
            title={t.cercle.dragToGroup}
            onPointerDown={(e) => dnd.start(p.key, p.name, e)}
          >
            ⠿
          </span>
        )}
        <button type="button" className="cercle-row__open" onClick={() => openPerson(p)}>
          <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={groupColour ?? p.colour} name={p.firstName} size={48} />
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


  const viewSwitch = (
    <>
      {/* The Liste · Liens · Arbre sub-tabs reuse the app-wide segmented control
          (SubTabs / .subtabs, same as La cuisine's Repas · Garde-manger · Recettes). */}
      <SubTabs<View>
        options={(['list', 'links', 'tree'] as View[]).map((v) => ({
          key: v,
          label: t.cercle.view[v],
          icon: VIEW_ICON[v],
        }))}
        value={view}
        onSelect={setView}
        pick={help.pick}
        armed={help.active}
        ariaLabel={t.nav.cercle}
        tour="cercle-views"
        trailing={help.available && <HelpToggle active={help.active} onToggle={help.toggle} />}
      />
      {help.hint && <HelpHint />}
      {help.bubbleFor('list')}
      {help.bubbleFor('links')}
      {help.bubbleFor('tree')}
    </>
  )

  // Primary Famille / Social / Notes split — the dominant control above the view switch.
  const sectionSwitch = (
    <>
      <div className="cercle-sectionswitch" role="tablist" aria-label={t.nav.cercle}>
        {(['family', 'social', 'notes', 'business'] as Section[]).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={section === s}
            className={'cercle-sectionswitch__btn' + (section === s ? ' is-active' : '')}
            onClick={help.pick(s, () => setSection(s))}
          >
            <InlineIcon name={SECTION_ICON[s]} size={16} /> {t.cercle.section[s]}
          </button>
        ))}
      </div>
      {help.bubbleFor('social')}
      {help.bubbleFor('family')}
    </>
  )

  return (
    <main className={'today-feed cercle' + (help.active ? ' help-armed' : '')}>
      <HubHead title={t.nav.cercle} icon="users-three-bold" iconColor={ACCENT} background="var(--teal-wash)" card="cercle" />

      {/* The connector — a modal so it's prominent from any entry point (the ＋
          chooser, a person's peek, a family group header). */}
      <Modal open={!!connect} onClose={() => setConnect(null)} title={t.cercle.connectTwo}>
        <ConnectPeople people={people} seedAKey={connect?.seedAKey} onConnected={() => setConnect(null)} />
      </Modal>

      {/* Create a named group — opened from the ＋ chooser (?add=group). */}
      <Modal open={addingGroup} onClose={() => setAddingGroup(false)} title={t.cercle.addGroup}>
        <GroupForm submitLabel={t.cercle.addGroup} onSubmit={createGroup} onCancel={() => setAddingGroup(false)} />
      </Modal>


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
          {sectionSwitch}

          {section === 'notes' ? (
            /* The notes board owns its whole tab body — no people list, no view
               switch (Liens/Arbre are about people, not notes). */
            <CercleNotes members={members} help={help} />
          ) : section === 'business' ? (
            /* Business — a standalone services/vendors directory, ISOLATED from the
               people graph (no view switch, no focus lens, no relationships). */
            <BusinessesTab help={help} />
          ) : (
          <>
          {viewSwitch}

          {/* The Social section shows the WHOLE web at once (clusters for Liens, a
              blob for Arbre) — the single-focus ego view would only show one person's
              circle, and the generational tree is meaningless for friends. Famille
              keeps the focus-driven ego view + the real family tree. */}
          {(() => {
            const showWeb = section === 'social' && view !== 'list'

          return (
          <>
          {/* Focus lens — pick a household member to read the cercle from their
              perspective. The SAME pick-a-face control as the board's "Aujourd'hui"
              header, surface-for-surface: the always-in-view face ROW on a kiosk wall,
              the collapsed tap-to-open chip on mobile (FaceSelect). Not on the tree, nor
              on the Social web (no single centre to read from). */}
          {view !== 'tree' && !showWeb && householdPeople.length > 0 && (() => {
            const faces = householdPeople.map((p) => ({
              id: p.id,
              name: p.firstName,
              colour: p.colour,
              photoUrl: p.avatarKind === 'photo' && p.avatarRef ? imgUrl(p.avatarRef) : null,
            }))
            return (
              <div className="cercle-focus">
                {surface === 'kiosk' ? (
                  <MemberSwitcher faces={faces} value={focusId} onChange={setFocusId} allLabel={t.cercle.memberBadge} ariaLabel={t.cercle.focusLabel} />
                ) : (
                  <FaceSelect faces={faces} value={focusId} onChange={setFocusId} allLabel={t.cercle.memberBadge} ariaLabel={t.cercle.focusLabel} />
                )}
                {focusName && <p className="cercle-focus__hint mono">{t.cercle.focusBy(focusName)}</p>}
              </div>
            )
          })()}

          {showWeb ? (
            <CercleWeb people={sectionPeople} links={links} onOpen={openPerson} grouping={grouping} mode={view === 'links' ? 'clusters' : 'blob'} />
          ) : view === 'links' ? (
            <CercleEgo people={sectionPeople} links={links} onOpen={openPerson} focusKey={focusKey} grouping={grouping} />
          ) : view === 'tree' ? (
            <CercleTree people={sectionPeople} links={links} onOpen={openPerson} grouping={grouping} />
          ) : (
            <>
              <SectionIntro card="cercle" />

              {section === 'family' && birthdays.length > 0 && (
                <section className="cercle-bdays">
                  <HelpTitle help={help} k="birthdays" className="cercle-section__label">
                    <InlineIcon name="cake-bold" size={16} color={ACCENT} /> {t.cercle.birthdaysSoon}
                  </HelpTitle>
                  {help.bubbleFor('birthdays')}
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

              <>
                  {/* The Maisonnée — your one family, titled from Réglages. Always at
                      the top of Famille; badge is dropped per-row since the card IS it. */}
                  {section === 'family' && householdPeople.length > 0 && (
                    <section className="cercle-group cercle-group--named cercle-group--household">
                      <h2 className="cercle-section__label">
                        <span className="cercle-group__dot" style={{ background: ACCENT }} />
                        {help.active ? (
                          <button type="button" className="help-title" onClick={help.pick('household', () => {})}>
                            {householdName}
                          </button>
                        ) : (
                          householdName
                        )}
                        <span className="mono cercle-group__kind">{t.cercle.memberBadge}</span>
                        {/* Wire up who's whose parent/sibling/spouse — links only,
                            no redundant group (the household already IS this card). */}
                        <button
                          type="button"
                          className="row-actions__btn"
                          aria-label={t.cercle.familyDefineLinks}
                          title={t.cercle.familyDefineLinks}
                          onClick={help.pick('householdLinks', () =>
                            nav(`/cercle/family/new?linksOnly=1&seed=${encodeURIComponent(householdPeople.map((p) => p.key).join(','))}`),
                          )}
                        >
                          <InlineIcon name="tree-bold" size={12} />
                        </button>
                      </h2>
                      {help.bubbleFor('household')}
                      {help.bubbleFor('householdLinks')}
                      {householdPeople.map((p) => (
                        <Row key={p.key} p={p} hideBadge />
                      ))}
                    </section>
                  )}

                  {/* Named explicit groups — family-kind under Famille, the rest (amis /
                      travail / autre) under Social. */}
                  {namedGroups
                    .filter((g) => (section === 'family' ? g.kind === 'family' : g.kind !== 'family'))
                    .map((g) => (
                    <section
                      key={g.id}
                      data-dnd-zone={`group:${g.id}`}
                      className={
                        'cercle-group cercle-group--named' +
                        (dnd.over === `group:${g.id}` ? ' dnd-over' : '')
                      }
                    >
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
                          {help.active ? (
                            <button type="button" className="help-title" onClick={help.pick('namedGroup', () => {})}>
                              {g.name}
                            </button>
                          ) : (
                            g.name
                          )}
                          <span className="mono cercle-group__kind">{t.cercle.groupKinds[g.kind]}</span>
                          {g.kind === 'family' && (
                            <>
                              <button
                                type="button"
                                className="row-actions__btn"
                                aria-label={t.cercle.familyEditBuilder}
                                onClick={help.pick('groupBuilder', () => nav(`/cercle/family/${g.id}`))}
                              >
                                <InlineIcon name="tree-bold" size={12} />
                              </button>
                              {/* Connect this family to another person/family in one link. */}
                              <button
                                type="button"
                                className="row-actions__btn"
                                aria-label={t.cercle.connectTwo}
                                onClick={help.pick('groupConnect', () => setConnect({}))}
                              >
                                <InlineIcon name="users-three-bold" size={12} />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="row-actions__btn"
                            aria-label={t.cercle.editGroup}
                            onClick={help.pick('editGroup', () => setEditingGroupId(g.id))}
                          >
                            <InlineIcon name="pencil-simple-bold" size={12} />
                          </button>
                          <button
                            type="button"
                            className="row-actions__btn cercle-group__delete"
                            aria-label={t.cercle.deleteGroup}
                            onClick={help.pick('deleteGroup', () => deleteGroup(g))}
                          >
                            <InlineIcon name="x-bold" size={12} />
                          </button>
                        </h2>
                      )}
                      {help.bubbleFor('namedGroup')}
                      {help.bubbleFor('groupBuilder')}
                      {help.bubbleFor('groupConnect')}
                      {help.bubbleFor('editGroup')}
                      {help.bubbleFor('deleteGroup')}
                      {[...g.memberKeys]
                        .map((k) => byKey.get(k))
                        .filter((p): p is Person => !!p)
                        .sort((a, b) => a.name.localeCompare(b.name, lang))
                        .map((p) => <Row key={p.key} p={p} groupColour={g.colour} />)}
                      {g.memberKeys.size === 0 && (
                        <EmptyState className="cercle-group__empty">{t.cercle.groupEmpty}</EmptyState>
                      )}
                    </section>
                  ))}

                  {/* Auto-detected family groups (Famille only) */}
                  {section === 'family' &&
                    familyGroups.map((g) => (
                      <section key={g.id} className="cercle-group">
                        <HelpTitle help={help} k="familyAuto" className="cercle-section__label">
                          <InlineIcon name="users-three-bold" size={16} color={ACCENT} /> {g.name}
                        </HelpTitle>
                        {help.bubbleFor('familyAuto')}
                        {[...g.memberKeys]
                          .map((k) => byKey.get(k))
                          .filter((p): p is Person => !!p)
                          .sort((a, b) => a.name.localeCompare(b.name, lang))
                          .map((p) => <Row key={p.key} p={p} />)}
                      </section>
                    ))}

                  {/* People in no group (Social) */}
                  {section === 'social' && others.length > 0 && (
                    <section className="cercle-group">
                      {namedGroups.some((g) => g.kind !== 'family') && (
                        <>
                          <HelpTitle help={help} k="others" className="cercle-section__label">
                            {t.cercle.others}
                          </HelpTitle>
                          {help.bubbleFor('others')}
                        </>
                      )}
                      {others.map((p) => <Row key={p.key} p={p} />)}
                    </section>
                  )}

                  {/* Social with nothing in it yet — a calm pointer to the ＋ chooser. */}
                  {section === 'social' && others.length === 0 && !namedGroups.some((g) => g.kind !== 'family') && (
                    <EmptyState guide={{ card: 'cercle' }}>{t.cercle.empty}</EmptyState>
                  )}
                  {/* Creation actions (add person / family / connect / new group) all
                      live on the ＋ chooser now — no in-page add buttons here. */}
                </>
            </>
          )}
          </>
          )
          })()}
          </>
          )}
        </>
      )}
      {/* One floating drag label for the page (person → group). */}
      <DragGhost ghost={dnd.ghost} />
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
    speak(t.cercle.kidRelSpeak(genderedRelLabel(rel, other.gender, lang), other.firstName, other.gender))
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
