// B-11 (bmad/10) — cercle.css moved out of the eager shell (position-immaterial
// .cercle-*/.cf-* classes); load it whenever this page renders instead.
import '../styles/cercle.css'
// carnets.css's SubTab/scene bulk (« Les carnets » lives inside Le cercle too).
import '../styles/carnets.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useSurface } from '../lib/surface'
import { useTabParam } from '../lib/tabParam'
import { useHScroll } from '../lib/hscroll'
import { useEntityDetail } from '../components/detail/DetailProvider'
import { buildContact, buildMemberPerson, buildPet } from '../components/detail/adapters'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { useWrite } from '../lib/write'
import { useConfirm } from '../lib/confirm'
import { useRecordUndo } from '../lib/toast'
import { usePointerDnd, DragGhost } from '../lib/dnd'
import { isGuest } from '../lib/device'
import { useOpenPersonSheet } from '../lib/personSheet'
import { bumpFrequent } from '../lib/frequents'
import { JOINDRE_SCOPE, type JoindreCandidate } from '../lib/joindre'
import { type Business } from '../lib/businesses'
import { JoindreRail } from '../components/cercle/JoindreRail'
import { EventForm, type EventSeedWith, type EventInit } from '../components/forms/EventForm'
import { nextRdvFor } from '../lib/nextRdv'
import { CERCLE_KEY, HOUSEHOLD_KEY, BUSINESSES_KEY, MEMBERS_KEY, BOARD_KEY, EVENTS_KEY } from '../lib/queryKeys'
import { Loading, LoadError, PairPrompt } from '../components/Fallback'
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
import { CarnetsTab } from '../components/cercle/CarnetsTab'
import { CarnetForm } from '../components/cercle/CarnetForm'
import { BusinessForm } from '../components/cercle/BusinessForm'
import { CompleteFamilies } from '../components/cercle/CompleteFamilies'
import { FamilyShareModal } from '../components/cercle/FamilyShareModal'
import { familyToShare } from '../lib/cercleShare'
import type { IntakeSubmission } from '../lib/intake'
import { SubTabs } from '../components/SubTabs'
import { MemberSwitcher } from '../components/MemberSwitcher'
import { FaceSelect } from '../components/FaceSelect'
import { useProfile } from '../lib/profile'
import { Modal } from '../components/Modal'
import { imgUrl } from '../lib/image'
import { useHelpMode, HelpToggle, HelpHint, HelpTitle } from '../lib/helpMode'
import { CERCLE_HELP } from '../lib/cercleHelp'
import {
  type Contact,
  type ContactLink,
  type Member,
  type Pet,
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
  petOwners,
  isHouseholdPet,
  familyReachableKeys,
  closedLinks,
  daysUntilBirthday,
  formatBirthday,
  genderedRelLabel,
  relationsOf,
  relationTo,
} from '../lib/cercle'

const ACCENT = '#2A8F85' // the cercle tab's turquoise (matches CATS.cercle.deep + the nav)

interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
  groups: ContactGroupRaw[]
  pets: Pet[]
}

type View = 'list' | 'links' | 'tree'
const VIEW_TABS: readonly View[] = ['list', 'links', 'tree']
const VIEW_ICON: Record<View, IconName> = { list: 'user-bold', links: 'users-three-bold', tree: 'tree-bold' }
// « Notre monde » is deliberately NOT a 4th view segment: it's a full-screen scene
// (/cercle/monde), so it's surfaced as its own DISTINCT launch affordance beside the
// segmented control (a context jump, not an in-page swap). See `viewSwitch`.
// The primary split: Famille (Maisonnée + families) vs Social (friends/work/other
// groups + ungrouped people) vs Notes (the durable quick-notes board, CercleNotes).
// The list body partitions People by the first two; Notes owns its whole body; the
// relationship views (Liens/Arbre) follow the same split — Famille shows the family
// set, Social shows everyone outside it (see `sectionPeople`).
type Section = 'social' | 'family' | 'notes' | 'business' | 'carnets'
const SECTION_ICON: Record<Section, IconName> = {
  family: 'users-three-bold',
  social: 'user-bold',
  notes: 'file-text-bold',
  business: 'storefront-bold',
  carnets: 'book-open-bold',
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
  // Wheel → sideways on the upcoming-birthdays strip (its scrollbar is hidden).
  const bdaysScroll = useHScroll<HTMLDivElement>()
  // A guest is read-only: no drag-to-group affordance (every drop is a write).
  const ro = isGuest()
  const [view, setView] = useTabParam<View>('view', 'list', ['list', 'links', 'tree'])
  // Distinct URL key so it composes with `view` (?section=family&view=list). Famille
  // is the default — the Maisonnée is the heart of the cercle.
  const [section, setSection] = useTabParam<Section>('section', 'family', ['social', 'family', 'notes', 'business', 'carnets'])
  // The "focus lens": pick a household member (the same MemberSwitcher as the board /
  // Notes) to re-read every relationship FROM their perspective — Léa's row becomes
  // "Fille" when Marc is focused. null = Maisonnée (each person's own relations, the
  // default). Drives both the Liste subtitles and the Liens (ego) centre.
  //
  // It IS the device profile (lib/profile), not a page-local pick: "who am I today"
  // is answered ONCE — on the board's « Aujourd'hui » row, in Le cercle, in Les
  // notes — and every surface remembers it. Arriving here with a face already picked
  // reads the cercle from that face, and picking one here follows you back out.
  const { memberId: focusId, setMemberId: setFocusId } = useProfile()
  const [addingGroup, setAddingGroup] = useState(false)
  // The ＋ "Nouveau commerce" tile opens the BusinessForm here (page-level, like the
  // group/connect modals) so it works from ANY cercle subtab, not just Business.
  const [addingBusiness, setAddingBusiness] = useState(false)
  // A shared Google Maps link riding along (?add=business&import=<url>, from the
  // /share page) — handed to BusinessForm, which runs the place-import on open.
  const [businessImport, setBusinessImport] = useState<string | null>(null)
  // The ＋ "Nouveau carnet" tile opens the CarnetForm here too (page-level, works from
  // any subtab), so the Carnets tab no longer needs its own add button — same single-
  // entry pattern as the business modal.
  const [addingCarnet, setAddingCarnet] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  // « Partager une famille » — the materialized family to hand to another account
  // (label + snapshot), or null when the share sheet is closed. See lib/cercleShare.
  const [sharing, setSharing] = useState<{ label: string; payload: IntakeSubmission } | null>(null)
  // The "Relier deux personnes" connector, opened (optionally seeded with one side)
  // from the ＋ chooser, a person's peek, or a family group header.
  const [connect, setConnect] = useState<{ seedAKey?: string } | null>(null)
  // « Planifier un rendez-vous » — opened from a person's / member's peek, hosts the
  // shared EventForm pre-seeded with them as the "Avec" (businesses do the same from
  // their own peek inside BusinessesTab). Read-only guests never see the action.
  const [rdv, setRdv] = useState<EventSeedWith | null>(null)
  // A global-search hit deep-links to a specific business / family note via
  // ?item=<id> (§892 — land on the item, not just the section list). Captured below,
  // stripped from the URL, and handed to the active section's tab so it opens/expands
  // that exact row.
  const [focusItem, setFocusItem] = useState<string | null>(null)

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
      monde: t.cercle.world.title,
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
      globalSearch: t.search.title,
    })[k] ?? k
  const help = useHelpMode(CERCLE_HELP, helpLabel)

  // The ＋ chooser opens the connect / new-group flows by navigating to /cercle with
  // a ?param (connect/group can't be routes — they're page-local). Read + strip it.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('connect') === '1') setConnect({})
    else if (params.get('add') === 'group') setAddingGroup(true)
    else if (params.get('add') === 'business') {
      setAddingBusiness(true)
      setBusinessImport(params.get('import'))
    } else if (params.get('add') === 'carnet') setAddingCarnet(true)
    else return
    const next = new URLSearchParams(params)
    next.delete('connect')
    next.delete('add')
    next.delete('import')
    setParams(next, { replace: true })
  }, [params, setParams])

  // ?item=<id> (from a search hit) — remember it for the active tab, then strip it so a
  // reload / back doesn't re-focus. The tab clears it via onFocused once it lands.
  useEffect(() => {
    const item = params.get('item')
    if (!item) return
    setFocusItem(item)
    const next = new URLSearchParams(params)
    next.delete('item')
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
  const pets = useMemo(() => data?.pets ?? [], [data])
  // Businesses — resolves a pet's vet name in its detail peek (the vet IS a Business)
  // AND feeds the « Joindre » rail below (needs phone/email too, hence the full
  // Business shape, not just id/name). Shares BUSINESSES_KEY so it's already warm if
  // the Business tab was open.
  const { data: bizData } = useQuery({ queryKey: BUSINESSES_KEY, queryFn: () => api<{ businesses: Business[] }>('businesses'), ...live })
  const businesses = useMemo(() => bizData?.businesses ?? [], [bizData])
  const bizById = useMemo(() => new Map(businesses.map((b) => [b.id, b.name])), [businesses])
  // Upcoming events — feeds the « Prochain rendez-vous » glance on a contact's peek
  // (the next event linked to them). Shares EVENTS_KEY so it's warm from the agenda.
  const { data: eventsData } = useQuery({ queryKey: EVENTS_KEY, queryFn: () => api<{ events: EventInit[] }>('events'), ...live })
  const events = useMemo(() => eventsData?.events ?? [], [eventsData])
  // Collapse each member + its hard-linked contact into ONE person (and remap that
  // contact's links/groups onto the member) so nobody shows up twice. Pets join as
  // their own PersonKind 'pet' (never absorbed).
  const unified = useMemo(
    () => unifyCircle(contacts, members, rawLinks, rawGroups, pets),
    [contacts, members, rawLinks, rawGroups, pets],
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
  // A member absorbed a hard-linked contact (unifyCircle) keeps `kind: 'member'` with
  // `p.id` = the MEMBER's id, so `contactsById` (keyed by contact id) never matches —
  // this second map (contact.memberId → contact) is how that member's `tags` (e.g.
  // `urgence`) still reach the rail's cold-start ranking.
  const contactByMemberId = useMemo(
    () => new Map(contacts.filter((c) => c.memberId).map((c) => [c.memberId as string, c])),
    [contacts],
  )

  // « Joindre » (A-6): cast a set of people to the rail's minimal shape — a
  // contact's `tags` (the `urgence` cold-start signal) come along, members/pets
  // carry none unless a linked contact supplied them. The rail now lives at the
  // FOOT of Famille/Sociale scoped to that section's people (see below);
  // businesses feed their own rail in the Business tab.
  const toJoindre = useCallback(
    (list: Person[]): JoindreCandidate[] =>
      list.map((p) => ({
        key: p.key,
        kind: p.kind,
        name: p.name,
        firstName: p.firstName,
        phone: p.phone,
        email: p.email,
        avatarKind: p.avatarKind,
        avatarRef: p.avatarRef,
        colour: p.colour,
        tags:
          p.kind === 'contact'
            ? contactsById.get(p.id)?.tags
            : p.kind === 'member'
              ? contactByMemberId.get(p.id)?.tags
              : undefined,
      })),
    [contactsById, contactByMemberId],
  )

  // The Maisonnée IS your one family: every household member — AND the household's
  // own animals — in a single card titled with the household name from Réglages
  // (auto-synced). It supersedes both the auto-detected family clone and any
  // hand-built group that's just the household, so the same faces never scatter.
  const householdName = household?.name?.trim() || t.cercle.memberBadge
  // Pet → its owner person-keys (from owner/pet links), to tell OUR animals from a
  // friend's (which follow their owner into Social). Built off the stored links.
  const owners = useMemo(() => petOwners(unified.links), [unified.links])
  const householdMembers = useMemo(
    () => people.filter((p) => p.kind === 'member').sort((a, b) => a.name.localeCompare(b.name, lang)),
    [people, lang],
  )
  const householdMemberKeys = useMemo(() => new Set(householdMembers.map((p) => p.key)), [householdMembers])
  // Our animals: a pet owned by a household member, or one with no owner at all
  // (an unowned pet defaults to the Maisonnée). A friend's pet is excluded here.
  const householdPets = useMemo(
    () =>
      people
        .filter((p) => p.kind === 'pet' && isHouseholdPet(p.key, owners, householdMemberKeys))
        .sort((a, b) => a.name.localeCompare(b.name, lang)),
    [people, owners, householdMemberKeys, lang],
  )
  // The Maisonnée card: members first, then the household's animals.
  const householdPeople = useMemo(() => [...householdMembers, ...householdPets], [householdMembers, householdPets])
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

  // closeKeys — "your family", i.e. the Famille tab: the household (members + our
  // animals), everyone reachable from a member through FAMILY links (so your extended
  // family counts — the closure already derived the implied ties), and anyone you put
  // in a named FAMILY group alongside a household member. Everyone ELSE is Social,
  // INCLUDING a friend and the friend's own family/pets: they reach you only through a
  // social tie, which the family walk never crosses. This single rule is what keeps
  // your friend the important link while his kids hang off him in Social, never gaining
  // a false direct tie to you. (See familyReachableKeys.)
  const closeKeys = useMemo(() => {
    const reachable = familyReachableKeys(householdMemberKeys, people, links)
    const s = new Set<string>([...reachable, ...householdKeys])
    for (const g of namedGroups)
      if (g.kind === 'family' && [...g.memberKeys].some((k) => householdMemberKeys.has(k)))
        for (const k of g.memberKeys) s.add(k)
    return s
  }, [householdMemberKeys, people, links, householdKeys, namedGroups])

  // Which tab a named group belongs to: any close-family member → Famille; otherwise
  // Social. A friend's family group — built with the SAME tools — has no household
  // member, so it lives in Social.
  const groupSection = useCallback(
    (g: ContactGroup): Section => ([...g.memberKeys].some((k) => closeKeys.has(k)) ? 'family' : 'social'),
    [closeKeys],
  )
  // Is this person in the ACTIVE section? Famille = your family; Social = the rest.
  const inSection = useCallback(
    (key: string) => (section === 'family' ? closeKeys.has(key) : !closeKeys.has(key)),
    [section, closeKeys],
  )

  // Named groups shown under the active section.
  const sectionNamedGroups = useMemo(() => namedGroups.filter((g) => groupSection(g) === section), [namedGroups, groupSection, section])
  const sectionNamedKeys = useMemo(() => new Set(sectionNamedGroups.flatMap((g) => [...g.memberKeys])), [sectionNamedGroups])

  // Auto-detected families WITHIN the active section (Union-Find over family edges),
  // over people not already in the Maisonnée or a named group of this section. In
  // Famille → your extended-family clusters; in Social → a friend's family
  // ("Famille de X"), the very same engine — so a friend's kids/spouse/pet read as
  // his family without you ever linking them to yourself.
  const autoFamilyPeople = useMemo(
    () => people.filter((p) => inSection(p.key) && !householdKeys.has(p.key) && !sectionNamedKeys.has(p.key)),
    [people, inSection, householdKeys, sectionNamedKeys],
  )
  const familyGroups = useMemo(
    () => detectFamilyGroups(autoFamilyPeople, links, (name) => (name ? t.cercle.familyOf(name) : t.cercle.familyGeneric)),
    [autoFamilyPeople, links, t],
  )
  const familyGroupedKeys = useMemo(() => new Set(familyGroups.flatMap((g) => [...g.memberKeys])), [familyGroups])

  // Family-kind named groups to feed « Compléter les familles » for THIS section, so
  // the completion tool works on your families in Famille and on a friend's families
  // in Social. Uses every family group (incl. a household-only one) routed by section.
  const sectionCompleteGroups = useMemo(
    () => allNamedGroups.filter((g) => g.kind === 'family' && groupSection(g) === section),
    [allNamedGroups, groupSection, section],
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

  // Whatever's left in this section with no card of its own.
  const others = useMemo(
    () =>
      people
        .filter((p) => inSection(p.key) && !householdKeys.has(p.key) && !sectionNamedKeys.has(p.key) && !familyGroupedKeys.has(p.key))
        .sort((a, b) => a.name.localeCompare(b.name, lang)),
    [people, inSection, householdKeys, sectionNamedKeys, familyGroupedKeys, lang],
  )

  // People for the active section's Liens/Arbre. The views (CercleEgo/CercleTree)
  // build their own byKey off this list, so any link to a filtered-out person is
  // simply dropped — no separate link filter.
  const sectionPeople = useMemo(() => people.filter((p) => inSection(p.key)), [people, inSection])
  // « Joindre » rail for the active people section — Famille shows your family's
  // numbers, Sociale your friends' (businesses have their own rail in the Business tab).
  const sectionJoindre = useMemo(() => toJoindre(sectionPeople), [toJoindre, sectionPeople])
  // EventForm wants the raw /api/members shape (snake_case display_name); the cercle
  // cache carries camelCase Members, so map across for the « rendez-vous » form.
  const formMembers = useMemo(() => members.map((m) => ({ id: m.id, display_name: m.displayName })), [members])

  // Per-person family grouping shared by BOTH relationship views (Liens + Arbre):
  // the cluster a person sits in + the disc colour (reusing the directory's family
  // colours). One helper so the two views never drift. See buildFamilyGrouping.
  const grouping = useMemo(
    () => buildFamilyGrouping(householdKeys, sectionNamedGroups, familyGroups),
    [householdKeys, sectionNamedGroups, familyGroups],
  )

  // The same three buckets, resolved to a DISPLAY name + tint — what Social ▸ Arbre
  // writes above each family's frame. (buildFamilyGrouping keys by group id, which is
  // right for ordering + colour but reads as a uuid on screen.)
  const clusterNames = useMemo(() => {
    const m = new Map<string, { name: string; colour: string | null }>()
    for (const g of sectionNamedGroups) for (const k of g.memberKeys) if (!m.has(k)) m.set(k, { name: g.name, colour: g.colour })
    for (const g of familyGroups) for (const k of g.memberKeys) if (!m.has(k)) m.set(k, { name: g.name, colour: null })
    return m
  }, [sectionNamedGroups, familyGroups])

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
      // A coloured family cascades its colour onto the newly-added member/pet server-side,
      // which shows on the board faces + members list — refresh those too.
      void write('cercle-groups', { method: 'POST', body, affectedKeys: [CERCLE_KEY, MEMBERS_KEY, BOARD_KEY] }).catch(() => {})
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
  // A non-401 failure with no cached frame must NOT fall through to render an empty
  // circle (reads as "you know nobody") — surface it. A stale-but-good `data` from a
  // prior poll still renders (kept over the error), the calm live-poll behaviour.
  if (error && !data) return <LoadError />
  if (!data) return <Loading />

  async function deletePet(pet: Pet) {
    if (!(await confirm({ title: t.cercle.pet.delete, message: pet.name, tone: 'danger' }))) return
    await write('pets', { method: 'DELETE', body: { id: pet.id }, affectedKeys: [CERCLE_KEY] })
  }

  const openPerson = (p: Person) => {
    const relations = relationsOf(p.key, links, byKey, lang)
    // If this person is already in a BUILT (named) famille group, "build their family"
    // resumes THAT group — opening it with the whole family in place — instead of
    // spawning a duplicate. Otherwise seed a brand-new family from this one person, so a
    // family can still grow out of anyone.
    const existingFamily = allNamedGroups.find((g) => g.kind === 'family' && g.memberKeys.has(p.key))
    const buildFamilyHref = existingFamily
      ? `/cercle/family/${existingFamily.id}`
      : `/cercle/family/new?seed=${encodeURIComponent(p.key)}`
    // Tappable group chips: every named group + whether this person is in it. Toggle
    // adds/removes membership inline (POST/DELETE the pivot), scoped to this person.
    const groupToggle = namedGroups.length
      ? {
          options: namedGroups.map((g) => ({ id: g.id, label: g.name, on: g.memberKeys.has(p.key) })),
          onToggle: (groupId: string, on: boolean) => {
            void write('cercle-groups', {
              method: on ? 'POST' : 'DELETE',
              body: { groupId, personId: p.id, personKind: p.kind },
              // Adding to a coloured family cascades its colour onto this person → board + members.
              affectedKeys: [CERCLE_KEY, MEMBERS_KEY, BOARD_KEY],
            }).catch(() => {})
          },
        }
      : undefined
    // "Relier à quelqu'un" — open the connector seeded with this person as side A.
    const onConnect = () => setConnect({ seedAKey: p.key })
    // « Planifier un rendez-vous » — seed the event form with this person (a cercle
    // contact) or member; hidden for a read-only guest (writes an event).
    const onSchedule = ro
      ? undefined
      : () => setRdv(p.kind === 'member' ? { memberId: p.id, name: p.name } : { contactId: p.id, name: p.name })
    if (p.kind === 'pet') {
      const pet = pets.find((x) => x.id === p.id)
      if (!pet) return
      const vetName = pet.vetBusinessId ? bizById.get(pet.vetBusinessId) ?? null : null
      // A vet visit: seed the pet's vet Business + a « Vétérinaire — <nom> » title.
      // Only when the pet has a vet on file (else there's no counterpart to schedule with).
      const onVetRdv =
        ro || !pet.vetBusinessId
          ? undefined
          : () => setRdv({ businessId: pet.vetBusinessId, name: vetName ?? '', title: t.cercle.pet.vetRdvTitle(pet.name) })
      detail.open(
        buildPet(pet, { t, lang, members: [] }, {
          relations,
          groupToggle,
          vetName,
          onConnect,
          onSchedule: onVetRdv,
          buildFamilyHref,
          onEdit: () => nav(`/cercle/pet/${pet.id}`),
          onDelete: ro ? undefined : () => void deletePet(pet),
        }),
      )
    } else if (p.kind === 'contact') {
      const c = contactsById.get(p.id)
      if (!c) return
      const nextRdv = nextRdvFor(events, (e) => e.contact_id === c.id)
      detail.open(buildContact(c, { t, lang, members: [] }, { accent: ACCENT, relations, groupToggle, onEdit: () => nav(`/cercle/person/${c.id}`), onExport: () => downloadVCard(c), onConnect, onSchedule, nextRdv, buildFamilyHref }))
    } else {
      detail.open(buildMemberPerson(p, { t, lang, members: [] }, { relations, groupToggle, onDetail: () => openSheet({ id: p.id, name: p.name }), onConnect, onSchedule, buildFamilyHref }))
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
      // A recolour cascades the family colour onto its members + pets server-side, so
      // refresh the board faces + members list, not just the cercle directory.
      affectedKeys: [CERCLE_KEY, MEMBERS_KEY, BOARD_KEY],
    })
    setEditingGroupId(null)
  }

  async function deleteGroup(g: ContactGroup) {
    if (!(await confirm({ message: t.cercle.deleteGroupConfirm, tone: 'danger' }))) return
    await write('cercle-groups', { method: 'DELETE', body: { id: g.id }, affectedKeys: [CERCLE_KEY] })
  }

  // Materialize a family (its member person-keys) into a shareable snapshot and open
  // the share sheet. Uses the STORED links (not the closure) so we snapshot only what
  // was built; the recipient re-derives implied ties. No human to anchor → do nothing.
  const openShare = (keys: Iterable<string>, label: string) => {
    const payload = familyToShare(keys, { contacts, members, pets, links: unified.links })
    if (payload) setSharing({ label, payload })
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
        {/* Quick reach — call / write without opening the peek (only when known).
            Bumps the « Joindre » (A-6) frequents so a real reach-out here feeds the
            rail's ranking before the rail itself is ever used. */}
        {p.phone && (
          <a
            className="cercle-row__quick"
            href={`tel:${p.phone}`}
            aria-label={t.cercle.call}
            title={t.cercle.call}
            onClick={() => bumpFrequent(JOINDRE_SCOPE, p.key)}
          >
            <InlineIcon name="phone-bold" size={16} />
          </a>
        )}
        {p.email && (
          <a
            className="cercle-row__quick"
            href={`mailto:${p.email}`}
            aria-label={t.cercle.write}
            title={t.cercle.write}
            onClick={() => bumpFrequent(JOINDRE_SCOPE, p.key)}
          >
            <InlineIcon name="envelope-bold" size={16} />
          </a>
        )}
        {p.kind === 'member' && !hideBadge && <span className="cercle-row__badge mono">{t.cercle.memberBadge}</span>}
        {p.kind === 'pet' && <span className="cercle-row__badge mono">{t.cercle.pet.title}</span>}
      </div>
    )
  }


  const viewSwitch = (
    <>
      {/* Liste · Liens · Arbre — the in-page view segmented control (SubTabs /
          .subtabs, same family as La cuisine's Repas · Garde-manger · Recettes). All
          three swap the body in place. « Notre monde » is deliberately NOT a 4th
          segment: it opens a full-screen scene (/cercle/monde), so it sits in the
          row's trailing slot as a DISTINCT launch button (sparkle + ↗) that reads as
          a context jump — keeping the segmented control honest (every segment swaps
          in-page, none navigates away). */}
      <SubTabs<View>
        options={VIEW_TABS.map((v) => ({
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
        trailing={
          <button
            type="button"
            className="cercle-worldlaunch"
            onClick={help.pick('monde', () => nav('/cercle/monde'))}
            aria-label={t.cercle.world.open}
            title={t.cercle.world.openHint}
            data-tour="cercle-world"
          >
            <InlineIcon name="sparkle-bold" size={15} />
            <span className="cercle-worldlaunch__label">{t.cercle.world.title}</span>
            <InlineIcon name="arrow-up-right-bold" size={13} />
          </button>
        }
      />
      {help.bubbleFor('list')}
      {help.bubbleFor('links')}
      {help.bubbleFor('tree')}
      {help.bubbleFor('monde')}
    </>
  )

  // Primary Famille / Social / Notes split — the dominant control above the view switch.
  // Uses the shared SubTabs (the `.subtabs` family) rather than a hand-rolled tablist:
  // one calm pill row that scrolls cleanly on a phone, with help-mode wired via pick/armed.
  const sectionSwitch = (
    <>
      <SubTabs
        options={(['family', 'social', 'notes', 'business', 'carnets'] as Section[]).map((s) => ({
          key: s,
          label: t.cercle.section[s],
          icon: SECTION_ICON[s],
        }))}
        value={section}
        onSelect={(s) => setSection(s)}
        ariaLabel={t.nav.cercle}
        pick={help.pick}
        armed={help.active}
        trailing={help.available ? <HelpToggle active={help.active} onToggle={help.toggle} /> : undefined}
      />
      {help.hint && <HelpHint />}
      {help.bubbleFor('social')}
      {help.bubbleFor('family')}
      {help.bubbleFor('notes')}
      {help.bubbleFor('business')}
      {help.bubbleFor('carnets')}
    </>
  )

  return (
    <main className={'today-feed cercle' + (help.active ? ' help-armed' : '')}>
      <HubHead
        title={t.nav.cercle}
        icon="users-three-bold"
        iconColor={ACCENT}
        background="var(--teal-wash)"
        card="cercle"
        searchPick={(run) => help.pick('globalSearch', run)}
      />
      {help.bubbleFor('globalSearch')}

      {/* « Planifier un rendez-vous » — the shared EventForm, seeded with the person /
          member from their peek's action. Businesses schedule from their own peek
          inside BusinessesTab. Lands on the board/agenda/month like any event. */}
      <Modal open={!!rdv} onClose={() => setRdv(null)} title={t.cercle.scheduleRdv}>
        {rdv && (
          <EventForm
            members={formMembers}
            seedWith={rdv}
            onSaved={() => setRdv(null)}
            onCancel={() => setRdv(null)}
          />
        )}
      </Modal>

      {/* The connector — a modal so it's prominent from any entry point (the ＋
          chooser, a person's peek, a family group header). */}
      <Modal open={!!connect} onClose={() => setConnect(null)} title={t.cercle.connectTwo}>
        <ConnectPeople people={people} seedAKey={connect?.seedAKey} onConnected={() => setConnect(null)} />
      </Modal>

      {/* « Partager une famille » — hand a family to a friend on their own account. */}
      <FamilyShareModal open={!!sharing} family={sharing} onClose={() => setSharing(null)} />

      {/* Create a named group — opened from the ＋ chooser (?add=group). */}
      <Modal open={addingGroup} onClose={() => setAddingGroup(false)} title={t.cercle.addGroup}>
        <GroupForm submitLabel={t.cercle.addGroup} onSubmit={createGroup} onCancel={() => setAddingGroup(false)} />
      </Modal>

      {/* Add a household service / vendor — opened from the ＋ chooser (?add=business),
          so a new business is reachable from any cercle subtab, not just Business.
          A shared Maps link (?import=, from /share) pre-fills the card on open. */}
      <Modal open={addingBusiness} onClose={() => { setAddingBusiness(false); setBusinessImport(null) }} title={t.cercle.business.add}>
        <BusinessForm
          initialImportUrl={businessImport ?? undefined}
          onSaved={() => { setAddingBusiness(false); setBusinessImport(null) }}
          onCancel={() => { setAddingBusiness(false); setBusinessImport(null) }}
        />
      </Modal>

      {/* Add a carnet (the house / the car / a thing) — opened from the ＋ chooser
          (?add=carnet), reachable from any cercle subtab, like the business modal. */}
      <Modal open={addingCarnet} onClose={() => setAddingCarnet(false)} title={t.carnets.add}>
        <CarnetForm defaultKind="home" onSaved={() => setAddingCarnet(false)} onCancel={() => setAddingCarnet(false)} />
      </Modal>

      {people.length === 0 ? (
        <>
          <SectionIntro card="cercle" />
          {/* A brand-new circle used to be a DEAD END: two lines of prose and no door
              — the only way forward was the ＋ FAB, which the words never mention
              (first-run pass, 2026-07-14). It now reads like every other empty tab
              (Routines is the model): the calm line, its guide link, and one warm
              way in. Hidden for a read-only guest, who has nothing to add. */}
          <div className="feed-empty cercle-empty">
            <EmptyState guide={{ card: 'cercle' }}>{t.cercle.empty}</EmptyState>
            <p className="mono">{t.cercle.emptyHint}</p>
            {!isGuest() && (
              // ?plus=person — the documented URL grammar (DISCOVERY.md): opens the ＋
              // sheet on its « person » tile. The same door the FAB gives, just named.
              <Link to="/cercle?plus=person" className="btn btn--primary cercle-empty__new">
                <InlineIcon name="plus-bold" /> {t.cercle.add}
              </Link>
            )}
          </div>
        </>
      ) : (
        <>
          {sectionSwitch}

          {/* « Notre monde » is reached from the distinct launch button in the view
              row's trailing slot (a full-screen scene, /cercle/monde) — see `viewSwitch`. */}

          {section === 'notes' ? (
            /* The notes board owns its whole tab body — no people list, no view
               switch (Liens/Arbre are about people, not notes). */
            <CercleNotes members={members} help={help} focusId={section === 'notes' ? focusItem : null} onFocused={() => setFocusItem(null)} />
          ) : section === 'business' ? (
            /* Business — a standalone services/vendors directory, ISOLATED from the
               people graph (no view switch, no focus lens, no relationships). */
            <BusinessesTab help={help} focusId={section === 'business' ? focusItem : null} onFocused={() => setFocusItem(null)} />
          ) : section === 'carnets' ? (
            /* Les carnets — the cared-for-things directory (houses, cars). Its own
               query/scene, never the people graph (like Business). */
            <CarnetsTab help={help} />
          ) : (
          <>
          {viewSwitch}

          {/* Social shows the WHOLE web at once — the single-focus ego view would only
              show one person's circle. Liens draws your circles as named islands
              (CercleWeb); Arbre draws each friend's family as its own tree, side by
              side, joined by the friendships between them (CercleTree social). Famille
              keeps the focus-driven ego view + the stacked family tree. */}
          {(() => {
            const showWeb = section === 'social' && view === 'links'

          return (
          <>
          {/* Focus lens — pick a household member to read the cercle from their
              perspective. The SAME pick-a-face control as the board's "Aujourd'hui"
              header, surface-for-surface: the always-in-view face ROW on a kiosk wall,
              the collapsed tap-to-open chip on mobile (FaceSelect). Not on the tree, nor
              on the Social web (no single centre to read from). */}
          {view !== 'tree' && !showWeb && householdMembers.length > 0 && (() => {
            const faces = householdMembers.map((p) => ({
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
            <CercleWeb people={sectionPeople} links={links} groups={sectionNamedGroups} familyClusters={familyGroups} onOpen={openPerson} />
          ) : view === 'links' ? (
            <CercleEgo people={sectionPeople} links={links} onOpen={openPerson} focusKey={focusKey} grouping={grouping} />
          ) : view === 'tree' ? (
            <CercleTree
              people={sectionPeople}
              links={links}
              onOpen={openPerson}
              grouping={grouping}
              social={section === 'social'}
              clusterNames={clusterNames}
            />
          ) : (
            <>
              <SectionIntro card="cercle" />

              {section === 'family' && birthdays.length > 0 && (
                <section className="cercle-bdays">
                  <HelpTitle help={help} k="birthdays" className="cercle-section__label">
                    <InlineIcon name="cake-bold" size={16} color={ACCENT} /> {t.cercle.birthdaysSoon}
                  </HelpTitle>
                  {help.bubbleFor('birthdays')}
                  {/* Hidden scrollbar + fixed-width tiles: without useHScroll a mouse
                      can't reach the birthdays past the right edge. */}
                  <div className="cercle-bdays__row" ref={bdaysScroll.ref}>
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

              {/* « Compléter les familles » — complete the WHOLE intertwined family, not
                  just one named group: every named famille-kind group made 100% related
                  AND every precise rung the hierarchy implies across the connected web
                  (cousins, grandparent spans, in-laws…), behind a review checklist.
                  Scoped to `sectionPeople` (like the tree/web views): Famille completes
                  your family, Social a friend's — the section boundary is the family
                  reach from the household, so the two stay distinct. */}
                <CompleteFamilies
                  people={sectionPeople}
                  storedLinks={unified.links}
                  groups={sectionCompleteGroups}
                  disabled={ro}
                />

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
                            nav(`/cercle/family/new?linksOnly=1&seed=${encodeURIComponent(householdMembers.map((p) => p.key).join(','))}`),
                          )}
                        >
                          <InlineIcon name="tree-bold" size={12} />
                        </button>
                        {/* Hand the Maisonnée to a friend on their own account. */}
                        {!ro && (
                          <button
                            type="button"
                            className="row-actions__btn"
                            aria-label={t.familyShare.shareFamily}
                            title={t.familyShare.shareFamily}
                            onClick={() => openShare(householdKeys, householdName)}
                          >
                            <InlineIcon name="link-bold" size={12} />
                          </button>
                        )}
                      </h2>
                      {help.bubbleFor('household')}
                      {help.bubbleFor('householdLinks')}
                      {householdPeople.map((p) => (
                        <Row key={p.key} p={p} hideBadge />
                      ))}
                    </section>
                  )}

                  {/* Named explicit groups, routed by closeness: your family groups
                      under Famille, a friend's family group (+ amis / travail / autre)
                      under Social. Family-kind groups keep their builder tools in BOTH
                      tabs, so you build a friend's family with the same mechanisms. */}
                  {sectionNamedGroups.map((g) => (
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
                              {/* Share this family with a friend on their own account. */}
                              {!ro && (
                                <button
                                  type="button"
                                  className="row-actions__btn"
                                  aria-label={t.familyShare.shareFamily}
                                  title={t.familyShare.shareFamily}
                                  onClick={() => openShare(g.memberKeys, g.name)}
                                >
                                  <InlineIcon name="link-bold" size={12} />
                                </button>
                              )}
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

                  {/* Auto-detected family groups — your extended-family clusters in
                      Famille; a friend's family ("Famille de X") in Social. Same engine. */}
                  {familyGroups.map((g) => (
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

                  {/* People in this section with no card of their own. A header only
                      when there ARE cards above to distinguish them from. */}
                  {others.length > 0 && (
                    <section className="cercle-group">
                      {(sectionNamedGroups.length > 0 || familyGroups.length > 0) && (
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

                  {/* This section is empty — a calm pointer to the ＋ chooser. (Famille
                      with members shows the Maisonnée card, so this only fires for the
                      Social tab, or a brand-new circle.) */}
                  {others.length === 0 && sectionNamedGroups.length === 0 && familyGroups.length === 0 &&
                    (section === 'social' || householdPeople.length === 0) && (
                    <EmptyState guide={{ card: 'cercle' }}>
                      {section === 'social' ? t.cercle.socialEmpty : t.cercle.empty}
                    </EmptyState>
                  )}
                  {/* Creation actions (add person / family / connect / new group) all
                      live on the ＋ chooser now — no in-page add buttons here. */}
                </>
            </>
          )}
          </>
          )
          })()}

          {/* « Joindre » (A-6) — the quick-dial rail, now at the FOOT of the section
              and scoped to its people (Famille = your family's numbers, Sociale = your
              friends'). Mobile only, self-hides under 2 eligible reach-outs and for a
              read-only guest. Businesses get their own rail in the Business tab. */}
          <JoindreRail people={sectionJoindre} businesses={[]} />
          </>
          )}
        </>
      )}
      {/* One floating drag label for the page (person → group). */}
      <DragGhost ghost={dnd.ghost} />
    </main>
  )
}

// Toddler lens: a faces grid of EVERYONE (members + contacts + pets). Tap a face →
// hear the name AND flip to a relationship panel showing their direct connections.
// Pets are part of "who's who" a toddler learns (the family dog reads its owner as
// « Propriétaire »). No view switch, no add/edit (one-way door).
function CircleKidView() {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  const nav = useNavigate()
  const [focused, setFocused] = useState<Person | null>(null)
  const { data } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle'), ...live })

  const contacts = data?.contacts ?? []
  const members = data?.members ?? []
  const rawLinks = data?.links ?? []
  const pets = data?.pets ?? []
  // Same dedup as the parent view: a member + its linked contact are one face. Pets
  // join as their own faces (never absorbed).
  const unified = useMemo(() => unifyCircle(contacts, members, rawLinks, [], pets), [contacts, members, rawLinks, pets])
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
          {/* « Notre monde » — a big friendly button into the narrated overview map,
              so a toddler can see ALL the families and how they connect, read aloud. */}
          <button type="button" className="cercle-kid__world" onClick={() => nav('/cercle/monde')}>
            <Icon name="sparkle-bold" size={28} color={ACCENT} />
            <span>{t.cercle.world.title}</span>
          </button>
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
